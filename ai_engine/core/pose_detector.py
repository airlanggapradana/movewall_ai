"""
Pose Detection Engine — OpenCV + MediaPipe Tasks API.

Detects body landmarks from camera frames and extracts key body points
(hands, feet, head, shoulders, etc.) needed for collision detection.

Uses the new MediaPipe Tasks API (mediapipe >= 0.10) with PoseLandmarker.
Camera is positioned facing the player from the front of the wall.
"""

import logging
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

from ai_engine.config import (
    CAMERA_HEIGHT,
    CAMERA_INDEX,
    CAMERA_WIDTH,
    POSE_MIN_DETECTION_CONFIDENCE,
    POSE_MIN_TRACKING_CONFIDENCE,
    POSE_MODEL_COMPLEXITY,
    POSE_SMOOTH_LANDMARKS,
)

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# Model configuration
# ──────────────────────────────────────────────
_MODEL_COMPLEXITY_MAP = {
    0: "pose_landmarker_lite.task",
    1: "pose_landmarker_full.task",
    2: "pose_landmarker_heavy.task",
}
_MODEL_BASE_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/{name}/float16/1/{name}.task"
_MODELS_DIR = Path(__file__).resolve().parent.parent / "models"


# ──────────────────────────────────────────────
# Data Classes
# ──────────────────────────────────────────────
@dataclass
class Point:
    """A 2D point with optional visibility/confidence."""
    x: float
    y: float
    visibility: float = 0.0

    def to_pixel(self, width: int, height: int) -> tuple[int, int]:
        """Convert normalized coordinates to pixel coordinates."""
        return int(self.x * width), int(self.y * height)

    def to_list(self) -> list[int]:
        """Return as [x, y] list."""
        return [int(self.x), int(self.y)]


@dataclass
class PoseResult:
    """Result of pose detection for a single frame."""
    detected: bool = False

    # Key body points in PIXEL coordinates
    head: Optional[Point] = None
    left_shoulder: Optional[Point] = None
    right_shoulder: Optional[Point] = None
    left_elbow: Optional[Point] = None
    right_elbow: Optional[Point] = None
    left_hand: Optional[Point] = None
    right_hand: Optional[Point] = None
    left_hip: Optional[Point] = None
    right_hip: Optional[Point] = None
    left_knee: Optional[Point] = None
    right_knee: Optional[Point] = None
    left_foot: Optional[Point] = None
    right_foot: Optional[Point] = None

    # All landmark points for skeleton drawing
    all_landmarks: list[Point] = field(default_factory=list)

    def get_key_points(self) -> dict:
        """
        Return key body points as a dictionary matching the PRD output format.
        Only includes points with sufficient visibility.
        """
        points = {}
        mapping = {
            "head": self.head,
            "leftShoulder": self.left_shoulder,
            "rightShoulder": self.right_shoulder,
            "leftElbow": self.left_elbow,
            "rightElbow": self.right_elbow,
            "leftHand": self.left_hand,
            "rightHand": self.right_hand,
            "leftHip": self.left_hip,
            "rightHip": self.right_hip,
            "leftKnee": self.left_knee,
            "rightKnee": self.right_knee,
            "leftFoot": self.left_foot,
            "rightFoot": self.right_foot,
        }
        for name, point in mapping.items():
            if point and point.visibility > 0.3:
                points[name] = point.to_list()
        return points

    def get_touchable_points(self) -> dict:
        """
        Return only the points that can 'touch' targets: hands and feet.
        """
        points = {}
        for name, point in [
            ("leftHand", self.left_hand),
            ("rightHand", self.right_hand),
            ("leftFoot", self.left_foot),
            ("rightFoot", self.right_foot),
        ]:
            if point and point.visibility > 0.3:
                points[name] = point
        return points


# ──────────────────────────────────────────────
# MediaPipe Pose landmark indices
# ──────────────────────────────────────────────
# 0  = nose
# 11 = left shoulder,  12 = right shoulder
# 13 = left elbow,     14 = right elbow
# 15 = left wrist,     16 = right wrist
# 19 = left index tip, 20 = right index tip
# 23 = left hip,       24 = right hip
# 25 = left knee,      26 = right knee
# 27 = left ankle,     28 = right ankle
# 31 = left foot tip,  32 = right foot tip

_LANDMARK_MAP = {
    "head": 0,
    "left_shoulder": 11,
    "right_shoulder": 12,
    "left_elbow": 13,
    "right_elbow": 14,
    "left_hand": 19,    # left index finger tip
    "right_hand": 20,   # right index finger tip
    "left_hip": 23,
    "right_hip": 24,
    "left_knee": 25,
    "right_knee": 26,
    "left_foot": 31,    # left foot index
    "right_foot": 32,   # right foot index
}

# Skeleton bone connections (pairs of landmark indices)
POSE_CONNECTIONS = [
    (11, 12), (11, 23), (12, 24), (23, 24),  # torso
    (11, 13), (13, 15), (15, 19),              # left arm
    (12, 14), (14, 16), (16, 20),              # right arm
    (23, 25), (25, 27), (27, 31),              # left leg
    (24, 26), (26, 28), (28, 32),              # right leg
]


def _download_model(model_filename: str) -> Path:
    """
    Download the MediaPipe pose model file if not already present.

    Returns the local path to the model file.
    """
    _MODELS_DIR.mkdir(parents=True, exist_ok=True)
    model_path = _MODELS_DIR / model_filename
    if model_path.exists():
        logger.info(f"Model already exists: {model_path}")
        return model_path

    # Build download URL (model name without extension)
    model_name = model_filename.replace(".task", "")
    url = _MODEL_BASE_URL.format(name=model_name)
    logger.info(f"Downloading pose model from: {url}")
    logger.info("This may take a moment on first run...")

    try:
        urllib.request.urlretrieve(url, model_path)
        logger.info(f"Model saved to: {model_path}")
        return model_path
    except Exception as e:
        logger.error(f"Failed to download model: {e}")
        raise RuntimeError(
            f"Could not download MediaPipe model '{model_filename}'.\n"
            f"Please download it manually from:\n{url}\n"
            f"And place it in: {_MODELS_DIR}"
        ) from e


class PoseDetector:
    """
    Real-time body pose detection using MediaPipe Tasks PoseLandmarker.

    Captures frames from a camera, detects body landmarks, and outputs
    key body points in pixel coordinates for collision detection.
    """

    def __init__(self, camera_index: int = CAMERA_INDEX):
        self._camera_index = camera_index
        self._cap: Optional[cv2.VideoCapture] = None
        self._landmarker = None
        self._is_running = False
        self._frame_width = CAMERA_WIDTH
        self._frame_height = CAMERA_HEIGHT

    def start(self) -> bool:
        """Initialize camera and MediaPipe PoseLandmarker. Returns True on success."""
        try:
            # ── Camera ──────────────────────────────
            self._cap = cv2.VideoCapture(self._camera_index)
            if not self._cap.isOpened():
                logger.error(f"Cannot open camera at index {self._camera_index}")
                return False

            self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
            self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
            self._frame_width = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            self._frame_height = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

            # ── MediaPipe Model ─────────────────────
            model_filename = _MODEL_COMPLEXITY_MAP.get(
                POSE_MODEL_COMPLEXITY, "pose_landmarker_full.task"
            )
            model_path = _download_model(model_filename)

            base_options = mp_python.BaseOptions(
                model_asset_path=str(model_path)
            )
            options = mp_vision.PoseLandmarkerOptions(
                base_options=base_options,
                running_mode=mp_vision.RunningMode.VIDEO,
                num_poses=1,
                min_pose_detection_confidence=POSE_MIN_DETECTION_CONFIDENCE,
                min_pose_presence_confidence=POSE_MIN_TRACKING_CONFIDENCE,
                min_tracking_confidence=POSE_MIN_TRACKING_CONFIDENCE,
                output_segmentation_masks=False,
            )
            self._landmarker = mp_vision.PoseLandmarker.create_from_options(options)

            self._is_running = True
            self._frame_timestamp_ms = 0

            logger.info(
                f"PoseDetector started — camera {self._camera_index} "
                f"at {self._frame_width}x{self._frame_height}, "
                f"model={model_filename}"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to start PoseDetector: {e}")
            return False

    def read_frame(self) -> Optional[np.ndarray]:
        """Read a single frame from the camera. Returns None on failure."""
        if not self._cap or not self._cap.isOpened():
            return None
        ret, frame = self._cap.read()
        if not ret:
            return None
        # Flip horizontally — camera faces the player from the front
        frame = cv2.flip(frame, 1)
        return frame

    def detect(self, frame: np.ndarray) -> PoseResult:
        """
        Detect pose landmarks in a BGR frame.

        Args:
            frame: BGR image from OpenCV VideoCapture.

        Returns:
            PoseResult with all detected body points in pixel coordinates.
        """
        result = PoseResult()

        if self._landmarker is None:
            return result

        # Convert BGR → RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        # Advance timestamp for VIDEO mode
        self._frame_timestamp_ms += int(1000 / 30)  # ~33ms per frame at 30 FPS

        mp_result = self._landmarker.detect_for_video(
            mp_image, self._frame_timestamp_ms
        )

        if not mp_result.pose_landmarks:
            return result

        result.detected = True
        landmarks = mp_result.pose_landmarks[0]  # First (only) pose
        h, w = frame.shape[:2]

        # Convert normalized → pixel coords and store all landmarks
        all_pts = []
        for lm in landmarks:
            all_pts.append(Point(
                x=lm.x * w,
                y=lm.y * h,
                visibility=lm.visibility if hasattr(lm, "visibility") else 1.0,
            ))
        result.all_landmarks = all_pts

        # Extract key points
        for attr_name, idx in _LANDMARK_MAP.items():
            if idx < len(all_pts):
                setattr(result, attr_name, all_pts[idx])

        return result

    def draw_skeleton(
        self,
        frame: np.ndarray,
        pose_result: PoseResult,
    ) -> np.ndarray:
        """
        Draw a pose skeleton overlay on a frame using OpenCV.

        Args:
            frame: BGR image to draw on.
            pose_result: PoseResult with all_landmarks populated.

        Returns:
            The frame with skeleton drawn on it.
        """
        if not pose_result.detected or not pose_result.all_landmarks:
            return frame

        landmarks = pose_result.all_landmarks

        # Draw bone connections
        for start_idx, end_idx in POSE_CONNECTIONS:
            if start_idx < len(landmarks) and end_idx < len(landmarks):
                p1 = landmarks[start_idx]
                p2 = landmarks[end_idx]
                if p1.visibility > 0.3 and p2.visibility > 0.3:
                    cv2.line(
                        frame,
                        (int(p1.x), int(p1.y)),
                        (int(p2.x), int(p2.y)),
                        (0, 255, 128), 3,
                    )

        # Draw joints
        for pt in landmarks:
            if pt.visibility > 0.3:
                cv2.circle(frame, (int(pt.x), int(pt.y)), 5, (255, 255, 0), -1)

        return frame

    @property
    def frame_size(self) -> tuple[int, int]:
        """Return (width, height) of the camera frame."""
        return self._frame_width, self._frame_height

    @property
    def is_running(self) -> bool:
        return self._is_running

    def release(self) -> None:
        """Release camera and MediaPipe resources."""
        self._is_running = False
        if self._landmarker:
            self._landmarker.close()
            self._landmarker = None
        if self._cap:
            self._cap.release()
            self._cap = None
        logger.info("PoseDetector released.")
