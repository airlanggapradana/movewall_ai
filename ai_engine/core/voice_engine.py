"""
Voice Engine — Text-to-Speech for game instructions and feedback.

Speaks game instructions (e.g., "Find number 5") and feedback
(e.g., "Excellent!", "Try Again!") using pyttsx3 (offline) or gTTS.
Runs in a separate thread to avoid blocking the game loop.
"""

import logging
import queue
import threading
from typing import Optional

from ai_engine.config import VOICE_ENGINE, VOICE_LANGUAGE, VOICE_RATE, VOICE_VOLUME

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# Predefined voice messages
# ──────────────────────────────────────────────
MESSAGES = {
    "en": {
        # Instructions
        "find_number": "Find number {}",
        "find_letter": "Find letter {}",
        "find_color": "Touch {} color",
        "find_shape": "Find {}",

        # Feedback — positive
        "excellent": "Excellent!",
        "good_job": "Good Job!",
        "amazing": "Amazing!",
        "well_done": "Well done!",
        "perfect": "Perfect!",
        "great": "Great!",

        # Feedback — negative
        "try_again": "Try again!",
        "not_quite": "Not quite, try again!",
        "oops": "Oops!",

        # Game flow
        "get_ready": "Get ready!",
        "go": "Go!",
        "time_up": "Time is up!",
        "session_complete": "Session complete! Great work!",
        "next_one": "Next one!",
        "countdown_3": "3",
        "countdown_2": "2",
        "countdown_1": "1",
    },
    "id": {
        # Instructions
        "find_number": "Cari angka {}",
        "find_letter": "Cari huruf {}",
        "find_color": "Sentuh warna {}",
        "find_shape": "Cari bentuk {}",

        # Feedback — positive
        "excellent": "Luar biasa!",
        "good_job": "Bagus sekali!",
        "amazing": "Hebat!",
        "well_done": "Kerja bagus!",
        "perfect": "Sempurna!",
        "great": "Bagus!",

        # Feedback — negative
        "try_again": "Coba lagi!",
        "not_quite": "Belum tepat, coba lagi!",
        "oops": "Ups!",

        # Game flow
        "get_ready": "Bersiap!",
        "go": "Mulai!",
        "time_up": "Waktu habis!",
        "session_complete": "Sesi selesai! Kerja bagus!",
        "next_one": "Selanjutnya!",
        "countdown_3": "3",
        "countdown_2": "2",
        "countdown_1": "1",
    },
}

POSITIVE_FEEDBACK = ["excellent", "good_job", "amazing", "well_done", "perfect", "great"]
NEGATIVE_FEEDBACK = ["try_again", "not_quite", "oops"]


class VoiceEngine:
    """
    Text-to-Speech engine for game instructions and feedback.

    Uses pyttsx3 for offline TTS. Runs speech in a background thread
    with a queue to prevent overlapping audio and blocking the game loop.
    """

    def __init__(
        self,
        engine_type: str = VOICE_ENGINE,
        language: str = VOICE_LANGUAGE,
    ):
        self._engine_type = engine_type
        self._language = language
        self._messages = MESSAGES.get(language, MESSAGES["en"])
        self._queue: queue.Queue = queue.Queue()
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._engine = None
        self._feedback_index = 0  # Rotate through feedback messages

    def start(self) -> None:
        """Start the voice engine background thread."""
        if self._running:
            return

        self._running = True
        self._thread = threading.Thread(target=self._worker, daemon=True)
        self._thread.start()
        logger.info(f"VoiceEngine started ({self._engine_type}, lang={self._language})")

    def _init_pyttsx3(self):
        """Initialize pyttsx3 engine (must be done in the worker thread)."""
        import pyttsx3
        engine = pyttsx3.init()
        engine.setProperty("rate", VOICE_RATE)
        engine.setProperty("volume", VOICE_VOLUME)
        return engine

    def _worker(self) -> None:
        """Background thread that processes the speech queue."""
        self._engine = self._init_pyttsx3()

        while self._running:
            try:
                text = self._queue.get(timeout=0.5)
                if text is None:  # Poison pill
                    break
                self._engine.say(text)
                self._engine.runAndWait()
                self._queue.task_done()
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"VoiceEngine error: {e}")

        if self._engine:
            self._engine.stop()

    def speak(self, text: str) -> None:
        """
        Queue text to be spoken. Non-blocking.

        Args:
            text: Raw text string to speak.
        """
        if not self._running:
            logger.warning("VoiceEngine not started; call start() first.")
            return
        self._queue.put(text)

    def speak_instruction(self, game_type: str, target_value: str) -> None:
        """
        Speak a game instruction.

        Args:
            game_type: One of "number", "letter", "color", "shape".
            target_value: The value to find (e.g., "5", "A", "red", "triangle").
        """
        key = f"find_{game_type}"
        template = self._messages.get(key, "Find {}")
        self.speak(template.format(target_value))

    def speak_positive_feedback(self) -> None:
        """Speak a positive feedback message, rotating through options."""
        key = POSITIVE_FEEDBACK[self._feedback_index % len(POSITIVE_FEEDBACK)]
        self._feedback_index += 1
        self.speak(self._messages[key])

    def speak_negative_feedback(self) -> None:
        """Speak a negative feedback message."""
        import random
        key = random.choice(NEGATIVE_FEEDBACK)
        self.speak(self._messages[key])

    def speak_key(self, message_key: str) -> None:
        """Speak a predefined message by key."""
        text = self._messages.get(message_key)
        if text:
            self.speak(text)
        else:
            logger.warning(f"Unknown message key: {message_key}")

    def clear_queue(self) -> None:
        """Clear all pending speech items."""
        while not self._queue.empty():
            try:
                self._queue.get_nowait()
            except queue.Empty:
                break

    def set_language(self, language: str) -> None:
        """Switch language (en / id)."""
        if language in MESSAGES:
            self._language = language
            self._messages = MESSAGES[language]
            logger.info(f"VoiceEngine language changed to: {language}")
        else:
            logger.warning(f"Unsupported language: {language}")

    def stop(self) -> None:
        """Stop the voice engine and background thread."""
        self._running = False
        self._queue.put(None)  # Poison pill
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3.0)
        logger.info("VoiceEngine stopped.")
