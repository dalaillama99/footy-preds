import uuid
import secrets
import string
from datetime import datetime
from sqlalchemy import String, Integer, Float, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _invite_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(8))


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    google_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    memberships: Mapped[list["LeagueMember"]] = relationship(back_populates="user")
    predictions: Mapped[list["Prediction"]] = relationship(back_populates="user")


class League(Base):
    __tablename__ = "leagues"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    invite_code: Mapped[str] = mapped_column(String(8), unique=True, default=_invite_code)
    admin_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    members: Mapped[list["LeagueMember"]] = relationship(back_populates="league")


class LeagueMember(Base):
    __tablename__ = "league_members"
    __table_args__ = (UniqueConstraint("user_id", "league_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    league_id: Mapped[str] = mapped_column(String, ForeignKey("leagues.id"))
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="memberships")
    league: Mapped["League"] = relationship(back_populates="members")


class Fixture(Base):
    __tablename__ = "fixtures"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    api_id: Mapped[int | None] = mapped_column(Integer, unique=True, nullable=True)  # football-data.org match id
    home_team: Mapped[str] = mapped_column(String(100))
    away_team: Mapped[str] = mapped_column(String(100))
    home_team_crest: Mapped[str | None] = mapped_column(String(500), nullable=True)
    away_team_crest: Mapped[str | None] = mapped_column(String(500), nullable=True)
    kickoff: Mapped[datetime] = mapped_column(DateTime)  # stored as UTC naive
    competition: Mapped[str] = mapped_column(String(100), default="")
    matchday: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stage: Mapped[str | None] = mapped_column(String(50), nullable=True)   # e.g. GROUP_STAGE, FINAL
    group: Mapped[str | None] = mapped_column(String(20), nullable=True)   # e.g. GROUP_A
    status: Mapped[str] = mapped_column(String(20), default="SCHEDULED")   # SCHEDULED|LIVE|FINISHED|POSTPONED
    home_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration: Mapped[str | None] = mapped_column(String(20), nullable=True)  # REGULAR|EXTRA_TIME|PENALTY_SHOOTOUT
    home_penalties: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_penalties: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lineups_json: Mapped[str | None] = mapped_column(String, nullable=True)  # cached JSON from API
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    predictions: Mapped[list["Prediction"]] = relationship(back_populates="fixture")


class Prediction(Base):
    __tablename__ = "predictions"
    __table_args__ = (UniqueConstraint("user_id", "fixture_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    fixture_id: Mapped[str] = mapped_column(String, ForeignKey("fixtures.id"))
    home_pred: Mapped[int] = mapped_column(Integer)
    away_pred: Mapped[int] = mapped_column(Integer)
    points: Mapped[float | None] = mapped_column(Float, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="predictions")
    fixture: Mapped["Fixture"] = relationship(back_populates="predictions")
