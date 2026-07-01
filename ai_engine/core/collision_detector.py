"""
Collision Detection Engine.

Determines whether a body point (hand/foot) is touching a game target
by computing Euclidean distance and comparing against a collision radius.
Supports hold-time validation to prevent accidental touches.
"""

import logging
import time
from dataclasses import dataclass
from typing import Optional

import numpy as np

from ai_engine.config import COLLISION_HOLD_TIME, COLLISION_RADIUS

logger = logging.getLogger(__name__)


@dataclass
class Target:
    """
    A game target displayed on the projected wall.

    Attributes:
        id: Unique identifier for this target.
        value: Display value (e.g. "5", "A", "red", "triangle").
        x: X position in pixels (projector coordinates).
        y: Y position in pixels (projector coordinates).
        size: Radius of the target in pixels.
        color: RGB color tuple.
        is_correct: Whether this target is the correct answer.
        is_active: Whether this target is still active (not yet hit).
    """
    id: str
    value: str
    x: float
    y: float
    size: float = 80.0
    color: tuple = (255, 255, 255)
    is_correct: bool = False
    is_active: bool = True


@dataclass
class CollisionResult:
    """Result of a collision check between a body point and a target."""
    target_id: str
    target_value: str
    body_part: str
    distance: float
    is_collision: bool
    is_correct: bool
    hold_confirmed: bool = False  # True if held long enough


class CollisionDetector:
    """
    Detects collisions between body points and game targets.

    Algorithm (per PRD):
        Distance(Point A, Point B) → Radius Checking → Collision → Success

    Supports optional hold-time: a point must stay within the collision
    radius for COLLISION_HOLD_TIME seconds to confirm.
    """

    def __init__(
        self,
        radius: float = COLLISION_RADIUS,
        hold_time: float = COLLISION_HOLD_TIME,
    ):
        self._radius = radius
        self._hold_time = hold_time
        # Track ongoing "hover" state: {(body_part, target_id): first_contact_time}
        self._hover_state: dict[tuple[str, str], float] = {}

    def check_single(
        self,
        point_x: float,
        point_y: float,
        target: Target,
    ) -> tuple[float, bool]:
        """
        Check distance between a single point and a single target.

        Returns:
            (distance, is_within_radius)
        """
        dx = point_x - target.x
        dy = point_y - target.y
        distance = np.sqrt(dx * dx + dy * dy)
        effective_radius = self._radius + target.size
        return distance, distance <= effective_radius

    def check_all(
        self,
        touchable_points: dict,
        targets: list[Target],
    ) -> list[CollisionResult]:
        """
        Check all body touchable points against all active targets.

        Args:
            touchable_points: dict of {body_part_name: Point} from PoseResult.get_touchable_points()
            targets: list of active Target objects.

        Returns:
            List of CollisionResult for every collision detected.
        """
        collisions: list[CollisionResult] = []
        current_time = time.time()
        active_keys: set[tuple[str, str]] = set()

        for body_part, point in touchable_points.items():
            px, py = point.x, point.y

            for target in targets:
                if not target.is_active:
                    continue

                distance, within_radius = self.check_single(px, py, target)

                if within_radius:
                    key = (body_part, target.id)
                    active_keys.add(key)

                    # Track hold time
                    if key not in self._hover_state:
                        self._hover_state[key] = current_time

                    elapsed = current_time - self._hover_state[key]
                    hold_confirmed = elapsed >= self._hold_time

                    collisions.append(CollisionResult(
                        target_id=target.id,
                        target_value=target.value,
                        body_part=body_part,
                        distance=distance,
                        is_collision=True,
                        is_correct=target.is_correct,
                        hold_confirmed=hold_confirmed,
                    ))

                    if hold_confirmed:
                        logger.debug(
                            f"Collision confirmed: {body_part} → "
                            f"target '{target.value}' (d={distance:.1f}px, "
                            f"held {elapsed:.2f}s)"
                        )

        # Clean up hover states for points that are no longer touching
        stale_keys = set(self._hover_state.keys()) - active_keys
        for key in stale_keys:
            del self._hover_state[key]

        return collisions

    def get_confirmed_collision(
        self,
        touchable_points: dict,
        targets: list[Target],
    ) -> Optional[CollisionResult]:
        """
        Convenience method: returns the first hold-confirmed collision, or None.

        This is the primary method used by the game engine to determine
        if a player has "selected" a target.
        """
        collisions = self.check_all(touchable_points, targets)
        for c in collisions:
            if c.hold_confirmed:
                return c
        return None

    def reset(self) -> None:
        """Clear all hover tracking state (e.g., on new stage)."""
        self._hover_state.clear()

    @property
    def radius(self) -> float:
        return self._radius

    @radius.setter
    def radius(self, value: float) -> None:
        self._radius = max(10.0, value)
