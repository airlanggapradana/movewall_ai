"""
Database connection and session management.

Uses SQLAlchemy with async SQLite (aiosqlite) for non-blocking database operations
alongside the FastAPI async endpoints. A synchronous engine is also provided for
use in synchronous contexts (e.g., game loop thread).
"""

from sqlalchemy import create_engine, event
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

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
)


def _enable_sqlite_fk(dbapi_conn, connection_record):
    """Enable foreign key enforcement for SQLite connections."""
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


event.listen(sync_engine, "connect", _enable_sqlite_fk)


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
