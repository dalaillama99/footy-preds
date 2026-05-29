import asyncio
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal, init_db
from app.models import Fixture
from app.routers import auth, fixtures, leagues, leaderboard, predictions

logger = logging.getLogger(__name__)

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
    from datetime import datetime
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Fixture).where(
                (Fixture.status == "LIVE") |
                (
                    (Fixture.status == "SCHEDULED") &
                    (Fixture.kickoff <= datetime.utcnow())
                )
            )
        )
        return result.scalar_one_or_none() is not None


async def _live_score_poller():
    """
    Poll football-data.org for live scores every 60 seconds.
    Uses a single GET /matches?status=LIVE call that covers all competitions simultaneously,
    keeping usage well within the 10 req/min free-tier rate limit.
    Only fires the API call when our DB shows there are active or overdue matches.
    """
    from app.services.football_api import fetch_live_matches, upsert_fixtures

    while True:
        await asyncio.sleep(60)
        try:
            if await _has_active_matches():
                matches = await fetch_live_matches()
                if matches:
                    async with AsyncSessionLocal() as db:
                        result = await upsert_fixtures(db, matches)
                        if result["points_recalculated"]:
                            logger.info(
                                "Live poll: %d matches, %d predictions scored",
                                result["total"], result["points_recalculated"]
                            )
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
