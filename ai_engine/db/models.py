"""
SQLAlchemy ORM models for Smart Wall Climbing.

Tables:
  - User       (admin / therapist accounts)
  - Child      (children receiving therapy)
  - Game       (game configurations)
  - Session    (therapy sessions)
  - SessionResult (individual hit results within a session)
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from ai_engine.db.database import Base


# ──────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────
class UserRole(str, enum.Enum):
    ADMIN = "admin"
    THERAPIST = "therapist"


class Gender(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class GameType(str, enum.Enum):
    NUMBER = "number"
    LETTER = "letter"
    COLOR = "color"
    SHAPE = "shape"


class SessionStatus(str, enum.Enum):
    IDLE = "idle"
    COUNTDOWN = "countdown"
    PLAYING = "playing"
    PAUSED = "paused"
    FINISHED = "finished"


# ──────────────────────────────────────────────
# Helper
# ──────────────────────────────────────────────
def _generate_uuid() -> str:
    return str(uuid.uuid4())


# ──────────────────────────────────────────────
# Models
# ──────────────────────────────────────────────
class User(Base):
    """Admin or Therapist account."""

    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=_generate_uuid)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.THERAPIST)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    sessions = relationship("Session", back_populates="therapist", lazy="selectin")

    def __repr__(self) -> str:
        return f"<User {self.name} ({self.role.value})>"


class Child(Base):
    """Child receiving therapy."""

    __tablename__ = "children"

    id = Column(String(36), primary_key=True, default=_generate_uuid)
    name = Column(String(100), nullable=False)
    age = Column(Integer, nullable=False)
    gender = Column(Enum(Gender), nullable=False)
    diagnosis = Column(Text, nullable=True)
    therapy_notes = Column(Text, nullable=True)
    parent_name = Column(String(100), nullable=True)
    parent_phone = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    sessions = relationship("Session", back_populates="child", lazy="selectin")

    def __repr__(self) -> str:
        return f"<Child {self.name}, age {self.age}>"


class Game(Base):
    """Game configuration."""

    __tablename__ = "games"

    id = Column(String(36), primary_key=True, default=_generate_uuid)
    type = Column(Enum(GameType), nullable=False)
    stage = Column(Integer, nullable=False, default=1)
    duration = Column(Integer, nullable=False, default=120)  # seconds
    difficulty = Column(Integer, nullable=False, default=1)   # 1-3
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    sessions = relationship("Session", back_populates="game", lazy="selectin")

    def __repr__(self) -> str:
        return f"<Game {self.type.value} stage={self.stage}>"


class Session(Base):
    """Therapy session linking a child, therapist, and game."""

    __tablename__ = "sessions"

    id = Column(String(36), primary_key=True, default=_generate_uuid)
    child_id = Column(String(36), ForeignKey("children.id"), nullable=False, index=True)
    therapist_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    game_id = Column(String(36), ForeignKey("games.id"), nullable=True, index=True)
    status = Column(Enum(SessionStatus), nullable=False, default=SessionStatus.IDLE)
    duration = Column(Integer, nullable=True)      # actual duration in seconds
    total_score = Column(Integer, default=0)
    accuracy = Column(Float, default=0.0)           # 0.0 – 1.0
    max_combo = Column(Integer, default=0)
    total_hits = Column(Integer, default=0)
    total_mistakes = Column(Integer, default=0)
    avg_reaction_time = Column(Float, nullable=True)  # seconds
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    child = relationship("Child", back_populates="sessions", lazy="selectin")
    therapist = relationship("User", back_populates="sessions", lazy="selectin")
    game = relationship("Game", back_populates="sessions", lazy="selectin")
    results = relationship(
        "SessionResult", back_populates="session", lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Session {self.id[:8]}... status={self.status.value}>"


class SessionResult(Base):
    """Individual hit/attempt result within a session."""

    __tablename__ = "session_results"

    id = Column(String(36), primary_key=True, default=_generate_uuid)
    session_id = Column(
        String(36), ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    target = Column(String(50), nullable=False)         # e.g. "5", "A", "red"
    body_part = Column(String(20), nullable=True)       # e.g. "leftHand", "rightFoot"
    reaction_time = Column(Float, nullable=True)        # seconds
    success = Column(Boolean, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

    # Relationships
    session = relationship("Session", back_populates="results")

    def __repr__(self) -> str:
        status = "✓" if self.success else "✗"
        return f"<Result {status} target={self.target}>"
