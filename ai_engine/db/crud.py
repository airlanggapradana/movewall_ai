"""
CRUD operations for all database models.

Provides both async (for FastAPI) and sync (for game loop) variants.
"""

from datetime import datetime
from typing import Optional

from passlib.context import CryptContext
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session as SyncSession

from ai_engine.db.models import (
    Child,
    Game,
    GameType,
    Session,
    SessionResult,
    SessionStatus,
    User,
    UserRole,
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ══════════════════════════════════════════════
#  USER CRUD
# ══════════════════════════════════════════════
async def create_user(
    db: AsyncSession,
    name: str,
    email: str,
    password: str,
    role: UserRole = UserRole.THERAPIST,
) -> User:
    """Create a new user with hashed password."""
    user = User(
        name=name,
        email=email,
        password_hash=pwd_context.hash(password),
        role=role,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    """Retrieve a user by email address."""
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: str) -> Optional[User]:
    """Retrieve a user by ID."""
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


# ══════════════════════════════════════════════
#  CHILD CRUD
# ══════════════════════════════════════════════
async def create_child(db: AsyncSession, **kwargs) -> Child:
    """Create a new child record."""
    child = Child(**kwargs)
    db.add(child)
    await db.flush()
    await db.refresh(child)
    return child


async def get_child(db: AsyncSession, child_id: str) -> Optional[Child]:
    """Retrieve a child by ID."""
    result = await db.execute(select(Child).where(Child.id == child_id))
    return result.scalar_one_or_none()


async def get_all_children(
    db: AsyncSession, skip: int = 0, limit: int = 100, active_only: bool = True,
) -> list[Child]:
    """Retrieve all children with pagination."""
    query = select(Child)
    if active_only:
        query = query.where(Child.is_active == True)  # noqa: E712
    query = query.offset(skip).limit(limit).order_by(Child.name)
    result = await db.execute(query)
    return list(result.scalars().all())


async def update_child(db: AsyncSession, child_id: str, **kwargs) -> Optional[Child]:
    """Update a child record."""
    child = await get_child(db, child_id)
    if not child:
        return None
    for key, value in kwargs.items():
        if hasattr(child, key) and value is not None:
            setattr(child, key, value)
    child.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(child)
    return child


async def delete_child(db: AsyncSession, child_id: str) -> bool:
    """Soft-delete a child by setting is_active = False."""
    child = await get_child(db, child_id)
    if not child:
        return False
    child.is_active = False
    child.updated_at = datetime.utcnow()
    await db.flush()
    return True


# ══════════════════════════════════════════════
#  GAME CRUD
# ══════════════════════════════════════════════
async def create_game(db: AsyncSession, **kwargs) -> Game:
    """Create a new game configuration."""
    game = Game(**kwargs)
    db.add(game)
    await db.flush()
    await db.refresh(game)
    return game


async def get_game(db: AsyncSession, game_id: str) -> Optional[Game]:
    """Retrieve a game by ID."""
    result = await db.execute(select(Game).where(Game.id == game_id))
    return result.scalar_one_or_none()


async def get_all_games(
    db: AsyncSession, game_type: Optional[GameType] = None,
) -> list[Game]:
    """Retrieve all games, optionally filtered by type."""
    query = select(Game).where(Game.is_active == True)  # noqa: E712
    if game_type:
        query = query.where(Game.type == game_type)
    query = query.order_by(Game.type, Game.stage)
    result = await db.execute(query)
    return list(result.scalars().all())


# ══════════════════════════════════════════════
#  SESSION CRUD
# ══════════════════════════════════════════════
async def create_session(db: AsyncSession, **kwargs) -> Session:
    """Create a new therapy session."""
    session = Session(**kwargs)
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return session


async def get_session(db: AsyncSession, session_id: str) -> Optional[Session]:
    """Retrieve a session by ID."""
    result = await db.execute(select(Session).where(Session.id == session_id))
    return result.scalar_one_or_none()


async def update_session(db: AsyncSession, session_id: str, **kwargs) -> Optional[Session]:
    """Update a session record."""
    session = await get_session(db, session_id)
    if not session:
        return None
    for key, value in kwargs.items():
        if hasattr(session, key) and value is not None:
            setattr(session, key, value)
    await db.flush()
    await db.refresh(session)
    return session


async def get_session_history(
    db: AsyncSession,
    child_id: Optional[str] = None,
    therapist_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> list[Session]:
    """Retrieve session history with optional filters."""
    query = select(Session)
    if child_id:
        query = query.where(Session.child_id == child_id)
    if therapist_id:
        query = query.where(Session.therapist_id == therapist_id)
    query = query.order_by(Session.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


# ══════════════════════════════════════════════
#  SESSION RESULT CRUD
# ══════════════════════════════════════════════
async def create_session_result(db: AsyncSession, **kwargs) -> SessionResult:
    """Create a new session result (individual hit)."""
    result_obj = SessionResult(**kwargs)
    db.add(result_obj)
    await db.flush()
    await db.refresh(result_obj)
    return result_obj


async def get_session_results(db: AsyncSession, session_id: str) -> list[SessionResult]:
    """Retrieve all results for a session."""
    result = await db.execute(
        select(SessionResult)
        .where(SessionResult.session_id == session_id)
        .order_by(SessionResult.timestamp)
    )
    return list(result.scalars().all())


# ══════════════════════════════════════════════
#  SYNC VARIANTS (for game loop thread)
# ══════════════════════════════════════════════
def create_session_result_sync(db: SyncSession, **kwargs) -> SessionResult:
    """Create a session result synchronously (used from the game loop)."""
    result_obj = SessionResult(**kwargs)
    db.add(result_obj)
    db.flush()
    db.refresh(result_obj)
    return result_obj


def update_session_sync(db: SyncSession, session_id: str, **kwargs) -> Optional[Session]:
    """Update a session synchronously."""
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        return None
    for key, value in kwargs.items():
        if hasattr(session, key) and value is not None:
            setattr(session, key, value)
    db.flush()
    db.refresh(session)
    return session


# ══════════════════════════════════════════════
#  ANALYTICS HELPERS
# ══════════════════════════════════════════════
async def get_child_session_count(db: AsyncSession, child_id: str) -> int:
    """Count total sessions for a child."""
    result = await db.execute(
        select(func.count(Session.id)).where(Session.child_id == child_id)
    )
    return result.scalar_one()


async def get_child_avg_accuracy(db: AsyncSession, child_id: str) -> Optional[float]:
    """Get average accuracy across all sessions for a child."""
    result = await db.execute(
        select(func.avg(Session.accuracy))
        .where(Session.child_id == child_id)
        .where(Session.status == SessionStatus.FINISHED)
    )
    return result.scalar_one()


async def get_child_avg_reaction_time(db: AsyncSession, child_id: str) -> Optional[float]:
    """Get average reaction time across all session results for a child."""
    result = await db.execute(
        select(func.avg(SessionResult.reaction_time))
        .join(Session, SessionResult.session_id == Session.id)
        .where(Session.child_id == child_id)
        .where(SessionResult.success == True)  # noqa: E712
    )
    return result.scalar_one()


# ══════════════════════════════════════════════
#  SEED DATA
# ══════════════════════════════════════════════
async def seed_default_admin(db: AsyncSession) -> None:
    """Create a default admin account if none exists."""
    existing = await get_user_by_email(db, "admin@smartwall.local")
    if not existing:
        await create_user(
            db,
            name="Administrator",
            email="admin@smartwall.local",
            password="admin123",
            role=UserRole.ADMIN,
        )
        await db.commit()


async def seed_default_games(db: AsyncSession) -> None:
    """Create default game configurations if none exist."""
    existing = await get_all_games(db)
    if existing:
        return

    for stage in range(1, 4):
        await create_game(
            db,
            type=GameType.NUMBER,
            stage=stage,
            duration=120,
            difficulty=stage,
            description=f"Number Game — Stage {stage}",
        )
    await db.commit()
