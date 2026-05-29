import uuid
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.config import settings
from app.database import get_db
from app.models import User
from app.schemas import Token, UserLogin, UserOut, UserRegister

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/join", response_model=Token)
async def quick_join(username: str, db: AsyncSession = Depends(get_db)):
    """Login-free entry: create or re-join by username only."""
    username = username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username cannot be empty")

    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()

    if not user:
        count = await db.execute(select(func.count()).select_from(User))
        is_first = count.scalar() == 0
        user = User(
            id=str(uuid.uuid4()),
            username=username,
            email=f"{username.lower().replace(' ', '_')}@local",
            is_admin=is_first,
        )
        db.add(user)
        await db.commit()

    return Token(access_token=create_access_token(user.id))


@router.post("/register", response_model=Token)
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        select(User).where((User.email == data.email) | (User.username == data.username))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email or username already taken")

    count = await db.execute(select(func.count()).select_from(User))
    is_first = count.scalar() == 0

    user = User(
        id=str(uuid.uuid4()),
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        is_admin=is_first,
    )
    db.add(user)
    await db.commit()
    return Token(access_token=create_access_token(user.id))


@router.post("/login", response_model=Token)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return Token(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user


@router.get("/google")
async def google_login():
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google OAuth not configured")
    params = urlencode({
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
    })
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/google/callback")
async def google_callback(code: str, db: AsyncSession = Depends(get_db)):
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        token_data = token_resp.json()
        if "error" in token_data:
            raise HTTPException(status_code=400, detail=token_data["error"])

        userinfo_resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        userinfo = userinfo_resp.json()

    google_id = userinfo["sub"]
    email = userinfo["email"]
    name = userinfo.get("name", email.split("@")[0])

    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()

    if not user:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            user.google_id = google_id
        else:
            base = name.replace(" ", "_").lower()[:45]
            username = base
            counter = 1
            while True:
                taken = await db.execute(select(User).where(User.username == username))
                if not taken.scalar_one_or_none():
                    break
                username = f"{base}_{counter}"
                counter += 1

            count = await db.execute(select(func.count()).select_from(User))
            is_first = count.scalar() == 0

            user = User(
                id=str(uuid.uuid4()),
                username=username,
                email=email,
                google_id=google_id,
                is_admin=is_first,
            )
            db.add(user)

    await db.commit()
    await db.refresh(user)
    token = create_access_token(user.id)
    return RedirectResponse(f"{settings.FRONTEND_URL}/auth/callback?token={token}")
