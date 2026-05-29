from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    FOOTBALL_API_KEY: str = ""
    FOOTBALL_API_BASE: str = "https://api.football-data.org/v4"

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/auth/google/callback"

    FRONTEND_URL: str = "http://localhost:5173"

    DATABASE_URL: str = "sqlite+aiosqlite:///./footy_preds.db"

    class Config:
        env_file = ".env"


settings = Settings()
