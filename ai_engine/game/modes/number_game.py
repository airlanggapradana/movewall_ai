"""
Number Game Mode — "Find number X" interactive game.

Stage 1: Find 1 target number among 3 distractors
Stage 2: Find 2 target numbers sequentially among 4 distractors
Stage 3: Find 3 target numbers sequentially among 5 distractors
"""

import logging
from typing import Optional

from ai_engine.core.collision_detector import Target
from ai_engine.core.stage_generator import StageGenerator
from ai_engine.game.modes.base_mode import BaseGameMode

logger = logging.getLogger(__name__)


class NumberGame(BaseGameMode):
    """
    Number Game — player must find specific numbers on the wall.

    Numbers 1–9 are displayed on the wall. The voice engine instructs
    the player to find a specific number. The player touches the correct
    number with their hand or foot.

    In higher stages, multiple numbers must be found in sequence.
    """

    def __init__(self, stage: int = 1, difficulty: int = 1):
        super().__init__(stage=stage, difficulty=difficulty)
        self._stage_generator = StageGenerator()
        self._correct_sequence: list[int] = []
        self._current_target_idx: int = 0

    def get_game_type(self) -> str:
        return "number"

    def generate_stage(self, screen_width: int, screen_height: int) -> None:
        """Generate a Number Game stage with targets and correct sequence."""
        self.reset()
        self._stage_generator = StageGenerator(screen_width, screen_height)

        targets, correct_sequence = self._stage_generator.generate_number_stage(
            stage=self._stage,
            difficulty=self._difficulty,
        )

        self._targets = targets
        self._correct_sequence = correct_sequence
        self._current_target_idx = 0
        self._update_instruction()

        logger.info(
            f"NumberGame stage {self._stage} generated: "
            f"find {self._correct_sequence} in order"
        )

    def get_instruction(self) -> str:
        """Get the current instruction (e.g., 'Find number 5')."""
        return self._current_instruction

    def get_current_target_value(self) -> str:
        """Get the number the player should currently find."""
        if self._current_target_idx < len(self._correct_sequence):
            return str(self._correct_sequence[self._current_target_idx])
        return ""

    def check_answer(self, target: Target) -> bool:
        """
        Check if the touched target is the correct number in the sequence.

        Args:
            target: The Target that was touched.

        Returns:
            True if this is the correct number to find next.
        """
        if self._is_complete:
            return False

        expected_value = self.get_current_target_value()
        is_correct = target.value == expected_value

        if is_correct:
            logger.info(
                f"Correct! Found number {target.value} "
                f"({self._current_target_idx + 1}/{len(self._correct_sequence)})"
            )
        else:
            logger.info(
                f"Wrong! Touched {target.value}, expected {expected_value}"
            )

        return is_correct

    def advance(self) -> bool:
        """
        Advance to the next number in the sequence.

        Returns:
            True if there are more numbers to find.
            False if all numbers have been found (stage complete).
        """
        self._current_target_idx += 1

        if self._current_target_idx >= len(self._correct_sequence):
            self._is_complete = True
            self._current_instruction = "Stage Complete!"
            logger.info(f"NumberGame stage {self._stage} complete!")
            return False

        self._update_instruction()
        return True

    def _update_instruction(self) -> None:
        """Update the current instruction text."""
        if self._current_target_idx < len(self._correct_sequence):
            num = self._correct_sequence[self._current_target_idx]
            self._current_instruction = f"Find number {num}"

            if len(self._correct_sequence) > 1:
                step = self._current_target_idx + 1
                total = len(self._correct_sequence)
                self._current_instruction += f"  ({step}/{total})"

    def get_progress(self) -> tuple[int, int]:
        """Return (current_step, total_steps) for progress tracking."""
        return self._current_target_idx, len(self._correct_sequence)

    def reset(self) -> None:
        """Reset for a new stage."""
        super().reset()
        self._correct_sequence.clear()
        self._current_target_idx = 0
