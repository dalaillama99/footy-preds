from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models import Fixture, League, LeagueMember, Prediction, User
from app.schemas import FixtureCreate, FixtureOut, FixtureScoreUpdate
import json
from datetime import timezone

from app.services.football_api import COMPETITIONS, _recalc_points, fetch_competition_matches, fetch_match_lineups, fetch_match_result, upsert_fixtures
from app.services.league_scope import COMPETITION_KEYWORDS, fixture_in_league_scope, match_competition_code, parse_competitions, parse_ucl_teams
from app.services.points import calculate_points

router = APIRouter(prefix="/fixtures", tags=["fixtures"])


@router.get("", response_model=list[FixtureOut])
async def list_fixtures(
    league_id: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fixtures in scope for the caller, never including unsynced ones.

    With no `league_id`, scope is the union of the caller's non-archived
    leagues' (competitions, ucl_teams) — so a second, wider league can pull in
    fixtures a narrower league excluded. With `league_id`, scope is that one
    league only (403 if the caller isn't a member), which is what makes a
    league's Champions League team pool actually visible on the Fixtures tab.
    An explicitly named league is scoped even when the caller has archived it:
    asking for it by id is a deliberate choice, unlike the union default.
    """
    result = await db.execute(
        select(Fixture).where(Fixture.visible_clause()).order_by(Fixture.kickoff)
    )
    all_fixtures = result.scalars().all()

    if league_id is not None:
        membership = await db.execute(
            select(LeagueMember).where(
                LeagueMember.user_id == user.id, LeagueMember.league_id == league_id
            )
        )
        if membership.scalar_one_or_none() is None:
            raise HTTPException(status_code=403, detail="Not a member of this league")
        league = (await db.execute(select(League).where(League.id == league_id))).scalar_one_or_none()
        if league is None:
            raise HTTPException(status_code=404, detail="League not found")
        qualifying_leagues = [
            (parse_competitions(league.competitions), parse_ucl_teams(league.ucl_teams))
        ]
    else:
        # Every caller — admin or not — is scoped to the union of their non-archived
        # leagues' (competitions, ucl_teams). Zero qualifying memberships → empty
        # predictable fixture list.
        memberships_result = await db.execute(
            select(LeagueMember)
            .where(LeagueMember.user_id == user.id, LeagueMember.archived == False)  # noqa: E712
            .options(selectinload(LeagueMember.league))
        )
        qualifying_leagues = [
            (parse_competitions(m.league.competitions), parse_ucl_teams(m.league.ucl_teams))
            for m in memberships_result.scalars()
        ]
    if not qualifying_leagues:
        return []

    return [
        f for f in all_fixtures
        if any(fixture_in_league_scope(f, codes, ucl_teams) for codes, ucl_teams in qualifying_leagues)
    ]


@router.post("", response_model=FixtureOut)
async def create_fixture(
    data: FixtureCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    fixture = Fixture(
        home_team=data.home_team,
        away_team=data.away_team,
        kickoff=data.kickoff,
        competition=data.competition,
        matchday=data.matchday,
    )
    db.add(fixture)
    await db.commit()
    await db.refresh(fixture)
    return fixture


@router.patch("/{fixture_id}", response_model=FixtureOut)
async def update_fixture(
    fixture_id: str,
    data: FixtureCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    result = await db.execute(select(Fixture).where(Fixture.id == fixture_id))
    fixture = result.scalar_one_or_none()
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")

    fixture.home_team = data.home_team
    fixture.away_team = data.away_team
    fixture.kickoff = data.kickoff
    fixture.competition = data.competition
    fixture.matchday = data.matchday
    await db.commit()
    await db.refresh(fixture)
    return fixture


@router.post("/{fixture_id}/score", response_model=FixtureOut)
async def set_score(
    fixture_id: str,
    data: FixtureScoreUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set score/status and recalculate points. Scores are optional for non-FINISHED statuses."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    result = await db.execute(select(Fixture).where(Fixture.id == fixture_id))
    fixture = result.scalar_one_or_none()
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")
    # Defence in depth: no list endpoint returns unsynced fixtures, so the UI can't
    # reach this. Scoring one would quietly rewrite points on hidden predictions.
    if fixture.unsynced:
        raise HTTPException(status_code=400, detail="Fixture is unsynced — re-sync its competition first")

    fixture.home_score = data.home_score
    fixture.away_score = data.away_score
    fixture.status = data.status

    preds = await db.execute(select(Prediction).where(Prediction.fixture_id == fixture_id))
    for pred in preds.scalars():
        if data.status == "FINISHED" and data.home_score is not None and data.away_score is not None:
            pred.points = calculate_points(
                    pred.home_pred, pred.away_pred,
                    data.home_score, data.away_score,
                    duration=fixture.duration,
                    home_penalties=fixture.home_penalties,
                    away_penalties=fixture.away_penalties,
                    pred_pen_winner=pred.pen_winner,
                )
        else:
            pred.points = None

    await db.commit()
    await db.refresh(fixture)
    return fixture


@router.post("/sync")
async def sync_from_api(
    competition: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Pull all fixtures for a competition from football-data.org and upsert into DB.

    Also undoes a previous unsync of this competition: every matching fixture has
    `unsynced` cleared, which brings its preserved Prediction rows (and their
    points, never cleared) back into every view. Two independent arms, because
    neither alone is sufficient:
      (a) the api_ids this sync actually touched — covers legacy rows whose stored
          `competition` is the raw API name ("Primera Division" for PD), which the
          keyword arm would miss, leaving them permanently invisible;
      (b) a keyword match on `competition` — covers admin-created fixtures
          (`api_id IS NULL`), which the API response can never mention and which
          would otherwise have no route back.
    Arm (b) means an admin-created duplicate of a real match reappears alongside
    the API row, where the old hard delete silently garbage-collected it. Accepted.
    """
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    if not settings.FOOTBALL_API_KEY:
        raise HTTPException(status_code=503, detail="FOOTBALL_API_KEY not set in .env")
    if competition not in COMPETITIONS:
        raise HTTPException(status_code=400, detail=f"Unknown competition. Valid: {list(COMPETITIONS)}")

    try:
        matches = await fetch_competition_matches(competition)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"football-data.org error: {exc}")

    # normalize_competition=True: this is the one call site whose parsed dicts carry
    # the canonical COMPETITIONS[code] name, so it can heal legacy raw-name rows.
    summary = await upsert_fixtures(db, matches, normalize_competition=True)
    upserted_api_ids = summary.pop("upserted_api_ids", [])

    restore_q = select(Fixture).where(Fixture.unsynced.is_(True))
    keyword = COMPETITION_KEYWORDS.get(competition)
    conditions = []
    if upserted_api_ids:
        conditions.append(Fixture.api_id.in_(upserted_api_ids))
    if keyword:
        conditions.append(Fixture.competition.contains(keyword))
    restored = 0
    if conditions:
        restore_q = restore_q.where(or_(*conditions))
        for fixture in (await db.execute(restore_q)).scalars().all():
            fixture.unsynced = False
            restored += 1
        await db.commit()

    summary["restored_fixtures"] = restored
    return summary


@router.post("/recalculate-all")
async def recalculate_all_points(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Recalculate points for every prediction on every finished fixture.

    Run once after a scoring-rule change so already-completed league tables
    reflect the new values. Idempotent — safe to run repeatedly.
    """
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    result = await db.execute(
        select(Fixture).where(Fixture.status == "FINISHED", Fixture.visible_clause())
    )
    fixtures = result.scalars().all()
    fixtures_updated = predictions_updated = 0
    for fixture in fixtures:
        n = await _recalc_points(db, fixture)
        if n:
            fixtures_updated += 1
            predictions_updated += n
    await db.commit()
    return {
        "finished_fixtures": len(fixtures),
        "fixtures_updated": fixtures_updated,
        "predictions_updated": predictions_updated,
    }


@router.post("/recalculate-recent")
async def recalculate_recent_points(
    days: int = 7,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Recalculate points for finished fixtures in currently-active competitions.

    Competition-scoped, not league-scoped: a competition (identified via
    COMPETITION_KEYWORDS) is "eligible" for this run if it has at least one
    Fixture row — any status, SCHEDULED counts too — with kickoff within the
    last `days` days (default 7). This is an activity check, not a "when did
    this competition start" check, so it stays correct across multiple synced
    seasons of the same competition: old-season rows sitting in the table
    never permanently disqualify a competition, because eligibility only asks
    "is there something in the recent window right now."

    Once a competition is judged eligible, ALL of its FINISHED fixtures get
    recalculated — not just the ones within the window. This is deliberate:
    eligibility (is this competition currently live/relevant) and scope (which
    of its fixtures get touched) are separate decisions that happen to share a
    window for different purposes.

    A FINISHED fixture whose `competition` string matches no known keyword
    has no competition to group into, so it falls back to its
    own kickoff against the same cutoff — treated as its own single-fixture
    "competition".

    League creation dates play no role here at all. Idempotent — safe to run
    repeatedly. Narrower companion to /recalculate-all.
    """
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    cutoff = datetime.utcnow() - timedelta(days=days)

    eligible_codes: set[str] = set()
    for code, keyword in COMPETITION_KEYWORDS.items():
        exists_result = await db.execute(
            select(Fixture.id)
            .where(
                Fixture.competition.contains(keyword),
                Fixture.kickoff >= cutoff,
                Fixture.visible_clause(),
            )
            .limit(1)
        )
        if exists_result.first() is not None:
            eligible_codes.add(code)

    result = await db.execute(
        select(Fixture).where(Fixture.status == "FINISHED", Fixture.visible_clause())
    )
    all_finished = result.scalars().all()

    fixtures = []
    for fixture in all_finished:
        code = match_competition_code(fixture.competition)
        if code is None:
            # Unrecognized competition string — treat as its own single-fixture
            # "competition", scoped by its own kickoff.
            if fixture.kickoff >= cutoff:
                fixtures.append(fixture)
        elif code in eligible_codes:
            fixtures.append(fixture)

    fixtures_updated = predictions_updated = 0
    for fixture in fixtures:
        n = await _recalc_points(db, fixture)
        if n:
            fixtures_updated += 1
            predictions_updated += n
    await db.commit()
    return {
        "finished_fixtures": len(fixtures),
        "fixtures_updated": fixtures_updated,
        "predictions_updated": predictions_updated,
    }


@router.post("/{fixture_id}/refresh", response_model=FixtureOut)
async def refresh_fixture_from_api(
    fixture_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch latest score/status for a single fixture from football-data.org and update DB.

    A deliberate admin action, so it also un-unsyncs this one fixture — the same
    "an explicit sync restores what an unsync hid" rule as POST /fixtures/sync.
    normalize_competition stays False: `fetch_match_result` parses with no
    competition override, so its `competition` is football-data.org's raw name and
    would overwrite a correct canonical value.
    """
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    result = await db.execute(select(Fixture).where(Fixture.id == fixture_id))
    fixture = result.scalar_one_or_none()
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")
    if not fixture.api_id:
        raise HTTPException(status_code=400, detail="Fixture has no API id — cannot refresh")

    try:
        match_data = await fetch_match_result(fixture.api_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"football-data.org error: {exc}")

    if fixture.unsynced:
        fixture.unsynced = False
        await db.commit()

    await upsert_fixtures(db, [match_data])

    result = await db.execute(select(Fixture).where(Fixture.id == fixture_id))
    return result.scalar_one()


@router.get("/{fixture_id}/lineups")
async def get_lineups(
    fixture_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return cached lineups, or fetch from API if not cached / stale.
    Lineups are only populated by the API ~1 hour before kickoff.
    """
    # Unsynced fixtures are indistinguishable from missing here (defence in depth —
    # no list endpoint returns them, so the UI never asks).
    result = await db.execute(
        select(Fixture).where(Fixture.id == fixture_id, Fixture.visible_clause())
    )
    fixture = result.scalar_one_or_none()
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")

    # Only use cache if lineups are confirmed available — don't cache "not yet announced"
    if fixture.lineups_json:
        cached = json.loads(fixture.lineups_json)
        if cached.get("available"):
            return cached

    if not settings.FOOTBALL_API_KEY or not fixture.api_id:
        return {"available": False, "home": None, "away": None}

    try:
        lineup_data = await fetch_match_lineups(fixture.api_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch lineups: {exc}")

    if lineup_data.get("available"):
        fixture.lineups_json = json.dumps(lineup_data)
        await db.commit()
    return lineup_data


@router.get("/competitions")
async def list_competitions(user: User = Depends(get_current_user)):
    """Return the competitions available for syncing."""
    return [{"code": k, "name": v} for k, v in COMPETITIONS.items()]


@router.get("/synced-competitions")
async def synced_competitions(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Distinct `competition` strings with at least one still-synced fixture.

    Populates the admin unsync dropdown, so an already-unsynced competition must
    drop off the list — otherwise a second unsync of the same name silently
    reports 0 fixtures.
    """
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    result = await db.execute(
        select(Fixture.competition).where(Fixture.visible_clause()).distinct()
    )
    names = sorted(r[0] for r in result.all() if r[0])
    return names


@router.delete("/competition")
async def unsync_competition(
    name: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Unsync a competition: hide its fixtures everywhere, destroy nothing.

    This used to hard-delete every matching Fixture row AND every Prediction
    pointing at it, which irrecoverably destroyed real users' predictions and
    points — re-syncing recreated fixtures with fresh UUIDs and no predictions.
    It is now a soft delete: `Fixture.unsynced = True`, and NOT ONE Prediction
    row is touched, so POST /fixtures/sync brings them and their scores back.

    Exact equality on `competition` is deliberate: the admin dropdown is built
    from distinct `competition` strings, so exact match is precisely what the
    operator picked and nothing adjacent gets caught.
    """
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="Competition name required")
    result = await db.execute(
        select(Fixture).where(Fixture.competition == name, Fixture.visible_clause())
    )
    fixtures = result.scalars().all()
    fixture_ids = [f.id for f in fixtures]
    preserved_predictions = 0
    if fixture_ids:
        count_result = await db.execute(
            select(func.count()).select_from(Prediction).where(Prediction.fixture_id.in_(fixture_ids))
        )
        preserved_predictions = count_result.scalar() or 0
    for f in fixtures:
        f.unsynced = True
    await db.commit()
    return {"unsynced_fixtures": len(fixtures), "preserved_predictions": preserved_predictions}


@router.delete("/{fixture_id}")
async def delete_fixture(
    fixture_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    result = await db.execute(select(Fixture).where(Fixture.id == fixture_id))
    fixture = result.scalar_one_or_none()
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")

    await db.delete(fixture)
    await db.commit()
    return {"deleted": fixture_id}
