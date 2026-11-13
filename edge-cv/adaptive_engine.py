"""
adaptive_engine.py
==================
Modul Adaptive Difficulty Engine untuk proyek MoveWall AI.

Menghitung penyesuaian target ROM secara dinamis berbasis rolling performance
window (5 repetisi terakhir) dan menghasilkan payload JSON terstruktur per frame.

Changelog v1.1.0:
    - [FIX] Adaptasi ROM dijalankan via end_set(), bukan per record_rep() (PRD 6.3).
    - [ADD] Method trigger_pain_override() untuk tombol Stop/Nyeri (PRD 6.3.5, Risk 9).
    - [ADD] Tracking ROM variance / Consistency Bonus per set (PRD 6.2).
    - [ADD] Parameter reps_per_set untuk kontrol granularitas adaptasi.
    - [ADD] reset_pain_override() untuk reset oleh terapis via dashboard.

Author : MoveWall AI -- CV/ML Engineering Team
Version: 1.1.0
"""

from __future__ import annotations

import json
import math
import time
from collections import deque
from dataclasses import dataclass, asdict
from enum import Enum
from typing import Deque, List, Optional


# ---------------------------------------------------------------------------
# Enumerasi & Konstanta
# ---------------------------------------------------------------------------

class VisualColor(str, Enum):
    """Warna overlay visual yang ditampilkan ke pasien (PRD FR-5.1)."""
    GREEN  = "GREEN"
    YELLOW = "YELLOW"
    RED    = "RED"


class RepQuality(str, Enum):
    """Kualitas repetisi untuk payload (sinkron dengan RepStatus di FSM)."""
    VALID   = "VALID"
    PARTIAL = "PARTIAL"
    INVALID = "INVALID"
    NONE    = "NONE"


ROLLING_WINDOW_SIZE: int = 5
DEFAULT_ROM_STEP_UP: float = 0.05
DEFAULT_ROM_STEP_DOWN: float = 0.075
FATIGUE_TEMPO_DROP_THRESHOLD: float = 0.40


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class RepRecord:
    """Rekaman satu repetisi untuk analisis rolling window."""
    quality: RepQuality
    peak_angle: float
    target_rom_at_time: float
    duration_seconds: float


@dataclass
class FrameMetrics:
    """Metrik yang diekspor dalam payload JSON per frame."""
    valid_reps: int = 0
    partial_reps: int = 0
    target_rom: float = 0.0
    success_rate: float = 0.0
    arar: float = 0.0
    consistency_bonus: float = 0.0
    reps_in_current_set: int = 0


@dataclass
class FramePayload:
    """Payload JSON lengkap per frame (kontrak skema sesuai PRD Request spec)."""
    frame_id: int
    exercise_type: str
    current_angle: float
    state: str
    rep_status: str
    metrics: FrameMetrics
    audio_cue: Optional[str]
    visual_overlay_color: str

    def to_dict(self) -> dict:
        d = asdict(self)
        return {
            "frame_id": d["frame_id"],
            "exercise_type": d["exercise_type"],
            "current_angle": d["current_angle"],
            "state": d["state"],
            "rep_status": d["rep_status"],
            "metrics": d["metrics"],
            "audio_cue": d["audio_cue"],
            "visual_overlay_color": d["visual_overlay_color"],
        }

    def to_json(self, indent: Optional[int] = None) -> str:
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)


# ---------------------------------------------------------------------------
# AdaptiveEngine
# ---------------------------------------------------------------------------

class AdaptiveEngine:
    """Mesin adaptasi kesulitan berbasis rolling performance window.

    Flow penggunaan yang benar:
        1. Setiap rep selesai (FSM returns RepResult) -> record_rep()
        2. Setelah semua rep dalam 1 set selesai -----------> end_set()
        3. Setiap frame ---------------------------------> generate_payload()
        4. Jika pasien tekan Stop/Nyeri -----------> trigger_pain_override()

    PRD §6.3: Adaptasi HANYA dijalankan saat end_set(), bukan per-rep,
    untuk menghindari perubahan target yang membingungkan mid-set.

    Parameters
    ----------
    exercise_type : str
        Jenis latihan (misal SHOULDER_FLEXION). Masuk ke payload JSON.
    initial_target_rom : float
        Target ROM awal dari resep terapis (derajat).
    max_safety_ceiling : float
        Batas max target ROM (PRD §6.3.4 Safety Ceiling).
    min_functional_rom : float
        Batas min target ROM (PRD §6.3.3c).
    reps_per_set : int
        Jumlah rep per set (default 5).
    rom_step_up : float
        Persen kenaikan ROM saat SR>=90% dan ARAR>=1.05 (default 5%).
    rom_step_down : float
        Persen penurunan ROM saat SR<70% (default 7.5%).
    """

    def __init__(
        self,
        exercise_type: str,
        initial_target_rom: float,
        max_safety_ceiling: float,
        min_functional_rom: float,
        reps_per_set: int = 5,
        rom_step_up: float = DEFAULT_ROM_STEP_UP,
        rom_step_down: float = DEFAULT_ROM_STEP_DOWN,
    ) -> None:
        self.exercise_type = exercise_type
        self.target_rom = initial_target_rom
        self.max_safety_ceiling = max_safety_ceiling
        self.min_functional_rom = min_functional_rom
        self.reps_per_set = reps_per_set
        self.rom_step_up = rom_step_up
        self.rom_step_down = rom_step_down

        self._window: Deque[RepRecord] = deque(maxlen=ROLLING_WINDOW_SIZE)
        self._current_set_reps: List[RepRecord] = []

        self._total_valid: int = 0
        self._total_partial: int = 0
        self._total_invalid: int = 0

        self._last_rep_end_time: Optional[float] = None
        self._rep_durations: Deque[float] = deque(maxlen=ROLLING_WINDOW_SIZE)
        self._fatigue_override_active: bool = False
        self._pain_override_active: bool = False

        self._last_rep_status: RepQuality = RepQuality.NONE
        self._current_set_consistency_bonus: float = 0.0


    # ------------------------------------------------------------------
    # Public API: record_rep (accumulate only -- no adaptation)
    # ------------------------------------------------------------------

    def record_rep(
        self,
        quality: RepQuality,
        peak_angle: float,
        rep_duration_seconds: Optional[float] = None,
    ) -> None:
        """Rekam satu rep ke buffer set saat ini. TIDAK men-trigger adaptasi.

        Adaptasi hanya berjalan via end_set(). (PRD 6.3: "bukan per-repetisi").

        Parameters
        ----------
        quality : RepQuality
            Kualitas rep (VALID / PARTIAL / INVALID).
        peak_angle : float
            Sudut puncak yang dicapai (derajat).
        rep_duration_seconds : float | None
            Durasi rep. Jika None, diukur otomatis antar panggilan.
        """
        now = time.monotonic()
        if rep_duration_seconds is None:
            rep_duration_seconds = (
                now - self._last_rep_end_time
                if self._last_rep_end_time is not None
                else 2.0
            )
        self._last_rep_end_time = now

        record = RepRecord(
            quality=quality,
            peak_angle=peak_angle,
            target_rom_at_time=self.target_rom,
            duration_seconds=rep_duration_seconds,
        )
        self._current_set_reps.append(record)
        self._rep_durations.append(rep_duration_seconds)

        if quality == RepQuality.VALID:
            self._total_valid += 1
        elif quality == RepQuality.PARTIAL:
            self._total_partial += 1
        else:
            self._total_invalid += 1

        self._last_rep_status = quality

    # ------------------------------------------------------------------
    # Public API: end_set (trigger adaptation here)
    # ------------------------------------------------------------------

    def end_set(self) -> dict:
        """Akhiri set dan jalankan adaptive difficulty. (PRD 6.3: per-akhir-set).

        Returns
        -------
        dict
            Ringkasan set: reps, SR, ARAR, consistency_bonus, delta target ROM.
        """
        for rec in self._current_set_reps:
            self._window.append(rec)

        self._current_set_consistency_bonus = self._compute_consistency_bonus(
            self._current_set_reps
        )

        target_before = self.target_rom

        if len(self._window) >= ROLLING_WINDOW_SIZE:
            self._run_adaptation()

        sr, arar = self._compute_rolling_metrics()

        summary = {
            "reps_in_set": len(self._current_set_reps),
            "success_rate": round(sr, 4),
            "arar": round(arar, 4),
            "consistency_bonus": round(self._current_set_consistency_bonus, 4),
            "target_rom_before": round(target_before, 2),
            "target_rom_after": round(self.target_rom, 2),
            "adaptation_applied": round(self.target_rom - target_before, 2),
            "fatigue_override": self._fatigue_override_active,
            "pain_override": self._pain_override_active,
        }
        self._current_set_reps = []
        return summary

    # ------------------------------------------------------------------
    # Public API: Pain Override (PRD 6.3.5 & Risk #9)
    # ------------------------------------------------------------------

    def trigger_pain_override(self) -> None:
        """Aktifkan pain override saat pasien menekan tombol Stop/Nyeri.

        Langsung turunkan target ke min_functional_rom, terlepas dari SR/ARAR.
        Dipanggil oleh UI layer. (PRD 6.3 poin 5 & Risk #9).
        """
        self._pain_override_active = True
        self._fatigue_override_active = True
        self.target_rom = self.min_functional_rom

    def reset_pain_override(self) -> None:
        """Reset pain override (hanya oleh terapis via dashboard)."""
        self._pain_override_active = False
        self._fatigue_override_active = False

    # ------------------------------------------------------------------
    # Public API: generate_payload
    # ------------------------------------------------------------------

    def generate_payload(
        self,
        frame_id: int,
        current_angle: float,
        fsm_state: str,
        rep_just_completed: bool = False,
    ) -> FramePayload:
        """Hasilkan payload JSON lengkap untuk frame saat ini.

        Parameters
        ----------
        frame_id : int
            Nomor frame dari loop capture video.
        current_angle : float
            Sudut sendi dari angle_calculator (derajat).
        fsm_state : str
            State FSM saat ini ("RESTING", "ASCENDING", dll.).
        rep_just_completed : bool
            True jika rep baru saja selesai pada frame ini.

        Returns
        -------
        FramePayload
            Payload siap diserialisasi ke JSON.
        """
        sr, arar = self._compute_rolling_metrics()
        metrics = FrameMetrics(
            valid_reps=self._total_valid,
            partial_reps=self._total_partial,
            target_rom=round(self.target_rom, 2),
            success_rate=round(sr, 4),
            arar=round(arar, 4),
            consistency_bonus=round(self._current_set_consistency_bonus, 4),
            reps_in_current_set=len(self._current_set_reps),
        )

        rep_status_str = (
            self._last_rep_status.value if rep_just_completed else RepQuality.NONE.value
        )

        audio_cue = self._determine_audio_cue(fsm_state, rep_just_completed)
        color = self._determine_visual_color(current_angle, fsm_state, sr)

        return FramePayload(
            frame_id=frame_id,
            exercise_type=self.exercise_type,
            current_angle=round(current_angle, 2),
            state=fsm_state,
            rep_status=rep_status_str,
            metrics=metrics,
            audio_cue=audio_cue,
            visual_overlay_color=color.value,
        )

    def get_session_summary(self) -> dict:
        """Kembalikan ringkasan statistik sesi lengkap."""
        sr, arar = self._compute_rolling_metrics()
        return {
            "total_reps": self._total_valid + self._total_partial + self._total_invalid,
            "valid_reps": self._total_valid,
            "partial_reps": self._total_partial,
            "invalid_reps": self._total_invalid,
            "final_target_rom": round(self.target_rom, 2),
            "success_rate_last5": round(sr, 4),
            "arar_last5": round(arar, 4),
            "fatigue_override_active": self._fatigue_override_active,
            "pain_override_active": self._pain_override_active,
        }

    def get_current_set_count(self) -> int:
        """Kembalikan jumlah repetisi yang sudah tercatat pada set aktif."""
        return len(self._current_set_reps)

    # ------------------------------------------------------------------
    # Private: Adaptation Logic
    # ------------------------------------------------------------------

    def _run_adaptation(self) -> None:
        """Jalankan adaptive difficulty. Dipanggil HANYA dari end_set()."""
        if self._pain_override_active:
            self.target_rom = self.min_functional_rom
            return

        if self._check_fatigue():
            self._fatigue_override_active = True
            self.target_rom = self.min_functional_rom
            return

        self._fatigue_override_active = False
        sr, arar = self._compute_rolling_metrics()

        if sr >= 0.90 and arar >= 1.05:
            # PRD 6.3.3a: naik +5%, dibatasi safety ceiling
            self.target_rom = min(
                self.target_rom * (1.0 + self.rom_step_up),
                self.max_safety_ceiling,
            )
        elif sr < 0.70:
            # PRD 6.3.3c: turun -5~10%, tidak boleh di bawah min
            self.target_rom = max(
                self.target_rom * (1.0 - self.rom_step_down),
                self.min_functional_rom,
            )
        # SR 70-90%: flow zone, tidak ada perubahan (PRD 6.3.3b)

    def _compute_rolling_metrics(self) -> tuple[float, float]:
        if not self._window:
            return 0.0, 0.0
        n = len(self._window)
        valid_count = sum(1 for r in self._window if r.quality == RepQuality.VALID)
        sr = valid_count / n
        arar = sum(
            r.peak_angle / r.target_rom_at_time
            for r in self._window if r.target_rom_at_time > 0
        ) / n
        return sr, arar

    def _compute_consistency_bonus(self, reps: List[RepRecord]) -> float:
        """Hitung Consistency Bonus dari variansi ROM dalam satu set (PRD 6.2).

        Returns skor 0.0 (tidak konsisten) - 1.0 (sempurna konsisten).
        """
        if len(reps) < 2:
            return 1.0
        angles = [r.peak_angle for r in reps]
        mean_a = sum(angles) / len(angles)
        variance = sum((a - mean_a) ** 2 for a in angles) / len(angles)
        std_dev = math.sqrt(variance)
        target = self.target_rom if self.target_rom > 0 else 90.0
        return max(0.0, min(1.0, 1.0 - (std_dev / target)))

    def _check_fatigue(self) -> bool:
        """Deteksi penurunan tempo > 40% (PRD 6.3.5 Fatigue Override)."""
        if len(self._rep_durations) < ROLLING_WINDOW_SIZE:
            return False
        durations = list(self._rep_durations)
        early_avg = sum(durations[:3]) / 3.0
        late_avg  = sum(durations[3:]) / 2.0
        if early_avg <= 0:
            return False
        return (late_avg - early_avg) / early_avg > FATIGUE_TEMPO_DROP_THRESHOLD

    def _determine_audio_cue(
        self, fsm_state: str, rep_just_completed: bool
    ) -> Optional[str]:
        """Audio cue dengan prioritas sesuai PRD FR-5.2:
        keselamatan > koreksi postur > motivasi.
        """
        if self._pain_override_active:
            return "Sesi dihentikan. Istirahat dan hubungi terapis Anda."
        if self._fatigue_override_active:
            return "Terdeteksi kelelahan. Target diturunkan. Istirahat sejenak."
        if rep_just_completed:
            if self._last_rep_status == RepQuality.VALID:
                return "Bagus sekali! Pertahankan!"
            elif self._last_rep_status == RepQuality.PARTIAL:
                return "Hampir! Coba angkat sedikit lebih tinggi."
            else:
                return "Gerakan kurang. Rentangkan lebih jauh."
        if fsm_state == "ASCENDING":
            return "Angkat lebih tinggi!"
        if fsm_state == "PEAK_HOLD":
            return "Tahan posisi ini!"
        if fsm_state == "DESCENDING":
            return "Turunkan perlahan."
        return None

    def _determine_visual_color(
        self, current_angle: float, fsm_state: str, sr: float
    ) -> VisualColor:
        """Warna overlay visual (PRD FR-5.1)."""
        if self._pain_override_active or self._fatigue_override_active:
            return VisualColor.RED
        if fsm_state == "RESTING":
            return VisualColor.GREEN if sr >= 0.70 else VisualColor.YELLOW
        ratio = current_angle / self.target_rom if self.target_rom > 0 else 0.0
        if ratio >= 1.0:
            return VisualColor.GREEN
        elif ratio >= 0.70:
            return VisualColor.YELLOW
        return VisualColor.RED


# ---------------------------------------------------------------------------
# Unit Tests
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    print("=" * 65)
    print("  MoveWall AI -- adaptive_engine.py  Unit Tests  v1.1.0")
    print("=" * 65)

    failures = 0

    def check(label, condition):
        global failures
        status = "PASS" if condition else "FAIL"
        print(f"  [{status}]  {label}")
        if not condition:
            failures += 1

    CFG = dict(
        exercise_type="SHOULDER_FLEXION",
        initial_target_rom=90.0,
        max_safety_ceiling=140.0,
        min_functional_rom=40.0,
        reps_per_set=5,
    )

    # Test 1: Adaptasi Per-Set (bukan per-rep)
    print("\n--- Test 1: Adaptasi Per-Set (bukan per-rep) ---")
    e1 = AdaptiveEngine(**CFG)
    rom_init = e1.target_rom
    for _ in range(5):
        e1.record_rep(RepQuality.VALID, peak_angle=100.0, rep_duration_seconds=2.0)
    check("Target ROM TIDAK berubah sebelum end_set()", e1.target_rom == rom_init)
    s1 = e1.end_set()
    check("Target ROM NAIK setelah end_set()", e1.target_rom > rom_init)
    check("summary.adaptation_applied > 0", s1["adaptation_applied"] > 0)
    print(f"           ROM: {rom_init} -> {e1.target_rom:.4f} | delta={s1['adaptation_applied']:.4f}")

    # Test 2: Flow Zone (SR 70-90%) -- target stabil
    print("\n--- Test 2: Flow Zone SR=80% (target stabil) ---")
    e2 = AdaptiveEngine(**CFG)
    rom_before2 = e2.target_rom
    for _ in range(4):
        e2.record_rep(RepQuality.VALID, peak_angle=95.0, rep_duration_seconds=2.0)
    e2.record_rep(RepQuality.INVALID, peak_angle=30.0, rep_duration_seconds=2.0)
    s2 = e2.end_set()
    check("SR = 0.8 dalam flow zone", abs(s2["success_rate"] - 0.8) < 1e-6)
    check("Target ROM tidak berubah di flow zone", abs(e2.target_rom - rom_before2) < 0.01)
    print(f"           SR={s2['success_rate']:.2f}, ROM tetap {e2.target_rom:.2f}")

    # Test 3: Target ROM Turun (SR < 70%)
    print("\n--- Test 3: Target ROM Turun (SR<70%) ---")
    e3 = AdaptiveEngine(**CFG)
    rom_before3 = e3.target_rom
    for _ in range(5):
        e3.record_rep(RepQuality.INVALID, peak_angle=30.0, rep_duration_seconds=2.0)
    e3.end_set()
    check("Target ROM turun", e3.target_rom < rom_before3)
    check("Tidak di bawah min_functional_rom", e3.target_rom >= 40.0)
    print(f"           ROM: {rom_before3} -> {e3.target_rom:.4f}")

    # Test 4: Pain Override
    print("\n--- Test 4: Pain Override (Tombol Stop/Nyeri) ---")
    e4 = AdaptiveEngine(**CFG)
    e4.record_rep(RepQuality.VALID, peak_angle=95.0)
    e4.trigger_pain_override()
    check("pain_override_active = True", e4._pain_override_active)
    check("Target ROM ke min_functional_rom (40)", e4.target_rom == 40.0)
    p4 = e4.generate_payload(1, 45.0, "RESTING")
    check("Audio: pesan penghentian sesi", p4.audio_cue is not None and "dihentikan" in p4.audio_cue)
    check("Visual: RED saat pain override", p4.visual_overlay_color == "RED")
    e4.reset_pain_override()
    check("Setelah reset: pain_override = False", not e4._pain_override_active)

    # Test 5: Fatigue Override (auto)
    print("\n--- Test 5: Fatigue Override (auto, tempo drop>40%) ---")
    e5 = AdaptiveEngine(**CFG)
    for dur in [1.5, 1.6, 1.4]:
        e5.record_rep(RepQuality.VALID, peak_angle=95.0, rep_duration_seconds=dur)
    for dur in [3.0, 3.5]:
        e5.record_rep(RepQuality.VALID, peak_angle=95.0, rep_duration_seconds=dur)
    e5.end_set()
    check("fatigue_override_active = True", e5._fatigue_override_active)
    check("Target ROM ke min_functional_rom saat fatigue", e5.target_rom == 40.0)

    # Test 6: Consistency Bonus
    print("\n--- Test 6: Consistency Bonus ---")
    e6a = AdaptiveEngine(**CFG)
    for a in [89.0, 90.0, 91.0, 90.5, 89.5]:
        e6a.record_rep(RepQuality.VALID, peak_angle=a, rep_duration_seconds=2.0)
    s6a = e6a.end_set()

    e6b = AdaptiveEngine(**CFG)
    for a in [45.0, 90.0, 30.0, 88.0, 55.0]:
        e6b.record_rep(RepQuality.PARTIAL, peak_angle=a, rep_duration_seconds=2.0)
    e6b.end_set()

    check("Consistency bonus: set konsisten > set tidak konsisten",
          s6a["consistency_bonus"] > e6b._current_set_consistency_bonus)
    print(f"           Konsisten={s6a['consistency_bonus']:.4f} | Tidak={e6b._current_set_consistency_bonus:.4f}")

    # Test 7: JSON Payload Schema v1.1
    print("\n--- Test 7: JSON Payload Schema v1.1 ---")
    e7 = AdaptiveEngine(**CFG)
    e7.record_rep(RepQuality.VALID, peak_angle=95.0)
    p7 = e7.generate_payload(300, 88.0, "ASCENDING", rep_just_completed=True)
    pd7 = p7.to_dict()
    req_keys = ["frame_id","exercise_type","current_angle","state","rep_status","metrics","audio_cue","visual_overlay_color"]
    req_metrics = ["valid_reps","partial_reps","target_rom","success_rate","arar","consistency_bonus","reps_in_current_set"]
    check("Semua field payload ada", all(k in pd7 for k in req_keys))
    check("Semua sub-field metrics ada", all(k in pd7["metrics"] for k in req_metrics))
    check("JSON dapat di-parse", isinstance(json.loads(p7.to_json()), dict))
    check("rep_status=VALID saat rep_just_completed=True", pd7["rep_status"] == "VALID")
    print("\n  Contoh JSON Payload v1.1:")
    for line in p7.to_json(indent=2).split("\n"):
        print("  " + line)

    # Test 8: Safety Ceiling
    print("\n--- Test 8: Max Safety Ceiling ---")
    e8 = AdaptiveEngine("TEST", 135.0, 140.0, 40.0)
    for _ in range(5):
        e8.record_rep(RepQuality.VALID, peak_angle=150.0, rep_duration_seconds=2.0)
    e8.end_set()
    check("Target tidak melebihi 140", e8.target_rom <= 140.0)
    print(f"           Target ROM final: {e8.target_rom:.4f}")

    print("\n" + "=" * 65)
    if failures == 0:
        print("  Semua test LULUS [OK]")
    else:
        print(f"  {failures} test GAGAL [FAIL]")
    print("=" * 65)
    sys.exit(failures)
