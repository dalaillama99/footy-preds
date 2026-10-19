from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


# Additive migrations — safe to re-run; each one is expected to fail (and be
# swallowed) once its column already exists.
#
# Keep every statement valid on BOTH Postgres (production) and SQLite (local dev):
# a boolean column must use DEFAULT FALSE, never DEFAULT 0 — Postgres rejects an
# integer default on a boolean and the swallowed error would leave the column
# missing, after which every query touching it dies with UndefinedColumn.
_MIGRATIONS = [
    "ALTER TABLE fixtures ADD COLUMN lineups_json TEXT",
    "ALTER TABLE fixtures ADD COLUMN duration TEXT",
    "ALTER TABLE fixtures ADD COLUMN home_penalties INTEGER",
    "ALTER TABLE fixtures ADD COLUMN away_penalties INTEGER",
    "ALTER TABLE predictions ADD COLUMN pen_winner TEXT",
    "ALTER TABLE users ADD COLUMN team_name TEXT",
    "ALTER TABLE fixtures ADD COLUMN minute INTEGER",
    "ALTER TABLE bracket_predictions ADD COLUMN sf_points REAL",
    "ALTER TABLE bracket_predictions ADD COLUMN finalist_points REAL",
    "ALTER TABLE leagues ADD COLUMN max_participants INTEGER",
    "ALTER TABLE leagues ADD COLUMN admin_invite_code TEXT",
    "ALTER TABLE league_members ADD COLUMN archived BOOLEAN DEFAULT 0",
    "ALTER TABLE leagues ADD COLUMN ucl_teams TEXT",
    "ALTER TABLE leagues ADD COLUMN competitions TEXT",
    # NOT NULL DEFAULT FALSE backfills every pre-existing row to False (not NULL).
    "ALTER TABLE fixtures ADD COLUMN unsynced BOOLEAN NOT NULL DEFAULT FALSE",
]


async def init_db():
    # Deferred import, to avoid a circular import at module load (models.py imports
    # Base from this module). It must happen BEFORE create_all: importing the models
    # is what registers them on Base.metadata, and without it create_all would
    # quietly create nothing.
    from app.models import _invite_code

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # One transaction PER statement. On Postgres a failed statement aborts its
    # whole transaction, so running these in one shared block meant the first
    # already-applied ALTER poisoned every later statement with
    # InFailedSqlTransaction — including the backfill below, and including any
    # newly added migration, which would then never reach production at all.
    for stmt in _MIGRATIONS:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(stmt))
        except Exception:
            pass

    # One-time backfill: pre-existing leagues (created before admin_invite_code
    # existed) have NULL there after the ALTER above. Populate it, one row at a
    # time. Safe/idempotent to re-run on every startup — WHERE admin_invite_code
    # IS NULL means already-backfilled rows are skipped.
    async with engine.begin() as conn:
        rows = await conn.execute(text("SELECT id FROM leagues WHERE admin_invite_code IS NULL"))
        for (league_id,) in rows.fetchall():
            await conn.execute(
                text("UPDATE leagues SET admin_invite_code = :code WHERE id = :id"),
                {"code": _invite_code(), "id": league_id},
            )

    # No backfill for `competitions` — a NULL/unset value is a real, permanent
    # state meaning "not yet configured", not a migration artifact to correct.
    # Leagues stay NULL until their admin explicitly chooses via
    # PATCH /leagues/{id}/settings (or POST /leagues/clear-competitions resets
    # them back to NULL deliberately).
