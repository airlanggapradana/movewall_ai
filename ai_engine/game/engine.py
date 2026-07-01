"""
Main Game Engine — the core game loop orchestrating all components.

Runs in Pygame's main thread and coordinates:
  1. Camera frame capture → Pose detection
  2. Coordinate mapping (camera → projector)
  3. Collision detection
  4. Game mode logic (instruction, scoring)
  5. Rendering (targets, skeleton, HUD)
  6. WebSocket event broadcasting
"""

import logging
import time
from typing import Any, Callable, Optional

import pygame

from ai_engine.config import FPS_TARGET, PROJECTOR_HEIGHT, PROJECTOR_WIDTH
from ai_engine.core.collision_detector import CollisionDetector
from ai_engine.core.pose_detector import PoseDetector, PoseResult
from ai_engine.core.score_engine import ScoreEngine
from ai_engine.core.voice_engine import VoiceEngine
from ai_engine.game.modes.base_mode import BaseGameMode
from ai_engine.game.modes.number_game import NumberGame
from ai_engine.game.renderer import GameRenderer
from ai_engine.game.session_manager import SessionConfig, SessionManager, SessionState
from ai_engine.utils.calibration import CoordinateMapper

logger = logging.getLogger(__name__)


class GameEngine:
    """
    Main game loop orchestrating pose detection, collision, scoring,
    and rendering for the Smart Wall Climbing system.

    The game engine runs in the main thread (required by Pygame) and
    communicates with the FastAPI server via shared state and callbacks.
    """

    def __init__(self):
        # Core components
        self._pose_detector = PoseDetector()
        self._collision_detector = CollisionDetector()
        self._voice_engine = VoiceEngine()
        self._score_engine = ScoreEngine()
        self._renderer = GameRenderer()
        self._session_manager = SessionManager()
        self._coord_mapper = CoordinateMapper()

        # Game mode
        self._game_mode: Optional[BaseGameMode] = None

        # State
        self._running = False
        self._latest_pose: Optional[PoseResult] = None

        # WebSocket broadcast callback
        self._broadcast_callback: Optional[Callable] = None

        # Session event handlers
        self._session_manager.on_event(self._on_session_event)

    def set_broadcast_callback(self, callback: Callable) -> None:
        """Set the callback for broadcasting events to WebSocket clients."""
        self._broadcast_callback = callback

    def _broadcast(self, event: str, data: dict) -> None:
        """Broadcast an event to connected WebSocket clients."""
        if self._broadcast_callback:
            try:
                self._broadcast_callback(event, data)
            except Exception as e:
                logger.error(f"Broadcast error: {e}")

    def _on_session_event(self, event_name: str, data: dict) -> None:
        """Handle session state change events."""
        self._broadcast(event_name, data)

    # ──────────────────────────────────────────
    # Initialization
    # ──────────────────────────────────────────
    def init(self) -> bool:
        """
        Initialize all components.

        Returns True if all components initialized successfully.
        """
        logger.info("Initializing GameEngine...")

        # Initialize renderer (Pygame)
        if not self._renderer.init():
            logger.error("Failed to initialize renderer")
            return False

        # Initialize pose detector (camera)
        if not self._pose_detector.start():
            logger.error("Failed to start pose detector")
            return False

        # Set up coordinate mapping
        cam_w, cam_h = self._pose_detector.frame_size
        self._coord_mapper.set_simple_mapping(
            src_width=cam_w,
            src_height=cam_h,
            dst_width=PROJECTOR_WIDTH,
            dst_height=PROJECTOR_HEIGHT,
        )

        # Start voice engine
        self._voice_engine.start()

        logger.info("GameEngine initialized successfully!")
        return True

    # ──────────────────────────────────────────
    # Session Control (called from API)
    # ──────────────────────────────────────────
    def start_session(self, session_id: str, config: SessionConfig) -> bool:
        """
        Start a new therapy session.

        Args:
            session_id: Database session UUID.
            config: Session configuration.

        Returns:
            True if session started successfully.
        """
        # Create game mode based on config
        if config.game_type == "number":
            self._game_mode = NumberGame(
                stage=config.stage,
                difficulty=config.difficulty,
            )
        else:
            logger.error(f"Unsupported game type: {config.game_type}")
            return False

        # Generate stage
        self._game_mode.generate_stage(PROJECTOR_WIDTH, PROJECTOR_HEIGHT)

        # Reset score
        self._score_engine.reset()
        self._collision_detector.reset()

        # Create session
        self._session_manager.create_session(session_id, config)
        self._session_manager.start()

        logger.info(f"Session started: {config.game_type} stage {config.stage}")
        return True

    def pause_session(self) -> bool:
        """Pause the current session."""
        return self._session_manager.pause()

    def resume_session(self) -> bool:
        """Resume the current session."""
        return self._session_manager.resume()

    def stop_session(self) -> dict:
        """
        Stop the current session and return the final score summary.

        Returns:
            Dict with session results.
        """
        self._session_manager.finish()
        summary = self._score_engine.get_summary()
        self._voice_engine.speak_key("session_complete")

        return {
            "session_id": self._session_manager.info.session_id,
            "total_score": summary.total_score,
            "accuracy": summary.accuracy,
            "max_combo": summary.max_combo,
            "total_hits": summary.total_hits,
            "total_correct": summary.total_correct,
            "total_mistakes": summary.total_mistakes,
            "avg_reaction_time": summary.avg_reaction_time,
            "duration": int(self._session_manager.info.elapsed_time),
            "hit_records": [
                {
                    "target": h.target_value,
                    "body_part": h.body_part,
                    "correct": h.is_correct,
                    "reaction_time": h.reaction_time,
                }
                for h in self._score_engine.get_hit_records()
            ],
        }

    # ──────────────────────────────────────────
    # Main Game Loop
    # ──────────────────────────────────────────
    def run(self) -> None:
        """
        Main game loop. Runs until self._running is set to False.

        This must run in the main thread (Pygame requirement).
        """
        self._running = True
        logger.info("Game loop started.")

        while self._running:
            dt = self._renderer.tick(FPS_TARGET)

            # Handle Pygame events
            if not self._handle_events():
                break

            # Read camera frame
            frame = self._pose_detector.read_frame()

            # Detect pose
            pose_result = PoseResult()
            if frame is not None:
                pose_result = self._pose_detector.detect(frame)
                self._latest_pose = pose_result

            state = self._session_manager.state

            # ── IDLE: show waiting screen ──
            if state == SessionState.IDLE:
                self._renderer.clear()
                self._renderer.render_waiting()

                # Show skeleton if detected (so therapist can verify tracking)
                if pose_result.detected:
                    self._render_skeleton(pose_result)

                self._renderer.update(dt)
                continue

            # ── COUNTDOWN ──
            if state == SessionState.COUNTDOWN:
                countdown = self._session_manager.update_countdown(dt)
                self._renderer.render_countdown(countdown)

                # Speak countdown
                if countdown > 0:
                    self._voice_engine.speak_key(f"countdown_{countdown}")

                if countdown == 0 and self._session_manager.is_playing:
                    # Countdown just finished — speak first instruction
                    self._voice_engine.speak_key("go")
                    if self._game_mode:
                        instruction = self._game_mode.get_instruction()
                        self._session_manager.set_instruction(instruction)
                        self._voice_engine.speak_instruction(
                            self._game_mode.get_game_type(),
                            self._game_mode.get_current_target_value(),
                        )
                        self._score_engine.start_instruction_timer()

                self._renderer.update(dt)
                continue

            # ── PAUSED ──
            if state == SessionState.PAUSED:
                self._renderer.clear()
                # Render targets (frozen) and HUD
                if self._game_mode:
                    self._renderer.render_targets(self._game_mode.get_active_targets())
                self._renderer.render_hud(
                    score=self._score_engine.get_score(),
                    timer_seconds=self._session_manager.info.remaining_time,
                    instruction="⏸ PAUSED",
                    combo=self._score_engine.get_combo(),
                    accuracy=self._score_engine.get_accuracy(),
                )
                self._renderer.update(dt)
                continue

            # ── FINISHED ──
            if state == SessionState.FINISHED:
                summary = self._score_engine.get_summary()
                self._renderer.render_session_complete(
                    score=summary.total_score,
                    accuracy=summary.accuracy,
                    max_combo=summary.max_combo,
                )
                self._renderer.update(dt)
                continue

            # ── PLAYING ──
            if state == SessionState.PLAYING and self._game_mode:
                self._renderer.clear()

                # Update timer
                remaining = self._session_manager.update_timer()

                # Broadcast timer
                self._broadcast("timer_update", {"remaining": remaining})

                # Get active targets
                targets = self._game_mode.get_active_targets()

                # Render targets
                self._renderer.render_targets(targets)

                # Process pose and collisions
                if pose_result.detected:
                    # Map coordinates and render skeleton
                    key_points = pose_result.get_key_points()
                    mapped_points = self._coord_mapper.map_points(key_points)
                    self._render_skeleton(pose_result)

                    # Broadcast pose
                    self._broadcast("pose_update", mapped_points)

                    # Check collisions using mapped touchable points
                    touchable = pose_result.get_touchable_points()
                    mapped_touchable = {}
                    for name, point in touchable.items():
                        mx, my = self._coord_mapper.map_point(point.x, point.y)
                        from ai_engine.core.pose_detector import Point
                        mapped_touchable[name] = Point(x=mx, y=my, visibility=point.visibility)

                    collision = self._collision_detector.get_confirmed_collision(
                        mapped_touchable, targets,
                    )

                    if collision:
                        self._handle_collision(collision)

                # Check if stage is complete
                if self._game_mode.is_stage_complete():
                    self._voice_engine.speak_key("session_complete")
                    self._session_manager.finish()

                # Render HUD
                self._renderer.render_hud(
                    score=self._score_engine.get_score(),
                    timer_seconds=remaining,
                    instruction=self._game_mode.get_instruction(),
                    combo=self._score_engine.get_combo(),
                    accuracy=self._score_engine.get_accuracy(),
                )

                # Update score in session
                self._session_manager.update_score(
                    self._score_engine.get_score(),
                    self._score_engine.get_accuracy(),
                    self._score_engine.get_combo(),
                )

                self._renderer.update(dt)

        self._cleanup()

    def _handle_collision(self, collision) -> None:
        """Process a confirmed collision with a target."""
        if not self._game_mode:
            return

        # Find the target object
        target = None
        for t in self._game_mode.get_targets():
            if t.id == collision.target_id:
                target = t
                break

        if not target:
            return

        # Check answer
        is_correct = self._game_mode.check_answer(target)

        # Record score
        points = self._score_engine.record_hit(
            target_value=collision.target_value,
            body_part=collision.body_part,
            is_correct=is_correct,
        )

        # Broadcast collision
        self._broadcast("collision_detected", {
            "target": collision.target_value,
            "body_part": collision.body_part,
            "correct": is_correct,
            "points": points,
        })

        if is_correct:
            # Deactivate the correct target
            self._game_mode.deactivate_target(target.id)
            self._collision_detector.reset()

            # Visual + audio feedback
            self._voice_engine.speak_positive_feedback()
            self._renderer.render_feedback("Correct!", True)

            # Advance to next instruction
            has_more = self._game_mode.advance()
            if has_more:
                instruction = self._game_mode.get_instruction()
                self._session_manager.set_instruction(instruction)
                self._voice_engine.speak_instruction(
                    self._game_mode.get_game_type(),
                    self._game_mode.get_current_target_value(),
                )
                self._score_engine.start_instruction_timer()

                # Broadcast new target
                self._broadcast("target_update", {
                    "instruction": instruction,
                    "target_value": self._game_mode.get_current_target_value(),
                })
        else:
            # Wrong answer feedback
            self._voice_engine.speak_negative_feedback()
            self._renderer.render_feedback("Try Again!", False)

    def _render_skeleton(self, pose_result: PoseResult) -> None:
        """Render skeleton with coordinate mapping."""
        if not pose_result.detected:
            return

        key_points = pose_result.get_key_points()
        mapped_key_points = self._coord_mapper.map_points(key_points)

        scale_x, scale_y = self._coord_mapper.get_scale()
        offset_x, offset_y = self._coord_mapper.get_offset()

        self._renderer.render_skeleton(
            all_landmarks=pose_result.all_landmarks,
            key_points=mapped_key_points,
            scale_x=scale_x,
            scale_y=scale_y,
            offset_x=offset_x,
            offset_y=offset_y,
        )

    def _handle_events(self) -> bool:
        """
        Handle Pygame events.

        Returns False if the game should quit.
        """
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self._running = False
                return False

            if event.type == pygame.KEYDOWN:
                # ESC to quit
                if event.key == pygame.K_ESCAPE:
                    self._running = False
                    return False

                # P to pause/resume
                if event.key == pygame.K_p:
                    if self._session_manager.is_playing:
                        self.pause_session()
                    elif self._session_manager.is_paused:
                        self.resume_session()

                # S to stop session
                if event.key == pygame.K_s:
                    if self._session_manager.is_active:
                        self.stop_session()

        return True

    def _cleanup(self) -> None:
        """Release all resources."""
        logger.info("Cleaning up GameEngine...")
        self._voice_engine.stop()
        self._pose_detector.release()
        self._renderer.cleanup()

    def stop(self) -> None:
        """Signal the game loop to stop."""
        self._running = False

    @property
    def session_manager(self) -> SessionManager:
        return self._session_manager

    @property
    def score_engine(self) -> ScoreEngine:
        return self._score_engine

    @property
    def latest_pose(self) -> Optional[PoseResult]:
        return self._latest_pose

    @property
    def is_running(self) -> bool:
        return self._running
