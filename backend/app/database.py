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
        ]:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass
