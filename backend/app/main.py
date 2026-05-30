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

_KNOCKOUT_STAGES = {"LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"}


def _expected_finish_hours(stage: str | None) -> float:
    return 3.5 if stage in _KNOCKOUT_STAGES else 2.5

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


async def _get_overdue_unfinished() -> list:
    """Fixtures that should be done by now (past expected finish time) but aren't FINISHED/POSTPONED."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Fixture).where(
                Fixture.status.in_(["SCHEDULED", "LIVE"]),
                Fixture.api_id.isnot(None),
            )
        )
        fixtures = result.scalars().all()
        now = datetime.utcnow()
        return [
            f for f in fixtures
            if (now - f.kickoff).total_seconds() / 3600 > _expected_finish_hours(f.stage)
        ]


async def _live_score_poller():
    """
    Poll football-data.org for live scores every 60 seconds.
    Strategy:
    - 1 call/min via GET /matches?status=LIVE covers all in-progress matches
    - Additional individual calls for fixtures past their expected finish time
      (2.5h for group/league games, 3.5h for knockout — allows for ET + penalties)
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

            # Check fixtures that should be finished by now but aren't marked so
            overdue = await _get_overdue_unfinished()
            for fixture in overdue:
                try:
                    match_data = await fetch_match_result(fixture.api_id)
                    async with AsyncSessionLocal() as db:
                        await upsert_fixtures(db, [match_data])
                    await asyncio.sleep(6)  # stay within 10 req/min
                except Exception as exc:
                    logger.warning("Failed to fetch overdue fixture %s: %s", fixture.api_id, exc)

        except Exception as exc:
            logger.warning("Live score poll failed: %s", exc)


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
