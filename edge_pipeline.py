"""
edge_pipeline.py
================
Orchestrator Edge AI Tracking untuk MoveWall AI.

Modul ini menggabungkan:
- Landmark filtering dan short-term interpolation
- ROM angle calculation
- Rep state machine
- Adaptive difficulty engine
- Payload JSON untuk Game UI

Input modul ini adalah 33 RawLandmark dari BlazePose/MediaPipe. Output-nya
adalah EdgeFrameResult yang siap dikirim ke game layer.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Optional

from adaptive_engine import AdaptiveEngine, FramePayload, RepQuality
from angle_calculator import calculate_angle
from landmark_filter import (
    FilteredLandmark,
    InterpolationState,
    LandmarkFilter,
    OCCLUSION_AUDIO_CUE,
    RawLandmark,
)
from rep_state_machine import RepResult, RepetitionStateMachine


@dataclass(frozen=True)
class ExerciseTrackingConfig:
    """Konfigurasi landmark dan batas ROM untuk satu jenis latihan."""

    exercise_type: str
    proximal_landmark_id: int
    vertex_landmark_id: int
    distal_landmark_id: int
    baseline_angle: float
    initial_target_rom: float
    min_rom_threshold: float
    max_safety_ceiling: float
    min_functional_rom: float
    reps_per_set: int = 5


RIGHT_ELBOW_FLEXION = ExerciseTrackingConfig(
    exercise_type="RIGHT_ELBOW_FLEXION",
    proximal_landmark_id=12,  # right shoulder
    vertex_landmark_id=14,  # right elbow
    distal_landmark_id=16,  # right wrist
    baseline_angle=20.0,
    initial_target_rom=90.0,
    min_rom_threshold=60.0,
    max_safety_ceiling=150.0,
    min_functional_rom=40.0,
    reps_per_set=5,
)


@dataclass
class EdgeFrameResult:
    """Output satu frame dari Edge AI pipeline."""

    frame_id: int
    current_angle: Optional[float]
    is_occluded: bool
    occlusion_warnings: dict[int, bool]
    payload: FramePayload
    filtered_landmarks: list[FilteredLandmark]
    rep_result: Optional[RepResult] = None
    set_summary: Optional[dict] = None

    def to_dict(self) -> dict:
        rep_result = None
        if self.rep_result:
            rep_result = {
                "status": self.rep_result.status.value,
                "peak_angle": self.rep_result.peak_angle,
                "rep_number": self.rep_result.rep_number,
                "angular_velocity_deg_s": self.rep_result.angular_velocity_deg_s,
                "duration_seconds": self.rep_result.duration_seconds,
            }

        return {
            "frame_id": self.frame_id,
            "current_angle": self.current_angle,
            "is_occluded": self.is_occluded,
            "occlusion_warnings": self.occlusion_warnings,
            "payload": self.payload.to_dict(),
            "rep_result": rep_result,
            "set_summary": self.set_summary,
        }

    def to_json(self, indent: Optional[int] = None) -> str:
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)


class EdgeTrackingPipeline:
    """Pipeline utama Edge AI yang menghasilkan payload untuk game.

    Video frame mentah tetap di client. Modul ini hanya menerima landmark
    numerik dari MediaPipe dan mengeluarkan metrik turunan.
    """

    def __init__(
        self,
        config: ExerciseTrackingConfig = RIGHT_ELBOW_FLEXION,
        landmark_filter: Optional[LandmarkFilter] = None,
    ) -> None:
        self.config = config
        self.landmark_filter = landmark_filter or LandmarkFilter(num_landmarks=33)
        self.fsm = RepetitionStateMachine(
            baseline_angle=config.baseline_angle,
            target_rom=config.initial_target_rom,
            min_rom_threshold=config.min_rom_threshold,
            peak_hold_frames=2,
            ascend_tolerance=5.0,
            descend_resting_tolerance=2.5,
        )
        self.engine = AdaptiveEngine(
            exercise_type=config.exercise_type,
            initial_target_rom=config.initial_target_rom,
            max_safety_ceiling=config.max_safety_ceiling,
            min_functional_rom=config.min_functional_rom,
            reps_per_set=config.reps_per_set,
        )

    def process_frame(
        self,
        frame_id: int,
        landmarks: list[RawLandmark],
        timestamp_seconds: Optional[float] = None,
    ) -> EdgeFrameResult:
        """Proses satu frame landmark dan hasilkan event/payload untuk game."""

        filtered, warnings = self.landmark_filter.process_frame(landmarks)
        tracked = self._get_tracked_landmarks(filtered)
        is_occluded = any(
            lm.interpolation_state == InterpolationState.OCCLUDED
            for lm in tracked
        )

        rep_result = None
        set_summary = None
        current_angle: Optional[float] = None

        if not is_occluded:
            current_angle = calculate_angle(
                (tracked[0].x, tracked[0].y),
                (tracked[1].x, tracked[1].y),
                (tracked[2].x, tracked[2].y),
            )

        if current_angle is not None:
            rep_result = self.fsm.update(current_angle, timestamp=timestamp_seconds)
            if rep_result is not None:
                quality = RepQuality[rep_result.status.value]
                self.engine.record_rep(
                    quality=quality,
                    peak_angle=rep_result.peak_angle,
                    rep_duration_seconds=rep_result.duration_seconds,
                )
                if self.engine.get_current_set_count() >= self.config.reps_per_set:
                    set_summary = self.end_set()

        payload_angle = current_angle if current_angle is not None else 0.0
        payload = self.engine.generate_payload(
            frame_id=frame_id,
            current_angle=payload_angle,
            fsm_state=self.fsm.state.value,
            rep_just_completed=rep_result is not None,
        )

        if is_occluded or warnings:
            payload.audio_cue = OCCLUSION_AUDIO_CUE
            payload.visual_overlay_color = "RED"

        return EdgeFrameResult(
            frame_id=frame_id,
            current_angle=current_angle,
            is_occluded=is_occluded,
            occlusion_warnings=warnings,
            payload=payload,
            filtered_landmarks=filtered,
            rep_result=rep_result,
            set_summary=set_summary,
        )

    def end_set(self) -> dict:
        """Akhiri set aktif dan sinkronkan target ROM FSM dengan engine."""
        summary = self.engine.end_set()
        self.fsm.target_rom = self.engine.target_rom
        return summary

    def trigger_pain_override(self) -> None:
        """Aktifkan override nyeri dan sinkronkan target ROM."""
        self.engine.trigger_pain_override()
        self.fsm.target_rom = self.engine.target_rom

    def reset(self) -> None:
        """Reset seluruh state sesi."""
        self.landmark_filter.reset()
        self.fsm.reset()
        self.engine = AdaptiveEngine(
            exercise_type=self.config.exercise_type,
            initial_target_rom=self.config.initial_target_rom,
            max_safety_ceiling=self.config.max_safety_ceiling,
            min_functional_rom=self.config.min_functional_rom,
            reps_per_set=self.config.reps_per_set,
        )

    def _get_tracked_landmarks(
        self,
        filtered: list[FilteredLandmark],
    ) -> tuple[FilteredLandmark, FilteredLandmark, FilteredLandmark]:
        return (
            filtered[self.config.proximal_landmark_id],
            filtered[self.config.vertex_landmark_id],
            filtered[self.config.distal_landmark_id],
        )


def _synthetic_landmarks_for_angle(angle_degrees: float) -> list[RawLandmark]:
    """Buat 33 landmark sintetis untuk test siku kanan."""
    import math

    lms = [
        RawLandmark(0.5, 0.5, 0.0, visibility=0.95, landmark_id=i)
        for i in range(33)
    ]
    vertex = (0.5, 0.5)
    length = 0.2
    radians = math.radians(angle_degrees)
    shoulder = (vertex[0] + length, vertex[1])
    wrist = (vertex[0] + length * math.cos(radians), vertex[1] + length * math.sin(radians))

    lms[12] = RawLandmark(shoulder[0], shoulder[1], 0.0, 0.95, 12)
    lms[14] = RawLandmark(vertex[0], vertex[1], 0.0, 0.95, 14)
    lms[16] = RawLandmark(wrist[0], wrist[1], 0.0, 0.95, 16)
    return lms


if __name__ == "__main__":
    import sys

    print("=" * 65)
    print("  MoveWall AI -- edge_pipeline.py Unit Tests")
    print("=" * 65)

    failures = 0

    def check(label: str, condition: bool) -> None:
        global failures
        status = "PASS" if condition else "FAIL"
        print(f"  [{status}]  {label}")
        if not condition:
            failures += 1

    pipeline = EdgeTrackingPipeline(
        landmark_filter=LandmarkFilter(num_landmarks=33, ema_alpha=1.0)
    )

    result = pipeline.process_frame(1, _synthetic_landmarks_for_angle(90.0), 0.0)
    check("Synthetic angle around 90 degrees", result.current_angle is not None and abs(result.current_angle - 90.0) < 0.5)
    check("Payload exercise type is right elbow", result.payload.exercise_type == "RIGHT_ELBOW_FLEXION")
    check("No occlusion on visible synthetic frame", not result.is_occluded)

    pipeline = EdgeTrackingPipeline(
        landmark_filter=LandmarkFilter(num_landmarks=33, ema_alpha=1.0)
    )
    angles = list(range(15, 96, 5)) + [92, 92, 92] + list(range(90, 14, -5))
    completed = None
    t = 0.0
    for idx, angle in enumerate(angles, start=2):
        out = pipeline.process_frame(idx, _synthetic_landmarks_for_angle(float(angle)), t)
        t += 1 / 30
        if out.rep_result:
            completed = out.rep_result

    check("One rep completed through full pipeline", completed is not None)
    check("Completed rep is valid", completed is not None and completed.status.value == "VALID")

    occluded_frame = _synthetic_landmarks_for_angle(90.0)
    occluded_frame[14] = RawLandmark(0.5, 0.5, 0.0, visibility=0.1, landmark_id=14)
    for idx in range(40, 60):
        out = pipeline.process_frame(idx, occluded_frame, t)
        t += 1 / 30
    check("Occlusion warning appears after grace frames", bool(out.occlusion_warnings))
    check("Occlusion payload is red", out.payload.visual_overlay_color == "RED")

    print("\n" + "=" * 65)
    if failures == 0:
        print("  Semua test LULUS [OK]")
    else:
        print(f"  {failures} test GAGAL [FAIL]")
    print("=" * 65)
    sys.exit(failures)
