"""
Child management routes — CRUD operations for children.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ai_engine.api.dependencies import get_current_therapist
from ai_engine.api.schemas import (
    ChildCreate,
    ChildProgressResponse,
    ChildResponse,
    ChildUpdate,
    MessageResponse,
)
from ai_engine.core.analytics_engine import AnalyticsEngine
from ai_engine.db import crud
from ai_engine.db.database import get_async_db
from ai_engine.db.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/children", tags=["Children"])


@router.get("", response_model=list[ChildResponse])
async def list_children(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_async_db),
    _user: User = Depends(get_current_therapist),
):
    """List all active children."""
    children = await crud.get_all_children(db, skip=skip, limit=limit)
    return children


@router.post("", response_model=ChildResponse, status_code=status.HTTP_201_CREATED)
async def create_child(
    data: ChildCreate,
    db: AsyncSession = Depends(get_async_db),
    _user: User = Depends(get_current_therapist),
):
    """Create a new child record."""
    child = await crud.create_child(db, **data.model_dump())
    logger.info(f"Child created: {child.name} (id={child.id})")
    return child


@router.get("/{child_id}", response_model=ChildResponse)
async def get_child(
    child_id: str,
    db: AsyncSession = Depends(get_async_db),
    _user: User = Depends(get_current_therapist),
):
    """Get a child by ID."""
    child = await crud.get_child(db, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    return child


@router.put("/{child_id}", response_model=ChildResponse)
async def update_child(
    child_id: str,
    data: ChildUpdate,
    db: AsyncSession = Depends(get_async_db),
    _user: User = Depends(get_current_therapist),
):
    """Update a child record."""
    child = await crud.update_child(
        db, child_id, **data.model_dump(exclude_unset=True),
    )
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    logger.info(f"Child updated: {child.name} (id={child.id})")
    return child


@router.delete("/{child_id}", response_model=MessageResponse)
async def delete_child(
    child_id: str,
    db: AsyncSession = Depends(get_async_db),
    _user: User = Depends(get_current_therapist),
):
    """Soft-delete a child (sets is_active = False)."""
    deleted = await crud.delete_child(db, child_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Child not found")
    logger.info(f"Child soft-deleted: {child_id}")
    return MessageResponse(message="Child deleted successfully")


@router.get("/{child_id}/progress", response_model=ChildProgressResponse)
async def get_child_progress(
    child_id: str,
    db: AsyncSession = Depends(get_async_db),
    _user: User = Depends(get_current_therapist),
):
    """Get progress report for a child."""
    child = await crud.get_child(db, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    report = await AnalyticsEngine.calculate_child_progress(db, child_id)

    return ChildProgressResponse(
        child_id=report.child_id,
        total_sessions=report.total_sessions,
        completed_sessions=report.completed_sessions,
        latest_accuracy=report.latest_accuracy,
        latest_avg_reaction_time=report.latest_avg_reaction_time,
        latest_score=report.latest_score,
        avg_accuracy=report.avg_accuracy,
        avg_reaction_time=report.avg_reaction_time,
        avg_score=report.avg_score,
        accuracy_improvement=report.accuracy_improvement,
        reaction_time_improvement=report.reaction_time_improvement,
        score_improvement=report.score_improvement,
        accuracy_history=report.accuracy_history,
        reaction_time_history=report.reaction_time_history,
        score_history=report.score_history,
        session_dates=report.session_dates,
    )
