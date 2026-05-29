from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models import Fixture, Prediction, User
from app.schemas import FixtureCreate, FixtureOut, FixtureScoreUpdate
import json
from datetime import timezone

from app.services.football_api import COMPETITIONS, fetch_competition_matches, fetch_match_lineups, upsert_fixtures
from app.services.points import calculate_points

router = APIRouter(prefix="/fixtures", tags=["fixtures"])


@router.get("", response_model=list[FixtureOut])
async def list_fixtures(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Fixture).order_by(Fixture.kickoff))
    return result.scalars().all()


@router.post("", response_model=FixtureOut)
async def create_fixture(
    data: FixtureCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    fixture = Fixture(
        home_team=data.home_team,
        away_team=data.away_team,
        kickoff=data.kickoff,
        competition=data.competition,
        matchday=data.matchday,
    )
    db.add(fixture)
    await db.commit()
    await db.refresh(fixture)
    return fixture


@router.patch("/{fixture_id}", response_model=FixtureOut)
async def update_fixture(
    fixture_id: str,
    data: FixtureCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    result = await db.execute(select(Fixture).where(Fixture.id == fixture_id))
    fixture = result.scalar_one_or_none()
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")

    fixture.home_team = data.home_team
    fixture.away_team = data.away_team
    fixture.kickoff = data.kickoff
    fixture.competition = data.competition
    fixture.matchday = data.matchday
    await db.commit()
    await db.refresh(fixture)
    return fixture


@router.post("/{fixture_id}/score", response_model=FixtureOut)
async def set_score(
    fixture_id: str,
    data: FixtureScoreUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set score/status and recalculate points. Scores are optional for non-FINISHED statuses."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    result = await db.execute(select(Fixture).where(Fixture.id == fixture_id))
    fixture = result.scalar_one_or_none()
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")

    fixture.home_score = data.home_score
    fixture.away_score = data.away_score
    fixture.status = data.status

    preds = await db.execute(select(Prediction).where(Prediction.fixture_id == fixture_id))
    for pred in preds.scalars():
        if data.status == "FINISHED" and data.home_score is not None and data.away_score is not None:
            pred.points = calculate_points(pred.home_pred, pred.away_pred, data.home_score, data.away_score)
        else:
            pred.points = None

    await db.commit()
    await db.refresh(fixture)
    return fixture


@router.post("/sync")
async def sync_from_api(
    competition: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Pull all fixtures for a competition from football-data.org and upsert into DB."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    if not settings.FOOTBALL_API_KEY:
        raise HTTPException(status_code=503, detail="FOOTBALL_API_KEY not set in .env")
    if competition not in COMPETITIONS:
        raise HTTPException(status_code=400, detail=f"Unknown competition. Valid: {list(COMPETITIONS)}")

    try:
        matches = await fetch_competition_matches(competition)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"football-data.org error: {exc}")

    return await upsert_fixtures(db, matches)


@router.get("/{fixture_id}/lineups")
async def get_lineups(
    fixture_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return cached lineups, or fetch from API if not cached / stale.
    Lineups are only populated by the API ~1 hour before kickoff.
    """
    result = await db.execute(select(Fixture).where(Fixture.id == fixture_id))
    fixture = result.scalar_one_or_none()
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")

    # Return cache if lineups are populated or kickoff is > 2 hours away (not announced yet)
    if fixture.lineups_json:
        cached = json.loads(fixture.lineups_json)
        kickoff_utc = fixture.kickoff if fixture.kickoff.tzinfo else fixture.kickoff.replace(tzinfo=timezone.utc)
        hours_to_kickoff = (kickoff_utc - datetime.now(timezone.utc)).total_seconds() / 3600
        if cached.get("available") or hours_to_kickoff > 2:
            return cached

    if not settings.FOOTBALL_API_KEY or not fixture.api_id:
        return {"available": False, "home": None, "away": None}

    try:
        lineup_data = await fetch_match_lineups(fixture.api_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch lineups: {exc}")

    fixture.lineups_json = json.dumps(lineup_data)
    await db.commit()
    return lineup_data


@router.get("/competitions")
async def list_competitions(user: User = Depends(get_current_user)):
    """Return the competitions available for syncing."""
    return [{"code": k, "name": v} for k, v in COMPETITIONS.items()]


@router.delete("/{fixture_id}")
async def delete_fixture(
    fixture_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    result = await db.execute(select(Fixture).where(Fixture.id == fixture_id))
    fixture = result.scalar_one_or_none()
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")

    await db.delete(fixture)
    await db.commit()
    return {"deleted": fixture_id}
