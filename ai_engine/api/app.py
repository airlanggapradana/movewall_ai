"""
FastAPI application setup.

Creates the FastAPI app, configures CORS, includes all routers,
and sets up startup/shutdown lifecycle events.
"""

import asyncio
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ai_engine.api.routes import auth, children, games, sessions
from ai_engine.api.websocket import router as ws_router, ws_manager
from ai_engine.config import API_CORS_ORIGINS
from ai_engine.db.crud import seed_default_admin, seed_default_games
from ai_engine.db.database import AsyncSessionLocal, close_db, init_db

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# Create FastAPI App
# ──────────────────────────────────────────────
app = FastAPI(
    title="Smart Wall Climbing — AI Engine API",
    description=(
        "REST API and WebSocket server for the Smart Wall Climbing "
        "interactive therapy system. Provides endpoints for authentication, "
        "child management, session control, game configuration, "
        "and real-time pose/game data."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ──────────────────────────────────────────────
# CORS Middleware
# ──────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=API_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────
# Include Routers
# ──────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(children.router)
app.include_router(sessions.router)
app.include_router(games.router)
app.include_router(ws_router)

# ──────────────────────────────────────────────
# Background task reference
# ──────────────────────────────────────────────
_ws_task = None


# ──────────────────────────────────────────────
# Lifecycle Events
# ──────────────────────────────────────────────
@app.on_event("startup")
async def on_startup():
    """Initialize database and seed default data on server startup."""
    global _ws_task

    logger.info("Starting Smart Wall Climbing API server...")

    # Initialize database
    await init_db()
    logger.info("Database initialized.")

    # Seed default data
    async with AsyncSessionLocal() as db:
        await seed_default_admin(db)
        await seed_default_games(db)
    logger.info("Default data seeded.")

    # Start WebSocket event queue processor
    _ws_task = asyncio.create_task(ws_manager.process_event_queue())
    logger.info("WebSocket event processor started.")

    logger.info("API server ready!")


@app.on_event("shutdown")
async def on_shutdown():
    """Clean up on server shutdown."""
    global _ws_task

    if _ws_task:
        _ws_task.cancel()

    await close_db()
    logger.info("API server shut down.")


# ──────────────────────────────────────────────
# Health Check
# ──────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "Smart Wall Climbing AI Engine",
        "version": "1.0.0",
        "websocket_clients": ws_manager.client_count,
    }
