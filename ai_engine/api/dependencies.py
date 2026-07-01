"""
FastAPI dependencies — authentication, database session, and role-based access.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from ai_engine.config import JWT_ALGORITHM, JWT_EXPIRY_MINUTES, JWT_SECRET
from ai_engine.db.database import get_async_db
from ai_engine.db.models import User, UserRole

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)


# ──────────────────────────────────────────────
# JWT Token Utilities
# ──────────────────────────────────────────────
def create_access_token(user_id: str, role: str) -> str:
    """Create a JWT access token."""
    expires = datetime.utcnow() + timedelta(minutes=JWT_EXPIRY_MINUTES)
    payload = {
        "sub": user_id,
        "role": role,
        "exp": expires,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode and validate a JWT token. Raises HTTPException on failure."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {e}",
        )


# ──────────────────────────────────────────────
# FastAPI Dependencies
# ──────────────────────────────────────────────
async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_async_db),
) -> User:
    """
    Dependency that extracts and validates the current user from JWT token.

    Raises 401 if token is missing or invalid.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    payload = decode_access_token(credentials.credentials)
    user_id = payload.get("sub")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    from ai_engine.db.crud import get_user_by_id
    user = await get_user_by_id(db, user_id)

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return user


async def get_current_therapist(
    user: User = Depends(get_current_user),
) -> User:
    """Dependency that requires the user to be a therapist or admin."""
    if user.role not in (UserRole.THERAPIST, UserRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Therapist or Admin access required",
        )
    return user


async def get_current_admin(
    user: User = Depends(get_current_user),
) -> User:
    """Dependency that requires the user to be an admin."""
    if user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
