"""
Authentication routes — login and logout.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ai_engine.api.dependencies import create_access_token, get_current_user
from ai_engine.api.schemas import LoginRequest, LoginResponse, MessageResponse
from ai_engine.db.crud import get_user_by_email, verify_password
from ai_engine.db.database import get_async_db
from ai_engine.db.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_async_db),
):
    """Authenticate user and return JWT token."""
    user = await get_user_by_email(db, request.email)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not await verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    token = create_access_token(user.id, user.role.value)

    logger.info(f"User logged in: {user.email} ({user.role.value})")

    return LoginResponse(
        access_token=token,
        user_id=user.id,
        name=user.name,
        role=user.role.value,
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(
    current_user: User = Depends(get_current_user),
):
    """
    Logout the current user.

    Note: With JWT, true server-side invalidation requires a token blacklist.
    For MVP, the client simply discards the token.
    """
    logger.info(f"User logged out: {current_user.email}")
    return MessageResponse(message="Logged out successfully")
