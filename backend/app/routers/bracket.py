from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import BracketPrediction, Fixture, User
from app.schemas import BracketPredictionIn, BracketPredictionOut, BracketTeam

router = APIRouter(prefix="/bracket", tags=["bracket"])


@router.get("/teams", response_model=list[BracketTeam])
async def list_teams(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Fixture).where(Fixture.competition.contains("World Cup")))
    teams: dict[str, str | None] = {}
    for f in result.scalars():
        for name, crest in ((f.home_team, f.home_team_crest), (f.away_team, f.away_team_crest)):
            if not name:
                continue
            if name not in teams or (teams[name] is None and crest):
                teams[name] = crest
    return [BracketTeam(name=name, crest=teams[name]) for name in sorted(teams)]


@router.get("/me", response_model=BracketPredictionOut | None)
async def my_bracket(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BracketPrediction).where(BracketPrediction.user_id == user.id))
    return result.scalar_one_or_none()


@router.post("", response_model=BracketPredictionOut)
async def submit_bracket(
    data: BracketPredictionIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(BracketPrediction).where(BracketPrediction.user_id == user.id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You've already submitted your bracket — it's locked")

    names = [data.semi1_a, data.semi1_b, data.semi2_a, data.semi2_b, data.finalist1, data.finalist2]
    if any(not (n and n.strip()) for n in names):
        raise HTTPException(status_code=400, detail="All teams must be selected")

    semi_teams = [data.semi1_a, data.semi1_b, data.semi2_a, data.semi2_b]
    if len(set(semi_teams)) != 4:
        raise HTTPException(status_code=400, detail="The four semi-finalists must all be different teams")

    if data.finalist1 not in {data.semi1_a, data.semi1_b}:
        raise HTTPException(status_code=400, detail="Finalist 1 must be one of the first semi-final teams")
    if data.finalist2 not in {data.semi2_a, data.semi2_b}:
        raise HTTPException(status_code=400, detail="Finalist 2 must be one of the second semi-final teams")

    bracket = BracketPrediction(
        user_id=user.id,
        semi1_a=data.semi1_a,
        semi1_b=data.semi1_b,
        semi2_a=data.semi2_a,
        semi2_b=data.semi2_b,
        finalist1=data.finalist1,
        finalist2=data.finalist2,
    )
    db.add(bracket)
    await db.commit()
    await db.refresh(bracket)
    return bracket


@router.delete("/me")
async def delete_my_bracket(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Clear the current user's bracket so they can re-submit."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    result = await db.execute(select(BracketPrediction).where(BracketPrediction.user_id == user.id))
    bracket = result.scalar_one_or_none()
    if not bracket:
        raise HTTPException(status_code=404, detail="No bracket found")
    await db.delete(bracket)
    await db.commit()
    return {"deleted": True}


@router.post("/score")
async def score_brackets(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Admin action: compute points for ALL brackets from real World Cup fixtures.

    Scoring is order-independent everywhere (matchups compared as frozensets):
      - +1 if exactly 1 of the 2 predicted semi-final matchups is correct.
      - +3 if both predicted semi-final matchups are correct.
      - +3 if predicted finalists match the actual FINAL pairing.
      - +3 bonus if BOTH semis AND finalists are correct (total 9).
    A stage only counts as "known" once its fixtures have both teams set.
    """
    # Admin-only while in test (remove this guard to un-gate for all users).
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    wc = await db.execute(select(Fixture).where(Fixture.competition.contains("World Cup")))
    fixtures = wc.scalars().all()

    # Actual semis: the 2 SEMI_FINALS fixtures with both teams known.
    actual_semis = {
        frozenset({f.home_team, f.away_team})
        for f in fixtures
        if f.stage == "SEMI_FINALS" and f.home_team and f.away_team
    }
    semis_known = len(actual_semis) == 2

    # Actual finalists: the FINAL fixture with both teams known.
    final_fixtures = [
        f for f in fixtures if f.stage == "FINAL" and f.home_team and f.away_team
    ]
    finals_known = len(final_fixtures) >= 1
    actual_finalists = (
        frozenset({final_fixtures[0].home_team, final_fixtures[0].away_team}) if finals_known else None
    )

    brackets = (await db.execute(select(BracketPrediction))).scalars().all()
    for b in brackets:
        if not (semis_known or finals_known):
            b.points = None
            b.sf_points = None
            b.finalist_points = None
            continue
        pts = 0.0
        sf_pts = 0.0
        finalist_pts = 0.0
        semis_correct = False
        finals_correct = False
        if semis_known:
            pred_semi1 = frozenset({b.semi1_a, b.semi1_b})
            pred_semi2 = frozenset({b.semi2_a, b.semi2_b})
            matches = sum(1 for actual in actual_semis if actual in (pred_semi1, pred_semi2))
            if matches == 2:
                semis_correct = True
                sf_pts = 3.0
            elif matches == 1:
                sf_pts = 1.0
            pts += sf_pts
        if finals_known:
            pred_finalists = frozenset({b.finalist1, b.finalist2})
            if pred_finalists == actual_finalists:
                finals_correct = True
                finalist_pts += 3.0
        if semis_correct and finals_correct:
            finalist_pts += 3.0  # bonus for nailing everything
        pts += finalist_pts
        b.points = pts
        b.sf_points = sf_pts
        b.finalist_points = finalist_pts

    await db.commit()
    return {"scored": len(brackets)}
