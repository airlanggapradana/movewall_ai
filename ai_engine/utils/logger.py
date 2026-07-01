"""
Logging setup for Smart Wall Climbing AI Engine.
"""

import logging
import sys

from ai_engine.config import LOG_DATE_FORMAT, LOG_FORMAT, LOG_LEVEL


def setup_logging(level: str = LOG_LEVEL) -> None:
    """
    Configure logging for the entire AI Engine application.

    Sets up a consistent format for all loggers with output to stdout.

    Args:
        level: Log level string (e.g., "DEBUG", "INFO", "WARNING").
    """
    numeric_level = getattr(logging, level.upper(), logging.INFO)

    # Configure root logger
    logging.basicConfig(
        level=numeric_level,
        format=LOG_FORMAT,
        datefmt=LOG_DATE_FORMAT,
        stream=sys.stdout,
        force=True,
    )

    # Silence noisy third-party loggers
    logging.getLogger("mediapipe").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("PIL").setLevel(logging.WARNING)
    logging.getLogger("matplotlib").setLevel(logging.WARNING)

    # Reduce uvicorn access log noise
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

    logger = logging.getLogger(__name__)
    logger.info(f"Logging configured at level: {level}")
