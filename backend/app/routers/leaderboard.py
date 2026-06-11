from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Prediction, User
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
        entries.append(LeaderboardEntry(
            user_id=u.id,
            username=(u.username if user.is_admin else (u.team_name or u.username)),
            total_points=total,
            prediction_count=len(preds),
            scored_count=scored,
        ))
    return sorted(entries, key=lambda e: (-e.total_points, -e.scored_count, e.username))
