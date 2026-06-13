import asyncio
import logging
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal, init_db
from app.models import Fixture
from app.routers import auth, bracket, fixtures, leagues, leaderboard, predictions

logger = logging.getLogger(__name__)

from datetime import timedelta

# Every kicked-off, not-yet-FINISHED fixture is polled individually from kickoff
# (no initial delay) on a steady ~2 min cadence until it reaches FINISHED. Calls are
# spaced with asyncio.sleep so we stay under the football-data.org free-tier 10 req/min
# limit; the single global /matches?status=LIVE call remains an efficient fast path.
_RESULT_INITIAL_DELAY_HOURS = 0.0   # start checking immediately at kickoff
_RESULT_RETRY_INTERVAL = timedelta(minutes=2)
_PER_FIXTURE_CALL_SPACING = 7.0     # seconds between per-fixture calls (<10 req/min)
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
    Every kicked-off (kickoff has passed), not-yet-FINISHED fixture with an api_id
    that is due for an individual poll. With _RESULT_INITIAL_DELAY_HOURS=0 checks
    begin at kickoff; each fixture is then re-polled every _RESULT_RETRY_INTERVAL
    (~2 min) until it reaches FINISHED/POSTPONED.
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
    - Fast path: 1 call/min via GET /matches?status=LIVE covers all in-progress
      matches in a single request.
    - Per-fixture: EVERY kicked-off, not-yet-FINISHED fixture with an api_id is
      polled individually starting at kickoff (no 2h delay), each roughly every
      2 min until FINISHED. This catches matches the global LIVE call may miss
      (just-finished, ET/penalties, delayed reporting).
    - Rate safety: per-fixture calls are spaced by _PER_FIXTURE_CALL_SPACING
      seconds and capped per cycle so the global call + per-fixture calls stay
      under the 10 req/min free-tier limit.
    """
    from app.services.football_api import fetch_live_matches, fetch_match_result, upsert_fixtures

    # Budget per 60s cycle: reserve 1 slot for the global LIVE call, keep the rest
    # for per-fixture polls, staying comfortably under 10 req/min.
    max_per_fixture_calls = max(1, int(60 / _PER_FIXTURE_CALL_SPACING) - 2)  # ~6

    while True:
        await asyncio.sleep(60)
        try:
            # Fast path: poll all currently live matches in a single call
            if await _has_active_matches():
                matches = await fetch_live_matches()
                if matches:
                    async with AsyncSessionLocal() as db:
                        result = await upsert_fixtures(db, matches)
                        if result["points_recalculated"]:
                            logger.info("Live poll: %d matches, %d predictions scored",
                                        result["total"], result["points_recalculated"])

            # Per-fixture: poll each kicked-off, not-finished fixture on a ~2 min cadence.
            # Oldest-checked first so nothing starves when more are due than fit in a cycle.
            due = await _get_fixtures_due_result_check()
            due.sort(key=lambda f: _last_result_check.get(f.id) or datetime.min)
            for fixture in due[:max_per_fixture_calls]:
                try:
                    match_data = await fetch_match_result(fixture.api_id)
                    _last_result_check[fixture.id] = datetime.utcnow()
                    async with AsyncSessionLocal() as db:
                        await upsert_fixtures(db, [match_data])
                except Exception as exc:
                    logger.warning("Failed to check result for fixture %s: %s", fixture.api_id, exc)
                await asyncio.sleep(_PER_FIXTURE_CALL_SPACING)  # stay within 10 req/min

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
app.include_router(bracket.router)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "football_api": bool(settings.FOOTBALL_API_KEY),
    }
