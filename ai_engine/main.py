"""
Smart Wall Climbing — AI Engine Entry Point.

Runs both the FastAPI server (in a background thread) and the
Pygame game engine (in the main thread).

Usage:
    cd ai_engine
    python main.py

    # Or with options:
    python main.py --no-camera     # Run without camera (for API testing)
    python main.py --windowed      # Run Pygame in windowed mode
    python main.py --api-only      # Run only the FastAPI server
"""

import argparse
import logging
import sys
import threading

import uvicorn

# Ensure the parent directory is on the path so `ai_engine` is importable
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ai_engine.config import API_HOST, API_PORT, FPS_TARGET
from ai_engine.utils.logger import setup_logging

logger = logging.getLogger(__name__)


def run_api_server(host: str, port: int) -> None:
    """Run the FastAPI server with uvicorn (in a thread)."""
    uvicorn.run(
        "ai_engine.api.app:app",
        host=host,
        port=port,
        log_level="warning",
        access_log=False,
    )


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Smart Wall Climbing — AI Engine",
    )
    parser.add_argument(
        "--api-only",
        action="store_true",
        help="Run only the FastAPI server (no game window)",
    )
    parser.add_argument(
        "--windowed",
        action="store_true",
        help="Run Pygame in windowed mode (not fullscreen)",
    )
    parser.add_argument(
        "--no-camera",
        action="store_true",
        help="Run without camera (for API/UI testing)",
    )
    parser.add_argument(
        "--host",
        default=API_HOST,
        help=f"API server host (default: {API_HOST})",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=API_PORT,
        help=f"API server port (default: {API_PORT})",
    )
    args = parser.parse_args()

    # Setup logging
    setup_logging()

    logger.info("=" * 60)
    logger.info("  Smart Wall Climbing — AI Engine v1.0.0")
    logger.info("=" * 60)

    display_host = "127.0.0.1" if args.host == "0.0.0.0" else args.host

    if args.api_only:
        # Run only the API server (useful for development/testing)
        logger.info("Running in API-only mode (no game window)")
        logger.info(f"API server: http://{display_host}:{args.port}")
        logger.info(f"API docs:   http://{display_host}:{args.port}/docs")

        # Initialize database synchronously before starting
        from ai_engine.db.database import init_db_sync
        init_db_sync()

        uvicorn.run(
            "ai_engine.api.app:app",
            host=args.host,
            port=args.port,
            log_level="info",
        )
        return

    # ── Full mode: API Server + Game Engine ──

    # Apply windowed mode if requested
    if args.windowed:
        import ai_engine.config as cfg
        cfg.PROJECTOR_FULLSCREEN = False

    # Initialize database synchronously
    from ai_engine.db.database import init_db_sync
    init_db_sync()
    logger.info("Database initialized.")

    # Start API server in a background thread
    api_thread = threading.Thread(
        target=run_api_server,
        args=(args.host, args.port),
        daemon=True,
        name="api-server",
    )
    api_thread.start()
    logger.info(f"API server started on http://{display_host}:{args.port}")
    logger.info(f"API docs: http://{display_host}:{args.port}/docs")
    logger.info(f"WebSocket: ws://{display_host}:{args.port}/ws/live")

    # Create and initialize the game engine
    from ai_engine.game.engine import GameEngine
    from ai_engine.api.websocket import ws_manager
    from ai_engine.api.routes.sessions import set_game_engine

    game_engine = GameEngine()

    # Connect game engine to WebSocket broadcaster
    game_engine.set_broadcast_callback(ws_manager.broadcast_sync)

    # Register game engine with session routes
    set_game_engine(game_engine)

    # Initialize game engine (camera + Pygame)
    if not game_engine.init():
        logger.error("Failed to initialize game engine!")
        logger.info("Tip: Use --api-only to run without camera/game window")
        sys.exit(1)

    logger.info("")
    logger.info("  System ready! Waiting for session...")
    logger.info("  Keyboard controls:")
    logger.info("    P     — Pause / Resume")
    logger.info("    S     — Stop session")
    logger.info("    ESC   — Quit")
    logger.info("")

    # Run game loop (blocking — must be in main thread for Pygame)
    try:
        game_engine.run()
    except KeyboardInterrupt:
        logger.info("Interrupted by user.")
    finally:
        game_engine.stop()
        logger.info("Smart Wall Climbing shut down.")


if __name__ == "__main__":
    main()
