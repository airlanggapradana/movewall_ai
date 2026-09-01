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
    bundle: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs",
    wasm: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
  },
];
const POSE_MODEL_URL = "./assets/pose_landmarker.task";
const ORCHARD_BACKGROUND_URL = "./assets/orchard-fpv-background.jpeg";
const USE_ORCHARD_REFERENCE = true;
const MISSION_TARGETS = [30, 45, 60, 75, 90, 105, 120, 135, 150, 165];
const LEVEL_ONE_HITS = 5;
const TARGET_HOLD_SECONDS = 3;
const TARGET_HOLD_UNDER_TOLERANCE = 5;
const TARGET_HOLD_OVER_TOLERANCE = 7;
const POSE_TARGET_FPS = 30;
const POSE_FRAME_INTERVAL = 1000 / POSE_TARGET_FPS;

const orchardBackground = new Image();
if (USE_ORCHARD_REFERENCE) {
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
    { treeIdx: 1, ox:  0.035, oy: 0.04, picked: false },
    { treeIdx: 2, ox: -0.07, oy: 0.00, picked: false },
    { treeIdx: 2, ox: -0.035, oy: 0.05, picked: false },
    { treeIdx: 2, ox:  0.00, oy: 0.02, picked: false },
    { treeIdx: 2, ox:  0.045, oy: 0.065, picked: false },
    { treeIdx: 2, ox:  0.075, oy: 0.01, picked: false },
    { treeIdx: 2, ox: -0.005, oy: 0.09, picked: false },
    { treeIdx: 2, ox:  0.105, oy: 0.055, picked: false },
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

function buildPayload(angle, repJustCompleted = false, repStatus = "NONE", peakAngle = game.peakAngle) {
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
  game.targetRom = clamp(payload.metrics?.target_rom ?? game.targetRom, game.minTargetRom, game.maxTargetRom);
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
      game.poseLandmarker = await createPoseLandmarker(visionTasks, vision, "GPU");
    } catch (gpuError) {
      console.warn("MoveWall GPU pose init failed, retrying CPU:", gpuError);
      game.poseLandmarker = await createPoseLandmarker(visionTasks, vision, "CPU");
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
      const vision = await visionTasks.FilesetResolver.forVisionTasks(source.wasm);
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
    minPoseDetectionConfidence: 0.3,
    minPosePresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
  });
}

async function ensureCameraReady() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setFeedback("bad", "Camera unavailable", "Browser does not support webcam access");
    return false;
  }

  try {
    if (!game.cameraStream) {
      game.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
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
      setFeedback("bad", "Pose AI unavailable", "Check local server and refresh");
      return false;
    }
    setFeedback("good", "Pose AI ready", "Raise your hand to draw the bow");
    return true;
  } catch (error) {
    setFeedback("bad", "Camera blocked", "Allow camera permission in the browser");
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
    game.trackingQuality = game.poseLoading ? "Loading pose model" : "Pose AI unavailable";
    return;
  }

  updatePoseTracking(performance.now());
}

function updatePoseTracking(now) {
  if (game.poseBusy || now - game.lastPoseAt < POSE_FRAME_INTERVAL) return;

  const video = ui.cameraPreview;
  if (video.currentTime === game.lastVideoTime) return;
  game.lastPoseAt = now;
  game.lastVideoTime = video.currentTime;

  game.poseBusy = true;
  let result;
  try {
    result = game.poseLandmarker.detectForVideo(video, now);
  } catch (error) {
    game.trackingQuality = "Pose inference error";
    setFeedback("bad", "Tracking error", "Refresh the game and start camera again");
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

  const estimate = estimateArmRaiseRom(landmarks);
  if (!estimate) {
    handlePoseMiss("Hand not visible", "Keep your shoulder and wrist inside the camera");
    return;
  }

  game.lostPoseFrames = 0;
  game.trackingQuality = estimate.compensation
    ? "Shoulder hike detected"
    : `Tracking ${estimate.side} arm`;
  game.trackedSide = estimate.side;
  game.posePoints = estimate.points;
  updateHandFollow(estimate.points.wrist);
  game.rawAngle = estimate.controlAngle;
  game.controlAngle = stabilizeClinicalAngle(estimate.controlAngle, game.controlAngle);
  game.displayAngle = game.controlAngle;
  game.clinicalAngle = stabilizeClinicalAngle(estimate.clinicalAngle, game.clinicalAngle);
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

  if (game.lostPoseFrames <= 6 && game.posePoints) {
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

  if (Math.abs(rawAngle - game.targetRom) <= 1.8 && Math.abs(previousAngle - game.targetRom) <= 4) {
    return game.targetRom;
  }

  const alpha = absDiff > 18 ? 0.62 : absDiff > 7 ? 0.48 : 0.32;
  return previousAngle + diff * alpha;
}

function getTargetColor(angle) {
  if (isAngleInsideTargetWindow(angle)) return "GREEN";
  if (Math.abs(angle - game.targetRom) <= 15) return "YELLOW";
  return "RED";
}

function isHandOnTarget() {
  if (!game.handFollow.visible || game.targetCooldown > 0) return false;

  const { x: targetX, y: targetY } = getTargetPointNorm();
  const dx = game.handFollow.x - targetX;
  const dy = game.handFollow.y - targetY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < 0.075 && isAngleInsideTargetWindow(game.cameraAngle);
}

function getTargetPointNorm() {
  const targetRange = game.maxTargetRom - game.minTargetRom;
  const targetRatio = targetRange > 0 ? (game.targetRom - game.minTargetRom) / targetRange : 0;
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
  const shoulderVisibility = shoulder?.visibility ?? 1;
  const wristVisibility = wrist?.visibility ?? 1;
  const hipVisibility = hip?.visibility ?? 0;
  const confidence = Math.min(shoulderVisibility, wristVisibility);

  if (!shoulder || !wrist || confidence < 0.12) return null;

  const aspect = getPoseAspectRatio();
  const hasReliableHip = hip && hipVisibility >= 0.12;
  const torsoUp = hasReliableHip
    ? {
        x: (shoulder.x - hip.x) * aspect,
        y: shoulder.y - hip.y,
      }
    : {
        x: 0,
        y: -1,
      };
  const arm = {
    x: (wrist.x - shoulder.x) * aspect,
    y: wrist.y - shoulder.y,
  };
  const angleFromTorso = angleBetweenVectors(torsoUp, arm);
  const clinicalAngle = clamp(180 - angleFromTorso, 0, 180);
  const controlAngle = clinicalAngle;
  const angle = controlAngle;
  const shoulderHike = oppositeShoulder
    ? shoulder.y < oppositeShoulder.y - 0.045 && controlAngle < game.targetRom && controlAngle > 45
    : false;

  return {
    side: ids.side,
    angle,
    controlAngle,
    clinicalAngle,
    compensation: shoulderHike,
    score: confidence * 100 + controlAngle,
    points: {
      shoulder,
      elbow,
      wrist,
      hip: hasReliableHip ? hip : { x: shoulder.x, y: Math.min(0.98, shoulder.y + 0.32) },
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
  return Math.acos(cos) * 180 / Math.PI;
}

/* ── rep counting ──────────────────────────────────── */

function processTargetHold(angle, now) {
  let repJustCompleted = false;
  let repStatus = "NONE";
  let completedPeakAngle = Math.max(game.peakAngle, angle);

  if (!game.running || game.painStop || game.missionCompleted || game.targetCooldown > 0) {
    resetTargetHold();
    return buildPayload(angle, repJustCompleted, repStatus, completedPeakAngle);
  }

  if (!isAngleInsideTargetWindow(angle)) {
    game.repState = getAimState(angle);
    game.peakAngle = Math.max(game.peakAngle, angle);
    game.targetAcquired = false;
    resetTargetHold();
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
  game.score += Math.round(100 + Math.max(0, peakAngle - game.targetRom) * 4 + game.level * 12);
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

function fireArrowAtTarget() {
  const targetPoint = getTargetPointNorm();
  game.arrows.push({
    from: { x: 0.325, y: 0.525 },
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
  if (color === "GREEN") {
    const remaining = Math.max(0, TARGET_HOLD_SECONDS - game.holdTimer).toFixed(1);
    setFeedback("good", "On target", `Hold ${remaining}s to shoot`);
  } else if (game.controlAngle > game.targetRom + TARGET_HOLD_OVER_TOLERANCE) {
    setFeedback("warn", "Too high", "Lower your bow hand slightly");
  } else if (color === "YELLOW") {
    setFeedback("warn", "Close", "Draw to the apple angle");
  } else {
    setFeedback("bad", "Low ROM", "Raise your bow hand");
  }
}

function getRomStatus() {
  if (!game.cameraStream) return "Waiting for camera";
  if (!game.running) return game.trackingQuality;
  if (game.trackingQuality.includes("Shoulder hike")) return "Compensation detected";
  const clinical = Math.round(game.clinicalAngle);
  if (game.targetAcquired) return `Holding ${game.holdTimer.toFixed(1)}/${TARGET_HOLD_SECONDS}s | clinical ${clinical}`;
  if (game.controlAngle > game.targetRom + TARGET_HOLD_OVER_TOLERANCE) return `Lower to ${game.targetRom} | clinical ${clinical}`;
  if (Math.abs(game.controlAngle - game.targetRom) <= 15) return `Close to ${game.targetRom} | clinical ${clinical}`;
  return `${game.trackingQuality}: raise to ${game.targetRom} | clinical ${clinical}`;
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
  if (ui.modalTime) ui.modalTime.textContent = formatTime(Math.max(0, game.timeRemaining));

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
      hue: Math.random() > 0.6 ? "#10b981" : Math.random() > 0.3 ? "#f59e0b" : "#fff",
    });
  }
}

function hideMissionCompletionModal() {
  if (ui.missionCompleteOverlay) {
    ui.missionCompleteOverlay.classList.add("hidden");
  }
}

function resetGame() {
  game.running = false;
  game.missionCompleted = false;
  hideMissionCompletionModal();
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
  if (!hasReferenceScene) drawTrees(width, height);
  if (!hasReferenceScene) drawSceneDepth(width, height);
  drawAppleProgress(width, height);
  drawReachGuide(width, height);
  drawShotArrows(width, height);
  drawAppleTarget(width, height);
  drawPatient(width, height);
  drawSparkles(width, height);
  drawFallingLeaves(width, height);
  if (!hasReferenceScene) {
    drawBasket(width, height);
    drawOrchardForeground(width, height);
  }
}

/* ── sky + ground ──────────────────────────────────── */

function drawScene(width, height) {
  if (USE_ORCHARD_REFERENCE && orchardBackground.complete && orchardBackground.naturalWidth > 0) {
    drawCoverImage(orchardBackground, 0, 0, width, height);

    const lightWash = ctx.createLinearGradient(0, 0, 0, height);
    lightWash.addColorStop(0, "rgba(255, 247, 213, 0.06)");
    lightWash.addColorStop(0.5, "rgba(255, 255, 255, 0)");
    lightWash.addColorStop(1, "rgba(23, 56, 34, 0.18)");
    ctx.fillStyle = lightWash;
    ctx.fillRect(0, 0, width, height);

    const focus = ctx.createRadialGradient(width * 0.76, height * 0.42, 20, width * 0.76, height * 0.42, width * 0.34);
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
  ctx.bezierCurveTo(width * 0.18, height * 0.42, width * 0.38, height * 0.5, width * 0.56, height * 0.44);
  ctx.bezierCurveTo(width * 0.76, height * 0.38, width * 0.92, height * 0.48, width, height * 0.46);
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
  ctx.bezierCurveTo(width * 0.2, height * 0.54, width * 0.5, height * 0.62, width * 0.75, height * 0.56);
  ctx.bezierCurveTo(width * 0.9, height * 0.53, width, height * 0.58, width, height * 0.57);
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
  const path = ctx.createLinearGradient(width * 0.3, height * 0.62, width * 0.48, height);
  path.addColorStop(0, "rgba(198, 166, 110, 0.6)");
  path.addColorStop(1, "rgba(180, 140, 90, 0.8)");
  ctx.fillStyle = path;
  ctx.beginPath();
  ctx.moveTo(width * 0.36, height * 0.62);
  ctx.bezierCurveTo(width * 0.42, height * 0.72, width * 0.48, height * 0.86, width * 0.54, height);
  ctx.lineTo(width * 0.28, height);
  ctx.bezierCurveTo(width * 0.33, height * 0.84, width * 0.34, height * 0.74, width * 0.32, height * 0.62);
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

  ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
  ctx.beginPath();
  ctx.ellipse(width * 0.78, height * 0.37, width * 0.23, height * 0.13, -0.08, 0, Math.PI * 2);
  ctx.fill();

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
    ctx.fillStyle = isMainTree ? "rgba(16, 32, 43, 0.20)" : "rgba(16, 32, 43, 0.11)";
    ctx.beginPath();
    ctx.ellipse(x, groundY + 9, canopyR * 0.95, canopyR * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    /* trunk */
    const trunkWidth = Math.max(22, canopyR * 0.24);
    const trunk = ctx.createLinearGradient(x - trunkWidth / 2, trunkTop, x + trunkWidth / 2, groundY);
    trunk.addColorStop(0, "#8b6b3d");
    trunk.addColorStop(0.5, "#6b4226");
    trunk.addColorStop(1, "#4a2e18");
    ctx.fillStyle = trunk;
    ctx.beginPath();
    ctx.roundRect(x - trunkWidth / 2, trunkTop + canopyR * 0.24, trunkWidth, trunkH - canopyR * 0.2 + 18, 7);
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
      { ox:  canopyR * 0.35, oy: canopyR * 0.1,  r: canopyR * 0.62 },
      { ox:  0,               oy: -canopyR * 0.1, r: canopyR * 0.78 },
      { ox: -canopyR * 0.15, oy: canopyR * 0.3,  r: canopyR * 0.52 },
      { ox:  canopyR * 0.2,  oy: canopyR * 0.28, r: canopyR * 0.48 },
      { ox:  canopyR * 0.08, oy: -canopyR * 0.42, r: canopyR * 0.48 },
    ];
    offsets.forEach((off, oi) => {
      const cx = x + off.ox;
      const cy = trunkTop + off.oy;
      const grad = ctx.createRadialGradient(cx - off.r * 0.2, cy - off.r * 0.2, off.r * 0.1, cx, cy, off.r);
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
    ctx.ellipse(x - canopyR * 0.15, trunkTop - canopyR * 0.15, canopyR * 0.4, canopyR * 0.22, -0.3, 0, Math.PI * 2);
    ctx.fill();

    /* hanging apples on this tree */
    game.hangingApples.forEach((apple) => {
      if (apple.treeIdx !== treeIdx || apple.picked) return;
      const ax = x + apple.ox * width;
      const ay = trunkTop + apple.oy * height;
      const appleR = isMainTree ? Math.max(8, canopyR * 0.085) : Math.max(6, canopyR * 0.075);

      /* tiny stem */
      ctx.strokeStyle = "#5a3a18";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ax, ay - 9);
      ctx.lineTo(ax + 2, ay - 15);
      ctx.stroke();

      /* apple body */
      const appleGrad = ctx.createRadialGradient(ax - appleR * 0.3, ay - appleR * 0.3, 2, ax, ay, appleR);
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
      ctx.arc(ax - appleR * 0.32, ay - appleR * 0.32, appleR * 0.3, 0, Math.PI * 2);
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
    ctx.quadraticCurveTo(x + (i % 2 ? 8 : -8), height - h * 0.55, x + (i % 3 - 1) * 6, height - h);
    ctx.stroke();
  }
}

/* ── reach guide arc ───────────────────────────────── */

function drawReachGuide(width, height) {
  const target = getTargetPoint(width, height);
  const origin = {
    x: width * 0.325,
    y: height * 0.535,
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
  ctx.translate(target.x - Math.cos(angle) * 42, target.y - Math.sin(angle) * 42);
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
  const pulse = 1 + Math.sin(performance.now() / 220) * 0.04 + game.targetHitFlash * 0.2;
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
  const appleBody = ctx.createRadialGradient(x - 6, y - 6, 4, x, y, baseR * pulse);
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
  ctx.ellipse(x, y - baseR * pulse + 4, 8 * pulse, 3 * pulse, 0, 0, Math.PI * 2);
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
  const footY = height * 0.84;
  const hip = { x: width * 0.222, y: footY - height * 0.1 };
  const shoulder = { x: width * 0.242, y: footY - height * 0.255 };
  const head = { x: shoulder.x - width * 0.008, y: shoulder.y - height * 0.06 };
  const bowGrip = { x: width * 0.325, y: shoulder.y + height * 0.018 };
  const drawHand = game.handFollow.visible
    ? { x: width * game.handFollow.x, y: height * game.handFollow.y }
    : bowGrip;

  ctx.fillStyle = "rgba(16, 32, 43, 0.2)";
  ctx.beginPath();
  ctx.ellipse(hip.x, footY + 8, width * 0.055, height * 0.021, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#20314a";
  ctx.lineWidth = Math.max(9, height * 0.014);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(hip.x - width * 0.012, hip.y + height * 0.075);
  ctx.lineTo(hip.x - width * 0.036, footY - height * 0.018);
  ctx.moveTo(hip.x + width * 0.018, hip.y + height * 0.076);
  ctx.lineTo(hip.x + width * 0.055, footY - height * 0.026);
  ctx.stroke();

  ctx.strokeStyle = "#13243a";
  ctx.lineWidth = Math.max(7, height * 0.011);
  ctx.beginPath();
  ctx.moveTo(hip.x - width * 0.048, footY);
  ctx.lineTo(hip.x - width * 0.015, footY - height * 0.006);
  ctx.moveTo(hip.x + width * 0.043, footY - height * 0.018);
  ctx.lineTo(hip.x + width * 0.088, footY - height * 0.018);
  ctx.stroke();

  const tunicTopY = shoulder.y - height * 0.004;
  const tunicBottomY = hip.y + height * 0.095;
  const tunic = ctx.createLinearGradient(shoulder.x - 44, tunicTopY, shoulder.x + 48, tunicBottomY);
  tunic.addColorStop(0, "#244b93");
  tunic.addColorStop(0.45, "#3f86cf");
  tunic.addColorStop(1, "#7ec0df");
  ctx.fillStyle = tunic;
  ctx.beginPath();
  ctx.moveTo(shoulder.x - width * 0.033, tunicTopY + 8);
  ctx.bezierCurveTo(shoulder.x - width * 0.045, tunicTopY + height * 0.05, shoulder.x - width * 0.043, tunicBottomY - 8, shoulder.x - width * 0.024, tunicBottomY);
  ctx.lineTo(shoulder.x + width * 0.034, tunicBottomY);
  ctx.bezierCurveTo(shoulder.x + width * 0.049, tunicBottomY - height * 0.052, shoulder.x + width * 0.045, tunicTopY + height * 0.045, shoulder.x + width * 0.025, tunicTopY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(17, 42, 74, 0.28)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(shoulder.x - width * 0.026, hip.y + height * 0.026);
  ctx.lineTo(shoulder.x + width * 0.036, hip.y + height * 0.02);
  ctx.stroke();

  ctx.fillStyle = "rgba(20, 35, 58, 0.92)";
  ctx.beginPath();
  ctx.roundRect(shoulder.x - width * 0.031, hip.y + height * 0.022, width * 0.07, height * 0.013, 5);
  ctx.fill();

  ctx.fillStyle = "#f2c39a";
  ctx.beginPath();
  ctx.roundRect(shoulder.x - width * 0.007, shoulder.y - height * 0.027, width * 0.016, height * 0.04, 5);
  ctx.fill();

  ctx.fillStyle = "#f2c39a";
  ctx.beginPath();
  ctx.arc(head.x, head.y, height * 0.027, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e8b283";
  ctx.beginPath();
  ctx.ellipse(head.x + height * 0.026, head.y + height * 0.002, height * 0.007, height * 0.01, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1b2638";
  ctx.beginPath();
  ctx.arc(head.x - height * 0.01, head.y - height * 0.008, height * 0.03, Math.PI * 0.55, Math.PI * 1.55);
  ctx.lineTo(head.x + height * 0.02, head.y + height * 0.03);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#10202b";
  ctx.beginPath();
  ctx.arc(head.x + height * 0.012, head.y - height * 0.002, Math.max(1.5, height * 0.003), 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#24417e";
  ctx.lineWidth = Math.max(7, height * 0.012);
  ctx.beginPath();
  ctx.moveTo(shoulder.x, shoulder.y + height * 0.015);
  ctx.lineTo(bowGrip.x, bowGrip.y);
  ctx.stroke();

  ctx.strokeStyle = "#f2c39a";
  ctx.lineWidth = Math.max(6, height * 0.01);
  ctx.beginPath();
  ctx.moveTo(bowGrip.x - width * 0.022, bowGrip.y);
  ctx.lineTo(bowGrip.x, bowGrip.y);
  ctx.stroke();

  ctx.strokeStyle = "#5b351e";
  ctx.lineWidth = Math.max(6, height * 0.01);
  ctx.beginPath();
  ctx.moveTo(shoulder.x - width * 0.006, shoulder.y + height * 0.027);
  ctx.quadraticCurveTo(shoulder.x - width * 0.034, shoulder.y + height * 0.006, shoulder.x - width * 0.058, shoulder.y + height * 0.032);
  ctx.stroke();

  ctx.strokeStyle = "#6e4b2c";
  ctx.lineWidth = Math.max(4, height * 0.008);
  ctx.beginPath();
  ctx.moveTo(bowGrip.x, bowGrip.y - height * 0.115);
  ctx.quadraticCurveTo(bowGrip.x + width * 0.03, bowGrip.y, bowGrip.x, bowGrip.y + height * 0.115);
  ctx.stroke();

  ctx.strokeStyle = "rgba(42, 31, 25, 0.82)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bowGrip.x, bowGrip.y - height * 0.115);
  ctx.quadraticCurveTo(bowGrip.x - width * 0.022, bowGrip.y, bowGrip.x, bowGrip.y + height * 0.115);
  ctx.stroke();

  const aimAngle = Math.atan2(target.y - bowGrip.y, target.x - bowGrip.x);
  const arrowBack = {
    x: bowGrip.x - Math.cos(aimAngle) * width * 0.05,
    y: bowGrip.y - Math.sin(aimAngle) * width * 0.05,
  };
  const arrowTip = {
    x: bowGrip.x + Math.cos(aimAngle) * width * 0.09,
    y: bowGrip.y + Math.sin(aimAngle) * width * 0.09,
  };

  ctx.strokeStyle = "#4c2e1e";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(arrowBack.x, arrowBack.y);
  ctx.lineTo(arrowTip.x, arrowTip.y);
  ctx.stroke();

  ctx.fillStyle = "#4c2e1e";
  ctx.save();
  ctx.translate(arrowTip.x, arrowTip.y);
  ctx.rotate(aimAngle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-14, -6);
  ctx.lineTo(-11, 0);
  ctx.lineTo(-14, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#f2c39a";
  ctx.beginPath();
  ctx.arc(bowGrip.x, bowGrip.y, Math.max(8, height * 0.014), 0, Math.PI * 2);
  ctx.fill();

  if (game.handFollow.visible) {
    ctx.strokeStyle = "rgba(255, 246, 190, 0.9)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(drawHand.x, drawHand.y, 22 + game.targetHitFlash * 16, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawPatient(width, height) {
  const fpvCanvas = document.getElementById("archerFpvCanvas");
  if (!fpvCanvas?.classList.contains("model-ready")) {
    drawArcher(width, height);
  }
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

  ctx.strokeStyle = game.trackingQuality.includes("Shoulder hike") ? "#d84b4b" : "#2fb56f";
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
    ctx.fillStyle = s.hue === "#fff"
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
  const basketGrad = ctx.createLinearGradient(bx - bw / 2, by, bx + bw / 2, by + bh);
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
    { ox: -14, oy: 12 }, { ox: 8, oy: 10 }, { ox: -4, oy: 20 },
    { ox: 16, oy: 22 }, { ox: -18, oy: 24 }, { ox: 6, oy: 30 },
    { ox: -10, oy: 32 }, { ox: 18, oy: 14 }, { ox: 0, oy: 8 },
    { ox: -22, oy: 16 }, { ox: 12, oy: 28 }, { ox: -6, oy: 14 },
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
      game.running = false;
      setFeedback("good", "Round complete!", `${game.basketApples} target hits`);
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
    setFeedback("neutral", "Mission active", "Raise your hand to draw and shoot");
  });
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
resetGame();
requestAnimationFrame(tick);
