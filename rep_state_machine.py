"""
rep_state_machine.py
====================
Modul Finite State Machine (FSM) untuk hitungan repetisi latihan fisioterapi
pada proyek MoveWall AI.

Changelog v1.1.0:
    - [FIX] Tambah parameter descend_resting_tolerance yang eksplisit dan
      terpisah dari ascend_tolerance (PRD 7.3: threshold DESCENDING->RESTING
      harus berbeda/lebih rendah dari threshold RESTING->ASCENDING).
    - [ADD] Tracking kecepatan angular (derajat/detik) per frame (PRD FR-4.3).
    - [ADD] RepResult.angular_velocity_deg_s dan RepResult.duration_seconds.
    - [ADD] get_current_angular_velocity() untuk monitoring real-time.

Author : MoveWall AI -- CV/ML Engineering Team
Version: 1.1.0
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from enum import Enum
from typing import Optional


# ---------------------------------------------------------------------------
# Enumerasi
# ---------------------------------------------------------------------------

class FSMState(Enum):
    """State yang mungkin dalam RepetitionStateMachine."""
    RESTING    = "RESTING"
    ASCENDING  = "ASCENDING"
    PEAK_HOLD  = "PEAK_HOLD"
    DESCENDING = "DESCENDING"


class RepStatus(Enum):
    """Klasifikasi kualitas satu repetisi."""
    VALID   = "VALID"
    PARTIAL = "PARTIAL"
    INVALID = "INVALID"


# ---------------------------------------------------------------------------
# Dataclass Hasil Repetisi
# ---------------------------------------------------------------------------

@dataclass
class RepResult:
    """Hasil dari satu siklus repetisi yang telah selesai.

    Attributes
    ----------
    status : RepStatus
        Klasifikasi kualitas repetisi (VALID / PARTIAL / INVALID).
    peak_angle : float
        Sudut puncak yang dicapai selama repetisi (derajat).
    rep_number : int
        Nomor urutan repetisi ini dalam sesi.
    angular_velocity_deg_s : float
        Kecepatan angular rata-rata selama fase ASCENDING (derajat/detik).
        Digunakan untuk deteksi gerakan eksplosif/berbahaya (PRD FR-4.3).
    duration_seconds : float
        Total durasi satu siklus repetisi (ASCENDING hingga kembali RESTING).
    """
    status: RepStatus
    peak_angle: float
    rep_number: int
    angular_velocity_deg_s: float = 0.0
    duration_seconds: float = 0.0


# ---------------------------------------------------------------------------
# Main Class: RepetitionStateMachine
# ---------------------------------------------------------------------------

class RepetitionStateMachine:
    """Finite State Machine untuk mendeteksi dan mengklasifikasikan repetisi.

    Mengelola transisi state berdasarkan perubahan sudut sendi real-time
    dengan mekanisme histeresis untuk mencegah false transition.

    Parameters
    ----------
    baseline_angle : float
        Sudut istirahat (RESTING) dalam derajat (misal: 20.0).
    target_rom : float
        Target ROM untuk VALID rep (misal: 90.0).
    min_rom_threshold : float
        Batas minimum ROM untuk PARTIAL rep (misal: 60.0).
    peak_hold_frames : int
        Jumlah frame minimum di PEAK_HOLD (misal: 2).
    ascend_tolerance : float
        Toleransi histeresis RESTING -> ASCENDING (default: 5.0).
        Threshold masuk = baseline_angle + ascend_tolerance.
    descend_resting_tolerance : float
        Toleransi histeresis DESCENDING -> RESTING (default: 2.5).
        Threshold keluar = baseline_angle + descend_resting_tolerance.
        HARUS lebih kecil dari ascend_tolerance untuk mencegah flicker.
        (PRD 7.3: threshold turun harus lebih rendah dari threshold naik).
    descend_tolerance : float
        Toleransi abort ASCENDING -> DESCENDING (default: 5.0).
    peak_tolerance : float
        Toleransi zona PEAK_HOLD (default: 5.0).

    Notes
    -----
    Histeresis asimetris (PRD 7.3):
        - Masuk ASCENDING: angle > baseline + ascend_tolerance (>25 default)
        - Keluar ke RESTING: angle <= baseline + descend_resting_tolerance (<=22.5 default)
        Selisih ini mencegah flicker saat sudut bergerak di sekitar titik batas.
    """

    def __init__(
        self,
        baseline_angle: float = 20.0,
        target_rom: float = 90.0,
        min_rom_threshold: float = 60.0,
        peak_hold_frames: int = 2,
        ascend_tolerance: float = 5.0,
        descend_resting_tolerance: float = 2.5,
        descend_tolerance: float = 5.0,
        peak_tolerance: float = 5.0,
    ) -> None:
        # Validasi histeresis
        if descend_resting_tolerance >= ascend_tolerance:
            raise ValueError(
                f"descend_resting_tolerance ({descend_resting_tolerance}) harus "
                f"lebih kecil dari ascend_tolerance ({ascend_tolerance}) "
                f"untuk mencegah flicker transisi."
            )

        self.baseline_angle = baseline_angle
        self.target_rom = target_rom
        self.min_rom_threshold = min_rom_threshold
        self.peak_hold_frames = peak_hold_frames
        self.ascend_tolerance = ascend_tolerance
        self.descend_resting_tolerance = descend_resting_tolerance
        self.descend_tolerance = descend_tolerance
        self.peak_tolerance = peak_tolerance

        # Threshold yang dihitung
        self._ascend_threshold: float = baseline_angle + ascend_tolerance
        self._resting_threshold: float = baseline_angle + descend_resting_tolerance

        # State internal FSM
        self.state: FSMState = FSMState.RESTING
        self._peak_angle: float = 0.0
        self._peak_hold_counter: int = 0
        self._reached_target: bool = False

        # Counter statistik sesi
        self.rep_count: int = 0
        self.valid_reps: int = 0
        self.partial_reps: int = 0
        self.invalid_reps: int = 0

        # Tracking kecepatan angular (PRD FR-4.3)
        self._rep_start_time: Optional[float] = None
        self._ascend_start_angle: float = 0.0
        self._ascend_start_time: Optional[float] = None
        self._last_angle: float = 0.0
        self._last_frame_time: Optional[float] = None
        self._current_angular_velocity: float = 0.0  # deg/s

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def update(self, angle: float, timestamp: Optional[float] = None) -> Optional[RepResult]:
        """Proses sudut satu frame dan kembalikan RepResult jika rep selesai.

        Parameters
        ----------
        angle : float
            Sudut sendi saat ini dalam derajat (0.0 - 180.0).
        timestamp : float | None
            Timestamp frame dalam detik (misal: time.monotonic()).
            Jika None, diambil otomatis via time.monotonic().

        Returns
        -------
        RepResult | None
            RepResult jika satu siklus rep selesai, atau None.
        """
        now = timestamp if timestamp is not None else time.monotonic()

        # Hitung kecepatan angular real-time (derajat/detik)
        if self._last_frame_time is not None:
            dt = now - self._last_frame_time
            if dt > 0:
                self._current_angular_velocity = abs(angle - self._last_angle) / dt
        self._last_angle = angle
        self._last_frame_time = now

        result: Optional[RepResult] = None

        if self.state == FSMState.RESTING:
            result = self._handle_resting(angle, now)
        elif self.state == FSMState.ASCENDING:
            result = self._handle_ascending(angle, now)
        elif self.state == FSMState.PEAK_HOLD:
            result = self._handle_peak_hold(angle, now)
        elif self.state == FSMState.DESCENDING:
            result = self._handle_descending(angle, now)

        return result

    def get_current_angular_velocity(self) -> float:
        """Kembalikan kecepatan angular frame terakhir (derajat/detik).

        Digunakan untuk monitoring real-time gerakan eksplosif (PRD FR-4.3).

        Returns
        -------
        float
            Kecepatan angular dalam derajat/detik.
        """
        return round(self._current_angular_velocity, 2)

    def reset(self) -> None:
        """Reset semua state dan counter ke kondisi awal."""
        self.state = FSMState.RESTING
        self._peak_angle = 0.0
        self._peak_hold_counter = 0
        self._reached_target = False
        self.rep_count = 0
        self.valid_reps = 0
        self.partial_reps = 0
        self.invalid_reps = 0
        self._rep_start_time = None
        self._ascend_start_angle = 0.0
        self._ascend_start_time = None
        self._last_frame_time = None
        self._current_angular_velocity = 0.0

    def get_stats(self) -> dict:
        """Kembalikan statistik repetisi sesi saat ini."""
        return {
            "total_reps": self.rep_count,
            "valid_reps": self.valid_reps,
            "partial_reps": self.partial_reps,
            "invalid_reps": self.invalid_reps,
            "current_state": self.state.value,
            "current_angular_velocity_deg_s": self.get_current_angular_velocity(),
        }

    # ------------------------------------------------------------------
    # State Handlers (Private)
    # ------------------------------------------------------------------

    def _handle_resting(self, angle: float, now: float) -> Optional[RepResult]:
        """RESTING: Transisi ke ASCENDING jika angle > ascend_threshold."""
        if angle > self._ascend_threshold:
            self.state = FSMState.ASCENDING
            self._peak_angle = angle
            self._reached_target = False
            self._rep_start_time = now
            self._ascend_start_angle = angle
            self._ascend_start_time = now
        return None

    def _handle_ascending(self, angle: float, now: float) -> Optional[RepResult]:
        """ASCENDING: Tracking puncak, transisi ke PEAK_HOLD atau abort ke DESCENDING."""
        if angle > self._peak_angle:
            self._peak_angle = angle
        if angle >= self.target_rom:
            self._reached_target = True

        # Transisi ke PEAK_HOLD
        if angle >= (self.target_rom - self.peak_tolerance):
            self.state = FSMState.PEAK_HOLD
            self._peak_hold_counter = 1
            return None

        # Abort ke DESCENDING jika sudut turun terlalu rendah
        if angle <= (self.baseline_angle + self.descend_tolerance):
            self.state = FSMState.DESCENDING
        return None

    def _handle_peak_hold(self, angle: float, now: float) -> Optional[RepResult]:
        """PEAK_HOLD: Validasi sudut bertahan N frame di zona puncak."""
        if angle > self._peak_angle:
            self._peak_angle = angle
        if angle >= self.target_rom:
            self._reached_target = True

        peak_zone_floor = self.target_rom - self.peak_tolerance
        if angle >= peak_zone_floor:
            self._peak_hold_counter += 1
        else:
            if self._peak_hold_counter >= self.peak_hold_frames:
                self.state = FSMState.DESCENDING
            else:
                self.state = FSMState.ASCENDING
        return None

    def _handle_descending(self, angle: float, now: float) -> Optional[RepResult]:
        """DESCENDING: Transisi ke RESTING saat angle <= resting_threshold.

        Menggunakan descend_resting_tolerance (lebih kecil dari ascend_tolerance)
        untuk menciptakan histeresis asimetris sesuai PRD 7.3.
        """
        if angle <= self._resting_threshold:
            self.state = FSMState.RESTING
            return self._classify_and_record(now)
        return None

    # ------------------------------------------------------------------
    # Classification (Private)
    # ------------------------------------------------------------------

    def _classify_and_record(self, now: float) -> RepResult:
        """Klasifikasikan rep dan catat statistik, termasuk kecepatan angular."""
        self.rep_count += 1

        if self._reached_target or self._peak_angle >= self.target_rom:
            status = RepStatus.VALID
            self.valid_reps += 1
        elif self._peak_angle >= self.min_rom_threshold:
            status = RepStatus.PARTIAL
            self.partial_reps += 1
        else:
            status = RepStatus.INVALID
            self.invalid_reps += 1

        # Hitung durasi rep
        duration = (
            now - self._rep_start_time
            if self._rep_start_time is not None else 0.0
        )

        # Hitung kecepatan angular fase ASCENDING (derajat/detik)
        angular_velocity = 0.0
        if (self._ascend_start_time is not None
                and self._ascend_start_time < now):
            asc_duration = now - self._ascend_start_time
            angle_change = self._peak_angle - self._ascend_start_angle
            if asc_duration > 0:
                angular_velocity = abs(angle_change) / asc_duration

        result = RepResult(
            status=status,
            peak_angle=round(self._peak_angle, 2),
            rep_number=self.rep_count,
            angular_velocity_deg_s=round(angular_velocity, 2),
            duration_seconds=round(duration, 3),
        )

        # Reset tracking per-rep
        self._peak_angle = 0.0
        self._peak_hold_counter = 0
        self._reached_target = False
        self._rep_start_time = None
        self._ascend_start_time = None
        self._ascend_start_angle = 0.0

        return result


# ---------------------------------------------------------------------------
# Unit Tests
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    print("=" * 65)
    print("  MoveWall AI -- rep_state_machine.py  Unit Tests  v1.1.0")
    print("=" * 65)

    failures = 0

    def check(label, condition):
        global failures
        status = "PASS" if condition else "FAIL"
        print(f"  [{status}]  {label}")
        if not condition:
            failures += 1

    CFG = dict(
        baseline_angle=20.0,
        target_rom=90.0,
        min_rom_threshold=60.0,
        peak_hold_frames=2,
        ascend_tolerance=5.0,
        descend_resting_tolerance=2.5,
        peak_tolerance=5.0,
    )

    angles_up   = list(range(15, 96, 5))
    angles_hold = [92, 92, 92]
    angles_down = list(range(90, 14, -5))

    # Test 1: VALID Rep
    print("\n--- Test 1: VALID Rep ---")
    fsm = RepetitionStateMachine(**CFG)
    result = None
    t = 0.0
    for angle in angles_up + angles_hold + angles_down:
        r = fsm.update(float(angle), timestamp=t)
        t += 1/30  # 30 FPS
        if r is not None:
            result = r

    check("VALID: state kembali ke RESTING", fsm.state == FSMState.RESTING)
    check("VALID: 1 rep tercatat", fsm.rep_count == 1)
    check("VALID: status = VALID", result is not None and result.status == RepStatus.VALID)
    check("VALID: peak_angle >= target", result is not None and result.peak_angle >= 90.0)
    check("VALID: angular_velocity_deg_s > 0", result is not None and result.angular_velocity_deg_s > 0)
    check("VALID: duration_seconds > 0", result is not None and result.duration_seconds > 0)
    if result:
        print(f"           peak={result.peak_angle} | vel={result.angular_velocity_deg_s} deg/s | dur={result.duration_seconds}s")

    # Test 2: PARTIAL Rep
    print("\n--- Test 2: PARTIAL Rep ---")
    fsm2 = RepetitionStateMachine(**CFG)
    result2 = None
    t = 0.0
    for angle in list(range(15, 75, 5)) + [70, 70] + list(range(70, 14, -5)):
        r = fsm2.update(float(angle), timestamp=t)
        t += 1/30
        if r is not None:
            result2 = r

    check("PARTIAL: status = PARTIAL", result2 is not None and result2.status == RepStatus.PARTIAL)
    check("PARTIAL: peak dalam rentang [60, 90)", result2 is not None and 60.0 <= result2.peak_angle < 90.0)

    # Test 3: INVALID Rep
    print("\n--- Test 3: INVALID Rep ---")
    fsm3 = RepetitionStateMachine(**CFG)
    result3 = None
    t = 0.0
    for angle in [20, 25, 30, 35, 40, 40, 35, 30, 25, 20, 15]:
        r = fsm3.update(float(angle), timestamp=t)
        t += 1/30
        if r is not None:
            result3 = r

    check("INVALID: status = INVALID", result3 is not None and result3.status == RepStatus.INVALID)
    check("INVALID: invalid_reps = 1", fsm3.invalid_reps == 1)

    # Test 4: Histeresis Asimetris -- descend_resting_tolerance < ascend_tolerance
    print("\n--- Test 4: Histeresis Asimetris (PRD 7.3) ---")
    fsm4 = RepetitionStateMachine(**CFG)
    # Validasi bahwa threshold masuk (25) != threshold keluar (22.5)
    check("ascend_threshold = 25.0", fsm4._ascend_threshold == 25.0)
    check("resting_threshold = 22.5", fsm4._resting_threshold == 22.5)
    check("resting_threshold < ascend_threshold (histeresis aktif)",
          fsm4._resting_threshold < fsm4._ascend_threshold)

    # Validasi error jika tolerance salah
    try:
        bad_fsm = RepetitionStateMachine(
            ascend_tolerance=5.0,
            descend_resting_tolerance=6.0  # >= ascend_tolerance -> error
        )
        check("ValueError saat descend_resting_tolerance >= ascend_tolerance", False)
    except ValueError:
        check("ValueError saat descend_resting_tolerance >= ascend_tolerance", True)

    # Test 5: Angular Velocity Tracking (PRD FR-4.3)
    print("\n--- Test 5: Angular Velocity Tracking ---")
    fsm5 = RepetitionStateMachine(**CFG)
    results5 = []
    t = 0.0
    for angle in angles_up + angles_hold + angles_down:
        r = fsm5.update(float(angle), timestamp=t)
        t += 1/30
        if r is not None:
            results5.append(r)

    check("angular_velocity_deg_s tersedia di RepResult",
          len(results5) > 0 and hasattr(results5[0], "angular_velocity_deg_s"))
    check("angular_velocity > 0 untuk rep yang bergerak",
          len(results5) > 0 and results5[0].angular_velocity_deg_s > 0)
    check("get_current_angular_velocity() mengembalikan float",
          isinstance(fsm5.get_current_angular_velocity(), float))
    if results5:
        print(f"           avg angular vel = {results5[0].angular_velocity_deg_s} deg/s")

    # Test 6: 2x VALID Reps + get_stats()
    print("\n--- Test 6: 2x VALID Reps & get_stats() ---")
    fsm6 = RepetitionStateMachine(**CFG)
    t = 0.0
    reps6 = []
    for _ in range(2):
        for angle in angles_up + angles_hold + angles_down:
            r = fsm6.update(float(angle), timestamp=t)
            t += 1/30
            if r is not None:
                reps6.append(r)

    check("2 reps tercatat", fsm6.rep_count == 2)
    check("valid_reps = 2", fsm6.valid_reps == 2)
    stats6 = fsm6.get_stats()
    check("get_stats: total_reps = 2", stats6["total_reps"] == 2)
    check("get_stats: current_angular_velocity_deg_s ada",
          "current_angular_velocity_deg_s" in stats6)

    print("\n" + "=" * 65)
    if failures == 0:
        print("  Semua test LULUS [OK]")
    else:
        print(f"  {failures} test GAGAL [FAIL]")
    print("=" * 65)
    sys.exit(failures)
