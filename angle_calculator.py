"""
angle_calculator.py
===================
Modul kalkulasi sudut sendi (Range of Motion / ROM) untuk proyek MoveWall AI.

Menghitung sudut antara 3 titik landmark (Proximal, Vertex/Joint, Distal) dalam
ruang 2D atau 3D, berbasis hasil inferensi BlazePose (33 landmarks).

Formula:
    cos(theta) = Dot(BA, BC) / (|BA| * |BC|)
    theta = arccos(cos(theta)) -> dikonversi ke derajat

Proteksi:
    - Anti-NaN Clamping: numpy.clip(cos_theta, -1.0, 1.0)
    - Zero-division protection jika landmark bertumpuk (magnitudo = 0)

Author : MoveWall AI -- CV/ML Engineering Team
Version: 1.0.0
"""

from __future__ import annotations

import math
from typing import Sequence, Union

import numpy as np

# ---------------------------------------------------------------------------
# Type Aliases
# ---------------------------------------------------------------------------
Coordinate2D = tuple[float, float]
Coordinate3D = tuple[float, float, float]
LandmarkCoord = Union[Coordinate2D, Coordinate3D, Sequence[float]]


def calculate_angle(
    proximal: LandmarkCoord,
    vertex: LandmarkCoord,
    distal: LandmarkCoord,
) -> float | None:
    """Hitung sudut sendi (ROM) dari 3 titik landmark menggunakan Dot Product.

    Titik *vertex* adalah sendi yang diukur sudutnya (misal: siku, lutut, bahu).
    Vektor dibentuk dari *vertex* ke *proximal* (BA) dan dari *vertex* ke
    *distal* (BC), kemudian sudut di antara keduanya dihitung.

    Parameters
    ----------
    proximal : LandmarkCoord
        Koordinat titik proksimal, misal titik bahu untuk sudut siku.
        Dapat berupa (x, y) atau (x, y, z).
    vertex : LandmarkCoord
        Koordinat titik sendi / vertex yang sudutnya ingin diukur.
    distal : LandmarkCoord
        Koordinat titik distal, misal titik pergelangan tangan untuk sudut siku.
        Dapat berupa (x, y) atau (x, y, z).

    Returns
    -------
    float | None
        Sudut dalam derajat (0.0 - 180.0) dibulatkan 2 desimal,
        atau None jika terjadi kondisi zero-division (landmark bertumpuk).

    Notes
    -----
    Rumus:
        BA = proximal - vertex
        BC = distal   - vertex
        cos(theta) = Dot(BA, BC) / (|BA| * |BC|)
        theta = arccos(clamp(cos(theta), -1, 1))

    Proteksi anti-NaN:
        numpy.clip digunakan sebelum arccos untuk mencegah domain error
        akibat floating-point drift di luar rentang [-1, 1].

    Examples
    --------
    >>> calculate_angle((0, 0), (1, 0), (2, 0))   # garis lurus -> 180.0
    180.0
    >>> calculate_angle((0, 1), (0, 0), (1, 0))   # siku-siku -> 90.0
    90.0
    """
    p = np.array(proximal, dtype=np.float64)
    v = np.array(vertex, dtype=np.float64)
    d = np.array(distal, dtype=np.float64)

    if p.shape != v.shape or v.shape != d.shape:
        raise ValueError(
            f"Semua koordinat harus memiliki dimensi yang sama. "
            f"Diterima: proximal={p.shape}, vertex={v.shape}, distal={d.shape}"
        )

    # Vektor BA (Proximal - Vertex) dan BC (Distal - Vertex)
    ba: np.ndarray = p - v
    bc: np.ndarray = d - v

    mag_ba: float = float(np.linalg.norm(ba))
    mag_bc: float = float(np.linalg.norm(bc))

    # Zero-division protection: landmark bertumpuk
    if mag_ba < 1e-9 or mag_bc < 1e-9:
        return None

    dot_product: float = float(np.dot(ba, bc))
    cos_theta: float = dot_product / (mag_ba * mag_bc)

    # Anti-NaN Clamping sebelum arccos
    cos_theta_clamped: float = float(np.clip(cos_theta, -1.0, 1.0))

    angle_rad: float = math.acos(cos_theta_clamped)
    angle_deg: float = round(math.degrees(angle_rad), 2)

    return angle_deg


def calculate_angle_safe(
    proximal: LandmarkCoord,
    vertex: LandmarkCoord,
    distal: LandmarkCoord,
    fallback: float = 0.0,
) -> float:
    """Versi aman dari calculate_angle dengan nilai fallback.

    Mengembalikan *fallback* alih-alih None saat terjadi zero-division.

    Parameters
    ----------
    proximal : LandmarkCoord
        Koordinat titik proksimal.
    vertex : LandmarkCoord
        Koordinat titik sendi / vertex.
    distal : LandmarkCoord
        Koordinat titik distal.
    fallback : float, optional
        Nilai fallback jika landmark bertumpuk (default 0.0).

    Returns
    -------
    float
        Sudut dalam derajat atau *fallback* jika landmark bertumpuk.
    """
    result = calculate_angle(proximal, vertex, distal)
    return result if result is not None else fallback


def vector_magnitude(point_a: LandmarkCoord, point_b: LandmarkCoord) -> float:
    """Hitung magnitudo (jarak Euclidean) antara dua titik.

    Parameters
    ----------
    point_a : LandmarkCoord
        Titik awal.
    point_b : LandmarkCoord
        Titik akhir.

    Returns
    -------
    float
        Jarak Euclidean antara dua titik.
    """
    a = np.array(point_a, dtype=np.float64)
    b = np.array(point_b, dtype=np.float64)
    return float(np.linalg.norm(b - a))


# ---------------------------------------------------------------------------
# Unit Tests
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    print("=" * 60)
    print("  MoveWall AI -- angle_calculator.py  Unit Tests")
    print("=" * 60)

    failures = 0

    def assert_close(label, result, expected, tol=0.05):
        global failures
        if expected is None:
            ok = result is None
        elif result is None:
            ok = False
        else:
            ok = abs(result - expected) <= tol
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}]  {label}")
        print(f"           Hasil={result!r}  |  Ekspektasi={expected!r}")
        if not ok:
            failures += 1

    print("\n--- Test 2D ---")
    r = calculate_angle((0.0, 0.0), (1.0, 0.0), (2.0, 0.0))
    assert_close("Sudut 180 derajat (2D garis lurus)", r, 180.0)

    r = calculate_angle((0.0, 1.0), (0.0, 0.0), (1.0, 0.0))
    assert_close("Sudut 90 derajat (2D siku-siku)", r, 90.0)

    r = calculate_angle((1.0, 0.0), (0.0, 0.0), (1.0, 1.0))
    assert_close("Sudut 45 derajat (2D)", r, 45.0)

    print("\n--- Test 3D ---")
    r = calculate_angle((0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (2.0, 0.0, 0.0))
    assert_close("Sudut 180 derajat (3D garis lurus)", r, 180.0)

    r = calculate_angle((0.0, 1.0, 0.0), (0.0, 0.0, 0.0), (1.0, 0.0, 0.0))
    assert_close("Sudut 90 derajat (3D siku-siku)", r, 90.0)

    print("\n--- Edge Cases ---")
    r = calculate_angle((0.5, 0.5), (0.5, 0.5), (1.0, 1.0))
    assert_close("Edge: Proximal == Vertex (zero-division -> None)", r, None)

    r = calculate_angle((0.3, 0.7), (0.3, 0.7), (0.3, 0.7))
    assert_close("Edge: Semua landmark identik (zero-division -> None)", r, None)

    r2 = calculate_angle_safe((0.0, 0.0), (0.0, 0.0), (1.0, 0.0), fallback=-999.0)
    assert_close("Safe fallback saat Proximal==Vertex", r2, -999.0)

    r = calculate_angle((0.0, 1e-6), (0.0, 0.0), (0.0, 1.0))
    assert_close("Sudut ~0 derajat (quasikolinear arah sama)", r, 0.0, tol=0.1)

    print("\n" + "=" * 60)
    if failures == 0:
        print("  Semua test LULUS [OK]")
    else:
        print(f"  {failures} test GAGAL [FAIL]")
    print("=" * 60)
    sys.exit(failures)
