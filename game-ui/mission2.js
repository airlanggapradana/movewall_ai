/* ═══════════════════════════════════════════════════════════════
   MOVEWALL-AI  ·  Mission 2 – Restore the Garden (Garden Keeper)
   Target terapeutik: shoulder flexion, reaching, motor control
   MediaPipe Hand-Tracking & Pointer Gembor (Watering-Can)
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
const HAND_MODEL_URL    = "./assets/hand_landmarker.task";
const HAND_FALLBACK_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";
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
  gestureCard:  document.getElementById("gestureCard"),
  gestureBadge: document.getElementById("gestureBadge"),
  rangeBadge:   document.getElementById("rangeBadge"),
  romMeter:     document.querySelector(".rom-meter"),
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
 */
function makePots() {
  return [
    // Pot 1 – Target 30° (Starting therapeutic target, lower shelf left)
    { x: 0.22, y: 0.66, requiredRom:  30, watered: false, waterProgress: 0, growPct: 0, waterParticles: [] },
    // Pot 2 – Target 35° (Low shelf right)
    { x: 0.78, y: 0.66, requiredRom:  35, watered: false, waterProgress: 0, growPct: 0, waterParticles: [] },
    // Pot 3 – Target 45° (Mid-low center)
    { x: 0.50, y: 0.58, requiredRom:  45, watered: false, waterProgress: 0, growPct: 0, waterParticles: [] },
    // Pot 4 – Target 55° (Mid-low left)
    { x: 0.18, y: 0.52, requiredRom:  55, watered: false, waterProgress: 0, growPct: 0, waterParticles: [] },
    // Pot 5 – Target 65° (Mid shelf right)
    { x: 0.82, y: 0.50, requiredRom:  65, watered: false, waterProgress: 0, growPct: 0, waterParticles: [] },
    // Pot 6 – Target 75° (Mid shelf center)
    { x: 0.38, y: 0.44, requiredRom:  75, watered: false, waterProgress: 0, growPct: 0, waterParticles: [] },
    // Pot 7 – Target 85° (Chest / shoulder level)
    { x: 0.62, y: 0.42, requiredRom:  85, watered: false, waterProgress: 0, growPct: 0, waterParticles: [] },
    // Pot 8 – Target 95° (Eye level)
    { x: 0.25, y: 0.34, requiredRom:  95, watered: false, waterProgress: 0, growPct: 0, waterParticles: [] },
    // Pot 9 – Target 110° (Overhead reach)
    { x: 0.74, y: 0.30, requiredRom: 110, watered: false, waterProgress: 0, growPct: 0, waterParticles: [] },
    // Pot 10 – Target 125° (High overhead)
    { x: 0.50, y: 0.24, requiredRom: 125, watered: false, waterProgress: 0, growPct: 0, waterParticles: [] },
    // Pot 11 – Target 135° (High lateral left)
    { x: 0.32, y: 0.18, requiredRom: 135, watered: false, waterProgress: 0, growPct: 0, waterParticles: [] },
    // Pot 12 – Target 150° (Peak elevation right)
    { x: 0.68, y: 0.16, requiredRom: 150, watered: false, waterProgress: 0, growPct: 0, waterParticles: [] },
  ];
}

/* ── Clouds in sky (static, generated once) ──────────────────── */
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
  running:         false,
  cameraStream:    null,
  poseLandmarker:  null,
  handLandmarker:  null,
  visionLoading:   false,
  poseReady:       false,
  handReady:       false,
  poseBackend:     "Not loaded",
  lastPoseAt:      0,
  poseBusy:        false,
  lastVideoTime:   -1,
  trackingQuality: "Waiting for camera",
  posePoints:      null,
  lostPoseFrames:  0,
  lostHandFrames:  0,
  rawAngle:        20,
  controlAngle:    20,
  clinicalAngle:   20,
  displayAngle:    20,
  targetAcquired:  false,
  /* Hand Tracking & Pointer */
  handFollow:      { x: 0.5, y: 0.55, visible: false },
  handDetected:    false,
  isHandOpen:      false,       // true: open hand (watering), false: fist (aiming)
  consecutiveOpenFrames: 0,
  consecutiveClosedFrames: 0,
  isWatering:      false,       // true if pouring water onto pot
  potInRange:      false,       // true if pointer is within range of target pot
  canTiltAngle:    0,           // current smooth tilt angle of watering can
  canTipPos:       { x: 0, y: 0 },
  splashParticles: [],
  floatingPopups:  [],
  cameraAngle:     20,
  score:           0,
  timeRemaining:   120,
  level:           1,
  reps:            0,
  repsGoal:        12,
  targetRom:       70,
  maxTargetRom:    180,
  minTargetRom:    45,
  repState:        "RESTING",
  peakAngle:       0,
  lastTick:        performance.now(),
  targetHitFlash:  0,
  targetCooldown:  0,
  painStop:        false,
  lastRepFrameId:  null,
  feedbackKind:    "neutral",
  feedbackTitle:   "Ready",
  feedbackText:    "Start camera to water the garden",
  /* mission-specific */
  pots:            makePots(),
  activePotIdx:    0,
  completedPots:   0,
};

/* ═══════════════════════════════════════════════════════════════
   AUDIO SYNTHESIZER (Zero external audio asset dependencies)
   ═══════════════════════════════════════════════════════════════ */
const audio = {
  ctx: null,
  waterSource: null,
  waterGain: null,
  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    } catch (e) {
      console.warn("MoveWall AudioContext error:", e);
    }
  },
  startWaterSound() {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    if (this.waterGain) return;

    try {
      const bufferSize = Math.floor(this.ctx.sampleRate * 1.5);
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.35;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1050;
      filter.Q.value = 3.2;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.01, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.14, this.ctx.currentTime + 0.12);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      whiteNoise.start();
      this.waterSource = whiteNoise;
      this.waterGain = gain;
    } catch (e) {}
  },
  stopWaterSound() {
    if (!this.waterGain || !this.ctx) return;
    try {
      this.waterGain.gain.setValueAtTime(this.waterGain.gain.value, this.ctx.currentTime);
      this.waterGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
      setTimeout(() => {
        if (this.waterSource) {
          try { this.waterSource.stop(); } catch (e) {}
          this.waterSource = null;
        }
        this.waterGain = null;
      }, 110);
    } catch (e) {
      this.waterGain = null;
    }
  },
  playChime() {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});

    // Pentatonic arpeggio [523.25, 659.25, 783.99, 1046.50]
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const startTime = this.ctx.currentTime + idx * 0.07;
      gain.gain.setValueAtTime(0.16, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.5);
    });
  }
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
   MEDIAPIPE VISION: POSE & HAND LANDMARKERS
   ═══════════════════════════════════════════════════════════════ */
let cachedVisionTasks = null;
let cachedVision = null;
let cachedSource = null;

async function loadVisionTasks() {
  if (cachedVisionTasks && cachedVision) {
    return { visionTasks: cachedVisionTasks, vision: cachedVision, source: cachedSource };
  }
  let lastErr;
  for (const src of MEDIAPIPE_SOURCES) {
    try {
      const visionTasks = await import(src.bundle);
      const vision = await visionTasks.FilesetResolver.forVisionTasks(src.wasm);
      cachedVisionTasks = visionTasks;
      cachedVision = vision;
      cachedSource = src.bundle.startsWith(".") ? "local" : "cdn";
      return { visionTasks, vision, source: cachedSource };
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

function createPoseLandmarker(vt, vision, delegate) {
  return vt.PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.3,
    minPosePresenceConfidence:  0.3,
    minTrackingConfidence:      0.3,
  });
}

function createHandLandmarker(vt, vision, delegate) {
  return vt.HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.25,
    minHandPresenceConfidence:  0.25,
    minTrackingConfidence:      0.25,
  }).catch((err) => {
    console.warn("MoveWall: local hand_landmarker.task fallback to CDN...", err);
    return vt.HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: HAND_FALLBACK_URL, delegate },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.25,
      minHandPresenceConfidence:  0.25,
      minTrackingConfidence:      0.25,
    });
  });
}

async function ensureVisionLandmarkers() {
  if (game.poseReady && game.handReady) return true;
  if (game.visionLoading) return false;
  game.visionLoading = true;
  game.trackingQuality = "Memuat model AI MediaPipe...";
  try {
    const { visionTasks, vision, source } = await loadVisionTasks();

    // 1. Pose Landmarker
    try {
      game.poseLandmarker = await createPoseLandmarker(visionTasks, vision, "GPU");
    } catch {
      game.poseLandmarker = await createPoseLandmarker(visionTasks, vision, "CPU");
    }
    game.poseReady = true;

    // 2. Hand Landmarker
    try {
      game.handLandmarker = await createHandLandmarker(visionTasks, vision, "GPU");
    } catch {
      game.handLandmarker = await createHandLandmarker(visionTasks, vision, "CPU");
    }
    game.handReady = true;

    game.poseBackend = source;
    game.trackingQuality = `Pose & Hand AI ready (${source})`;
    return true;
  } catch (err) {
    console.error("MoveWall M2 vision error:", err);
    if (game.poseReady) {
      game.trackingQuality = "Pose AI ready (Hand fallback)";
      return true;
    }
    game.poseBackend = "Unavailable";
    game.trackingQuality = "MediaPipe AI unavailable";
    return false;
  } finally {
    game.visionLoading = false;
  }
}

async function ensureCameraReady() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setFeedback("bad", "Kamera tidak tersedia", "Browser tidak mendukung akses webcam");
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
    setFeedback("warn", "Kamera Siap", "Memuat pelacakan tangan & bahu...");
    const ok = await ensureVisionLandmarkers();
    if (!ok) {
      setFeedback("bad", "AI Vision tidak tersedia", "Periksa koneksi model dan muat ulang halaman");
      return false;
    }
    setFeedback("good", "AI Siap! 🌿", "Arahkan tangan tertutup untuk membidik, buka untuk menyiram!");
    return true;
  } catch (err) {
    setFeedback("bad", "Kamera Diblokir", "Berikan izin akses kamera di browser Anda");
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

/* ═══════════════════════════════════════════════════════════════
   HAND GESTURE CLASSIFICATION: OPEN HAND VS CLOSED FIST
   ═══════════════════════════════════════════════════════════════ */

/**
 * Classifies whether a hand is OPEN (tangan terbuka) or CLOSED (tangan tertutup / mengepal)
 * based on the 21 MediaPipe hand landmarks.
 * In a closed fist, fingers curl into the palm towards MCP and wrist.
 * In an open hand, at least 3 fingers are clearly extended away from MCP and wrist.
 */
function evaluateHandGesture(landmarks) {
  if (!landmarks || landmarks.length < 21) {
    return { isOpen: false, openFingers: 0 };
  }

  const lm = landmarks;
  const wrist = lm[0];

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // A finger is extended if fingertip is further from wrist and further from MCP than PIP
  function isFingerOpen(tipIdx, pipIdx, mcpIdx) {
    const dTipWrist = dist(lm[tipIdx], wrist);
    const dPipWrist = dist(lm[pipIdx], wrist);
    const dTipMcp   = dist(lm[tipIdx], lm[mcpIdx]);
    const dPipMcp   = dist(lm[pipIdx], lm[mcpIdx]);
    return (dTipWrist > dPipWrist * 1.14) && (dTipMcp > dPipMcp * 1.25);
  }

  const indexOpen  = isFingerOpen(8, 6, 5);
  const middleOpen = isFingerOpen(12, 10, 9);
  const ringOpen   = isFingerOpen(16, 14, 13);
  const pinkyOpen  = isFingerOpen(20, 18, 17);

  // Thumb: extended outward from pinky base (17) and wrist (0)
  const dThumbPinky = dist(lm[4], lm[17]);
  const dMcpPinky   = dist(lm[2], lm[17]);
  const thumbOpen   = (dThumbPinky > dMcpPinky * 1.20) && (dist(lm[4], wrist) > dist(lm[3], wrist) * 1.10);

  let openFingers = 0;
  if (indexOpen)  openFingers++;
  if (middleOpen) openFingers++;
  if (ringOpen)   openFingers++;
  if (pinkyOpen)  openFingers++;
  if (thumbOpen)  openFingers++;

  // Strict check: Must have at least 3 fingers extended to be considered OPEN!
  // In a fist, fingers curl in (openFingers is 0 or 1), so isOpen is ALWAYS false!
  const isOpen = openFingers >= 3;
  return { isOpen, openFingers };
}

/* ═══════════════════════════════════════════════════════════════
   VISION TRACKING LOOP
   ═══════════════════════════════════════════════════════════════ */
function updateCameraMotion() {
  if (!game.running || game.painStop) return;
  if (!ui.cameraPreview.videoWidth) return;
  if (!game.poseReady && !game.handReady) return;
  updateVisionTracking(performance.now());
}

function updateVisionTracking(now) {
  if (game.poseBusy || now - game.lastPoseAt < POSE_FRAME_INTERVAL) return;
  const video = ui.cameraPreview;
  const videoTimestamp = video.currentTime;
  if (
    videoTimestamp === game.lastVideoTime &&
    now - game.lastPoseAt < POSE_FRAME_INTERVAL * 3
  )
    return;

  game.lastPoseAt   = now;
  game.lastVideoTime = videoTimestamp;
  game.poseBusy = true;

  let poseResult = null;
  let handResult = null;

  try {
    if (game.poseLandmarker) {
      poseResult = game.poseLandmarker.detectForVideo(video, now);
    }
  } catch (err) {
    console.warn("Pose inference error:", err);
  }

  try {
    if (game.handLandmarker) {
      handResult = game.handLandmarker.detectForVideo(video, now);
    }
  } catch (err) {
    console.warn("Hand inference error:", err);
  } finally {
    game.poseBusy = false;
  }

  // 1. Process Pose for Shoulder ROM Flexion (Sesuai Apple Archery)
  let estimate = null;
  const poseLandmarks = poseResult?.landmarks?.[0];
  if (poseLandmarks) {
    estimate = estimateArmRaiseRom(poseLandmarks);
    if (estimate) {
      game.lostPoseFrames  = 0;
      game.posePoints      = estimate.points;
      game.rawAngle        = estimate.controlAngle;
      game.controlAngle    = stabilizeClinicalAngle(estimate.controlAngle, game.controlAngle);
      game.displayAngle    = game.controlAngle;
      game.clinicalAngle   = stabilizeClinicalAngle(estimate.clinicalAngle, game.clinicalAngle);
      game.cameraAngle     = game.controlAngle;

      if (estimate.compensation) {
        setFeedback("warn", "Shoulder hike detected", "Turunkan sedikit bahu Anda");
      }
    }
  }

  // 2. Process Hand Landmarks for Pointer & Open/Closed Gesture
  const handLandmarks = handResult?.landmarks?.[0];

  if (handLandmarks) {
    game.handDetected = true;
    game.lostHandFrames = 0;

    // Center of palm between wrist (0) and middle MCP (9)
    const wrist = handLandmarks[0];
    const middleMcp = handLandmarks[9];
    const palmX = (wrist.x + middleMcp.x) * 0.5;
    const palmY = (wrist.y + middleMcp.y) * 0.5;

    // Mirrored for user-facing camera
    const normX = clamp(1 - palmX, 0.05, 0.95);
    const normY = clamp(palmY, 0.06, 0.94);

    // Smooth movement (EMA)
    game.handFollow.x = game.handFollow.x * 0.22 + normX * 0.78;
    game.handFollow.y = game.handFollow.y * 0.22 + normY * 0.78;
    game.handFollow.visible = true;

    // Evaluate gesture strictly from 21 MediaPipe hand points
    const { isOpen, openFingers } = evaluateHandGesture(handLandmarks);
    if (isOpen) {
      game.consecutiveOpenFrames = (game.consecutiveOpenFrames || 0) + 1;
      game.consecutiveClosedFrames = 0;
    } else {
      game.consecutiveClosedFrames = (game.consecutiveClosedFrames || 0) + 1;
      game.consecutiveOpenFrames = 0;
    }

    // Require at least 3 consecutive open frames to trigger watering.
    // If closed even for 1 frame, immediately stop watering!
    game.isHandOpen = (game.consecutiveOpenFrames >= 3);
    game.trackingQuality = `Tangan: ${game.isHandOpen ? "Terbuka 🖐️ (Menyiram)" : "Tertutup ✊ (Membidik)"} (${openFingers}/5 jari)`;

    // Jika pose landmarking terhalang/miss, gunakan elevasi vertikal tangan sebagai fallback ROM
    if (!estimate) {
      const handElevationAngle = clamp(
        Math.round(((0.82 - palmY) / 0.66) * 135 + 24),
        15,
        175
      );
      game.rawAngle      = handElevationAngle;
      game.controlAngle  = stabilizeClinicalAngle(handElevationAngle, game.controlAngle);
      game.displayAngle  = game.controlAngle;
      game.clinicalAngle = stabilizeClinicalAngle(handElevationAngle, game.clinicalAngle);
      game.cameraAngle   = game.controlAngle;
    }
  } else {
    game.lostHandFrames = (game.lostHandFrames || 0) + 1;
    game.consecutiveOpenFrames = 0;
    game.isHandOpen = false;

    // Fallback pointer movement to wrist from PoseLandmarker so user can still aim
    if (game.posePoints?.wrist) {
      updateHandFollow(game.posePoints.wrist);
      game.trackingQuality = "Membidik dengan pergelangan tangan (Tangan ✊)";
    } else if (game.lostHandFrames > 12) {
      game.handFollow.visible = false;
      game.trackingQuality = "Arahkan tangan ke kamera";
    }
  }
}

function getPoseAspectRatio() {
  const w = ui.cameraPreview?.videoWidth || 1280;
  const h = ui.cameraPreview?.videoHeight || 720;
  return w / h;
}

function angleBetweenVectors(a, b) {
  const dot = a.x * b.x + a.y * b.y;
  const magA = Math.hypot(a.x, a.y);
  const magB = Math.hypot(b.x, b.y);
  if (magA < 1e-6 || magB < 1e-6) return 0;
  const cosine = Math.max(-1, Math.min(1, dot / (magA * magB)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

function stabilizeClinicalAngle(raw, prev) {
  const diff = raw - prev, abs = Math.abs(diff);
  if (abs < 0.6) return prev;
  if (Math.abs(raw - game.targetRom) <= 1.8 && Math.abs(prev - game.targetRom) <= 4) return game.targetRom;
  const alpha = abs > 18 ? 0.65 : abs > 7 ? 0.50 : 0.35;
  return prev + diff * alpha;
}

/* ── Arm ROM estimation ──────────────────────────────────────── */
function estimateArmRaiseRom(landmarks) {
  const right = estimateSideRom(landmarks, { side: "right", shoulder: 12, elbow: 14, wrist: 16, hip: 24, oppositeShoulder: 11, pinky: 18, index: 20, thumb: 22 });
  const left  = estimateSideRom(landmarks, { side: "left",  shoulder: 11, elbow: 13, wrist: 15, hip: 23, oppositeShoulder: 12, pinky: 17, index: 19, thumb: 21 });
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
  const pinky    = ids.pinky !== undefined ? landmarks[ids.pinky] : null;
  const index    = ids.index !== undefined ? landmarks[ids.index] : null;
  const thumb    = ids.thumb !== undefined ? landmarks[ids.thumb] : null;

  // Landmark wajib: shoulder dan wrist. Hip opsional (seperti Apple Archery).
  if (!shoulder || !wrist) return null;

  const shoulderVis = shoulder?.visibility ?? 0;
  const wristVis    = wrist?.visibility ?? 0;
  const hipVis      = hip?.visibility ?? 0;

  // Gunakan rata-rata visibility alih-alih Math.min agar satu landmark rendah tidak membatalkan
  const confidence = hip
    ? (shoulderVis + wristVis + hipVis) / 3
    : (shoulderVis + wristVis) / 2;

  if (confidence < 0.12) return null;

  const aspect = getPoseAspectRatio();

  // Jika hip tidak tersedia di frame (misal posisi duduk di depan laptop),
  // perkirakan posisi hip dari shoulder
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
  const clinicalAngle  = elbow ? clamp(180 - angleFromTorso, 0, 180) : game.clinicalAngle;
  const controlAngle   = clinicalAngle; // Direct clinical shoulder flexion angle
  const shoulderHike   = opp ? shoulder.y < opp.y - 0.045 && controlAngle < game.targetRom : false;

  return {
    side: ids.side, angle: controlAngle, controlAngle, clinicalAngle,
    compensation: shoulderHike, confidence, score: confidence * 100 + controlAngle,
    points: { shoulder, elbow, wrist, hip, pinky, index, thumb },
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
  game.handFollow.x = game.handFollow.x * 0.18 + mx * 0.82;
  game.handFollow.y = game.handFollow.y * 0.18 + my * 0.82;
  game.handFollow.visible = true;
}

/* ═══════════════════════════════════════════════════════════════
   GAMEPLAY & WATERING LOGIC (Ketentuan Task.md)
   • Tangan Terbuka + Range Pot  -> Menyiram air
   • Tangan Tertutup             -> Hanya mengarahkan pointer
   ═══════════════════════════════════════════════════════════════ */

/** Returns current active unwatered pot, or null if all watered */
function getActivePot() {
  for (let i = game.activePotIdx; i < game.pots.length; i++) {
    if (!game.pots[i].watered) { game.activePotIdx = i; return game.pots[i]; }
  }
  for (let i = 0; i < game.pots.length; i++) {
    if (!game.pots[i].watered) { game.activePotIdx = i; return game.pots[i]; }
  }
  return null;
}

/**
 * Returns the target pot: prioritizes whichever unwatered pot the user is closest to,
 * or falls back to the sequential active pot.
 */
function getTargetPot() {
  const W = canvas.clientWidth || 1280;
  const H = canvas.clientHeight || 720;
  let closestPot = null;
  let closestDist = Infinity;

  for (let i = 0; i < game.pots.length; i++) {
    const p = game.pots[i];
    if (!p.watered) {
      const potY = p.y - 0.02;
      const dxCan = game.handFollow.x - p.x;
      const dyCan = game.handFollow.y - potY;
      const distCan = Math.hypot(dxCan, dyCan);

      const dxTip = (game.canTipPos.x / W) - p.x;
      const dyTip = (game.canTipPos.y / H) - potY;
      const distTip = Math.hypot(dxTip, dyTip);

      const d = Math.min(distCan, distTip);
      if (d < closestDist) {
        closestDist = d;
        closestPot = p;
      }
    }
  }

  // If user reached near any unwatered pot within close range (~100px), lock onto that pot
  if (closestPot && closestDist < 0.082) {
    const idx = game.pots.indexOf(closestPot);
    if (idx !== -1) game.activePotIdx = idx;
    return closestPot;
  }

  return getActivePot();
}

function updateWateringLogic(dt) {
  if (!game.running || game.painStop) {
    if (game.isWatering) {
      game.isWatering = false;
      audio.stopWaterSound();
    }
    return;
  }

  const pot = getTargetPot();
  if (!pot) {
    if (game.isWatering) {
      game.isWatering = false;
      audio.stopWaterSound();
    }
    return;
  }

  // Set current therapeutic target ROM for this pot
  game.targetRom = pot.requiredRom;

  if (!game.handFollow.visible || game.targetCooldown > 0) {
    if (game.isWatering) {
      game.isWatering = false;
      audio.stopWaterSound();
    }
    return;
  }

  // Calculate distance between watering can (body and spout tip) and pot
  const W = canvas.clientWidth || 1280;
  const H = canvas.clientHeight || 720;
  const potY = pot.y - 0.02;

  const dxCan = game.handFollow.x - pot.x;
  const dyCan = game.handFollow.y - potY;
  const distCan = Math.hypot(dxCan, dyCan);

  const dxTip = (game.canTipPos.x / W) - pot.x;
  const dyTip = (game.canTipPos.y / H) - potY;
  const distTip = Math.hypot(dxTip, dyTip);

  const dist = Math.min(distCan, distTip);
  const POT_RANGE = 0.075; // Adjusted tightly to pot proximity (~95px at 1280 width)
  const inRange = dist < POT_RANGE;
  game.potInRange = inRange;

  // Evaluasi kesesuaian ROM tangan dengan ROM Target pot
  const currentRom = Math.round(game.clinicalAngle);
  const targetRom  = pot.requiredRom;

  // Toleransi terapeutik klinis (misal Target 30°, jangkauan valid 24° - 37°)
  const ROM_UNDER_TOLERANCE = 6;
  const ROM_OVER_TOLERANCE  = 8;
  const isRomMatched = (currentRom >= targetRom - ROM_UNDER_TOLERANCE) && (currentRom <= targetRom + ROM_OVER_TOLERANCE);
  game.isRomMatched = isRomMatched;

  /* ── Evaluasi Ketentuan Task.md & Penyesuaian ROM Target ──
     1. Posisi gembor harus dalam jangkauan pot (inRange)
     2. Tangan harus terbuka (game.isHandOpen)
     3. ROM tangan harus sesuai dengan ROM Target pot (isRomMatched)
  */
  if (inRange) {
    if (game.isHandOpen) {
      if (isRomMatched) {
        // Tangan terbuka + Dalam range pot + ROM tangan sesuai ROM Target pot! -> Lakukan penyiraman air!
        game.isWatering = true;
        audio.startWaterSound();

        // Isi progress air pot (~1.1 detik pengisian stabil)
        pot.waterProgress = Math.min(1.0, (pot.waterProgress || 0) + dt * 0.92);
        setFeedback("good", "Menyiram Tanaman! 💧", `ROM Sesuai: ${currentRom}° = Target ${targetRom}° (Pertahankan!)`);

        if (pot.waterProgress >= 1.0) {
          waterPot(pot);
        }
      } else if (currentRom < targetRom - ROM_UNDER_TOLERANCE) {
        // ROM tangan masih kurang dari ROM target
        game.isWatering = false;
        audio.stopWaterSound();
        setFeedback("warn", "Angkat Lengan Lebih Tinggi ⬆️", `Target Pot: ${targetRom}° | ROM Tangan Anda: ${currentRom}°`);
      } else {
        // ROM tangan melebihi ROM target
        game.isWatering = false;
        audio.stopWaterSound();
        setFeedback("warn", "Turunkan Sedikit Lengan ⬇️", `Target Pot: ${targetRom}° | ROM Tangan Anda: ${currentRom}°`);
      }
    } else {
      // 2. TANGAN TERTUTUP (FIST / MENGEPAL)
      // Hanya berfungsi untuk mengarahkan pointer saja (tidak menyiram air)
      game.isWatering = false;
      audio.stopWaterSound();

      if (isRomMatched) {
        setFeedback("neutral", "ROM Tepat 🎯 Buka Tangan!", `ROM Tangan ${currentRom}° = Target ${targetRom}°. Buka tanganmu untuk mulai menyiram!`);
      } else if (currentRom < targetRom - ROM_UNDER_TOLERANCE) {
        setFeedback("neutral", "Membidik Pot 🎯", `Angkat lengan ke ${targetRom}° (Saat ini: ${currentRom}°) lalu buka tangan`);
      } else {
        setFeedback("neutral", "Membidik Pot 🎯", `Turunkan lengan ke ${targetRom}° (Saat ini: ${currentRom}°) lalu buka tangan`);
      }
    }
  } else {
    // Di luar jangkauan pot
    game.isWatering = false;
    audio.stopWaterSound();

    if (game.isHandOpen) {
      setFeedback("warn", "Di Luar Jangkauan", `Arahkan gembor mendekati pot sasaran (Target: ${targetRom}°)`);
    } else {
      setFeedback("neutral", "Membidik Pointer ✊", `Arahkan gembor menuju pot sasaran (Target: ${targetRom}°)`);
    }
  }
}

function waterPot(pot) {
  pot.watered = true;
  game.isWatering = false;
  audio.stopWaterSound();
  audio.playChime();

  game.completedPots += 1;
  game.reps = Math.min(game.repsGoal, game.completedPots);
  const earnedScore = Math.round(120 + Math.max(0, game.cameraAngle - pot.requiredRom) * 3 + game.level * 15);
  game.score += earnedScore;
  game.targetHitFlash = 1;
  game.targetCooldown = 0.65;

  // Floating score popup
  game.floatingPopups.push({
    x: pot.x,
    y: pot.y - 0.06,
    text: `+${earnedScore}`,
    subText: "Disiram! 🌸",
    life: 1.0,
  });

  // Celebration burst particles
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.012 + Math.random() * 0.024;
    pot.waterParticles.push({
      x: pot.x,
      y: pot.y - 0.02,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.012,
      life: 1.0,
      size: 3 + Math.random() * 5,
      color: Math.random() > 0.4 ? "#38bdf8" : (Math.random() > 0.5 ? "#f59e0b" : "#4ade80"),
    });
  }

  // Level up every 3 pots
  if (game.completedPots % 3 === 0) {
    game.level = Math.min(9, game.level + 1);
  }

  // Advance to next pot
  game.activePotIdx += 1;
  setFeedback("good", "Pot Berhasil Disiram! 🌸", "Bagus sekali! Lanjut ke pot berikutnya");

  if (game.reps >= game.repsGoal) {
    game.running = false;
    setFeedback("good", "Kebun Berhasil Dipulihkan! 🌻", `Semua ${game.completedPots} pot telah selesai disiram`);
  }
}

/* ═══════════════════════════════════════════════════════════════
   DRAWING — GARDEN SCENE & OBJECTS
   ═══════════════════════════════════════════════════════════════ */

function draw() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);
  drawGardenScene(W, H);
  drawGardenProgress(W, H);
  drawFence(W, H);
  drawPots(W, H);
  drawWaterStreams(W, H);
  drawSplashParticles(W, H);
  drawWateringCan(W, H);
  drawFloatingPopups(W, H);
}

/* ── Sky + ground ────────────────────────────────────────────── */
function drawGardenScene(W, H) {
  // Sky gradient
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

  // Garden bed border
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

/* ── Progress & fence ────────────────────────────────────────── */
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
  ctx.strokeStyle = "#b8915a";
  ctx.lineWidth = 5;
  [0, 14].forEach((off) => {
    ctx.beginPath();
    ctx.moveTo(W * 0.06, y0 + off);
    ctx.lineTo(W * 0.94, y0 + off);
    ctx.stroke();
  });
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

/* ── Pot drawing & growth ────────────────────────────────────── */
function drawPots(W, H) {
  const activePot = getTargetPot();
  const now = performance.now();

  game.pots.forEach((pot) => {
    const px = pot.x * W;
    const py = pot.y * H;
    const isActive  = pot === activePot;
    const isWatered = pot.watered;

    // Growth animation
    if (isWatered && pot.growPct < 1) {
      pot.growPct = Math.min(1, pot.growPct + 0.016);
    }

    /* ── Pot body ── */
    const potW = 34, potH = 28;
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

    // Soil (darker when moist/watered)
    const isMoist = isWatered || (pot.waterProgress > 0.1);
    ctx.fillStyle = isMoist ? "#3a2210" : "#523318";
    ctx.beginPath();
    ctx.ellipse(px, py + 3, potW * 0.42, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    /* ── Plant rendering ── */
    if (!isWatered) {
      // Wilted stem
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
      // Flourishing plant & flower
      const h = pot.growPct * 52;
      ctx.strokeStyle = "#3a9a2a";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.bezierCurveTo(px - 4, py - h * 0.3, px + 6, py - h * 0.6, px, py - h);
      ctx.stroke();

      if (pot.growPct > 0.25) {
        const lAlpha = Math.min(1, (pot.growPct - 0.25) / 0.4);
        ctx.globalAlpha = lAlpha;
        ctx.fillStyle = "#4ac83a";
        [[px - 18, py - h * 0.55, 0.6], [px + 16, py - h * 0.7, -0.5], [px - 12, py - h, 0.8]].forEach(([lx, ly, rot]) => {
          ctx.save(); ctx.translate(lx, ly); ctx.rotate(rot);
          ctx.beginPath(); ctx.ellipse(0, 0, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });

        if (pot.growPct > 0.65) {
          const fAlpha = Math.min(1, (pot.growPct - 0.65) / 0.35);
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

    /* ── Active pot target glow & range halo ── */
    if (isActive && !isWatered) {
      const pulse = 1 + Math.sin(now / 220) * 0.07;
      const glow = ctx.createRadialGradient(px, py - 10, 6, px, py - 10, 60 * pulse);
      glow.addColorStop(0, "rgba(56,189,248,0.45)");
      glow.addColorStop(0.5,"rgba(56,189,248,0.18)");
      glow.addColorStop(1, "rgba(56,189,248,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(px, py - 10, 62 * pulse, 0, Math.PI * 2); ctx.fill();

      // Dashed proximity circle (matched to POT_RANGE)
      ctx.strokeStyle = game.potInRange
        ? `rgba(52, 211, 153, ${0.85 + Math.sin(now / 150) * 0.15})`
        : `rgba(56, 189, 248, ${0.45 + Math.sin(now / 220) * 0.2})`;
      ctx.lineWidth = game.potInRange ? 3.5 : 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(px, py - 10, 44 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

      // Required ROM badge under pot (dynamic matching feedback)
      const curRom = Math.round(game.clinicalAngle);
      const isRomOk = Math.abs(curRom - pot.requiredRom) <= 7;
      let badgeText = `${pot.requiredRom}° Flexion`;
      let badgeBg = "rgba(16,32,43,0.88)";
      let badgeBorder = "rgba(255,255,255,0.28)";

      if (game.potInRange) {
        if (isRomOk) {
          badgeText = `✓ ${pot.requiredRom}° ROM TEPAT`;
          badgeBg = "rgba(6, 95, 70, 0.95)";
          badgeBorder = "#34d399";
        } else if (curRom < pot.requiredRom) {
          badgeText = `⬆️ ${pot.requiredRom}° (Lengan: ${curRom}°)`;
          badgeBg = "rgba(154, 52, 18, 0.95)";
          badgeBorder = "#fb923c";
        } else {
          badgeText = `⬇️ ${pot.requiredRom}° (Lengan: ${curRom}°)`;
          badgeBg = "rgba(154, 52, 18, 0.95)";
          badgeBorder = "#fb923c";
        }
      }

      ctx.save();
      ctx.font = "800 11px Inter, sans-serif";
      const bTextWidth = ctx.measureText(badgeText).width;
      const bw = Math.max(92, bTextWidth + 20);

      ctx.fillStyle = badgeBg;
      ctx.beginPath();
      ctx.roundRect(px - bw / 2, py + potH + 8, bw, 24, 8);
      ctx.fill();
      ctx.strokeStyle = badgeBorder;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText(badgeText, px, py + potH + 24);
      ctx.restore();

      // Water filling circular gauge
      if (pot.waterProgress > 0) {
        drawWateringGauge(W, H, pot);
      }
    }

    // Success checkmark on completed pots
    if (isWatered && pot.growPct >= 0.95) {
      ctx.fillStyle = "rgba(26,158,85,0.92)";
      ctx.beginPath(); ctx.arc(px + 20, py - 32, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(px + 15, py - 32); ctx.lineTo(px + 19, py - 27); ctx.lineTo(px + 26, py - 38);
      ctx.stroke();
    }

    // Pot burst particles
    pot.waterParticles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.0015;
      p.life -= 0.022;
      const alpha = Math.max(0, p.life);
      ctx.fillStyle = p.color || `rgba(80,180,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    });
    pot.waterParticles = pot.waterParticles.filter((p) => p.life > 0);
  });
}

function drawWateringGauge(W, H, pot) {
  const px = pot.x * W;
  const py = pot.y * H - 10;
  const r = 38;

  ctx.save();
  // Circular track
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(15, 23, 42, 0.45)";
  ctx.lineWidth = 6;
  ctx.stroke();

  // Progress arc
  const startA = -Math.PI / 2;
  const endA = startA + pot.waterProgress * Math.PI * 2;
  const grad = ctx.createLinearGradient(px - r, py - r, px + r, py + r);
  grad.addColorStop(0, "#38bdf8");
  grad.addColorStop(1, "#10b981");

  ctx.beginPath();
  ctx.arc(px, py, r, startA, endA);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.stroke();

  // Percentage badge
  ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
  ctx.beginPath();
  ctx.roundRect(px - 22, py - 10, 44, 18, 9);
  ctx.fill();
  ctx.fillStyle = "#38bdf8";
  ctx.font = "800 10px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${Math.round(pot.waterProgress * 100)}%`, px, py);
  ctx.restore();
}

/* ═══════════════════════════════════════════════════════════════
   POINTER: WATERING CAN (GEMBOR PENYIRAM TANAMAN)
   ═══════════════════════════════════════════════════════════════ */

function drawWateringCan(W, H) {
  if (!game.handFollow.visible) return;
  const hx = game.handFollow.x * W;
  const hy = game.handFollow.y * H;
  const now = performance.now();
  const pot = getTargetPot();

  // Determine spout direction: points toward the active pot
  const potX = pot ? pot.x * W : hx - 100;
  const isFacingLeft = potX <= hx;

  // Tilt animation:
  // When watering: tilt forward towards pot (-32° / -0.55 rad)
  // When aiming (closed hand): upright with subtle breathing
  const targetTilt = game.isWatering
    ? (isFacingLeft ? -0.58 : 0.58)
    : Math.sin(now / 380) * 0.035;
  game.canTiltAngle += (targetTilt - game.canTiltAngle) * 0.18;

  ctx.save();
  ctx.translate(hx, hy);
  if (!isFacingLeft) {
    ctx.scale(-1, 1);
  }
  ctx.rotate(isFacingLeft ? game.canTiltAngle : -game.canTiltAngle);

  // 1. Drop shadow under can
  ctx.save();
  ctx.fillStyle = "rgba(10, 25, 30, 0.20)";
  ctx.beginPath();
  ctx.ellipse(0, 32, 28, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Rear C-shaped Handle
  ctx.beginPath();
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 4.5;
  ctx.lineCap = "round";
  ctx.bezierCurveTo(20, -10, 35, -4, 35, 14);
  ctx.bezierCurveTo(35, 26, 24, 28, 14, 26);
  ctx.stroke();

  // Handle metallic highlight
  ctx.beginPath();
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 1.8;
  ctx.bezierCurveTo(20, -9, 33, -4, 33, 14);
  ctx.bezierCurveTo(33, 25, 24, 26, 16, 25);
  ctx.stroke();

  // 3. Spout (Long angled tube pointing forward/up)
  ctx.save();
  const spoutGrad = ctx.createLinearGradient(-12, 10, -48, -26);
  spoutGrad.addColorStop(0, "#0f766e");
  spoutGrad.addColorStop(0.5, "#14b8a6");
  spoutGrad.addColorStop(1, "#0d9488");
  ctx.fillStyle = spoutGrad;
  ctx.strokeStyle = "#042f2e";
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(-8, 18);
  ctx.lineTo(-44, -20);
  ctx.lineTo(-48, -27);
  ctx.lineTo(-42, -31);
  ctx.lineTo(-6, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Spout highlight line
  ctx.beginPath();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
  ctx.lineWidth = 1.2;
  ctx.moveTo(-8, 11);
  ctx.lineTo(-43, -24);
  ctx.stroke();
  ctx.restore();

  // 4. Sprinkler Rose Head (Shower head at end of spout)
  ctx.save();
  ctx.translate(-46, -28);
  ctx.rotate(-0.75); // Angle facing down

  // Conical flare
  const roseCone = ctx.createLinearGradient(-8, 0, 8, 0);
  roseCone.addColorStop(0, "#b45309");
  roseCone.addColorStop(0.5, "#f59e0b");
  roseCone.addColorStop(1, "#78350f");
  ctx.fillStyle = roseCone;
  ctx.beginPath();
  ctx.moveTo(-4, -6);
  ctx.lineTo(4, -6);
  ctx.lineTo(8, 2);
  ctx.lineTo(-8, 2);
  ctx.closePath();
  ctx.fill();

  // Perforated brass plate face
  const roseFace = ctx.createRadialGradient(0, 3, 1, 0, 3, 10);
  roseFace.addColorStop(0, "#fef08a");
  roseFace.addColorStop(0.7, "#eab308");
  roseFace.addColorStop(1, "#a16207");
  ctx.fillStyle = roseFace;
  ctx.beginPath();
  ctx.ellipse(0, 3, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#713f12";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Shower holes
  ctx.fillStyle = "#451a03";
  [[-4, 3], [-1, 2], [2, 2], [5, 3], [-2, 4], [2, 4], [0, 3]].forEach(([sx, sy]) => {
    ctx.beginPath();
    ctx.arc(sx, sy, 0.75, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  // 5. Main Body of Can
  const bodyGrad = ctx.createLinearGradient(-22, -16, 22, 24);
  bodyGrad.addColorStop(0, "#115e59");
  bodyGrad.addColorStop(0.25, "#14b8a6");
  bodyGrad.addColorStop(0.65, "#0d9488");
  bodyGrad.addColorStop(1, "#042f2e");
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = "#022c22";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.roundRect(-20, -14, 40, 42, [8, 8, 10, 10]);
  ctx.fill();
  ctx.stroke();

  // Embossed metallic bands
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 1.5;
  [-4, 12].forEach((ry) => {
    ctx.beginPath();
    ctx.moveTo(-18, ry);
    ctx.lineTo(18, ry);
    ctx.stroke();
  });
  ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
  [-2, 14].forEach((ry) => {
    ctx.beginPath();
    ctx.moveTo(-18, ry);
    ctx.lineTo(18, ry);
    ctx.stroke();
  });

  // Specular shine strip
  const shineGrad = ctx.createLinearGradient(-6, -14, 2, 28);
  shineGrad.addColorStop(0, "rgba(255,255,255,0.45)");
  shineGrad.addColorStop(0.5, "rgba(255,255,255,0.18)");
  shineGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = shineGrad;
  ctx.beginPath();
  ctx.roundRect(-8, -12, 6, 38, 3);
  ctx.fill();

  // Sprout emblem on can
  ctx.fillStyle = "#86efac";
  ctx.beginPath();
  ctx.ellipse(2, 4, 4, 7, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(8, 2, 3, 5, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#166534";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(4, 11);
  ctx.quadraticCurveTo(4, 6, 2, 4);
  ctx.stroke();

  // 6. Top Arched Handle
  ctx.beginPath();
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.moveTo(-14, -14);
  ctx.bezierCurveTo(-14, -34, 16, -34, 16, -14);
  ctx.stroke();

  // Wooden grip on handle
  ctx.save();
  const woodGrad = ctx.createLinearGradient(-5, -34, 5, -28);
  woodGrad.addColorStop(0, "#78350f");
  woodGrad.addColorStop(0.5, "#d97706");
  woodGrad.addColorStop(1, "#451a03");
  ctx.fillStyle = woodGrad;
  ctx.beginPath();
  ctx.roundRect(-6, -35, 14, 6, 2);
  ctx.fill();
  ctx.restore();

  // Compute world nozzle tip location for water emission
  const localRoseX = isFacingLeft ? -52 : 52;
  const localRoseY = -30;
  const curAngle = isFacingLeft ? game.canTiltAngle : -game.canTiltAngle;
  const cosA = Math.cos(curAngle);
  const sinA = Math.sin(curAngle);
  game.canTipPos.x = hx + (cosA * localRoseX - sinA * localRoseY);
  game.canTipPos.y = hy + (sinA * localRoseX + cosA * localRoseY);

  ctx.restore();

  // 7. Mini floating gesture badge near pointer
  drawCanFloatingBadge(hx, hy);
}

function drawCanFloatingBadge(hx, hy) {
  const badgeY = hy - 48;
  const badgeX = hx;
  ctx.save();
  ctx.font = "800 11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const curRom = Math.round(game.clinicalAngle);
  const pot = getTargetPot();
  const tRom = pot ? pot.requiredRom : 30;

  let text = `✊ MEMBIDIK (${curRom}°)`;
  let bgGrad;
  let borderColor;
  let textColor = "#ffffff";

  if (game.isWatering) {
    text = `🖐️ MENYIRAM (${curRom}° / ${tRom}°)`;
    borderColor = "rgba(52, 211, 153, 0.95)";
    bgGrad = ctx.createLinearGradient(badgeX - 55, badgeY, badgeX + 55, badgeY);
    bgGrad.addColorStop(0, "#059669");
    bgGrad.addColorStop(1, "#10b981");
  } else if (game.isHandOpen) {
    if (game.potInRange && !game.isRomMatched) {
      text = `⚠️ SESUAIKAN ROM (${curRom}° ➔ ${tRom}°)`;
      borderColor = "rgba(245, 158, 11, 0.95)";
      bgGrad = ctx.createLinearGradient(badgeX - 65, badgeY, badgeX + 65, badgeY);
      bgGrad.addColorStop(0, "#b45309");
      bgGrad.addColorStop(1, "#f59e0b");
    } else {
      text = `🖐️ TERBUKA (${curRom}°)`;
      borderColor = "rgba(56, 189, 248, 0.9)";
      bgGrad = ctx.createLinearGradient(badgeX - 45, badgeY, badgeX + 45, badgeY);
      bgGrad.addColorStop(0, "#0284c7");
      bgGrad.addColorStop(1, "#38bdf8");
    }
  } else {
    if (game.potInRange && game.isRomMatched) {
      text = `🎯 ROM TEPAT (${curRom}°)! BUKA TANGAN`;
      borderColor = "rgba(16, 185, 129, 0.9)";
      bgGrad = ctx.createLinearGradient(badgeX - 65, badgeY, badgeX + 65, badgeY);
      bgGrad.addColorStop(0, "#065f46");
      bgGrad.addColorStop(1, "#059669");
    } else {
      text = `✊ MEMBIDIK (${curRom}°)`;
      borderColor = "rgba(148, 163, 184, 0.65)";
      bgGrad = ctx.createLinearGradient(badgeX - 45, badgeY, badgeX + 45, badgeY);
      bgGrad.addColorStop(0, "rgba(30, 41, 59, 0.92)");
      bgGrad.addColorStop(1, "rgba(51, 65, 85, 0.92)");
    }
  }

  const textWidth = ctx.measureText(text).width;
  const pad = 12;
  const bw = textWidth + pad * 2;
  const bh = 22;

  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  ctx.roundRect(badgeX - bw / 2, badgeY - bh / 2, bw, bh, 11);
  ctx.fill();

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.fillText(text, badgeX, badgeY + 1);
  ctx.restore();
}

/* ═══════════════════════════════════════════════════════════════
   WATER STREAM & SPLASH ANIMATIONS
   ═══════════════════════════════════════════════════════════════ */

function drawWaterStreams(W, H) {
  if (!game.isWatering) return;
  const pot = getTargetPot();
  if (!pot) return;

  const startX = game.canTipPos.x;
  const startY = game.canTipPos.y;
  const targetX = pot.x * W;
  const targetY = pot.y * H - 8;
  const now = performance.now();

  ctx.save();
  // 5 curved water streams with dynamic physics
  for (let i = 0; i < 5; i++) {
    const spreadX = (i - 2) * 5;
    const wave = Math.sin(now * 0.015 + i * 1.3) * 4;
    const endX = targetX + spreadX;
    const endY = targetY;

    const dx = endX - startX;
    const dy = endY - startY;
    const cp1x = startX + dx * 0.25;
    const cp1y = startY + dy * 0.15 - 15 + wave;
    const cp2x = startX + dx * 0.7;
    const cp2y = startY + dy * 0.55 + wave * 0.5;

    const grad = ctx.createLinearGradient(startX, startY, endX, endY);
    grad.addColorStop(0, "rgba(224, 242, 254, 0.95)");
    grad.addColorStop(0.3, "rgba(56, 189, 248, 0.85)");
    grad.addColorStop(0.7, "rgba(14, 165, 233, 0.75)");
    grad.addColorStop(1, "rgba(3, 105, 161, 0.6)");

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5 - Math.abs(i - 2) * 0.4;
    ctx.lineCap = "round";
    ctx.stroke();

    // Flowing droplets traveling along streams
    for (let d = 0; d < 3; d++) {
      const t = ((now * 0.0018 + d * 0.33 + i * 0.18) % 1);
      const bx = Math.pow(1 - t, 3) * startX +
                 3 * Math.pow(1 - t, 2) * t * cp1x +
                 3 * (1 - t) * Math.pow(t, 2) * cp2x +
                 Math.pow(t, 3) * endX;
      const by = Math.pow(1 - t, 3) * startY +
                 3 * Math.pow(1 - t, 2) * t * cp1y +
                 3 * (1 - t) * Math.pow(t, 2) * cp2y +
                 Math.pow(t, 3) * endY;
      ctx.fillStyle = "#e0f2fe";
      ctx.beginPath();
      ctx.arc(bx, by, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // Emit splash particles at pot soil impact point
  if (Math.random() < 0.7) {
    game.splashParticles.push({
      x: targetX + (Math.random() - 0.5) * 16,
      y: targetY + (Math.random() - 0.5) * 6,
      vx: (Math.random() - 0.5) * 3.5,
      vy: -Math.random() * 3.5 - 1.2,
      radius: 1.5 + Math.random() * 2.5,
      life: 1.0,
    });
  }
}

function drawSplashParticles(W, H) {
  game.splashParticles.forEach((p) => {
    ctx.fillStyle = `rgba(186, 230, 253, ${p.life * 0.9})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawFloatingPopups(W, H) {
  game.floatingPopups.forEach((p) => {
    const px = p.x * W;
    const py = p.y * H;
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.textAlign = "center";
    ctx.font = "900 18px Inter, sans-serif";
    ctx.fillStyle = "#f59e0b";
    ctx.fillText(p.text, px, py);
    if (p.subText) {
      ctx.font = "700 12px Inter, sans-serif";
      ctx.fillStyle = "#34d399";
      ctx.fillText(p.subText, px, py + 16);
    }
    ctx.restore();
  });
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
  if (!game.cameraStream) return "Menunggu kamera";
  if (!game.running) return game.trackingQuality;
  const clinical = Math.round(game.clinicalAngle);
  const pot = getTargetPot();
  if (!pot) return "Semua pot telah disiram!";
  const diff = clinical - pot.requiredRom;
  if (Math.abs(diff) <= 7) return `ROM Tepat ✓ (${clinical}° = Target ${pot.requiredRom}°)`;
  if (diff < 0) return `Angkat lengan ${Math.abs(diff)}° lagi (Target: ${pot.requiredRom}°)`;
  return `Turunkan lengan ${diff}° (Target: ${pot.requiredRom}°)`;
}

function syncHud() {
  const curRom = Math.round(game.displayAngle);
  const tRom   = Math.round(game.targetRom);

  ui.score.textContent = String(game.score);
  ui.time.textContent  = formatTime(game.timeRemaining);
  ui.level.textContent = String(game.level);
  ui.reps.textContent  = String(game.reps);
  ui.rom.textContent   = String(curRom);
  ui.target.textContent = `Target ${tRom}`;
  ui.romStatus.textContent = getRomStatus();
  ui.feedback.className = `feedback ${game.feedbackKind}`;
  ui.feedbackTitle.textContent = game.feedbackTitle;
  ui.feedbackText.textContent  = game.feedbackText;

  // Dynamic ROM meter UI in top-right corner (Apple Archery style)
  if (ui.romMeter) {
    const isMatched = Math.abs(curRom - tRom) <= 7;
    const progressPct = clamp(Math.round((curRom / (tRom || 1)) * 100), 0, 100);

    if (isMatched) {
      ui.romMeter.style.background = `conic-gradient(from 210deg, #10b981 0%, #34d399 ${progressPct}%, rgba(255,255,255,0.2) ${progressPct}%), var(--surface)`;
      ui.rom.style.color = "#34d399";
      ui.romMeter.style.boxShadow = "0 0 24px rgba(52, 211, 153, 0.45)";
    } else if (curRom > tRom + 7) {
      ui.romMeter.style.background = `conic-gradient(from 210deg, #f59e0b 0%, #fb923c 100%), var(--surface)`;
      ui.rom.style.color = "#fb923c";
      ui.romMeter.style.boxShadow = "0 0 16px rgba(245, 158, 11, 0.35)";
    } else {
      ui.romMeter.style.background = `conic-gradient(from 210deg, var(--accent) 0%, var(--accent-2) ${progressPct}%, rgba(255,255,255,0.15) ${progressPct}%), var(--surface)`;
      ui.rom.style.color = "var(--accent)";
      ui.romMeter.style.boxShadow = "var(--shadow-md)";
    }
  }

  // Sync gesture card status
  if (ui.gestureCard && ui.gestureBadge && ui.rangeBadge) {
    const curRom = Math.round(game.clinicalAngle);
    const pot = getTargetPot();
    const tRom = pot ? pot.requiredRom : 30;

    if (game.isWatering) {
      ui.gestureCard.className = "gesture-card open";
      ui.gestureBadge.textContent = "🖐️ Terbuka (Menyiram)";
      ui.rangeBadge.textContent = `💧 ROM Sesuai: ${curRom}° / Target ${tRom}°`;
    } else if (game.isHandOpen) {
      ui.gestureCard.className = "gesture-card open";
      ui.gestureBadge.textContent = "🖐️ Tangan Terbuka";
      if (!game.potInRange) {
        ui.rangeBadge.textContent = `↔️ Dekatkan ke pot (Target ${tRom}°)`;
      } else if (game.isRomMatched) {
        ui.rangeBadge.textContent = `💧 ROM Tepat: ${curRom}° (Menyiram!)`;
      } else if (curRom < tRom) {
        ui.rangeBadge.textContent = `⬆️ Angkat Lengan (${curRom}° ➔ ${tRom}°)`;
      } else {
        ui.rangeBadge.textContent = `⬇️ Turunkan Lengan (${curRom}° ➔ ${tRom}°)`;
      }
    } else {
      ui.gestureCard.className = "gesture-card closed";
      ui.gestureBadge.textContent = "✊ Tangan Tertutup";
      if (game.potInRange && game.isRomMatched) {
        ui.rangeBadge.textContent = `🎯 ROM Sesuai (${curRom}°)! Buka tangan untuk menyiram`;
      } else if (game.potInRange) {
        ui.rangeBadge.textContent = `🎯 Dekat Pot: Sesuaikan ROM ke ${tRom}° (${curRom}°)`;
      } else {
        ui.rangeBadge.textContent = `Mode: Membidik Pointer (ROM: ${curRom}°)`;
      }
    }
  }
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
  game.lostHandFrames  = 0;
  game.lastPoseAt      = 0;
  game.poseBusy        = false;
  game.handFollow      = { x: 0.5, y: 0.55, visible: false };
  game.handDetected    = false;
  game.isHandOpen      = false;
  game.consecutiveOpenFrames = 0;
  game.consecutiveClosedFrames = 0;
  game.isWatering      = false;
  game.potInRange      = false;
  game.canTiltAngle    = 0;
  game.splashParticles = [];
  game.floatingPopups  = [];
  game.pots            = makePots();
  game.activePotIdx    = 0;
  game.completedPots   = 0;
  audio.stopWaterSound();
  setFeedback("neutral", "Siap Memulai", "Tekan Start Camera untuk mulai menyiram kebun");
}

/* ═══════════════════════════════════════════════════════════════
   MAIN ANIMATION LOOP
   ═══════════════════════════════════════════════════════════════ */
function tick(now) {
  const dt = Math.min(0.05, (now - game.lastTick) / 1000);
  game.lastTick = now;

  if (game.running && !game.painStop) {
    game.timeRemaining = Math.max(0, game.timeRemaining - dt);
    if (game.timeRemaining <= 0 || game.reps >= game.repsGoal) {
      game.running = false;
      audio.stopWaterSound();
      setFeedback("good", "Sesi Selesai! 🌸", `${game.completedPots} pot berhasil disiram!`);
    }
  }

  game.targetHitFlash = Math.max(0, game.targetHitFlash - dt * 2.5);
  game.targetCooldown = Math.max(0, game.targetCooldown - dt);

  // Splash particles physics
  game.splashParticles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    p.life -= dt * 2.2;
  });
  game.splashParticles = game.splashParticles.filter((p) => p.life > 0);

  // Floating popups physics
  game.floatingPopups.forEach((p) => {
    p.y -= dt * 0.04;
    p.life -= dt * 1.2;
  });
  game.floatingPopups = game.floatingPopups.filter((p) => p.life > 0);

  updateCameraMotion();
  updateWateringLogic(dt);
  draw();
  syncHud();
  requestAnimationFrame(tick);
}

/* ═══════════════════════════════════════════════════════════════
   CONTROLS & INTERACTION
   ═══════════════════════════════════════════════════════════════ */
ui.startButton.addEventListener("click", async () => {
  audio.init();
  const ok = await ensureCameraReady();
  if (!ok) return;
  game.running  = true;
  game.painStop = false;
  setFeedback("neutral", "Misi Aktif 🌿", "Arahkan tangan tertutup untuk membidik, buka untuk menyiram!");
});

ui.pauseButton.addEventListener("click", () => {
  game.running = false;
  audio.stopWaterSound();
  setFeedback("neutral", "Dijeda", "Sesi latihan sedang dijeda");
});

ui.resetButton.addEventListener("click", resetGame);
ui.painButton.addEventListener("click", () => {
  game.painStop = true;
  game.running  = false;
  game.targetRom = game.minTargetRom;
  audio.stopWaterSound();
  setFeedback("bad", "Dihentikan (Pain/Stop)", "Silakan istirahat dan hubungi fisioterapis Anda");
});

/* Pointer is strictly controlled by camera hand-tracking (no mouse pointer override) */

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
