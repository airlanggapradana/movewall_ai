"""
Pygame Renderer — draws all game visuals to the projector display.

Renders targets (numbers, letters, shapes), skeleton overlay, HUD (score,
timer, instruction), countdown, and feedback animations.
Visual style is colorful and child-friendly with large fonts and high contrast.
"""

import logging
import math
import time
from typing import Optional

import pygame

from ai_engine.config import (
    COLORS,
    FONT_SIZE_LARGE,
    FONT_SIZE_MEDIUM,
    FONT_SIZE_SMALL,
    FONT_SIZE_TARGET,
    FONT_SIZE_XLARGE,
    PROJECTOR_DISPLAY_INDEX,
    PROJECTOR_FULLSCREEN,
    PROJECTOR_HEIGHT,
    PROJECTOR_WIDTH,
)
from ai_engine.core.collision_detector import Target

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# Skeleton connections (MediaPipe Pose pairs)
# ──────────────────────────────────────────────
SKELETON_CONNECTIONS = [
    # Torso
    (11, 12), (11, 23), (12, 24), (23, 24),
    # Left arm
    (11, 13), (13, 15),
    # Right arm
    (12, 14), (14, 16),
    # Left leg
    (23, 25), (25, 27), (27, 31),
    # Right leg
    (24, 26), (26, 28), (28, 32),
    # Left hand details
    (15, 17), (15, 19), (15, 21),
    # Right hand details
    (16, 18), (16, 20), (16, 22),
]


class GameRenderer:
    """
    Handles all Pygame rendering for the projected wall display.

    Creates a fullscreen Pygame window on the projector display and provides
    methods to render targets, skeleton, HUD overlay, countdown, and feedback.
    """

    def __init__(
        self,
        width: int = PROJECTOR_WIDTH,
        height: int = PROJECTOR_HEIGHT,
        fullscreen: bool = PROJECTOR_FULLSCREEN,
    ):
        self._width = width
        self._height = height
        self._fullscreen = fullscreen
        self._screen: Optional[pygame.Surface] = None
        self._clock: Optional[pygame.time.Clock] = None
        self._fonts: dict[str, pygame.font.Font] = {}
        self._initialized = False

        # Animation state
        self._feedback_text: Optional[str] = None
        self._feedback_color: tuple = COLORS["success"]
        self._feedback_start: float = 0.0
        self._feedback_duration: float = 1.0

        # Particle effects
        self._particles: list[dict] = []

    def init(self) -> bool:
        """
        Initialize Pygame display and fonts.

        Returns True on success.
        """
        try:
            if not pygame.get_init():
                pygame.init()

            # Set up display
            if self._fullscreen:
                import os
                os.environ["SDL_VIDEO_WINDOW_POS"] = f"{self._width},{0}"  # Position on second monitor
                flags = pygame.FULLSCREEN | pygame.HWSURFACE | pygame.DOUBLEBUF
                self._screen = pygame.display.set_mode(
                    (self._width, self._height), flags,
                )
            else:
                self._screen = pygame.display.set_mode(
                    (self._width, self._height),
                )

            pygame.display.set_caption("Smart Wall Climbing")
            self._clock = pygame.time.Clock()

            # Initialize fonts
            pygame.font.init()
            self._fonts = {
                "small": pygame.font.SysFont("Arial", FONT_SIZE_SMALL, bold=True),
                "medium": pygame.font.SysFont("Arial", FONT_SIZE_MEDIUM, bold=True),
                "large": pygame.font.SysFont("Arial", FONT_SIZE_LARGE, bold=True),
                "xlarge": pygame.font.SysFont("Arial", FONT_SIZE_XLARGE, bold=True),
                "target": pygame.font.SysFont("Arial", FONT_SIZE_TARGET, bold=True),
            }

            self._initialized = True
            logger.info(f"GameRenderer initialized ({self._width}x{self._height})")
            return True

        except Exception as e:
            logger.error(f"Failed to initialize GameRenderer: {e}")
            return False

    def clear(self) -> None:
        """Clear the screen with the background color."""
        if self._screen:
            self._screen.fill(COLORS["background"])

    def render_targets(self, targets: list[Target]) -> None:
        """
        Render game targets on the screen.

        Each target is drawn as a colored circle with its value (number/letter)
        centered inside. Inactive targets are dimmed.
        """
        if not self._screen:
            return

        for target in targets:
            if not target.is_active:
                continue

            x, y = int(target.x), int(target.y)
            size = int(target.size)
            color = target.color

            # Outer glow ring (pulsing animation)
            pulse = math.sin(time.time() * 3) * 0.15 + 0.85
            glow_radius = int(size * 1.3 * pulse)
            glow_color = tuple(min(255, int(c * 0.4)) for c in color)
            pygame.draw.circle(self._screen, glow_color, (x, y), glow_radius)

            # Main circle with gradient-like effect
            pygame.draw.circle(self._screen, color, (x, y), size)

            # Inner highlight (simulates 3D)
            highlight_color = tuple(min(255, c + 60) for c in color)
            pygame.draw.circle(self._screen, highlight_color, (x - size // 5, y - size // 5), size // 3)

            # Border
            pygame.draw.circle(self._screen, COLORS["white"], (x, y), size, 3)

            # Value text (number/letter)
            text_surface = self._fonts["target"].render(
                target.value, True, COLORS["white"],
            )
            text_rect = text_surface.get_rect(center=(x, y))
            self._screen.blit(text_surface, text_rect)

    def render_skeleton(
        self,
        all_landmarks: list,
        key_points: dict,
        scale_x: float = 1.0,
        scale_y: float = 1.0,
        offset_x: float = 0.0,
        offset_y: float = 0.0,
    ) -> None:
        """
        Render the player's body skeleton on the projected display.

        Args:
            all_landmarks: List of all landmark Points from PoseResult.
            key_points: Dict of key body points from PoseResult.get_key_points().
            scale_x/scale_y: Scale factors for camera-to-projector mapping.
            offset_x/offset_y: Offset for camera-to-projector mapping.
        """
        if not self._screen or not all_landmarks:
            return

        def transform(point):
            return (
                int(point.x * scale_x + offset_x),
                int(point.y * scale_y + offset_y),
            )

        # Draw connections (bones)
        for start_idx, end_idx in SKELETON_CONNECTIONS:
            if start_idx < len(all_landmarks) and end_idx < len(all_landmarks):
                p1 = all_landmarks[start_idx]
                p2 = all_landmarks[end_idx]
                if p1.visibility > 0.3 and p2.visibility > 0.3:
                    pt1 = transform(p1)
                    pt2 = transform(p2)
                    pygame.draw.line(
                        self._screen, COLORS["skeleton"], pt1, pt2, 4,
                    )

        # Draw joints
        for landmark in all_landmarks:
            if landmark.visibility > 0.3:
                pt = transform(landmark)
                pygame.draw.circle(
                    self._screen, COLORS["skeleton_joint"], pt, 6,
                )
                pygame.draw.circle(
                    self._screen, COLORS["skeleton"], pt, 6, 2,
                )

        # Draw hand/foot indicators (larger, more visible)
        hand_foot_keys = ["leftHand", "rightHand", "leftFoot", "rightFoot"]
        for key in hand_foot_keys:
            if key in key_points:
                px = int(key_points[key][0] * scale_x + offset_x)
                py = int(key_points[key][1] * scale_y + offset_y)
                # Pulsing circle for touchable points
                pulse = math.sin(time.time() * 5) * 3 + 15
                pygame.draw.circle(
                    self._screen, (255, 255, 100), (px, py), int(pulse), 3,
                )

    def render_hud(
        self,
        score: int,
        timer_seconds: int,
        instruction: str,
        combo: int = 0,
        accuracy: float = 0.0,
    ) -> None:
        """
        Render the heads-up display overlay.

        Shows score (top-left), timer (top-right), instruction (top-center),
        combo streak, and accuracy bar.
        """
        if not self._screen:
            return

        # ── Score (top-left) ──
        score_text = self._fonts["medium"].render(
            f"Score: {score}", True, COLORS["white"],
        )
        self._screen.blit(score_text, (30, 20))

        # ── Combo (below score) ──
        if combo > 1:
            combo_color = COLORS["warning"] if combo < 5 else COLORS["success"]
            combo_text = self._fonts["small"].render(
                f"Combo x{combo}!", True, combo_color,
            )
            self._screen.blit(combo_text, (30, 65))

        # ── Timer (top-right) ──
        minutes = timer_seconds // 60
        seconds = timer_seconds % 60
        timer_color = COLORS["white"] if timer_seconds > 10 else COLORS["danger"]
        timer_text = self._fonts["medium"].render(
            f"{minutes:02d}:{seconds:02d}", True, timer_color,
        )
        timer_rect = timer_text.get_rect(topright=(self._width - 30, 20))
        self._screen.blit(timer_text, timer_rect)

        # ── Accuracy (top-right, below timer) ──
        acc_text = self._fonts["small"].render(
            f"Accuracy: {accuracy * 100:.0f}%", True, COLORS["gray"],
        )
        acc_rect = acc_text.get_rect(topright=(self._width - 30, 65))
        self._screen.blit(acc_text, acc_rect)

        # ── Instruction (top-center) ──
        if instruction:
            inst_surface = self._fonts["large"].render(
                instruction, True, COLORS["info"],
            )
            inst_rect = inst_surface.get_rect(
                midtop=(self._width // 2, 20),
            )
            # Background pill
            padding = 20
            bg_rect = inst_rect.inflate(padding * 2, padding)
            bg_surface = pygame.Surface(bg_rect.size, pygame.SRCALPHA)
            bg_surface.fill((0, 0, 0, 160))
            self._screen.blit(bg_surface, bg_rect)
            self._screen.blit(inst_surface, inst_rect)

    def render_countdown(self, number: int) -> None:
        """
        Render a large countdown number in the center of the screen.

        Args:
            number: Countdown number (3, 2, 1) or 0 for "GO!".
        """
        if not self._screen:
            return

        self.clear()

        text = str(number) if number > 0 else "GO!"
        color = COLORS["countdown"] if number > 0 else COLORS["success"]

        # Large pulsing text
        scale = 1.0 + math.sin(time.time() * 8) * 0.1
        font_size = int(FONT_SIZE_XLARGE * 1.5 * scale)
        font = pygame.font.SysFont("Arial", font_size, bold=True)

        text_surface = font.render(text, True, color)
        text_rect = text_surface.get_rect(center=(self._width // 2, self._height // 2))
        self._screen.blit(text_surface, text_rect)

        # Sub text
        sub_font = self._fonts.get("medium")
        if sub_font and number > 0:
            sub_text = sub_font.render("Get Ready!", True, COLORS["gray"])
            sub_rect = sub_text.get_rect(
                center=(self._width // 2, self._height // 2 + 100),
            )
            self._screen.blit(sub_text, sub_rect)

    def render_feedback(self, text: str, is_success: bool) -> None:
        """
        Start a feedback animation (e.g., "Excellent!" or "Try Again!").

        The feedback is displayed as a large floating text that fades out.
        """
        self._feedback_text = text
        self._feedback_color = COLORS["success"] if is_success else COLORS["danger"]
        self._feedback_start = time.time()

        if is_success:
            # Spawn celebration particles
            self._spawn_particles(
                self._width // 2, self._height // 2,
                count=20, color=self._feedback_color,
            )

    def _render_active_feedback(self) -> None:
        """Render the currently active feedback animation (called each frame)."""
        if not self._feedback_text or not self._screen:
            return

        elapsed = time.time() - self._feedback_start
        if elapsed > self._feedback_duration:
            self._feedback_text = None
            return

        # Fade out
        alpha = max(0, 255 - int(255 * (elapsed / self._feedback_duration)))
        # Float upward
        y_offset = int(elapsed * 80)

        text_surface = self._fonts["large"].render(
            self._feedback_text, True, self._feedback_color,
        )
        text_surface.set_alpha(alpha)
        text_rect = text_surface.get_rect(
            center=(self._width // 2, self._height // 2 - y_offset),
        )
        self._screen.blit(text_surface, text_rect)

    def _spawn_particles(self, x: int, y: int, count: int, color: tuple) -> None:
        """Spawn celebration particles at position."""
        import random
        for _ in range(count):
            self._particles.append({
                "x": float(x),
                "y": float(y),
                "vx": random.uniform(-5, 5),
                "vy": random.uniform(-8, -2),
                "life": 1.0,
                "color": color,
                "size": random.randint(3, 8),
            })

    def _update_and_render_particles(self, dt: float) -> None:
        """Update and render particle effects."""
        if not self._screen:
            return

        alive = []
        for p in self._particles:
            p["x"] += p["vx"]
            p["y"] += p["vy"]
            p["vy"] += 0.3  # Gravity
            p["life"] -= dt * 2

            if p["life"] > 0:
                alpha = int(255 * p["life"])
                color = p["color"]
                pygame.draw.circle(
                    self._screen, color,
                    (int(p["x"]), int(p["y"])),
                    int(p["size"] * p["life"]),
                )
                alive.append(p)

        self._particles = alive

    def render_session_complete(self, score: int, accuracy: float, max_combo: int) -> None:
        """Render the session complete screen."""
        if not self._screen:
            return

        self.clear()

        # Title
        title = self._fonts["xlarge"].render("Session Complete!", True, COLORS["success"])
        title_rect = title.get_rect(center=(self._width // 2, self._height // 4))
        self._screen.blit(title, title_rect)

        # Stats
        y_start = self._height // 2 - 60
        stats = [
            f"Score: {score}",
            f"Accuracy: {accuracy * 100:.1f}%",
            f"Max Combo: {max_combo}x",
        ]
        for i, stat_text in enumerate(stats):
            surface = self._fonts["large"].render(stat_text, True, COLORS["white"])
            rect = surface.get_rect(center=(self._width // 2, y_start + i * 80))
            self._screen.blit(surface, rect)

    def render_waiting(self) -> None:
        """Render a waiting/idle screen before a session starts."""
        if not self._screen:
            return

        self.clear()

        # Animated title
        y_offset = math.sin(time.time() * 2) * 10
        title = self._fonts["xlarge"].render(
            "Smart Wall Climbing", True, COLORS["primary"],
        )
        title_rect = title.get_rect(
            center=(self._width // 2, self._height // 3 + y_offset),
        )
        self._screen.blit(title, title_rect)

        # Subtitle
        subtitle = self._fonts["medium"].render(
            "Waiting for session to start...", True, COLORS["gray"],
        )
        subtitle_rect = subtitle.get_rect(
            center=(self._width // 2, self._height // 2 + 40),
        )
        self._screen.blit(subtitle, subtitle_rect)

    def update(self, dt: float) -> None:
        """
        Update animations and flip the display.

        Call this at the end of each frame after all rendering.

        Args:
            dt: Delta time in seconds since the last frame.
        """
        if not self._screen:
            return

        self._render_active_feedback()
        self._update_and_render_particles(dt)
        pygame.display.flip()

    def tick(self, fps: int) -> float:
        """
        Tick the frame clock and return delta time.

        Args:
            fps: Target frames per second.

        Returns:
            Delta time in seconds.
        """
        if self._clock:
            return self._clock.tick(fps) / 1000.0
        return 1.0 / fps

    @property
    def screen(self) -> Optional[pygame.Surface]:
        return self._screen

    @property
    def size(self) -> tuple[int, int]:
        return self._width, self._height

    def cleanup(self) -> None:
        """Clean up Pygame resources."""
        if self._initialized:
            pygame.quit()
            self._initialized = False
            logger.info("GameRenderer cleaned up.")
