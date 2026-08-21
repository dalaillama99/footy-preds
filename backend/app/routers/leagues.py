import uuid
import zoneinfo
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import BracketPrediction, Fixture, League, LeagueMember, Prediction, User
from app.schemas import (
    BracketPredictionOut, BracketTeam, FixturePredictionsOut, LeagueCreate, LeagueJoin,
    LeagueOut, LeagueSettingsUpdate, LeaderboardEntry, LeagueMemberOut,
    MemberPredictionOut, MemberSemiPredictionOut,
)

router = APIRouter(prefix="/leagues", tags=["leagues"])


async def _member_count(db: AsyncSession, league_id: str) -> int:
    result = await db.execute(select(func.count()).where(LeagueMember.league_id == league_id))
    return result.scalar()


def _build_league_out(league: League, user: User, count: int, sf_done: bool, sf_revealed: bool) -> LeagueOut:
    # admin_invite_code is only ever shown to the league's own admin or a site admin —
    # everyone else (including someone who just joined via that very code) gets null.
    can_see_admin_code = league.admin_id == user.id or user.is_admin
    return LeagueOut(
        id=league.id,
        name=league.name,
        invite_code=league.invite_code,
        admin_id=league.admin_id,
        member_count=count,
        created_at=league.created_at,
        semis_finished=sf_done,
        semis_revealed=sf_revealed,
        max_participants=league.max_participants,
        admin_invite_code=(league.admin_invite_code if can_see_admin_code else None),
    )


def _display_name(user: User) -> str:
    # Real (Google) names are always obscured behind team names; admins see the
    # real name separately via the `real_name` field, not in the main display.
    return user.team_name or user.username


async def _semis_finished(db: AsyncSession) -> bool:
    """Return True if both SEMI_FINALS fixtures exist with status FINISHED."""
    result = await db.execute(
        select(Fixture).where(Fixture.stage == "SEMI_FINALS", Fixture.competition.contains("World Cup"))
    )
    semi_fixtures = result.scalars().all()
    return len(semi_fixtures) >= 2 and all(f.status == "FINISHED" for f in semi_fixtures)


async def _semis_revealed(db: AsyncSession) -> bool:
    """Return True once both SEMI_FINALS fixtures have their teams decided (TBD placeholders gone)."""
    result = await db.execute(
        select(Fixture).where(
            Fixture.stage == "SEMI_FINALS",
            Fixture.competition.contains("World Cup"),
            Fixture.home_team != "TBD",
            Fixture.away_team != "TBD",
        )
    )
    semis = result.scalars().all()
    return len(semis) >= 2


@router.post("", response_model=LeagueOut)
async def create_league(
    data: LeagueCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Only the site admin can create leagues")

    league = League(id=str(uuid.uuid4()), name=data.name, admin_id=user.id, max_participants=data.max_participants)
    db.add(league)
    db.add(LeagueMember(id=str(uuid.uuid4()), user_id=user.id, league_id=league.id))
    await db.commit()
    await db.refresh(league)
    sf_done = await _semis_finished(db)
    sf_revealed = await _semis_revealed(db)
    return _build_league_out(league, user, 1, sf_done, sf_revealed)


@router.post("/join", response_model=LeagueOut)
async def join_league(
    data: LeagueJoin,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    code = data.invite_code.upper()
    result = await db.execute(
        select(League).where((League.invite_code == code) | (League.admin_invite_code == code))
    )
    league = result.scalar_one_or_none()
    if not league:
        raise HTTPException(status_code=404, detail="League not found — check the invite code")

    existing = await db.execute(
        select(LeagueMember).where(LeagueMember.user_id == user.id, LeagueMember.league_id == league.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You're already in this league")

    # The cap only applies when joining via the normal invite code — the admin
    # veto code always bypasses it.
    if code == league.invite_code:
        if league.max_participants is not None:
            count_so_far = await _member_count(db, league.id)
            if count_so_far >= league.max_participants:
                raise HTTPException(status_code=400, detail="League is full")

    db.add(LeagueMember(id=str(uuid.uuid4()), user_id=user.id, league_id=league.id))
    await db.commit()
    count = await _member_count(db, league.id)
    sf_done = await _semis_finished(db)
    sf_revealed = await _semis_revealed(db)
    return _build_league_out(league, user, count, sf_done, sf_revealed)


@router.get("", response_model=list[LeagueOut])
async def my_leagues(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    memberships = await db.execute(
        select(LeagueMember).where(LeagueMember.user_id == user.id).options(selectinload(LeagueMember.league))
    )
    sf_done = await _semis_finished(db)
    sf_revealed = await _semis_revealed(db)
    leagues = []
    for m in memberships.scalars():
        count = await _member_count(db, m.league_id)
        league = m.league
        leagues.append(_build_league_out(league, user, count, sf_done, sf_revealed))
    return leagues


@router.get("/{league_id}", response_model=LeagueOut)
async def get_league(league_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    membership = await db.execute(
        select(LeagueMember).where(LeagueMember.user_id == user.id, LeagueMember.league_id == league_id)
    )
    if not membership.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this league")

    result = await db.execute(select(League).where(League.id == league_id))
    league = result.scalar_one_or_none()
    if not league:
        raise HTTPException(status_code=404, detail="League not found")

    count = await _member_count(db, league_id)
    sf_done = await _semis_finished(db)
    sf_revealed = await _semis_revealed(db)
    return _build_league_out(league, user, count, sf_done, sf_revealed)


@router.patch("/{league_id}/settings", response_model=LeagueOut)
async def update_league_settings(
    league_id: str,
    data: LeagueSettingsUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(League).where(League.id == league_id))
    league = result.scalar_one_or_none()
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    if league.admin_id != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="Must be league admin to update settings")

    # Store as UTC naive
    dt = data.created_at
    league.created_at = dt.replace(tzinfo=None) if dt.tzinfo else dt
    await db.commit()
    await db.refresh(league)
    count = await _member_count(db, league_id)
    sf_done = await _semis_finished(db)
    sf_revealed = await _semis_revealed(db)
    return _build_league_out(league, user, count, sf_done, sf_revealed)


@router.get("/{league_id}/leaderboard", response_model=list[LeaderboardEntry])
async def leaderboard(
    league_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    membership = await db.execute(
        select(LeagueMember).where(LeagueMember.user_id == user.id, LeagueMember.league_id == league_id)
    )
    if not membership.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this league")

    league = (await db.execute(select(League).where(League.id == league_id))).scalar_one_or_none()
    if not league:
        raise HTTPException(status_code=404, detail="League not found")

    members = await db.execute(
        select(LeagueMember).where(LeagueMember.league_id == league_id).options(selectinload(LeagueMember.user))
    )
    all_members = members.scalars().all()

    now_utc = datetime.utcnow()
    recent_fix_q = select(Fixture).where(
        Fixture.kickoff >= now_utc - timedelta(hours=8),
        Fixture.kickoff <= now_utc - timedelta(hours=2),
    )
    if league.created_at is not None:
        recent_fix_q = recent_fix_q.where(Fixture.kickoff >= league.created_at)
    recent_fixtures = (await db.execute(recent_fix_q)).scalars().all()

    show_rank_changes = False
    day_start_utc = None
    if recent_fixtures:
        last_kickoff = max(f.kickoff for f in recent_fixtures)
        if now_utc <= last_kickoff + timedelta(hours=8):
            show_rank_changes = True
            est_tz = zoneinfo.ZoneInfo("America/New_York")
            last_kickoff_est_date = last_kickoff.replace(tzinfo=zoneinfo.ZoneInfo("UTC")).astimezone(est_tz).date()
            day_start_utc = datetime(last_kickoff_est_date.year, last_kickoff_est_date.month, last_kickoff_est_date.day, tzinfo=est_tz).astimezone(zoneinfo.ZoneInfo("UTC")).replace(tzinfo=None)

    entries = []
    for m in all_members:
        pred_q = select(Prediction).join(Fixture, Fixture.id == Prediction.fixture_id).where(
            Prediction.user_id == m.user_id
        )
        if league.created_at is not None:
            pred_q = pred_q.where(Fixture.kickoff >= league.created_at)
        preds = (await db.execute(pred_q)).scalars().all()
        total = sum(p.points or 0 for p in preds)
        scored = sum(1 for p in preds if p.points is not None)
        exact = sum(1 for p in preds if p.points is not None and p.points >= 3)
        correct_gd = sum(1 for p in preds if p.points is not None and 2.0 <= p.points < 3)
        correct_result = sum(1 for p in preds if p.points is not None and 1.5 <= p.points < 2.0)

        # Bonus bracket points are global (same across all the user's leagues):
        # add the scored bracket bonus into the displayed total.
        bracket = (await db.execute(
            select(BracketPrediction).where(BracketPrediction.user_id == m.user_id)
        )).scalar_one_or_none()
        bracket_bonus = None
        bracket_sf_pts = None
        bracket_finalist_pts = None
        if bracket is not None and bracket.points is not None:
            bracket_bonus = bracket.points
            total += bracket.points
            bracket_sf_pts = bracket.sf_points
            bracket_finalist_pts = bracket.finalist_points

        entries.append(LeaderboardEntry(
            user_id=m.user_id,
            username=_display_name(m.user),
            total_points=total,
            prediction_count=len(preds),
            scored_count=scored,
            exact_count=exact,
            correct_gd_count=correct_gd,
            correct_result_count=correct_result,
            real_name=(m.user.username if user.is_admin else None),
            bracket_bonus=bracket_bonus,
            bracket_sf_points=bracket_sf_pts,
            bracket_finalist_points=bracket_finalist_pts,
        ))

    sorted_entries = sorted(entries, key=lambda e: (e.total_points, e.exact_count, e.correct_gd_count, e.correct_result_count), reverse=True)

    if show_rank_changes:
        prev_entries = []
        for m in all_members:
            pred_q = select(Prediction).join(Fixture, Fixture.id == Prediction.fixture_id).where(
                Prediction.user_id == m.user_id,
                Fixture.kickoff < day_start_utc,
            )
            if league.created_at is not None:
                pred_q = pred_q.where(Fixture.kickoff >= league.created_at)
            preds = (await db.execute(pred_q)).scalars().all()
            total = sum(p.points or 0 for p in preds)
            prev_exact = sum(1 for p in preds if p.points is not None and p.points >= 3)
            prev_correct_gd = sum(1 for p in preds if p.points is not None and 2.0 <= p.points < 3)
            prev_correct_result = sum(1 for p in preds if p.points is not None and 1.5 <= p.points < 2.0)

            bracket = (await db.execute(
                select(BracketPrediction).where(BracketPrediction.user_id == m.user_id)
            )).scalar_one_or_none()
            if bracket is not None and bracket.points is not None:
                total += bracket.points

            prev_entries.append((m.user_id, total, prev_exact, prev_correct_gd, prev_correct_result))

        sorted_prev = sorted(prev_entries, key=lambda x: (x[1], x[2], x[3], x[4]), reverse=True)
        prev_rank_map = {user_id: idx + 1 for idx, (user_id, *_) in enumerate(sorted_prev)}

        for curr_rank, entry in enumerate(sorted_entries, start=1):
            prev_rank = prev_rank_map.get(entry.user_id, curr_rank)
            entry.rank_delta = curr_rank - prev_rank

    return sorted_entries


@router.get("/{league_id}/members", response_model=list[LeagueMemberOut])
async def get_members(
    league_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    membership = await db.execute(
        select(LeagueMember).where(LeagueMember.user_id == user.id, LeagueMember.league_id == league_id)
    )
    if not membership.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this league")

    result = await db.execute(select(League).where(League.id == league_id))
    league = result.scalar_one_or_none()
    if not league:
        raise HTTPException(status_code=404, detail="League not found")

    members_result = await db.execute(
        select(LeagueMember)
        .where(LeagueMember.league_id == league_id)
        .options(selectinload(LeagueMember.user))
        .order_by(LeagueMember.joined_at)
    )
    return [
        LeagueMemberOut(
            user_id=m.user_id,
            username=_display_name(m.user),
            joined_at=m.joined_at,
            is_league_admin=(m.user_id == league.admin_id),
            real_name=(m.user.username if user.is_admin else None),
        )
        for m in members_result.scalars()
    ]


@router.delete("/{league_id}/leave")
async def leave_league(
    league_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(League).where(League.id == league_id))
    league = result.scalar_one_or_none()
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    if league.admin_id == user.id:
        raise HTTPException(status_code=400, detail="League admins cannot leave — transfer admin first or delete the league")

    membership = await db.execute(
        select(LeagueMember).where(LeagueMember.user_id == user.id, LeagueMember.league_id == league_id)
    )
    member = membership.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Not a member")

    await db.delete(member)
    await db.commit()
    return {"left": league_id}


@router.get("/{league_id}/fixture-predictions", response_model=list[FixturePredictionsOut])
async def league_fixture_predictions(
    league_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """All members' predictions for kicked-off fixtures. Only visible after kickoff."""
    membership = await db.execute(
        select(LeagueMember).where(LeagueMember.user_id == user.id, LeagueMember.league_id == league_id)
    )
    if not membership.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this league")

    league = (await db.execute(select(League).where(League.id == league_id))).scalar_one_or_none()
    if not league:
        raise HTTPException(status_code=404, detail="League not found")

    members_result = await db.execute(
        select(LeagueMember).where(LeagueMember.league_id == league_id).options(selectinload(LeagueMember.user))
    )
    members = members_result.scalars().all()
    member_ids = {m.user_id for m in members}
    user_map = {m.user_id: _display_name(m.user) for m in members}

    now = datetime.utcnow()
    conditions = [Fixture.kickoff <= now]
    if league.created_at is not None:
        conditions.append(Fixture.kickoff >= league.created_at)
    fixtures_result = await db.execute(
        select(Fixture).where(*conditions).order_by(Fixture.kickoff.desc())
    )
    fixtures = fixtures_result.scalars().all()
    if not fixtures:
        return []

    fixture_ids = [f.id for f in fixtures]
    preds_result = await db.execute(
        select(Prediction).where(
            Prediction.fixture_id.in_(fixture_ids),
            Prediction.user_id.in_(member_ids),
        )
    )
    preds_by_fixture: dict[str, list[Prediction]] = {}
    for p in preds_result.scalars():
        preds_by_fixture.setdefault(p.fixture_id, []).append(p)

    result = []
    for fixture in fixtures:
        fixture_preds = preds_by_fixture.get(fixture.id, [])
        if not fixture_preds:
            continue
        result.append(FixturePredictionsOut(
            fixture=fixture,
            predictions=[
                MemberPredictionOut(
                    user_id=p.user_id,
                    username=user_map.get(p.user_id, "Unknown"),
                    home_pred=p.home_pred,
                    away_pred=p.away_pred,
                    pen_winner=p.pen_winner,
                    points=p.points,
                )
                for p in sorted(fixture_preds, key=lambda p: -(p.points or 0))
            ],
        ))
    return result


@router.delete("/{league_id}/members/{target_user_id}")
async def kick_member(
    league_id: str,
    target_user_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(League).where(League.id == league_id))
    league = result.scalar_one_or_none()
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    if league.admin_id != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="Must be league admin to kick members")
    if target_user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot kick yourself — use leave instead")

    membership = await db.execute(
        select(LeagueMember).where(LeagueMember.user_id == target_user_id, LeagueMember.league_id == league_id)
    )
    member = membership.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    await db.delete(member)
    await db.commit()
    return {"kicked": target_user_id}


@router.get("/{league_id}/bracket-semis", response_model=list[MemberSemiPredictionOut])
async def league_bracket_semis(
    league_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """All league members' semi-final predictions. Only revealed once at least one SEMI_FINALS
    fixture has kicked off (kickoff <= now UTC)."""
    membership = await db.execute(
        select(LeagueMember).where(LeagueMember.user_id == user.id, LeagueMember.league_id == league_id)
    )
    if not membership.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this league")

    league = (await db.execute(select(League).where(League.id == league_id))).scalar_one_or_none()
    if not league:
        raise HTTPException(status_code=404, detail="League not found")

    if not await _semis_revealed(db):
        raise HTTPException(status_code=403, detail="Semi-final predictions are not yet revealed")

    members_result = await db.execute(
        select(LeagueMember)
        .where(LeagueMember.league_id == league_id)
        .options(selectinload(LeagueMember.user))
        .order_by(LeagueMember.joined_at)
    )
    members = members_result.scalars().all()

    # Build a crest lookup from World Cup fixtures
    wc_fixtures = (await db.execute(
        select(Fixture).where(Fixture.competition.contains("World Cup"))
    )).scalars().all()
    crest_map: dict[str, str | None] = {}
    for f in wc_fixtures:
        for name, crest in ((f.home_team, f.home_team_crest), (f.away_team, f.away_team_crest)):
            if name and (name not in crest_map or (crest_map[name] is None and crest)):
                crest_map[name] = crest

    bracket_result = await db.execute(
        select(BracketPrediction).where(
            BracketPrediction.user_id.in_([m.user_id for m in members])
        )
    )
    bracket_map = {b.user_id: b for b in bracket_result.scalars()}

    def _team(name: str) -> BracketTeam:
        return BracketTeam(name=name, crest=crest_map.get(name))

    rows = []
    for m in members:
        b = bracket_map.get(m.user_id)
        if b is None:
            rows.append(MemberSemiPredictionOut(
                user_id=m.user_id,
                username=_display_name(m.user),
                has_prediction=False,
            ))
        else:
            rows.append(MemberSemiPredictionOut(
                user_id=m.user_id,
                username=_display_name(m.user),
                has_prediction=True,
                semi1_a=_team(b.semi1_a),
                semi1_b=_team(b.semi1_b),
                semi2_a=_team(b.semi2_a),
                semi2_b=_team(b.semi2_b),
            ))
    return rows


@router.get("/{league_id}/bracket/{target_user_id}", response_model=BracketPredictionOut)
async def league_member_bracket(
    league_id: str,
    target_user_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Full bracket prediction for a specific league member. Caller must be a league member;
    target must also be a member. Returns 403 if caller is not a member, 404 if target has
    no bracket or is not a member."""
    # Verify caller is a member
    caller_membership = await db.execute(
        select(LeagueMember).where(LeagueMember.user_id == user.id, LeagueMember.league_id == league_id)
    )
    if not caller_membership.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this league")

    # Verify target is a member
    target_membership = await db.execute(
        select(LeagueMember).where(LeagueMember.user_id == target_user_id, LeagueMember.league_id == league_id)
    )
    if not target_membership.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Target user is not a member of this league")

    bracket = (await db.execute(
        select(BracketPrediction).where(BracketPrediction.user_id == target_user_id)
    )).scalar_one_or_none()
    if not bracket:
        raise HTTPException(status_code=404, detail="No bracket found for this user")

    return bracket
