from pydantic import BaseModel, EmailStr, ConfigDict, Field
from datetime import datetime
from typing import Optional


# ── Auth ──────────────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    username: str
    email: str
    is_admin: bool
    team_name: Optional[str] = None


class TeamNameUpdate(BaseModel):
    team_name: str


# ── Leagues ───────────────────────────────────────────────────────────────────

class LeagueCreate(BaseModel):
    name: str


class LeagueJoin(BaseModel):
    invite_code: str


class LeagueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    invite_code: str
    admin_id: str
    member_count: int
    created_at: datetime


class LeagueSettingsUpdate(BaseModel):
    created_at: datetime


# ── Fixtures ──────────────────────────────────────────────────────────────────

class FixtureCreate(BaseModel):
    home_team: str
    away_team: str
    kickoff: datetime
    competition: str = ""
    matchday: Optional[int] = None


class FixtureScoreUpdate(BaseModel):
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    status: str = "FINISHED"


class LeagueMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: str
    username: str
    joined_at: datetime
    is_league_admin: bool
    real_name: Optional[str] = None


class FixtureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    api_id: Optional[int]
    home_team: str
    away_team: str
    home_team_crest: Optional[str]
    away_team_crest: Optional[str]
    kickoff: datetime
    competition: str
    matchday: Optional[int]
    stage: Optional[str]
    group: Optional[str]
    status: str
    home_score: Optional[int]
    away_score: Optional[int]
    duration: Optional[str]
    home_penalties: Optional[int]
    away_penalties: Optional[int]
    minute: Optional[int] = None


# ── Predictions ───────────────────────────────────────────────────────────────

class PredictionCreate(BaseModel):
    fixture_id: str
    home_pred: int = Field(..., ge=0)
    away_pred: int = Field(..., ge=0)
    pen_winner: Optional[str] = None  # "home" or "away", only relevant for knockout fixtures


class PredictionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    fixture_id: str
    home_pred: int
    away_pred: int
    pen_winner: Optional[str]
    points: Optional[float]
    submitted_at: datetime
    fixture: FixtureOut


# ── Leaderboard ───────────────────────────────────────────────────────────────

class LeaderboardEntry(BaseModel):
    user_id: str
    username: str
    total_points: float
    prediction_count: int
    scored_count: int
    exact_count: int
    correct_count: int
    real_name: Optional[str] = None
    bracket_bonus: Optional[float] = None


# ── Bonus bracket prediction ──────────────────────────────────────────────────

class BracketTeam(BaseModel):
    name: str
    crest: Optional[str] = None


class BracketPredictionIn(BaseModel):
    semi1_a: str
    semi1_b: str
    semi2_a: str
    semi2_b: str
    finalist1: str
    finalist2: str


class BracketPredictionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    semi1_a: str
    semi1_b: str
    semi2_a: str
    semi2_b: str
    finalist1: str
    finalist2: str
    points: Optional[float] = None
    submitted_at: datetime


# ── League predictions (post-kickoff, visible to all members) ─────────────────

class MemberPredictionOut(BaseModel):
    user_id: str
    username: str
    home_pred: int
    away_pred: int
    pen_winner: Optional[str]
    points: Optional[float]


class FixturePredictionsOut(BaseModel):
    fixture: FixtureOut
    predictions: list[MemberPredictionOut]
