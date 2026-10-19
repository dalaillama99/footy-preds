"""
Coverage for `GET /fixtures?league_id=...` and the narrowed fail-open in
`fixture_in_league_scope`.

Background (bug fix): `GET /fixtures` scoped to the UNION of the caller's
non-archived leagues, so a second league with a wider Champions League team
pool made a narrower league's pool look like it had no effect. And any
`competition` string matching none of the 8 COMPETITION_KEYWORDS used to be in
scope for EVERY league unconditionally, bypassing the pool entirely.

Harness as in test_upsert_fixtures.py (in-memory SQLite + asyncio.run).

Run: python -m pytest tests/test_league_scoped_fixtures.py -q   (from backend/ dir)
"""
import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base
from app.models import Fixture, League, LeagueMember, User
from app.routers.fixtures import list_fixtures
from app.services.league_scope import fixture_in_league_scope


async def _make_session() -> tuple[AsyncSession, object]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return factory(), engine


def _cl_fixture(fid: str, home: str, away: str, api_id: int) -> Fixture:
    return Fixture(
        id=fid, api_id=api_id, home_team=home, away_team=away,
        kickoff=datetime.utcnow() + timedelta(days=1),
        competition="UEFA Champions League", status="SCHEDULED", unsynced=False,
    )


async def _seed_two_leagues(db: AsyncSession):
    """One user in two CL leagues: a narrow pool and a wide one."""
    user = User(id="u1", username="arjun", email="a@example.com", is_admin=True)
    db.add(user)
    db.add(League(id="narrow", name="Namma PL", invite_code="AAAAAAAA", admin_id="u1",
                  competitions="CL", ucl_teams="Arsenal"))
    db.add(League(id="wide", name="Other", invite_code="BBBBBBBB", admin_id="u1",
                  competitions="CL", ucl_teams=None))
    db.add(LeagueMember(id="m1", user_id="u1", league_id="narrow", archived=False))
    db.add(LeagueMember(id="m2", user_id="u1", league_id="wide", archived=False))
    db.add(_cl_fixture("fx_arsenal", "Arsenal", "Inter", 1001))
    db.add(_cl_fixture("fx_other", "AS Roma", "Slovan Bratislava", 1002))
    await db.commit()
    return user


async def _league_id_narrows_scope():
    db, engine = await _make_session()
    try:
        user = await _seed_two_leagues(db)

        # Union: the wide league's unrestricted pool pulls in both fixtures.
        unscoped = await list_fixtures(league_id=None, user=user, db=db)
        assert {f.id for f in unscoped} == {"fx_arsenal", "fx_other"}

        scoped = await list_fixtures(league_id="narrow", user=user, db=db)
        assert {f.id for f in scoped} == {"fx_arsenal"}, [f.id for f in scoped]
    finally:
        await db.close()
        await engine.dispose()


def test_league_id_narrows_scope():
    asyncio.run(_league_id_narrows_scope())


async def _league_id_scopes_archived_league():
    """An explicitly named league is honoured even when the caller archived it —
    asking for it by id is deliberate, unlike the union default."""
    db, engine = await _make_session()
    try:
        user = await _seed_two_leagues(db)
        member = await db.get(LeagueMember, "m1")
        member.archived = True
        await db.commit()

        scoped = await list_fixtures(league_id="narrow", user=user, db=db)
        assert {f.id for f in scoped} == {"fx_arsenal"}
    finally:
        await db.close()
        await engine.dispose()


def test_league_id_scopes_archived_league():
    asyncio.run(_league_id_scopes_archived_league())


async def _league_id_non_member_403():
    db, engine = await _make_session()
    try:
        user = await _seed_two_leagues(db)
        db.add(League(id="theirs", name="Theirs", invite_code="CCCCCCCC", admin_id="u1",
                      competitions="PL"))
        await db.commit()

        with pytest.raises(HTTPException) as exc:
            await list_fixtures(league_id="theirs", user=user, db=db)
        assert exc.value.status_code == 403
    finally:
        await db.close()
        await engine.dispose()


def test_league_id_non_member_403():
    asyncio.run(_league_id_non_member_403())


# ── narrowed fail-open ───────────────────────────────────────────────────────

def test_unrecognized_competition_fails_open_only_for_admin_created():
    pool = {"CL"}
    teams = {"Arsenal"}

    admin_made = SimpleNamespace(
        competition="Friendly Cup", api_id=None, home_team="X", away_team="Y"
    )
    assert fixture_in_league_scope(admin_made, pool, teams) is True

    api_sourced = SimpleNamespace(
        competition="Eredivisie", api_id=4242, home_team="Ajax", away_team="PSV"
    )
    assert fixture_in_league_scope(api_sourced, pool, teams) is False


def test_cl_either_team_semantics_unchanged():
    """Commit d43bc69: one side in the pool is enough; neither side excludes."""
    pool = {"CL"}
    teams = {"Arsenal", "Inter"}

    def f(home, away):
        return SimpleNamespace(
            competition="UEFA Champions League", api_id=1, home_team=home, away_team=away
        )

    assert fixture_in_league_scope(f("Arsenal", "Bodo/Glimt"), pool, teams) is True
    assert fixture_in_league_scope(f("Arsenal", "Inter"), pool, teams) is True
    assert fixture_in_league_scope(f("AS Roma", "Slovan"), pool, teams) is False
