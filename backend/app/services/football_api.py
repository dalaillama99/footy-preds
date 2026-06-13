"""
football-data.org v4 integration.

Rate limit: 10 req/min on free tier.
Strategy:
  - Fixture sync: 1 call per competition (admin-triggered)
  - Live scores:  1 call/min for ALL live matches combined (GET /matches?status=LIVE)
  - Total expected load: 2–3 calls/min during live periods — well within limit
"""

import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Fixture, Prediction
from app.services.points import calculate_points

logger = logging.getLogger(__name__)

# Competitions available on the free tier.
# WC (World Cup) and CL (Champions League) are the primary targets.
COMPETITIONS: dict[str, str] = {
    "WC": "FIFA World Cup 2026",
    "CL": "UEFA Champions League",
    "PL": "Premier League",
    "BL1": "Bundesliga",
    "SA": "Serie A",
    "PD": "La Liga",
    "FL1": "Ligue 1",
    "EC": "UEFA European Championship",
}

# Map football-data.org statuses → our internal statuses
_STATUS_MAP: dict[str, str] = {
    "SCHEDULED": "SCHEDULED",
    "TIMED": "SCHEDULED",
    "IN_PLAY": "LIVE",
    "PAUSED": "LIVE",
    "HALFTIME": "LIVE",
    "EXTRA_TIME": "LIVE",
    "PENALTY_SHOOTOUT": "LIVE",
    "FINISHED": "FINISHED",
    "AWARDED": "FINISHED",
    "SUSPENDED": "POSTPONED",
    "POSTPONED": "POSTPONED",
    "CANCELLED": "POSTPONED",
}

# Friendly stage labels shown in the UI
STAGE_LABELS: dict[str, str] = {
    "GROUP_STAGE": "Group Stage",
    "LAST_16": "Round of 16",
    "QUARTER_FINALS": "Quarter-finals",
    "SEMI_FINALS": "Semi-finals",
    "THIRD_PLACE": "3rd Place",
    "FINAL": "Final",
}


def _headers() -> dict:
    return {"X-Auth-Token": settings.FOOTBALL_API_KEY}


def _to_utc_naive(dt: datetime) -> datetime:
    """Convert any datetime to UTC-naive for SQLite storage."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _parse_match(m: dict, competition_override: str = "") -> dict:
    score_data = m.get("score", {})
    full_time = score_data.get("fullTime", {})
    regular_time = score_data.get("regularTime", {})
    extra_time = score_data.get("extraTime", {})
    penalties = score_data.get("penalties", {})
    duration = score_data.get("duration") or "REGULAR"

    # football-data.org v4 score fields:
    #   regularTime = score at the end of 90 min
    #   extraTime   = goals scored DURING extra time only (NOT cumulative)
    #   penalties   = penalty shootout score
    #   fullTime    = decisive total — equals regularTime + extraTime for an
    #                 EXTRA_TIME result, but regularTime + extraTime + penalties
    #                 for a PENALTY_SHOOTOUT (it bakes the shootout into the score).
    #
    # We store the outfield score *excluding* penalties (the FT / AET score):
    #   - REGULAR / EXTRA_TIME: fullTime already is that score.
    #   - PENALTY_SHOOTOUT: rebuild it from regularTime + extraTime and keep the
    #     shootout in home/away_penalties, so a 1-1 (4-3 pens) final is stored as
    #     1-1 with pens 4-3 — not 5-4.
    if duration == "PENALTY_SHOOTOUT" and regular_time.get("home") is not None:
        home_score = regular_time["home"] + (extra_time.get("home") or 0)
        away_score = regular_time["away"] + (extra_time.get("away") or 0)
    else:
        home_score = full_time.get("home")
        away_score = full_time.get("away")

    competition_name = competition_override or m.get("competition", {}).get("name", "")
    kickoff = _to_utc_naive(datetime.fromisoformat(m["utcDate"].replace("Z", "+00:00")))
    return {
        "api_id": m["id"],
        "home_team": m["homeTeam"]["name"],
        "away_team": m["awayTeam"]["name"],
        "home_team_crest": m["homeTeam"].get("crest"),
        "away_team_crest": m["awayTeam"].get("crest"),
        "kickoff": kickoff,
        "competition": competition_name,
        "matchday": m.get("matchday"),
        "stage": m.get("stage"),
        "group": m.get("group"),
        "status": _STATUS_MAP.get(m["status"], "SCHEDULED"),
        "home_score": home_score,
        "away_score": away_score,
        "minute": m.get("minute"),
        "duration": duration,
        "home_penalties": penalties.get("home"),
        "away_penalties": penalties.get("away"),
    }


async def fetch_competition_matches(competition_code: str) -> list[dict]:
    """Pull all matches for a competition from the API."""
    competition_name = COMPETITIONS.get(competition_code, competition_code)
    url = f"{settings.FOOTBALL_API_BASE}/competitions/{competition_code}/matches"

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers=_headers())
        resp.raise_for_status()

    return [_parse_match(m, competition_name) for m in resp.json().get("matches", [])]


async def fetch_live_matches() -> list[dict]:
    """Single API call that returns all currently live matches across all competitions."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{settings.FOOTBALL_API_BASE}/matches",
            headers=_headers(),
            params={"status": "LIVE"},
        )
        resp.raise_for_status()

    return [_parse_match(m) for m in resp.json().get("matches", [])]


async def upsert_fixtures(db: AsyncSession, matches: list[dict]) -> dict:
    """
    Upsert a list of parsed match dicts into the DB.
    - Creates new fixtures for unknown api_ids.
    - Updates score/status for known fixtures.
    - Auto-calculates prediction points when a match transitions to FINISHED.
    Returns a summary dict.
    """
    created = updated = points_recalculated = skipped = 0

    for m in matches:
        # Skip fixtures whose teams aren't known yet — e.g. World Cup knockout slots
        # before the bracket is drawn come back with null team names. Inserting them
        # would violate the NOT NULL constraint on fixtures.home_team and abort the
        # whole sync. They'll be created on a later re-sync once teams are confirmed.
        if m["home_team"] is None or m["away_team"] is None:
            skipped += 1
            continue

        result = await db.execute(select(Fixture).where(Fixture.api_id == m["api_id"]))
        fixture = result.scalar_one_or_none()

        if fixture:
            prev_status = fixture.status
            prev_home = fixture.home_score
            prev_away = fixture.away_score
            fixture.status = m["status"]
            fixture.home_score = m["home_score"]
            fixture.away_score = m["away_score"]
            fixture.minute = m.get("minute")
            fixture.home_team_crest = m["home_team_crest"]
            fixture.away_team_crest = m["away_team_crest"]
            fixture.duration = m.get("duration")
            fixture.home_penalties = m.get("home_penalties")
            fixture.away_penalties = m.get("away_penalties")

            just_finished = (prev_status != "FINISHED") and (m["status"] == "FINISHED")
            score_changed = (prev_home != m["home_score"] or prev_away != m["away_score"])
            if m["status"] == "FINISHED" and m["home_score"] is not None and (just_finished or score_changed):
                points_recalculated += await _recalc_points(db, fixture)
            updated += 1
        else:
            fixture = Fixture(
                api_id=m["api_id"],
                home_team=m["home_team"],
                away_team=m["away_team"],
                home_team_crest=m["home_team_crest"],
                away_team_crest=m["away_team_crest"],
                kickoff=m["kickoff"],
                competition=m["competition"],
                matchday=m["matchday"],
                stage=m["stage"],
                group=m["group"],
                status=m["status"],
                home_score=m["home_score"],
                away_score=m["away_score"],
                minute=m.get("minute"),
                duration=m.get("duration"),
                home_penalties=m.get("home_penalties"),
                away_penalties=m.get("away_penalties"),
            )
            db.add(fixture)
            await db.flush()  # populate fixture.id before querying predictions

            if m["status"] == "FINISHED" and m["home_score"] is not None:
                points_recalculated += await _recalc_points(db, fixture)
            created += 1

    await db.commit()
    return {"created": created, "updated": updated, "points_recalculated": points_recalculated, "skipped": skipped, "total": len(matches)}


async def fetch_match_result(api_id: int) -> dict:
    """Fetch current status and score for a single match."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{settings.FOOTBALL_API_BASE}/matches/{api_id}", headers=_headers())
        resp.raise_for_status()
    return _parse_match(resp.json())


async def fetch_match_lineups(api_id: int) -> dict:
    """
    Fetch lineup data for a single match. Lineups are usually announced ~1 hour before kickoff.
    Returns {"available": bool, "home": {...}, "away": {...}}.
    """
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{settings.FOOTBALL_API_BASE}/matches/{api_id}", headers=_headers())
        resp.raise_for_status()
    data = resp.json()

    def parse_team(team: dict) -> dict:
        return {
            "name": team.get("name"),
            "formation": team.get("formation"),
            "lineup": team.get("lineup", []),
            "bench": team.get("bench", []),
            "coach": (team.get("coach") or {}).get("name"),
        }

    home = parse_team(data.get("homeTeam", {}))
    away = parse_team(data.get("awayTeam", {}))
    available = bool(home["lineup"] and away["lineup"])
    return {"available": available, "home": home, "away": away}


async def _recalc_points(db: AsyncSession, fixture: Fixture) -> int:
    """Recalculate points for every prediction on a finished fixture. Returns count updated."""
    if fixture.home_score is None or fixture.away_score is None:
        return 0
    result = await db.execute(select(Prediction).where(Prediction.fixture_id == fixture.id))
    preds = result.scalars().all()
    for pred in preds:
        pred.points = calculate_points(
            pred.home_pred, pred.away_pred,
            fixture.home_score, fixture.away_score,
            duration=fixture.duration,
            home_penalties=fixture.home_penalties,
            away_penalties=fixture.away_penalties,
            pred_pen_winner=pred.pen_winner,
        )
    return len(preds)
