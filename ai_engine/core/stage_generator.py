"""
Stage Generator — creates random game targets with constraints.

Generates targets with random positions ensuring:
  - No overlapping objects (minimum distance between targets)
  - All targets within the reachable area (child-friendly)
  - Adjustable difficulty (more targets, less time, smaller area)
"""

import logging
import random
import uuid
from typing import Optional

from ai_engine.config import (
    NUMBER_GAME_STAGES,
    PROJECTOR_HEIGHT,
    PROJECTOR_WIDTH,
    REACHABLE_AREA,
    TARGET_MIN_DISTANCE,
    TARGET_SIZE_LARGE,
    TARGET_SIZE_MEDIUM,
    TARGET_SIZE_SMALL,
)
from ai_engine.core.collision_detector import Target

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# Color palette for targets (child-friendly bright colors)
# ──────────────────────────────────────────────
TARGET_PALETTE = [
    (239, 68, 68),    # Red
    (59, 130, 246),   # Blue
    (34, 197, 94),    # Green
    (245, 158, 11),   # Amber
    (168, 85, 247),   # Purple
    (236, 72, 153),   # Pink
    (249, 115, 22),   # Orange
    (6, 182, 212),    # Cyan
]


class StageGenerator:
    """
    Generates game stages with random target placement.

    Ensures targets don't overlap and are within the reachable area
    defined by REACHABLE_AREA config.
    """

    def __init__(
        self,
        screen_width: int = PROJECTOR_WIDTH,
        screen_height: int = PROJECTOR_HEIGHT,
    ):
        self._screen_w = screen_width
        self._screen_h = screen_height

        # Calculate reachable pixel bounds
        self._x_min = int(screen_width * REACHABLE_AREA["x_min"])
        self._x_max = int(screen_width * REACHABLE_AREA["x_max"])
        self._y_min = int(screen_height * REACHABLE_AREA["y_min"])
        self._y_max = int(screen_height * REACHABLE_AREA["y_max"])

    def _get_target_size(self, difficulty: int) -> float:
        """Higher difficulty → smaller targets."""
        sizes = {1: TARGET_SIZE_LARGE, 2: TARGET_SIZE_MEDIUM, 3: TARGET_SIZE_SMALL}
        return sizes.get(difficulty, TARGET_SIZE_MEDIUM)

    def _random_position(
        self,
        existing_positions: list[tuple[float, float]],
        target_size: float,
        max_attempts: int = 100,
    ) -> Optional[tuple[float, float]]:
        """
        Generate a random position that doesn't overlap with existing targets.

        Returns None if unable to place after max_attempts.
        """
        min_dist = TARGET_MIN_DISTANCE + target_size

        for _ in range(max_attempts):
            x = random.randint(self._x_min + int(target_size), self._x_max - int(target_size))
            y = random.randint(self._y_min + int(target_size), self._y_max - int(target_size))

            # Check overlap with existing targets
            overlap = False
            for ex, ey in existing_positions:
                dx = x - ex
                dy = y - ey
                if (dx * dx + dy * dy) < (min_dist * min_dist):
                    overlap = True
                    break

            if not overlap:
                return (float(x), float(y))

        logger.warning("Could not find non-overlapping position after max attempts.")
        return None

    def _assign_colors(self, count: int) -> list[tuple]:
        """Assign distinct colors to targets from the palette."""
        colors = list(TARGET_PALETTE)
        random.shuffle(colors)
        return [colors[i % len(colors)] for i in range(count)]

    # ──────────────────────────────────────────
    # Number Game Generation
    # ──────────────────────────────────────────
    def generate_number_stage(
        self,
        stage: int = 1,
        difficulty: int = 1,
    ) -> tuple[list[Target], list[int]]:
        """
        Generate a Number Game stage.

        Args:
            stage: Stage number (1-3), determines target/distractor count.
            difficulty: Difficulty level (1-3), affects target size.

        Returns:
            (targets, correct_sequence):
                targets — list of Target objects to render
                correct_sequence — ordered list of correct numbers to find
        """
        stage_config = NUMBER_GAME_STAGES.get(stage, NUMBER_GAME_STAGES[1])
        target_count = stage_config["target_count"]
        distractor_count = stage_config["distractor_count"]
        total_count = target_count + distractor_count
        target_size = self._get_target_size(difficulty)

        # Generate unique numbers
        all_numbers = list(range(1, 10))  # 1-9
        random.shuffle(all_numbers)

        correct_numbers = all_numbers[:target_count]
        distractor_numbers = all_numbers[target_count:total_count]

        # Generate positions
        positions: list[tuple[float, float]] = []
        targets: list[Target] = []
        colors = self._assign_colors(total_count)

        # Place correct targets
        for i, num in enumerate(correct_numbers):
            pos = self._random_position(positions, target_size)
            if pos is None:
                # Fallback: place at a grid position
                pos = (
                    self._x_min + (i + 1) * (self._x_max - self._x_min) / (total_count + 1),
                    self._y_min + (self._y_max - self._y_min) / 2,
                )
            positions.append(pos)

            targets.append(Target(
                id=str(uuid.uuid4()),
                value=str(num),
                x=pos[0],
                y=pos[1],
                size=target_size,
                color=colors[i],
                is_correct=True,
                is_active=True,
            ))

        # Place distractors
        for i, num in enumerate(distractor_numbers):
            pos = self._random_position(positions, target_size)
            if pos is None:
                pos = (
                    self._x_min + (target_count + i + 1) * (self._x_max - self._x_min) / (total_count + 1),
                    self._y_min + (self._y_max - self._y_min) / 2,
                )
            positions.append(pos)

            targets.append(Target(
                id=str(uuid.uuid4()),
                value=str(num),
                x=pos[0],
                y=pos[1],
                size=target_size,
                color=colors[target_count + i],
                is_correct=False,
                is_active=True,
            ))

        # Shuffle so correct targets aren't always first
        random.shuffle(targets)

        logger.info(
            f"Generated Number Game stage {stage}: "
            f"correct={correct_numbers}, distractors={distractor_numbers}"
        )

        return targets, correct_numbers

    # ──────────────────────────────────────────
    # Generic (future game modes)
    # ──────────────────────────────────────────
    def generate_letter_stage(self, stage: int = 1, difficulty: int = 1):
        """Placeholder for Letter Game stage generation."""
        raise NotImplementedError("Letter Game not yet implemented.")

    def generate_color_stage(self, stage: int = 1, difficulty: int = 1):
        """Placeholder for Color Game stage generation."""
        raise NotImplementedError("Color Game not yet implemented.")

    def generate_shape_stage(self, stage: int = 1, difficulty: int = 1):
        """Placeholder for Shape Game stage generation."""
        raise NotImplementedError("Shape Game not yet implemented.")
