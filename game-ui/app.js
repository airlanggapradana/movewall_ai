/* ── Auth Guard — redirect to login if no session ─────────────── */
(function authGuard() {
  const token = sessionStorage.getItem("mw_token");
  if (!token) {
    console.warn("[MoveWall] No auth token found. Redirecting to login.");
    window.location.replace("./login.html");
  }
})();

// ─── API Base URL & Subscription Paywall Guard ──────────────────────────────
const _DEFAULT_CLOUD_BACKEND = "https://movewall-backend-production.up.railway.app";
const _BACKEND_ORIGIN =
  sessionStorage.getItem("mw_backend_url") ||
  window.MOVEWALL_BACKEND_URL ||
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? (sessionStorage.getItem("mw_use_local_backend") === "false" ? _DEFAULT_CLOUD_BACKEND : "http://localhost:3001")
    : _DEFAULT_CLOUD_BACKEND);

const BACKEND_API = `${_BACKEND_ORIGIN}/api`;

let isSubscriptionActive = false;
let isSubscriptionCheckDone = false;

function showGamePaywallModal(subData = null) {
  // Hentikan gameplay, kamera, dan musik
  if (typeof bgm !== "undefined" && bgm) {
    bgm.stop();
  }
  if (typeof game !== "undefined") {
    game.running = false;
    if (game.cameraStream) {
      game.cameraStream.getTracks().forEach((t) => t.stop());
      game.cameraStream = null;
    }
  }
  if (typeof ui !== "undefined" && ui) {
    if (ui.cameraPreview) {
      ui.cameraPreview.srcObject = null;
      ui.cameraPreview.classList.remove("visible");
    }
    if (ui.startButton) {
      ui.startButton.disabled = true;
      ui.startButton.title = "Akses game terkunci: Selesaikan pembayaran langganan";
    }
  }

  let overlay = document.getElementById("gamePaywallOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "gamePaywallOverlay";
    overlay.className = "game-paywall-overlay";
    overlay.innerHTML = `
      <div class="game-paywall-card" role="dialog" aria-modal="true">
        <div class="game-paywall-badge-wrap">
          <span class="game-paywall-badge-icon">🔒</span>
        </div>
        <span class="game-paywall-tag">Akses Game Terkunci</span>
        <h2 class="game-paywall-title">Langganan Terapis Diperlukan</h2>
        <p class="game-paywall-desc">
          Modul latihan rehabilitasi MoveWall AI (Apple Archer & Garden Keeper) dinonaktifkan sementara karena akun Anda belum memiliki langganan aktif. Selesaikan pembayaran langganan melalui Dashboard Terapis untuk mengaktifkan seluruh fitur dan game.
        </p>
        <div class="game-paywall-price-pill">
          <span>MoveWall AI Pro 30 Hari</span>
          <span>&bull;</span>
          <span>Rp 300.000</span>
        </div>
        <div class="game-paywall-actions">
          <a href="./dashboard.html?view=subscription" class="btn-game-paywall-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
              <line x1="1" y1="10" x2="23" y2="10"></line>
            </svg>
            <span>Buka Dashboard &amp; Bayar Langganan</span>
          </a>
          <button type="button" id="btnGamePaywallLogout" class="btn-game-paywall-secondary">
            <span>Keluar / Ganti Akun</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const btnLogout = overlay.querySelector("#btnGamePaywallLogout");
    if (btnLogout) {
      btnLogout.addEventListener("click", () => {
        sessionStorage.removeItem("mw_token");
        sessionStorage.removeItem("mw_therapist");
        window.location.replace("./login.html");
      });
    }
  } else {
    overlay.classList.remove("hidden");
  }

  if (typeof setFeedback === "function") {
    setFeedback("bad", "Akses Terkunci", "Langganan aktif diperlukan untuk bermain");
  }
}

async function verifyGameSubscription() {
  const token = sessionStorage.getItem("mw_token");
  if (!token) return false;

  try {
    const res = await fetch(`${BACKEND_API}/subscription/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      isSubscriptionActive = false;
      isSubscriptionCheckDone = true;
      showGamePaywallModal();
      return false;
    }
    const data = await res.json();
    isSubscriptionCheckDone = true;
    isSubscriptionActive = !!data.isActive;

    if (!isSubscriptionActive) {
      showGamePaywallModal(data);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[MoveWall] Gagal memverifikasi subscription:", err);
    return false;
  }
}

// Jalankan verifikasi subscription seawal mungkin
verifyGameSubscription();

/* ── Background Music Controller (Ascent at Dawn) ────────── */
const bgm = {
  audio: null,
  src: "./assets/Ascent_at_Dawn.mp3",
  isPlaying: false,
  isMuted: false,
  volume: 0.35,

  init() {
    if (this.audio) return;
    this.audio = new Audio(this.src);
    this.audio.loop = true;
    this.audio.volume = this.volume;
    this.audio.preload = "auto";

    this.audio.addEventListener("play", () => {
      this.isPlaying = true;
      this.updateUI();
    });

    this.audio.addEventListener("pause", () => {
      this.isPlaying = false;
      this.updateUI();
    });

    this.audio.addEventListener("error", (err) => {
      console.warn("[MoveWall] Audio BGM error:", err);
    });
  },

  play() {
    this.init();
    if (!this.audio || this.isMuted) return;
    const playPromise = this.audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          this.isPlaying = true;
          this.updateUI();
        })
        .catch((err) => {
          console.warn("[MoveWall] Autoplay dicegah browser (perlu interaksi pengguna):", err);
        });
    }
  },

  pause() {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
    }
    this.isPlaying = false;
    this.updateUI();
  },

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.isPlaying = false;
    this.updateUI();
  },

  toggleMute() {
    this.init();
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.pause();
    } else {
      if (typeof game !== "undefined" && game && game.running && !game.missionCompleted && !game.timeoutTriggered && !game.painStop) {
        this.play();
      }
    }
    this.updateUI();
  },

  updateUI() {
    const btn = document.getElementById("musicToggleButton");
    const icon = document.getElementById("musicToggleIcon");
    if (!btn) return;

    if (this.isMuted) {
      btn.classList.add("muted");
      btn.classList.remove("playing");
      if (icon) icon.textContent = "🔇";
      btn.title = "Musik dibisukan - Klik untuk mengaktifkan";
    } else if (this.isPlaying) {
      btn.classList.add("playing");
      btn.classList.remove("muted");
      if (icon) icon.textContent = "🔊";
      btn.title = "Musik aktif - Klik untuk membisukan";
    } else {
      btn.classList.remove("playing", "muted");
      if (icon) icon.textContent = "🎵";
      btn.title = "Musik siap - Klik untuk memutar";
    }
  },
};

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const motionCanvas = document.createElement("canvas");
const motionCtx = motionCanvas.getContext("2d", { willReadFrequently: true });

const MEDIAPIPE_SOURCES = [
  {
    bundle: "./node_modules/@mediapipe/tasks-vision/vision_bundle.mjs",
    wasm: "./node_modules/@mediapipe/tasks-vision/wasm",
  },
  {
    bundle:
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs",
    wasm: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
  },
];
const POSE_MODEL_URL = "./assets/pose_landmarker.task";
const ORCHARD_BACKGROUND_URL = "./assets/orchard-archery-reference.jpeg";
const USE_ORCHARD_REFERENCE = true;
let MISSION_TARGETS = [30, 45, 60, 75, 90, 105, 120, 135, 150, 165];
let activeAdaptiveEngine = null;
let activeKinematicRecorder = typeof MoveWallKinematics !== "undefined"
  ? new MoveWallKinematics.KinematicRecorder()
  : null;
let activePatientData = null;
const LEVEL_ONE_HITS = 5;
const TARGET_HOLD_SECONDS = 2.0;
const TARGET_HOLD_UNDER_TOLERANCE = 8;
const TARGET_HOLD_OVER_TOLERANCE = 9;
const POSE_TARGET_FPS = 30;
const POSE_FRAME_INTERVAL = 1000 / POSE_TARGET_FPS;

const orchardBackground = new Image();
if (USE_ORCHARD_REFERENCE) {
  orchardBackground.onload = () =>
    console.info("[MoveWall] Orchard background image loaded successfully");
  orchardBackground.onerror = (e) =>
    console.warn("[MoveWall] Failed to load orchard background:", e);
  orchardBackground.src = ORCHARD_BACKGROUND_URL;
}

const ui = {
  score: document.getElementById("score"),
  time: document.getElementById("time"),
  level: document.getElementById("level"),
  reps: document.getElementById("reps"),
  rom: document.getElementById("rom"),
  target: document.getElementById("target"),
  romStatus: document.getElementById("romStatus"),
  feedback: document.getElementById("feedback"),
  feedbackTitle: document.getElementById("feedbackTitle"),
  feedbackText: document.getElementById("feedbackText"),
  cameraPreview: document.getElementById("cameraPreview"),
  startButton: document.getElementById("startButton"),
  pauseButton: document.getElementById("pauseButton"),
  resetButton: document.getElementById("resetButton"),
  painButton: document.getElementById("painButton"),
  missionCompleteOverlay: document.getElementById("missionCompleteOverlay"),
  modalScore: document.getElementById("modalScore"),
  modalHits: document.getElementById("modalHits"),
  modalLevel: document.getElementById("modalLevel"),
  modalTime: document.getElementById("modalTime"),
  modalReplayButton: document.getElementById("modalReplayButton"),
  modalNextButton: document.getElementById("modalNextButton"),
  timeoutOverlay: document.getElementById("timeoutOverlay"),
  timeoutScore: document.getElementById("timeoutScore"),
  timeoutHits: document.getElementById("timeoutHits"),
  timeoutLevel: document.getElementById("timeoutLevel"),
  timeoutTarget: document.getElementById("timeoutTarget"),
  timeoutRetryButton: document.getElementById("timeoutRetryButton"),
  timeoutResetButton: document.getElementById("timeoutResetButton"),
  timeoutAssessmentButton: document.getElementById("timeoutAssessmentButton"),
  // Assessment dialog
  modalAssessmentButton: document.getElementById("modalAssessmentButton"),
  assessmentOverlay: document.getElementById("assessmentOverlay"),
  assessmentForm: document.getElementById("assessmentForm"),
  assessmentCloseBtn: document.getElementById("assessmentCloseBtn"),
  assessmentCancelBtn: document.getElementById("assessmentCancelBtn"),
  assessmentSubmitBtn: document.getElementById("assessmentSubmitBtn"),
  assessmentSubmitText: document.getElementById("assessmentSubmitText"),
  assessmentSubmitLoader: document.getElementById("assessmentSubmitLoader"),
  assessmentError: document.getElementById("assessmentError"),
  assessmentSuccess: document.getElementById("assessmentSuccess"),
  assessmentSuccessCloseBtn: document.getElementById("assessmentSuccessCloseBtn"),
  assessmentTherapistName: document.getElementById("assessmentTherapistName"),
  musicToggleButton: document.getElementById("musicToggleButton"),
  // Player Lock & Calibration (Fitur 9 & Fitur 4)
  btnPlayerLock: document.getElementById("btnPlayerLock"),
  btnCalibrate: document.getElementById("btnCalibrate"),
  playerOccludedOverlay: document.getElementById("playerOccludedOverlay"),
  occludedStatusText: document.getElementById("occludedStatusText"),
  btnRelockPlayer: document.getElementById("btnRelockPlayer"),
  btnUnlockPlayer: document.getElementById("btnUnlockPlayer"),
  calibrationOverlay: document.getElementById("calibrationOverlay"),
  calibrationCloseBtn: document.getElementById("calibrationCloseBtn"),
  calibDistanceStatus: document.getElementById("calibDistanceStatus"),
  calibShoulderStatus: document.getElementById("calibShoulderStatus"),
  calibZeroOffset: document.getElementById("calibZeroOffset"),
  calibrationFeedback: document.getElementById("calibrationFeedback"),
  btnSampleBaseline: document.getElementById("btnSampleBaseline"),
  btnApplyCalibration: document.getElementById("btnApplyCalibration"),
};

/* ── apple tree data ───────────────────────────────── */

function makeTreeRow() {
  return [
    { x: 0.16, canopyR: 0.075, trunkH: 0.12, hue: "#5aa050" },
    { x: 0.54, canopyR: 0.095, trunkH: 0.15, hue: "#438d40" },
    { x: 0.79, canopyR: 0.155, trunkH: 0.22, hue: "#2f7d3a" },
  ];
}

function makeHangingApples() {
  return [
    { treeIdx: 0, ox: -0.02, oy: 0.03, picked: false },
    { treeIdx: 1, ox: -0.035, oy: 0.02, picked: false },
    { treeIdx: 1, ox: 0.035, oy: 0.04, picked: false },
    { treeIdx: 2, ox: -0.07, oy: 0.0, picked: false },
    { treeIdx: 2, ox: -0.035, oy: 0.05, picked: false },
    { treeIdx: 2, ox: 0.0, oy: 0.02, picked: false },
    { treeIdx: 2, ox: 0.045, oy: 0.065, picked: false },
    { treeIdx: 2, ox: 0.075, oy: 0.01, picked: false },
    { treeIdx: 2, ox: -0.005, oy: 0.09, picked: false },
    { treeIdx: 2, ox: 0.105, oy: 0.055, picked: false },
  ];
}

/* ── game state ────────────────────────────────────── */

const game = {
  running: false,
  mode: "camera",
  cameraStream: null,
  poseLandmarker: null,
  poseLoading: false,
  poseReady: false,
  poseFallback: false,
  poseBackend: "Not loaded",
  lastPoseAt: 0,
  poseBusy: false,
  lastVideoTime: -1,
  trackingQuality: "Waiting for camera",
  trackedSide: "right",
  posePoints: null,
  lostPoseFrames: 0,
  rawAngle: 20,
  controlAngle: 20,
  clinicalAngle: 20,
  displayAngle: 20,
  targetAcquired: false,
  shotArmed: true,
  debugMode: false,
  debugConfidence: 0,
  debugLandmarkCount: 0,
  debugLastLandmarks: null,
  handFollow: {
    x: 0.35,
    y: 0.55,
    visible: false,
  },
  previousCameraFrame: null,
  cameraAngle: 20,
  cameraIdleTimer: 0,
  score: 0,
  timeRemaining: 90,
  level: 1,
  reps: 0,
  repsGoal: MISSION_TARGETS.length,
  angle: 20,
  targetRom: MISSION_TARGETS[0],
  maxTargetRom: MISSION_TARGETS[MISSION_TARGETS.length - 1],
  minTargetRom: MISSION_TARGETS[0],
  repState: "RESTING",
  peakAngle: 0,
  holdTimer: 0,
  lastHoldTimestamp: null,
  lastTick: performance.now(),
  targetHitFlash: 0,
  targetCooldown: 0,
  painStop: false,
  missionCompleted: false,
  timeoutTriggered: false,
  lastRepFrameId: null,
  feedbackKind: "neutral",
  feedbackTitle: "Ready",
  feedbackText: "Start camera to draw the bow",
  /* Fitur 9: Player Lock State */
  playerLock: {
    locked: false,
    centroid: null,
    lostFrames: 0,
    maxLostFrames: 30, // ~1s
    isOccluded: false,
  },
  /* Fitur 4: Camera Calibration State */
  calibration: {
    zeroOffset: 0.0,
    isCalibrating: false,
    distanceStatus: "Menunggu kamera",
    shoulderStatus: "—",
  },
  /* Fitur 5: Home Tele-Rehab State */
  homeSession: {
    active: false,
    code: null,
    patientName: null,
    therapistName: null,
  },
  /* mission-specific */
  trees: makeTreeRow(),
  hangingApples: makeHangingApples(),
  sparkles: [],
  fallingLeaves: [],
  arrows: [],
  basketApples: 0,
};

/* ── helpers ───────────────────────────────────────── */

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const mins = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
  const secs = String(safeSeconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

/* ── edge payload ──────────────────────────────────── */

function buildPayload(
  angle,
  repJustCompleted = false,
  repStatus = "NONE",
  peakAngle = game.peakAngle,
) {
  const color = getTargetColor(angle);

  return {
    frame_id: Math.round(performance.now()),
    exercise_type: "RIGHT_ELBOW_FLEXION",
    current_angle: angle,
    state: game.repState,
    rep_status: repJustCompleted ? repStatus : "NONE",
    metrics: {
      valid_reps: game.reps,
      partial_reps: 0,
      target_rom: game.targetRom,
      control_rom: game.controlAngle,
      clinical_rom: game.clinicalAngle,
      success_rate: game.reps > 0 ? 1 : 0,
      arar: game.targetRom > 0 ? angle / game.targetRom : 0,
      consistency_bonus: 0.92,
      reps_in_current_set: game.reps % LEVEL_ONE_HITS,
    },
    audio_cue: null,
    visual_overlay_color: color,
    peak_angle: peakAngle,
  };
}

function receiveEdgePayload(payload) {
  if (!payload || typeof payload.current_angle !== "number") return;

  game.angle = clamp(payload.current_angle, 0, 180);
  game.targetRom = clamp(
    payload.metrics?.target_rom ?? game.targetRom,
    game.minTargetRom,
    game.maxTargetRom,
  );
  game.repState = payload.state || game.repState;

  if (payload.rep_status === "VALID") {
    if (payload.frame_id !== game.lastRepFrameId) {
      game.lastRepFrameId = payload.frame_id;
      completeRep("VALID", payload.peak_angle ?? game.angle);
    }
  } else if (payload.rep_status === "PARTIAL") {
    setFeedback("warn", "Almost", "Aim a little higher at the apple");
  } else if (payload.rep_status === "INVALID") {
    setFeedback("bad", "Reset", "Lower your arm and try again");
  } else if (payload.audio_cue) {
    setFeedback("warn", "Adjust", payload.audio_cue);
  } else {
    updateFeedbackFromAngle(payload.visual_overlay_color);
  }
}

window.MoveWallGame = { receiveEdgePayload };

/* ── pose / camera (preserved) ─────────────────────── */

async function ensurePoseLandmarker() {
  if (game.poseReady) return true;
  if (game.poseLoading) return false;

  game.poseLoading = true;
  game.trackingQuality = "Loading pose model";
  try {
    const { visionTasks, vision, source } = await loadVisionTasks();
    try {
      game.poseLandmarker = await createPoseLandmarker(
        visionTasks,
        vision,
        "GPU",
      );
    } catch (gpuError) {
      console.warn("MoveWall GPU pose init failed, retrying CPU:", gpuError);
      game.poseLandmarker = await createPoseLandmarker(
        visionTasks,
        vision,
        "CPU",
      );
    }
    game.poseReady = true;
    game.poseFallback = false;
    game.poseBackend = source;
    game.trackingQuality = `Pose AI ready (${source})`;
    return true;
  } catch (error) {
    game.poseFallback = false;
    game.poseBackend = "Unavailable";
    game.trackingQuality = "Pose AI unavailable";
    console.error("MoveWall pose model error:", error);
    return false;
  } finally {
    game.poseLoading = false;
  }
}

async function loadVisionTasks() {
  let lastError;
  for (const source of MEDIAPIPE_SOURCES) {
    try {
      const visionTasks = await import(source.bundle);
      const vision = await visionTasks.FilesetResolver.forVisionTasks(
        source.wasm,
      );
      return {
        visionTasks,
        vision,
        source: source.bundle.startsWith(".") ? "local" : "cdn",
      };
    } catch (error) {
      lastError = error;
      console.warn("MoveWall pose source failed:", source.bundle, error);
    }
  }
  throw lastError;
}

function createPoseLandmarker(visionTasks, vision, delegate) {
  return visionTasks.PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: POSE_MODEL_URL,
      delegate,
    },
    runningMode: "VIDEO",
    numPoses: 3,
    // Diturunkan dari 0.45 → 0.3 agar model tetap mendeteksi pose
    // meski pencahayaan atau sudut kurang ideal
    minPoseDetectionConfidence: 0.3,
    minPosePresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
  });
}

async function ensureCameraReady() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setFeedback(
      "bad",
      "Camera unavailable",
      "Browser does not support webcam access",
    );
    return false;
  }

  try {
    if (!game.cameraStream) {
      game.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 480 },
          height: { ideal: 360 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: "user",
        },
        audio: false,
      });
    }
    ui.cameraPreview.srcObject = game.cameraStream;
    ui.cameraPreview.classList.add("visible");
    await waitForVideoReady(ui.cameraPreview);
    game.previousCameraFrame = null;
    game.cameraIdleTimer = 0;
    game.lastPoseAt = 0;
    game.lastVideoTime = -1;
    setFeedback("warn", "Camera ready", "Loading pose tracking");
    const poseReady = await ensurePoseLandmarker();
    if (!poseReady) {
      setFeedback(
        "bad",
        "Pose AI unavailable",
        "Check local server and refresh",
      );
      return false;
    }
    setFeedback("good", "Pose AI ready", "Raise your hand to draw the bow");
    return true;
  } catch (error) {
    setFeedback(
      "bad",
      "Camera blocked",
      "Allow camera permission in the browser",
    );
    console.error("MoveWall camera error:", error);
    return false;
  }
}

function waitForVideoReady(video) {
  return new Promise((resolve) => {
    const done = () => {
      video.play().catch(() => {});
      resolve();
    };
    if (video.readyState >= 1 && video.videoWidth > 0) {
      done();
      return;
    }
    video.addEventListener("loadedmetadata", done, { once: true });
  });
}

function updateCameraMotion(dt) {
  const trackWhilePaused = game.playerLock.isOccluded || game.calibration.isCalibrating;
  if ((!game.running && !trackWhilePaused) || game.mode !== "camera" || game.painStop) return;
  if (!ui.cameraPreview.videoWidth || !ui.cameraPreview.videoHeight) return;

  if (!game.poseReady || !game.poseLandmarker) {
    game.trackingQuality = game.poseLoading
      ? "Loading pose model"
      : "Pose AI unavailable";
    return;
  }

  updatePoseTracking(performance.now());
}

function updatePoseTracking(now) {
  if (game.poseBusy || now - game.lastPoseAt < POSE_FRAME_INTERVAL) return;

  const video = ui.cameraPreview;
  // Gunakan timestamp-based dedup, bukan video.currentTime, karena beberapa
  // browser mengembalikan nilai currentTime yang sama antar frame meski video
  // sudah bergerak — menyebabkan pose detection ter-skip terus.
  const videoTimestamp = video.currentTime;
  if (
    videoTimestamp === game.lastVideoTime &&
    now - game.lastPoseAt < POSE_FRAME_INTERVAL * 3
  )
    return;

  game.lastPoseAt = now;
  game.lastVideoTime = videoTimestamp;

  game.poseBusy = true;
  let result;
  try {
    result = game.poseLandmarker.detectForVideo(video, now);
  } catch (error) {
    game.trackingQuality = "Pose inference error";
    setFeedback(
      "bad",
      "Tracking error",
      "Refresh the game and start camera again",
    );
    console.error("MoveWall pose inference error:", error);
    return;
  } finally {
    game.poseBusy = false;
  }

  const allLandmarks = result?.landmarks || [];
  game.debugLastAllLandmarks = allLandmarks;
  let landmarks = null;
  let matchInfo = null;

  // Fitur 9: Player Lock matching & Occlusion tracking
  if (game.playerLock.locked && game.playerLock.centroid) {
    matchInfo = typeof MoveWallPlayerTracker !== "undefined"
      ? MoveWallPlayerTracker.matchLockedPlayer(allLandmarks, game.playerLock.centroid)
      : (allLandmarks[0] ? { landmarks: allLandmarks[0], centroid: null, distance: 0 } : null);

    if (matchInfo) {
      landmarks = matchInfo.landmarks;
      if (typeof MoveWallPlayerTracker !== "undefined" && matchInfo.centroid) {
        game.playerLock.centroid = MoveWallPlayerTracker.smoothCentroid(game.playerLock.centroid, matchInfo.centroid);
      }
      game.playerLock.lostFrames = 0;
      if (game.playerLock.isOccluded) {
        resumeFromOcclusion();
      }
    } else {
      // Pemain terkunci tidak ditemukan di frame ini
      game.playerLock.lostFrames++;
      if (game.playerLock.lostFrames >= game.playerLock.maxLostFrames && game.running && !game.playerLock.isOccluded) {
        triggerOcclusionPause("Pemain terkunci terhalang orang lain atau keluar dari bidang pandang kamera.");
        return;
      }
    }
  } else {
    // Mode Bebas (Unlocked): ambil orang pertama
    landmarks = allLandmarks[0] || null;
    if (landmarks && typeof MoveWallPlayerTracker !== "undefined") {
      const c = MoveWallPlayerTracker.computeCentroid(landmarks);
      if (c) game.playerLock.centroid = c;
    }
  }

  if (!landmarks) {
    handlePoseMiss("No full body detected", "Keep shoulder and hand visible");
    return;
  }

  // Simpan raw confidence untuk debug overlay
  game.debugLandmarkCount = landmarks.length;
  game.debugLastLandmarks = landmarks;

  // Fitur 4: Live Calibration Update jika dialog kalibrasi sedang terbuka
  if (game.calibration.isCalibrating && typeof MoveWallPlayerTracker !== "undefined") {
    updateLiveCalibration(landmarks);
  }

  if (!game.running) return;

  const estimate = estimateArmRaiseRom(landmarks);
  if (!estimate) {
    handlePoseMiss("Hand not visible", "Keep your wrist inside the camera");
    return;
  }

  game.lostPoseFrames = 0;
  game.trackingQuality = estimate.compensation
    ? "Shoulder hike detected"
    : `Tracking ${estimate.side} arm${game.playerLock.locked ? " 🔒[LOCKED]" : ""}`;
  game.trackedSide = estimate.side;
  game.posePoints = estimate.points;
  game.debugConfidence = estimate.confidence;
  updateHandFollow(estimate.points.wrist);
  game.rawAngle = estimate.controlAngle;

  // Fitur 4: Terapkan Zero-Offset Baseline pada sudut klinis
  const rawClinical = estimate.clinicalAngle;
  const zeroCalibrated = typeof MoveWallPlayerTracker !== "undefined"
    ? MoveWallPlayerTracker.applyZeroOffset(rawClinical, game.calibration.zeroOffset)
    : rawClinical;

  // Stabilisasi dieksekusi TEPAT 1 KALI per frame agar ring-buffer tidak terkorupsi
  const stabilizedAngle = stabilizeClinicalAngle(
    zeroCalibrated,
    game.clinicalAngle,
  );
  game.clinicalAngle = stabilizedAngle;
  game.controlAngle = stabilizedAngle;
  game.displayAngle = stabilizedAngle;
  game.cameraAngle = stabilizedAngle;

  // Rekam metrik sesi (ROM maksimum, akurasi, kompensasi) untuk asesmen terapis.
  MoveWallMetrics.sample({
    angle: game.clinicalAngle,
    targetRom: game.targetRom,
    under: TARGET_HOLD_UNDER_TOLERANCE,
    over: TARGET_HOLD_OVER_TOLERANCE,
    compensation: !!estimate.compensation,
    now,
  });

  // Fitur 6: Rekam kerangka gerak kinematis (stick-figure 9 sendi tanpa video)
  if (!activeKinematicRecorder && typeof MoveWallKinematics !== "undefined") {
    activeKinematicRecorder = new MoveWallKinematics.KinematicRecorder();
  }
  if (activeKinematicRecorder && game.running) {
    activeKinematicRecorder.sample(landmarks, game.clinicalAngle, !!estimate.compensation, now);
  }

  const payload = processTargetHold(game.controlAngle, now);
  if (estimate.compensation) {
    payload.audio_cue = "Lower your shoulder a bit";
    payload.visual_overlay_color = "RED";
    resetTargetHold();
  }
  receiveEdgePayload(payload);
}

function handlePoseMiss(title, text) {
  game.lostPoseFrames += 1;

  // Perlebar grace window dari 6 → 15 frame agar deteksi tidak terlalu
  // sensitif terhadap frame intermiten yang gagal (mis. oklusi sementara)
  if (game.lostPoseFrames <= 15 && game.posePoints) {
    game.trackingQuality = "Tracking stable";
    return;
  }

  game.handFollow.visible = false;
  resetTargetHold();
  game.trackingQuality = title;
  setFeedback("warn", title, text);
}

/* ── Fitur 9: Player Lock & Occlusion Helpers ────────────────────────── */

function triggerOcclusionPause(reason = "") {
  if (!game.running && game.playerLock.isOccluded) return;
  game.playerLock.isOccluded = true;
  game.running = false;
  bgm.pause();
  if (ui.playerOccludedOverlay) {
    ui.playerOccludedOverlay.classList.remove("hidden");
  }
  if (ui.occludedStatusText && reason) {
    ui.occludedStatusText.textContent = reason;
  }
  setFeedback("warn", "Pelacakan Terjeda", "Pemain terhalang orang lain");
}

function resumeFromOcclusion() {
  if (!game.playerLock.isOccluded) return;
  game.playerLock.isOccluded = false;
  if (ui.playerOccludedOverlay) {
    ui.playerOccludedOverlay.classList.add("hidden");
  }
  game.running = true;
  bgm.play();
  setFeedback("neutral", "Pemain Terdeteksi Kembali", "Latihan dilanjutkan otomatis");
}

function togglePlayerLock() {
  if (game.playerLock.locked) {
    // Unlock player
    const wasOccluded = game.playerLock.isOccluded;
    game.playerLock.locked = false;
    game.playerLock.isOccluded = false;
    game.playerLock.lostFrames = 0;
    if (ui.btnPlayerLock) {
      ui.btnPlayerLock.classList.remove("active");
      ui.btnPlayerLock.innerHTML = "🔒 Kunci Pemain";
    }
    if (ui.playerOccludedOverlay) {
      ui.playerOccludedOverlay.classList.add("hidden");
    }
    if (wasOccluded && !game.painStop && !game.missionCompleted && !game.timeoutTriggered) {
      game.running = true;
      bgm.play();
    }
    setFeedback("neutral", "Kunci Dibuka", "Mode bebas: melacak siapa pun di depan kamera");
  } else {
    // Lock onto currently detected body centroid
    if (!game.cameraStream) {
      setFeedback("warn", "Nyalakan Kamera Dulu", "Klik 'Start Camera' lalu berdiri di depan kamera untuk mengunci pemain");
      return;
    }
    const wasOccluded = game.playerLock.isOccluded;
    const candidateLandmarks =
      (wasOccluded && game.debugLastAllLandmarks && game.debugLastAllLandmarks[0]) ||
      game.debugLastLandmarks;
    if (!candidateLandmarks) {
      setFeedback("warn", "Gagal Mengunci", "Pastikan bahu dan tubuh terlihat di depan kamera");
      return;
    }
    const c = typeof MoveWallPlayerTracker !== "undefined"
      ? MoveWallPlayerTracker.computeCentroid(candidateLandmarks)
      : null;
    if (!c) {
      setFeedback("warn", "Gagal Mengunci", "Pastikan kedua bahu terlihat jelas di depan kamera");
      return;
    }
    game.playerLock.locked = true;
    game.playerLock.centroid = c;
    game.playerLock.lostFrames = 0;
    game.playerLock.isOccluded = false;
    if (ui.btnPlayerLock) {
      ui.btnPlayerLock.classList.add("active");
      ui.btnPlayerLock.innerHTML = "🔓 Buka Kunci";
    }
    if (ui.playerOccludedOverlay) {
      ui.playerOccludedOverlay.classList.add("hidden");
    }
    if (wasOccluded && !game.painStop && !game.missionCompleted && !game.timeoutTriggered) {
      game.running = true;
      bgm.play();
    }
    setFeedback("good", "Pemain Terkunci 🔒", "Sistem hanya melacak tubuh Anda walau ada orang lain lewat di sekitar");
  }
}

/* ── Fitur 4: Camera Calibration & Neutral Zero-Offset Helpers ─────────── */

function openCalibrationModal() {
  game.calibration.isCalibrating = true;
  if (ui.calibrationOverlay) {
    ui.calibrationOverlay.classList.remove("hidden");
  }
  ensureCameraReady();
}

function closeCalibrationModal() {
  game.calibration.isCalibrating = false;
  if (ui.calibrationOverlay) {
    ui.calibrationOverlay.classList.add("hidden");
  }
}

function sampleZeroBaseline() {
  if (!game.debugLastLandmarks) {
    if (ui.calibrationFeedback) {
      ui.calibrationFeedback.textContent = "Kamera belum mendeteksi tubuh. Harap berdiri tegak di depan kamera.";
      ui.calibrationFeedback.style.color = "#f87171";
    }
    return;
  }
  const estimate = estimateArmRaiseRom(game.debugLastLandmarks);
  if (!estimate) {
    if (ui.calibrationFeedback) {
      ui.calibrationFeedback.textContent = "Lengan belum terdeteksi. Posisikan tangan rileks di samping paha.";
      ui.calibrationFeedback.style.color = "#f87171";
    }
    return;
  }

  const sampledAngle = Math.round(estimate.clinicalAngle * 10) / 10;
  game.calibration.zeroOffset = sampledAngle;
  try {
    localStorage.setItem("mw_zero_offset", String(sampledAngle));
  } catch (_) {}

  if (ui.calibZeroOffset) {
    ui.calibZeroOffset.textContent = `${sampledAngle.toFixed(1)}°`;
  }
  if (ui.calibrationFeedback) {
    ui.calibrationFeedback.textContent = `✓ Titik nol berhasil dikalibrasi (${sampledAngle.toFixed(1)}°). Saat lengan rileks, elevasi terbaca 0°.`;
    ui.calibrationFeedback.style.color = "#4ade80";
  }
}

function updateLiveCalibration(landmarks) {
  if (typeof MoveWallPlayerTracker === "undefined") return;
  const report = MoveWallPlayerTracker.evaluateCameraCalibration(landmarks, game.calibration.zeroOffset);
  if (!report.valid) return;

  if (ui.calibDistanceStatus) {
    ui.calibDistanceStatus.textContent = report.distanceLabel;
    ui.calibDistanceStatus.style.color = report.distanceColor === "green" ? "#4ade80" : "#fbbf24";
  }
  if (ui.calibShoulderStatus) {
    ui.calibShoulderStatus.textContent = report.shoulderLabel;
    ui.calibShoulderStatus.style.color = report.shoulderColor === "green" ? "#4ade80" : "#fbbf24";
  }
  if (ui.calibZeroOffset) {
    ui.calibZeroOffset.textContent = `${report.zeroOffset.toFixed(1)}°`;
  }
}

/**
 * Stabilisasi sudut klinis dengan multi-layer noise filtering.
 * Menggunakan ring-buffer untuk rata-rata bergerak (moving average),
 * adaptive deadzone, dan hysteresis snap-to-target yang halus.
 *
 * Perbaikan utama vs versi sebelumnya:
 * 1. Ring-buffer 5 sampel → rata-rata bergerak menghilangkan jitter tinggi
 * 2. Deadzone adaptif: 1.5° (dekat target) / 0.8° (bergerak) → cegah pointer bergetar
 * 3. Snap-to-target dengan hysteresis: masuk di ≤3°, keluar di >5° → cegah
 *    osilasi di batas zona target
 * 4. Alpha bertingkat lebih halus untuk gerakan kecil (0.35) → stabilitas
 */
const _romSampleBuffer = [];
const _ROM_BUFFER_SIZE = 5;
let _isSnappedToTarget = false;

function stabilizeClinicalAngle(rawAngle, previousAngle) {
  // 1. Ring-buffer: simpan 5 sampel terakhir, ambil rata-rata
  _romSampleBuffer.push(rawAngle);
  if (_romSampleBuffer.length > _ROM_BUFFER_SIZE) _romSampleBuffer.shift();
  const avgRaw = _romSampleBuffer.reduce((s, v) => s + v, 0) / _romSampleBuffer.length;

  const diff = avgRaw - previousAngle;
  const absDiff = Math.abs(diff);

  // 2. Adaptive deadzone — lebih besar saat dekat target untuk stabilitas
  const nearTarget = Math.abs(avgRaw - game.targetRom) <= 10;
  const deadzone = nearTarget ? 1.5 : 0.8;
  if (absDiff < deadzone) return previousAngle;

  // 3. Hysteresis snap-to-target — masuk mudah, keluar harus gerakan jelas
  //    Ini menghilangkan osilasi di batas zona saat tangan sedikit bergetar
  const distToTarget = Math.abs(avgRaw - game.targetRom);
  const prevDistToTarget = Math.abs(previousAngle - game.targetRom);

  if (_isSnappedToTarget) {
    // Sudah ter-snap: lepas hanya jika gerakan cukup jauh dari target
    if (distToTarget > 6.5 || absDiff > 9) {
      _isSnappedToTarget = false;
    } else {
      return game.targetRom;
    }
  } else {
    // Belum ter-snap: snap jika berada di zona target
    if (distToTarget <= 4.5 && prevDistToTarget <= 7) {
      _isSnappedToTarget = true;
      return game.targetRom;
    }
  }

  // 4. Alpha EMA bertingkat — lebih halus untuk gerakan kecil
  //    Gerakan besar  (>18°): 0.82 → respons cepat (intentional movement)
  //    Gerakan sedang (>7°):  0.58 → respons moderat
  //    Gerakan kecil  (≤7°):  0.35 → halus, cegah jitter dari noise MediaPipe
  const alpha = absDiff > 18 ? 0.82 : absDiff > 7 ? 0.58 : 0.35;
  return previousAngle + diff * alpha;
}

function getAimPointNorm() {
  const targetRange = game.maxTargetRom - game.minTargetRom;
  const currentRatio =
    targetRange > 0 ? (game.controlAngle - game.minTargetRom) / targetRange : 0;
  return {
    x: 0.79,
    y: 0.68 - clamp(currentRatio, -0.15, 1.15) * 0.46,
  };
}

function getAimPoint(width, height) {
  const norm = getAimPointNorm();
  return {
    x: width * norm.x,
    y: height * norm.y,
  };
}

function isAngleInsideTargetWindow(angle) {
  return (
    angle >= game.targetRom - TARGET_HOLD_UNDER_TOLERANCE &&
    angle <= game.targetRom + TARGET_HOLD_OVER_TOLERANCE
  );
}

function isAimingAtTarget(angle) {
  if (game.targetCooldown > 0) return false;
  // Sesuai permintaan: ROM tangan HARUS berada pada derajat ROM target
  return isAngleInsideTargetWindow(angle);
}

function getTargetColor(angle) {
  if (isAngleInsideTargetWindow(angle)) return "GREEN";
  if (Math.abs(angle - game.targetRom) <= 14) return "YELLOW";
  return "RED";
}

function getTargetPointNorm() {
  const targetRange = game.maxTargetRom - game.minTargetRom;
  const targetRatio =
    targetRange > 0 ? (game.targetRom - game.minTargetRom) / targetRange : 0;
  return {
    x: 0.79,
    y: 0.68 - targetRatio * 0.46,
  };
}

function getTargetPoint(width, height) {
  const point = getTargetPointNorm();
  return {
    x: width * point.x,
    y: height * point.y,
  };
}

function updateHandFollow(wrist) {
  const mirroredX = 1 - wrist.x;
  const targetX = clamp(mirroredX, 0.08, 0.92);
  const targetY = clamp(wrist.y, 0.12, 0.88);

  // Lerp weight diseimbangkan: 0.78 → cukup responsif tapi meredam jitter
  // dari noise landmark MediaPipe. Sebelumnya 0.93 terlalu sensitif.
  game.handFollow.x = game.handFollow.x * 0.22 + targetX * 0.78;
  game.handFollow.y = game.handFollow.y * 0.22 + targetY * 0.78;
  game.handFollow.visible = true;
}

function estimateArmRaiseRom(landmarks) {
  const right = estimateSideRom(landmarks, {
    side: "right",
    shoulder: 12,
    elbow: 14,
    wrist: 16,
    hip: 24,
    oppositeShoulder: 11,
  });
  const left = estimateSideRom(landmarks, {
    side: "left",
    shoulder: 11,
    elbow: 13,
    wrist: 15,
    hip: 23,
    oppositeShoulder: 12,
  });

  const candidates = [right, left].filter(Boolean);
  if (!candidates.length) return null;
  // Hysteresis: beri bobot +25 pada sisi yang sedang aktif dilacak agar tidak melompat-lompat antar sisi saat tangan digerakkan
  candidates.forEach((c) => {
    if (game.trackedSide && c.side === game.trackedSide) {
      c.score += 25;
    }
  });
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

function estimateSideRom(landmarks, ids) {
  const shoulder = landmarks[ids.shoulder];
  const elbow = landmarks[ids.elbow];
  const wrist = landmarks[ids.wrist];
  const hip = landmarks[ids.hip];
  const oppositeShoulder = landmarks[ids.oppositeShoulder];

  // Landmark wajib: shoulder dan wrist. Hip opsional (bisa estimasi posisi).
  if (!shoulder || !wrist) return null;

  const shoulderVis = shoulder?.visibility ?? 0;
  const wristVis = wrist?.visibility ?? 0;
  const hipVis = hip?.visibility ?? 0;

  // Gunakan rata-rata visibility alih-alih Math.min agar satu landmark
  // dengan visibility rendah tidak langsung membatalkan deteksi seluruh sisi.
  // Threshold diturunkan dari 0.28 → 0.12.
  const confidence = hip
    ? (shoulderVis + wristVis + hipVis) / 3
    : (shoulderVis + wristVis) / 2;

  if (confidence < 0.12) return null;

  const aspect = getPoseAspectRatio();

  // Jika hip tidak tersedia atau visibility rendah (<0.35, mis. duduk di depan laptop),
  // perkirakan posisi hip tegak lurus dari shoulder agar vektor torso stabil dan tidak bergetar
  const effectiveHip = (hip && hipVis >= 0.35)
    ? hip
    : { x: shoulder.x, y: shoulder.y + 0.4 };

  const torsoUp = {
    x: (shoulder.x - effectiveHip.x) * aspect,
    y: shoulder.y - effectiveHip.y,
  };
  const arm = {
    x: (wrist.x - shoulder.x) * aspect,
    y: wrist.y - shoulder.y,
  };
  const angleFromTorso = angleBetweenVectors(torsoUp, arm);
  const clinicalAngle = elbow
    ? clamp(180 - angleFromTorso, 0, 180)
    : game.clinicalAngle;
  const controlAngle = clinicalAngle;
  const angle = controlAngle;
  const shoulderHike = oppositeShoulder
    ? shoulder.y < oppositeShoulder.y - 0.045 && controlAngle < game.targetRom
    : false;

  return {
    side: ids.side,
    angle,
    controlAngle,
    clinicalAngle,
    compensation: shoulderHike,
    confidence,
    score: confidence * 100 + controlAngle,
    points: {
      shoulder,
      elbow,
      wrist,
      hip: effectiveHip,
    },
  };
}

function getPoseAspectRatio() {
  const video = ui.cameraPreview;
  if (!video?.videoWidth || !video?.videoHeight) return 1;
  return video.videoWidth / video.videoHeight;
}

function angleBetweenVectors(a, b) {
  const magA = Math.hypot(a.x, a.y);
  const magB = Math.hypot(b.x, b.y);
  if (magA < 0.00001 || magB < 0.00001) return 180;

  const dot = a.x * b.x + a.y * b.y;
  const cos = clamp(dot / (magA * magB), -1, 1);
  return (Math.acos(cos) * 180) / Math.PI;
}

/* ── rep counting ──────────────────────────────────── */

function processTargetHold(angle, now) {
  let repJustCompleted = false;
  let repStatus = "NONE";
  let completedPeakAngle = Math.max(game.peakAngle, angle);

  if (
    !game.running ||
    game.painStop ||
    game.missionCompleted ||
    game.targetCooldown > 0
  ) {
    resetTargetHold();
    return buildPayload(angle, repJustCompleted, repStatus, completedPeakAngle);
  }

  const inTargetWindow = isAngleInsideTargetWindow(angle);

  if (!inTargetWindow) {
    game.repState = getAimState(angle);
    game.peakAngle = Math.max(game.peakAngle, angle);

    // Graceful decay: jangan langsung reset ke 0 jika tangan sedikit bergetar (0.1-0.2 detik)
    const lastHoldTimestamp = game.lastHoldTimestamp ?? now;
    const holdDelta = Math.max(0, (now - lastHoldTimestamp) / 1000);
    if (!game.outOfWindowStart) {
      game.outOfWindowStart = now;
    }
    // Beri grace window 250ms sebelum decay agar tremor motorik tidak langsung menghapus waktu tahan
    if (now - game.outOfWindowStart > 250) {
      game.holdTimer = Math.max(0, game.holdTimer - holdDelta * 1.0);
    }
    game.lastHoldTimestamp = now;
    if (game.holdTimer <= 0) {
      game.targetAcquired = false;
    }
    return buildPayload(angle, repJustCompleted, repStatus, completedPeakAngle);
  }

  game.outOfWindowStart = null;
  const lastHoldTimestamp = game.lastHoldTimestamp ?? now;
  const holdDelta = Math.max(0, (now - lastHoldTimestamp) / 1000);
  game.holdTimer = clamp(game.holdTimer + holdDelta, 0, TARGET_HOLD_SECONDS);
  game.lastHoldTimestamp = now;
  game.repState = "PEAK_HOLD";
  game.peakAngle = completedPeakAngle;
  game.targetAcquired = true;

  if (game.holdTimer >= TARGET_HOLD_SECONDS) {
    repJustCompleted = true;
    repStatus = "VALID";
    completedPeakAngle = Math.max(completedPeakAngle, game.targetRom);
    game.repState = "RESTING";
    game.peakAngle = 0;
    resetTargetHold();
  }

  return buildPayload(angle, repJustCompleted, repStatus, completedPeakAngle);
}

function isAngleInsideTargetWindow(angle) {
  return (
    angle >= game.targetRom - TARGET_HOLD_UNDER_TOLERANCE &&
    angle <= game.targetRom + TARGET_HOLD_OVER_TOLERANCE
  );
}

function getAimState(angle) {
  if (angle < game.targetRom - TARGET_HOLD_UNDER_TOLERANCE) return "ASCENDING";
  if (angle > game.targetRom + TARGET_HOLD_OVER_TOLERANCE) return "DESCENDING";
  return "AIMING";
}

function resetTargetHold() {
  game.holdTimer = 0;
  game.lastHoldTimestamp = null;
  game.outOfWindowStart = null;
}

function getMissionLevelForHitCount(hits) {
  return hits < LEVEL_ONE_HITS ? 1 : 2;
}

function getTargetRomForHitCount(hits) {
  return MISSION_TARGETS[clamp(hits, 0, MISSION_TARGETS.length - 1)];
}

function completeRep(status, peakAngle) {
  if (status !== "VALID") return;

  // Fitur 1: Rekam repetisi ke Adaptive Difficulty Engine (tanpa adaptasi mid-set)
  if (activeAdaptiveEngine) {
    activeAdaptiveEngine.recordRep("VALID", peakAngle, TARGET_HOLD_SECONDS);
  }

  game.reps = Math.min(game.repsGoal, game.reps + 1);
  game.score += Math.round(
    100 + Math.max(0, peakAngle - game.targetRom) * 4 + game.level * 12,
  );
  game.targetHitFlash = 1;
  game.targetCooldown = 0.45;
  game.basketApples += 1;
  fireArrowAtTarget();

  /* mark a random unpicked hanging apple as picked */
  const unpicked = game.hangingApples.filter((a) => !a.picked);
  if (unpicked.length > 0) {
    unpicked[Math.floor(Math.random() * unpicked.length)].picked = true;
  }

  /* spawn sparkles & leaves */
  const targetPoint = getTargetPointNorm();
  for (let i = 0; i < 8; i += 1) {
    const a = Math.random() * Math.PI * 2;
    game.sparkles.push({
      x: targetPoint.x,
      y: targetPoint.y,
      vx: Math.cos(a) * (0.06 + Math.random() * 0.08),
      vy: Math.sin(a) * (0.06 + Math.random() * 0.08),
      life: 1,
      size: 3 + Math.random() * 4,
      hue: Math.random() > 0.5 ? "#f5c842" : "#fff",
    });
  }
  for (let i = 0; i < 4; i += 1) {
    game.fallingLeaves.push({
      x: targetPoint.x + (Math.random() - 0.5) * 0.06,
      y: targetPoint.y,
      vx: (Math.random() - 0.5) * 0.02,
      vy: 0.04 + Math.random() * 0.03,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 3,
      life: 1,
    });
  }

  game.level = getMissionLevelForHitCount(game.reps);
  game.targetAcquired = false;
  resetTargetHold();

  if (game.reps >= game.repsGoal) {
    if (activeAdaptiveEngine) {
      activeAdaptiveEngine.endSet();
    }
    triggerMissionComplete();
  } else {
    // PRD 6.3: Jalankan adaptasi per akhir set (setiap 5 hit)
    if (activeAdaptiveEngine && game.reps % activeAdaptiveEngine.repsPerSet === 0) {
      const summary = activeAdaptiveEngine.endSet();
      if (summary.adaptation_applied !== 0) {
        console.info("[MoveWall Adaptive] Target disesuaikan per set:", summary);
        // Sesuaikan target sisa berbasis target baru hingga safety ceiling
        const remaining = game.repsGoal - game.reps;
        const newTargets = activeAdaptiveEngine.generateTargets(remaining + 1);
        for (let i = 0; i < remaining; i++) {
          MISSION_TARGETS[game.reps + i] = newTargets[i + 1] || newTargets[newTargets.length - 1];
        }
      }
    }
    game.targetRom = getTargetRomForHitCount(game.reps);
    game.level = getMissionLevelForHitCount(game.reps);
    setFeedback("good", "Bullseye!", `Next apple at ${game.targetRom} deg`);
  }
}

function getBowGripNorm() {
  const aimNorm = Math.max(0, Math.min(1, game.controlAngle / 165));
  const yRest = 0.84 - 0.255 + 0.018; // 0.603
  const yTarget = 0.84 - 0.255 - 0.38 * aimNorm; // 0.585 - 0.38 * aimNorm
  const gripY = yRest + (yTarget - yRest) * aimNorm;
  return { x: 0.325, y: gripY };
}

function fireArrowAtTarget() {
  const targetPoint = getTargetPointNorm();
  const grip = getBowGripNorm();
  game.arrows.push({
    from: { x: grip.x, y: grip.y },
    to: { x: targetPoint.x, y: targetPoint.y },
    progress: 0,
    life: 1,
  });
}

/* ── feedback helpers ──────────────────────────────── */

function setFeedback(kind, title, text) {
  game.feedbackKind = kind;
  game.feedbackTitle = title;
  game.feedbackText = text;
}

function updateFeedbackFromAngle(color) {
  const current = Math.round(game.controlAngle);
  const target = Math.round(game.targetRom);

  if (color === "GREEN" || game.targetAcquired) {
    const remaining = Math.max(0, TARGET_HOLD_SECONDS - game.holdTimer).toFixed(
      1,
    );
    setFeedback(
      "good",
      `Target ${target}° Terkunci! 🎯`,
      `Tahan posisi (${current}°) selama ${remaining}s`,
    );
  } else if (current > target + TARGET_HOLD_OVER_TOLERANCE) {
    const diff = current - target;
    setFeedback(
      "warn",
      `ROM Terlalu Tinggi (${current}°)`,
      `Turunkan lenganmu ${diff}° menuju Target ${target}°`,
    );
  } else if (current < target - TARGET_HOLD_UNDER_TOLERANCE) {
    const diff = target - current;
    setFeedback(
      "warn",
      `ROM Kurang (${current}°)`,
      `Angkat lenganmu ${diff}° lagi menuju Target ${target}°`,
    );
  } else {
    setFeedback("good", `Pas di Target ${target}°`, "Tahan posisi tanganmu...");
  }
}

function getRomStatus() {
  if (!game.cameraStream) return "Menunggu kamera";
  if (!game.running) return game.trackingQuality;
  if (game.trackingQuality.includes("Shoulder hike"))
    return "Kompensasi terdeteksi (turunkan bahu)";
  const clinical = Math.round(game.clinicalAngle);
  const target = Math.round(game.targetRom);
  if (game.targetAcquired)
    return `Membidik Target ${target}°: tahan ${game.holdTimer.toFixed(1)}/${TARGET_HOLD_SECONDS}s | ROM ${clinical}°`;
  if (clinical > target + TARGET_HOLD_OVER_TOLERANCE)
    return `Turunkan ke ${target}° | ROM saat ini ${clinical}°`;
  if (clinical < target - TARGET_HOLD_UNDER_TOLERANCE)
    return `Naikkan ke ${target}° | ROM saat ini ${clinical}°`;
  return `Pas di Target ${target}°: stabilkan tanganmu | ROM ${clinical}°`;
}

function triggerPainStop() {
  game.painStop = true;
  game.running = false;
  if (activeAdaptiveEngine) {
    activeAdaptiveEngine.triggerPainOverride();
    game.targetRom = activeAdaptiveEngine.targetRom;
  } else {
    game.targetRom = game.minTargetRom;
  }
  bgm.pause();
  updatePatientHudBadge();
  setFeedback("bad", "Sesi Dihentikan (Nyeri)", "Target diturunkan ke batas aman fungsional. Istirahat sejenak.");
}

function triggerMissionComplete() {
  if (game.missionCompleted) return;
  game.missionCompleted = true;
  game.running = false;
  bgm.pause();

  if (ui.modalScore) ui.modalScore.textContent = game.score.toLocaleString();
  if (ui.modalHits) ui.modalHits.textContent = `${game.reps}/${game.repsGoal}`;
  if (ui.modalLevel) ui.modalLevel.textContent = `Lv ${game.level}`;
  if (ui.modalTime)
    ui.modalTime.textContent = formatTime(Math.max(0, game.timeRemaining));

  if (ui.missionCompleteOverlay) {
    ui.missionCompleteOverlay.classList.remove("hidden");
  }

  setFeedback("good", "Misi Selesai! 🎉", "Target tercapai! Lanjut ke Misi 2");

  /* spawn colorful celebratory particles across the screen */
  for (let i = 0; i < 50; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.04 + Math.random() * 0.14;
    game.sparkles.push({
      x: 0.3 + Math.random() * 0.4,
      y: 0.3 + Math.random() * 0.3,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.03,
      life: 1.5 + Math.random() * 0.8,
      size: 4 + Math.random() * 5,
      hue:
        Math.random() > 0.6
          ? "#10b981"
          : Math.random() > 0.3
            ? "#f59e0b"
            : "#fff",
    });
  }
}

function hideMissionCompletionModal() {
  if (ui.missionCompleteOverlay) {
    ui.missionCompleteOverlay.classList.add("hidden");
  }
}

function triggerTimeout() {
  if (game.timeoutTriggered || game.missionCompleted) return;
  game.timeoutTriggered = true;
  game.running = false;
  bgm.pause();

  if (ui.timeoutScore)
    ui.timeoutScore.textContent = game.score.toLocaleString();
  if (ui.timeoutHits)
    ui.timeoutHits.textContent = `${game.reps}/${game.repsGoal}`;
  if (ui.timeoutLevel) ui.timeoutLevel.textContent = `Lv ${game.level}`;
  if (ui.timeoutTarget)
    ui.timeoutTarget.textContent = `${Math.round(game.targetRom)}°`;

  if (ui.timeoutOverlay) {
    ui.timeoutOverlay.classList.remove("hidden");
  }

  setFeedback(
    "warn",
    "Waktu Habis! ⏳",
    "Waktu latihan telah selesai. Klik Ulangi Level untuk mencoba lagi.",
  );
}

function hideTimeoutModal() {
  if (ui.timeoutOverlay) {
    ui.timeoutOverlay.classList.add("hidden");
  }
}

function restartLevel() {
  game.timeoutTriggered = false;
  game.missionCompleted = false;
  hideTimeoutModal();
  hideMissionCompletionModal();

  // Reset waktu kembali 90 detik
  game.timeRemaining = 90;

  // Ulangi dari awal level saat ini:
  // Level 1: target 30° (hits 0)
  // Level 2: target 105° (hits 5)
  const levelStartHits = game.level === 1 ? 0 : LEVEL_ONE_HITS;
  game.reps = levelStartHits;
  game.targetRom = getTargetRomForHitCount(game.reps);
  game.level = getMissionLevelForHitCount(game.reps);

  resetTargetHold();
  _romSampleBuffer.length = 0; // Reset ring-buffer stabilisasi ROM
  _isSnappedToTarget = false;  // Reset hysteresis snap state
  game.smoothReticleY = null;
  game.targetHitFlash = 0;
  game.targetCooldown = 0;
  game.painStop = false;
  game.running = true;
  bgm.play();

  setFeedback(
    "neutral",
    `Level ${game.level} Dimulai Ulang! 🎯`,
    `Arahkan lenganmu ke Target ${game.targetRom}°`,
  );
}

function resetGame() {
  game.running = false;
  MoveWallMetrics.reset();
  if (activeKinematicRecorder) {
    activeKinematicRecorder.reset();
  }
  if (activeAdaptiveEngine) {
    activeAdaptiveEngine.resetPainOverride();
  }
  updatePatientHudBadge();
  game.missionCompleted = false;
  game.timeoutTriggered = false;
  hideMissionCompletionModal();
  hideTimeoutModal();
  bgm.stop();
  game.score = 0;
  game.timeRemaining = 90;
  game.level = 1;
  game.reps = 0;
  game.angle = 20;
  game.targetRom = MISSION_TARGETS[0];
  game.repState = "RESTING";
  game.peakAngle = 0;
  resetTargetHold();
  _romSampleBuffer.length = 0; // Reset ring-buffer stabilisasi ROM
  _isSnappedToTarget = false;  // Reset hysteresis snap state
  game.smoothReticleY = null;
  game.targetHitFlash = 0;
  game.targetCooldown = 0;
  game.painStop = false;
  game.lastRepFrameId = null;
  game.previousCameraFrame = null;
  game.cameraAngle = 20;
  game.cameraIdleTimer = 0;
  game.lastPoseAt = 0;
  game.poseBusy = false;
  game.posePoints = null;
  game.lostPoseFrames = 0;
  game.rawAngle = 20;
  game.controlAngle = 20;
  game.clinicalAngle = 20;
  game.displayAngle = 20;
  game.targetAcquired = false;
  game.shotArmed = true;
  game.handFollow = {
    x: 0.35,
    y: 0.55,
    visible: false,
  };
  game.sparkles = [];
  game.fallingLeaves = [];
  game.arrows = [];
  game.basketApples = 0;
  game.trees = makeTreeRow();
  game.hangingApples = makeHangingApples();
  setFeedback("neutral", "Ready", "Start camera to draw the bow");
}

/* ══════════════════════════════════════════════════════
   DRAWING — Apple-orchard scene
   ══════════════════════════════════════════════════════ */

function draw() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);
  const hasReferenceScene = drawScene(width, height);
  if (!hasReferenceScene) {
    drawTrees(width, height);
    drawSceneDepth(width, height);
  }
  drawAppleProgress(width, height);
  drawReachGuide(width, height);
  drawShotArrows(width, height);
  drawAppleTarget(width, height);
  drawPatient(width, height);
  drawSparkles(width, height);
  drawFallingLeaves(width, height);
  drawBasket(width, height);
  drawOrchardForeground(width, height);
  if (game.debugMode) drawDebugOverlay(width, height);
}

/* ── sky + ground ──────────────────────────────────── */

function drawScene(width, height) {
  if (
    USE_ORCHARD_REFERENCE &&
    orchardBackground.complete &&
    orchardBackground.naturalWidth > 0
  ) {
    drawCoverImage(orchardBackground, 0, 0, width, height);

    const lightWash = ctx.createLinearGradient(0, 0, 0, height);
    lightWash.addColorStop(0, "rgba(255, 247, 213, 0.06)");
    lightWash.addColorStop(0.5, "rgba(255, 255, 255, 0)");
    lightWash.addColorStop(1, "rgba(23, 56, 34, 0.18)");
    ctx.fillStyle = lightWash;
    ctx.fillRect(0, 0, width, height);

    const focus = ctx.createRadialGradient(
      width * 0.76,
      height * 0.42,
      20,
      width * 0.76,
      height * 0.42,
      width * 0.34,
    );
    focus.addColorStop(0, "rgba(255, 246, 190, 0.2)");
    focus.addColorStop(0.45, "rgba(255, 246, 190, 0.06)");
    focus.addColorStop(1, "rgba(255, 246, 190, 0)");
    ctx.fillStyle = focus;
    ctx.fillRect(0, 0, width, height);

    return true;
  }

  /* sky gradient — warm afternoon */
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#7ec8e3");
  sky.addColorStop(0.35, "#b6e3f4");
  sky.addColorStop(0.55, "#f6eec9");
  sky.addColorStop(1, "#fce4b0");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  /* sun */
  const sunX = width * 0.88;
  const sunY = height * 0.12;
  const sunGlow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 120);
  sunGlow.addColorStop(0, "rgba(255, 244, 180, 0.95)");
  sunGlow.addColorStop(0.35, "rgba(255, 228, 120, 0.35)");
  sunGlow.addColorStop(1, "rgba(255, 228, 120, 0)");
  ctx.fillStyle = sunGlow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff8d6";
  ctx.beginPath();
  ctx.arc(sunX, sunY, 28, 0, Math.PI * 2);
  ctx.fill();

  /* fluffy clouds */
  ctx.fillStyle = "rgba(255, 255, 255, 0.66)";
  for (let i = 0; i < 3; i += 1) {
    const cx = width * (0.12 + i * 0.3);
    const cy = height * (0.1 + (i % 2) * 0.07);
    ctx.beginPath();
    ctx.ellipse(cx, cy, 62, 22, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 44, cy + 6, 50, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - 38, cy + 8, 42, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* distant hills */
  ctx.fillStyle = "#8fc48a";
  ctx.beginPath();
  ctx.moveTo(0, height * 0.52);
  ctx.bezierCurveTo(
    width * 0.18,
    height * 0.42,
    width * 0.38,
    height * 0.5,
    width * 0.56,
    height * 0.44,
  );
  ctx.bezierCurveTo(
    width * 0.76,
    height * 0.38,
    width * 0.92,
    height * 0.48,
    width,
    height * 0.46,
  );
  ctx.lineTo(width, height * 0.6);
  ctx.lineTo(0, height * 0.6);
  ctx.closePath();
  ctx.fill();

  /* main grass */
  const lawn = ctx.createLinearGradient(0, height * 0.55, 0, height);
  lawn.addColorStop(0, "#6db34a");
  lawn.addColorStop(0.4, "#5a9e3c");
  lawn.addColorStop(1, "#3d7a2d");
  ctx.fillStyle = lawn;
  ctx.beginPath();
  ctx.moveTo(0, height * 0.58);
  ctx.bezierCurveTo(
    width * 0.2,
    height * 0.54,
    width * 0.5,
    height * 0.62,
    width * 0.75,
    height * 0.56,
  );
  ctx.bezierCurveTo(
    width * 0.9,
    height * 0.53,
    width,
    height * 0.58,
    width,
    height * 0.57,
  );
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  /* grass texture lines */
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 12; i += 1) {
    const y = height * (0.62 + i * 0.032);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(width * 0.5, y + 14, width, y);
    ctx.stroke();
  }

  /* dirt path */
  const path = ctx.createLinearGradient(
    width * 0.3,
    height * 0.62,
    width * 0.48,
    height,
  );
  path.addColorStop(0, "rgba(198, 166, 110, 0.6)");
  path.addColorStop(1, "rgba(180, 140, 90, 0.8)");
  ctx.fillStyle = path;
  ctx.beginPath();
  ctx.moveTo(width * 0.36, height * 0.62);
  ctx.bezierCurveTo(
    width * 0.42,
    height * 0.72,
    width * 0.48,
    height * 0.86,
    width * 0.54,
    height,
  );
  ctx.lineTo(width * 0.28, height);
  ctx.bezierCurveTo(
    width * 0.33,
    height * 0.84,
    width * 0.34,
    height * 0.74,
    width * 0.32,
    height * 0.62,
  );
  ctx.closePath();
  ctx.fill();

  /* small fence posts */
  ctx.strokeStyle = "#8b6b3d";
  ctx.lineWidth = 4;
  for (let i = 0; i < 6; i += 1) {
    const fx = width * (0.04 + i * 0.036);
    ctx.beginPath();
    ctx.moveTo(fx, height * 0.6);
    ctx.lineTo(fx, height * 0.66);
    ctx.stroke();
  }
  ctx.strokeStyle = "#a07d4a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(width * 0.04, height * 0.62);
  ctx.lineTo(width * 0.22, height * 0.62);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(width * 0.04, height * 0.645);
  ctx.lineTo(width * 0.22, height * 0.645);
  ctx.stroke();

  return false;
}

/* ── apple trees ───────────────────────────────────── */

function drawCoverImage(image, x, y, width, height) {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = image.naturalWidth;
  let sh = image.naturalHeight;

  if (imageRatio > targetRatio) {
    sw = image.naturalHeight * targetRatio;
    sx = (image.naturalWidth - sw) / 2;
  } else {
    sh = image.naturalWidth / targetRatio;
    sy = (image.naturalHeight - sh) / 2;
  }

  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

function drawSceneDepth(width, height) {
  const nearGround = ctx.createLinearGradient(0, height * 0.62, 0, height);
  nearGround.addColorStop(0, "rgba(255, 255, 255, 0)");
  nearGround.addColorStop(0.5, "rgba(33, 84, 45, 0.10)");
  nearGround.addColorStop(1, "rgba(16, 32, 43, 0.24)");
  ctx.fillStyle = nearGround;
  ctx.fillRect(0, height * 0.58, width, height * 0.42);


  ctx.fillStyle = "rgba(54, 111, 47, 0.16)";
  for (let i = 0; i < 7; i += 1) {
    const x = width * (0.08 + i * 0.145);
    const y = height * (0.665 + (i % 3) * 0.018);
    ctx.beginPath();
    ctx.ellipse(x, y, width * 0.07, height * 0.025, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAppleProgress(width, height) {
  if (width < 760) return;

  const total = game.repsGoal;
  const done = game.reps;
  const x = width * 0.34;
  const y = height * 0.075;
  const w = Math.min(360, width * 0.34);
  const h = 10;

  ctx.fillStyle = "rgba(16,32,43,0.22)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();

  const fillW = total > 0 ? (done / total) * w : 0;
  if (fillW > 0) {
    const bar = ctx.createLinearGradient(x, y, x + w, y);
    bar.addColorStop(0, "#d5423a");
    bar.addColorStop(1, "#32a36a");
    ctx.fillStyle = bar;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(10, fillW), h, 8);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "800 11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${done}/${total}`, x + w + 28, y + h);
}

function drawTrees(width, height) {
  const groundY = height * 0.58;

  game.trees.forEach((tree, treeIdx) => {
    const isMainTree = treeIdx === 2;
    const x = tree.x * width;
    const trunkH = tree.trunkH * height;
    const canopyR = tree.canopyR * height;
    const trunkTop = groundY - trunkH;

    /* shadow */
    ctx.fillStyle = isMainTree
      ? "rgba(16, 32, 43, 0.20)"
      : "rgba(16, 32, 43, 0.11)";
    ctx.beginPath();
    ctx.ellipse(
      x,
      groundY + 9,
      canopyR * 0.95,
      canopyR * 0.18,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    /* trunk */
    const trunkWidth = Math.max(22, canopyR * 0.24);
    const trunk = ctx.createLinearGradient(
      x - trunkWidth / 2,
      trunkTop,
      x + trunkWidth / 2,
      groundY,
    );
    trunk.addColorStop(0, "#8b6b3d");
    trunk.addColorStop(0.5, "#6b4226");
    trunk.addColorStop(1, "#4a2e18");
    ctx.fillStyle = trunk;
    ctx.beginPath();
    ctx.roundRect(
      x - trunkWidth / 2,
      trunkTop + canopyR * 0.24,
      trunkWidth,
      trunkH - canopyR * 0.2 + 18,
      7,
    );
    ctx.fill();

    /* bark texture */
    ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
    ctx.lineWidth = 1;
    for (let b = 0; b < 4; b += 1) {
      const by = trunkTop + canopyR * 0.4 + b * (trunkH * 0.18);
      ctx.beginPath();
      ctx.moveTo(x - trunkWidth * 0.28, by);
      ctx.quadraticCurveTo(x, by + 6, x + trunkWidth * 0.28, by);
      ctx.stroke();
    }

    /* branches */
    ctx.strokeStyle = "#6b4226";
    ctx.lineWidth = Math.max(5, canopyR * 0.065);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, trunkTop + canopyR * 0.5);
    ctx.lineTo(x - canopyR * 0.6, trunkTop + canopyR * 0.1);
    ctx.moveTo(x, trunkTop + canopyR * 0.5);
    ctx.lineTo(x + canopyR * 0.5, trunkTop + canopyR * 0.2);
    ctx.stroke();

    /* canopy — layered circles for leafy look */
    const leafColors = [tree.hue, "#4aad42", "#2f8a2d"];
    const offsets = [
      { ox: -canopyR * 0.4, oy: canopyR * 0.15, r: canopyR * 0.68 },
      { ox: canopyR * 0.35, oy: canopyR * 0.1, r: canopyR * 0.62 },
      { ox: 0, oy: -canopyR * 0.1, r: canopyR * 0.78 },
      { ox: -canopyR * 0.15, oy: canopyR * 0.3, r: canopyR * 0.52 },
      { ox: canopyR * 0.2, oy: canopyR * 0.28, r: canopyR * 0.48 },
      { ox: canopyR * 0.08, oy: -canopyR * 0.42, r: canopyR * 0.48 },
    ];
    offsets.forEach((off, oi) => {
      const cx = x + off.ox;
      const cy = trunkTop + off.oy;
      const grad = ctx.createRadialGradient(
        cx - off.r * 0.2,
        cy - off.r * 0.2,
        off.r * 0.1,
        cx,
        cy,
        off.r,
      );
      grad.addColorStop(0, leafColors[oi % leafColors.length]);
      grad.addColorStop(1, "#1e6620");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, off.r, 0, Math.PI * 2);
      ctx.fill();
    });

    /* leaf shine highlight */
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.beginPath();
    ctx.ellipse(
      x - canopyR * 0.15,
      trunkTop - canopyR * 0.15,
      canopyR * 0.4,
      canopyR * 0.22,
      -0.3,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    /* hanging apples on this tree */
    game.hangingApples.forEach((apple) => {
      if (apple.treeIdx !== treeIdx || apple.picked) return;
      const ax = x + apple.ox * width;
      const ay = trunkTop + apple.oy * height;
      const appleR = isMainTree
        ? Math.max(8, canopyR * 0.085)
        : Math.max(6, canopyR * 0.075);

      /* tiny stem */
      ctx.strokeStyle = "#5a3a18";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ax, ay - 9);
      ctx.lineTo(ax + 2, ay - 15);
      ctx.stroke();

      /* apple body */
      const appleGrad = ctx.createRadialGradient(
        ax - appleR * 0.3,
        ay - appleR * 0.3,
        2,
        ax,
        ay,
        appleR,
      );
      appleGrad.addColorStop(0, "#ff6b6b");
      appleGrad.addColorStop(0.6, "#e03c3c");
      appleGrad.addColorStop(1, "#b22a2a");
      ctx.fillStyle = appleGrad;
      ctx.beginPath();
      ctx.arc(ax, ay, appleR, 0, Math.PI * 2);
      ctx.fill();

      /* shine */
      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      ctx.beginPath();
      ctx.arc(
        ax - appleR * 0.32,
        ay - appleR * 0.32,
        appleR * 0.3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    });
  });
}

function drawOrchardForeground(width, height) {
  const y = height * 0.86;
  const grass = ctx.createLinearGradient(0, y, 0, height);
  grass.addColorStop(0, "rgba(64, 138, 56, 0)");
  grass.addColorStop(1, "rgba(32, 84, 42, 0.46)");
  ctx.fillStyle = grass;
  ctx.fillRect(0, y, width, height - y);

  ctx.strokeStyle = "rgba(240, 249, 218, 0.34)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (let i = 0; i < 26; i += 1) {
    const x = width * ((i * 0.041 + 0.02) % 1);
    const h = height * (0.018 + (i % 5) * 0.004);
    ctx.beginPath();
    ctx.moveTo(x, height);
    ctx.quadraticCurveTo(
      x + (i % 2 ? 8 : -8),
      height - h * 0.55,
      x + ((i % 3) - 1) * 6,
      height - h,
    );
    ctx.stroke();
  }
}

/* ── reach guide arc ───────────────────────────────── */

function drawReachGuide(width, height) {
  const target = getTargetPoint(width, height);
  const gripNorm = getBowGripNorm();
  const origin = {
    x: width * gripNorm.x,
    y: height * gripNorm.y,
  };
  const mid = {
    x: origin.x + (target.x - origin.x) * 0.54,
    y: origin.y + (target.y - origin.y) * 0.54 - height * 0.05,
  };

  ctx.strokeStyle = "rgba(16, 32, 43, 0.20)";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.quadraticCurveTo(mid.x, mid.y, target.x, target.y);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 247, 196, 0.86)";
  ctx.lineWidth = 4;
  ctx.setLineDash([12, 16]);
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.quadraticCurveTo(mid.x, mid.y, target.x, target.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const angle = Math.atan2(target.y - mid.y, target.x - mid.x);
  ctx.save();
  ctx.translate(
    target.x - Math.cos(angle) * 42,
    target.y - Math.sin(angle) * 42,
  );
  ctx.rotate(angle);
  ctx.fillStyle = "rgba(255, 247, 196, 0.88)";
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(-7, -8);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-7, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ── apple target (glowing apple the patient reaches for) ── */

function drawAppleTarget(width, height) {
  const { x, y } = getTargetPoint(width, height);
  const pulse =
    1 + Math.sin(performance.now() / 220) * 0.04 + game.targetHitFlash * 0.2;
  const baseR = 23;

  /* outer glow */
  const halo = ctx.createRadialGradient(x, y, 8, x, y, 48 * pulse);
  halo.addColorStop(0, "rgba(255, 248, 210, 0.36)");
  halo.addColorStop(0.55, "rgba(224, 60, 60, 0.1)");
  halo.addColorStop(1, "rgba(224, 60, 60, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, 52 * pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 248, 225, 0.22)";
  ctx.beginPath();
  ctx.arc(x, y, 43 * pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 35 * pulse, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(16, 32, 43, 0.22)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 47 * pulse, 0, Math.PI * 2);
  ctx.stroke();

  const holdProgress = clamp(game.holdTimer / TARGET_HOLD_SECONDS, 0, 1);
  if (holdProgress > 0) {
    ctx.strokeStyle = "rgba(16, 185, 129, 0.92)";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(x, y, 55, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * holdProgress);
    ctx.stroke();
    ctx.lineCap = "butt";
  }

  /* stem */
  ctx.strokeStyle = "#5a3a18";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y - baseR * pulse + 2);
  ctx.lineTo(x + 4, y - baseR * pulse - 12);
  ctx.stroke();

  /* tiny leaf on stem */
  ctx.fillStyle = "#4aad42";
  ctx.beginPath();
  ctx.ellipse(x + 8, y - baseR * pulse - 8, 8, 4, 0.5, 0, Math.PI * 2);
  ctx.fill();

  /* apple body */
  const appleBody = ctx.createRadialGradient(
    x - 6,
    y - 6,
    4,
    x,
    y,
    baseR * pulse,
  );
  appleBody.addColorStop(0, "#ff8a8a");
  appleBody.addColorStop(0.35, "#e03c3c");
  appleBody.addColorStop(0.75, "#c02828");
  appleBody.addColorStop(1, "#8b1a1a");
  ctx.fillStyle = appleBody;
  ctx.beginPath();
  ctx.arc(x, y, baseR * pulse, 0, Math.PI * 2);
  ctx.fill();

  /* apple top indent */
  ctx.fillStyle = "rgba(100, 20, 20, 0.3)";
  ctx.beginPath();
  ctx.ellipse(
    x,
    y - baseR * pulse + 4,
    8 * pulse,
    3 * pulse,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  /* specular highlight */
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.beginPath();
  ctx.ellipse(x - 8, y - 8, 8 * pulse, 6 * pulse, -0.4, 0, Math.PI * 2);
  ctx.fill();

  /* label */
  ctx.fillStyle = "rgba(16, 32, 43, 0.78)";
  ctx.beginPath();
  ctx.roundRect(x - 48, y + 42, 96, 26, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "white";
  ctx.font = "800 11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`TARGET ${Math.round(game.targetRom)} deg`, x, y + 59);
}

/* ── patient figure ────────────────────────────────── */

function drawArcher(width, height) {
  const target = getTargetPoint(width, height);
  const now = performance.now();
  const t = now * 0.0028;

  // ── Subtle idle breathing & wind dynamics ───────────────────────────
  const breath = Math.sin(t);
  const breathY = breath * height * 0.0025;
  const windSway = Math.sin(t * 0.8) * 2;

  const footY = height * 0.84;
  const hip = {
    x: width * 0.226,
    y: footY - height * 0.115 + breathY * 0.3,
  };
  const shoulder = {
    x: width * 0.238,
    y: footY - height * 0.26 + breathY,
  };
  const head = {
    x: shoulder.x - width * 0.004,
    y: shoulder.y - height * 0.062 + breathY * 0.7,
  };

  // ── Dynamic bow-arm elevation driven by ROM angle ───────────────────
  const aimNorm = Math.max(0, Math.min(1, game.controlAngle / 165));
  const bowGripYRest = shoulder.y + height * 0.015;
  const bowGripYTarget = shoulder.y - height * 0.36 * aimNorm;
  const bowGripY = bowGripYRest + (bowGripYTarget - bowGripYRest) * aimNorm;
  const bowGrip = { x: width * 0.32, y: bowGripY };

  // ── Draw, Hold & Recoil states ──────────────────────────────────────
  const isLocked = isAngleInsideTargetWindow(game.controlAngle);
  const holdRatio = Math.min(1, game.holdTimer / TARGET_HOLD_SECONDS);
  const recoil = game.targetHitFlash; // 1.0 down to 0
  const recoilVibe = Math.sin(now * 0.08) * recoil * 4;

  // Draw hand anchor point naturally anchored near the jaw / cheek
  const anchorRest = {
    x: head.x + width * 0.008,
    y: head.y + height * 0.022,
  };
  const anchorDrawn = {
    x: head.x - width * 0.006,
    y: head.y + height * 0.02,
  };
  const drawHandX =
    anchorRest.x +
    (anchorDrawn.x - anchorRest.x) * holdRatio -
    recoil * width * 0.01;
  const drawHandY =
    anchorRest.y +
    (anchorDrawn.y - anchorRest.y) * holdRatio +
    (recoil > 0 ? recoilVibe * 0.3 : 0);
  const drawHand = { x: drawHandX, y: drawHandY };

  /* ── 1. GROUND SHADOW ────────────────────────────────────────────── */
  ctx.save();
  ctx.fillStyle = "rgba(14, 30, 18, 0.18)";
  ctx.beginPath();
  ctx.ellipse(
    hip.x + width * 0.015,
    footY + 8,
    width * 0.07,
    height * 0.022,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Contact points under boot soles
  ctx.fillStyle = "rgba(8, 18, 10, 0.38)";
  ctx.beginPath();
  ctx.ellipse(
    hip.x - width * 0.02,
    footY + 2,
    width * 0.018,
    height * 0.007,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(
    hip.x + width * 0.045,
    footY - height * 0.01,
    width * 0.02,
    height * 0.007,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();

  /* ── 2. BACK QUIVER & ARROWS (layered on archer's back) ──────────── */
  ctx.save();
  const quiverAngle = -0.52; // Angled back over right shoulder
  ctx.save();
  ctx.translate(shoulder.x - width * 0.018, shoulder.y + height * 0.01);
  ctx.rotate(quiverAngle);

  // Quiver leather case
  const qGrad = ctx.createLinearGradient(-6, 0, 6, 0);
  qGrad.addColorStop(0, "#4a2610");
  qGrad.addColorStop(0.5, "#6a3818");
  qGrad.addColorStop(1, "#361b09");
  ctx.fillStyle = qGrad;
  ctx.beginPath();
  ctx.roundRect(-6, 0, 12, height * 0.12, [3, 3, 6, 6]);
  ctx.fill();
  // Brass reinforcement bands
  ctx.fillStyle = "#d4af37";
  ctx.fillRect(-6.5, 3, 13, 3.5);
  ctx.fillRect(-6, height * 0.06, 12, 3);

  // 3 fletched arrows protruding out of quiver top
  const fletches = ["#c53030", "#d4af37", "#2f855a"];
  for (let i = 0; i < 3; i++) {
    const aX = -3 + i * 3;
    const aLen = 22 + (i % 2) * 5;
    ctx.strokeStyle = "#c89b65";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(aX, 0);
    ctx.lineTo(aX, -aLen);
    ctx.stroke();

    // Vane feathers
    ctx.fillStyle = fletches[i];
    ctx.beginPath();
    ctx.moveTo(aX, -aLen);
    ctx.lineTo(aX - 4, -aLen + 9);
    ctx.lineTo(aX, -aLen + 7);
    ctx.lineTo(aX + 4, -aLen + 9);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();

  /* ── 3. RANGER CLOAK / SASH (flowing behind back) ────────────────── */
  ctx.save();
  const cloakGrad = ctx.createLinearGradient(
    shoulder.x - 20,
    shoulder.y,
    shoulder.x - 30,
    hip.y + height * 0.1,
  );
  cloakGrad.addColorStop(0, "#183e25");
  cloakGrad.addColorStop(0.6, "#13311d");
  cloakGrad.addColorStop(1, "#0d2214");
  ctx.fillStyle = cloakGrad;
  ctx.beginPath();
  ctx.moveTo(shoulder.x - width * 0.015, shoulder.y + height * 0.015);
  ctx.bezierCurveTo(
    shoulder.x - width * 0.035 + windSway,
    shoulder.y + height * 0.06,
    shoulder.x - width * 0.038 + windSway * 1.3,
    hip.y + height * 0.05,
    shoulder.x - width * 0.026 + windSway * 1.5,
    hip.y + height * 0.11,
  );
  ctx.lineTo(shoulder.x - width * 0.016, hip.y + height * 0.07);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  /* ── 4. BACK LEG (Rear brace leg & boot) ─────────────────────────── */
  ctx.save();
  // Thigh & knee
  ctx.fillStyle = "#1b2938";
  ctx.beginPath();
  ctx.moveTo(hip.x - width * 0.014, hip.y + height * 0.02);
  ctx.lineTo(hip.x - width * 0.002, hip.y + height * 0.02);
  ctx.lineTo(hip.x - width * 0.016, footY - height * 0.065);
  ctx.lineTo(hip.x - width * 0.028, footY - height * 0.065);
  ctx.closePath();
  ctx.fill();

  // Calf & lower leg
  ctx.beginPath();
  ctx.moveTo(hip.x - width * 0.028, footY - height * 0.065);
  ctx.lineTo(hip.x - width * 0.016, footY - height * 0.065);
  ctx.lineTo(hip.x - width * 0.02, footY - height * 0.015);
  ctx.lineTo(hip.x - width * 0.03, footY - height * 0.015);
  ctx.closePath();
  ctx.fill();

  // Rear leather boot
  const bootRearGrad = ctx.createLinearGradient(
    hip.x - width * 0.03,
    footY - height * 0.06,
    hip.x - width * 0.01,
    footY,
  );
  bootRearGrad.addColorStop(0, "#5a351a");
  bootRearGrad.addColorStop(0.5, "#3d220f");
  bootRearGrad.addColorStop(1, "#251408");
  ctx.fillStyle = bootRearGrad;
  ctx.beginPath();
  ctx.moveTo(hip.x - width * 0.03, footY - height * 0.045);
  ctx.lineTo(hip.x - width * 0.016, footY - height * 0.045);
  ctx.lineTo(hip.x - width * 0.012, footY);
  ctx.lineTo(hip.x - width * 0.035, footY);
  ctx.closePath();
  ctx.fill();

  // Boot folded cuff
  ctx.fillStyle = "#6e4020";
  ctx.beginPath();
  ctx.roundRect(
    hip.x - width * 0.032,
    footY - height * 0.052,
    width * 0.02,
    height * 0.012,
    2,
  );
  ctx.fill();
  ctx.restore();

  /* ── 5. FRONT LEG (Lead forward leg & boot) ──────────────────────── */
  ctx.save();
  // Front thigh
  ctx.fillStyle = "#223347";
  ctx.beginPath();
  ctx.moveTo(hip.x + width * 0.004, hip.y + height * 0.02);
  ctx.lineTo(hip.x + width * 0.018, hip.y + height * 0.02);
  ctx.lineTo(hip.x + width * 0.034, footY - height * 0.062);
  ctx.lineTo(hip.x + width * 0.02, footY - height * 0.062);
  ctx.closePath();
  ctx.fill();

  // Front calf
  ctx.beginPath();
  ctx.moveTo(hip.x + width * 0.02, footY - height * 0.062);
  ctx.lineTo(hip.x + width * 0.034, footY - height * 0.062);
  ctx.lineTo(hip.x + width * 0.044, footY - height * 0.015);
  ctx.lineTo(hip.x + width * 0.03, footY - height * 0.015);
  ctx.closePath();
  ctx.fill();

  // Front leather boot
  const bootLeadGrad = ctx.createLinearGradient(
    hip.x + width * 0.02,
    footY - height * 0.06,
    hip.x + width * 0.06,
    footY,
  );
  bootLeadGrad.addColorStop(0, "#6e4020");
  bootLeadGrad.addColorStop(0.5, "#4a2912");
  bootLeadGrad.addColorStop(1, "#2d1709");
  ctx.fillStyle = bootLeadGrad;
  ctx.beginPath();
  ctx.moveTo(hip.x + width * 0.028, footY - height * 0.048);
  ctx.lineTo(hip.x + width * 0.042, footY - height * 0.048);
  ctx.lineTo(hip.x + width * 0.058, footY - height * 0.008);
  ctx.lineTo(hip.x + width * 0.026, footY - height * 0.008);
  ctx.closePath();
  ctx.fill();

  // Front boot cuff
  ctx.fillStyle = "#824d26";
  ctx.beginPath();
  ctx.roundRect(
    hip.x + width * 0.026,
    footY - height * 0.055,
    width * 0.02,
    height * 0.013,
    2,
  );
  ctx.fill();
  ctx.restore();

  /* ── 6. TORSO, TUNIC & LEATHER VEST ──────────────────────────────── */
  ctx.save();
  const tunicTopY = shoulder.y - height * 0.005;
  const tunicBottomY = hip.y + height * 0.065;

  // Base green tunic
  const tunicGrad = ctx.createLinearGradient(
    shoulder.x - 25,
    tunicTopY,
    shoulder.x + 30,
    tunicBottomY,
  );
  tunicGrad.addColorStop(0, "#1d472c");
  tunicGrad.addColorStop(0.45, "#275e3a");
  tunicGrad.addColorStop(1, "#173b23");
  ctx.fillStyle = tunicGrad;
  ctx.beginPath();
  ctx.moveTo(shoulder.x - width * 0.02, tunicTopY + 5);
  ctx.bezierCurveTo(
    shoulder.x - width * 0.025,
    tunicTopY + height * 0.04,
    shoulder.x - width * 0.024,
    tunicBottomY - 5,
    shoulder.x - width * 0.016,
    tunicBottomY,
  );
  ctx.lineTo(shoulder.x + width * 0.022, tunicBottomY);
  ctx.bezierCurveTo(
    shoulder.x + width * 0.026,
    tunicBottomY - height * 0.035,
    shoulder.x + width * 0.025,
    tunicTopY + height * 0.03,
    shoulder.x + width * 0.016,
    tunicTopY,
  );
  ctx.closePath();
  ctx.fill();

  // Gold hem embroidery
  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(shoulder.x - width * 0.015, tunicBottomY - 2);
  ctx.lineTo(shoulder.x + width * 0.021, tunicBottomY - 2);
  ctx.stroke();

  // Leather Vest over the tunic
  const vestGrad = ctx.createLinearGradient(
    shoulder.x - 16,
    tunicTopY + 8,
    shoulder.x + 20,
    hip.y + height * 0.015,
  );
  vestGrad.addColorStop(0, "#5a3418");
  vestGrad.addColorStop(0.5, "#734320");
  vestGrad.addColorStop(1, "#44260f");
  ctx.fillStyle = vestGrad;
  ctx.beginPath();
  ctx.moveTo(shoulder.x - width * 0.015, tunicTopY + 8);
  ctx.lineTo(shoulder.x - width * 0.016, hip.y + height * 0.015);
  ctx.lineTo(shoulder.x + width * 0.018, hip.y + height * 0.015);
  ctx.lineTo(shoulder.x + width * 0.015, tunicTopY + 8);
  ctx.closePath();
  ctx.fill();

  // Vest center seam & laces
  ctx.strokeStyle = "#381c08";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(shoulder.x + width * 0.001, tunicTopY + 10);
  ctx.lineTo(shoulder.x + width * 0.001, hip.y + height * 0.014);
  ctx.stroke();

  // Quiver baldric strap
  ctx.strokeStyle = "#3e2210";
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(shoulder.x - width * 0.01, tunicTopY + 6);
  ctx.lineTo(shoulder.x + width * 0.016, hip.y + height * 0.015);
  ctx.stroke();
  ctx.fillStyle = "#d4af37";
  ctx.beginPath();
  ctx.arc(
    shoulder.x + width * 0.003,
    tunicTopY + height * 0.03,
    3,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Belt
  ctx.fillStyle = "#2c1709";
  ctx.beginPath();
  ctx.roundRect(
    shoulder.x - width * 0.02,
    hip.y + height * 0.01,
    width * 0.042,
    height * 0.012,
    2.5,
  );
  ctx.fill();

  // Belt Buckle
  ctx.fillStyle = "#d4af37";
  ctx.beginPath();
  ctx.roundRect(
    shoulder.x - width * 0.002,
    hip.y + height * 0.008,
    width * 0.01,
    height * 0.016,
    2,
  );
  ctx.fill();
  ctx.fillStyle = "#2c1709";
  ctx.fillRect(
    shoulder.x,
    hip.y + height * 0.011,
    width * 0.006,
    height * 0.01,
  );

  // Hip Pouch
  ctx.fillStyle = "#5c3316";
  ctx.beginPath();
  ctx.roundRect(
    shoulder.x - width * 0.022,
    hip.y + height * 0.022,
    width * 0.01,
    height * 0.015,
    [2, 2, 4, 4],
  );
  ctx.fill();
  ctx.fillStyle = "#d4af37";
  ctx.beginPath();
  ctx.arc(
    shoulder.x - width * 0.017,
    hip.y + height * 0.028,
    1.8,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();

  /* ── 7. NECK, HEAD, EXPRESSIVE FACE & ARCHER CAP ─────────────────── */
  ctx.save();
  // Neck
  ctx.fillStyle = "#e5b287";
  ctx.beginPath();
  ctx.roundRect(
    shoulder.x - width * 0.004,
    shoulder.y - height * 0.024,
    width * 0.012,
    height * 0.032,
    3,
  );
  ctx.fill();

  // Head base
  ctx.fillStyle = "#f5c69f";
  ctx.beginPath();
  ctx.arc(head.x, head.y, height * 0.024, 0, Math.PI * 2);
  ctx.fill();

  // Jawline & chin
  ctx.fillStyle = "#f5c69f";
  ctx.beginPath();
  ctx.moveTo(head.x, head.y);
  ctx.lineTo(head.x + height * 0.022, head.y + height * 0.004);
  ctx.lineTo(head.x + height * 0.014, head.y + height * 0.022);
  ctx.lineTo(head.x - height * 0.004, head.y + height * 0.023);
  ctx.closePath();
  ctx.fill();

  // Ear
  ctx.fillStyle = "#e5b085";
  ctx.beginPath();
  ctx.ellipse(
    head.x - height * 0.003,
    head.y + height * 0.003,
    height * 0.005,
    height * 0.008,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Hair strands behind cap
  ctx.fillStyle = "#3e2412";
  ctx.beginPath();
  ctx.arc(
    head.x - height * 0.007,
    head.y - height * 0.004,
    height * 0.024,
    Math.PI * 0.45,
    Math.PI * 1.6,
  );
  ctx.bezierCurveTo(
    head.x - height * 0.024,
    head.y + height * 0.02,
    head.x - height * 0.014,
    head.y + height * 0.032,
    head.x + height * 0.001,
    head.y + height * 0.03,
  );
  ctx.closePath();
  ctx.fill();

  // Focused eye & brow looking towards target apple
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(
    head.x + height * 0.013,
    head.y - height * 0.002,
    height * 0.0045,
    height * 0.0028,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  ctx.fillStyle = "#1e3a5f";
  ctx.beginPath();
  ctx.arc(
    head.x + height * 0.0145,
    head.y - height * 0.002,
    height * 0.0022,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  ctx.strokeStyle = "#331c0b";
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(head.x + height * 0.007, head.y - height * 0.007);
  ctx.lineTo(head.x + height * 0.018, head.y - height * 0.004);
  ctx.stroke();

  // Nose bridge & mouth
  ctx.strokeStyle = "#c98f65";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(head.x + height * 0.02, head.y - height * 0.003);
  ctx.lineTo(head.x + height * 0.024, head.y + height * 0.005);
  ctx.lineTo(head.x + height * 0.018, head.y + height * 0.009);
  ctx.stroke();

  ctx.strokeStyle = "#9d4f3b";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(head.x + height * 0.012, head.y + height * 0.016);
  ctx.lineTo(head.x + height * 0.019, head.y + height * 0.015);
  ctx.stroke();

  // Robin Hood / Ranger Feathered Cap
  const capGrad = ctx.createLinearGradient(
    head.x - 16,
    head.y - 20,
    head.x + 20,
    head.y,
  );
  capGrad.addColorStop(0, "#1d4d2d");
  capGrad.addColorStop(0.5, "#27683d");
  capGrad.addColorStop(1, "#153a22");
  ctx.fillStyle = capGrad;
  ctx.beginPath();
  ctx.moveTo(head.x - height * 0.022, head.y - height * 0.002);
  ctx.quadraticCurveTo(
    head.x - height * 0.016,
    head.y - height * 0.03,
    head.x + height * 0.004,
    head.y - height * 0.032,
  );
  ctx.lineTo(head.x + height * 0.028, head.y - height * 0.008);
  ctx.quadraticCurveTo(
    head.x + height * 0.006,
    head.y - height * 0.012,
    head.x - height * 0.022,
    head.y - height * 0.002,
  );
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Plume Feather sweeping back
  const featherBase = {
    x: head.x - height * 0.008,
    y: head.y - height * 0.02,
  };
  const featherTip = {
    x: featherBase.x - width * 0.032 + windSway * 1.2,
    y: featherBase.y - height * 0.025 - windSway * 0.6,
  };
  ctx.save();
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(featherBase.x, featherBase.y);
  ctx.quadraticCurveTo(
    featherBase.x - width * 0.015,
    featherBase.y - height * 0.018,
    featherTip.x,
    featherTip.y,
  );
  ctx.stroke();

  ctx.strokeStyle = "#c53030";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(featherBase.x - width * 0.016, featherBase.y - height * 0.018);
  ctx.lineTo(featherTip.x, featherTip.y);
  ctx.stroke();
  ctx.restore();
  ctx.restore();

  /* ── 8. DRAW ARM (Drawing elbow behind cheek) ─────────────────────── */
  ctx.save();
  const drawShoulder = {
    x: shoulder.x - width * 0.004,
    y: shoulder.y + height * 0.01,
  };
  // Elbow draws back smoothly based on holdRatio
  const drawElbow = {
    x: shoulder.x - width * 0.02 - holdRatio * width * 0.008,
    y: shoulder.y - height * 0.004 + holdRatio * height * 0.004,
  };

  // Upper draw-arm sleeve
  ctx.strokeStyle = "#1d472c";
  ctx.lineWidth = Math.max(7, height * 0.011);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(drawShoulder.x, drawShoulder.y);
  ctx.lineTo(drawElbow.x, drawElbow.y);
  ctx.stroke();

  // Forearm extending to drawHand
  ctx.strokeStyle = "#e5b085";
  ctx.lineWidth = Math.max(5, height * 0.008);
  ctx.beginPath();
  ctx.moveTo(drawElbow.x, drawElbow.y);
  ctx.lineTo(drawHand.x, drawHand.y);
  ctx.stroke();

  // Leather shooting glove / tab
  ctx.fillStyle = "#5c3316";
  ctx.beginPath();
  ctx.arc(drawHand.x, drawHand.y, Math.max(4, height * 0.007), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* ── 9. BOW ARM (Aiming arm with Leather Vambrace) ────────────────── */
  ctx.save();
  const bowShoulder = {
    x: shoulder.x + width * 0.008,
    y: shoulder.y + height * 0.012,
  };
  // Leather pauldron on bow shoulder
  ctx.fillStyle = "#6b3c19";
  ctx.beginPath();
  ctx.arc(
    bowShoulder.x - 1,
    bowShoulder.y - 1,
    Math.max(7.5, height * 0.011),
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.fillStyle = "#d4af37";
  ctx.beginPath();
  ctx.arc(bowShoulder.x - 1, bowShoulder.y - 1, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Natural elbow joint flexion along vector to bowGrip
  const armMidRatio = 0.48;
  const bowElbow = {
    x: bowShoulder.x + (bowGrip.x - bowShoulder.x) * armMidRatio,
    y:
      bowShoulder.y +
      (bowGrip.y - bowShoulder.y) * armMidRatio +
      height * 0.018 * (1 - aimNorm * 0.5),
  };

  // Upper arm sleeve
  ctx.strokeStyle = "#275e3a";
  ctx.lineWidth = Math.max(7.5, height * 0.011);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(bowShoulder.x, bowShoulder.y);
  ctx.lineTo(bowElbow.x, bowElbow.y);
  ctx.stroke();

  // Forearm base skin
  ctx.strokeStyle = "#f5c69f";
  ctx.lineWidth = Math.max(5.5, height * 0.009);
  ctx.beginPath();
  ctx.moveTo(bowElbow.x, bowElbow.y);
  ctx.lineTo(bowGrip.x, bowGrip.y);
  ctx.stroke();

  // Leather Vambrace (Arm-Guard)
  const vambraceMid = {
    x: bowElbow.x + (bowGrip.x - bowElbow.x) * 0.5,
    y: bowElbow.y + (bowGrip.y - bowElbow.y) * 0.5,
  };
  ctx.save();
  ctx.translate(vambraceMid.x, vambraceMid.y);
  const armAngle = Math.atan2(
    bowGrip.y - bowElbow.y,
    bowGrip.x - bowElbow.x,
  );
  ctx.rotate(armAngle);
  const bracerLen = Math.hypot(
    bowGrip.x - bowElbow.x,
    bowGrip.y - bowElbow.y,
  ) * 0.6;
  ctx.fillStyle = "#4a2810";
  ctx.beginPath();
  ctx.roundRect(-bracerLen * 0.5, -4.5, bracerLen, 9, 2.5);
  ctx.fill();
  ctx.strokeStyle = "#2c1709";
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.fillStyle = "#d4af37";
  ctx.fillRect(-bracerLen * 0.3, -5.5, 2.2, 11);
  ctx.fillRect(bracerLen * 0.2, -5.5, 2.2, 11);
  ctx.restore();

  // Bow Hand gripping the riser
  ctx.fillStyle = "#f5c69f";
  ctx.beginPath();
  ctx.arc(
    bowGrip.x,
    bowGrip.y,
    Math.max(6.5, height * 0.011),
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();

  /* ── 10. DYNAMIC RECURVE BOW & STRING ────────────────────────────── */
  ctx.save();
  const limbFlex = holdRatio * 10;
  const tipUpper = {
    x: bowGrip.x - limbFlex - recoilVibe * 0.7,
    y: bowGrip.y - height * 0.115 + holdRatio * 3,
  };
  const tipLower = {
    x: bowGrip.x - limbFlex - recoilVibe * 0.7,
    y: bowGrip.y + height * 0.115 - holdRatio * 3,
  };

  const bowGrad = ctx.createLinearGradient(
    bowGrip.x,
    tipUpper.y,
    bowGrip.x,
    tipLower.y,
  );
  bowGrad.addColorStop(0, "#3e1f0e");
  bowGrad.addColorStop(0.3, "#82461c");
  bowGrad.addColorStop(0.5, "#4a240c");
  bowGrad.addColorStop(0.7, "#82461c");
  bowGrad.addColorStop(1, "#3e1f0e");

  // Upper Recurve Limb
  ctx.strokeStyle = bowGrad;
  ctx.lineWidth = Math.max(4.2, height * 0.0075);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(bowGrip.x, bowGrip.y);
  ctx.bezierCurveTo(
    bowGrip.x + width * 0.03 - limbFlex * 0.5,
    bowGrip.y - height * 0.045,
    bowGrip.x + width * 0.015 - limbFlex * 0.8,
    tipUpper.y + height * 0.022,
    tipUpper.x,
    tipUpper.y,
  );
  ctx.stroke();

  // Lower Recurve Limb
  ctx.beginPath();
  ctx.moveTo(bowGrip.x, bowGrip.y);
  ctx.bezierCurveTo(
    bowGrip.x + width * 0.03 - limbFlex * 0.5,
    bowGrip.y + height * 0.045,
    bowGrip.x + width * 0.015 - limbFlex * 0.8,
    tipLower.y - height * 0.022,
    tipLower.x,
    tipLower.y,
  );
  ctx.stroke();

  // Carved Horn Nocks
  ctx.fillStyle = "#e2e8f0";
  ctx.beginPath();
  ctx.arc(tipUpper.x, tipUpper.y, 2.8, 0, Math.PI * 2);
  ctx.arc(tipLower.x, tipLower.y, 2.8, 0, Math.PI * 2);
  ctx.fill();

  // Leather wrapped handle grip
  ctx.fillStyle = "#2b180a";
  ctx.beginPath();
  ctx.roundRect(
    bowGrip.x - 3.5,
    bowGrip.y - height * 0.018,
    7,
    height * 0.036,
    2,
  );
  ctx.fill();

  // Bowstring runs from tipUpper -> drawHand -> tipLower
  ctx.strokeStyle =
    recoil > 0
      ? `rgba(255, 235, 180, ${0.4 + Math.sin(now * 0.1) * 0.3})`
      : "rgba(240, 240, 230, 0.9)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(tipUpper.x, tipUpper.y);
  ctx.lineTo(drawHand.x, drawHand.y);
  ctx.lineTo(tipLower.x, tipLower.y);
  ctx.stroke();
  ctx.restore();

  /* ── 11. ARROW ON THE BOW (resting on shelf, pointing to target) ─── */
  if (recoil < 0.82) {
    ctx.save();
    const aimPoint = getAimPoint(width, height);
    const effectiveAim = game.targetAcquired ? target : aimPoint;
    const aimAngle = Math.atan2(
      effectiveAim.y - bowGrip.y,
      effectiveAim.x - bowGrip.x,
    );

    // Arrow extends from drawHand through bowGrip and extends past the bow
    const arrowForwardLen = width * 0.034;
    const arrowBack = { x: drawHand.x, y: drawHand.y };
    const arrowTip = {
      x: bowGrip.x + Math.cos(aimAngle) * arrowForwardLen,
      y: bowGrip.y + Math.sin(aimAngle) * arrowForwardLen,
    };

    // Cedar shaft
    ctx.strokeStyle = "#d4a373";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(arrowBack.x, arrowBack.y);
    ctx.lineTo(arrowTip.x, arrowTip.y);
    ctx.stroke();

    // Steel Bodkin Point Head
    ctx.save();
    ctx.translate(arrowTip.x, arrowTip.y);
    ctx.rotate(aimAngle);
    ctx.fillStyle = "#4a5568";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-13, -4.5);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-13, 4.5);
    ctx.closePath();
    ctx.fill();
    // Steel shine
    ctx.fillStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-12, -1.5);
    ctx.lineTo(-8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Fletchings near drawHand
    ctx.save();
    ctx.translate(arrowBack.x, arrowBack.y);
    ctx.rotate(aimAngle);
    ctx.fillStyle = "#c53030";
    ctx.fillRect(2, -3, 10, 6);
    ctx.fillStyle = "#d4af37";
    ctx.fillRect(4, -1.2, 5, 2.4);
    ctx.restore();
    ctx.restore();
  }

  /* ── 12. FOCUS AURA & HOLD RING ON BOW GRIP ──────────────────────── */
  if (game.targetAcquired || isLocked) {
    ctx.save();
    const trembleR =
      25 + Math.sin(performance.now() * 0.046) * holdRatio * 4;
    ctx.strokeStyle = `rgba(16, 185, 129, ${0.55 + holdRatio * 0.45})`;
    ctx.lineWidth = 3 + holdRatio * 3;
    ctx.beginPath();
    ctx.arc(
      bowGrip.x,
      bowGrip.y,
      trembleR + game.targetHitFlash * 14,
      0,
      Math.PI * 2,
    );
    ctx.stroke();

    if (holdRatio > 0.4) {
      for (let s = 0; s < 3; s++) {
        const sAngle = (now * 0.005 + (s * Math.PI * 2) / 3) % (Math.PI * 2);
        const sDist = trembleR + 7;
        ctx.fillStyle = "#fde047";
        ctx.beginPath();
        ctx.arc(
          bowGrip.x + Math.cos(sAngle) * sDist,
          bowGrip.y + Math.sin(sAngle) * sDist,
          2.2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* ── 13. AIM POINTER & RETICLE GUIDES ─────────────────────────────── */
  const aimPoint = getAimPoint(width, height);
  const reticleX = target.x;

  // Screen-space pointer stabilization:
  // Ketika terkunci di zona target (isLocked/targetAcquired), reticle secara halus mengunci ke tengah target
  // Ketika bergerak bebas, gunakan peredaman EMA agar reticle tidak bergetar karena jitter video
  const destReticleY = (isLocked || game.targetAcquired) ? target.y : aimPoint.y;
  if (game.smoothReticleY === undefined || game.smoothReticleY === null) {
    game.smoothReticleY = destReticleY;
  } else {
    const smoothing = (isLocked || game.targetAcquired) ? 0.35 : 0.25;
    game.smoothReticleY += (destReticleY - game.smoothReticleY) * smoothing;
  }
  const reticleY = game.smoothReticleY;
  const reticleR = 24 + (isLocked ? Math.sin(performance.now() * 0.04) * 3 : 0);

  // Connecting dashed line between aim reticle and target apple
  if (!isLocked && Math.abs(reticleY - target.y) > 15) {
    ctx.strokeStyle = "rgba(255, 247, 196, 0.45)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(reticleX, reticleY);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Outer reticle circle
  ctx.strokeStyle = isLocked
    ? "rgba(16, 185, 129, 0.95)"
    : "rgba(245, 158, 11, 0.85)";
  ctx.lineWidth = isLocked ? 4 : 2.5;
  ctx.beginPath();
  ctx.arc(reticleX, reticleY, reticleR, 0, Math.PI * 2);
  ctx.stroke();

  // Crosshair ticks
  ctx.strokeStyle = isLocked ? "#10b981" : "#f59e0b";
  ctx.lineWidth = 2;
  const tickLen = 8;
  ctx.beginPath();
  ctx.moveTo(reticleX - reticleR - tickLen, reticleY);
  ctx.lineTo(reticleX - reticleR + 4, reticleY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(reticleX + reticleR - 4, reticleY);
  ctx.lineTo(reticleX + reticleR + tickLen, reticleY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(reticleX, reticleY - reticleR - tickLen);
  ctx.lineTo(reticleX, reticleY - reticleR + 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(reticleX, reticleY + reticleR - 4);
  ctx.lineTo(reticleX, reticleY + reticleR + tickLen);
  ctx.stroke();

  // Center dot
  ctx.fillStyle = isLocked ? "#10b981" : "#f59e0b";
  ctx.beginPath();
  ctx.arc(reticleX, reticleY, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Circular progress arc around reticle when holding on target
  if (isLocked && holdRatio > 0) {
    ctx.strokeStyle = "#34d399";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(
      reticleX,
      reticleY,
      reticleR + 6,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * holdRatio,
    );
    ctx.stroke();
    ctx.lineCap = "butt";
  }

  // Real-time ROM badge attached to the aim reticle
  ctx.fillStyle = isLocked
    ? "rgba(16, 185, 129, 0.92)"
    : "rgba(16, 32, 43, 0.78)";
  ctx.beginPath();
  ctx.roundRect(reticleX + reticleR + 8, reticleY - 12, 60, 24, 6);
  ctx.fill();
  ctx.strokeStyle = isLocked ? "#fff" : "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = "800 11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    `${Math.round(game.controlAngle)}°`,
    reticleX + reticleR + 38,
    reticleY + 4,
  );
}

function drawPatient(width, height) {
  drawArcher(width, height);
}

/* ── pose overlay ──────────────────────────────────── */

function drawPoseOverlay(width, height) {
  if (!game.posePoints) return;

  const panel = {
    x: width * 0.055,
    y: height * 0.2,
    w: Math.min(210, width * 0.18),
    h: Math.min(260, height * 0.36),
  };
  ctx.fillStyle = "rgba(255, 255, 255, 0.62)";
  ctx.beginPath();
  ctx.roundRect(panel.x, panel.y, panel.w, panel.h, 8);
  ctx.fill();

  ctx.fillStyle = "#10202b";
  ctx.font = "800 12px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("LIVE POSE", panel.x + 14, panel.y + 24);

  const mapPoint = (point) => ({
    x: panel.x + panel.w * point.x,
    y: panel.y + panel.h * point.y,
  });
  const shoulder = mapPoint(game.posePoints.shoulder);
  const elbow = mapPoint(game.posePoints.elbow);
  const wrist = mapPoint(game.posePoints.wrist);
  const hip = mapPoint(game.posePoints.hip);

  ctx.strokeStyle = game.trackingQuality.includes("Shoulder hike")
    ? "#d84b4b"
    : "#2fb56f";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(shoulder.x, shoulder.y);
  ctx.lineTo(elbow.x, elbow.y);
  ctx.lineTo(wrist.x, wrist.y);
  ctx.stroke();

  ctx.fillStyle = "#6f50c9";
  [shoulder, elbow, wrist, hip].forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

/* ── particles: sparkles ───────────────────────────── */

function drawSparkles(width, height) {
  game.sparkles.forEach((s) => {
    s.x += s.vx * 0.016;
    s.y += s.vy * 0.016;
    s.vy += 0.003;
    s.life -= 0.018;
    const alpha = Math.max(0, s.life);
    ctx.fillStyle =
      s.hue === "#fff"
        ? `rgba(255, 255, 255, ${alpha})`
        : `rgba(245, 200, 66, ${alpha})`;
    ctx.beginPath();
    ctx.arc(s.x * width, s.y * height, s.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  });
  game.sparkles = game.sparkles.filter((s) => s.life > 0);
}

function updateShotArrows(dt) {
  game.arrows.forEach((arrow) => {
    if (arrow.progress < 1) {
      arrow.progress = Math.min(1, arrow.progress + dt * 6.5);
    } else {
      arrow.life -= dt * 2.6;
    }
  });
  game.arrows = game.arrows.filter((arrow) => arrow.life > 0);
}

function drawShotArrows(width, height) {
  game.arrows.forEach((arrow) => {
    const t = Math.min(1, arrow.progress);
    const x1 = arrow.from.x * width;
    const y1 = arrow.from.y * height;
    const x2 = (arrow.from.x + (arrow.to.x - arrow.from.x) * t) * width;
    const y2 = (arrow.from.y + (arrow.to.y - arrow.from.y) * t) * height;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const alpha = clamp(arrow.life, 0, 1);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#4c2e1e";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.translate(x2, y2);
    ctx.rotate(angle);
    ctx.fillStyle = "#4c2e1e";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-18, -8);
    ctx.lineTo(-14, 0);
    ctx.lineTo(-18, 8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#f5c842";
    ctx.fillRect(-42, -3, 14, 6);
    ctx.restore();
  });
}

/* ── particles: falling leaves ─────────────────────── */

function drawFallingLeaves(width, height) {
  game.fallingLeaves.forEach((leaf) => {
    leaf.x += leaf.vx * 0.016;
    leaf.y += leaf.vy * 0.016;
    leaf.rot += leaf.rotSpeed * 0.016;
    leaf.life -= 0.012;
    const alpha = Math.max(0, leaf.life);
    ctx.save();
    ctx.translate(leaf.x * width, leaf.y * height);
    ctx.rotate(leaf.rot);
    ctx.fillStyle = `rgba(58, 140, 63, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  game.fallingLeaves = game.fallingLeaves.filter((l) => l.life > 0);
}

/* ── basket ────────────────────────────────────────── */

function drawBasket(width, height) {
  const bx = width * 0.76;
  const by = height * 0.88;
  const bw = 80;
  const bh = 46;

  /* shadow */
  ctx.fillStyle = "rgba(16, 32, 43, 0.12)";
  ctx.beginPath();
  ctx.ellipse(bx, by + bh + 6, bw * 0.7, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  /* basket body */
  const basketGrad = ctx.createLinearGradient(
    bx - bw / 2,
    by,
    bx + bw / 2,
    by + bh,
  );
  basketGrad.addColorStop(0, "#c4963c");
  basketGrad.addColorStop(0.5, "#a87830");
  basketGrad.addColorStop(1, "#8b5e22");
  ctx.fillStyle = basketGrad;
  ctx.beginPath();
  ctx.moveTo(bx - bw / 2, by);
  ctx.lineTo(bx - bw * 0.38, by + bh);
  ctx.lineTo(bx + bw * 0.38, by + bh);
  ctx.lineTo(bx + bw / 2, by);
  ctx.closePath();
  ctx.fill();

  /* basket weave */
  ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const wy = by + i * (bh / 4);
    const ratio = i / 4;
    const w = bw / 2 - ratio * bw * 0.12;
    ctx.beginPath();
    ctx.moveTo(bx - w, wy);
    ctx.lineTo(bx + w, wy);
    ctx.stroke();
  }

  /* handle */
  ctx.strokeStyle = "#8b5e22";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(bx, by - 12, bw * 0.35, Math.PI, 0);
  ctx.stroke();

  /* rim */
  ctx.strokeStyle = "#c4963c";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(bx - bw / 2 - 2, by);
  ctx.lineTo(bx + bw / 2 + 2, by);
  ctx.stroke();

  /* apples inside basket */
  const applePositions = [
    { ox: -14, oy: 12 },
    { ox: 8, oy: 10 },
    { ox: -4, oy: 20 },
    { ox: 16, oy: 22 },
    { ox: -18, oy: 24 },
    { ox: 6, oy: 30 },
    { ox: -10, oy: 32 },
    { ox: 18, oy: 14 },
    { ox: 0, oy: 8 },
    { ox: -22, oy: 16 },
    { ox: 12, oy: 28 },
    { ox: -6, oy: 14 },
  ];
  const applesToShow = Math.min(game.basketApples, applePositions.length);
  for (let i = 0; i < applesToShow; i += 1) {
    const ap = applePositions[i];
    const ax = bx + ap.ox;
    const ay = by + ap.oy;
    const ag = ctx.createRadialGradient(ax - 2, ay - 2, 1, ax, ay, 8);
    ag.addColorStop(0, "#ff6b6b");
    ag.addColorStop(0.6, "#e03c3c");
    ag.addColorStop(1, "#b22a2a");
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(ax, ay, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.beginPath();
    ctx.arc(ax - 2, ay - 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  /* counter label */
  if (game.basketApples > 0) {
    ctx.fillStyle = "rgba(16, 32, 43, 0.72)";
    ctx.beginPath();
    ctx.roundRect(bx - 28, by + bh + 10, 56, 22, 6);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "700 12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`x ${game.basketApples}`, bx, by + bh + 25);
  }
}

/* ── HUD sync ──────────────────────────────────────── */

function syncHud() {
  ui.score.textContent = String(game.score);
  ui.time.textContent = formatTime(game.timeRemaining);
  ui.level.textContent = String(game.level);
  ui.reps.textContent = String(game.reps);
  ui.rom.textContent = String(Math.round(game.displayAngle));
  ui.target.textContent = `Target ${Math.round(game.targetRom)}`;
  ui.romStatus.textContent = getRomStatus();
  ui.feedback.className = `feedback ${game.feedbackKind}`;
  ui.feedbackTitle.textContent = game.feedbackTitle;
  ui.feedbackText.textContent = game.feedbackText;
}

/* ── main loop ─────────────────────────────────────── */

function tick(now) {
  const dt = Math.min(0.05, (now - game.lastTick) / 1000);
  game.lastTick = now;

  if (game.running && !game.painStop) {
    game.timeRemaining = Math.max(0, game.timeRemaining - dt);
    if (game.reps >= game.repsGoal) {
      triggerMissionComplete();
    } else if (game.timeRemaining <= 0) {
      triggerTimeout();
    }
  }

  game.targetHitFlash = Math.max(0, game.targetHitFlash - dt * 2.5);
  game.targetCooldown = Math.max(0, game.targetCooldown - dt);
  updateShotArrows(dt);
  updateCameraMotion(dt);
  draw();
  syncHud();
  requestAnimationFrame(tick);
}

/* ── controls ──────────────────────────────────────── */

ui.startButton.addEventListener("click", async () => {
  if (!game.homeSession?.active && !isSubscriptionActive) {
    const active = await verifyGameSubscription();
    if (!active) {
      showGamePaywallModal();
      return;
    }
  }
  const ready = await ensureCameraReady();
  if (!ready) return;
  game.running = true;
  game.painStop = false;
  bgm.play();
  setFeedback("neutral", "Mission active", "Raise your hand to draw and shoot");
});

ui.pauseButton.addEventListener("click", () => {
  game.running = false;
  bgm.pause();
  setFeedback("neutral", "Paused", "Session on hold");
});

ui.resetButton.addEventListener("click", resetGame);
ui.painButton.addEventListener("click", triggerPainStop);

if (ui.btnPlayerLock) {
  ui.btnPlayerLock.addEventListener("click", togglePlayerLock);
}

if (ui.btnCalibrate) {
  ui.btnCalibrate.addEventListener("click", openCalibrationModal);
}

if (ui.calibrationCloseBtn) {
  ui.calibrationCloseBtn.addEventListener("click", closeCalibrationModal);
}

if (ui.btnApplyCalibration) {
  ui.btnApplyCalibration.addEventListener("click", closeCalibrationModal);
}

if (ui.btnSampleBaseline) {
  ui.btnSampleBaseline.addEventListener("click", sampleZeroBaseline);
}

if (ui.btnRelockPlayer) {
  ui.btnRelockPlayer.addEventListener("click", () => {
    game.playerLock.locked = false;
    togglePlayerLock();
  });
}

if (ui.btnUnlockPlayer) {
  ui.btnUnlockPlayer.addEventListener("click", () => {
    if (game.playerLock.locked) togglePlayerLock();
  });
}

if (ui.musicToggleButton) {
  ui.musicToggleButton.addEventListener("click", () => {
    bgm.toggleMute();
  });
}

if (ui.modalReplayButton) {
  ui.modalReplayButton.addEventListener("click", async () => {
    if (!game.homeSession?.active && !isSubscriptionActive) {
      const active = await verifyGameSubscription();
      if (!active) {
        showGamePaywallModal();
        return;
      }
    }
    resetGame();
    game.running = true;
    game.painStop = false;
    bgm.play();
    setFeedback(
      "neutral",
      "Mission active",
      "Raise your hand to draw and shoot",
    );
  });
}

if (ui.timeoutRetryButton) {
  ui.timeoutRetryButton.addEventListener("click", () => {
    restartLevel();
  });
}

if (ui.timeoutResetButton) {
  ui.timeoutResetButton.addEventListener("click", () => {
    resetGame();
  });
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
resetGame();
requestAnimationFrame(tick);

/* ── debug overlay (tekan D untuk toggle) ─────────── */

function drawDebugOverlay(width, height) {
  const lines = [
    `[DEBUG MODE — tekan D untuk menutup]`,
    `Pose ready  : ${game.poseReady}`,
    `Tracking    : ${game.trackingQuality}`,
    `Side        : ${game.trackedSide}`,
    `Confidence  : ${(game.debugConfidence ?? 0).toFixed(3)}`,
    `Landmarks   : ${game.debugLandmarkCount ?? 0}`,
    `Lost frames : ${game.lostPoseFrames}`,
    `Raw angle   : ${game.rawAngle.toFixed(1)}°`,
    `Control     : ${game.controlAngle.toFixed(1)}°`,
    `Target ROM  : ${game.targetRom}°`,
    `Hand visible: ${game.handFollow.visible}`,
    `Hand (x,y)  : ${game.handFollow.x.toFixed(3)}, ${game.handFollow.y.toFixed(3)}`,
    `Hand dist   : ${getHandDistanceToTarget().toFixed(3)} (on target: ${isHandOnTarget()})`,
    `Rep state   : ${game.repState}`,
    `Hold timer  : ${game.holdTimer.toFixed(2)}s / ${TARGET_HOLD_SECONDS}s`,
  ];

  // Tampilkan visibility landmark penting jika ada
  if (game.debugLastLandmarks) {
    const lm = game.debugLastLandmarks;
    const fmt = (idx) =>
      lm[idx] ? `${(lm[idx].visibility ?? 0).toFixed(2)}` : "n/a";
    lines.push(
      `Shoulder R/L: ${fmt(12)} / ${fmt(11)}`,
      `Wrist R/L   : ${fmt(16)} / ${fmt(15)}`,
      `Hip R/L     : ${fmt(24)} / ${fmt(23)}`,
    );
  }

  const pad = 12;
  const lineH = 18;
  const boxW = 310;
  const boxH = lines.length * lineH + pad * 2;
  const bx = width - boxW - 14;
  const by = 14;

  ctx.fillStyle = "rgba(10, 20, 30, 0.82)";
  ctx.beginPath();
  ctx.roundRect(bx, by, boxW, boxH, 8);
  ctx.fill();

  ctx.font = "600 11px 'Courier New', monospace";
  ctx.textAlign = "left";
  lines.forEach((line, i) => {
    const y = by + pad + i * lineH + 11;
    // Colour-code first line header
    if (i === 0) {
      ctx.fillStyle = "#f59e0b";
    } else if (line.includes("Confidence") || line.includes("Landmarks")) {
      const val = parseFloat(line.split(":")[1]);
      ctx.fillStyle = !isNaN(val) && val > 0.2 ? "#4ade80" : "#f87171";
    } else if (line.includes("Lost frames")) {
      const val = parseInt(line.split(":")[1]);
      ctx.fillStyle = !isNaN(val) && val > 10 ? "#f87171" : "#94a3b8";
    } else if (line.includes("Hand visible")) {
      ctx.fillStyle = line.includes("true") ? "#4ade80" : "#f87171";
    } else {
      ctx.fillStyle = "#e2e8f0";
    }
    ctx.fillText(line, bx + pad, y);
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "d" || e.key === "D") {
    game.debugMode = !game.debugMode;
    console.info(`[MoveWall] Debug overlay ${game.debugMode ? "ON" : "OFF"}`);
  }
});

/* ═══════════════════════════════════════════════════════════════
   THERAPIST ASSESSMENT DIALOG — Mission 1
   ═══════════════════════════════════════════════════════════════ */




function getAuthToken() {
  return sessionStorage.getItem("mw_token") || null;
}

function getTherapistInfo() {
  try {
    return JSON.parse(sessionStorage.getItem("mw_therapist") || "null");
  } catch {
    return null;
  }
}

// ─── Patient Autocomplete & Management State ───────────────────────────────────

let patientsCache = [];
let isPatientsLoaded = false;
let highlightedPatientIndex = -1;
let currentPatientMode = "existing"; // "existing" | "new"
let selectedPatientData = null; // { name, age, isNew }

async function fetchPatientsList() {
  const token = getAuthToken();
  if (!token) return [];

  const loadingEl = document.getElementById("patientComboboxLoading");
  if (loadingEl) loadingEl.classList.remove("hidden");

  try {
    const res = await fetch(`${BACKEND_API}/patients`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      patientsCache = data.patients || [];
      isPatientsLoaded = true;
    }
  } catch (err) {
    console.warn("[MoveWall] Gagal memuat riwayat pasien:", err);
  } finally {
    if (loadingEl) loadingEl.classList.add("hidden");
  }
  return patientsCache;
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

function updatePatientClearBtn() {
  const nameInput = document.getElementById("patientName");
  const clearBtn = document.getElementById("patientClearBtn");
  if (!nameInput || !clearBtn) return;
  if (nameInput.value.trim().length > 0) {
    clearBtn.classList.remove("hidden");
  } else {
    clearBtn.classList.add("hidden");
  }
}

function updatePatientStatusBadge(statusType, infoText) {
  const container = document.getElementById("patientStatusContainer");
  const badge = document.getElementById("patientStatusBadge");
  if (!container || !badge) return;

  if (!statusType) {
    container.classList.add("hidden");
    badge.className = "patient-status-badge";
    badge.textContent = "";
    return;
  }

  container.classList.remove("hidden");
  if (statusType === "new") {
    badge.className = "patient-status-badge is-new";
    badge.innerHTML = `<span>✨</span> <span>Pasien Baru (Sesi Pertama)</span>${infoText ? ` <span style="opacity:0.8">· ${escapeHtml(infoText)}</span>` : ""}`;
  } else if (statusType === "existing") {
    badge.className = "patient-status-badge is-existing";
    badge.innerHTML = `<span>✓</span> <span>Pasien Terdaftar</span>${infoText ? ` <span style="opacity:0.8">· ${escapeHtml(infoText)}</span>` : ""}`;
  }
}

function setPatientMode(mode, preserveName = false) {
  currentPatientMode = mode;
  const btnExisting = document.getElementById("btnModeExistingPatient");
  const btnNew = document.getElementById("btnModeNewPatient");
  const nameInput = document.getElementById("patientName");
  const ageInput = document.getElementById("patientAge");
  const labelText = document.getElementById("patientNameLabelText");
  const helperNote = document.getElementById("patientNewHelper");
  const ageHint = document.getElementById("patientAgeHint");

  if (btnExisting) {
    btnExisting.classList.toggle("active", mode === "existing");
    btnExisting.setAttribute("aria-selected", mode === "existing" ? "true" : "false");
  }
  if (btnNew) {
    btnNew.classList.toggle("active", mode === "new");
    btnNew.setAttribute("aria-selected", mode === "new" ? "true" : "false");
  }

  if (mode === "new") {
    if (labelText) labelText.textContent = "Nama Lengkap Pasien Baru";
    if (nameInput) {
      nameInput.placeholder = "Ketik nama pasien baru...";
      if (!preserveName) {
        nameInput.value = "";
      }
    }
    if (!preserveName && ageInput) {
      ageInput.value = "";
    }
    if (helperNote) helperNote.classList.remove("hidden");
    if (ageHint) ageHint.classList.add("hidden");

    selectedPatientData = {
      name: nameInput ? nameInput.value.trim() : "",
      age: ageInput ? ageInput.value : "",
      isNew: true
    };
    updatePatientStatusBadge("new", nameInput && nameInput.value ? nameInput.value.trim() : "");
    closePatientDropdown();
    updatePatientClearBtn();
  } else {
    // mode === "existing"
    if (labelText) labelText.textContent = "Nama Lengkap Pasien";
    if (nameInput) {
      nameInput.placeholder = "Cari pasien terdaftar atau ketik nama...";
    }
    if (helperNote) helperNote.classList.add("hidden");
    
    // Check if current name matches existing patient in cache
    const currentName = nameInput ? nameInput.value.trim().toLowerCase() : "";
    const matched = patientsCache.find(p => p.name.toLowerCase() === currentName);
    if (matched) {
      selectedPatientData = { ...matched, isNew: false };
      updatePatientStatusBadge("existing", `${matched.age ? matched.age + ' th · ' : ''}${matched.sessionCount || 1}x sesi`);
      if (ageHint) ageHint.classList.remove("hidden");
    } else {
      selectedPatientData = null;
      updatePatientStatusBadge(null);
      if (ageHint) ageHint.classList.add("hidden");
    }
    updatePatientClearBtn();
  }
}

function renderPatientOptions(filterText = "") {
  const optionsList = document.getElementById("patientOptionsList");
  const emptyInitial = document.getElementById("patientEmptyInitial");
  const emptyFilter = document.getElementById("patientEmptyFilter");
  const newNamePreview = document.getElementById("patientNewNamePreview");
  const createRow = document.getElementById("patientDropdownCreateRow");
  const createTitle = document.getElementById("patientDropdownCreateTitle");
  const createDesc = document.getElementById("patientDropdownCreateDesc");
  const headerLabel = document.getElementById("patientDropdownHeader");

  if (!optionsList) return;

  optionsList.innerHTML = "";
  highlightedPatientIndex = -1;

  const query = (filterText || "").trim();
  const queryLower = query.toLowerCase();

  // Update the direct create new patient row
  if (createRow && createTitle && createDesc) {
    if (query) {
      createTitle.innerHTML = `Tambah "<strong>${escapeHtml(query)}</strong>" Sebagai Pasien Baru`;
      createDesc.textContent = "Daftarkan nama ini sebagai pasien baru (sesi pertama)";
    } else {
      createTitle.textContent = "+ Daftarkan Pasien Baru";
      createDesc.textContent = "Klik di sini untuk mendaftarkan pasien baru yang belum pernah terapi";
    }
  }

  // Case 1: Initial empty state (belum ada riwayat pasien sama sekali)
  if (!patientsCache || patientsCache.length === 0) {
    if (emptyInitial) emptyInitial.classList.remove("hidden");
    if (emptyFilter) emptyFilter.classList.add("hidden");
    if (headerLabel) headerLabel.classList.add("hidden");
    optionsList.classList.add("hidden");
    return;
  }

  if (emptyInitial) emptyInitial.classList.add("hidden");

  // Filter patients by query
  const filtered = queryLower
    ? patientsCache.filter((p) => p.name.toLowerCase().includes(queryLower))
    : patientsCache;

  // Case 2: Filter yielded no matches
  if (filtered.length === 0) {
    if (emptyFilter) {
      emptyFilter.classList.remove("hidden");
      if (newNamePreview) newNamePreview.textContent = query;
    }
    if (headerLabel) headerLabel.classList.add("hidden");
    optionsList.classList.add("hidden");
    return;
  }

  // Case 3: Display matching patients
  if (emptyFilter) emptyFilter.classList.add("hidden");
  if (headerLabel) headerLabel.classList.remove("hidden");
  optionsList.classList.remove("hidden");

  filtered.forEach((p, idx) => {
    const li = document.createElement("li");
    li.className = "combobox-option";
    li.dataset.index = idx;
    li.dataset.name = p.name;
    li.dataset.age = p.age || "";
    li.setAttribute("role", "option");

    // Highlight query matches in name
    let displayName = escapeHtml(p.name);
    if (queryLower) {
      const regex = new RegExp(`(${queryLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
      displayName = displayName.replace(regex, "<mark>$1</mark>");
    }

    const firstLetter = p.name.charAt(0).toUpperCase() || "P";
    const sessionLabel = p.sessionCount > 1 ? `${p.sessionCount}x sesi` : "1x sesi";
    const ageLabel = p.age ? `${p.age} th · ` : "";

    li.innerHTML = `
      <div class="combobox-option-info">
        <span class="combobox-option-avatar">${firstLetter}</span>
        <span class="combobox-option-name">${displayName}</span>
      </div>
      <span class="combobox-option-meta">${ageLabel}${sessionLabel}</span>
    `;

    optionsList.appendChild(li);
  });
}

function selectPatientItem(name, age) {
  const nameInput = document.getElementById("patientName");
  const ageInput = document.getElementById("patientAge");
  const ageHint = document.getElementById("patientAgeHint");

  if (nameInput) nameInput.value = name;
  if (ageInput && age !== undefined && age !== null && age !== "") {
    ageInput.value = age;
    ageInput.classList.remove("input-autofilled");
    void ageInput.offsetWidth; // trigger reflow for animation
    ageInput.classList.add("input-autofilled");
  }

  // Mark mode as existing
  currentPatientMode = "existing";
  const btnExisting = document.getElementById("btnModeExistingPatient");
  const btnNew = document.getElementById("btnModeNewPatient");
  if (btnExisting) btnExisting.classList.add("active");
  if (btnNew) btnNew.classList.remove("active");

  const matched = patientsCache.find(p => p.name.toLowerCase() === name.toLowerCase());
  selectedPatientData = matched ? { ...matched, isNew: false } : { name, age, isNew: false };
  activePatientData = selectedPatientData;

  if (selectedPatientData && selectedPatientData.prescription) {
    initAdaptiveEngine(selectedPatientData.prescription);
  }
  if (selectedPatientData && selectedPatientData.medicalRecordNo) {
    sessionStorage.setItem("mw_active_patient_ref", selectedPatientData.medicalRecordNo);
  }
  updatePatientHudBadge();

  const sessionLabel = (matched && matched.sessionCount) ? `${matched.sessionCount}x sesi` : "Pasien Terdaftar";
  updatePatientStatusBadge("existing", `${age ? age + ' th · ' : ''}${sessionLabel}`);
  if (ageHint) ageHint.classList.remove("hidden");

  updatePatientClearBtn();
  closePatientDropdown();
}

function chooseNewPatient(name = "") {
  const nameInput = document.getElementById("patientName");
  const ageInput = document.getElementById("patientAge");

  if (name && nameInput) {
    nameInput.value = name;
  }
  setPatientMode("new", true);

  // If name is filled, guide focus to age input
  if (nameInput && nameInput.value.trim().length > 0) {
    if (ageInput) {
      ageInput.focus();
      ageInput.select();
    }
  } else if (nameInput) {
    nameInput.focus();
  }
}

function openPatientDropdown() {
  if (currentPatientMode === "new") return; // don't auto-open in new patient mode
  const dropdown = document.getElementById("patientDropdown");
  const wrapper = document.getElementById("patientComboboxWrapper");
  const nameInput = document.getElementById("patientName");
  if (!dropdown || !wrapper) return;

  dropdown.classList.remove("hidden");
  wrapper.classList.add("is-open");

  if (!isPatientsLoaded) {
    fetchPatientsList().then(() => {
      renderPatientOptions(nameInput ? nameInput.value : "");
    });
  } else {
    renderPatientOptions(nameInput ? nameInput.value : "");
  }
}

function closePatientDropdown() {
  const dropdown = document.getElementById("patientDropdown");
  const wrapper = document.getElementById("patientComboboxWrapper");
  if (dropdown) dropdown.classList.add("hidden");
  if (wrapper) wrapper.classList.remove("is-open");
  highlightedPatientIndex = -1;
}

function updateHighlightedOption(items, newIndex) {
  items.forEach((item, idx) => {
    item.classList.toggle("is-highlighted", idx === newIndex);
    if (idx === newIndex) {
      item.scrollIntoView({ block: "nearest" });
    }
  });
}

function initPatientCombobox() {
  const wrapper = document.getElementById("patientComboboxWrapper");
  const nameInput = document.getElementById("patientName");
  const ageInput = document.getElementById("patientAge");
  const toggleBtn = document.getElementById("patientComboboxToggle");
  const clearBtn = document.getElementById("patientClearBtn");
  const dropdown = document.getElementById("patientDropdown");
  const optionsList = document.getElementById("patientOptionsList");
  const createRow = document.getElementById("patientDropdownCreateRow");
  const emptyFilter = document.getElementById("patientEmptyFilter");
  const btnModeExisting = document.getElementById("btnModeExistingPatient");
  const btnModeNew = document.getElementById("btnModeNewPatient");
  const resetBtn = document.getElementById("patientResetSelectionBtn");

  if (!wrapper || !nameInput) return;

  // Mode Switchers
  if (btnModeExisting) {
    btnModeExisting.addEventListener("click", () => {
      setPatientMode("existing");
      nameInput.focus();
      openPatientDropdown();
    });
  }

  if (btnModeNew) {
    btnModeNew.addEventListener("click", () => {
      chooseNewPatient(nameInput.value.trim());
    });
  }

  // Reset Selection
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      nameInput.value = "";
      if (ageInput) ageInput.value = "";
      setPatientMode("existing");
      updatePatientClearBtn();
      nameInput.focus();
      openPatientDropdown();
    });
  }

  // Clear button
  if (clearBtn) {
    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      nameInput.value = "";
      updatePatientClearBtn();
      if (currentPatientMode === "new") {
        if (ageInput) ageInput.value = "";
        updatePatientStatusBadge("new", "");
      } else {
        updatePatientStatusBadge(null);
        openPatientDropdown();
        renderPatientOptions("");
      }
      nameInput.focus();
    });
  }

  // Input focus & typing
  nameInput.addEventListener("focus", () => {
    if (currentPatientMode !== "new") {
      openPatientDropdown();
    }
  });

  nameInput.addEventListener("input", () => {
    updatePatientClearBtn();
    if (currentPatientMode === "new") {
      updatePatientStatusBadge("new", nameInput.value.trim());
    } else {
      openPatientDropdown();
      renderPatientOptions(nameInput.value);
    }
  });

  // Toggle button click
  if (toggleBtn) {
    toggleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (currentPatientMode === "new") {
        setPatientMode("existing", true);
      }
      if (dropdown && dropdown.classList.contains("hidden")) {
        nameInput.focus();
        openPatientDropdown();
      } else {
        closePatientDropdown();
      }
    });
  }

  // Direct create row click inside dropdown
  if (createRow) {
    createRow.addEventListener("mousedown", (e) => {
      e.preventDefault();
      chooseNewPatient(nameInput.value.trim());
    });
  }

  // Empty filter card click inside dropdown
  if (emptyFilter) {
    emptyFilter.addEventListener("mousedown", (e) => {
      e.preventDefault();
      chooseNewPatient(nameInput.value.trim());
    });
  }

  // Keyboard navigation
  nameInput.addEventListener("keydown", (e) => {
    if (currentPatientMode === "new") {
      if (e.key === "Enter") {
        e.preventDefault();
        if (ageInput) ageInput.focus();
      }
      return;
    }

    if (!dropdown || dropdown.classList.contains("hidden")) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openPatientDropdown();
      }
      return;
    }

    // Build list of navigable items: createRow + options + emptyFilter (if visible)
    const navigableItems = [];
    if (createRow && !createRow.classList.contains("hidden")) {
      navigableItems.push(createRow);
    }
    const visibleOptions = Array.from(optionsList.querySelectorAll(".combobox-option"));
    navigableItems.push(...visibleOptions);
    if (emptyFilter && !emptyFilter.classList.contains("hidden")) {
      navigableItems.push(emptyFilter);
    }

    if (navigableItems.length === 0) {
      if (e.key === "Escape") {
        closePatientDropdown();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightedPatientIndex = (highlightedPatientIndex + 1) % navigableItems.length;
      updateHighlightedOption(navigableItems, highlightedPatientIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightedPatientIndex = (highlightedPatientIndex - 1 + navigableItems.length) % navigableItems.length;
      updateHighlightedOption(navigableItems, highlightedPatientIndex);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedPatientIndex >= 0 && highlightedPatientIndex < navigableItems.length) {
        const item = navigableItems[highlightedPatientIndex];
        if (item === createRow || item === emptyFilter) {
          chooseNewPatient(nameInput.value.trim());
        } else if (item.classList.contains("combobox-option")) {
          selectPatientItem(item.dataset.name, item.dataset.age);
        }
      } else {
        // Nothing highlighted: check if input matches existing or create new
        const query = nameInput.value.trim();
        const matched = patientsCache.find(p => p.name.toLowerCase() === query.toLowerCase());
        if (matched) {
          selectPatientItem(matched.name, matched.age);
        } else if (query.length > 0) {
          chooseNewPatient(query);
        } else {
          closePatientDropdown();
        }
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePatientDropdown();
    }
  });

  // Click on an option
  if (optionsList) {
    optionsList.addEventListener("mousedown", (e) => {
      const option = e.target.closest(".combobox-option");
      if (option) {
        e.preventDefault();
        selectPatientItem(option.dataset.name, option.dataset.age);
      }
    });
  }

  // Click outside to close
  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) {
      closePatientDropdown();
    }
  });
}

function openAssessmentDialog() {
  const overlay = ui.assessmentOverlay;
  if (!overlay) return;

  // Reset form state
  if (ui.assessmentForm) ui.assessmentForm.reset();
  if (ui.assessmentError) {
    ui.assessmentError.textContent = "";
    ui.assessmentError.classList.add("hidden");
  }
  if (ui.assessmentSuccess) ui.assessmentSuccess.classList.add("hidden");
  if (ui.assessmentForm) ui.assessmentForm.classList.remove("hidden");

  // Reset patient mode & combobox
  setPatientMode("existing");
  updatePatientStatusBadge(null);
  updatePatientClearBtn();
  closePatientDropdown();
  fetchPatientsList().then(() => renderPatientOptions(""));

  // Fill therapist name from session
  const therapist = getTherapistInfo();
  if (ui.assessmentTherapistName && therapist) {
    ui.assessmentTherapistName.textContent = `Terapis: ${therapist.name} (${therapist.username})`;
  }

  // Update Live Session Metrics (Fitur 3: ROM Maksimum, Akurasi, Kompensasi)
  const metrics = typeof MoveWallMetrics !== "undefined" ? MoveWallMetrics.snapshot() : null;
  const evalMaxRom = document.getElementById("evalMaxRom");
  const evalAccuracy = document.getElementById("evalAccuracy");
  const evalCompensation = document.getElementById("evalCompensation");
  if (evalMaxRom) evalMaxRom.textContent = metrics?.maxRomDeg ? `${metrics.maxRomDeg}°` : "—°";
  if (evalAccuracy) evalAccuracy.textContent = metrics?.accuracyPercent !== null && metrics?.accuracyPercent !== undefined ? `${metrics.accuracyPercent}%` : "—%";
  if (evalCompensation) evalCompensation.textContent = metrics?.compensationEvents ?? 0;

  // Reset pain toggles and sliders
  document.querySelectorAll(".pain-score-slider-wrap").forEach(wrap => wrap.classList.add("hidden"));
  document.querySelectorAll(".pain-range-slider").forEach(slider => slider.value = "0");
  document.querySelectorAll(".pain-toggle").forEach(toggle => toggle.checked = false);
  document.querySelectorAll('input[name="painRegions"]').forEach(cb => cb.checked = false);

  overlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeAssessmentDialog() {
  closePatientDropdown();
  if (ui.assessmentOverlay) {
    ui.assessmentOverlay.classList.add("hidden");
  }
  document.body.style.overflow = "";
}

function setAssessmentLoading(isLoading) {
  if (ui.assessmentSubmitBtn) ui.assessmentSubmitBtn.disabled = isLoading;
  if (ui.assessmentSubmitText) ui.assessmentSubmitText.classList.toggle("hidden", isLoading);
  if (ui.assessmentSubmitLoader) ui.assessmentSubmitLoader.classList.toggle("hidden", !isLoading);
}

function showAssessmentError(msg) {
  if (ui.assessmentError) {
    ui.assessmentError.textContent = msg;
    ui.assessmentError.classList.remove("hidden");
  }
}

function getPainSeverityLabel(val) {
  if (val == 0) return "0 (Bebas Nyeri)";
  if (val <= 3) return `${val} (Nyeri Ringan)`;
  if (val <= 6) return `${val} (Nyeri Sedang)`;
  return `${val} (Nyeri Berat)`;
}

function initPainScoreControls() {
  document.querySelectorAll(".pain-toggle").forEach((toggle) => {
    toggle.addEventListener("change", () => {
      const targetId = toggle.dataset.target;
      const wrap = document.getElementById(`wrap${targetId.charAt(0).toUpperCase() + targetId.slice(1)}`);
      const slider = document.getElementById(targetId);
      const valDisplay = document.getElementById(`val${targetId.charAt(0).toUpperCase() + targetId.slice(1)}`);

      if (toggle.checked) {
        if (wrap) wrap.classList.remove("hidden");
        if (slider) slider.value = "4";
        if (valDisplay) valDisplay.textContent = getPainSeverityLabel(4);
      } else {
        if (wrap) wrap.classList.add("hidden");
        if (slider) slider.value = "0";
        if (valDisplay) valDisplay.textContent = getPainSeverityLabel(0);
      }
    });
  });

  document.querySelectorAll(".pain-range-slider").forEach((slider) => {
    slider.addEventListener("input", () => {
      const targetId = slider.id;
      const valDisplay = document.getElementById(`val${targetId.charAt(0).toUpperCase() + targetId.slice(1)}`);
      const val = parseInt(slider.value, 10);
      if (valDisplay) valDisplay.textContent = getPainSeverityLabel(val);
      const toggle = document.querySelector(`.pain-toggle[data-target="${targetId}"]`);
      if (toggle) {
        toggle.checked = val > 0;
      }
    });
  });
}

async function submitAssessment(formData) {
  const isHome = Boolean(game.homeSession && game.homeSession.active && game.homeSession.code);
  const token = getAuthToken();
  if (!isHome && !token) {
    window.location.replace("./login.html");
    return;
  }

  const metrics = typeof MoveWallMetrics !== "undefined" ? MoveWallMetrics.snapshot() : {};
  const typedName = formData.get("patientName")?.trim() || (isHome ? game.homeSession.patientName : "");
  const selectedId =
    selectedPatientData &&
    !selectedPatientData.isNew &&
    selectedPatientData.id &&
    (!selectedPatientData.name || selectedPatientData.name.toLowerCase() === typedName.toLowerCase())
      ? selectedPatientData.id
      : undefined;

  const painFlexionScore = formData.get("painFlexionScore");
  const painAbductionScore = formData.get("painAbductionScore");
  const painExtRotScore = formData.get("painExternalRotationScore");
  const painIntRotScore = formData.get("painInternalRotationScore");
  const painExtensionScore = formData.get("painExtensionScore");

  const painRegions = Array.from(document.querySelectorAll('input[name="painRegions"]:checked')).map(el => el.value);
  const safeMaxRom =
    metrics.maxRomDeg !== null && metrics.maxRomDeg !== undefined && Number.isFinite(Number(metrics.maxRomDeg))
      ? Math.min(180, Math.max(0, Number(metrics.maxRomDeg)))
      : null;

  const payload = {
    patientId: selectedId,
    patientName: typedName,
    patientAge: formData.get("patientAge") || (isHome ? game.homeSession.patientAge : null),
    consent: formData.has("consent") || isHome,
    sessionMode: isHome ? "HOME" : "CLINIC",
    painFlexion: formData.has("painFlexion"),
    painAbduction: formData.has("painAbduction"),
    painExternalRotation: formData.has("painExternalRotation"),
    painInternalRotation: formData.has("painInternalRotation"),
    painExtension: formData.has("painExtension"),
    painFlexionScore: painFlexionScore !== null && painFlexionScore !== "" ? parseInt(painFlexionScore) : (formData.has("painFlexion") ? 4 : null),
    painAbductionScore: painAbductionScore !== null && painAbductionScore !== "" ? parseInt(painAbductionScore) : (formData.has("painAbduction") ? 4 : null),
    painExternalRotationScore: painExtRotScore !== null && painExtRotScore !== "" ? parseInt(painExtRotScore) : (formData.has("painExternalRotation") ? 4 : null),
    painInternalRotationScore: painIntRotScore !== null && painIntRotScore !== "" ? parseInt(painIntRotScore) : (formData.has("painInternalRotation") ? 4 : null),
    painExtensionScore: painExtensionScore !== null && painExtensionScore !== "" ? parseInt(painExtensionScore) : (formData.has("painExtension") ? 4 : null),
    painRegions,
    maxRomDeg: safeMaxRom,
    accuracyPercent: metrics.accuracyPercent,
    compensationEvents: metrics.compensationEvents,
    notes: formData.get("notes") || (isHome ? "Latihan mandiri pasien di rumah via kode akses." : null),
    missionId: 1,
    sessionScore: game.score || 0,
    sessionHits: game.reps || 0,
    sessionLevel: game.level || 1,
    sessionTime: ui.time ? ui.time.textContent : null,
  };

  // Fitur 6 & 8: ID Unik Idempotent & Replay Kerangka Gerak Kinematis
  const clientSessionId = typeof MoveWallSyncQueue !== "undefined"
    ? MoveWallSyncQueue.generateUUID()
    : "sess_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 9);
  payload.clientSessionId = clientSessionId;
  payload.kinematicReplayData = activeKinematicRecorder ? activeKinematicRecorder.exportJson() : null;

  const targetEndpoint = isHome
    ? `${BACKEND_API}/home-session/${encodeURIComponent(game.homeSession.code)}/assessment`
    : `${BACKEND_API}/assessment`;

  try {
    let res;
    if (isHome) {
      res = await fetch(targetEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch(targetEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.requiresSubscription) {
        showGamePaywallModal(data);
      }
      throw new Error(data.error || `Gagal menyimpan assessment (HTTP ${res.status}).`);
    }

    return await res.json();
  } catch (err) {
    const isNetworkError = !navigator.onLine || err.message.includes("fetch") || err.message.includes("Network") || err.message.includes("Failed");
    if (typeof MoveWallSyncQueue !== "undefined" && isNetworkError) {
      MoveWallSyncQueue.enqueue({
        clientSessionId,
        endpoint: targetEndpoint,
        token: isHome ? null : token,
        payload,
      });
      return {
        offlineQueued: true,
        clientSessionId,
        message: "Koneksi offline. Data asesmen tersimpan di antrean perangkat dan akan disinkron otomatis saat online kembali.",
      };
    }
    throw err;
  }
}

// Wire up assessment buttons (from mission complete overlay and timeout overlay)
if (ui.modalAssessmentButton) {
  ui.modalAssessmentButton.addEventListener("click", () => {
    openAssessmentDialog();
  });
}

if (ui.timeoutAssessmentButton) {
  ui.timeoutAssessmentButton.addEventListener("click", () => {
    openAssessmentDialog();
  });
}

// Close button
if (ui.assessmentCloseBtn) {
  ui.assessmentCloseBtn.addEventListener("click", closeAssessmentDialog);
}

// Cancel button
if (ui.assessmentCancelBtn) {
  ui.assessmentCancelBtn.addEventListener("click", closeAssessmentDialog);
}

// Close on backdrop click
if (ui.assessmentOverlay) {
  ui.assessmentOverlay.addEventListener("click", (e) => {
    if (e.target === ui.assessmentOverlay || e.target.classList.contains("assessment-backdrop")) {
      closeAssessmentDialog();
    }
  });
}

// Success close
if (ui.assessmentSuccessCloseBtn) {
  ui.assessmentSuccessCloseBtn.addEventListener("click", closeAssessmentDialog);
}

// Form submit
if (ui.assessmentForm) {
  ui.assessmentForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (ui.assessmentError) ui.assessmentError.classList.add("hidden");

    const formData = new FormData(ui.assessmentForm);
    const patientName = formData.get("patientName")?.trim();
    const patientAge = formData.get("patientAge");

    if (!patientName) {
      showAssessmentError("Nama lengkap pasien wajib diisi.");
      return;
    }
    if (!patientAge || parseInt(patientAge) < 1 || parseInt(patientAge) > 120) {
      showAssessmentError("Usia pasien harus diisi dengan nilai yang valid (1–120 tahun).");
      return;
    }

    setAssessmentLoading(true);

    try {
      const saveRes = await submitAssessment(formData);

      // Update local patients cache so newly added patient appears in combobox
      const parsedAge = parseInt(patientAge);
      const existingPatient = patientsCache.find(
        (p) => p.name.toLowerCase() === patientName.toLowerCase()
      );
      if (existingPatient) {
        existingPatient.age = parsedAge;
        existingPatient.sessionCount = (existingPatient.sessionCount || 1) + 1;
        if (saveRes?.patient?.id) existingPatient.id = saveRes.patient.id;
      } else {
        patientsCache.unshift({
          id: saveRes?.patient?.id,
          medicalRecordNo: saveRes?.patient?.medicalRecordNo,
          name: patientName,
          age: parsedAge,
          sessionCount: 1,
        });
      }

      // Show success state
      if (ui.assessmentForm) ui.assessmentForm.classList.add("hidden");
      if (ui.assessmentSuccess) {
        ui.assessmentSuccess.classList.remove("hidden");
        const successTxt = ui.assessmentSuccess.querySelector(".assessment-success-text");
        if (successTxt) {
          successTxt.textContent = saveRes && saveRes.offlineQueued
            ? "Tersimpan di antrean offline. Akan disinkron otomatis saat online kembali."
            : "Assessment berhasil disimpan!";
        }
      }
      console.info("[MoveWall] Assessment berhasil diproses.", saveRes);
    } catch (err) {
      showAssessmentError(err.message || "Terjadi kesalahan. Pastikan server backend berjalan.");
    } finally {
      setAssessmentLoading(false);
    }
  });
}

// ─── Adaptive Difficulty Engine & Safety Ceiling Integration (Fitur 1) ──────────

function initAdaptiveEngine(prescription = null) {
  const rx = prescription || {
    initialTargetRom: 45.0,
    maxSafetyCeiling: 135.0,
    minFunctionalRom: 30.0,
    adaptiveEnabled: true,
  };
  if (typeof MoveWallAdaptive !== "undefined" && MoveWallAdaptive.AdaptiveEngine) {
    activeAdaptiveEngine = new MoveWallAdaptive.AdaptiveEngine({
      exerciseType: "SHOULDER_FLEXION",
      initialTargetRom: rx.initialTargetRom,
      maxSafetyCeiling: rx.maxSafetyCeiling,
      minFunctionalRom: rx.minFunctionalRom,
      adaptiveEnabled: rx.adaptiveEnabled,
    });
    MISSION_TARGETS = activeAdaptiveEngine.generateTargets(10);
  } else {
    MISSION_TARGETS = [30, 45, 60, 75, 90, 105, 120, 135, 150, 165];
  }
  game.repsGoal = MISSION_TARGETS.length;
  game.minTargetRom = activeAdaptiveEngine ? activeAdaptiveEngine.minFunctionalRom : MISSION_TARGETS[0];
  game.maxTargetRom = activeAdaptiveEngine ? activeAdaptiveEngine.maxSafetyCeiling : MISSION_TARGETS[MISSION_TARGETS.length - 1];
  game.targetRom = MISSION_TARGETS[0];
  if (ui.target) ui.target.textContent = `Target ${game.targetRom}`;
  updatePatientHudBadge();
}

function updatePatientHudBadge() {
  const nameEl = document.getElementById("hudPatientName");
  const ceilingEl = document.getElementById("hudSafetyCeiling");
  const pillEl = document.getElementById("hudAdaptivePill");
  if (!nameEl || !ceilingEl || !pillEl) return;

  if (game.homeSession && game.homeSession.active) {
    nameEl.textContent = `🏠 Latihan Mandiri: ${game.homeSession.patientName}`;
  } else if (activePatientData) {
    nameEl.textContent = `Pasien: ${activePatientData.name}${activePatientData.medicalRecordNo ? ` (${activePatientData.medicalRecordNo})` : ""}`;
  } else {
    nameEl.textContent = "Pasien: Sesi Umum";
  }

  const ceiling = activeAdaptiveEngine
    ? activeAdaptiveEngine.maxSafetyCeiling
    : (MISSION_TARGETS[MISSION_TARGETS.length - 1] || 135);
  ceilingEl.textContent = `Batas Aman: ${Math.round(ceiling)}°`;

  if (activeAdaptiveEngine && activeAdaptiveEngine._painOverrideActive) {
    pillEl.className = "hud-adaptive-pill is-pain";
    pillEl.textContent = "Nyeri: Turun Minimum";
  } else if (activeAdaptiveEngine && !activeAdaptiveEngine.adaptiveEnabled) {
    pillEl.className = "hud-adaptive-pill is-fixed";
    pillEl.textContent = "Target Tetap";
  } else {
    pillEl.className = "hud-adaptive-pill";
    pillEl.textContent = "Adaptif Aktif";
  }
}

async function checkHomeSessionFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const homeCode = urlParams.get("code") || urlParams.get("homeCode");
  if (!homeCode) return false;

  try {
    const res = await fetch(`${BACKEND_API}/home-session/${encodeURIComponent(homeCode.trim())}`);
    if (!res.ok) {
      console.warn("[MoveWall Home] Kode sesi latihan mandiri tidak valid.");
      return false;
    }
    const data = await res.json();
    game.homeSession = {
      active: true,
      code: data.code,
      patientName: data.patient.name,
      patientAge: data.patient.age,
      medicalRecordNo: data.patient.medicalRecordNo,
      therapistName: data.patient.therapist?.fullName || "Fisioterapis",
      prescription: data.patient.prescription,
    };
    activePatientData = {
      id: data.patient.id,
      name: data.patient.name,
      age: data.patient.age,
      medicalRecordNo: data.patient.medicalRecordNo,
      prescription: data.patient.prescription,
    };
    initAdaptiveEngine(data.patient.prescription);
    updatePatientHudBadge();
    console.info(`[MoveWall Home] Sesi latihan mandiri di rumah aktif: ${data.patient.name} (${data.code})`);
    return true;
  } catch (err) {
    console.warn("[MoveWall Home] Gagal memuat sesi latihan di rumah:", err);
    return false;
  }
}

function checkInitialPatientFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const patientRef = urlParams.get("patient") || sessionStorage.getItem("mw_active_patient_ref");
  if (!patientRef || !patientsCache.length) return;

  const refClean = decodeURIComponent(patientRef).trim().toLowerCase();
  const found = patientsCache.find(p => 
    (p.medicalRecordNo && p.medicalRecordNo.toLowerCase() === refClean) ||
    p.name.toLowerCase() === refClean ||
    String(p.id) === refClean
  );

  if (found) {
    activePatientData = found;
    sessionStorage.setItem("mw_active_patient_ref", found.medicalRecordNo || found.name);
    initAdaptiveEngine(found.prescription);
    selectPatientItem(found.name, found.age);
  }
}

// Restore saved calibration zero offset if available
try {
  const savedOffset = parseFloat(localStorage.getItem("mw_zero_offset"));
  if (!isNaN(savedOffset) && savedOffset >= 0 && savedOffset <= 60) {
    game.calibration.zeroOffset = savedOffset;
    if (ui.calibZeroOffset) {
      ui.calibZeroOffset.textContent = `${savedOffset.toFixed(1)}°`;
    }
  }
} catch (_) {}

// Initialize patient combobox autocomplete, pain controls, and adaptive engine
initPatientCombobox();
initPainScoreControls();
initAdaptiveEngine();
checkHomeSessionFromUrl().then((isHome) => {
  if (!isHome) {
    fetchPatientsList().then(() => checkInitialPatientFromUrl());
  }
});

console.info("[MoveWall] Mission 1 — Player Lock, Calibration, Home Tele-Rehab & Adaptive ready.");
