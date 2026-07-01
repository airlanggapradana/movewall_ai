"""
Session routes — start, pause, resume, end, and history.
"""

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ai_engine.api.dependencies import get_current_therapist
from ai_engine.api.schemas import (
    ChildResponse,
    MessageResponse,
    SessionDetailResponse,
    SessionResponse,
    SessionResultResponse,
    SessionStartRequest,
)
from ai_engine.db import crud
from ai_engine.db.database import get_async_db
from ai_engine.db.models import SessionStatus, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/session", tags=["Sessions"])

# Reference to the game engine (injected at app startup)
_game_engine = None


def set_game_engine(engine) -> None:
    """Set the game engine reference (called from app.py on startup)."""
    global _game_engine
    _game_engine = engine


@router.post("/start", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def start_session(
    request: SessionStartRequest,
    db: AsyncSession = Depends(get_async_db),
    user: User = Depends(get_current_therapist),
):
    """Start a new therapy session."""
    # Validate child exists
    child = await crud.get_child(db, request.child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    # Create session in database
    session = await crud.create_session(
        db,
        child_id=request.child_id,
        therapist_id=user.id,
        game_id=request.game_id,
        status=SessionStatus.IDLE,
    )
    await db.commit()

    # Start game engine session
    if _game_engine:
        from ai_engine.game.session_manager import SessionConfig
        config = SessionConfig(
            child_id=request.child_id,
            child_name=child.name,
            therapist_id=user.id,
            game_type=request.game_type,
            stage=request.stage,
            difficulty=request.difficulty,
            duration=request.duration,
        )
        started = _game_engine.start_session(session.id, config)
        if not started:
            raise HTTPException(
                status_code=500, detail="Failed to start game engine session",
            )

        # Update session status
        await crud.update_session(
            db, session.id,
            status=SessionStatus.PLAYING,
            started_at=datetime.utcnow(),
        )
        await db.commit()
        await db.refresh(session)

    logger.info(f"Session started: {session.id} for child {child.name}")
    return session


@router.post("/{session_id}/pause", response_model=MessageResponse)
async def pause_session(
    session_id: str,
    db: AsyncSession = Depends(get_async_db),
    _user: User = Depends(get_current_therapist),
):
    """Pause an active session."""
    session = await crud.get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if _game_engine:
        if not _game_engine.pause_session():
            raise HTTPException(status_code=400, detail="Cannot pause session")

    await crud.update_session(db, session_id, status=SessionStatus.PAUSED)
    await db.commit()

    return MessageResponse(message="Session paused")


@router.post("/{session_id}/resume", response_model=MessageResponse)
async def resume_session(
    session_id: str,
    db: AsyncSession = Depends(get_async_db),
    _user: User = Depends(get_current_therapist),
):
    """Resume a paused session."""
    session = await crud.get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if _game_engine:
        if not _game_engine.resume_session():
            raise HTTPException(status_code=400, detail="Cannot resume session")

    await crud.update_session(db, session_id, status=SessionStatus.PLAYING)
    await db.commit()

    return MessageResponse(message="Session resumed")


@router.post("/{session_id}/end", response_model=SessionResponse)
async def end_session(
    session_id: str,
    db: AsyncSession = Depends(get_async_db),
    _user: User = Depends(get_current_therapist),
):
    """End an active session and save results."""
    session = await crud.get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    results_data = {}
    if _game_engine:
        results_data = _game_engine.stop_session()

    # Save summary to session
    await crud.update_session(
        db,
        session_id,
        status=SessionStatus.FINISHED,
        finished_at=datetime.utcnow(),
        duration=results_data.get("duration", 0),
        total_score=results_data.get("total_score", 0),
        accuracy=results_data.get("accuracy", 0.0),
        max_combo=results_data.get("max_combo", 0),
        total_hits=results_data.get("total_hits", 0),
        total_mistakes=results_data.get("total_mistakes", 0),
        avg_reaction_time=results_data.get("avg_reaction_time"),
    )

    # Save individual hit records
    for hit in results_data.get("hit_records", []):
        await crud.create_session_result(
            db,
            session_id=session_id,
            target=hit["target"],
            body_part=hit.get("body_part"),
            reaction_time=hit.get("reaction_time"),
            success=hit["correct"],
        )

    await db.commit()
    await db.refresh(session)

    logger.info(
        f"Session ended: {session_id}, score={results_data.get('total_score', 0)}"
    )
    return session


@router.get("/history", response_model=list[SessionResponse])
async def get_session_history(
    child_id: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_async_db),
    user: User = Depends(get_current_therapist),
):
    """Get session history, optionally filtered by child."""
    sessions = await crud.get_session_history(
        db,
        child_id=child_id,
        therapist_id=None,  # All therapists can see all sessions
        skip=skip,
        limit=limit,
    )
    return sessions


@router.get("/{session_id}", response_model=SessionDetailResponse)
async def get_session_detail(
    session_id: str,
    db: AsyncSession = Depends(get_async_db),
    _user: User = Depends(get_current_therapist),
):
    """Get detailed session info including all hit results."""
    session = await crud.get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    results = await crud.get_session_results(db, session_id)
    child = await crud.get_child(db, session.child_id)

    return SessionDetailResponse(
        session=SessionResponse.model_validate(session),
        results=[SessionResultResponse.model_validate(r) for r in results],
        child=ChildResponse.model_validate(child) if child else None,
    )
