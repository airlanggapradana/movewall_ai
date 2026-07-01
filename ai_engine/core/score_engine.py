"""
Score Engine — calculates score, accuracy, combo, and mistakes during a session.
"""

import logging
import time
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class HitRecord:
    """Record of a single hit attempt."""
    target_value: str
    body_part: str
    is_correct: bool
    reaction_time: float  # seconds since instruction was given
    timestamp: float      # time.time()


@dataclass
class ScoreSummary:
    """Aggregated score summary for a session."""
    total_score: int = 0
    accuracy: float = 0.0            # 0.0 – 1.0
    max_combo: int = 0
    current_combo: int = 0
    total_hits: int = 0
    total_correct: int = 0
    total_mistakes: int = 0
    avg_reaction_time: float = 0.0   # seconds
    fastest_reaction: float = 0.0    # seconds
    slowest_reaction: float = 0.0    # seconds


class ScoreEngine:
    """
    Tracks and calculates score metrics during a therapy session.

    Scoring rules:
      - Base points per correct hit: 100
      - Combo multiplier: 1.0 + (combo * 0.1), capped at 2.0
      - Time bonus: faster reaction → more bonus points
      - Mistake penalty: resets combo streak
    """

    BASE_POINTS = 100
    MAX_COMBO_MULTIPLIER = 2.0
    COMBO_INCREMENT = 0.1
    TIME_BONUS_THRESHOLD = 3.0  # seconds; faster than this gets bonus

    def __init__(self):
        self._hits: list[HitRecord] = []
        self._total_score: int = 0
        self._current_combo: int = 0
        self._max_combo: int = 0
        self._instruction_start_time: float = 0.0

    def start_instruction_timer(self) -> None:
        """Call this when a new instruction is given to start reaction timing."""
        self._instruction_start_time = time.time()

    def record_hit(
        self,
        target_value: str,
        body_part: str,
        is_correct: bool,
    ) -> int:
        """
        Record a hit and calculate points earned.

        Args:
            target_value: The value of the target that was hit.
            body_part: Which body part hit the target.
            is_correct: Whether the correct target was hit.

        Returns:
            Points earned for this hit (0 if incorrect).
        """
        reaction_time = time.time() - self._instruction_start_time if self._instruction_start_time else 0.0

        record = HitRecord(
            target_value=target_value,
            body_part=body_part,
            is_correct=is_correct,
            reaction_time=reaction_time,
            timestamp=time.time(),
        )
        self._hits.append(record)

        if is_correct:
            # Update combo
            self._current_combo += 1
            self._max_combo = max(self._max_combo, self._current_combo)

            # Calculate points
            combo_multiplier = min(
                1.0 + self._current_combo * self.COMBO_INCREMENT,
                self.MAX_COMBO_MULTIPLIER,
            )
            points = int(self.BASE_POINTS * combo_multiplier)

            # Time bonus
            if 0 < reaction_time < self.TIME_BONUS_THRESHOLD:
                time_bonus = int(
                    (self.TIME_BONUS_THRESHOLD - reaction_time)
                    / self.TIME_BONUS_THRESHOLD * 50
                )
                points += time_bonus

            self._total_score += points

            logger.debug(
                f"Correct hit! target={target_value}, combo={self._current_combo}, "
                f"points={points}, reaction={reaction_time:.2f}s"
            )
            return points
        else:
            # Reset combo on mistake
            self._current_combo = 0

            logger.debug(
                f"Incorrect hit: target={target_value}, combo reset, "
                f"reaction={reaction_time:.2f}s"
            )
            return 0

    def get_score(self) -> int:
        """Get current total score."""
        return self._total_score

    def get_accuracy(self) -> float:
        """Get current accuracy (0.0 – 1.0)."""
        if not self._hits:
            return 0.0
        correct = sum(1 for h in self._hits if h.is_correct)
        return correct / len(self._hits)

    def get_combo(self) -> int:
        """Get current combo streak."""
        return self._current_combo

    def get_max_combo(self) -> int:
        """Get maximum combo achieved."""
        return self._max_combo

    def get_mistakes(self) -> int:
        """Get total number of incorrect hits."""
        return sum(1 for h in self._hits if not h.is_correct)

    def get_summary(self) -> ScoreSummary:
        """Get full score summary."""
        correct_hits = [h for h in self._hits if h.is_correct]
        reaction_times = [h.reaction_time for h in correct_hits if h.reaction_time > 0]

        return ScoreSummary(
            total_score=self._total_score,
            accuracy=self.get_accuracy(),
            max_combo=self._max_combo,
            current_combo=self._current_combo,
            total_hits=len(self._hits),
            total_correct=len(correct_hits),
            total_mistakes=self.get_mistakes(),
            avg_reaction_time=sum(reaction_times) / len(reaction_times) if reaction_times else 0.0,
            fastest_reaction=min(reaction_times) if reaction_times else 0.0,
            slowest_reaction=max(reaction_times) if reaction_times else 0.0,
        )

    def get_hit_records(self) -> list[HitRecord]:
        """Get all hit records for session persistence."""
        return list(self._hits)

    def reset(self) -> None:
        """Reset all scores for a new session."""
        self._hits.clear()
        self._total_score = 0
        self._current_combo = 0
        self._max_combo = 0
        self._instruction_start_time = 0.0
