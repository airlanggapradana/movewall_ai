"""
Game management routes — list and create game configurations.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ai_engine.api.dependencies import get_current_therapist
from ai_engine.api.schemas import GameCreate, GameResponse
from ai_engine.db import crud
from ai_engine.db.database import get_async_db
from ai_engine.db.models import GameType, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/games", tags=["Games"])


@router.get("", response_model=list[GameResponse])
async def list_games(
    game_type: Optional[str] = Query(None, pattern=r"^(number|letter|color|shape)$"),
    db: AsyncSession = Depends(get_async_db),
    _user: User = Depends(get_current_therapist),
):
    """List all available game configurations."""
    type_enum = GameType(game_type) if game_type else None
    games = await crud.get_all_games(db, game_type=type_enum)
    return games


@router.post("", response_model=GameResponse, status_code=201)
async def create_game(
    data: GameCreate,
    db: AsyncSession = Depends(get_async_db),
    _user: User = Depends(get_current_therapist),
):
    """Create a new game configuration."""
    game = await crud.create_game(
        db,
        type=GameType(data.type),
        stage=data.stage,
        duration=data.duration,
        difficulty=data.difficulty,
        description=data.description,
    )
    await db.commit()
    logger.info(f"Game created: {game.type.value} stage {game.stage}")
    return game
