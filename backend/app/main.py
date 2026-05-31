from contextlib import asynccontextmanager
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.config import settings
from app.database import engine, Base, async_session_maker
from app.models import User, UserRole, Section
from app.services.auth import get_password_hash
from app.services.section_assignment import DEFAULT_SECTIONS
from app.routers import auth, books, sections, tasks, users

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def _migrate():
    """Add columns that may not exist on older DB schemas."""
    async with engine.begin() as conn:
        await conn.execute(text(
            "ALTER TABLE sections ADD COLUMN IF NOT EXISTS "
            "is_system BOOLEAN NOT NULL DEFAULT false"
        ))


async def _create_default_admin():
    from sqlalchemy import select
    async with async_session_maker() as db:
        result = await db.execute(select(User).where(User.username == "admin"))
        admin = result.scalar_one_or_none()
        if not admin:
            admin = User(
                username="admin",
                hashed_password=get_password_hash(settings.ADMIN_PASSWORD),
                role=UserRole.admin,
                is_active=True,
            )
            db.add(admin)
            logger.info("Created default admin user")
        else:
            admin.hashed_password = get_password_hash(settings.ADMIN_PASSWORD)
            logger.info("Synced admin password from ADMIN_PASSWORD env var")
        await db.commit()


async def _seed_default_sections():
    """Create fixed system sections if they don't exist yet."""
    from sqlalchemy import select
    async with async_session_maker() as db:
        for s in DEFAULT_SECTIONS:
            result = await db.execute(select(Section).where(Section.name == s["name"]))
            if not result.scalar_one_or_none():
                db.add(Section(
                    name=s["name"],
                    description=s["description"],
                    genres=s["genres"],
                    is_system=True,
                ))
                logger.info("Seeded system section: %s", s["name"])
        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _migrate()
    await _create_default_admin()
    await _seed_default_sections()
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    yield
    await engine.dispose()


app = FastAPI(title="My Library", lifespan=lifespan)

origins = settings.CORS_ORIGINS.split(",") if settings.CORS_ORIGINS != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(books.router)
app.include_router(sections.router)
app.include_router(tasks.router)
app.include_router(users.router)

app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")
