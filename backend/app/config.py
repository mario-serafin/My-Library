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

    model_config = {"env_file": ".env"}


settings = Settings()
