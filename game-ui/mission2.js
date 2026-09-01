/* ═══════════════════════════════════════════════════════════════
   MOVEWALL-AI  ·  Mission 2 – Restore the Garden
   Target terapeutik: shoulder flexion, reaching, motor control
   ═══════════════════════════════════════════════════════════════ */

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

/* ── MediaPipe sources (GPU → CDN fallback) ─────────────────── */
const MEDIAPIPE_SOURCES = [
  {
    bundle: "./node_modules/@mediapipe/tasks-vision/vision_bundle.mjs",
    wasm:   "./node_modules/@mediapipe/tasks-vision/wasm",
  },
  {
    bundle: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs",
    wasm:   "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
  },
];
const POSE_MODEL_URL    = "./assets/pose_landmarker.task";
const POSE_TARGET_FPS   = 30;
const POSE_FRAME_INTERVAL = 1000 / POSE_TARGET_FPS;

/* ── UI refs ─────────────────────────────────────────────────── */
const ui = {
  score:        document.getElementById("score"),
  time:         document.getElementById("time"),
  level:        document.getElementById("level"),
  reps:         document.getElementById("reps"),
  rom:          document.getElementById("rom"),
  target:       document.getElementById("target"),
  romStatus:    document.getElementById("romStatus"),
  feedback:     document.getElementById("feedback"),
  feedbackTitle:document.getElementById("feedbackTitle"),
  feedbackText: document.getElementById("feedbackText"),
  cameraPreview:document.getElementById("cameraPreview"),
  startButton:  document.getElementById("startButton"),
  pauseButton:  document.getElementById("pauseButton"),
  resetButton:  document.getElementById("resetButton"),
  painButton:   document.getElementById("painButton"),
};

/* ═══════════════════════════════════════════════════════════════
   POT / PLANT DATA
   ═══════════════════════════════════════════════════════════════ */

/**
 * 12 pot positions distributed across the wall at varying heights
 * and horizontal positions. Each pot requires a different shoulder
 * ROM to reach:
 *   x  — normalised horizontal [0..1]
 *   y  — normalised vertical   [0..1]  (lower y = higher on screen)
 *   requiredRom — approximate shoulder flexion needed (degrees)
 *   label — short direction hint shown in HUD
 */
function makePots() {
  return [
    // Row 1 – mid-height, spread across width
    { x: 0.18, y: 0.52, requiredRom:  65, watered: false, growPct: 0, waterParticles: [] },
    { x: 0.38, y: 0.48, requiredRom:  75, watered: false, growPct: 0, waterParticles: [] },
    { x: 0.62, y: 0.50, requiredRom:  70, watered: false, growPct: 0, waterParticles: [] },
    { x: 0.82, y: 0.46, requiredRom:  80, watered: false, growPct: 0, waterParticles: [] },
    // Row 2 – higher (more flexion required)
    { x: 0.25, y: 0.36, requiredRom:  95, watered: false, growPct: 0, waterParticles: [] },
    { x: 0.50, y: 0.32, requiredRom: 110, watered: false, growPct: 0, waterParticles: [] },
    { x: 0.74, y: 0.34, requiredRom: 100, watered: false, growPct: 0, waterParticles: [] },
    // Row 3 – overhead (high flexion / elevation)
    { x: 0.32, y: 0.22, requiredRom: 130, watered: false, growPct: 0, waterParticles: [] },
    { x: 0.58, y: 0.20, requiredRom: 145, watered: false, growPct: 0, waterParticles: [] },
    // Row 4 – low/lateral (to be reached later in session)
    { x: 0.14, y: 0.64, requiredRom:  55, watered: false, growPct: 0, waterParticles: [] },
    { x: 0.88, y: 0.60, requiredRom:  60, watered: false, growPct: 0, waterParticles: [] },
    { x: 0.70, y: 0.66, requiredRom:  50, watered: false, growPct: 0, waterParticles: [] },
  ];
}

/* ── Stars in sky (static, generated once) ──────────────────── */
const CLOUD_SEEDS = [
  { x: 0.08, y: 0.08, rx: 72, ry: 24 },
  { x: 0.35, y: 0.05, rx: 60, ry: 20 },
  { x: 0.62, y: 0.10, rx: 80, ry: 26 },
  { x: 0.85, y: 0.07, rx: 56, ry: 18 },
];

/* ═══════════════════════════════════════════════════════════════
   GAME STATE
   ═══════════════════════════════════════════════════════════════ */
const game = {
  running:       false,
  cameraStream:  null,
  poseLandmarker:null,
  poseLoading:   false,
  poseReady:     false,
  poseBackend:   "Not loaded",
  lastPoseAt:    0,
  poseBusy:      false,
  lastVideoTime: -1,
  trackingQuality: "Waiting for camera",
  posePoints:    null,
  lostPoseFrames:0,
  rawAngle:      20,
  controlAngle:  20,
  clinicalAngle: 20,
  displayAngle:  20,
  targetAcquired:false,
  handFollow:    { x: 0.5, y: 0.55, visible: false },
  cameraAngle:   20,
  score:         0,
  timeRemaining: 120,
  level:         1,
  reps:          0,
  repsGoal:      12,
  targetRom:     70,
  maxTargetRom:  180,
  minTargetRom:  45,
  repState:      "RESTING",
  peakAngle:     0,
  lastTick:      performance.now(),
  targetHitFlash:0,
  targetCooldown:0,
  painStop:      false,
  lastRepFrameId:null,
  feedbackKind:  "neutral",
  feedbackTitle: "Ready",
  feedbackText:  "Start camera to water the garden",
  /* mission-specific */
  pots:          makePots(),
  activePotIdx:  0,   // which pot is the current target
  waterStreamPct:0,   // 0‥1 animation for water stream on hit
  completedPots: 0,
};

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr  = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  canvas.width  = Math.round(rect.width  * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

function formatTime(s) {
  const safe = Math.max(0, Math.ceil(s));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

/* ═══════════════════════════════════════════════════════════════
   POSE / CAMERA  (identical infrastructure to Mission 1)
   ═══════════════════════════════════════════════════════════════ */
async function ensurePoseLandmarker() {
  if (game.poseReady) return true;
  if (game.poseLoading) return false;
  game.poseLoading = true;
  game.trackingQuality = "Loading pose model";
  try {
    const { visionTasks, vision, source } = await loadVisionTasks();
    try {
      game.poseLandmarker = await createPoseLandmarker(visionTasks, vision, "GPU");
    } catch {
      game.poseLandmarker = await createPoseLandmarker(visionTasks, vision, "CPU");
    }
    game.poseReady   = true;
    game.poseBackend = source;
    game.trackingQuality = `Pose AI ready (${source})`;
    return true;
  } catch (err) {
    game.poseBackend = "Unavailable";
    game.trackingQuality = "Pose AI unavailable";
    console.error("MoveWall M2 pose error:", err);
    return false;
  } finally {
    game.poseLoading = false;
  }
}

async function loadVisionTasks() {
  let lastErr;
  for (const src of MEDIAPIPE_SOURCES) {
    try {
      const visionTasks = await import(src.bundle);
      const vision = await visionTasks.FilesetResolver.forVisionTasks(src.wasm);
      return { visionTasks, vision, source: src.bundle.startsWith(".") ? "local" : "cdn" };
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

function createPoseLandmarker(vt, vision, delegate) {
  return vt.PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.45,
    minPosePresenceConfidence:  0.45,
    minTrackingConfidence:      0.45,
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
        video: { width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 30, max: 30 }, facingMode: "user" },
        audio: false,
      });
    }
    ui.cameraPreview.srcObject = game.cameraStream;
    ui.cameraPreview.classList.add("visible");
    await waitForVideoReady(ui.cameraPreview);
    game.lastPoseAt = 0;
    game.lastVideoTime = -1;
    setFeedback("warn", "Camera ready", "Loading pose tracking…");
    const ok = await ensurePoseLandmarker();
    if (!ok) { setFeedback("bad", "Pose AI unavailable", "Check local server and refresh"); return false; }
    setFeedback("good", "Pose AI ready", "Raise your hand toward a pot");
    return true;
  } catch (err) {
    setFeedback("bad", "Camera blocked", "Allow camera permission in the browser");
    console.error("MoveWall M2 camera error:", err);
    return false;
  }
}

function waitForVideoReady(video) {
  return new Promise((resolve) => {
    const done = () => { video.play().catch(() => {}); resolve(); };
    if (video.readyState >= 1 && video.videoWidth > 0) { done(); return; }
    video.addEventListener("loadedmetadata", done, { once: true });
  });
}

/* ── Pose tracking loop ──────────────────────────────────────── */
function updateCameraMotion() {
  if (!game.running || game.painStop) return;
  if (!ui.cameraPreview.videoWidth) return;
  if (!game.poseReady || !game.poseLandmarker) return;
  updatePoseTracking(performance.now());
}

function updatePoseTracking(now) {
  if (game.poseBusy || now - game.lastPoseAt < POSE_FRAME_INTERVAL) return;
  const video = ui.cameraPreview;
  if (video.currentTime === game.lastVideoTime) return;
  game.lastPoseAt   = now;
  game.lastVideoTime = video.currentTime;
  game.poseBusy = true;

  let result;
  try {
    result = game.poseLandmarker.detectForVideo(video, now);
  } catch (err) {
    game.trackingQuality = "Pose inference error";
    setFeedback("bad", "Tracking error", "Refresh the game and start camera again");
    return;
  } finally {
    game.poseBusy = false;
  }

  const landmarks = result?.landmarks?.[0];
  if (!landmarks) { handlePoseMiss("No body detected", "Keep shoulder and hand visible"); return; }

  const estimate = estimateArmRaiseRom(landmarks);
  if (!estimate)   { handlePoseMiss("Hand not visible", "Keep your wrist inside the camera"); return; }

  game.lostPoseFrames  = 0;
  game.trackingQuality = estimate.compensation ? "Shoulder hike detected" : `Tracking ${estimate.side} arm`;
  game.posePoints      = estimate.points;
  updateHandFollow(estimate.points.wrist);
  game.rawAngle     = estimate.controlAngle;
  game.controlAngle = estimate.controlAngle;
  game.displayAngle = estimate.controlAngle;
  game.clinicalAngle = stabilizeClinicalAngle(estimate.clinicalAngle, game.clinicalAngle);
  game.cameraAngle  = estimate.controlAngle;

  if (estimate.compensation) {
    setFeedback("warn", "Shoulder hike", "Lower your shoulder a bit");
  }

  checkPotHit();
}

function handlePoseMiss(title, text) {
  game.lostPoseFrames += 1;
  if (game.lostPoseFrames <= 6 && game.posePoints) { game.trackingQuality = "Tracking stable"; return; }
  game.handFollow.visible = false;
  game.trackingQuality = title;
  setFeedback("warn", title, text);
}

function stabilizeClinicalAngle(raw, prev) {
  const diff = raw - prev, abs = Math.abs(diff);
  if (abs < 0.8) return prev;
  if (Math.abs(raw - game.targetRom) <= 1.8 && Math.abs(prev - game.targetRom) <= 4) return game.targetRom;
  const alpha = abs > 18 ? 0.62 : abs > 7 ? 0.48 : 0.32;
  return prev + diff * alpha;
}

/* ── Arm ROM estimation (same as Mission 1) ──────────────────── */
function estimateArmRaiseRom(landmarks) {
  const right = estimateSideRom(landmarks, { side: "right", shoulder: 12, elbow: 14, wrist: 16, hip: 24, oppositeShoulder: 11 });
  const left  = estimateSideRom(landmarks, { side: "left",  shoulder: 11, elbow: 13, wrist: 15, hip: 23, oppositeShoulder: 12 });
  const candidates = [right, left].filter(Boolean);
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

function estimateSideRom(landmarks, ids) {
  const shoulder = landmarks[ids.shoulder];
  const elbow    = landmarks[ids.elbow];
  const wrist    = landmarks[ids.wrist];
  const hip      = landmarks[ids.hip];
  const opp      = landmarks[ids.oppositeShoulder];
  const conf = Math.min(shoulder?.visibility ?? 1, wrist?.visibility ?? 1, hip?.visibility ?? 1);
  if (!shoulder || !wrist || !hip || conf < 0.28) return null;

  const torsoUp = { x: shoulder.x - hip.x, y: shoulder.y - hip.y };
  const arm     = { x: wrist.x - shoulder.x, y: wrist.y - shoulder.y };
  const angleFromTorso = angleBetween(torsoUp, arm);
  const clinicalAngle  = elbow ? clamp(180 - angleFromTorso, 0, 180) : game.clinicalAngle;
  const torsoLen   = Math.max(0.08, Math.hypot(torsoUp.x, torsoUp.y));
  const wristHeight = (shoulder.y - wrist.y) / torsoLen;
  const controlAngle = clamp(wristHeight * 86 + 48, 0, 180);
  const shoulderHike = opp ? shoulder.y < opp.y - 0.045 && controlAngle < game.targetRom : false;

  return {
    side: ids.side, angle: controlAngle, controlAngle, clinicalAngle,
    compensation: shoulderHike, score: conf * 100 + controlAngle,
    points: { shoulder, elbow, wrist, hip },
  };
}

function angleBetween(a, b) {
  const mA = Math.hypot(a.x, a.y), mB = Math.hypot(b.x, b.y);
  if (mA < 1e-5 || mB < 1e-5) return 180;
  return Math.acos(clamp((a.x * b.x + a.y * b.y) / (mA * mB), -1, 1)) * 180 / Math.PI;
}

function updateHandFollow(wrist) {
  const mx = clamp(1 - wrist.x, 0.08, 0.92);
  const my = clamp(wrist.y, 0.12, 0.88);
  game.handFollow.x = game.handFollow.x * 0.12 + mx * 0.88;
  game.handFollow.y = game.handFollow.y * 0.12 + my * 0.88;
  game.handFollow.visible = true;
}

/* ═══════════════════════════════════════════════════════════════
   MISSION 2 GAME LOGIC – Pot / Watering
   ═══════════════════════════════════════════════════════════════ */

/** Returns the active pot, or null if all watered */
function getActivePot() {
  for (let i = game.activePotIdx; i < game.pots.length; i++) {
    if (!game.pots[i].watered) { game.activePotIdx = i; return game.pots[i]; }
  }
  return null;
}

/** Check if the patient's hand is close enough to the active pot */
function checkPotHit() {
  if (!game.handFollow.visible || game.targetCooldown > 0) return;
  const pot = getActivePot();
  if (!pot) return;

  // Dynamic target: set game.targetRom to this pot's required ROM
  game.targetRom = pot.requiredRom;

  const dx = game.handFollow.x - pot.x;
  const dy = game.handFollow.y - pot.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Proximity hit (hand near pot) AND sufficient ROM
  if (dist < 0.09 && game.cameraAngle >= pot.requiredRom * 0.9) {
    waterPot(pot);
  } else if (game.cameraAngle >= pot.requiredRom * 0.72) {
    setFeedback("warn", "Almost!", "Move your hand closer to the glowing pot");
  } else {
    const dir = pot.y < 0.38 ? "higher" : "forward";
    setFeedback("bad", "Reach further", `Raise your arm ${dir} toward the pot`);
  }
}

function waterPot(pot) {
  pot.watered = true;
  game.completedPots += 1;
  game.reps = Math.min(game.repsGoal, game.completedPots);
  game.score += Math.round(120 + Math.max(0, game.cameraAngle - pot.requiredRom) * 3 + game.level * 15);
  game.targetHitFlash = 1;
  game.targetCooldown = 0.8;
  game.waterStreamPct = 0;

  // Spawn water particles at pot location
  for (let i = 0; i < 14; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.9;
    pot.waterParticles.push({
      x: pot.x, y: pot.y,
      vx: Math.cos(angle) * (0.012 + Math.random() * 0.018),
      vy: Math.sin(angle) * (0.012 + Math.random() * 0.018) + 0.008,
      life: 1,
      size: 3 + Math.random() * 4,
    });
  }

  // Level up every 3 pots
  if (game.completedPots % 3 === 0) {
    game.level = Math.min(9, game.level + 1);
  }

  // Advance to next unwanted pot
  game.activePotIdx += 1;

  setFeedback("good", "Watered! 🌿", "Great reach — next pot is glowing");

  if (game.reps >= game.repsGoal) {
    game.running = false;
    setFeedback("good", "Garden restored! 🌸", `All ${game.completedPots} pots watered`);
  }
}

/* ═══════════════════════════════════════════════════════════════
   DRAWING — Garden scene
   ═══════════════════════════════════════════════════════════════ */

function draw() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);
  drawGardenScene(W, H);
  drawGardenProgress(W, H);
  drawFence(W, H);
  drawPots(W, H);
  drawHandCursor(W, H);
  drawWaterParticles(W, H);
}

/* ── Sky + ground ────────────────────────────────────────────── */
function drawGardenScene(W, H) {
  // Sky — warm late-afternoon gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.6);
  sky.addColorStop(0,   "#a8d8f0");
  sky.addColorStop(0.45,"#d4eef9");
  sky.addColorStop(0.75,"#f0f9e4");
  sky.addColorStop(1,   "#c8e6a0");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Clouds
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  CLOUD_SEEDS.forEach(({ x, y, rx, ry }) => {
    ctx.beginPath();
    ctx.ellipse(W * x, H * y, rx, ry, 0, 0, Math.PI * 2);
    ctx.ellipse(W * x + rx * 0.6, H * y + ry * 0.3, rx * 0.75, ry * 0.75, 0, 0, Math.PI * 2);
    ctx.ellipse(W * x - rx * 0.55, H * y + ry * 0.35, rx * 0.6, ry * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // Sun (top-right)
  const sx = W * 0.92, sy = H * 0.09;
  const sunGlow = ctx.createRadialGradient(sx, sy, 10, sx, sy, 110);
  sunGlow.addColorStop(0, "rgba(255,248,180,0.95)");
  sunGlow.addColorStop(0.4,"rgba(255,228,100,0.30)");
  sunGlow.addColorStop(1, "rgba(255,228,100,0)");
  ctx.fillStyle = sunGlow;
  ctx.beginPath(); ctx.arc(sx, sy, 110, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff8d4";
  ctx.beginPath(); ctx.arc(sx, sy, 26, 0, Math.PI * 2); ctx.fill();

  // Distant rolling hills
  ctx.fillStyle = "#a8d47a";
  ctx.beginPath();
  ctx.moveTo(0, H * 0.55);
  ctx.bezierCurveTo(W * 0.2, H * 0.44, W * 0.45, H * 0.52, W * 0.6, H * 0.46);
  ctx.bezierCurveTo(W * 0.78, H * 0.38, W * 0.92, H * 0.50, W, H * 0.48);
  ctx.lineTo(W, H * 0.62); ctx.lineTo(0, H * 0.62); ctx.closePath();
  ctx.fill();

  // Main lawn
  const lawn = ctx.createLinearGradient(0, H * 0.56, 0, H);
  lawn.addColorStop(0, "#6ac44a");
  lawn.addColorStop(0.35,"#58b038");
  lawn.addColorStop(1,  "#3a7a26");
  ctx.fillStyle = lawn;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.60);
  ctx.bezierCurveTo(W * 0.25, H * 0.55, W * 0.55, H * 0.63, W * 0.8, H * 0.57);
  ctx.bezierCurveTo(W * 0.92, H * 0.54, W, H * 0.59, W, H * 0.58);
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
  ctx.fill();

  // Lawn stripe texture
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    const ly = H * (0.63 + i * 0.035);
    ctx.beginPath();
    ctx.moveTo(0, ly);
    ctx.quadraticCurveTo(W * 0.5, ly + 12, W, ly);
    ctx.stroke();
  }

  // Garden bed border (brown strip along bottom-centre)
  const bed = ctx.createLinearGradient(0, H * 0.76, 0, H * 0.82);
  bed.addColorStop(0, "rgba(140,90,40,0.55)");
  bed.addColorStop(1, "rgba(100,60,20,0.75)");
  ctx.fillStyle = bed;
  ctx.beginPath();
  ctx.moveTo(W * 0.08, H * 0.78);
  ctx.bezierCurveTo(W * 0.28, H * 0.76, W * 0.72, H * 0.76, W * 0.92, H * 0.78);
  ctx.lineTo(W * 0.92, H * 0.84);
  ctx.bezierCurveTo(W * 0.72, H * 0.82, W * 0.28, H * 0.82, W * 0.08, H * 0.84);
  ctx.closePath();
  ctx.fill();
}

/* ── Fence ───────────────────────────────────────────────────── */
function drawGardenProgress(W, H) {
  if (W < 760) return;

  const total = game.pots.length;
  const done = game.pots.filter((pot) => pot.watered).length;
  const x = W * 0.34;
  const y = H * 0.075;
  const w = Math.min(360, W * 0.34);
  const h = 10;

  ctx.fillStyle = "rgba(16,32,43,0.22)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();

  const fillW = total > 0 ? (done / total) * w : 0;
  const bar = ctx.createLinearGradient(x, y, x + w, y);
  bar.addColorStop(0, "#21a36c");
  bar.addColorStop(1, "#47b8e8");
  ctx.fillStyle = bar;
  ctx.beginPath();
  if (fillW > 0) {
    ctx.roundRect(x, y, Math.max(10, fillW), h, 8);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "800 11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${done}/${total}`, x + w + 28, y + h);
}

function drawFence(W, H) {
  const y0 = H * 0.74;
  // Horizontal rails
  ctx.strokeStyle = "#b8915a";
  ctx.lineWidth = 5;
  [0, 14].forEach((off) => {
    ctx.beginPath();
    ctx.moveTo(W * 0.06, y0 + off);
    ctx.lineTo(W * 0.94, y0 + off);
    ctx.stroke();
  });
  // Vertical pickets
  ctx.strokeStyle = "#c8a06a";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  for (let i = 0; i < 20; i++) {
    const fx = W * (0.06 + i * 0.046);
    ctx.beginPath();
    ctx.moveTo(fx, y0 - 22);
    ctx.lineTo(fx, y0 + 22);
    ctx.stroke();
  }
}

/* ── Pot drawing ─────────────────────────────────────────────── */
function drawPots(W, H) {
  const activePot = getActivePot();
  const now = performance.now();

  game.pots.forEach((pot, idx) => {
    const px = pot.x * W;
    const py = pot.y * H;

    const isActive  = pot === activePot;
    const isWatered = pot.watered;

    // Grow animation
    if (isWatered && pot.growPct < 1) {
      pot.growPct = Math.min(1, pot.growPct + 0.012);
    }

    /* ── Pot body ── */
    const potW = 32, potH = 26;
    const gradient = ctx.createLinearGradient(px - potW / 2, py, px + potW / 2, py + potH);
    if (isWatered) {
      gradient.addColorStop(0, "#d4774a");
      gradient.addColorStop(1, "#8b4a28");
    } else {
      gradient.addColorStop(0, "#c4634a");
      gradient.addColorStop(1, "#7a3820");
    }
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(px - potW / 2, py);
    ctx.lineTo(px - potW * 0.36, py + potH);
    ctx.lineTo(px + potW * 0.36, py + potH);
    ctx.lineTo(px + potW / 2, py);
    ctx.closePath();
    ctx.fill();

    // Pot rim
    ctx.strokeStyle = isWatered ? "#e08855" : "#c46040";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(px - potW / 2 - 2, py);
    ctx.lineTo(px + potW / 2 + 2, py);
    ctx.stroke();

    // Soil
    ctx.fillStyle = isWatered ? "#5a3a1a" : "#3e2210";
    ctx.beginPath();
    ctx.ellipse(px, py + 3, potW * 0.42, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    /* ── Plant (wilted if not watered, growing if watered) ── */
    if (!isWatered) {
      // Wilted plant – drooping stem
      ctx.strokeStyle = "#7a9e3a";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.bezierCurveTo(px + 6, py - 12, px + 2, py - 20, px - 4, py - 22);
      ctx.stroke();
      ctx.fillStyle = "#8aaf4a";
      ctx.beginPath();
      ctx.ellipse(px - 4, py - 22, 7, 4, -0.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Growing plant
      const h = pot.growPct * 48;
      ctx.strokeStyle = "#3a9a2a";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.bezierCurveTo(px - 4, py - h * 0.3, px + 6, py - h * 0.6, px, py - h);
      ctx.stroke();
      // Leaves
      if (pot.growPct > 0.3) {
        const lAlpha = Math.min(1, (pot.growPct - 0.3) / 0.4);
        ctx.globalAlpha = lAlpha;
        ctx.fillStyle = "#4ac83a";
        [[px - 18, py - h * 0.55, 0.6], [px + 16, py - h * 0.7, -0.5], [px - 12, py - h, 0.8]].forEach(([lx, ly, rot]) => {
          ctx.save(); ctx.translate(lx, ly); ctx.rotate(rot);
          ctx.beginPath(); ctx.ellipse(0, 0, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });
        // Flower at top
        if (pot.growPct > 0.7) {
          const fAlpha = Math.min(1, (pot.growPct - 0.7) / 0.3);
          ctx.globalAlpha = fAlpha;
          ctx.fillStyle = "#f5c842";
          ctx.beginPath(); ctx.arc(px, py - h, 8, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#f06050";
          for (let p = 0; p < 6; p++) {
            const pa = (p / 6) * Math.PI * 2;
            ctx.beginPath(); ctx.arc(px + Math.cos(pa) * 10, py - h + Math.sin(pa) * 10, 5, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      }
    }

    /* ── Active pot glow + label ── */
    if (isActive && !isWatered) {
      const pulse = 1 + Math.sin(now / 250) * 0.06;
      const glow = ctx.createRadialGradient(px, py - 10, 5, px, py - 10, 55 * pulse);
      glow.addColorStop(0, "rgba(100,220,255,0.45)");
      glow.addColorStop(0.5,"rgba(60,180,255,0.18)");
      glow.addColorStop(1, "rgba(60,180,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(px, py - 10, 58 * pulse, 0, Math.PI * 2); ctx.fill();

      // Outer ring
      ctx.strokeStyle = `rgba(80,200,255,${0.55 + Math.sin(now / 250) * 0.2})`;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.arc(px, py - 10, 44 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

    }

    /* ── Watered checkmark ── */
    if (isActive && !isWatered) {
      ctx.fillStyle = "rgba(16,32,43,0.86)";
      ctx.beginPath();
      ctx.roundRect(px - 43, py + potH + 8, 86, 24, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "800 11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${pot.requiredRom} deg`, px, py + potH + 24);
    }

    if (isWatered && pot.growPct >= 0.95) {
      ctx.fillStyle = "rgba(26,158,85,0.88)";
      ctx.beginPath(); ctx.arc(px + 18, py - 30, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(px + 13, py - 30); ctx.lineTo(px + 17, py - 25); ctx.lineTo(px + 24, py - 36);
      ctx.stroke();
    }
  });
}

/* ── Water particles ─────────────────────────────────────────── */
function drawWaterParticles(W, H) {
  game.pots.forEach((pot) => {
    pot.waterParticles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.002;
      p.life -= 0.022;
      const alpha = Math.max(0, p.life);
      ctx.fillStyle = `rgba(80,180,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    });
    pot.waterParticles = pot.waterParticles.filter((p) => p.life > 0);
  });
}

/* ── Hand cursor ─────────────────────────────────────────────── */
function drawHandCursor(W, H) {
  if (!game.handFollow.visible) return;
  const hx = game.handFollow.x * W;
  const hy = game.handFollow.y * H;
  const pulse = 1 + Math.sin(performance.now() / 200) * 0.06;

  // Outer glow
  const glow = ctx.createRadialGradient(hx, hy, 4, hx, hy, 38 * pulse);
  glow.addColorStop(0, "rgba(100,220,255,0.50)");
  glow.addColorStop(1, "rgba(100,220,255,0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(hx, hy, 40 * pulse, 0, Math.PI * 2); ctx.fill();

  // Ring
  ctx.strokeStyle = `rgba(255,255,255,${0.80 + game.targetHitFlash * 0.2})`;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(hx, hy, 18 + game.targetHitFlash * 10, 0, Math.PI * 2); ctx.stroke();

  // Inner dot
  ctx.fillStyle = "rgba(100,220,255,0.90)";
  ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2); ctx.fill();
}

/* ═══════════════════════════════════════════════════════════════
   HUD + FEEDBACK
   ═══════════════════════════════════════════════════════════════ */
function setFeedback(kind, title, text) {
  game.feedbackKind  = kind;
  game.feedbackTitle = title;
  game.feedbackText  = text;
}

function getRomStatus() {
  if (!game.cameraStream) return "Waiting for camera";
  if (!game.running) return game.trackingQuality;
  const clinical = Math.round(game.clinicalAngle);
  const pot = getActivePot();
  if (!pot) return "All pots watered!";
  if (game.cameraAngle >= pot.requiredRom) return `Target reached | clinical ${clinical}°`;
  if (game.cameraAngle >= pot.requiredRom * 0.72) return `Keep reaching | clinical ${clinical}°`;
  return `${game.trackingQuality} | raise arm | clinical ${clinical}°`;
}

function syncHud() {
  ui.score.textContent = String(game.score);
  ui.time.textContent  = formatTime(game.timeRemaining);
  ui.level.textContent = String(game.level);
  ui.reps.textContent  = String(game.reps);
  ui.rom.textContent   = String(Math.round(game.displayAngle));
  ui.target.textContent = `Target ${Math.round(game.targetRom)}`;
  ui.romStatus.textContent = getRomStatus();
  ui.feedback.className = `feedback ${game.feedbackKind}`;
  ui.feedbackTitle.textContent = game.feedbackTitle;
  ui.feedbackText.textContent  = game.feedbackText;
}

/* ═══════════════════════════════════════════════════════════════
   RESET
   ═══════════════════════════════════════════════════════════════ */
function resetGame() {
  game.running        = false;
  game.score          = 0;
  game.timeRemaining  = 120;
  game.level          = 1;
  game.reps           = 0;
  game.controlAngle   = 20;
  game.clinicalAngle  = 20;
  game.displayAngle   = 20;
  game.rawAngle       = 20;
  game.cameraAngle    = 20;
  game.targetRom      = 70;
  game.repState       = "RESTING";
  game.peakAngle      = 0;
  game.targetHitFlash = 0;
  game.targetCooldown = 0;
  game.painStop       = false;
  game.lastRepFrameId = null;
  game.posePoints     = null;
  game.lostPoseFrames = 0;
  game.lastPoseAt     = 0;
  game.poseBusy       = false;
  game.handFollow     = { x: 0.5, y: 0.55, visible: false };
  game.targetAcquired = false;
  game.pots           = makePots();
  game.activePotIdx   = 0;
  game.completedPots  = 0;
  game.waterStreamPct = 0;
  setFeedback("neutral", "Ready", "Start camera to water the garden");
}

/* ═══════════════════════════════════════════════════════════════
   MAIN LOOP
   ═══════════════════════════════════════════════════════════════ */
function tick(now) {
  const dt = Math.min(0.05, (now - game.lastTick) / 1000);
  game.lastTick = now;

  if (game.running && !game.painStop) {
    game.timeRemaining = Math.max(0, game.timeRemaining - dt);
    if (game.timeRemaining <= 0 || game.reps >= game.repsGoal) {
      game.running = false;
      setFeedback("good", "Session complete! 🌸", `${game.completedPots} pots watered`);
    }
  }

  game.targetHitFlash = Math.max(0, game.targetHitFlash - dt * 2.5);
  game.targetCooldown = Math.max(0, game.targetCooldown - dt);

  updateCameraMotion();
  draw();
  syncHud();
  requestAnimationFrame(tick);
}

/* ═══════════════════════════════════════════════════════════════
   CONTROLS
   ═══════════════════════════════════════════════════════════════ */
ui.startButton.addEventListener("click", async () => {
  const ok = await ensureCameraReady();
  if (!ok) return;
  game.running  = true;
  game.painStop = false;
  setFeedback("neutral", "Mission active 🌿", "Reach toward the glowing pot");
});

ui.pauseButton.addEventListener("click", () => {
  game.running = false;
  setFeedback("neutral", "Paused", "Session on hold");
});

ui.resetButton.addEventListener("click", resetGame);
ui.painButton.addEventListener("click", () => {
  game.painStop = true;
  game.running  = false;
  game.targetRom = game.minTargetRom;
  setFeedback("bad", "Stopped", "Rest and contact your therapist");
});

/* ── Expose edge payload bridge (compatible with Mission 1 API) ── */
function receiveEdgePayload(payload) {
  if (!payload || typeof payload.current_angle !== "number") return;
  game.controlAngle  = clamp(payload.current_angle, 0, 180);
  game.displayAngle  = game.controlAngle;
  game.cameraAngle   = game.controlAngle;
  const pot = getActivePot();
  if (pot) game.targetRom = pot.requiredRom;
}
window.MoveWallGame = { receiveEdgePayload };

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
resetGame();
requestAnimationFrame(tick);
