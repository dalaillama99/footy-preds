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
    FixturePredictionsOut, LeagueCreate, LeagueJoin, LeagueOut, LeagueSettingsUpdate,
    LeaderboardEntry, LeagueMemberOut, MemberPredictionOut,
)

router = APIRouter(prefix="/leagues", tags=["leagues"])


async def _member_count(db: AsyncSession, league_id: str) -> int:
    result = await db.execute(select(func.count()).where(LeagueMember.league_id == league_id))
    return result.scalar()


def _display_name(user: User) -> str:
    # Real (Google) names are always obscured behind team names; admins see the
    # real name separately via the `real_name` field, not in the main display.
    return user.team_name or user.username


@router.post("", response_model=LeagueOut)
async def create_league(
    data: LeagueCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    league = League(id=str(uuid.uuid4()), name=data.name, admin_id=user.id)
    db.add(league)
    db.add(LeagueMember(id=str(uuid.uuid4()), user_id=user.id, league_id=league.id))
    await db.commit()
    await db.refresh(league)
    return LeagueOut(id=league.id, name=league.name, invite_code=league.invite_code, admin_id=league.admin_id, member_count=1, created_at=league.created_at)


@router.post("/join", response_model=LeagueOut)
async def join_league(
    data: LeagueJoin,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(League).where(League.invite_code == data.invite_code.upper()))
    league = result.scalar_one_or_none()
    if not league:
        raise HTTPException(status_code=404, detail="League not found — check the invite code")

    existing = await db.execute(
        select(LeagueMember).where(LeagueMember.user_id == user.id, LeagueMember.league_id == league.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You're already in this league")

    db.add(LeagueMember(id=str(uuid.uuid4()), user_id=user.id, league_id=league.id))
    await db.commit()
    count = await _member_count(db, league.id)
    return LeagueOut(id=league.id, name=league.name, invite_code=league.invite_code, admin_id=league.admin_id, member_count=count, created_at=league.created_at)


@router.get("", response_model=list[LeagueOut])
async def my_leagues(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    memberships = await db.execute(
        select(LeagueMember).where(LeagueMember.user_id == user.id).options(selectinload(LeagueMember.league))
    )
    leagues = []
    for m in memberships.scalars():
        count = await _member_count(db, m.league_id)
        league = m.league
        leagues.append(LeagueOut(id=league.id, name=league.name, invite_code=league.invite_code, admin_id=league.admin_id, member_count=count, created_at=league.created_at))
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
    return LeagueOut(id=league.id, name=league.name, invite_code=league.invite_code, admin_id=league.admin_id, member_count=count, created_at=league.created_at)


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
    return LeagueOut(id=league.id, name=league.name, invite_code=league.invite_code, admin_id=league.admin_id, member_count=count, created_at=league.created_at)


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
        if bracket is not None and bracket.points is not None:
            bracket_bonus = bracket.points
            total += bracket.points

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
