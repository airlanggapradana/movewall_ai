/* ═══════════════════════════════════════════════════════════════
   MOVEWALL-AI  ·  Mission 3 – Hang the Lantern
   Target terapeutik: elevasi bahu, abduksi/scaption, directional reaching
   ═══════════════════════════════════════════════════════════════ */

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

/* ── MediaPipe sources ───────────────────────────────────────── */
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
const POSE_MODEL_URL  = "./assets/pose_landmarker.task";
const POSE_TARGET_FPS = 30;
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
   LANTERN POSITION DATA
   Multi-directional targets to train elevation, flexion, abduction.

   x, y   — normalised canvas position (0..1)
   hook   — tip of wooden post where lantern hangs
   reqRom — approximate shoulder ROM needed
   dir    — "front", "lateral-L", "lateral-R", "overhead"
   ═══════════════════════════════════════════════════════════════ */
function makeLanternQueue() {
  // 10 targets; shuffled randomly each game
  const templates = [
    { x: 0.50, y: 0.26, reqRom: 140, dir: "overhead"   },  // straight up
    { x: 0.72, y: 0.30, reqRom: 120, dir: "front-R"    },  // front-right high
    { x: 0.28, y: 0.30, reqRom: 115, dir: "front-L"    },  // front-left high
    { x: 0.85, y: 0.42, reqRom:  90, dir: "lateral-R"  },  // lateral right
    { x: 0.15, y: 0.42, reqRom:  85, dir: "lateral-L"  },  // lateral left
    { x: 0.50, y: 0.38, reqRom: 100, dir: "front"      },  // straight front
    { x: 0.65, y: 0.20, reqRom: 155, dir: "overhead-R" },  // overhead right
    { x: 0.35, y: 0.22, reqRom: 150, dir: "overhead-L" },  // overhead left
    { x: 0.80, y: 0.52, reqRom:  70, dir: "mid-R"      },  // mid lateral right
    { x: 0.20, y: 0.52, reqRom:  65, dir: "mid-L"      },  // mid lateral left
  ];

  // Shuffle
  for (let i = templates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [templates[i], templates[j]] = [templates[j], templates[i]];
  }

  return templates.map((t) => ({
    ...t,
    hung:           false,
    burstParticles: [],
    glowPct:        0,   // 0 → 1 as ROM approaches target (preview glow)
    hungPct:        0,   // 0 → 1 grow-in animation after hung
    swingOffset:    (Math.random() - 0.5) * 0.15, // slight initial swing phase
  }));
}

/* ── Static star field (generated once) ────────────────────── */
const STARS = Array.from({ length: 80 }, () => ({
  x: Math.random(),
  y: Math.random() * 0.55,
  r: 0.5 + Math.random() * 1.5,
  phase: Math.random() * Math.PI * 2,
}));

/* ── Wooden post positions (visual hooks) ─────────────────────*/
const POST_POSITIONS = [0.15, 0.30, 0.50, 0.70, 0.85];

/* ═══════════════════════════════════════════════════════════════
   GAME STATE
   ═══════════════════════════════════════════════════════════════ */
const game = {
  running:        false,
  cameraStream:   null,
  poseLandmarker: null,
  poseLoading:    false,
  poseReady:      false,
  poseBackend:    "Not loaded",
  lastPoseAt:     0,
  poseBusy:       false,
  lastVideoTime:  -1,
  trackingQuality:"Waiting for camera",
  posePoints:     null,
  lostPoseFrames: 0,
  rawAngle:       20,
  controlAngle:   20,
  clinicalAngle:  20,
  displayAngle:   20,
  targetAcquired: false,
  handFollow:     { x: 0.5, y: 0.55, visible: false },
  cameraAngle:    20,
  score:          0,
  timeRemaining:  120,
  level:          1,
  reps:           0,
  repsGoal:       10,
  targetRom:      70,
  maxTargetRom:   180,
  minTargetRom:   45,
  repState:       "RESTING",
  peakAngle:      0,
  lastTick:       performance.now(),
  targetHitFlash: 0,
  targetCooldown: 0,
  painStop:       false,
  lastRepFrameId: null,
  feedbackKind:   "neutral",
  feedbackTitle:  "Ready",
  feedbackText:   "Start camera to hang the lanterns",
  /* mission-specific */
  lanterns:         makeLanternQueue(),
  activeLanternIdx: 0,
  lanternsHung:     0,
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
   POSE / CAMERA  (identical infrastructure)
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
    console.error("MoveWall M3 pose error:", err);
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
    setFeedback("good", "Pose AI ready", "Reach toward the glowing lantern");
    return true;
  } catch (err) {
    setFeedback("bad", "Camera blocked", "Allow camera permission in the browser");
    console.error("MoveWall M3 camera error:", err);
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

/* ── Pose loop ───────────────────────────────────────────────── */
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
  game.lastPoseAt    = now;
  game.lastVideoTime  = video.currentTime;
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
  game.rawAngle      = estimate.controlAngle;
  game.controlAngle  = estimate.controlAngle;
  game.displayAngle  = estimate.controlAngle;
  game.clinicalAngle = stabilizeClinicalAngle(estimate.clinicalAngle, game.clinicalAngle);
  game.cameraAngle   = estimate.controlAngle;

  if (estimate.compensation) {
    setFeedback("warn", "Shoulder hike", "Lower your shoulder, reach with your arm");
  }

  checkLanternHit();
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

/* ── ROM estimation ──────────────────────────────────────────── */
function estimateArmRaiseRom(landmarks) {
  const right = estimateSideRom(landmarks, { side: "right", shoulder: 12, elbow: 14, wrist: 16, hip: 24, oppositeShoulder: 11 });
  const left  = estimateSideRom(landmarks, { side: "left",  shoulder: 11, elbow: 13, wrist: 15, hip: 23, oppositeShoulder: 12 });
  const c = [right, left].filter(Boolean);
  if (!c.length) return null;
  c.sort((a, b) => b.score - a.score);
  return c[0];
}

function estimateSideRom(landmarks, ids) {
  const sh  = landmarks[ids.shoulder];
  const el  = landmarks[ids.elbow];
  const wr  = landmarks[ids.wrist];
  const hp  = landmarks[ids.hip];
  const opp = landmarks[ids.oppositeShoulder];
  const conf = Math.min(sh?.visibility ?? 1, wr?.visibility ?? 1, hp?.visibility ?? 1);
  if (!sh || !wr || !hp || conf < 0.28) return null;

  const torsoUp = { x: sh.x - hp.x, y: sh.y - hp.y };
  const arm     = { x: wr.x - sh.x,  y: wr.y - sh.y };
  const aft     = angleBetween(torsoUp, arm);
  const clinical = el ? clamp(180 - aft, 0, 180) : game.clinicalAngle;
  const tLen = Math.max(0.08, Math.hypot(torsoUp.x, torsoUp.y));
  const wH   = (sh.y - wr.y) / tLen;
  const ctrl = clamp(wH * 86 + 48, 0, 180);
  const hike = opp ? sh.y < opp.y - 0.045 && ctrl < game.targetRom : false;
  return {
    side: ids.side, angle: ctrl, controlAngle: ctrl, clinicalAngle: clinical,
    compensation: hike, score: conf * 100 + ctrl,
    points: { shoulder: sh, elbow: el, wrist: wr, hip: hp },
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
   MISSION 3 GAME LOGIC – Lantern Hanging
   ═══════════════════════════════════════════════════════════════ */

function getActiveLantern() {
  for (let i = game.activeLanternIdx; i < game.lanterns.length; i++) {
    if (!game.lanterns[i].hung) { game.activeLanternIdx = i; return game.lanterns[i]; }
  }
  return null;
}

function checkLanternHit() {
  if (!game.handFollow.visible || game.targetCooldown > 0) return;
  const lan = getActiveLantern();
  if (!lan) return;

  game.targetRom = lan.reqRom;

  const dx   = game.handFollow.x - lan.x;
  const dy   = game.handFollow.y - lan.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Update approach glow (0..1 based on closeness + ROM)
  const romRatio = clamp(game.cameraAngle / lan.reqRom, 0, 1);
  const proxRatio = clamp(1 - dist / 0.20, 0, 1);
  lan.glowPct = romRatio * proxRatio;

  if (dist < 0.09 && game.cameraAngle >= lan.reqRom * 0.92) {
    hangLantern(lan);
  } else if (game.cameraAngle >= lan.reqRom * 0.72) {
    setFeedback("warn", "Almost there!", "Move your hand to the glowing lantern");
  } else {
    const hints = {
      "overhead":   "Reach directly overhead",
      "overhead-L": "Reach up and to the left",
      "overhead-R": "Reach up and to the right",
      "front":      "Raise your arm forward",
      "front-L":    "Reach forward and left",
      "front-R":    "Reach forward and right",
      "lateral-L":  "Reach out to the left side",
      "lateral-R":  "Reach out to the right side",
      "mid-L":      "Reach toward the left",
      "mid-R":      "Reach toward the right",
    };
    setFeedback("bad", "Reach further", hints[lan.dir] ?? "Raise your arm toward the lantern");
  }
}

function hangLantern(lan) {
  lan.hung    = true;
  lan.glowPct = 1;
  game.lanternsHung += 1;
  game.reps    = Math.min(game.repsGoal, game.lanternsHung);
  game.score  += Math.round(150 + Math.max(0, game.cameraAngle - lan.reqRom) * 4 + game.level * 18);
  game.targetHitFlash = 1;
  game.targetCooldown = 1.0;

  // Spawn burst particles
  for (let i = 0; i < 22; i++) {
    const angle = (i / 22) * Math.PI * 2 + Math.random() * 0.3;
    const speed = 0.04 + Math.random() * 0.07;
    lan.burstParticles.push({
      x: lan.x, y: lan.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      size: 3 + Math.random() * 5,
      hue: i % 3 === 0 ? "#f5c842" : i % 3 === 1 ? "#ff8c42" : "#fff",
    });
  }

  // Level up every 2 lanterns
  if (game.lanternsHung % 2 === 0) {
    game.level = Math.min(9, game.level + 1);
  }

  game.activeLanternIdx += 1;
  setFeedback("good", "Lantern hung! 🏮", "Excellent reach — find the next lantern");

  if (game.reps >= game.repsGoal) {
    game.running = false;
    setFeedback("good", "Festival ready! 🏮🌟", `All ${game.lanternsHung} lanterns hung`);
  }
}

/* ═══════════════════════════════════════════════════════════════
   DRAWING — Night Festival scene
   ═══════════════════════════════════════════════════════════════ */

function draw() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);
  drawNightScene(W, H);
  drawPosts(W, H);
  drawRopes(W, H);
  drawAllLanterns(W, H);
  drawBurstParticles(W, H);
  drawHandCursor(W, H);
}

/* ── Night sky + ground ──────────────────────────────────────── */
function drawNightScene(W, H) {
  const now = performance.now();

  // Night-to-dusk gradient sky
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.65);
  sky.addColorStop(0,    "#0a0520");
  sky.addColorStop(0.25, "#150d38");
  sky.addColorStop(0.55, "#2a1a5e");
  sky.addColorStop(0.75, "#5a2d82");
  sky.addColorStop(1,    "#8b3a6a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Stars – twinkle
  STARS.forEach((st) => {
    const t = Math.sin(now / 1200 + st.phase);
    const alpha = 0.45 + t * 0.45;
    ctx.fillStyle = `rgba(255,255,240,${alpha})`;
    ctx.beginPath();
    ctx.arc(st.x * W, st.y * H, st.r * (0.8 + t * 0.3), 0, Math.PI * 2);
    ctx.fill();
  });

  // Moon
  const mx = W * 0.88, my = H * 0.10;
  const moonGlow = ctx.createRadialGradient(mx, my, 14, mx, my, 90);
  moonGlow.addColorStop(0,   "rgba(255,248,210,0.28)");
  moonGlow.addColorStop(0.5, "rgba(255,240,170,0.10)");
  moonGlow.addColorStop(1,   "rgba(255,240,170,0)");
  ctx.fillStyle = moonGlow;
  ctx.beginPath(); ctx.arc(mx, my, 90, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fffae0";
  ctx.beginPath(); ctx.arc(mx, my, 28, 0, Math.PI * 2); ctx.fill();
  // Moon crater highlights
  ctx.fillStyle = "rgba(200,190,150,0.25)";
  [[mx - 8, my + 6, 5], [mx + 10, my - 8, 4], [mx + 4, my + 12, 3]].forEach(([cx, cy, cr]) => {
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill();
  });

  // Horizon glow (lantern festival warm haze)
  const horizon = ctx.createLinearGradient(0, H * 0.55, 0, H * 0.72);
  horizon.addColorStop(0, "rgba(255,120,50,0)");
  horizon.addColorStop(0.5,"rgba(255,100,40,0.22)");
  horizon.addColorStop(1, "rgba(200,60,20,0.08)");
  ctx.fillStyle = horizon;
  ctx.fillRect(0, H * 0.55, W, H * 0.17);

  // Ground — cobblestone courtyard
  const ground = ctx.createLinearGradient(0, H * 0.68, 0, H);
  ground.addColorStop(0, "#2a1e10");
  ground.addColorStop(0.3,"#1e1508");
  ground.addColorStop(1, "#100c04");
  ctx.fillStyle = ground;
  ctx.fillRect(0, H * 0.68, W, H * 0.32);

  // Subtle cobblestone grid
  ctx.strokeStyle = "rgba(80,60,30,0.35)";
  ctx.lineWidth = 1;
  for (let row = 0; row < 8; row++) {
    const gy = H * (0.70 + row * 0.038);
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
  }
  for (let col = 0; col < 22; col++) {
    const gx = W * (col / 21);
    ctx.beginPath(); ctx.moveTo(gx, H * 0.68); ctx.lineTo(gx, H); ctx.stroke();
  }

  // Ground-edge glow from lantern light
  const groundGlow = ctx.createLinearGradient(0, H * 0.68, 0, H * 0.78);
  groundGlow.addColorStop(0, "rgba(255,140,60,0.18)");
  groundGlow.addColorStop(1, "rgba(255,140,60,0)");
  ctx.fillStyle = groundGlow;
  ctx.fillRect(0, H * 0.68, W, H * 0.10);

  // Silhouette rooftop in background
  ctx.fillStyle = "#0e0a1a";
  // Left building
  ctx.beginPath();
  ctx.moveTo(0, H * 0.62);
  ctx.lineTo(W * 0.12, H * 0.45);
  ctx.lineTo(W * 0.18, H * 0.50);
  ctx.lineTo(W * 0.22, H * 0.38);
  ctx.lineTo(W * 0.28, H * 0.44);
  ctx.lineTo(W * 0.30, H * 0.62);
  ctx.closePath(); ctx.fill();
  // Right building
  ctx.beginPath();
  ctx.moveTo(W * 0.70, H * 0.62);
  ctx.lineTo(W * 0.73, H * 0.46);
  ctx.lineTo(W * 0.79, H * 0.52);
  ctx.lineTo(W * 0.84, H * 0.40);
  ctx.lineTo(W * 0.90, H * 0.48);
  ctx.lineTo(W, H * 0.60);
  ctx.lineTo(W, H * 0.62);
  ctx.closePath(); ctx.fill();
}

/* ── Wooden posts ────────────────────────────────────────────── */
function drawPosts(W, H) {
  POST_POSITIONS.forEach((px) => {
    const x  = px * W;
    const y0 = H * 0.68;
    const y1 = H * 0.22;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.beginPath();
    ctx.ellipse(x + 6, y0 + 8, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Post body
    const grad = ctx.createLinearGradient(x - 10, 0, x + 10, 0);
    grad.addColorStop(0, "#6b4a22");
    grad.addColorStop(0.4, "#9a7040");
    grad.addColorStop(1, "#4a2e10");
    ctx.fillStyle = grad;
    ctx.fillRect(x - 10, y1, 20, y0 - y1);

    // Post cap
    ctx.fillStyle = "#c49050";
    ctx.beginPath();
    ctx.roundRect(x - 14, y1 - 8, 28, 14, 4);
    ctx.fill();

    // Cross-arm for hanging lanterns
    ctx.strokeStyle = "#8b6030";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - 30, y1 + 12);
    ctx.lineTo(x + 30, y1 + 12);
    ctx.stroke();
  });
}

/* ── Ropes connecting posts ──────────────────────────────────── */
function drawRopes(W, H) {
  const ropeY = H * 0.25;
  ctx.strokeStyle = "rgba(120,80,30,0.55)";
  ctx.lineWidth = 2;
  for (let i = 0; i < POST_POSITIONS.length - 1; i++) {
    const x1 = POST_POSITIONS[i]     * W;
    const x2 = POST_POSITIONS[i + 1] * W;
    ctx.beginPath();
    ctx.moveTo(x1, ropeY);
    ctx.quadraticCurveTo((x1 + x2) / 2, ropeY + 18, x2, ropeY);
    ctx.stroke();
  }
}

/* ── All lanterns (hung + active + waiting) ──────────────────── */
function drawAllLanterns(W, H) {
  const activeLan = getActiveLantern();
  const now = performance.now();

  game.lanterns.forEach((lan, idx) => {
    if (idx > game.activeLanternIdx && !lan.hung) return; // Don't preview future lanterns

    const lx = lan.x * W;
    const ly = lan.y * H;
    const isActive = lan === activeLan;

    if (lan.hung) {
      // Grow-in animation
      if (lan.hungPct < 1) lan.hungPct = Math.min(1, lan.hungPct + 0.018);
      drawLantern(lx, ly, lan, now, false);
    } else if (isActive) {
      // Swing animation for active lantern
      const swingAmt = 8 * (1 - clamp(lan.glowPct, 0, 1) * 0.6);
      const swingX = lx + Math.sin(now / 800 + lan.swingOffset * Math.PI * 2) * swingAmt;
      drawLantern(swingX, ly, lan, now, true);
      // Approach indicator — thin string from nearest post top
      drawLanternString(swingX, ly, W, H);
    }
  });
}

function drawLanternString(lx, ly, W, H) {
  // Find nearest post
  let nearestPost = POST_POSITIONS[0];
  let minDist = Infinity;
  POST_POSITIONS.forEach((px) => {
    const d = Math.abs(px * W - lx);
    if (d < minDist) { minDist = d; nearestPost = px; }
  });
  const anchorX = nearestPost * W;
  const anchorY = H * 0.245;
  ctx.strokeStyle = "rgba(150,100,40,0.60)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(anchorX, anchorY);
  ctx.lineTo(lx, ly - 28);
  ctx.stroke();
}

/**
 * Draw a single paper lantern at (cx, cy).
 * @param {boolean} isActive — true: glow + swing, false: already hung (warm light)
 */
function drawLantern(cx, cy, lan, now, isActive) {
  const scale  = lan.hung ? lan.hungPct : 1;
  const LW = 28 * scale;   // half-width
  const LH = 38 * scale;   // half-height

  if (LW < 1) return;

  ctx.save();
  ctx.translate(cx, cy);

  /* ── glow behind lantern ── */
  if (isActive) {
    const glowAlpha = 0.3 + lan.glowPct * 0.5 + Math.sin(now / 300) * 0.08;
    const glowR     = 55 + lan.glowPct * 25;
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, glowR);
    glow.addColorStop(0, `rgba(255,200,80,${glowAlpha})`);
    glow.addColorStop(0.5,`rgba(255,120,40,${glowAlpha * 0.4})`);
    glow.addColorStop(1, "rgba(255,80,20,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, glowR, 0, Math.PI * 2); ctx.fill();
  } else {
    // Hung lantern warm ambient
    const hungGlow = ctx.createRadialGradient(0, 0, 6, 0, 0, 70 * scale);
    hungGlow.addColorStop(0, "rgba(255,180,60,0.35)");
    hungGlow.addColorStop(0.6,"rgba(255,120,30,0.12)");
    hungGlow.addColorStop(1, "rgba(255,100,20,0)");
    ctx.fillStyle = hungGlow;
    ctx.beginPath(); ctx.arc(0, 0, 70 * scale, 0, Math.PI * 2); ctx.fill();
  }

  /* ── lantern body ── */
  const bodyGrad = ctx.createRadialGradient(-LW * 0.35, -LH * 0.25, LW * 0.1, 0, 0, LW * 1.2);
  if (isActive) {
    const brightness = 0.55 + lan.glowPct * 0.45 + Math.sin(now / 300) * 0.06;
    bodyGrad.addColorStop(0, `rgba(255,${Math.round(220 * brightness)},${Math.round(60 * brightness)},0.95)`);
    bodyGrad.addColorStop(0.5,"rgba(220,60,20,0.92)");
    bodyGrad.addColorStop(1, "rgba(160,20,10,0.90)");
  } else {
    bodyGrad.addColorStop(0, "rgba(255,200,80,0.96)");
    bodyGrad.addColorStop(0.5,"rgba(240,140,40,0.95)");
    bodyGrad.addColorStop(1, "rgba(180,60,10,0.92)");
  }
  ctx.fillStyle = bodyGrad;

  // Lantern shape — wider in middle, tapered top/bottom
  ctx.beginPath();
  ctx.moveTo(0, -LH);
  ctx.bezierCurveTo( LW * 1.1, -LH * 0.55,  LW * 1.1, LH * 0.55, 0, LH);
  ctx.bezierCurveTo(-LW * 1.1,  LH * 0.55, -LW * 1.1, -LH * 0.55, 0, -LH);
  ctx.fill();

  /* ── ribs ── */
  const ribColor = isActive ? "rgba(200,100,20,0.35)" : "rgba(255,210,80,0.50)";
  ctx.strokeStyle = ribColor;
  ctx.lineWidth = 1.5 * scale;
  for (let r = -2; r <= 2; r++) {
    const ry = r * LH * 0.38;
    const rw = LW * Math.cos((r / 3) * (Math.PI / 2));
    ctx.beginPath();
    ctx.moveTo(-rw, ry);
    ctx.bezierCurveTo(-rw * 0.5, ry + LH * 0.06, rw * 0.5, ry + LH * 0.06, rw, ry);
    ctx.stroke();
  }

  /* ── top & bottom caps ── */
  ctx.fillStyle = isActive ? "#8b2010" : "#c47020";
  ctx.beginPath();
  ctx.ellipse(0, -LH, LW * 0.45, LH * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0,  LH, LW * 0.45, LH * 0.12, 0, 0, Math.PI * 2); ctx.fill();

  /* ── tassel ── */
  ctx.strokeStyle = isActive ? "#d4601a" : "#f0b830";
  ctx.lineWidth = 2 * scale;
  for (let t = -1; t <= 1; t++) {
    ctx.beginPath();
    ctx.moveTo(t * 6 * scale, LH);
    ctx.lineTo(t * 8 * scale, LH + 18 * scale);
    ctx.stroke();
  }

  /* ── inner light core ── */
  const innerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, LW * 0.6);
  innerGlow.addColorStop(0, isActive
    ? `rgba(255,255,200,${0.30 + lan.glowPct * 0.40 + Math.sin(now / 250) * 0.08})`
    : "rgba(255,240,160,0.55)");
  innerGlow.addColorStop(1, "rgba(255,200,80,0)");
  ctx.fillStyle = innerGlow;
  ctx.beginPath();
  ctx.arc(0, 0, LW * 0.65, 0, Math.PI * 2);
  ctx.fill();

  /* ── specular highlight ── */
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.ellipse(-LW * 0.25, -LH * 0.35, LW * 0.20, LH * 0.22, -0.35, 0, Math.PI * 2);
  ctx.fill();

  /* ── label for active lantern ── */
  if (isActive) {
    ctx.fillStyle = "rgba(16,8,32,0.72)";
    ctx.beginPath(); ctx.roundRect(-36, LH + 24, 72, 22, 7); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${Math.max(9, 11 * scale)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`${lan.reqRom}° · ${lan.dir}`, 0, LH + 39);
  }

  ctx.restore();
}

/* ── Burst particles ─────────────────────────────────────────── */
function drawBurstParticles(W, H) {
  game.lanterns.forEach((lan) => {
    lan.burstParticles.forEach((p) => {
      p.x   += p.vx * 0.016;
      p.y   += p.vy * 0.016;
      p.vy  += 0.002;
      p.life -= 0.016;
      const alpha = Math.max(0, p.life);
      const rgb   = p.hue === "#f5c842" ? "245,200,66" : p.hue === "#ff8c42" ? "255,140,66" : "255,255,255";
      ctx.fillStyle = `rgba(${rgb},${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    });
    lan.burstParticles = lan.burstParticles.filter((p) => p.life > 0);
  });
}

/* ── Hand cursor ─────────────────────────────────────────────── */
function drawHandCursor(W, H) {
  if (!game.handFollow.visible) return;
  const hx  = game.handFollow.x * W;
  const hy  = game.handFollow.y * H;
  const now = performance.now();
  const pulse = 1 + Math.sin(now / 180) * 0.06;

  // Outer warm glow
  const glow = ctx.createRadialGradient(hx, hy, 4, hx, hy, 44 * pulse);
  glow.addColorStop(0, "rgba(255,210,80,0.55)");
  glow.addColorStop(0.6,"rgba(255,160,40,0.18)");
  glow.addColorStop(1, "rgba(255,120,20,0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(hx, hy, 46 * pulse, 0, Math.PI * 2); ctx.fill();

  // Ring
  ctx.strokeStyle = `rgba(255,240,180,${0.80 + game.targetHitFlash * 0.2})`;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(hx, hy, 18 + game.targetHitFlash * 12, 0, Math.PI * 2); ctx.stroke();

  // Inner dot
  ctx.fillStyle = "rgba(255,220,100,0.95)";
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
  const lan = getActiveLantern();
  if (!lan) return "All lanterns hung! 🏮";
  if (game.cameraAngle >= lan.reqRom) return `Target reached | clinical ${clinical}°`;
  if (game.cameraAngle >= lan.reqRom * 0.72) return `Keep reaching | clinical ${clinical}°`;
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
  game.running         = false;
  game.score           = 0;
  game.timeRemaining   = 120;
  game.level           = 1;
  game.reps            = 0;
  game.controlAngle    = 20;
  game.clinicalAngle   = 20;
  game.displayAngle    = 20;
  game.rawAngle        = 20;
  game.cameraAngle     = 20;
  game.targetRom       = 70;
  game.repState        = "RESTING";
  game.peakAngle       = 0;
  game.targetHitFlash  = 0;
  game.targetCooldown  = 0;
  game.painStop        = false;
  game.lastRepFrameId  = null;
  game.posePoints      = null;
  game.lostPoseFrames  = 0;
  game.lastPoseAt      = 0;
  game.poseBusy        = false;
  game.handFollow      = { x: 0.5, y: 0.55, visible: false };
  game.targetAcquired  = false;
  game.lanterns        = makeLanternQueue();
  game.activeLanternIdx = 0;
  game.lanternsHung    = 0;
  setFeedback("neutral", "Ready", "Start camera to hang the lanterns");
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
      setFeedback("good", "Festival ready! 🏮", `${game.lanternsHung} lanterns hung`);
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
  setFeedback("neutral", "Mission active 🏮", "Reach toward the glowing lantern");
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

/* ── Edge payload bridge ─────────────────────────────────────── */
function receiveEdgePayload(payload) {
  if (!payload || typeof payload.current_angle !== "number") return;
  game.controlAngle = clamp(payload.current_angle, 0, 180);
  game.displayAngle = game.controlAngle;
  game.cameraAngle  = game.controlAngle;
  const lan = getActiveLantern();
  if (lan) game.targetRom = lan.reqRom;
}
window.MoveWallGame = { receiveEdgePayload };

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
resetGame();
requestAnimationFrame(tick);
