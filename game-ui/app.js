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
const MISSION_TARGETS = [30, 45, 60, 75, 90, 105, 120, 135, 150, 165];
const LEVEL_ONE_HITS = 5;
const TARGET_HOLD_SECONDS = 2.0;
const TARGET_HOLD_UNDER_TOLERANCE = 6;
const TARGET_HOLD_OVER_TOLERANCE = 7;
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
    numPoses: 1,
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
  if (!game.running || game.mode !== "camera" || game.painStop) return;
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

  const landmarks = result?.landmarks?.[0];
  if (!landmarks) {
    handlePoseMiss("No full body detected", "Keep shoulder and hand visible");
    return;
  }

  // Simpan raw confidence untuk debug overlay
  game.debugLandmarkCount = landmarks.length;
  game.debugLastLandmarks = landmarks;

  const estimate = estimateArmRaiseRom(landmarks);
  if (!estimate) {
    handlePoseMiss("Hand not visible", "Keep your wrist inside the camera");
    return;
  }

  game.lostPoseFrames = 0;
  game.trackingQuality = estimate.compensation
    ? "Shoulder hike detected"
    : `Tracking ${estimate.side} arm`;
  game.trackedSide = estimate.side;
  game.posePoints = estimate.points;
  game.debugConfidence = estimate.confidence;
  updateHandFollow(estimate.points.wrist);
  game.rawAngle = estimate.controlAngle;
  game.controlAngle = stabilizeClinicalAngle(
    estimate.controlAngle,
    game.controlAngle,
  );
  game.displayAngle = game.controlAngle;
  game.clinicalAngle = stabilizeClinicalAngle(
    estimate.clinicalAngle,
    game.clinicalAngle,
  );
  game.cameraAngle = game.controlAngle;

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

function stabilizeClinicalAngle(rawAngle, previousAngle) {
  const diff = rawAngle - previousAngle;
  const absDiff = Math.abs(diff);

  if (absDiff < 0.8) return previousAngle;

  if (
    Math.abs(rawAngle - game.targetRom) <= 1.8 &&
    Math.abs(previousAngle - game.targetRom) <= 4
  ) {
    return game.targetRom;
  }

  const alpha = absDiff > 18 ? 0.62 : absDiff > 7 ? 0.48 : 0.32;
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

  game.handFollow.x = game.handFollow.x * 0.12 + targetX * 0.88;
  game.handFollow.y = game.handFollow.y * 0.12 + targetY * 0.88;
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

  // Jika hip tidak tersedia, perkirakan posisi hip dari shoulder
  // (asumsikan torso sepanjang 0.4 dalam normalized space)
  const effectiveHip = hip ?? { x: shoulder.x, y: shoulder.y + 0.4 };

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
    game.holdTimer = Math.max(0, game.holdTimer - holdDelta * 1.5);
    game.lastHoldTimestamp = now;
    if (game.holdTimer <= 0) {
      game.targetAcquired = false;
    }
    return buildPayload(angle, repJustCompleted, repStatus, completedPeakAngle);
  }

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
}

function getMissionLevelForHitCount(hits) {
  return hits < LEVEL_ONE_HITS ? 1 : 2;
}

function getTargetRomForHitCount(hits) {
  return MISSION_TARGETS[clamp(hits, 0, MISSION_TARGETS.length - 1)];
}

function completeRep(status, peakAngle) {
  if (status !== "VALID") return;

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
    triggerMissionComplete();
  } else {
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
  game.targetRom = game.minTargetRom;
  setFeedback("bad", "Stopped", "Rest and contact your therapist");
}

function triggerMissionComplete() {
  if (game.missionCompleted) return;
  game.missionCompleted = true;
  game.running = false;

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
  game.targetHitFlash = 0;
  game.targetCooldown = 0;
  game.painStop = false;
  game.running = true;

  setFeedback(
    "neutral",
    `Level ${game.level} Dimulai Ulang! 🎯`,
    `Arahkan lenganmu ke Target ${game.targetRom}°`,
  );
}

function resetGame() {
  game.running = false;
  game.missionCompleted = false;
  game.timeoutTriggered = false;
  hideMissionCompletionModal();
  hideTimeoutModal();
  game.score = 0;
  game.timeRemaining = 90;
  game.level = 1;
  game.reps = 0;
  game.angle = 20;
  game.targetRom = MISSION_TARGETS[0];
  game.repState = "RESTING";
  game.peakAngle = 0;
  resetTargetHold();
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
  const reticleY = aimPoint.y;
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
  const ready = await ensureCameraReady();
  if (!ready) return;
  game.running = true;
  game.painStop = false;
  setFeedback("neutral", "Mission active", "Raise your hand to draw and shoot");
});

ui.pauseButton.addEventListener("click", () => {
  game.running = false;
  setFeedback("neutral", "Paused", "Session on hold");
});

ui.resetButton.addEventListener("click", resetGame);
ui.painButton.addEventListener("click", triggerPainStop);

if (ui.modalReplayButton) {
  ui.modalReplayButton.addEventListener("click", () => {
    resetGame();
    game.running = true;
    game.painStop = false;
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
