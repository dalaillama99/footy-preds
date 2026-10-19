"""
Coverage for unsync-as-soft-delete.

Background (incident): `DELETE /fixtures/competition` used to hard-delete every
Fixture row for a competition AND every Prediction pointing at it. An admin
unsynced a competition in production and real users' predictions and points
were destroyed irrecoverably — re-syncing recreated fixtures with fresh UUIDs
and zero predictions. Unsync is now `Fixture.unsynced = True` and touches no
Prediction row, so a re-sync restores everything.

Same harness style as test_upsert_fixtures.py: in-memory async SQLite built from
`app.models.Base.metadata`, no pytest-asyncio plugin (each async scenario is
driven by `asyncio.run()` from a plain sync test function).

Run: python -m pytest tests/test_unsync_soft_delete.py -q   (from backend/ dir)
"""
import asyncio
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.database import Base
from app.models import Fixture, League, LeagueMember, Prediction, User
from app.routers import fixtures as fixtures_router
from app.routers.fixtures import list_fixtures, sync_from_api, synced_competitions, unsync_competition
from app.routers.leaderboard import global_leaderboard
from app.routers.leagues import leaderboard as league_leaderboard
from app.routers.predictions import my_predictions
from app.services.football_api import upsert_fixtures


async def _make_session() -> tuple[AsyncSession, object]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return factory(), engine


def _match_dict(api_id: int, competition: str, **overrides) -> dict:
    """A parsed-match dict shaped like `_parse_match`'s output."""
    m = {
        "api_id": api_id,
        "home_team": "Real Madrid",
        "away_team": "Barcelona",
        "home_team_crest": None,
        "away_team_crest": None,
        "kickoff": datetime.utcnow() - timedelta(hours=12),
        "competition": competition,
        "matchday": 1,
        "stage": None,
        "group": None,
        "status": "FINISHED",
        "home_score": 2,
        "away_score": 1,
        "minute": None,
        "duration": "REGULAR",
        "home_penalties": None,
        "away_penalties": None,
    }
    m.update(overrides)
    return m


async def _seed(db: AsyncSession, competition: str = "La Liga", api_id: int | None = 777001):
    """One admin user in one league that scopes PD, with a FINISHED fixture and a
    scored prediction on it. League created_at predates the kickoff."""
    user = User(id="u1", username="arjun", email="a@example.com", is_admin=True)
    db.add(user)
    # 12h ago, deliberately outside the league leaderboard's 2–8h "recent fixtures"
    # window: that path needs the America/New_York tz database, which isn't installed
    # in this venv, and rank deltas aren't what these tests are about.
    kickoff = datetime.utcnow() - timedelta(hours=12)
    league = League(
        id="lg1", name="Namma PL", invite_code="AAAAAAAA", admin_id="u1",
        created_at=kickoff - timedelta(days=30), competitions="PD", ucl_teams=None,
    )
    db.add(league)
    db.add(LeagueMember(id="m1", user_id="u1", league_id="lg1", archived=False))
    fixture = Fixture(
        id="fx1", api_id=api_id, home_team="Real Madrid", away_team="Barcelona",
        kickoff=kickoff, competition=competition, status="FINISHED",
        home_score=2, away_score=1, unsynced=False,
    )
    db.add(fixture)
    db.add(Prediction(id="p1", user_id="u1", fixture_id="fx1", home_pred=2, away_pred=1, points=3.0))
    await db.commit()
    return user, league, fixture


# ── (a) unsync preserves predictions and flips the flag ──────────────────────

async def _unsync_preserves_predictions():
    db, engine = await _make_session()
    try:
        user, _, _ = await _seed(db)

        out = await unsync_competition(name="La Liga", user=user, db=db)

        assert out == {"unsynced_fixtures": 1, "preserved_predictions": 1}, out
        # The contract owed to the frontend: no deleted_* keys survive.
        assert "deleted_fixtures" not in out and "deleted_predictions" not in out

        preds = (await db.execute(select(Prediction))).scalars().all()
        assert len(preds) == 1, "unsync must not delete Prediction rows"
        assert preds[0].points == 3.0, "points must survive untouched"

        rows = (await db.execute(select(Fixture))).scalars().all()
        assert len(rows) == 1, "unsync must not delete the Fixture row"
        assert rows[0].unsynced is True

        # Hidden from every read path.
        assert await list_fixtures(league_id=None, user=user, db=db) == []
        assert await my_predictions(user=user, db=db) == []
        assert await synced_competitions(user=user, db=db) == []
    finally:
        await db.close()
        await engine.dispose()


def test_unsync_preserves_predictions():
    asyncio.run(_unsync_preserves_predictions())


# ── (b) re-sync restores, via both the api_id arm and the keyword arm ────────

async def _resync_restores(stored_competition: str, api_id: int | None, api_mentions_it: bool):
    db, engine = await _make_session()
    prev_key = settings.FOOTBALL_API_KEY
    orig_fetch = fixtures_router.fetch_competition_matches
    try:
        user, _, _ = await _seed(db, competition=stored_competition, api_id=api_id)
        await unsync_competition(name=stored_competition, user=user, db=db)

        # The API response for PD carries the canonical COMPETITIONS["PD"] name
        # ("La Liga"), because fetch_competition_matches passes it as an override.
        matches = [_match_dict(api_id, "La Liga")] if api_mentions_it else [
            _match_dict(888999, "La Liga", home_team="Sevilla", away_team="Valencia")
        ]

        async def _fake_fetch(code):
            return matches

        settings.FOOTBALL_API_KEY = "test-key"
        fixtures_router.fetch_competition_matches = _fake_fetch
        summary = await sync_from_api(competition="PD", user=user, db=db)

        assert summary["restored_fixtures"] == 1, summary
        assert "upserted_api_ids" not in summary, "internal key must not leak to the client"

        fx = (await db.execute(select(Fixture).where(Fixture.id == "fx1"))).scalar_one()
        assert fx.unsynced is False
        # Only a deliberate competition sync normalizes the stored name.
        if api_id is not None and api_mentions_it:
            assert fx.competition == "La Liga"

        preds = await my_predictions(user=user, db=db)
        assert len(preds) == 1 and preds[0].points == 3.0, "prediction and points must reappear"

        board = await league_leaderboard(league_id="lg1", user=user, effective_is_admin=True, db=db)
        assert board[0].total_points == 3.0
    finally:
        settings.FOOTBALL_API_KEY = prev_key
        fixtures_router.fetch_competition_matches = orig_fetch
        await db.close()
        await engine.dispose()


def test_resync_restores_via_api_id_arm():
    """A legacy row storing the raw API name ("Primera Division") is unsynced by
    that exact string; `contains("La Liga")` can never match it, so only the
    api_id arm brings it back."""
    asyncio.run(_resync_restores("Primera Division", 777001, api_mentions_it=True))


def test_resync_restores_via_keyword_arm():
    """An admin-created fixture (api_id IS NULL) is never mentioned in the API
    response, so only the keyword arm brings it back."""
    asyncio.run(_resync_restores("La Liga", None, api_mentions_it=False))


def test_resync_restores_canonical_row():
    asyncio.run(_resync_restores("La Liga", 777001, api_mentions_it=True))


# ── (c) the live poller cannot resurrect an unsynced fixture ─────────────────

async def _poller_cannot_resurrect():
    db, engine = await _make_session()
    try:
        await _seed(db)
        fx = (await db.execute(select(Fixture).where(Fixture.id == "fx1"))).scalar_one()
        fx.unsynced = True
        await db.commit()

        # A live update claiming a different score, as the poller would deliver it.
        result = await upsert_fixtures(
            db, [_match_dict(777001, "La Liga", status="LIVE", home_score=5, away_score=5)],
            allow_create=False,
        )

        assert result["skipped_not_synced"] == 1, result
        assert result["updated"] == 0
        fx = (await db.execute(select(Fixture).where(Fixture.id == "fx1"))).scalar_one()
        assert fx.unsynced is True, "poller must not clear the flag"
        assert (fx.home_score, fx.away_score, fx.status) == (2, 1, "FINISHED"), "row must be untouched"
    finally:
        await db.close()
        await engine.dispose()


def test_poller_cannot_resurrect_unsynced_fixture():
    asyncio.run(_poller_cannot_resurrect())


# ── (d) leaderboards exclude unsynced points ────────────────────────────────

async def _leaderboards_exclude_unsynced():
    db, engine = await _make_session()
    try:
        user, _, _ = await _seed(db)

        before_global = await global_leaderboard(user=user, effective_is_admin=True, db=db)
        before_league = await league_leaderboard(
            league_id="lg1", user=user, effective_is_admin=True, db=db
        )
        assert before_global[0].total_points == 3.0
        assert before_league[0].total_points == 3.0

        await unsync_competition(name="La Liga", user=user, db=db)

        after_global = await global_leaderboard(user=user, effective_is_admin=True, db=db)
        after_league = await league_leaderboard(
            league_id="lg1", user=user, effective_is_admin=True, db=db
        )
        # No prediction left in scope at all → the user drops off the global board.
        assert after_global == [], after_global
        assert after_league[0].total_points == 0, after_league[0]
        assert after_league[0].prediction_count == 0
    finally:
        await db.close()
        await engine.dispose()


def test_leaderboards_exclude_unsynced():
    asyncio.run(_leaderboards_exclude_unsynced())
