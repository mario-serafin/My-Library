from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://library:library@db:5432/library"
    SYNC_DATABASE_URL: str = "postgresql+psycopg2://library:library@db:5432/library"
    REDIS_URL: str = "redis://redis:6379/0"
    SECRET_KEY: str = "supersecretkey-change-in-production-32chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    UPLOAD_DIR: str = "/app/uploads"
    ADMIN_PASSWORD: str = "admin"
    CORS_ORIGINS: str = "*"
    GEMINI_API_KEY: str = ""
    GOOGLE_BOOKS_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # Fallback AI when Gemini is rate limited (needs an Anthropic API key
    # from console.anthropic.com — the Claude Pro subscription alone is NOT enough)
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-haiku-4-5-20251001"

    # Hard cap for any AI rate-limit cooldown (seconds). Prevents absurd waits.
    AI_MAX_COOLDOWN: int = 3600

    model_config = {"env_file": ".env"}


settings = Settings()
