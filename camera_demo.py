"""
camera_demo.py  v2.0
Versi API baru MediaPipe 1.0.0 (mp.tasks.vision.PoseLandmarker)
"""
import sys, time, pathlib
try:
    import cv2
    import mediapipe as mp
except ImportError:
    print("Jalankan: python -m pip install opencv-python mediapipe")
    sys.exit(1)

from edge_pipeline import EdgeTrackingPipeline
from landmark_filter import RawLandmark

MODEL_PATH = str(pathlib.Path(__file__).parent / "pose_landmarker.task")

def main():
    pipeline = EdgeTrackingPipeline()

    # MediaPipe 1.0 API
    VisionTasksImage  = mp.Image
    PoseLandmarker    = mp.tasks.vision.PoseLandmarker
    PoseLandmarkerOpt = mp.tasks.vision.PoseLandmarkerOptions
    RunningMode       = mp.tasks.vision.RunningMode
    BaseOptions       = mp.tasks.BaseOptions

    options = PoseLandmarkerOpt(
        base_options=BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=RunningMode.IMAGE,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5
    )
    landmarker = PoseLandmarker.create_from_options(options)

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: Kamera tidak terdeteksi.")
        return

    print("\n" + "="*60)
    print("    MOVEWALL AI - DEMO KAMERA REAL-TIME  v2.0")
    print("="*60)
    print("Keyboard: [n]=Nyeri  [r]=Reset  [s]=End Set  [q]=Keluar")
    print("-"*60)

    frame_id = 0
    start_time = time.time()
    last_audio_cue = ""
    audio_cue_timer = 0.0
    color_bgr = (0, 255, 255)

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        frame = cv2.flip(frame, 1)
        h, w, _ = frame.shape

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = VisionTasksImage(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = landmarker.detect(mp_image)

        current_angle = 0.0
        angle_text = "Posisikan tubuh di depan kamera"

        edge_result = None

        if result.pose_landmarks and len(result.pose_landmarks) > 0:
            lms = result.pose_landmarks[0]

            if len(lms) >= 33:
                raw_lms = [RawLandmark(x=lm.x, y=lm.y, z=lm.z,
                                       visibility=lm.visibility if hasattr(lm, 'visibility') else 1.0,
                                       landmark_id=i)
                           for i, lm in enumerate(lms)]

                edge_result = pipeline.process_frame(
                    frame_id=frame_id,
                    landmarks=raw_lms,
                    timestamp_seconds=time.time() - start_time,
                )
                filtered_lms = edge_result.filtered_landmarks

                # Siku kanan: Shoulder=12, Elbow=14, Wrist=16
                rs = filtered_lms[12]
                re = filtered_lms[14]
                rw = filtered_lms[16]

                # Gambar titik landmark
                for lm_idx, color in [(12,(0,165,255)),(13,(255,0,255)),(14,(0,255,255)),(15,(0,165,255)),(16,(0,255,255))]:
                    if lm_idx < len(filtered_lms):
                        lm = filtered_lms[lm_idx]
                        px, py = int(lm.x*w), int(lm.y*h)
                        cv2.circle(frame, (px, py), 8, color, -1)

                # Garis skeleton siku kanan
                p_rs = (int(rs.x*w), int(rs.y*h))
                p_re = (int(re.x*w), int(re.y*h))
                p_rw = (int(rw.x*w), int(rw.y*h))
                cv2.line(frame, p_rs, p_re, (255,255,255), 3)
                cv2.line(frame, p_re, p_rw, (255,255,255), 3)

                if edge_result.current_angle is not None:
                    current_angle = edge_result.current_angle
                    angle_text = f"{current_angle:.1f} deg"
                else:
                    angle_text = "Oklusi Terdeteksi"

                if edge_result.set_summary:
                    print(f"[AUTO-END SET] {edge_result.set_summary}")

                payload = edge_result.payload
                if payload.audio_cue:
                    last_audio_cue = payload.audio_cue
                    audio_cue_timer = time.time()

                c = payload.visual_overlay_color
                color_bgr = (0,255,0) if c=="GREEN" else (0,255,255) if c=="YELLOW" else (0,0,255)

        # Border warna overlay
        cv2.rectangle(frame, (10,10), (w-10,h-10), color_bgr, 6)

        # HUD
        cv2.rectangle(frame, (0,0), (330,230), (0,0,0), -1)
        def hud(txt, y, col=(255,255,255)):
            cv2.putText(frame, txt, (12,y), cv2.FONT_HERSHEY_SIMPLEX, 0.58, col, 2)

        hud(f"Siku Kanan: {angle_text}", 28, (255,255,255))
        summary = pipeline.engine.get_session_summary()
        hud(f"State FSM : {pipeline.fsm.state.value}", 56, (0,255,255))
        hud(f"Target ROM: {pipeline.engine.target_rom:.1f} deg", 84, (255,100,255))
        hud(f"Valid Reps: {summary['valid_reps']}", 112, (0,255,0))
        hud(f"Partial   : {summary['partial_reps']}", 140, (0,200,200))
        hud(f"Set Buffer: {pipeline.engine.get_current_set_count()}/{pipeline.config.reps_per_set}", 168, (180,180,180))
        status = "PAIN" if summary["pain_override_active"] else "FATIGUE" if summary["fatigue_override_active"] else "NORMAL"
        hud(f"Status    : {status}", 196, (0,0,255) if status!="NORMAL" else (100,255,100))

        if time.time()-audio_cue_timer < 3.0 and last_audio_cue:
            cv2.rectangle(frame, (10,h-55),(w-10,h-10),(255,255,255),-1)
            cv2.putText(frame, f"{last_audio_cue[:65]}", (15,h-25),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,0,0), 2)

        cv2.imshow("MoveWall AI - Camera Demo", frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"): break
        elif key == ord("n"):
            pipeline.trigger_pain_override()
            print("[NYERI] Pain override aktif.")
        elif key == ord("r"):
            pipeline.reset()
            print("[RESET] Pain override direset.")
        elif key == ord("s"):
            s = pipeline.end_set()
            print(f"[END SET] {s}")
        frame_id += 1

    cap.release(); cv2.destroyAllWindows()
    print("Demo selesai.")

if __name__ == "__main__":
    main()
