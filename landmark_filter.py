"""
landmark_filter.py
==================
Modul penyaringan (filtering) noise, jitter, dan penanganan oklusi pada
koordinat landmark BlazePose untuk proyek MoveWall AI.

Changelog v1.1.0:
    - [FIX] Tambah Short-Term Interpolation saat landmark low_confidence 1-3 frame
      berturut-turut -- menggunakan last-known-value hold (PRD 7.4 poin 2:
      "interpolasi jangka pendek saat terjadi kehilangan deteksi sesaat 1-3 frame").
    - [ADD] Parameter interpolation_grace_frames (default 3) pada EMAFilter.
    - [ADD] Dokumentasi eksplisit bahwa caller WAJIB menangani trigger_warning
      dengan audio cue: "Kembali ke posisi tengah layar" (PRD 7.4 poin 3).
    - [ADD] InterpolationState enum untuk transparansi status interpolasi.

Author : MoveWall AI -- CV/ML Engineering Team
Version: 1.1.0
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional


# ---------------------------------------------------------------------------
# Konstanta
# ---------------------------------------------------------------------------

VISIBILITY_THRESHOLD: float = 0.5
"""Ambang visibility score. Di bawah ini landmark dianggap low_confidence (PRD 7.4.1)."""

OCCLUSION_GRACE_FRAMES: int = 15
"""Frame oklusi berturut-turut sebelum trigger_warning (PRD spec: ~500ms @ 30FPS)."""

INTERPOLATION_GRACE_FRAMES: int = 3
"""Frame berturut-turut low_confidence yang masih bisa diinterpolasi (PRD 7.4.2: 1-3 frame)."""

OCCLUSION_AUDIO_CUE: str = "Pastikan tangan terlihat kamera. Kembali ke posisi tengah layar."
"""Audio cue yang WAJIB diputar oleh caller saat trigger_warning=True (PRD 7.4.3)."""


# ---------------------------------------------------------------------------
# Enumerasi
# ---------------------------------------------------------------------------

class InterpolationState(Enum):
    """Status interpolasi untuk satu landmark pada frame tertentu."""
    LIVE       = "LIVE"        # Koordinat langsung dari BlazePose, visibility OK
    SMOOTHED   = "SMOOTHED"    # Visibility OK, koordinat dihaluskan EMA
    INTERPOLATED = "INTERPOLATED"  # Visibility low, menggunakan last-known (1-3 frame)
    OCCLUDED   = "OCCLUDED"    # Visibility low > interpolation_grace_frames


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class RawLandmark:
    """Representasi satu landmark BlazePose mentah.

    Attributes
    ----------
    x, y, z : float
        Koordinat normalized (0.0-1.0). z adalah depth relatif BlazePose.
    visibility : float
        Skor kepercayaan visibilitas (0.0-1.0) dari BlazePose.
    landmark_id : int
        Indeks landmark BlazePose (0-32).
    """
    x: float
    y: float
    z: float = 0.0
    visibility: float = 1.0
    landmark_id: int = -1


@dataclass
class FilteredLandmark:
    """Landmark setelah melewati proses filtering dan interpolasi.

    Attributes
    ----------
    x, y, z : float
        Koordinat yang sudah dihaluskan / diinterpolasi.
    visibility : float
        Skor visibilitas asli dari BlazePose.
    landmark_id : int
        Indeks landmark BlazePose.
    is_low_confidence : bool
        True jika visibility < VISIBILITY_THRESHOLD.
    interpolation_state : InterpolationState
        Status sumber koordinat (LIVE / SMOOTHED / INTERPOLATED / OCCLUDED).

    Notes
    -----
    Koordinat pada state INTERPOLATED masih dapat digunakan untuk kalkulasi
    sudut jangka pendek (1-3 frame). State OCCLUDED menandakan koordinat
    tidak dapat diandalkan dan sebaiknya TIDAK digunakan untuk kalkulasi
    sudut kritikal (PRD 7.4.1: "tidak digunakan langsung").
    """
    x: float
    y: float
    z: float = 0.0
    visibility: float = 1.0
    landmark_id: int = -1
    is_low_confidence: bool = False
    interpolation_state: InterpolationState = InterpolationState.LIVE


# ---------------------------------------------------------------------------
# EMAFilter per Landmark (dengan Short-Term Interpolation)
# ---------------------------------------------------------------------------

class EMAFilter:
    """Exponential Moving Average Filter dengan Short-Term Interpolation.

    Menghaluskan koordinat (x, y, z) secara temporal menggunakan EMA,
    dan melakukan interpolasi (last-known-value hold) saat landmark
    low_confidence selama 1-3 frame berturut-turut.

    Parameters
    ----------
    alpha : float
        Faktor smoothing EMA (0.0, 1.0]. Kecil = lebih smooth, besar = responsif.
        Default 0.3.
    interpolation_grace_frames : int
        Jumlah frame low_confidence yang masih bisa diinterpolasi menggunakan
        last-known-value. Sesuai PRD 7.4.2: "interpolasi jangka pendek 1-3 frame".
        Default 3.

    Notes
    -----
    EMA Formula: y[t] = alpha * x[t] + (1 - alpha) * y[t-1]

    Strategi interpolasi saat low_confidence:
        Frame 1-N (N <= interpolation_grace_frames): kembalikan last-known EMA value.
        Frame > N: tandai sebagai OCCLUDED, kembalikan last-known (tidak ada pilihan).

    EMA dipilih atas Kalman/One-Euro karena:
        - O(1) per frame (zero latency overhead di 30FPS)
        - Tidak memerlukan model noise atau parameter tuning Kalman
        - Sudah terbukti efektif untuk pose estimation smoothing (lihat uji Test 2)
    """

    def __init__(
        self,
        alpha: float = 0.3,
        interpolation_grace_frames: int = INTERPOLATION_GRACE_FRAMES,
    ) -> None:
        if not 0.0 < alpha <= 1.0:
            raise ValueError(f"alpha harus dalam rentang (0.0, 1.0], diterima: {alpha}")
        self.alpha = alpha
        self.interpolation_grace_frames = interpolation_grace_frames

        self._prev_x: Optional[float] = None
        self._prev_y: Optional[float] = None
        self._prev_z: Optional[float] = None
        self._consecutive_low_conf: int = 0

    def filter(
        self,
        x: float,
        y: float,
        z: float = 0.0,
        is_low_confidence: bool = False,
    ) -> tuple[float, float, float, InterpolationState]:
        """Terapkan EMA dengan interpolasi pada koordinat baru.

        Parameters
        ----------
        x, y, z : float
            Koordinat frame saat ini dari BlazePose.
        is_low_confidence : bool
            True jika visibility < threshold pada frame ini.

        Returns
        -------
        tuple[float, float, float, InterpolationState]
            Koordinat (x, y, z) yang sudah diproses, dan InterpolationState.
        """
        if is_low_confidence:
            self._consecutive_low_conf += 1

            if self._prev_x is None:
                # Tidak ada data sebelumnya -- tidak bisa interpolasi
                return x, y, z, InterpolationState.OCCLUDED

            # Interpolasi: gunakan last-known EMA value
            state = (
                InterpolationState.INTERPOLATED
                if self._consecutive_low_conf <= self.interpolation_grace_frames
                else InterpolationState.OCCLUDED
            )
            return self._prev_x, self._prev_y, self._prev_z, state

        # Visibility OK -- reset counter dan terapkan EMA
        self._consecutive_low_conf = 0

        if self._prev_x is None:
            # Frame pertama: inisialisasi tanpa smoothing
            self._prev_x, self._prev_y, self._prev_z = x, y, z
            return x, y, z, InterpolationState.LIVE

        # EMA smoothing
        self._prev_x = self.alpha * x + (1.0 - self.alpha) * self._prev_x
        self._prev_y = self.alpha * y + (1.0 - self.alpha) * self._prev_y
        self._prev_z = self.alpha * z + (1.0 - self.alpha) * self._prev_z

        return self._prev_x, self._prev_y, self._prev_z, InterpolationState.SMOOTHED

    def reset(self) -> None:
        """Reset state internal EMA."""
        self._prev_x = self._prev_y = self._prev_z = None
        self._consecutive_low_conf = 0


# ---------------------------------------------------------------------------
# OcclusionTracker per Landmark
# ---------------------------------------------------------------------------

class OcclusionTracker:
    """Melacak frame berturut-turut satu landmark mengalami low_confidence.

    Parameters
    ----------
    grace_frames : int
        Batas frame sebelum trigger_warning diaktifkan (default: 15).

    Notes
    -----
    PENTING untuk Caller (Game Engine / UI Layer):
        Ketika trigger_warning = True, caller WAJIB menjalankan audio cue:
        "{OCCLUSION_AUDIO_CUE}"
        Sesuai PRD 7.4.3: "feedback audio non-alarmis".
    """

    def __init__(self, grace_frames: int = OCCLUSION_GRACE_FRAMES) -> None:
        self.grace_frames = grace_frames
        self._consecutive_low_conf: int = 0

    def update(self, is_low_confidence: bool) -> bool:
        """Update tracker dan kembalikan trigger_warning.

        Parameters
        ----------
        is_low_confidence : bool
            True jika landmark saat ini low_confidence.

        Returns
        -------
        bool
            True jika consecutive_low_frames > grace_frames.
        """
        if is_low_confidence:
            self._consecutive_low_conf += 1
        else:
            self._consecutive_low_conf = 0
        return self._consecutive_low_conf > self.grace_frames

    @property
    def consecutive_low_frames(self) -> int:
        return self._consecutive_low_conf

    def reset(self) -> None:
        self._consecutive_low_conf = 0


# ---------------------------------------------------------------------------
# LandmarkFilter: Orchestrator Utama
# ---------------------------------------------------------------------------

class LandmarkFilter:
    """Orkestrator filtering lengkap untuk seluruh set landmark BlazePose.

    Mengelola EMAFilter (dengan interpolasi) dan OcclusionTracker untuk
    setiap landmark secara individual.

    Parameters
    ----------
    num_landmarks : int
        Jumlah landmark (BlazePose = 33, default: 33).
    ema_alpha : float
        Faktor smoothing EMA (default: 0.3).
    visibility_threshold : float
        Ambang visibility score (default: 0.5).
    occlusion_grace_frames : int
        Batas frame oklusi sebelum trigger_warning (default: 15).
    interpolation_grace_frames : int
        Frame low_confidence yang bisa diinterpolasi (PRD 7.4.2, default: 3).

    Notes
    -----
    Caller WAJIB menangani occlusion_warnings:
        Ketika suatu landmark_id ada di occlusion_warnings (trigger_warning=True),
        caller harus memutarkan audio: OCCLUSION_AUDIO_CUE.
        Koordinat landmark dengan state OCCLUDED sebaiknya tidak digunakan
        untuk kalkulasi sudut kritikal.
    """

    def __init__(
        self,
        num_landmarks: int = 33,
        ema_alpha: float = 0.3,
        visibility_threshold: float = VISIBILITY_THRESHOLD,
        occlusion_grace_frames: int = OCCLUSION_GRACE_FRAMES,
        interpolation_grace_frames: int = INTERPOLATION_GRACE_FRAMES,
    ) -> None:
        self.num_landmarks = num_landmarks
        self.visibility_threshold = visibility_threshold

        self._ema_filters = [
            EMAFilter(alpha=ema_alpha, interpolation_grace_frames=interpolation_grace_frames)
            for _ in range(num_landmarks)
        ]
        self._occlusion_trackers = [
            OcclusionTracker(grace_frames=occlusion_grace_frames)
            for _ in range(num_landmarks)
        ]

    def process_frame(
        self,
        landmarks: list[RawLandmark],
    ) -> tuple[list[FilteredLandmark], dict[int, bool]]:
        """Proses satu frame dan kembalikan landmark terfilter beserta warnings.

        Parameters
        ----------
        landmarks : list[RawLandmark]
            List landmark mentah dari BlazePose.

        Returns
        -------
        tuple[list[FilteredLandmark], dict[int, bool]]
            - list[FilteredLandmark]: Landmark terhaluskan + anotasi.
            - dict[int, bool]: {landmark_id: trigger_warning}.
              Caller WAJIB memutarkan OCCLUSION_AUDIO_CUE saat ada trigger.

        Raises
        ------
        ValueError
            Jika jumlah landmark tidak sesuai konfigurasi.
        """
        if len(landmarks) != self.num_landmarks:
            raise ValueError(
                f"Diharapkan {self.num_landmarks} landmark, diterima {len(landmarks)}."
            )

        filtered: list[FilteredLandmark] = []
        warnings: dict[int, bool] = {}

        for i, lm in enumerate(landmarks):
            ema = self._ema_filters[i]
            tracker = self._occlusion_trackers[i]

            is_low_conf = lm.visibility < self.visibility_threshold
            sx, sy, sz, interp_state = ema.filter(lm.x, lm.y, lm.z, is_low_conf)
            trigger_warning = tracker.update(is_low_conf)

            fl = FilteredLandmark(
                x=round(sx, 6),
                y=round(sy, 6),
                z=round(sz, 6),
                visibility=lm.visibility,
                landmark_id=lm.landmark_id,
                is_low_confidence=is_low_conf,
                interpolation_state=interp_state,
            )
            filtered.append(fl)

            if trigger_warning:
                warnings[lm.landmark_id] = True

        return filtered, warnings

    def reset(self) -> None:
        """Reset semua filter dan tracker."""
        for ema in self._ema_filters:
            ema.reset()
        for tracker in self._occlusion_trackers:
            tracker.reset()


# ---------------------------------------------------------------------------
# Unit Tests
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    import random

    print("=" * 65)
    print("  MoveWall AI -- landmark_filter.py  Unit Tests  v1.1.0")
    print("=" * 65)

    failures = 0

    def check(label, condition):
        global failures
        status = "PASS" if condition else "FAIL"
        print(f"  [{status}]  {label}")
        if not condition:
            failures += 1

    # Test 1: Visibility Score Filter
    print("\n--- Test 1: Visibility Score Filter ---")
    lf = LandmarkFilter(num_landmarks=3, ema_alpha=1.0)
    frame = [
        RawLandmark(0.5, 0.5, 0.0, visibility=0.9, landmark_id=0),
        RawLandmark(0.5, 0.5, 0.0, visibility=0.4, landmark_id=1),  # low
        RawLandmark(0.5, 0.5, 0.0, visibility=0.5, landmark_id=2),  # batas
    ]
    filtered, _ = lf.process_frame(frame)
    check("vis=0.9: NOT low_confidence", not filtered[0].is_low_confidence)
    check("vis=0.4: IS low_confidence", filtered[1].is_low_confidence)
    check("vis=0.5: NOT low_confidence (batas inklusif)", not filtered[2].is_low_confidence)

    # Test 2: EMA Smoothing Effect
    print("\n--- Test 2: EMA Smoothing Effect ---")
    random.seed(42)
    ema = EMAFilter(alpha=0.2)
    true_x = 0.5
    noisy_xs = [true_x + random.uniform(-0.05, 0.05) for _ in range(50)]
    smoothed_vals = []
    for nx in noisy_xs:
        sx, _, _, _ = ema.filter(nx, 0.0, 0.0, is_low_confidence=False)
        smoothed_vals.append(sx)
    noisy_var = sum((x - true_x) ** 2 for x in noisy_xs) / len(noisy_xs)
    smoothed_var = sum((x - true_x) ** 2 for x in smoothed_vals) / len(smoothed_vals)
    check("EMA: smoothed variance < noisy variance", smoothed_var < noisy_var)
    check("EMA: nilai akhir mendekati true_x (<0.05 error)",
          abs(smoothed_vals[-1] - true_x) < 0.05)
    print(f"           Noisy var={noisy_var:.6f} | Smoothed var={smoothed_var:.6f}")

    # Test 3: Short-Term Interpolation (1-3 frame low_confidence)
    print("\n--- Test 3: Short-Term Interpolation (PRD 7.4.2) ---")
    ema3 = EMAFilter(alpha=0.5, interpolation_grace_frames=3)
    # Frame 1: visible, koordinat di (0.5, 0.5)
    x1, y1, z1, s1 = ema3.filter(0.5, 0.5, 0.0, is_low_confidence=False)
    check("Frame 1 (visible): state = LIVE atau SMOOTHED",
          s1 in (InterpolationState.LIVE, InterpolationState.SMOOTHED))
    # Frame 2-4: low_confidence (dalam grace period)
    interp_states = []
    for _ in range(3):
        xf, yf, zf, sf = ema3.filter(0.0, 0.0, 0.0, is_low_confidence=True)
        interp_states.append(sf)
    check("Frame 2-4 (low, dalam grace period): state = INTERPOLATED",
          all(s == InterpolationState.INTERPOLATED for s in interp_states))
    # Koordinat harus sama dengan last-known (0.5, 0.5)
    check("Koordinat diinterpolasi = last-known value", abs(xf - x1) < 0.01)
    # Frame 5: masih low, tapi sudah melebihi grace period
    x5, y5, z5, s5 = ema3.filter(0.0, 0.0, 0.0, is_low_confidence=True)
    check("Frame 5 (low, melebihi grace period): state = OCCLUDED",
          s5 == InterpolationState.OCCLUDED)
    print(f"           Frame2-4 state={interp_states[0].value} | Frame5 state={s5.value}")

    # Test 4: Occlusion Grace Period + trigger_warning
    print("\n--- Test 4: Occlusion Grace Period (>15 frame) ---")
    tracker = OcclusionTracker(grace_frames=15)
    warned_at = None
    for i in range(20):
        warn = tracker.update(is_low_confidence=True)
        if warn and warned_at is None:
            warned_at = i + 1
    check("trigger_warning setelah frame ke-16", warned_at == 16)
    check("consecutive_low_frames = 20", tracker.consecutive_low_frames == 20)
    tracker.reset()
    check("Setelah reset: consecutive = 0", tracker.consecutive_low_frames == 0)

    # Test 5: Full Pipeline 33 Landmark
    print("\n--- Test 5: Full Pipeline 33 Landmark ---")
    lf_full = LandmarkFilter(num_landmarks=33, ema_alpha=0.3)
    random.seed(99)
    raw_frame = [
        RawLandmark(
            x=random.uniform(0.2, 0.8),
            y=random.uniform(0.2, 0.8),
            z=random.uniform(-0.1, 0.1),
            visibility=random.uniform(0.0, 1.0),
            landmark_id=i,
        )
        for i in range(33)
    ]
    filtered_frame, occ_warnings = lf_full.process_frame(raw_frame)
    check("Output: 33 FilteredLandmark", len(filtered_frame) == 33)
    check("Semua item adalah FilteredLandmark",
          all(isinstance(fl, FilteredLandmark) for fl in filtered_frame))
    check("Setiap FilteredLandmark memiliki interpolation_state",
          all(hasattr(fl, "interpolation_state") for fl in filtered_frame))
    low_count = sum(1 for fl in filtered_frame if fl.is_low_confidence)
    print(f"           {low_count}/33 landmark low_confidence pada frame ini")

    # Test 6: Dokumentasi audio cue constant tersedia
    print("\n--- Test 6: OCCLUSION_AUDIO_CUE constant ---")
    check("OCCLUSION_AUDIO_CUE tersedia sebagai string",
          isinstance(OCCLUSION_AUDIO_CUE, str) and len(OCCLUSION_AUDIO_CUE) > 10)
    print(f"           Audio cue: \"{OCCLUSION_AUDIO_CUE}\"")

    print("\n" + "=" * 65)
    if failures == 0:
        print("  Semua test LULUS [OK]")
    else:
        print(f"  {failures} test GAGAL [FAIL]")
    print("=" * 65)
    sys.exit(failures)
