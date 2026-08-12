"""
interactive_demo.py
===================
Skrip simulasi interaktif untuk mencoba modul MoveWall AI:
- landmark_filter
- angle_calculator
- rep_state_machine
- adaptive_engine

Pasien/User dapat menginput sudut secara manual untuk melihat FSM transisi,
deteksi rep, adaptasi kesulitan, tombol nyeri, dan payload JSON yang dihasilkan.
"""

import time
import sys
from landmark_filter import LandmarkFilter, RawLandmark, InterpolationState
from rep_state_machine import RepetitionStateMachine, FSMState, RepStatus
from adaptive_engine import AdaptiveEngine, RepQuality

def main():
    print("=" * 60)
    print("    MOVEWALL AI - DEMO INTERAKTIF PIPELINE (v1.1.0)")
    print("=" * 60)
    print("Petunjuk:")
    print("1. Masukkan angka sudut sendi (0 s/d 180 derajat).")
    print("2. Ketik 'nyeri' untuk mensimulasikan tombol Stop/Nyeri.")
    print("3. Ketik 'oklusi' untuk mensimulasikan oklusi kamera.")
    print("4. Ketik 'set' untuk mengakhiri set dan menjalankan adaptasi ROM.")
    print("5. Ketik 'exit' untuk keluar.")
    print("-" * 60)

    # Inisialisasi engine
    initial_rom = 90.0
    fsm = RepetitionStateMachine(baseline_angle=20.0, target_rom=initial_rom, min_rom_threshold=60.0)
    engine = AdaptiveEngine(
        exercise_type="SHOULDER_FLEXION",
        initial_target_rom=initial_rom,
        max_safety_ceiling=140.0,
        min_functional_rom=40.0,
        reps_per_set=5
    )
    lf = LandmarkFilter(num_landmarks=3)

    frame_id = 0
    start_time = time.time()

    # Loop interaktif
    while True:
        try:
            user_input = input(f"\n[Frame {frame_id} | Target ROM saat ini: {engine.target_rom}°] Masukkan sudut/perintah: ").strip().lower()
        except (KeyboardInterrupt, EOFError):
            print("\nKeluar dari demo.")
            break

        if user_input == "exit":
            print("Demo dihentikan.")
            break

        if user_input == "nyeri":
            print("\n>>> [EVENT] Pasien menekan tombol NYERI! <<<")
            engine.trigger_pain_override()
            # update FSM target rom agar sinkron
            fsm.target_rom = engine.target_rom
            # Generate payload
            payload = engine.generate_payload(frame_id, 20.0, fsm.state.value)
            print("Payload JSON yang dikirim ke Game Engine:")
            print(payload.to_json(indent=2))
            frame_id += 1
            continue

        if user_input == "set":
            print("\n>>> [EVENT] Set Latihan Selesai! Menjalankan Adaptasi ROM... <<<")
            summary = engine.end_set()
            fsm.target_rom = engine.target_rom
            print("Ringkasan Set:")
            for k, v in summary.items():
                print(f"  - {k}: {v}")
            continue

        # Simulasi filter landmark oklusi
        is_occluded = (user_input == "oklusi")
        raw_visibility = 0.1 if is_occluded else 0.9

        # Buat dummy landmarks
        raw_lms = [
            RawLandmark(0.5, 0.5, 0.0, visibility=raw_visibility, landmark_id=0),
            RawLandmark(0.5, 0.6, 0.0, visibility=raw_visibility, landmark_id=1),
            RawLandmark(0.5, 0.7, 0.0, visibility=raw_visibility, landmark_id=2)
        ]

        # 1. Jalankan Landmark Filter
        filtered_lms, warnings = lf.process_frame(raw_lms)

        # Cek warning oklusi
        if warnings:
            print("\n⚠️ [WARNING] Oklusi Terdeteksi!")
            print(f"   Audio Cue: \"Pastikan tangan terlihat kamera. Kembali ke posisi tengah layar.\"")

        # Cek status interpolasi salah satu landmark
        lm_status = filtered_lms[1].interpolation_state
        print(f"-> Status Landmark: {lm_status.value}")

        if lm_status == InterpolationState.OCCLUDED:
            print("❌ Landmark OCCLUDED (tidak aman untuk kalkulasi sudut).")
            # Generate payload dengan warning
            payload = engine.generate_payload(frame_id, 0.0, fsm.state.value)
            print("Payload JSON:")
            print(payload.to_json(indent=2))
            frame_id += 1
            continue

        # 2. Parsing sudut input
        if is_occluded:
            # Jika oklusi tapi masih dalam status INTERPOLATED, gunakan sudut estimasi konstan
            angle_val = 45.0
        else:
            try:
                angle_val = float(user_input)
            except ValueError:
                print("Input tidak valid! Masukkan angka, 'nyeri', 'oklusi', 'set', atau 'exit'.")
                continue

        # 3. Masukkan ke FSM
        timestamp = time.time() - start_time
        rep_result = fsm.update(angle_val, timestamp=timestamp)

        rep_just_completed = (rep_result is not None)
        if rep_just_completed:
            print(f"\n🎉 [REP SELESAI] Rep ke-{rep_result.rep_number} terdeteksi!")
            print(f"   Status rep : {rep_result.status.value}")
            print(f"   Sudut Puncak: {rep_result.peak_angle}°")
            print(f"   Kecepatan  : {rep_result.angular_velocity_deg_s} deg/s")
            print(f"   Durasi     : {rep_result.duration_seconds}s")

            # Catat rep ke adaptive engine
            quality = RepQuality[rep_result.status.value]
            engine.record_rep(
                quality=quality,
                peak_angle=rep_result.peak_angle,
                rep_duration_seconds=rep_result.duration_seconds
            )

        # 4. Generate payload JSON
        payload = engine.generate_payload(
            frame_id=frame_id,
            current_angle=angle_val,
            fsm_state=fsm.state.value,
            rep_just_completed=rep_just_completed
        )

        print("\nPayload JSON yang dihasilkan per frame:")
        print(payload.to_json(indent=2))

        frame_id += 1

if __name__ == "__main__":
    main()
