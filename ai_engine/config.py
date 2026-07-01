"""
Smart Wall Climbing — AI Engine Configuration

Centralized configuration constants for the entire AI Engine.
Camera faces the player from the front of the wall.
Projector resolution: 1920x1080 (default).
"""

import os
from pathlib import Path


# ──────────────────────────────────────────────
# Paths
# ──────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "smart_wall_climbing.db"


# ──────────────────────────────────────────────
# Camera
# ──────────────────────────────────────────────
CAMERA_INDEX = 0  # Default webcam
CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480
CAMERA_FACING = "front"  # Camera faces player from front of the wall


# ──────────────────────────────────────────────
# Projector / Display
# ──────────────────────────────────────────────
PROJECTOR_WIDTH = 1920
PROJECTOR_HEIGHT = 1080
PROJECTOR_FULLSCREEN = True
PROJECTOR_DISPLAY_INDEX = 1  # Second monitor (0 = primary)


# ──────────────────────────────────────────────
# Performance Targets
# ──────────────────────────────────────────────
FPS_TARGET = 30
MAX_LATENCY_MS = 100  # Max acceptable latency in milliseconds


# ──────────────────────────────────────────────
# Pose Detection
# ──────────────────────────────────────────────
POSE_MODEL_COMPLEXITY = 1  # 0=lite, 1=full, 2=heavy
POSE_MIN_DETECTION_CONFIDENCE = 0.5
POSE_MIN_TRACKING_CONFIDENCE = 0.5
POSE_SMOOTH_LANDMARKS = True


# ──────────────────────────────────────────────
# Collision Detection
# ──────────────────────────────────────────────
COLLISION_RADIUS = 50  # pixels — radius for collision check
COLLISION_HOLD_TIME = 0.3  # seconds — how long limb must stay on target


# ──────────────────────────────────────────────
# Voice Engine
# ──────────────────────────────────────────────
VOICE_ENGINE = "pyttsx3"  # "pyttsx3" or "gtts"
VOICE_LANGUAGE = "en"  # "en" or "id" (Indonesian)
VOICE_RATE = 150  # Words per minute (pyttsx3)
VOICE_VOLUME = 1.0  # 0.0 to 1.0


# ──────────────────────────────────────────────
# Game Settings
# ──────────────────────────────────────────────
GAME_COUNTDOWN_SECONDS = 3
GAME_DEFAULT_DURATION = 120  # seconds per session

# Target rendering
TARGET_SIZE_SMALL = 60  # pixels
TARGET_SIZE_MEDIUM = 80
TARGET_SIZE_LARGE = 100
TARGET_MIN_DISTANCE = 120  # Minimum distance between targets (no overlap)

# Reachable area (percentage of screen, adjusted for child height)
REACHABLE_AREA = {
    "x_min": 0.1,   # 10% from left
    "x_max": 0.9,   # 90% from left
    "y_min": 0.15,  # 15% from top (upper reach limit)
    "y_max": 0.85,  # 85% from top (lower reach limit)
}

# Number Game specific
NUMBER_GAME_STAGES = {
    1: {"target_count": 1, "distractor_count": 3, "time_limit": 30},
    2: {"target_count": 2, "distractor_count": 4, "time_limit": 45},
    3: {"target_count": 3, "distractor_count": 5, "time_limit": 60},
}


# ──────────────────────────────────────────────
# Colors (RGB)
# ──────────────────────────────────────────────
COLORS = {
    "background": (18, 18, 30),        # Dark blue-black
    "primary": (99, 102, 241),         # Indigo
    "secondary": (168, 85, 247),       # Purple
    "success": (34, 197, 94),          # Green
    "danger": (239, 68, 68),           # Red
    "warning": (245, 158, 11),         # Amber
    "info": (59, 130, 246),            # Blue
    "white": (255, 255, 255),
    "black": (0, 0, 0),
    "gray": (156, 163, 175),
    "skeleton": (0, 255, 128),         # Bright green for skeleton lines
    "skeleton_joint": (255, 255, 0),   # Yellow for joints
    "target_correct": (34, 197, 94),   # Green glow for correct answer
    "target_wrong": (239, 68, 68),     # Red flash for wrong answer
    "countdown": (255, 255, 255),
}

# Target colors for Color Game (future)
TARGET_COLORS = {
    "red": (239, 68, 68),
    "blue": (59, 130, 246),
    "green": (34, 197, 94),
    "yellow": (250, 204, 21),
    "purple": (168, 85, 247),
    "orange": (249, 115, 22),
    "pink": (236, 72, 153),
}


# ──────────────────────────────────────────────
# Fonts
# ──────────────────────────────────────────────
FONT_SIZE_SMALL = 24
FONT_SIZE_MEDIUM = 36
FONT_SIZE_LARGE = 64
FONT_SIZE_XLARGE = 96
FONT_SIZE_TARGET = 48


# ──────────────────────────────────────────────
# Database
# ──────────────────────────────────────────────
DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"
DATABASE_URL_SYNC = f"sqlite:///{DB_PATH}"


# ──────────────────────────────────────────────
# Authentication (JWT)
# ──────────────────────────────────────────────
JWT_SECRET = os.environ.get("JWT_SECRET", "smart-wall-climbing-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_MINUTES = 480  # 8 hours


# ──────────────────────────────────────────────
# API Server
# ──────────────────────────────────────────────
API_HOST = "0.0.0.0"
API_PORT = 8000
API_CORS_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]


# ──────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)-25s | %(message)s"
LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
