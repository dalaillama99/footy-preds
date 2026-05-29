import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Fixture, Prediction, User
from app.schemas import PredictionCreate, PredictionOut

router = APIRouter(prefix="/predictions", tags=["predictions"])


def _kickoff_passed(kickoff: datetime) -> bool:
    now = datetime.now(timezone.utc)
    kt = kickoff if kickoff.tzinfo else kickoff.replace(tzinfo=timezone.utc)
    return kt <= now


@router.post("", response_model=PredictionOut)
async def submit_prediction(
    data: PredictionCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    fixture_result = await db.execute(select(Fixture).where(Fixture.id == data.fixture_id))
    fixture = fixture_result.scalar_one_or_none()
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")
    if _kickoff_passed(fixture.kickoff):
        raise HTTPException(status_code=400, detail="Prediction deadline has passed (kickoff already started)")

    existing = await db.execute(
        select(Prediction).where(Prediction.user_id == user.id, Prediction.fixture_id == data.fixture_id)
    )
    pred = existing.scalar_one_or_none()

    if pred:
        pred.home_pred = data.home_pred
        pred.away_pred = data.away_pred
        pred.submitted_at = datetime.utcnow()
    else:
        pred = Prediction(
            id=str(uuid.uuid4()),
            user_id=user.id,
            fixture_id=data.fixture_id,
            home_pred=data.home_pred,
            away_pred=data.away_pred,
        )
        db.add(pred)

    await db.commit()

    result = await db.execute(
        select(Prediction)
        .where(Prediction.id == pred.id)
        .options(selectinload(Prediction.fixture))
    )
    return result.scalar_one()


@router.get("", response_model=list[PredictionOut])
async def my_predictions(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Prediction)
        .where(Prediction.user_id == user.id)
        .options(selectinload(Prediction.fixture))
        .order_by(Prediction.submitted_at.desc())
    )
    return result.scalars().all()
