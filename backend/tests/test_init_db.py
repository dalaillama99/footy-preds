"""
`init_db` must be idempotent AND must give every additive migration its own
transaction.

Background: all 14 ALTERs plus the admin_invite_code backfill used to share one
`engine.begin()` block. On Postgres the first already-applied ALTER aborts that
transaction, so every later statement — including any newly added migration and
the backfill — fails with InFailedSqlTransaction while `except: pass` hides it.
A new column would then never reach production, and every query touching it
would fail with UndefinedColumn.

Run: python -m pytest tests/test_init_db.py -q   (from backend/ dir)
"""
import asyncio

import app.database as database_module


def test_migrations_list_has_no_boolean_integer_default():
    """Postgres rejects `DEFAULT 0` on a BOOLEAN column, and the swallowed error
    would silently leave the column missing. Only the pre-existing (SQLite-era)
    league_members.archived statement is grandfathered."""
    offenders = [
        s for s in database_module._MIGRATIONS
        if "BOOLEAN" in s.upper() and "DEFAULT 0" in s.upper()
        and "league_members" not in s
    ]
    assert offenders == [], offenders


def test_unsynced_migration_present():
    assert any(
        "fixtures" in s and "unsynced" in s and "DEFAULT FALSE" in s.upper()
        for s in database_module._MIGRATIONS
    ), database_module._MIGRATIONS


async def _init_db_twice(tmp_path):
    """Run init_db twice against a scratch SQLite file: the second pass must not
    raise and the schema must be unchanged."""
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    db_path = tmp_path / "scratch.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path.as_posix()}", echo=False)
    original = database_module.engine
    database_module.engine = engine
    try:
        await database_module.init_db()
        await database_module.init_db()

        async with engine.begin() as conn:
            cols = (await conn.execute(text("PRAGMA table_info(fixtures)"))).fetchall()
            names = [c[1] for c in cols]
            assert names.count("unsynced") == 1, names

            # NOT NULL DEFAULT FALSE, and existing rows backfill to False/0.
            await conn.execute(text(
                "INSERT INTO fixtures (id, home_team, away_team, kickoff, competition, status,"
                " created_at) VALUES ('x', 'A', 'B', '2026-01-01 00:00:00', 'Premier League',"
                " 'SCHEDULED', '2026-01-01 00:00:00')"
            ))
            value = (await conn.execute(text("SELECT unsynced FROM fixtures WHERE id='x'"))).scalar()
            assert value in (0, False), value

            # The backfill after the ALTERs still runs (it used to be poisoned by them).
            await conn.execute(text(
                "INSERT INTO leagues (id, name, invite_code, admin_id, created_at)"
                " VALUES ('lg', 'L', 'ZZZZZZZZ', 'u', '2026-01-01 00:00:00')"
            ))
        await database_module.init_db()
        async with engine.begin() as conn:
            code = (await conn.execute(
                text("SELECT admin_invite_code FROM leagues WHERE id='lg'")
            )).scalar()
            assert code, "admin_invite_code backfill did not run"
    finally:
        database_module.engine = original
        await engine.dispose()


def test_init_db_is_idempotent(tmp_path):
    asyncio.run(_init_db_twice(tmp_path))
