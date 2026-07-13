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
_RESULT_RETRY_INTERVAL = timedelta(seconds=30)
_PER_FIXTURE_CALL_SPACING = 5.0     # seconds between per-fixture calls (<10 req/min)
_ACTIVE_POLL_INTERVAL = 12.0        # seconds between loop iterations during active periods
_ACTIVE_RETRY_INTERVAL = timedelta(seconds=30)  # retry interval during active periods
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
        return result.scalars().first() is not None


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
    Poll football-data.org for scores. Sleep is dynamic: 12s during active
    periods (any LIVE match or kicked-off SCHEDULED fixture), 60s otherwise.
    Strategy:
    - Fast path: 1 LIVE bulk call per cycle covers all in-progress matches.
    - Per-fixture: kicked-off, not-yet-FINISHED fixtures are polled individually
      every 30s until FINISHED. Catches matches the global LIVE call may miss
      (just-finished, ET/penalties, delayed reporting).
    - Rate safety: per-fixture calls are spaced by _PER_FIXTURE_CALL_SPACING
      seconds and capped per cycle so total stays under 10 req/min free-tier.
    """
    from app.services.football_api import fetch_live_matches, fetch_match_result, upsert_fixtures

    while True:
        active = await _has_active_matches()
        sleep_duration = _ACTIVE_POLL_INTERVAL if active else 60.0
        await asyncio.sleep(sleep_duration)
        try:
            if active:
                matches = await fetch_live_matches()
                if matches:
                    async with AsyncSessionLocal() as db:
                        result = await upsert_fixtures(db, matches)
                        if result["points_recalculated"]:
                            logger.info("Live poll: %d matches, %d predictions scored",
                                        result["total"], result["points_recalculated"])

            max_per_fixture_calls = max(1, int(sleep_duration / _PER_FIXTURE_CALL_SPACING) - 1)
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
                await asyncio.sleep(_PER_FIXTURE_CALL_SPACING)

        except Exception as exc:
            logger.warning("Score poll failed: %s", exc)


@app.on_event("startup")
async def startup():
    await init_db()
    from app.services.football_api import _rescore_brackets
    async with AsyncSessionLocal() as db:
        scored = await _rescore_brackets(db)
        await db.commit()
        if scored:
            logger.info("Startup: rescored %d bracket(s)", scored)
    if settings.FOOTBALL_API_KEY:
        asyncio.create_task(_live_score_poller())
        logger.info("Live score poller started (12s active / 60s idle)")
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
