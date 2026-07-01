"""
Session Manager — therapy session lifecycle management.

Manages the state machine for therapy sessions:
  IDLE → COUNTDOWN → PLAYING → PAUSED → FINISHED

Handles session creation, state transitions, auto-save to database,
and emits events for real-time WebSocket broadcasting.
"""

import enum
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Optional

from ai_engine.config import GAME_COUNTDOWN_SECONDS, GAME_DEFAULT_DURATION

logger = logging.getLogger(__name__)


class SessionState(str, enum.Enum):
    IDLE = "idle"
    COUNTDOWN = "countdown"
    PLAYING = "playing"
    PAUSED = "paused"
    FINISHED = "finished"


@dataclass
class SessionConfig:
    """Configuration for a therapy session."""
    child_id: str = ""
    child_name: str = ""
    therapist_id: str = ""
    game_type: str = "number"
    stage: int = 1
    difficulty: int = 1
    duration: int = GAME_DEFAULT_DURATION      # seconds
    countdown: int = GAME_COUNTDOWN_SECONDS


@dataclass
class SessionInfo:
    """Current state information of the session."""
    session_id: str = ""
    state: SessionState = SessionState.IDLE
    config: SessionConfig = field(default_factory=SessionConfig)

    # Timing
    start_time: float = 0.0
    elapsed_time: float = 0.0
    remaining_time: int = 0
    pause_time: float = 0.0
    total_paused_duration: float = 0.0

    # Countdown
    countdown_remaining: int = 0

    # Current instruction
    current_instruction: str = ""

    # Score snapshot
    score: int = 0
    accuracy: float = 0.0
    combo: int = 0


class SessionManager:
    """
    Manages the lifecycle of a therapy session.

    Provides state machine transitions and timing control.
    Callbacks can be registered for state change events.
    """

    def __init__(self):
        self._info = SessionInfo()
        self._event_callbacks: list[Callable] = []

    @property
    def info(self) -> SessionInfo:
        return self._info

    @property
    def state(self) -> SessionState:
        return self._info.state

    @property
    def is_active(self) -> bool:
        """Whether the session is in an active state (countdown, playing, paused)."""
        return self._info.state in (
            SessionState.COUNTDOWN,
            SessionState.PLAYING,
            SessionState.PAUSED,
        )

    @property
    def is_playing(self) -> bool:
        return self._info.state == SessionState.PLAYING

    @property
    def is_paused(self) -> bool:
        return self._info.state == SessionState.PAUSED

    def on_event(self, callback: Callable) -> None:
        """Register a callback for session state change events."""
        self._event_callbacks.append(callback)

    def _emit(self, event_name: str, data: dict = None) -> None:
        """Emit an event to all registered callbacks."""
        for cb in self._event_callbacks:
            try:
                cb(event_name, data or {})
            except Exception as e:
                logger.error(f"Event callback error: {e}")

    def create_session(
        self,
        session_id: str,
        config: SessionConfig,
    ) -> SessionInfo:
        """
        Create a new session with the given config.

        The session starts in IDLE state.
        """
        self._info = SessionInfo(
            session_id=session_id,
            state=SessionState.IDLE,
            config=config,
            remaining_time=config.duration,
        )
        self._emit("session_created", {"session_id": session_id})
        logger.info(f"Session created: {session_id} for child {config.child_name}")
        return self._info

    def start(self) -> bool:
        """
        Start the session (transitions to COUNTDOWN).

        Returns True if transition was successful.
        """
        if self._info.state != SessionState.IDLE:
            logger.warning(f"Cannot start session in state: {self._info.state}")
            return False

        self._info.state = SessionState.COUNTDOWN
        self._info.countdown_remaining = self._info.config.countdown
        self._info.start_time = time.time()
        self._emit("session_start", {"session_id": self._info.session_id})
        logger.info("Session starting — countdown...")
        return True

    def finish_countdown(self) -> bool:
        """Transition from COUNTDOWN to PLAYING."""
        if self._info.state != SessionState.COUNTDOWN:
            return False

        self._info.state = SessionState.PLAYING
        self._info.start_time = time.time()
        self._info.elapsed_time = 0.0
        self._emit("game_start", {"session_id": self._info.session_id})
        logger.info("Countdown finished — game started!")
        return True

    def pause(self) -> bool:
        """Pause the session."""
        if self._info.state != SessionState.PLAYING:
            return False

        self._info.state = SessionState.PAUSED
        self._info.pause_time = time.time()
        self._emit("session_paused", {"session_id": self._info.session_id})
        logger.info("Session paused.")
        return True

    def resume(self) -> bool:
        """Resume the session from pause."""
        if self._info.state != SessionState.PAUSED:
            return False

        paused_duration = time.time() - self._info.pause_time
        self._info.total_paused_duration += paused_duration
        self._info.state = SessionState.PLAYING
        self._emit("session_resumed", {"session_id": self._info.session_id})
        logger.info(f"Session resumed (paused for {paused_duration:.1f}s).")
        return True

    def finish(self) -> bool:
        """Finish the session (from any active state)."""
        if not self.is_active:
            return False

        self._info.state = SessionState.FINISHED
        self._info.elapsed_time = self._calculate_elapsed()
        self._emit("session_end", {
            "session_id": self._info.session_id,
            "duration": int(self._info.elapsed_time),
            "score": self._info.score,
            "accuracy": self._info.accuracy,
        })
        logger.info(
            f"Session finished — duration={self._info.elapsed_time:.0f}s, "
            f"score={self._info.score}"
        )
        return True

    def update_timer(self) -> int:
        """
        Update and return remaining time in seconds.

        Automatically finishes the session when time runs out.
        """
        if self._info.state == SessionState.PLAYING:
            elapsed = self._calculate_elapsed()
            self._info.elapsed_time = elapsed
            self._info.remaining_time = max(
                0, self._info.config.duration - int(elapsed)
            )

            if self._info.remaining_time <= 0:
                self.finish()

        return self._info.remaining_time

    def update_countdown(self, dt: float) -> int:
        """
        Update countdown timer. Returns remaining countdown seconds.

        When countdown reaches 0, transitions to PLAYING.
        """
        if self._info.state != SessionState.COUNTDOWN:
            return 0

        elapsed_since_start = time.time() - self._info.start_time
        self._info.countdown_remaining = max(
            0, self._info.config.countdown - int(elapsed_since_start)
        )

        if self._info.countdown_remaining <= 0:
            self.finish_countdown()

        return self._info.countdown_remaining

    def update_score(self, score: int, accuracy: float, combo: int) -> None:
        """Update score snapshot in session info."""
        self._info.score = score
        self._info.accuracy = accuracy
        self._info.combo = combo
        self._emit("score_update", {
            "score": score,
            "accuracy": accuracy,
            "combo": combo,
        })

    def set_instruction(self, instruction: str) -> None:
        """Set the current game instruction text."""
        self._info.current_instruction = instruction

    def _calculate_elapsed(self) -> float:
        """Calculate actual playing time (excluding pauses)."""
        if self._info.start_time == 0:
            return 0.0

        total = time.time() - self._info.start_time
        return total - self._info.total_paused_duration

    def reset(self) -> None:
        """Reset to IDLE state."""
        self._info = SessionInfo()
