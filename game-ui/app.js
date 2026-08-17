const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const motionCanvas = document.createElement("canvas");
const motionCtx = motionCanvas.getContext("2d", { willReadFrequently: true });

const MEDIAPIPE_TASKS_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const MEDIAPIPE_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

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
};

/* ── apple tree data ───────────────────────────────── */

function makeTreeRow() {
  return [
    { x: 0.13, canopyR: 0.09, trunkH: 0.14, hue: "#3a8c3f" },
    { x: 0.34, canopyR: 0.11, trunkH: 0.17, hue: "#2f7a35" },
    { x: 0.58, canopyR: 0.10, trunkH: 0.15, hue: "#48993e" },
    { x: 0.80, canopyR: 0.12, trunkH: 0.18, hue: "#357a2e" },
  ];
}

function makeHangingApples() {
  return [
    { treeIdx: 0, ox: -0.03, oy: 0.02, picked: false },
    { treeIdx: 0, ox:  0.02, oy: 0.04, picked: false },
    { treeIdx: 1, ox: -0.04, oy: 0.01, picked: false },
    { treeIdx: 1, ox:  0.03, oy: 0.05, picked: false },
    { treeIdx: 1, ox:  0.00, oy: 0.03, picked: false },
    { treeIdx: 2, ox: -0.02, oy: 0.02, picked: false },
    { treeIdx: 2, ox:  0.04, oy: 0.04, picked: false },
    { treeIdx: 3, ox: -0.05, oy: 0.01, picked: false },
    { treeIdx: 3, ox:  0.02, oy: 0.03, picked: false },
    { treeIdx: 3, ox: -0.01, oy: 0.06, picked: false },
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
  lastVideoTime: -1,
  trackingQuality: "Waiting for camera",
  trackedSide: "right",
  posePoints: null,
  lostPoseFrames: 0,
  rawAngle: 20,
  targetAcquired: false,
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
  repsGoal: 12,
  angle: 20,
  targetRom: 70,
  maxTargetRom: 180,
  minTargetRom: 45,
  repState: "RESTING",
  peakAngle: 0,
  lastTick: performance.now(),
  targetHitFlash: 0,
  targetCooldown: 0,
  painStop: false,
  lastRepFrameId: null,
  feedbackKind: "neutral",
  feedbackTitle: "Ready",
  feedbackText: "Start camera to pick apples",
  /* mission-specific */
  trees: makeTreeRow(),
  hangingApples: makeHangingApples(),
  sparkles: [],
  fallingLeaves: [],
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
      success_rate: game.reps > 0 ? 1 : 0,
      arar: game.targetRom > 0 ? angle / game.targetRom : 0,
      consistency_bonus: 0.92,
      reps_in_current_set: game.reps % 5,
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
    setFeedback("warn", "Almost", "Reach a little higher for the apple");
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
    const visionTasks = await import(MEDIAPIPE_TASKS_URL);
    const vision = await visionTasks.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
    try {
      game.poseLandmarker = await createPoseLandmarker(visionTasks, vision, "GPU");
    } catch (gpuError) {
      console.warn("MoveWall GPU pose init failed, retrying CPU:", gpuError);
      game.poseLandmarker = await createPoseLandmarker(visionTasks, vision, "CPU");
    }
    game.poseReady = true;
    game.poseFallback = false;
    game.trackingQuality = "Pose AI ready";
    return true;
  } catch (error) {
    game.poseFallback = false;
    game.trackingQuality = "Pose AI unavailable";
    console.error("MoveWall pose model error:", error);
    return false;
  } finally {
    game.poseLoading = false;
  }
}

function createPoseLandmarker(visionTasks, vision, delegate) {
  return visionTasks.PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: POSE_MODEL_URL,
      delegate,
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.45,
    minPosePresenceConfidence: 0.45,
    minTrackingConfidence: 0.45,
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
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: false,
      });
    }
    ui.cameraPreview.srcObject = game.cameraStream;
    ui.cameraPreview.classList.add("visible");
    game.previousCameraFrame = null;
    game.cameraIdleTimer = 0;
    setFeedback("warn", "Camera ready", "Loading pose tracking");
    const poseReady = await ensurePoseLandmarker();
    if (!poseReady) {
      setFeedback("bad", "Pose AI unavailable", "Check local server and refresh");
      return false;
    }
    setFeedback("good", "Pose AI ready", "Raise your hand to pick the apple");
    return true;
  } catch (error) {
    setFeedback("bad", "Camera blocked", "Allow camera permission in the browser");
    console.error("MoveWall camera error:", error);
    return false;
  }
}

function updateCameraMotion(dt) {
  if (!game.running || game.mode !== "camera" || game.painStop) return;
  if (!ui.cameraPreview.videoWidth || !ui.cameraPreview.videoHeight) return;

  if (!game.poseReady || !game.poseLandmarker) {
    game.trackingQuality = game.poseLoading ? "Loading pose model" : "Pose AI unavailable";
    return;
  }

  updatePoseTracking();
}

function updatePoseTracking() {
  const video = ui.cameraPreview;
  if (video.currentTime === game.lastVideoTime) return;
  game.lastVideoTime = video.currentTime;

  const result = game.poseLandmarker.detectForVideo(video, performance.now());
  const landmarks = result?.landmarks?.[0];
  if (!landmarks) {
    handlePoseMiss("No full body detected", "Keep shoulder and hand visible");
    return;
  }

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
  updateHandFollow(estimate.points.wrist);
  game.rawAngle = estimate.angle;
  game.cameraAngle = stabilizeAngle(estimate.angle, game.cameraAngle);

  const payload = processLocalRep(game.cameraAngle);
  if (isHandOnTarget()) {
    payload.rep_status = "VALID";
    payload.peak_angle = Math.max(game.cameraAngle, game.targetRom);
  }
  if (estimate.compensation) {
    payload.audio_cue = "Lower your shoulder a bit";
    payload.visual_overlay_color = "RED";
  }
  receiveEdgePayload(payload);
}

function handlePoseMiss(title, text) {
  game.lostPoseFrames += 1;

  if (game.lostPoseFrames <= 6 && game.posePoints) {
    game.trackingQuality = "Tracking stable";
    return;
  }

  game.trackingQuality = title;
  setFeedback("warn", title, text);
}

function stabilizeAngle(rawAngle, previousAngle) {
  const diff = rawAngle - previousAngle;
  const absDiff = Math.abs(diff);

  if (absDiff < 0.9) return previousAngle;

  if (Math.abs(rawAngle - game.targetRom) <= 1.6 && Math.abs(previousAngle - game.targetRom) <= 4) {
    return game.targetRom;
  }

  const alpha = absDiff > 18 ? 0.86 : absDiff > 7 ? 0.72 : 0.48;
  return previousAngle + diff * alpha;
}

function getTargetColor(angle) {
  if (game.targetAcquired) {
    if (angle < game.targetRom - 4) game.targetAcquired = false;
  } else if (angle >= game.targetRom - 1.5) {
    game.targetAcquired = true;
  }

  if (game.targetAcquired) return "GREEN";
  if (angle >= game.targetRom * 0.72) return "YELLOW";
  return "RED";
}

function isHandOnTarget() {
  if (!game.handFollow.visible || game.targetCooldown > 0) return false;

  const targetX = 0.76;
  const targetY = 0.72 - (game.targetRom / game.maxTargetRom) * 0.48;
  const dx = game.handFollow.x - targetX;
  const dy = game.handFollow.y - targetY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < 0.075 && (game.targetAcquired || game.cameraAngle >= game.targetRom * 0.72);
}

function updateHandFollow(wrist) {
  const mirroredX = 1 - wrist.x;
  const targetX = clamp(mirroredX, 0.08, 0.92);
  const targetY = clamp(wrist.y, 0.12, 0.88);

  game.handFollow.x = game.handFollow.x * 0.28 + targetX * 0.72;
  game.handFollow.y = game.handFollow.y * 0.28 + targetY * 0.72;
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
  const confidence = Math.min(
    shoulder?.visibility ?? 1,
    elbow?.visibility ?? 1,
    wrist?.visibility ?? 1,
    hip?.visibility ?? 1,
  );

  if (!shoulder || !elbow || !wrist || !hip || confidence < 0.35) return null;

  const torsoUp = {
    x: shoulder.x - hip.x,
    y: shoulder.y - hip.y,
  };
  const arm = {
    x: wrist.x - shoulder.x,
    y: wrist.y - shoulder.y,
  };
  const angleFromTorso = angleBetweenVectors(torsoUp, arm);
  const angle = clamp(180 - angleFromTorso, 0, 180);
  const shoulderHike = oppositeShoulder
    ? shoulder.y < oppositeShoulder.y - 0.045 && angle < game.targetRom
    : false;

  return {
    side: ids.side,
    angle,
    compensation: shoulderHike,
    score: confidence * 100 + angle,
    points: {
      shoulder,
      elbow,
      wrist,
      hip,
    },
  };
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

function processLocalRep(angle) {
  let repJustCompleted = false;
  let repStatus = "NONE";
  let completedPeakAngle = game.peakAngle;

  if (game.repState === "RESTING" && angle > 28) {
    game.repState = "ASCENDING";
    game.peakAngle = angle;
  } else if (game.repState === "ASCENDING") {
    game.peakAngle = Math.max(game.peakAngle, angle);
    if (angle >= game.targetRom - 4) {
      game.repState = "PEAK_HOLD";
    }
  } else if (game.repState === "PEAK_HOLD") {
    game.peakAngle = Math.max(game.peakAngle, angle);
    if (angle < game.targetRom - 8) {
      game.repState = "DESCENDING";
    }
  } else if (game.repState === "DESCENDING" && angle < 24) {
    repJustCompleted = true;
    completedPeakAngle = game.peakAngle;
    repStatus = game.peakAngle >= game.targetRom ? "VALID" : game.peakAngle >= game.targetRom * 0.72 ? "PARTIAL" : "INVALID";
    if (repStatus !== "VALID") setFeedback("warn", "Almost", "Reach for the glowing apple");
    game.repState = "RESTING";
    game.peakAngle = 0;
  }

  return buildPayload(angle, repJustCompleted, repStatus, completedPeakAngle);
}

function completeRep(status, peakAngle) {
  if (status !== "VALID") return;

  game.reps = Math.min(game.repsGoal, game.reps + 1);
  game.score += Math.round(100 + Math.max(0, peakAngle - game.targetRom) * 4 + game.level * 12);
  game.targetHitFlash = 1;
  game.targetCooldown = 0.45;
  game.basketApples += 1;

  /* mark a random unpicked hanging apple as picked */
  const unpicked = game.hangingApples.filter((a) => !a.picked);
  if (unpicked.length > 0) {
    unpicked[Math.floor(Math.random() * unpicked.length)].picked = true;
  }

  /* spawn sparkles & leaves */
  for (let i = 0; i < 8; i += 1) {
    const a = Math.random() * Math.PI * 2;
    game.sparkles.push({
      x: 0.76,
      y: 0.72 - (game.targetRom / game.maxTargetRom) * 0.48,
      vx: Math.cos(a) * (0.06 + Math.random() * 0.08),
      vy: Math.sin(a) * (0.06 + Math.random() * 0.08),
      life: 1,
      size: 3 + Math.random() * 4,
      hue: Math.random() > 0.5 ? "#f5c842" : "#fff",
    });
  }
  for (let i = 0; i < 4; i += 1) {
    game.fallingLeaves.push({
      x: 0.76 + (Math.random() - 0.5) * 0.06,
      y: 0.72 - (game.targetRom / game.maxTargetRom) * 0.48,
      vx: (Math.random() - 0.5) * 0.02,
      vy: 0.04 + Math.random() * 0.03,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 3,
      life: 1,
    });
  }

  if (game.reps % 5 === 0) {
    game.targetRom = clamp(game.targetRom * 1.05, game.minTargetRom, game.maxTargetRom);
    game.level = Math.min(9, game.level + 1);
  }
  game.targetAcquired = false;

  setFeedback("good", "Apple picked! 🍎", "Great reach — keep it up");
}

/* ── feedback helpers ──────────────────────────────── */

function setFeedback(kind, title, text) {
  game.feedbackKind = kind;
  game.feedbackTitle = title;
  game.feedbackText = text;
}

function updateFeedbackFromAngle(color) {
  if (color === "GREEN") setFeedback("good", "On target", "Hold and grab the apple");
  else if (color === "YELLOW") setFeedback("warn", "Close", "Stretch a little higher");
  else setFeedback("bad", "Low ROM", "Reach toward the apple");
}

function getRomStatus() {
  if (!game.cameraStream) return "Waiting for camera";
  if (!game.running) return game.trackingQuality;
  if (game.trackingQuality.includes("Shoulder hike")) return "Compensation detected";
  if (game.targetAcquired) return "ROM target reached";
  if (game.angle >= game.targetRom * 0.72) return "ROM limited, keep reaching";
  return `${game.trackingQuality}: low ROM signal`;
}

function triggerPainStop() {
  game.painStop = true;
  game.running = false;
  game.targetRom = game.minTargetRom;
  setFeedback("bad", "Stopped", "Rest and contact your therapist");
}

function resetGame() {
  game.running = false;
  game.score = 0;
  game.timeRemaining = 90;
  game.level = 1;
  game.reps = 0;
  game.angle = 20;
  game.targetRom = 70;
  game.repState = "RESTING";
  game.peakAngle = 0;
  game.targetHitFlash = 0;
  game.targetCooldown = 0;
  game.painStop = false;
  game.lastRepFrameId = null;
  game.previousCameraFrame = null;
  game.cameraAngle = 20;
  game.cameraIdleTimer = 0;
  game.posePoints = null;
  game.lostPoseFrames = 0;
  game.rawAngle = 20;
  game.targetAcquired = false;
  game.handFollow = {
    x: 0.35,
    y: 0.55,
    visible: false,
  };
  game.sparkles = [];
  game.fallingLeaves = [];
  game.basketApples = 0;
  game.trees = makeTreeRow();
  game.hangingApples = makeHangingApples();
  setFeedback("neutral", "Ready", "Start camera to pick apples");
}

/* ══════════════════════════════════════════════════════
   DRAWING — Apple-orchard scene
   ══════════════════════════════════════════════════════ */

function draw() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);
  drawScene(width, height);
  drawTrees(width, height);
  drawReachGuide(width, height);
  drawAppleTarget(width, height);
  drawPatient(width, height);
  drawPoseOverlay(width, height);
  drawSparkles(width, height);
  drawFallingLeaves(width, height);
  drawBasket(width, height);
}

/* ── sky + ground ──────────────────────────────────── */

function drawScene(width, height) {
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
}

/* ── apple trees ───────────────────────────────────── */

function drawTrees(width, height) {
  const groundY = height * 0.58;

  game.trees.forEach((tree, treeIdx) => {
    const x = tree.x * width;
    const trunkH = tree.trunkH * height;
    const canopyR = tree.canopyR * height;
    const trunkTop = groundY - trunkH;

    /* shadow */
    ctx.fillStyle = "rgba(16, 32, 43, 0.12)";
    ctx.beginPath();
    ctx.ellipse(x, groundY + 8, 62, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    /* trunk */
    const trunk = ctx.createLinearGradient(x - 14, trunkTop, x + 14, groundY);
    trunk.addColorStop(0, "#8b6b3d");
    trunk.addColorStop(0.5, "#6b4226");
    trunk.addColorStop(1, "#4a2e18");
    ctx.fillStyle = trunk;
    ctx.beginPath();
    ctx.roundRect(x - 14, trunkTop + canopyR * 0.3, 28, trunkH - canopyR * 0.3 + 12, 6);
    ctx.fill();

    /* bark texture */
    ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
    ctx.lineWidth = 1;
    for (let b = 0; b < 4; b += 1) {
      const by = trunkTop + canopyR * 0.4 + b * (trunkH * 0.18);
      ctx.beginPath();
      ctx.moveTo(x - 8, by);
      ctx.quadraticCurveTo(x, by + 6, x + 8, by);
      ctx.stroke();
    }

    /* branches */
    ctx.strokeStyle = "#6b4226";
    ctx.lineWidth = 6;
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

      /* tiny stem */
      ctx.strokeStyle = "#5a3a18";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ax, ay - 9);
      ctx.lineTo(ax + 2, ay - 15);
      ctx.stroke();

      /* apple body */
      const appleGrad = ctx.createRadialGradient(ax - 3, ay - 3, 2, ax, ay, 10);
      appleGrad.addColorStop(0, "#ff6b6b");
      appleGrad.addColorStop(0.6, "#e03c3c");
      appleGrad.addColorStop(1, "#b22a2a");
      ctx.fillStyle = appleGrad;
      ctx.beginPath();
      ctx.arc(ax, ay, 9, 0, Math.PI * 2);
      ctx.fill();

      /* shine */
      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      ctx.beginPath();
      ctx.arc(ax - 3, ay - 3, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

/* ── reach guide arc ───────────────────────────────── */

function drawReachGuide(width, height) {
  const targetRatio = game.targetRom / game.maxTargetRom;
  const target = {
    x: width * 0.76,
    y: height * (0.72 - targetRatio * 0.48),
  };
  const origin = {
    x: width * 0.24,
    y: height * 0.52,
  };

  ctx.strokeStyle = "rgba(224, 60, 60, 0.14)";
  ctx.lineWidth = 18;
  ctx.lineCap = "round";
  ctx.setLineDash([2, 28]);
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.quadraticCurveTo(width * 0.48, height * 0.32, target.x, target.y);
  ctx.stroke();
  ctx.setLineDash([]);

  /* glow zone */
  ctx.fillStyle = "rgba(224, 60, 60, 0.07)";
  ctx.beginPath();
  ctx.arc(target.x, target.y, Math.max(72, height * 0.1), 0, Math.PI * 2);
  ctx.fill();
}

/* ── apple target (glowing apple the patient reaches for) ── */

function drawAppleTarget(width, height) {
  const targetRatio = game.targetRom / game.maxTargetRom;
  const x = width * 0.76;
  const y = height * (0.72 - targetRatio * 0.48);
  const pulse = 1 + Math.sin(performance.now() / 190) * 0.08 + game.targetHitFlash * 0.4;
  const baseR = 28;

  /* outer glow */
  const halo = ctx.createRadialGradient(x, y, 6, x, y, 82 * pulse);
  halo.addColorStop(0, "rgba(245, 200, 66, 0.55)");
  halo.addColorStop(0.4, "rgba(224, 60, 60, 0.2)");
  halo.addColorStop(1, "rgba(224, 60, 60, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, 86 * pulse, 0, Math.PI * 2);
  ctx.fill();

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

  /* white ring */
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, (baseR + 8) * pulse, 0, Math.PI * 2);
  ctx.stroke();

  /* label */
  ctx.fillStyle = "rgba(16, 32, 43, 0.78)";
  ctx.beginPath();
  ctx.roundRect(x - 60, y + 44, 120, 30, 8);
  ctx.fill();
  ctx.fillStyle = "white";
  ctx.font = "800 13px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${Math.round(game.targetRom)}° — Pick me!`, x, y + 64);
}

/* ── patient figure ────────────────────────────────── */

function drawPatient(width, height) {
  const hip = { x: width * 0.24, y: height * 0.74 };
  const shoulder = { x: hip.x, y: hip.y - height * 0.22 };
  const head = { x: shoulder.x, y: shoulder.y - 48 };
  const armLength = height * 0.24;
  const angleRad = ((game.angle - 20) / 140) * -1.5 + 0.35;
  const angleHand = {
    x: shoulder.x + Math.cos(angleRad) * armLength,
    y: shoulder.y + Math.sin(angleRad) * armLength,
  };
  const trackedHand = {
    x: width * game.handFollow.x,
    y: height * game.handFollow.y,
  };
  const hand = game.handFollow.visible ? trackedHand : angleHand;
  const elbow = {
    x: shoulder.x + (hand.x - shoulder.x) * 0.52,
    y: shoulder.y + (hand.y - shoulder.y) * 0.52 + 24,
  };

  /* shadow */
  ctx.strokeStyle = "rgba(16, 32, 43, 0.16)";
  ctx.lineWidth = 18;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.ellipse(hip.x, hip.y + 100, 82, 18, 0, 0, Math.PI * 2);
  ctx.stroke();

  /* skeleton */
  ctx.strokeStyle = "#17384a";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(shoulder.x, shoulder.y);
  ctx.moveTo(shoulder.x, shoulder.y);
  ctx.quadraticCurveTo(elbow.x, elbow.y, hand.x, hand.y);
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(hip.x - 30, hip.y + 92);
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(hip.x + 32, hip.y + 92);
  ctx.stroke();

  /* shirt */
  const shirt = ctx.createLinearGradient(shoulder.x - 40, shoulder.y, shoulder.x + 52, hip.y);
  shirt.addColorStop(0, "#7c5ee2");
  shirt.addColorStop(1, "#26a7c8");
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.roundRect(shoulder.x - 36, shoulder.y - 6, 72, hip.y - shoulder.y + 18, 8);
  ctx.fill();

  /* head */
  ctx.fillStyle = "#f0b088";
  ctx.beginPath();
  ctx.arc(head.x, head.y, 28, 0, Math.PI * 2);
  ctx.fill();

  /* hair */
  ctx.fillStyle = "#10202b";
  ctx.beginPath();
  ctx.arc(head.x - 6, head.y - 7, 30, Math.PI * 0.45, Math.PI * 1.55);
  ctx.fill();

  /* hand dot */
  ctx.fillStyle = "#6f50c9";
  ctx.beginPath();
  ctx.arc(hand.x, hand.y, 16, 0, Math.PI * 2);
  ctx.fill();

  if (game.handFollow.visible) {
    ctx.strokeStyle = "rgba(111, 80, 201, 0.34)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, 30 + game.targetHitFlash * 16, 0, Math.PI * 2);
    ctx.stroke();
  }

  /* shoulder ROM ring */
  ctx.strokeStyle = game.feedbackKind === "bad" ? "#d84b4b" : game.feedbackKind === "warn" ? "#f1a63a" : "#2fb56f";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(shoulder.x, shoulder.y, 28, 0, Math.PI * 2);
  ctx.stroke();
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
    ctx.fillText(`🍎 ${game.basketApples}`, bx, by + bh + 25);
  }
}

/* ── HUD sync ──────────────────────────────────────── */

function syncHud() {
  ui.score.textContent = String(game.score);
  ui.time.textContent = formatTime(game.timeRemaining);
  ui.level.textContent = String(game.level);
  ui.reps.textContent = String(game.reps);
  ui.rom.textContent = String(Math.round(game.angle));
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
    if (game.timeRemaining <= 0 || game.reps >= game.repsGoal) {
      game.running = false;
      setFeedback("good", "All apples picked! 🍎", `You collected ${game.basketApples} apples`);
    }
  }

  game.targetHitFlash = Math.max(0, game.targetHitFlash - dt * 2.5);
  game.targetCooldown = Math.max(0, game.targetCooldown - dt);
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
  setFeedback("neutral", "Mission active", "Raise your hand to pick the apples");
});

ui.pauseButton.addEventListener("click", () => {
  game.running = false;
  setFeedback("neutral", "Paused", "Session on hold");
});

ui.resetButton.addEventListener("click", resetGame);
ui.painButton.addEventListener("click", triggerPainStop);

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
resetGame();
requestAnimationFrame(tick);
