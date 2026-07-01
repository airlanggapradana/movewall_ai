"""
Pydantic schemas for FastAPI request/response validation.

All API request bodies and response models are defined here.
Uses Pydantic v2 syntax.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


# ══════════════════════════════════════════════
#  AUTH
# ══════════════════════════════════════════════
class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    name: str
    role: str


# ══════════════════════════════════════════════
#  USER
# ══════════════════════════════════════════════
class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    is_active: bool
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
#  CHILD
# ══════════════════════════════════════════════
class ChildCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    age: int = Field(ge=1, le=18)
    gender: str = Field(pattern=r"^(male|female|other)$")
    diagnosis: Optional[str] = None
    therapy_notes: Optional[str] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None


class ChildUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    age: Optional[int] = Field(None, ge=1, le=18)
    gender: Optional[str] = Field(None, pattern=r"^(male|female|other)$")
    diagnosis: Optional[str] = None
    therapy_notes: Optional[str] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None


class ChildResponse(BaseModel):
    id: str
    name: str
    age: int
    gender: str
    diagnosis: Optional[str] = None
    therapy_notes: Optional[str] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
#  GAME
# ══════════════════════════════════════════════
class GameCreate(BaseModel):
    type: str = Field(pattern=r"^(number|letter|color|shape)$")
    stage: int = Field(ge=1, le=10)
    duration: int = Field(ge=30, le=600, default=120)
    difficulty: int = Field(ge=1, le=3, default=1)
    description: Optional[str] = None


class GameResponse(BaseModel):
    id: str
    type: str
    stage: int
    duration: int
    difficulty: int
    description: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
#  SESSION
# ══════════════════════════════════════════════
class SessionStartRequest(BaseModel):
    child_id: str
    game_id: Optional[str] = None
    game_type: str = Field(default="number", pattern=r"^(number|letter|color|shape)$")
    stage: int = Field(ge=1, le=10, default=1)
    difficulty: int = Field(ge=1, le=3, default=1)
    duration: int = Field(ge=30, le=600, default=120)


class SessionResponse(BaseModel):
    id: str
    child_id: str
    therapist_id: str
    game_id: Optional[str] = None
    status: str
    duration: Optional[int] = None
    total_score: int = 0
    accuracy: float = 0.0
    max_combo: int = 0
    total_hits: int = 0
    total_mistakes: int = 0
    avg_reaction_time: Optional[float] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class SessionResultResponse(BaseModel):
    id: str
    session_id: str
    target: str
    body_part: Optional[str] = None
    reaction_time: Optional[float] = None
    success: bool
    timestamp: Optional[datetime] = None

    model_config = {"from_attributes": True}


class SessionDetailResponse(BaseModel):
    session: SessionResponse
    results: list[SessionResultResponse] = []
    child: Optional[ChildResponse] = None


# ══════════════════════════════════════════════
#  ANALYTICS
# ══════════════════════════════════════════════
class ChildProgressResponse(BaseModel):
    child_id: str
    total_sessions: int = 0
    completed_sessions: int = 0
    latest_accuracy: float = 0.0
    latest_avg_reaction_time: float = 0.0
    latest_score: int = 0
    avg_accuracy: float = 0.0
    avg_reaction_time: float = 0.0
    avg_score: float = 0.0
    accuracy_improvement: float = 0.0
    reaction_time_improvement: float = 0.0
    score_improvement: float = 0.0
    accuracy_history: list[float] = []
    reaction_time_history: list[float] = []
    score_history: list[int] = []
    session_dates: list[str] = []


# ══════════════════════════════════════════════
#  GENERIC
# ══════════════════════════════════════════════
class MessageResponse(BaseModel):
    message: str
    success: bool = True


class ErrorResponse(BaseModel):
    detail: str
    success: bool = False
