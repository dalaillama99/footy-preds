from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import BracketPrediction, Prediction, User
from app.schemas import LeaderboardEntry

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


@router.get("", response_model=list[LeaderboardEntry])
async def global_leaderboard(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Global standings across all users and all scored fixtures."""
    users_result = await db.execute(select(User).order_by(User.username))
    entries = []
    for u in users_result.scalars():
        preds_result = await db.execute(select(Prediction).where(Prediction.user_id == u.id))
        preds = preds_result.scalars().all()
        if not preds:
            continue
        total = sum(p.points or 0 for p in preds)
        scored = sum(1 for p in preds if p.points is not None)
        exact = sum(1 for p in preds if p.points is not None and p.points >= 3)
        correct_gd = sum(1 for p in preds if p.points is not None and 2.0 <= p.points < 3)
        correct_result = sum(1 for p in preds if p.points is not None and 1.5 <= p.points < 2.0)

        bracket = (await db.execute(
            select(BracketPrediction).where(BracketPrediction.user_id == u.id)
        )).scalar_one_or_none()
        bracket_bonus = None
        bracket_sf_pts = None
        bracket_finalist_pts = None
        if bracket is not None and bracket.points is not None:
            bracket_bonus = bracket.points
            total += bracket.points
            bracket_sf_pts = bracket.sf_points
            bracket_finalist_pts = bracket.finalist_points

        entries.append(LeaderboardEntry(
            user_id=u.id,
            username=(u.team_name or u.username),
            total_points=total,
            prediction_count=len(preds),
            scored_count=scored,
            exact_count=exact,
            correct_gd_count=correct_gd,
            correct_result_count=correct_result,
            real_name=(u.username if user.is_admin else None),
            bracket_bonus=bracket_bonus,
            bracket_sf_points=bracket_sf_pts,
            bracket_finalist_points=bracket_finalist_pts,
        ))
    return sorted(entries, key=lambda e: (-e.total_points, -e.scored_count, e.username))
