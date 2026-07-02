"""
Database connection and session management.

Uses SQLAlchemy with asyncpg (PostgreSQL) for non-blocking database
operations alongside FastAPI async endpoints. A synchronous psycopg2
engine is also provided for the game loop thread.
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

from ai_engine.config import DATABASE_URL, DATABASE_URL_SYNC


# ──────────────────────────────────────────────
# Base Model
# ──────────────────────────────────────────────
class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""
    pass


# ──────────────────────────────────────────────
# Async Engine (for FastAPI endpoints)
# ──────────────────────────────────────────────
async_engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    # NullPool is recommended for asyncpg to avoid connection pool conflicts
    # when running alongside a sync engine in the same process.
    poolclass=NullPool,
)

AsyncSessionLocal = sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ──────────────────────────────────────────────
# Sync Engine (for game loop thread & CLI)
# ──────────────────────────────────────────────
sync_engine = create_engine(
    DATABASE_URL_SYNC,
    echo=False,
    future=True,
    pool_pre_ping=True,  # Verify connections are alive before use
)

SyncSessionLocal = sessionmaker(
    bind=sync_engine,
    expire_on_commit=False,
)


# ──────────────────────────────────────────────
# Dependency — FastAPI
# ──────────────────────────────────────────────
async def get_async_db():
    """FastAPI dependency that yields an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def get_sync_db():
    """Get a synchronous database session (for game loop / CLI)."""
    session = SyncSessionLocal()
    try:
        return session
    except Exception:
        session.rollback()
        raise


# ──────────────────────────────────────────────
# Initialization
# ──────────────────────────────────────────────
async def init_db():
    """Create all database tables if they don't exist."""
    # Import models so they register with Base.metadata
    import ai_engine.db.models  # noqa: F401

    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


def init_db_sync():
    """Create all database tables synchronously."""
    import ai_engine.db.models  # noqa: F401

    Base.metadata.create_all(bind=sync_engine)


async def close_db():
    """Dispose of the async engine connections."""
    await async_engine.dispose()
