import asyncio
import logging
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal, init_db
from app.models import Fixture
from app.routers import auth, fixtures, leagues, leaderboard, predictions

logger = logging.getLogger(__name__)

from datetime import timedelta

_RESULT_INITIAL_DELAY_HOURS = 2.0   # first check 2h after kickoff
_RESULT_RETRY_INTERVAL = timedelta(minutes=15)
_last_result_check: dict[str, datetime] = {}  # fixture_id → last check time

app = FastAPI(title="Footy Preds API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _has_active_matches() -> bool:
    """Check DB for any LIVE matches or SCHEDULED matches whose kickoff has passed."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Fixture).where(
                (Fixture.status == "LIVE") |
                ((Fixture.status == "SCHEDULED") & (Fixture.kickoff <= datetime.utcnow()))
            )
        )
        return result.scalar_one_or_none() is not None


async def _get_fixtures_due_result_check() -> list:
    """
    Fixtures ≥2h past kickoff, not yet FINISHED/POSTPONED, and due for a result check.
    First check happens 2h after kickoff; retries every 15 min until result confirmed.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Fixture).where(
                Fixture.status.in_(["SCHEDULED", "LIVE"]),
                Fixture.api_id.isnot(None),
            )
        )
        fixtures = result.scalars().all()
        now = datetime.utcnow()
        due = []
        for f in fixtures:
            if (now - f.kickoff).total_seconds() / 3600 < _RESULT_INITIAL_DELAY_HOURS:
                continue
            last = _last_result_check.get(f.id)
            if last is None or (now - last) >= _RESULT_RETRY_INTERVAL:
                due.append(f)
        return due


async def _live_score_poller():
    """
    Poll football-data.org for scores every 60 seconds.
    Strategy:
    - 1 call/min via GET /matches?status=LIVE covers all in-progress matches
    - For fixtures ≥2h past kickoff: check individually every 15 min until FINISHED
      (handles ET, penalties, or delayed result reporting)
    - Total well within the 10 req/min free-tier limit
    """
    from app.services.football_api import fetch_live_matches, fetch_match_result, upsert_fixtures

    while True:
        await asyncio.sleep(60)
        try:
            # Poll currently live matches
            if await _has_active_matches():
                matches = await fetch_live_matches()
                if matches:
                    async with AsyncSessionLocal() as db:
                        result = await upsert_fixtures(db, matches)
                        if result["points_recalculated"]:
                            logger.info("Live poll: %d matches, %d predictions scored",
                                        result["total"], result["points_recalculated"])

            # Check fixtures ≥2h past kickoff for final result (retry every 15 min)
            due = await _get_fixtures_due_result_check()
            for fixture in due:
                try:
                    match_data = await fetch_match_result(fixture.api_id)
                    _last_result_check[fixture.id] = datetime.utcnow()
                    async with AsyncSessionLocal() as db:
                        await upsert_fixtures(db, [match_data])
                    await asyncio.sleep(6)  # stay within 10 req/min
                except Exception as exc:
                    logger.warning("Failed to check result for fixture %s: %s", fixture.api_id, exc)

        except Exception as exc:
            logger.warning("Score poll failed: %s", exc)


@app.on_event("startup")
async def startup():
    await init_db()
    if settings.FOOTBALL_API_KEY:
        asyncio.create_task(_live_score_poller())
        logger.info("Live score poller started (60s interval)")
    else:
        logger.info("FOOTBALL_API_KEY not set — live score polling disabled")


app.include_router(auth.router)
app.include_router(leagues.router)
app.include_router(fixtures.router)
app.include_router(predictions.router)
app.include_router(leaderboard.router)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "football_api": bool(settings.FOOTBALL_API_KEY),
    }
