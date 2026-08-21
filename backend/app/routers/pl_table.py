from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Fixture, PLActualStandings, PLTablePrediction, User
from app.schemas import (
    PLActualStandingsIn,
    PLActualStandingsOut,
    PLTablePredictionIn,
    PLTablePredictionOut,
    PLTeam,
)

router = APIRouter(prefix="/pl-table", tags=["pl-table"])


def _require_admin(user: User) -> None:
    # Admin-only while in test (remove this guard to un-gate for all users).
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")


@router.get("/teams", response_model=list[PLTeam])
async def list_teams(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _require_admin(user)
    result = await db.execute(select(Fixture).where(Fixture.competition == "Premier League"))
    teams: dict[str, str | None] = {}
    for f in result.scalars():
        for name, crest in ((f.home_team, f.home_team_crest), (f.away_team, f.away_team_crest)):
            if not name:
                continue
            if name not in teams or (teams[name] is None and crest):
                teams[name] = crest
    return [PLTeam(name=name, crest=teams[name]) for name in sorted(teams)]


@router.get("/me", response_model=PLTablePredictionOut | None)
async def my_pl_table(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _require_admin(user)
    result = await db.execute(select(PLTablePrediction).where(PLTablePrediction.user_id == user.id))
    return result.scalar_one_or_none()


@router.post("", response_model=PLTablePredictionOut)
async def submit_pl_table(
    data: PLTablePredictionIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)

    existing = await db.execute(select(PLTablePrediction).where(PLTablePrediction.user_id == user.id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You've already submitted your PL table prediction — it's locked")

    names = [data.pos1, data.pos2, data.pos3, data.pos4, data.pos5, data.rel18, data.rel19, data.rel20]
    if any(not (n and n.strip()) for n in names):
        raise HTTPException(status_code=400, detail="All teams must be selected")

    if len(set(names)) != 8:
        raise HTTPException(status_code=400, detail="Each team can only be predicted once")

    prediction = PLTablePrediction(
        user_id=user.id,
        pos1=data.pos1,
        pos2=data.pos2,
        pos3=data.pos3,
        pos4=data.pos4,
        pos5=data.pos5,
        rel18=data.rel18,
        rel19=data.rel19,
        rel20=data.rel20,
    )
    db.add(prediction)
    await db.commit()
    await db.refresh(prediction)
    return prediction


@router.delete("/me")
async def delete_my_pl_table(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Clear the current user's PL table prediction so they can re-submit."""
    _require_admin(user)

    result = await db.execute(select(PLTablePrediction).where(PLTablePrediction.user_id == user.id))
    prediction = result.scalar_one_or_none()
    if not prediction:
        raise HTTPException(status_code=404, detail="No prediction found")
    await db.delete(prediction)
    await db.commit()
    return {"deleted": True}


@router.put("/actual", response_model=PLActualStandingsOut)
async def set_actual_standings(
    data: PLActualStandingsIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)

    names = [data.pos1, data.pos2, data.pos3, data.pos4, data.pos5, data.rel18, data.rel19, data.rel20]
    if any(not (n and n.strip()) for n in names):
        raise HTTPException(status_code=400, detail="All teams must be provided")

    if len(set(names)) != 8:
        raise HTTPException(status_code=400, detail="Each team can only appear once")

    teams_result = await db.execute(select(Fixture).where(Fixture.competition == "Premier League"))
    valid_names: set[str] = set()
    for f in teams_result.scalars():
        if f.home_team:
            valid_names.add(f.home_team)
        if f.away_team:
            valid_names.add(f.away_team)

    unmatched = [n for n in names if n not in valid_names]
    if unmatched:
        raise HTTPException(
            status_code=400,
            detail=f"These team names don't match any synced PL team: {', '.join(sorted(set(unmatched)))}",
        )

    existing = await db.execute(select(PLActualStandings))
    standings = existing.scalars().first()
    if standings is None:
        standings = PLActualStandings()
        db.add(standings)

    standings.pos1 = data.pos1
    standings.pos2 = data.pos2
    standings.pos3 = data.pos3
    standings.pos4 = data.pos4
    standings.pos5 = data.pos5
    standings.rel18 = data.rel18
    standings.rel19 = data.rel19
    standings.rel20 = data.rel20
    standings.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(standings)
    return standings


@router.post("/score")
async def score_pl_table(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Admin action: compute points for ALL PL table predictions from the current PLActualStandings.

    Scoring:
      - +3 for each of the 5 top-5 slots that exactly matches the actual position.
      - +5 bonus if all 5 top-5 slots are correct.
      - +3 for each of the 3 relegation slots that exactly matches the actual position.
      - +3 bonus if all 3 relegation slots are correct.
    Only computed once PLActualStandings has been set; otherwise every prediction's
    points fields are left/reset to null (matches bracket's "unscored" state).
    """
    _require_admin(user)

    result = await db.execute(select(PLActualStandings))
    actual = result.scalars().first()

    predictions = (await db.execute(select(PLTablePrediction))).scalars().all()

    if actual is None or not all(
        [actual.pos1, actual.pos2, actual.pos3, actual.pos4, actual.pos5, actual.rel18, actual.rel19, actual.rel20]
    ):
        for p in predictions:
            p.top5_points = None
            p.relegation_points = None
            p.points = None
        await db.commit()
        return {"scored": 0}

    top5_actual = [actual.pos1, actual.pos2, actual.pos3, actual.pos4, actual.pos5]
    relegation_actual = [actual.rel18, actual.rel19, actual.rel20]

    for p in predictions:
        top5_pred = [p.pos1, p.pos2, p.pos3, p.pos4, p.pos5]
        relegation_pred = [p.rel18, p.rel19, p.rel20]

        top5_matches = sum(1 for pred, act in zip(top5_pred, top5_actual) if pred == act)
        top5_pts = top5_matches * 3.0
        if top5_matches == 5:
            top5_pts += 5.0

        relegation_matches = sum(1 for pred, act in zip(relegation_pred, relegation_actual) if pred == act)
        relegation_pts = relegation_matches * 3.0
        if relegation_matches == 3:
            relegation_pts += 3.0

        p.top5_points = top5_pts
        p.relegation_points = relegation_pts
        p.points = top5_pts + relegation_pts

    await db.commit()
    return {"scored": len(predictions)}
