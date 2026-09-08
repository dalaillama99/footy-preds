"""
Coverage for `upsert_fixtures`'s `allow_create` gate.

Background (bug fix): the live-score poller used to call `upsert_fixtures`
with no way to say "only touch fixtures that already exist" — so if an admin
unsynced a competition (deleted its Fixture rows) and a match from that
competition went live afterward, the poller's next global live-match fetch
would look up its api_id, find nothing, and silently re-create the row. The
`allow_create` parameter (default True, preserving all existing behavior)
lets the poller pass `allow_create=False` so unknown api_ids are skipped
instead of resurrected.

Uses an in-memory async SQLite DB (aiosqlite) built directly against
`app.models.Base.metadata`, independent of the app's configured DATABASE_URL.
No pytest-asyncio plugin is installed in this project's venv, so each async
scenario is driven via `asyncio.run()` inside an ordinary sync test function
— this needs nothing beyond plain pytest.

Run: python -m pytest backend/tests/test_upsert_fixtures.py -q   (from backend/ dir)
or:  python -m tests.test_upsert_fixtures                        (from backend/ dir)
"""
import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base
from app.models import Fixture
from app.services.football_api import upsert_fixtures


def _match_dict(api_id: int, **overrides) -> dict:
    """Build a parsed-match dict shaped like `_parse_match`'s output."""
    kickoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)
    m = {
        "api_id": api_id,
        "home_team": "Ajax",
        "away_team": "Feyenoord",
        "home_team_crest": None,
        "away_team_crest": None,
        "kickoff": kickoff,
        "competition": "Eredivisie",
        "matchday": 1,
        "stage": None,
        "group": None,
        "status": "LIVE",
        "home_score": 1,
        "away_score": 0,
        "minute": 60,
        "duration": "REGULAR",
        "home_penalties": None,
        "away_penalties": None,
    }
    m.update(overrides)
    return m


async def _make_session() -> tuple[AsyncSession, object]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return session_factory(), engine


async def _unknown_api_id_not_created_when_disallowed():
    db, engine = await _make_session()
    try:
        match = _match_dict(api_id=999001)

        result = await upsert_fixtures(db, [match], allow_create=False)

        # No exception raised (implicit — we got here), and no row created.
        rows = (await db.execute(select(Fixture).where(Fixture.api_id == 999001))).scalars().all()
        assert rows == [], f"expected no Fixture row for unsynced api_id, found {len(rows)}"

        # The match is still accounted for in the summary, not silently dropped.
        assert result["created"] == 0
        assert result["skipped_not_synced"] == 1
        assert result["total"] == 1
        assert result["created"] + result["updated"] + result["skipped"] + result["skipped_not_synced"] == result["total"]
    finally:
        await db.close()
        await engine.dispose()


def test_unknown_api_id_not_created_when_disallowed():
    asyncio.run(_unknown_api_id_not_created_when_disallowed())


async def _unknown_api_id_created_when_allowed():
    db, engine = await _make_session()
    try:
        match = _match_dict(api_id=999002)

        result = await upsert_fixtures(db, [match], allow_create=True)

        rows = (await db.execute(select(Fixture).where(Fixture.api_id == 999002))).scalars().all()
        assert len(rows) == 1, "expected a Fixture row to be created when allow_create=True"
        assert result["created"] == 1
        assert result["skipped_not_synced"] == 0
    finally:
        await db.close()
        await engine.dispose()


def test_unknown_api_id_created_when_allowed():
    asyncio.run(_unknown_api_id_created_when_allowed())


async def _default_allow_create_matches_true():
    """Omitting allow_create must behave exactly like allow_create=True (back-compat)."""
    db, engine = await _make_session()
    try:
        match = _match_dict(api_id=999003)

        result = await upsert_fixtures(db, [match])  # default

        rows = (await db.execute(select(Fixture).where(Fixture.api_id == 999003))).scalars().all()
        assert len(rows) == 1
        assert result["created"] == 1
    finally:
        await db.close()
        await engine.dispose()


def test_default_allow_create_matches_true():
    asyncio.run(_default_allow_create_matches_true())


async def _known_api_id_updates_regardless_of_allow_create():
    for allow_create in (False, True):
        db, engine = await _make_session()
        try:
            existing = Fixture(
                api_id=999004,
                home_team="Ajax",
                away_team="Feyenoord",
                kickoff=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1),
                competition="Eredivisie",
                status="LIVE",
                home_score=0,
                away_score=0,
            )
            db.add(existing)
            await db.commit()

            match = _match_dict(api_id=999004, home_score=2, away_score=1, minute=75)

            result = await upsert_fixtures(db, [match], allow_create=allow_create)

            rows = (await db.execute(select(Fixture).where(Fixture.api_id == 999004))).scalars().all()
            assert len(rows) == 1, "known fixture must not be duplicated"
            assert rows[0].home_score == 2
            assert rows[0].away_score == 1
            assert rows[0].minute == 75
            assert result["updated"] == 1
            assert result["created"] == 0
            assert result["skipped_not_synced"] == 0
        finally:
            await db.close()
            await engine.dispose()


def test_known_api_id_updates_regardless_of_allow_create():
    asyncio.run(_known_api_id_updates_regardless_of_allow_create())


if __name__ == "__main__":
    test_unknown_api_id_not_created_when_disallowed()
    print("test_unknown_api_id_not_created_when_disallowed PASSED")
    test_unknown_api_id_created_when_allowed()
    print("test_unknown_api_id_created_when_allowed PASSED")
    test_default_allow_create_matches_true()
    print("test_default_allow_create_matches_true PASSED")
    test_known_api_id_updates_regardless_of_allow_create()
    print("test_known_api_id_updates_regardless_of_allow_create PASSED")
