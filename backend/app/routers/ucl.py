from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Fixture, UclActualWinner, UclWinnerPrediction, User
from app.schemas import (
    BracketTeam,
    UclActualWinnerIn,
    UclActualWinnerOut,
    UclWinnerPredictionIn,
    UclWinnerPredictionOut,
)
from app.services.league_scope import COMPETITION_KEYWORDS

router = APIRouter(prefix="/ucl", tags=["ucl"])

_CL_KEYWORD = COMPETITION_KEYWORDS["CL"]


@router.get("/teams", response_model=list[BracketTeam])
async def list_teams(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """The single, only CL-team-listing endpoint in this app — used both by the
    league-creation/edit CL-team-subset picker and by the UCL winner-pick popup.
    Open to all authenticated users, not admin-gated."""
    result = await db.execute(select(Fixture).where(Fixture.competition.contains(_CL_KEYWORD)))
    teams: dict[str, str | None] = {}
    for f in result.scalars():
        for name, crest in ((f.home_team, f.home_team_crest), (f.away_team, f.away_team_crest)):
            if not name:
                continue
            if name not in teams or (teams[name] is None and crest):
                teams[name] = crest
    return [BracketTeam(name=name, crest=teams[name]) for name in sorted(teams)]


@router.get("/me", response_model=UclWinnerPredictionOut | None)
async def my_ucl_winner(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UclWinnerPrediction).where(UclWinnerPrediction.user_id == user.id))
    return result.scalar_one_or_none()


@router.post("", response_model=UclWinnerPredictionOut)
async def submit_ucl_winner(
    data: UclWinnerPredictionIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(UclWinnerPrediction).where(UclWinnerPrediction.user_id == user.id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You've already submitted your UCL winner pick — it's locked")

    if not (data.predicted_winner and data.predicted_winner.strip()):
        raise HTTPException(status_code=400, detail="A team must be selected")

    prediction = UclWinnerPrediction(user_id=user.id, predicted_winner=data.predicted_winner)
    db.add(prediction)
    await db.commit()
    await db.refresh(prediction)
    return prediction


@router.delete("/me")
async def delete_my_ucl_winner(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Admin-only reset, mirrors bracket.py's DELETE /bracket/me exactly."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    result = await db.execute(select(UclWinnerPrediction).where(UclWinnerPrediction.user_id == user.id))
    prediction = result.scalar_one_or_none()
    if not prediction:
        raise HTTPException(status_code=404, detail="No prediction found")
    await db.delete(prediction)
    await db.commit()
    return {"deleted": True}


@router.put("/actual", response_model=UclActualWinnerOut)
async def set_actual_winner(
    data: UclActualWinnerIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    if not (data.winner and data.winner.strip()):
        raise HTTPException(status_code=400, detail="Winner must be provided")

    existing = await db.execute(select(UclActualWinner))
    actual = existing.scalars().first()
    if actual is None:
        actual = UclActualWinner()
        db.add(actual)

    actual.winner = data.winner
    actual.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(actual)
    return actual


@router.post("/score")
async def score_ucl_winner(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Admin action: +5.0 for every UclWinnerPrediction that matches the actual
    winner, 0.0 otherwise. If the actual winner isn't set yet, leave every
    prediction's points as None (unscored) — matches the "unscored until real
    data exists" convention from _rescore_brackets/score_pl_table."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    result = await db.execute(select(UclActualWinner))
    actual = result.scalars().first()

    predictions = (await db.execute(select(UclWinnerPrediction))).scalars().all()

    if actual is None or not actual.winner:
        for p in predictions:
            p.points = None
        await db.commit()
        return {"scored": 0}

    for p in predictions:
        p.points = 5.0 if p.predicted_winner == actual.winner else 0.0

    await db.commit()
    return {"scored": len(predictions)}
