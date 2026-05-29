import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import League, LeagueMember, Prediction, User
from app.schemas import LeagueCreate, LeagueJoin, LeagueOut, LeaderboardEntry, LeagueMemberOut

router = APIRouter(prefix="/leagues", tags=["leagues"])


async def _member_count(db: AsyncSession, league_id: str) -> int:
    result = await db.execute(select(func.count()).where(LeagueMember.league_id == league_id))
    return result.scalar()


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
    return LeagueOut(id=league.id, name=league.name, invite_code=league.invite_code, admin_id=league.admin_id, member_count=1)


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
    return LeagueOut(id=league.id, name=league.name, invite_code=league.invite_code, admin_id=league.admin_id, member_count=count)


@router.get("", response_model=list[LeagueOut])
async def my_leagues(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    memberships = await db.execute(
        select(LeagueMember).where(LeagueMember.user_id == user.id).options(selectinload(LeagueMember.league))
    )
    leagues = []
    for m in memberships.scalars():
        count = await _member_count(db, m.league_id)
        league = m.league
        leagues.append(LeagueOut(id=league.id, name=league.name, invite_code=league.invite_code, admin_id=league.admin_id, member_count=count))
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
    return LeagueOut(id=league.id, name=league.name, invite_code=league.invite_code, admin_id=league.admin_id, member_count=count)


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

    members = await db.execute(
        select(LeagueMember).where(LeagueMember.league_id == league_id).options(selectinload(LeagueMember.user))
    )

    entries = []
    for m in members.scalars():
        preds = await db.execute(select(Prediction).where(Prediction.user_id == m.user_id))
        preds = preds.scalars().all()
        total = sum(p.points or 0 for p in preds)
        scored = sum(1 for p in preds if p.points is not None)
        entries.append(LeaderboardEntry(
            user_id=m.user_id,
            username=m.user.username,
            total_points=total,
            prediction_count=len(preds),
            scored_count=scored,
        ))

    return sorted(entries, key=lambda e: e.total_points, reverse=True)


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
            username=m.user.username,
            joined_at=m.joined_at,
            is_league_admin=(m.user_id == league.admin_id),
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
