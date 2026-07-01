"""
Camera-to-Projector Coordinate Mapping.

Maps coordinates from the camera frame space to the projector display space.
Since the camera faces the player from the front, the image is already
mirrored in PoseDetector. This module handles scaling and offset.

For advanced setups, supports homography-based calibration using 4 reference points.
"""

import logging
from typing import Optional

import cv2
import numpy as np

from ai_engine.config import CAMERA_HEIGHT, CAMERA_WIDTH, PROJECTOR_HEIGHT, PROJECTOR_WIDTH

logger = logging.getLogger(__name__)


class CoordinateMapper:
    """
    Maps coordinates from camera space to projector space.

    Supports two modes:
      1. Simple linear mapping (scale + offset) — default
      2. Homography-based mapping (4-point calibration) — advanced
    """

    def __init__(self):
        self._scale_x: float = 1.0
        self._scale_y: float = 1.0
        self._offset_x: float = 0.0
        self._offset_y: float = 0.0
        self._homography: Optional[np.ndarray] = None
        self._use_homography: bool = False

    def set_simple_mapping(
        self,
        src_width: int = CAMERA_WIDTH,
        src_height: int = CAMERA_HEIGHT,
        dst_width: int = PROJECTOR_WIDTH,
        dst_height: int = PROJECTOR_HEIGHT,
    ) -> None:
        """
        Set up simple linear scale mapping from camera to projector.

        This scales camera coordinates directly to projector coordinates.
        """
        self._scale_x = dst_width / src_width
        self._scale_y = dst_height / src_height
        self._offset_x = 0.0
        self._offset_y = 0.0
        self._use_homography = False

        logger.info(
            f"Simple mapping set: scale=({self._scale_x:.2f}, {self._scale_y:.2f})"
        )

    def set_homography(
        self,
        camera_points: list[tuple[float, float]],
        projector_points: list[tuple[float, float]],
    ) -> bool:
        """
        Set up homography-based mapping using 4 corresponding point pairs.

        Args:
            camera_points: 4 points in camera space [(x,y), ...].
            projector_points: 4 corresponding points in projector space.

        Returns:
            True if homography was computed successfully.
        """
        if len(camera_points) != 4 or len(projector_points) != 4:
            logger.error("Homography requires exactly 4 point pairs.")
            return False

        src = np.float32(camera_points)
        dst = np.float32(projector_points)

        self._homography, status = cv2.findHomography(src, dst)

        if self._homography is None:
            logger.error("Failed to compute homography matrix.")
            return False

        self._use_homography = True
        logger.info("Homography mapping set from 4-point calibration.")
        return True

    def map_point(self, x: float, y: float) -> tuple[float, float]:
        """
        Map a single point from camera space to projector space.

        Args:
            x: X coordinate in camera space.
            y: Y coordinate in camera space.

        Returns:
            (x, y) in projector space.
        """
        if self._use_homography and self._homography is not None:
            point = np.float32([[[x, y]]])
            mapped = cv2.perspectiveTransform(point, self._homography)
            return float(mapped[0][0][0]), float(mapped[0][0][1])

        # Simple linear mapping
        return (
            x * self._scale_x + self._offset_x,
            y * self._scale_y + self._offset_y,
        )

    def map_points(self, key_points: dict) -> dict:
        """
        Map a dictionary of key points from camera to projector space.

        Args:
            key_points: Dict of {name: [x, y]} from PoseResult.get_key_points().

        Returns:
            Dict with mapped coordinates.
        """
        mapped = {}
        for name, coords in key_points.items():
            mx, my = self.map_point(coords[0], coords[1])
            mapped[name] = [mx, my]
        return mapped

    def get_scale(self) -> tuple[float, float]:
        """Return (scale_x, scale_y) for renderer use."""
        return self._scale_x, self._scale_y

    def get_offset(self) -> tuple[float, float]:
        """Return (offset_x, offset_y) for renderer use."""
        return self._offset_x, self._offset_y

    def inverse_map_point(self, x: float, y: float) -> tuple[float, float]:
        """
        Map a point from projector space back to camera space.

        Useful for debugging and display.
        """
        if self._use_homography and self._homography is not None:
            inv_h = np.linalg.inv(self._homography)
            point = np.float32([[[x, y]]])
            mapped = cv2.perspectiveTransform(point, inv_h)
            return float(mapped[0][0][0]), float(mapped[0][0][1])

        if self._scale_x != 0 and self._scale_y != 0:
            return (
                (x - self._offset_x) / self._scale_x,
                (y - self._offset_y) / self._scale_y,
            )
        return x, y
