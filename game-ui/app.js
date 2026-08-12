const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const motionCanvas = document.createElement("canvas");
const motionCtx = motionCanvas.getContext("2d", { willReadFrequently: true });

const MEDIAPIPE_TASKS_URL = "./node_modules/@mediapipe/tasks-vision/vision_bundle.mjs";
const MEDIAPIPE_WASM_URL = "./node_modules/@mediapipe/tasks-vision/wasm";
const POSE_MODEL_URL = "./assets/pose_landmarker.task";

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
  feedbackText: "Start camera to begin ROM tracking",
  droplets: [],
  plants: [
    { x: 0.2, growth: 0.28, hue: "#2fb56f" },
    { x: 0.38, growth: 0.42, hue: "#26a7c8" },
    { x: 0.56, growth: 0.34, hue: "#74b84a" },
    { x: 0.74, growth: 0.22, hue: "#f1a63a" },
  ],
};

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
    setFeedback("warn", "Almost", "Lift a little higher");
  } else if (payload.rep_status === "INVALID") {
    setFeedback("bad", "Reset", "Return to the start position");
  } else if (payload.audio_cue) {
    setFeedback("warn", "Adjust", payload.audio_cue);
  } else {
    updateFeedbackFromAngle(payload.visual_overlay_color);
  }
}

window.MoveWallGame = { receiveEdgePayload };

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
    setFeedback("good", "Pose AI ready", "Raise your hand toward the target");
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
    if (repStatus !== "VALID") setFeedback("warn", "Almost", "Reach the glowing target");
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
  game.droplets.push({ x: 0.76, y: 0.34, vy: 0.22, life: 1 });

  if (game.reps % 5 === 0) {
    game.targetRom = clamp(game.targetRom * 1.05, game.minTargetRom, game.maxTargetRom);
    game.level = Math.min(9, game.level + 1);
  }
  game.targetAcquired = false;

  const plant = game.plants[game.reps % game.plants.length];
  plant.growth = clamp(plant.growth + 0.08, 0.2, 1);
  setFeedback("good", "Great job", "Keep the movement smooth");
}

function setFeedback(kind, title, text) {
  game.feedbackKind = kind;
  game.feedbackTitle = title;
  game.feedbackText = text;
}

function updateFeedbackFromAngle(color) {
  if (color === "GREEN") setFeedback("good", "On target", "Hold the reach");
  else if (color === "YELLOW") setFeedback("warn", "Close", "A little higher");
  else setFeedback("bad", "Low ROM", "Reach toward the target");
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
  game.droplets = [];
  game.plants.forEach((plant, index) => {
    plant.growth = [0.28, 0.42, 0.34, 0.22][index];
  });
  setFeedback("neutral", "Ready", "Start camera to begin ROM tracking");
}

function draw() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);
  drawScene(width, height);
  drawReachGuide(width, height);
  drawPlants(width, height);
  drawTarget(width, height);
  drawPatient(width, height);
  drawPoseOverlay(width, height);
  drawDroplets(width, height);
}

function drawScene(width, height) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#8fd9f2");
  sky.addColorStop(0.44, "#d8f4e8");
  sky.addColorStop(1, "#fff0c8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255, 255, 255, 0.64)";
  for (let i = 0; i < 4; i += 1) {
    const x = width * (0.18 + i * 0.22);
    const y = height * (0.16 + (i % 2) * 0.06);
    ctx.beginPath();
    ctx.ellipse(x, y, 58, 20, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 42, y + 8, 52, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 44, y + 10, 40, 15, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.46)";
  ctx.beginPath();
  ctx.roundRect(width * 0.05, height * 0.19, width * 0.9, height * 0.34, 8);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.86)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i += 1) {
    const x = width * (0.08 + i * 0.17);
    ctx.beginPath();
    ctx.moveTo(x, height * 0.2);
    ctx.lineTo(x + width * 0.08, height * 0.52);
    ctx.stroke();
  }

  ctx.fillStyle = "#79bd8f";
  ctx.beginPath();
  ctx.moveTo(0, height * 0.57);
  ctx.bezierCurveTo(width * 0.24, height * 0.47, width * 0.46, height * 0.66, width * 0.68, height * 0.54);
  ctx.bezierCurveTo(width * 0.86, height * 0.45, width, height * 0.57, width, height * 0.55);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  const lawn = ctx.createLinearGradient(0, height * 0.6, 0, height);
  lawn.addColorStop(0, "#5dab68");
  lawn.addColorStop(1, "#2f7853");
  ctx.fillStyle = lawn;
  ctx.fillRect(0, height * 0.68, width, height * 0.32);

  const walkway = ctx.createLinearGradient(width * 0.28, height * 0.62, width * 0.42, height);
  walkway.addColorStop(0, "rgba(255, 236, 190, 0.7)");
  walkway.addColorStop(1, "rgba(233, 198, 142, 0.9)");
  ctx.fillStyle = walkway;
  ctx.beginPath();
  ctx.moveTo(width * 0.34, height * 0.68);
  ctx.bezierCurveTo(width * 0.45, height * 0.74, width * 0.5, height * 0.88, width * 0.56, height);
  ctx.lineTo(width * 0.25, height);
  ctx.bezierCurveTo(width * 0.32, height * 0.86, width * 0.32, height * 0.75, width * 0.29, height * 0.68);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i += 1) {
    const y = height * (0.72 + i * 0.034);
    ctx.beginPath();
    ctx.moveTo(width * 0.05, y);
    ctx.quadraticCurveTo(width * 0.5, y + 22, width * 0.95, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(16, 32, 43, 0.16)";
  for (let i = 0; i < 8; i += 1) {
    const x = (i / 7) * width;
    ctx.beginPath();
    ctx.ellipse(x, height * 0.83, width * 0.1, height * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

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

  ctx.strokeStyle = "rgba(108, 85, 217, 0.18)";
  ctx.lineWidth = 18;
  ctx.lineCap = "round";
  ctx.setLineDash([2, 28]);
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.quadraticCurveTo(width * 0.48, height * 0.32, target.x, target.y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(108, 85, 217, 0.1)";
  ctx.beginPath();
  ctx.arc(target.x, target.y, Math.max(72, height * 0.1), 0, Math.PI * 2);
  ctx.fill();
}

function drawPlants(width, height) {
  game.plants.forEach((plant, index) => {
    const x = plant.x * width;
    const ground = height * 0.82;
    const size = height * (0.12 + plant.growth * 0.12);

    ctx.fillStyle = "rgba(16, 32, 43, 0.16)";
    ctx.beginPath();
    ctx.ellipse(x, ground + 38, 58, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    const pot = ctx.createLinearGradient(x - 40, ground - 10, x + 40, ground + 42);
    pot.addColorStop(0, "#bf8158");
    pot.addColorStop(1, "#8f553b");
    ctx.fillStyle = pot;
    ctx.beginPath();
    ctx.roundRect(x - 34, ground - 10, 68, 48, 8);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    ctx.fillRect(x - 26, ground - 2, 52, 7);

    ctx.strokeStyle = "#315f42";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x, ground - 10);
    ctx.lineTo(x, ground - size);
    ctx.stroke();

    ctx.fillStyle = plant.hue;
    for (let leaf = 0; leaf < 6; leaf += 1) {
      const side = leaf % 2 === 0 ? -1 : 1;
      const y = ground - size + leaf * 18;
      ctx.beginPath();
      ctx.ellipse(x + side * (22 + leaf * 1.8), y, 28, 13, side * -0.58, 0, Math.PI * 2);
      ctx.fill();
    }

    if (plant.growth > 0.48) {
      ctx.fillStyle = index % 2 === 0 ? "#f7d65c" : "#ef7aa4";
      ctx.beginPath();
      ctx.arc(x, ground - size - 8, 9, 0, Math.PI * 2);
      ctx.arc(x - 10, ground - size - 2, 8, 0, Math.PI * 2);
      ctx.arc(x + 10, ground - size - 2, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    if (index === game.reps % game.plants.length) {
      ctx.strokeStyle = "rgba(241, 166, 58, 0.76)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, ground - size - 16, 22 + game.targetHitFlash * 16, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

function drawTarget(width, height) {
  const targetRatio = game.targetRom / game.maxTargetRom;
  const x = width * 0.76;
  const y = height * (0.72 - targetRatio * 0.48);
  const pulse = 1 + Math.sin(performance.now() / 190) * 0.08 + game.targetHitFlash * 0.4;

  const halo = ctx.createRadialGradient(x, y, 8, x, y, 74 * pulse);
  halo.addColorStop(0, "rgba(255, 227, 125, 0.62)");
  halo.addColorStop(0.5, "rgba(242, 173, 69, 0.22)");
  halo.addColorStop(1, "rgba(242, 173, 69, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, 78 * pulse, 0, Math.PI * 2);
  ctx.fill();

  const orb = ctx.createRadialGradient(x - 8, y - 10, 4, x, y, 34);
  orb.addColorStop(0, "#fff7c7");
  orb.addColorStop(0.42, "#f2ad45");
  orb.addColorStop(1, "#d77b28");
  ctx.fillStyle = orb;
  ctx.beginPath();
  ctx.arc(x, y, 26 * pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "white";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, 34 * pulse, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.54)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 52);
  ctx.lineTo(x, y - 88);
  ctx.stroke();

  ctx.fillStyle = "rgba(16, 32, 43, 0.72)";
  ctx.beginPath();
  ctx.roundRect(x - 64, y + 46, 128, 34, 8);
  ctx.fill();
  ctx.fillStyle = "white";
  ctx.font = "800 14px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${Math.round(game.targetRom)} deg target`, x, y + 68);
}

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

  ctx.strokeStyle = "rgba(16, 32, 43, 0.16)";
  ctx.lineWidth = 18;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.ellipse(hip.x, hip.y + 100, 82, 18, 0, 0, Math.PI * 2);
  ctx.stroke();

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

  const shirt = ctx.createLinearGradient(shoulder.x - 40, shoulder.y, shoulder.x + 52, hip.y);
  shirt.addColorStop(0, "#7c5ee2");
  shirt.addColorStop(1, "#26a7c8");
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.roundRect(shoulder.x - 36, shoulder.y - 6, 72, hip.y - shoulder.y + 18, 8);
  ctx.fill();

  ctx.fillStyle = "#f0b088";
  ctx.beginPath();
  ctx.arc(head.x, head.y, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#10202b";
  ctx.beginPath();
  ctx.arc(head.x - 6, head.y - 7, 30, Math.PI * 0.45, Math.PI * 1.55);
  ctx.fill();

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

  ctx.strokeStyle = game.feedbackKind === "bad" ? "#d84b4b" : game.feedbackKind === "warn" ? "#f1a63a" : "#2fb56f";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(shoulder.x, shoulder.y, 28, 0, Math.PI * 2);
  ctx.stroke();
}

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

function drawDroplets(width, height) {
  game.droplets.forEach((drop) => {
    drop.y += drop.vy * 12;
    drop.life -= 0.012;
    ctx.fillStyle = `rgba(38, 167, 200, ${Math.max(0, drop.life)})`;
    ctx.beginPath();
    ctx.arc(drop.x * width, drop.y * height, 8, 0, Math.PI * 2);
    ctx.fill();
  });
  game.droplets = game.droplets.filter((drop) => drop.life > 0);
}

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

function tick(now) {
  const dt = Math.min(0.05, (now - game.lastTick) / 1000);
  game.lastTick = now;

  if (game.running && !game.painStop) {
    game.timeRemaining = Math.max(0, game.timeRemaining - dt);
    if (game.timeRemaining <= 0 || game.reps >= game.repsGoal) {
      game.running = false;
      setFeedback("good", "Session complete", "Mission summary ready");
    }
  }

  game.targetHitFlash = Math.max(0, game.targetHitFlash - dt * 2.5);
  game.targetCooldown = Math.max(0, game.targetCooldown - dt);
  updateCameraMotion(dt);
  draw();
  syncHud();
  requestAnimationFrame(tick);
}

ui.startButton.addEventListener("click", async () => {
  const ready = await ensureCameraReady();
  if (!ready) return;
  game.running = true;
  game.painStop = false;
  setFeedback("neutral", "Mission active", "Raise your hand to water the plants");
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
