/**
 * MoveWall AI — Kinematic Skeleton Motion Replay (Fitur 6)
 * ══════════════════════════════════════════════════════════════════════════════
 * Records lightweight 2D biomechanical joint trajectories (coordinates & angles)
 * downsampled at ~12 fps without recording raw video. Complies with UU PDP / HIPAA
 * data privacy while enabling therapists to visually review movement compensation.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MoveWallKinematics = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Joint index mapping (from MediaPipe 33 pose landmarks)
  const JOINT_MAP = {
    NOSE: 0,
    LEFT_SHOULDER: 11,
    RIGHT_SHOULDER: 12,
    LEFT_ELBOW: 13,
    RIGHT_ELBOW: 14,
    LEFT_WRIST: 15,
    RIGHT_WRIST: 16,
    LEFT_HIP: 23,
    RIGHT_HIP: 24,
  };

  const DEFAULT_SAMPLE_INTERVAL_MS = 80; // ~12.5 fps

  function roundCoord(val) {
    return Math.round((Number(val) || 0) * 1000) / 1000;
  }

  /**
   * KinematicRecorder
   * Samples skeletal frames during patient exercise session.
   */
  class KinematicRecorder {
    constructor(options = {}) {
      this.sampleIntervalMs = options.sampleIntervalMs || DEFAULT_SAMPLE_INTERVAL_MS;
      this.frames = [];
      this.startTime = null;
      this.lastSampleTime = 0;
      this.lastCompensation = false;
      this.isRecording = false;
      this.maxFrames = options.maxFrames || 1800; // max ~2.5 minutes at 12 fps
    }

    start(now = Date.now()) {
      this.frames = [];
      this.startTime = now;
      this.lastSampleTime = 0;
      this.lastCompensation = false;
      this.isRecording = true;
    }

    stop(now) {
      this.isRecording = false;
      return this.exportData(now);
    }

    sample(landmarks, angle, compensation = false, now = Date.now()) {
      if (!this.isRecording) {
        this.start(now);
      }
      if (!Array.isArray(landmarks) || landmarks.length < 25) return;

      if (this.startTime === null) {
        this.startTime = now;
      }

      const elapsed = now - this.startTime;
      const isCompensationOnset = Boolean(compensation) && !this.lastCompensation;
      if (this.lastSampleTime > 0 && (now - this.lastSampleTime) < this.sampleIntervalMs && !isCompensationOnset) {
        this.lastCompensation = Boolean(compensation);
        return; // throttle sample rate
      }

      if (this.frames.length >= this.maxFrames) {
        return; // protect against runaway memory
      }

      this.lastSampleTime = now;
      this.lastCompensation = Boolean(compensation);

      // Extract 9 key upper-body landmarks
      const joints = [
        [roundCoord(landmarks[JOINT_MAP.NOSE]?.x), roundCoord(landmarks[JOINT_MAP.NOSE]?.y)],
        [roundCoord(landmarks[JOINT_MAP.LEFT_SHOULDER]?.x), roundCoord(landmarks[JOINT_MAP.LEFT_SHOULDER]?.y)],
        [roundCoord(landmarks[JOINT_MAP.RIGHT_SHOULDER]?.x), roundCoord(landmarks[JOINT_MAP.RIGHT_SHOULDER]?.y)],
        [roundCoord(landmarks[JOINT_MAP.LEFT_ELBOW]?.x), roundCoord(landmarks[JOINT_MAP.LEFT_ELBOW]?.y)],
        [roundCoord(landmarks[JOINT_MAP.RIGHT_ELBOW]?.x), roundCoord(landmarks[JOINT_MAP.RIGHT_ELBOW]?.y)],
        [roundCoord(landmarks[JOINT_MAP.LEFT_WRIST]?.x), roundCoord(landmarks[JOINT_MAP.LEFT_WRIST]?.y)],
        [roundCoord(landmarks[JOINT_MAP.RIGHT_WRIST]?.x), roundCoord(landmarks[JOINT_MAP.RIGHT_WRIST]?.y)],
        [roundCoord(landmarks[JOINT_MAP.LEFT_HIP]?.x), roundCoord(landmarks[JOINT_MAP.LEFT_HIP]?.y)],
        [roundCoord(landmarks[JOINT_MAP.RIGHT_HIP]?.x), roundCoord(landmarks[JOINT_MAP.RIGHT_HIP]?.y)],
      ];

      this.frames.push({
        t: Math.round(elapsed),
        a: Math.round((Number(angle) || 0) * 10) / 10,
        c: compensation ? 1 : 0,
        j: joints,
      });
    }

    exportData(now) {
      const lastFrameT = this.frames.length > 0 ? this.frames[this.frames.length - 1].t : 0;
      let durationMs = lastFrameT;
      if (typeof now === "number" && this.startTime !== null) {
        const diff = Math.round(now - this.startTime);
        if (diff >= lastFrameT && diff < 7200000) {
          durationMs = diff;
        }
      }
      return {
        version: "1.0",
        durationMs,
        frameCount: this.frames.length,
        frames: this.frames,
      };
    }

    exportJson(now) {
      return JSON.stringify(this.exportData(now));
    }

    reset() {
      this.frames = [];
      this.startTime = null;
      this.lastSampleTime = 0;
      this.lastCompensation = false;
      this.isRecording = false;
    }
  }

  /**
   * KinematicPlayer
   * Controls playback, seeking, and Canvas stick-figure animation.
   */
  class KinematicPlayer {
    constructor(data = null) {
      this.load(data);
      this.currentTimeMs = 0;
      this.playbackSpeed = 1.0;
      this.isPlaying = false;
      this.lastTickTime = 0;
      this.loop = true;
    }

    load(data) {
      if (!data) {
        this.durationMs = 0;
        this.frames = [];
        return;
      }
      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      this.durationMs = parsed.durationMs || (parsed.frames?.length ? parsed.frames[parsed.frames.length - 1].t : 0);
      this.frames = Array.isArray(parsed.frames) ? parsed.frames : [];
      this.currentTimeMs = 0;
      this.isPlaying = false;
    }

    play() {
      if (!this.frames.length) return;
      this.isPlaying = true;
      this.lastTickTime = performance.now();
    }

    pause() {
      this.isPlaying = false;
    }

    togglePlay() {
      if (this.isPlaying) this.pause();
      else this.play();
    }

    seek(timeMs) {
      this.currentTimeMs = Math.max(0, Math.min(this.durationMs, timeMs));
    }

    setPlaybackSpeed(speed) {
      const s = Number(speed);
      if (s > 0 && s <= 4) {
        this.playbackSpeed = s;
      }
    }

    update(now = performance.now()) {
      if (!this.isPlaying || !this.frames.length) return;
      const dt = (now - this.lastTickTime) * this.playbackSpeed;
      this.lastTickTime = now;
      this.currentTimeMs += dt;

      if (this.currentTimeMs >= this.durationMs) {
        if (this.loop) {
          this.currentTimeMs = 0;
        } else {
          this.currentTimeMs = this.durationMs;
          this.pause();
        }
      }
    }

    getCurrentFrame() {
      if (!this.frames.length) return null;
      if (this.currentTimeMs <= this.frames[0].t) return this.frames[0];
      const last = this.frames[this.frames.length - 1];
      if (this.currentTimeMs >= last.t) return last;

      // Binary search for the frame immediately at or before currentTimeMs
      let low = 0, high = this.frames.length - 1;
      let bestIdx = 0;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (this.frames[mid].t <= this.currentTimeMs) {
          bestIdx = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      return this.frames[bestIdx];
    }

    /**
     * Renders stick-figure biomechanical skeleton to an HTML5 canvas.
     */
    renderToCanvas(canvas, frame = null, options = {}) {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const w = canvas.width;
      const h = canvas.height;

      const current = frame || this.getCurrentFrame();

      // Clear Canvas
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = options.bgColor || "#0f172a"; // slate-900
      ctx.fillRect(0, 0, w, h);

      // Draw subtle grid
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      for (let x = 40; x < w; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 40; y < h; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      if (!current || !Array.isArray(current.j) || current.j.length < 9) {
        ctx.fillStyle = "#94a3b8";
        ctx.font = '14px "Inter", sans-serif';
        ctx.textAlign = "center";
        ctx.fillText("Tidak ada data gerak kinematis", w / 2, h / 2);
        return;
      }

      // Project normalized coords (0..1) to canvas pixels with centering margin
      const margin = 30;
      const pw = w - margin * 2;
      const ph = h - margin * 2;

      const p = (jointIdx) => {
        const pt = current.j[jointIdx];
        if (!pt) return { x: w / 2, y: h / 2 };
        return {
          x: margin + pt[0] * pw,
          y: margin + pt[1] * ph,
        };
      };

      const nose = p(0);
      const ls   = p(1);
      const rs   = p(2);
      const le   = p(3);
      const re   = p(4);
      const lw   = p(5);
      const rw   = p(6);
      const lh   = p(7);
      const rh   = p(8);

      const midShoulder = { x: (ls.x + rs.x) * 0.5, y: (ls.y + rs.y) * 0.5 };
      const midHip      = { x: (lh.x + rh.x) * 0.5, y: (lh.y + rh.y) * 0.5 };

      const isComp = current.c === 1;
      const boneColor = isComp ? "#f43f5e" : "#2dd4bf"; // red if compensated, teal if clean
      const jointColor = "#ffffff";

      // 1. Draw Bones
      ctx.strokeStyle = boneColor;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const drawBone = (p1, p2) => {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      };

      // Spine & Shoulders
      drawBone(nose, midShoulder);
      drawBone(ls, rs);
      drawBone(midShoulder, midHip);
      drawBone(lh, rh);

      // Torso sides
      ctx.lineWidth = 2;
      drawBone(ls, lh);
      drawBone(rs, rh);

      // Left Arm
      ctx.lineWidth = 5;
      drawBone(ls, le);
      drawBone(le, lw);

      // Right Arm
      drawBone(rs, re);
      drawBone(re, rw);

      // 2. Draw Compensation Highlight
      if (isComp) {
        ctx.strokeStyle = "rgba(244, 63, 94, 0.6)";
        ctx.lineWidth = 2;
        if (typeof ctx.setLineDash === "function") ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(ls.y < rs.y ? ls.x : rs.x, ls.y < rs.y ? ls.y : rs.y, 22, 0, Math.PI * 2);
        ctx.stroke();
        if (typeof ctx.setLineDash === "function") ctx.setLineDash([]);
      }

      // 3. Draw Joints (Nodes)
      const drawJoint = (pt, r = 5, col = jointColor) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fill();
      };

      // Head
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.beginPath();
      ctx.arc(nose.x, nose.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = boneColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      drawJoint(ls, 6);
      drawJoint(rs, 6);
      drawJoint(le, 5);
      drawJoint(re, 5);
      drawJoint(lw, 6, isComp ? "#fbbf24" : "#4ade80");
      drawJoint(rw, 6, isComp ? "#fbbf24" : "#4ade80");
      drawJoint(lh, 5);
      drawJoint(rh, 5);

      // 4. Draw HUD Overlay (Angle & Compensation Status)
      const pad = 12;
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(pad, pad, 180, 52, 8);
      } else if (typeof ctx.rect === "function") {
        ctx.rect(pad, pad, 180, 52);
      }
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.font = '700 16px "Inter", sans-serif';
      ctx.fillStyle = isComp ? "#f87171" : "#4ade80";
      ctx.fillText(`ROM: ${current.a}°`, pad + 12, pad + 24);

      ctx.font = '600 11px "Inter", sans-serif';
      if (isComp) {
        ctx.fillStyle = "#f43f5e";
        ctx.fillText("⚠️ Bahu Terangkat (Kompensasi)", pad + 12, pad + 42);
      } else {
        ctx.fillStyle = "#94a3b8";
        ctx.fillText("✓ Kontrol Postur Bersih", pad + 12, pad + 42);
      }
    }
  }

  return {
    KinematicRecorder,
    KinematicPlayer,
    JOINT_MAP,
  };
});
