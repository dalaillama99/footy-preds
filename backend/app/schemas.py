from pydantic import BaseModel, EmailStr, ConfigDict
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


# ── Predictions ───────────────────────────────────────────────────────────────

class PredictionCreate(BaseModel):
    fixture_id: str
    home_pred: int
    away_pred: int


class PredictionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    fixture_id: str
    home_pred: int
    away_pred: int
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


# ── League predictions (post-kickoff, visible to all members) ─────────────────

class MemberPredictionOut(BaseModel):
    user_id: str
    username: str
    home_pred: int
    away_pred: int
    points: Optional[float]


class FixturePredictionsOut(BaseModel):
    fixture: FixtureOut
    predictions: list[MemberPredictionOut]
