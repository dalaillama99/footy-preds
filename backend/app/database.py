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


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Additive migrations — safe to re-run; silently skips if column already exists
        for stmt in [
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
        ]:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass

        # One-time backfill: pre-existing leagues (created before admin_invite_code
        # existed) have NULL there after the ALTER above. Populate it, one row at a
        # time. Safe/idempotent to re-run on every startup — WHERE admin_invite_code
        # IS NULL means already-backfilled rows are skipped.
        # Deferred import to avoid a circular import (models.py imports Base from
        # this module at module load time).
        from app.models import _invite_code

        rows = await conn.execute(text("SELECT id FROM leagues WHERE admin_invite_code IS NULL"))
        for (league_id,) in rows.fetchall():
            await conn.execute(
                text("UPDATE leagues SET admin_invite_code = :code WHERE id = :id"),
                {"code": _invite_code(), "id": league_id},
            )

        # One-time backfill: pre-existing leagues (created before `competitions`
        # existed) have NULL there after the ALTER above. Data-driven, per league —
        # NOT a blanket "all competitions" default — derived from the same
        # kickoff >= league.created_at window `leaderboard()` already uses to decide
        # what counts for that league today, so nothing a league was already
        # scoring on stops scoring on it. Safe/idempotent to re-run on every
        # startup — WHERE competitions IS NULL means already-backfilled rows are
        # skipped. Deferred imports to avoid circular imports (both COMPETITIONS
        # and COMPETITION_KEYWORDS live outside app.models, and app.database is a
        # low-level module other things import from).
        from app.services.football_api import COMPETITIONS
        from app.services.league_scope import COMPETITION_KEYWORDS

        rows = await conn.execute(
            text("SELECT id, created_at FROM leagues WHERE competitions IS NULL")
        )
        for league_id, created_at in rows.fetchall():
            name_rows = await conn.execute(
                text("SELECT DISTINCT competition FROM fixtures WHERE kickoff >= :created_at"),
                {"created_at": created_at},
            )
            distinct_names = [r[0] for r in name_rows.fetchall() if r[0]]
            codes = [
                code for code, keyword in COMPETITION_KEYWORDS.items()
                if any(keyword in name for name in distinct_names)
            ]
            if not codes:
                codes = list(COMPETITIONS.keys())
            await conn.execute(
                text("UPDATE leagues SET competitions = :competitions WHERE id = :id"),
                {"competitions": ",".join(codes), "id": league_id},
            )
