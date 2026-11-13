"""
test_pipeline.py
================
MoveWall AI — Edge CV & Biomechanics Pipeline Consolidated Test Suite.
Menjalankan unit test bawaan untuk setiap modul edge CV:
  1. angle_calculator.py
  2. landmark_filter.py
  3. rep_state_machine.py
  4. adaptive_engine.py
  5. edge_pipeline.py
"""

import subprocess
import sys
from pathlib import Path

MODULES_TO_TEST = [
    "angle_calculator.py",
    "landmark_filter.py",
    "rep_state_machine.py",
    "adaptive_engine.py",
    "edge_pipeline.py",
]

def main():
    root_cv = Path(__file__).resolve().parent
    print("=" * 65)
    print("  MoveWall AI — Edge CV Consolidated Test Runner")
    print("=" * 65)

    all_passed = True
    for mod in MODULES_TO_TEST:
        target = root_cv / mod
        print(f"\n[RUN] Running {mod} test suite...")
        res = subprocess.run([sys.executable, str(target)], cwd=str(root_cv), capture_output=True, text=True)
        print(res.stdout)
        if res.returncode != 0:
            print(f"[ERROR] {mod} failed with code {res.returncode}")
            if res.stderr:
                print(res.stderr)
            all_passed = False

    print("\n" + "=" * 65)
    if all_passed:
        print("  🎉 SELURUH MODUL EDGE CV LOLOS PENGUJIAN!")
    else:
        print("  ❌ ADA PENGUJIAN YANG GAGAL!")
    print("=" * 65)

    sys.exit(0 if all_passed else 1)

if __name__ == "__main__":
    main()
