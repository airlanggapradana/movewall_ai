"""
Base Game Mode — abstract base class for all game modes.

Defines the interface that every game mode (Number, Letter, Color, Shape)
must implement. The game engine calls these methods in the main loop.
"""

import abc
from typing import Optional

from ai_engine.core.collision_detector import Target


class BaseGameMode(abc.ABC):
    """
    Abstract base class for game modes.

    Each game mode manages its own target generation, instruction sequence,
    and answer validation. The game engine delegates game-specific logic
    to the active game mode.
    """

    def __init__(self, stage: int = 1, difficulty: int = 1):
        self._stage = stage
        self._difficulty = difficulty
        self._targets: list[Target] = []
        self._current_instruction: str = ""
        self._instruction_index: int = 0
        self._is_complete: bool = False

    @property
    def stage(self) -> int:
        return self._stage

    @property
    def difficulty(self) -> int:
        return self._difficulty

    @abc.abstractmethod
    def generate_stage(self, screen_width: int, screen_height: int) -> None:
        """
        Generate targets and instructions for the current stage.

        Must populate self._targets and set the first instruction.
        """
        pass

    @abc.abstractmethod
    def get_instruction(self) -> str:
        """
        Get the current voice instruction text.

        Example: "Find number 5"
        """
        pass

    @abc.abstractmethod
    def get_game_type(self) -> str:
        """
        Get the game type identifier.

        Returns one of: "number", "letter", "color", "shape"
        """
        pass

    @abc.abstractmethod
    def get_current_target_value(self) -> str:
        """
        Get the value of the target the player should currently find.

        Example: "5" for Number Game.
        """
        pass

    @abc.abstractmethod
    def check_answer(self, target: Target) -> bool:
        """
        Validate whether the touched target is the correct answer.

        Args:
            target: The Target object that was touched.

        Returns:
            True if the answer is correct for the current instruction.
        """
        pass

    @abc.abstractmethod
    def advance(self) -> bool:
        """
        Advance to the next instruction in the sequence.

        Returns:
            True if there are more instructions, False if stage is complete.
        """
        pass

    def get_targets(self) -> list[Target]:
        """Get all current targets (active and inactive)."""
        return self._targets

    def get_active_targets(self) -> list[Target]:
        """Get only active (not yet hit) targets."""
        return [t for t in self._targets if t.is_active]

    def is_stage_complete(self) -> bool:
        """Check if all instructions in this stage have been completed."""
        return self._is_complete

    def deactivate_target(self, target_id: str) -> None:
        """Mark a target as inactive (hit/removed)."""
        for t in self._targets:
            if t.id == target_id:
                t.is_active = False
                break

    def reset(self) -> None:
        """Reset the game mode state."""
        self._targets.clear()
        self._current_instruction = ""
        self._instruction_index = 0
        self._is_complete = False
