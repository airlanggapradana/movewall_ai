/**
 * MoveWall AI — Backend Server
 * Therapist Auth + Assessment Storage
 * Stack: Node.js + Express + Prisma ORM + PostgreSQL
 */

require("dotenv").config(); // Load .env (DATABASE_URL, JWT_SECRET, PORT)

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

// ─── Midtrans Configuration ──────────────────────────────────────────────────
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY || "";
const MIDTRANS_CLIENT_KEY = process.env.MIDTRANS_CLIENT_KEY || "";
const MIDTRANS_IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === "true";

const MIDTRANS_SNAP_URL = MIDTRANS_IS_PRODUCTION
  ? "https://app.midtrans.com/snap/v1/transactions"
  : "https://app.sandbox.midtrans.com/snap/v1/transactions";

const MIDTRANS_SNAP_JS = MIDTRANS_IS_PRODUCTION
  ? "https://app.midtrans.com/snap/snap.js"
  : "https://app.sandbox.midtrans.com/snap/snap.js";

const MIDTRANS_CORE_API_URL = MIDTRANS_IS_PRODUCTION
  ? "https://api.midtrans.com/v2"
  : "https://api.sandbox.midtrans.com/v2";

const SUBSCRIPTION_PRICE = 300000;
const SUBSCRIPTION_DURATION_DAYS = 30; // 30 hari cooldown & masa aktif

// ─── Prisma 7: Driver Adapter (pg) ───────────────────────────────────────────
const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://user:password@localhost:5432/movewall_db";
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET =
  process.env.JWT_SECRET || "movewall_ai_super_secret_key_2026";
const JWT_EXPIRES_IN = "8h";

// ─── Middleware ───────────────────────────────────────────────────────────────

// Daftar origin yang diizinkan:
// - Semua domain *.vercel.app (frontend Vercel)
// - Semua domain *.up.railway.app (frontend Railway)
// - Semua port localhost / 127.0.0.1 untuk development lokal
const ALLOWED_ORIGINS_PATTERN =
  /^https:\/\/([a-zA-Z0-9-]+\.vercel\.app|[a-zA-Z0-9-]+\.up\.railway\.app)$/;
const ALLOWED_LOCAL_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(
  cors({
    origin: function (origin, callback) {
      // Izinkan request tanpa origin (misal curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (
        ALLOWED_LOCAL_PATTERN.test(origin) ||
        ALLOWED_ORIGINS_PATTERN.test(origin)
      ) {
        return callback(null, true);
      }
      callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json());

// ─── Auth Middleware ──────────────────────────────────────────────────────────

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.therapist = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

// ── Helper: Hitung status, durasi aktif, dan cooldown pembayaran 30 hari ─────
function calculateSubscriptionMetrics(sub) {
  if (!sub || !sub.startDate || !sub.endDate) {
    return {
      status: "INACTIVE",
      isActive: false,
      isCooldownActive: false,
      cooldownRemainingDays: 0,
      cooldownRemainingHours: 0,
      daysRemaining: 0,
      canPay: true,
      planName: "MoveWall AI Pro 30 Hari",
      startDate: null,
      endDate: null,
      cooldownUntil: null,
    };
  }

  const now = new Date();
  const endDate = new Date(sub.endDate);
  const cooldownUntil = sub.cooldownUntil
    ? new Date(sub.cooldownUntil)
    : endDate;

  const isExpired = now > endDate;
  const isCooldownActive = now < cooldownUntil;

  const cooldownDiffMs = Math.max(0, cooldownUntil.getTime() - now.getTime());
  const cooldownRemainingDays = isCooldownActive
    ? Math.ceil(cooldownDiffMs / (1000 * 60 * 60 * 24))
    : 0;
  const cooldownRemainingHours = isCooldownActive
    ? Math.ceil(cooldownDiffMs / (1000 * 60 * 60))
    : 0;

  const subDiffMs = Math.max(0, endDate.getTime() - now.getTime());
  const daysRemaining = !isExpired
    ? Math.ceil(subDiffMs / (1000 * 60 * 60 * 24))
    : 0;

  return {
    id: sub.id,
    status: isExpired ? "EXPIRED" : sub.status,
    isActive: !isExpired && sub.status === "ACTIVE",
    isCooldownActive,
    cooldownRemainingDays,
    cooldownRemainingHours,
    daysRemaining,
    canPay: !isCooldownActive,
    planName: sub.planName,
    startDate: sub.startDate,
    endDate: sub.endDate,
    cooldownUntil,
  };
}

// ── Paywall Middleware: Cek Langganan Aktif ──────────────────────────────────
async function requireActiveSubscription(req, res, next) {
  try {
    if (!req.therapist || !req.therapist.id) {
      return res.status(401).json({ error: "Access token required" });
    }

    const sub = await prisma.subscription.findUnique({
      where: { therapistId: req.therapist.id },
    });

    const metrics = calculateSubscriptionMetrics(sub);

    if (!metrics.isActive) {
      return res.status(403).json({
        error: "Akses ditolak: Langganan aktif diperlukan untuk mengakses fitur klinis dan permainan. Silakan selesaikan pembayaran langganan terlebih dahulu.",
        requiresSubscription: true,
        subscriptionStatus: metrics.status,
      });
    }

    req.subscription = metrics;
    next();
  } catch (err) {
    console.error("[Require Subscription Middleware Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "MoveWall AI Backend",
    timestamp: new Date().toISOString(),
  });
});

// ── Auth: Login ───────────────────────────────────────────────────────────────

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required" });
    }

    // Find therapist by username
    const therapist = await prisma.therapist.findUnique({
      where: { username },
    });

    if (!therapist) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!therapist.isActive) {
      return res.status(403).json({ error: "Account is deactivated" });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, therapist.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        id: therapist.id,
        username: therapist.username,
        name: therapist.name,
        role: therapist.role,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN },
    );

    res.json({
      token,
      therapist: {
        id: therapist.id,
        name: therapist.name,
        username: therapist.username,
        email: therapist.email,
        specialization: therapist.specialization,
        role: therapist.role,
      },
    });
  } catch (err) {
    console.error("[Login Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Auth: Register (for setup/admin) ──────────────────────────────────────────

app.post("/api/auth/register", async (req, res) => {
  try {
    const {
      name,
      username,
      password,
      email,
      specialization,
      licenseNumber,
      phoneNumber,
    } = req.body;

    if (!name || !username || !password) {
      return res
        .status(400)
        .json({ error: "Name, username, and password are required" });
    }

    // Check if username already exists
    const existing = await prisma.therapist.findUnique({ where: { username } });
    if (existing) {
      return res.status(409).json({ error: "Username already taken" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    const therapist = await prisma.therapist.create({
      data: {
        name,
        username,
        password: hashedPassword,
        email,
        specialization,
        licenseNumber,
        phoneNumber,
        role: "THERAPIST",
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        specialization: true,
        role: true,
        createdAt: true,
      },
    });

    res
      .status(201)
      .json({ message: "Therapist registered successfully", therapist });
  } catch (err) {
    console.error("[Register Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Auth: Get current therapist (verify token) ────────────────────────────────

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const therapist = await prisma.therapist.findUnique({
      where: { id: req.therapist.id },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        specialization: true,
        role: true,
      },
    });
    if (!therapist)
      return res.status(404).json({ error: "Therapist not found" });
    res.json({ therapist });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Assessment: Create ────────────────────────────────────────────────────────

app.post("/api/assessment", authenticateToken, requireActiveSubscription, async (req, res) => {
  try {
    const {
      patientName,
      patientAge,
      painAbduction,
      painFlexion,
      painExternalRotation,
      painInternalRotation,
      painExtension,
      notes,
      missionId,
      sessionScore,
      sessionHits,
      sessionLevel,
      sessionTime,
    } = req.body;

    if (!patientName || patientAge === undefined || !missionId) {
      return res
        .status(400)
        .json({ error: "patientName, patientAge, and missionId are required" });
    }

    const assessment = await prisma.assessment.create({
      data: {
        patientName,
        patientAge: parseInt(patientAge),
        painAbduction: !!painAbduction,
        painFlexion: !!painFlexion,
        painExternalRotation: !!painExternalRotation,
        painInternalRotation: !!painInternalRotation,
        painExtension: !!painExtension,
        notes: notes || null,
        missionId: parseInt(missionId),
        sessionScore: sessionScore || 0,
        sessionHits: sessionHits || 0,
        sessionLevel: sessionLevel || 1,
        sessionTime: sessionTime || null,
        therapistId: req.therapist.id,
      },
      include: {
        therapist: {
          select: { name: true, username: true },
        },
      },
    });

    res
      .status(201)
      .json({ message: "Assessment saved successfully", assessment });
  } catch (err) {
    console.error("[Assessment Create Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Assessment: Get all (for therapist's own assessments) ─────────────────────

app.get("/api/assessments", authenticateToken, requireActiveSubscription, async (req, res) => {
  try {
    const assessments = await prisma.assessment.findMany({
      where: { therapistId: req.therapist.id },
      orderBy: { createdAt: "desc" },
      include: {
        therapist: {
          select: { name: true, username: true },
        },
      },
    });
    res.json({ assessments });
  } catch (err) {
    console.error("[Assessment List Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Assessment: Get by ID ─────────────────────────────────────────────────────

app.get("/api/assessment/:id", authenticateToken, requireActiveSubscription, async (req, res) => {
  try {
    const assessment = await prisma.assessment.findFirst({
      where: {
        id: parseInt(req.params.id),
        therapistId: req.therapist.id,
      },
    });
    if (!assessment)
      return res.status(404).json({ error: "Assessment not found" });
    res.json({ assessment });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Patients: Get distinct patient list for current therapist ─────────────────

app.get("/api/patients", authenticateToken, requireActiveSubscription, async (req, res) => {
  try {
    const assessments = await prisma.assessment.findMany({
      where: { therapistId: req.therapist.id },
      orderBy: { createdAt: "desc" },
      select: {
        patientName: true,
        patientAge: true,
        createdAt: true,
        missionId: true,
        sessionScore: true,
        sessionHits: true,
        sessionLevel: true,
        sessionTime: true,
        painAbduction: true,
        painFlexion: true,
        painExternalRotation: true,
        painInternalRotation: true,
        painExtension: true,
        notes: true,
      },
    });

    const patientMap = new Map();
    for (const a of assessments) {
      const key = a.patientName.trim().toLowerCase();
      const hasPain =
        a.painAbduction ||
        a.painFlexion ||
        a.painExternalRotation ||
        a.painInternalRotation ||
        a.painExtension;

      if (!patientMap.has(key)) {
        patientMap.set(key, {
          name: a.patientName.trim(),
          age: a.patientAge,
          lastSession: a.createdAt,
          lastMissionId: a.missionId,
          latestScore: a.sessionScore,
          latestLevel: a.sessionLevel,
          latestTime: a.sessionTime || "—",
          latestNotes: a.notes || null,
          latestHasPain: hasPain,
          painSessionCount: hasPain ? 1 : 0,
          sessionCount: 1,
        });
      } else {
        const item = patientMap.get(key);
        item.sessionCount += 1;
        if (hasPain) item.painSessionCount += 1;
      }
    }

    const patients = Array.from(patientMap.values()).map((p) => ({
      ...p,
      hasPainHistory: p.painSessionCount > 0,
      painRatePercent: Math.round((p.painSessionCount / p.sessionCount) * 100),
    }));

    res.json({ patients });
  } catch (err) {
    console.error("[Patients List Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Dashboard: Global & Therapist Analytics ──────────────────────────────────

app.get("/api/dashboard/stats", authenticateToken, requireActiveSubscription, async (req, res) => {
  try {
    const assessments = await prisma.assessment.findMany({
      where: { therapistId: req.therapist.id },
      orderBy: { createdAt: "desc" },
      include: {
        therapist: {
          select: { name: true, specialization: true, licenseNumber: true },
        },
      },
    });

    const totalSessions = assessments.length;
    const patientNames = new Set(
      assessments.map((a) => a.patientName.trim().toLowerCase()),
    );
    const totalPatients = patientNames.size;

    let totalScore = 0;
    let totalHits = 0;
    let m1Count = 0;
    let m2Count = 0;

    let painAbductionCount = 0;
    let painFlexionCount = 0;
    let painExtRotCount = 0;
    let painIntRotCount = 0;
    let painExtensionCount = 0;
    let sessionsWithPain = 0;

    assessments.forEach((a) => {
      totalScore += a.sessionScore || 0;
      totalHits += a.sessionHits || 0;
      if (a.missionId === 1) m1Count++;
      if (a.missionId === 2) m2Count++;

      const hasPain =
        a.painAbduction ||
        a.painFlexion ||
        a.painExternalRotation ||
        a.painInternalRotation ||
        a.painExtension;

      if (hasPain) sessionsWithPain++;
      if (a.painAbduction) painAbductionCount++;
      if (a.painFlexion) painFlexionCount++;
      if (a.painExternalRotation) painExtRotCount++;
      if (a.painInternalRotation) painIntRotCount++;
      if (a.painExtension) painExtensionCount++;
    });

    const avgScore =
      totalSessions > 0 ? Math.round(totalScore / totalSessions) : 0;
    const avgHits =
      totalSessions > 0 ? (totalHits / totalSessions).toFixed(1) : "0.0";
    const painRate =
      totalSessions > 0
        ? Math.round((sessionsWithPain / totalSessions) * 100)
        : 0;

    res.json({
      summary: {
        totalPatients,
        totalSessions,
        avgScore,
        avgHits,
        painPrevalencePercent: painRate,
        sessionsWithPain,
        sessionsPainFree: totalSessions - sessionsWithPain,
        missions: {
          mission1: m1Count,
          mission2: m2Count,
        },
      },
      painStats: {
        abduction: painAbductionCount,
        flexion: painFlexionCount,
        externalRotation: painExtRotCount,
        internalRotation: painIntRotCount,
        extension: painExtensionCount,
      },
      recentAssessments: assessments.slice(0, 8),
    });
  } catch (err) {
    console.error("[Dashboard Stats Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Patient Detail: Deep Analytics & Timeline ────────────────────────────────

app.get("/api/patients/:name/summary", authenticateToken, requireActiveSubscription, async (req, res) => {
  try {
    const rawName = decodeURIComponent(req.params.name).trim();
    const allAssessments = await prisma.assessment.findMany({
      where: {
        therapistId: req.therapist.id,
      },
      orderBy: { createdAt: "asc" },
      include: {
        therapist: {
          select: { name: true, licenseNumber: true, specialization: true },
        },
      },
    });

    // Match patient name case-insensitively
    const patientAssessments = allAssessments.filter(
      (a) => a.patientName.trim().toLowerCase() === rawName.toLowerCase(),
    );

    if (patientAssessments.length === 0) {
      return res.status(404).json({ error: "Pasien tidak ditemukan" });
    }

    const latest = patientAssessments[patientAssessments.length - 1];
    const first = patientAssessments[0];

    let totalScore = 0;
    let maxScore = 0;
    let totalHits = 0;
    let painAbduction = 0;
    let painFlexion = 0;
    let painExternalRotation = 0;
    let painInternalRotation = 0;
    let painExtension = 0;
    let painSessions = 0;

    const sessionHistory = patientAssessments.map((a, idx) => {
      totalScore += a.sessionScore;
      if (a.sessionScore > maxScore) maxScore = a.sessionScore;
      totalHits += a.sessionHits;

      const hasPain =
        a.painAbduction ||
        a.painFlexion ||
        a.painExternalRotation ||
        a.painInternalRotation ||
        a.painExtension;

      if (hasPain) painSessions++;
      if (a.painAbduction) painAbduction++;
      if (a.painFlexion) painFlexion++;
      if (a.painExternalRotation) painExternalRotation++;
      if (a.painInternalRotation) painInternalRotation++;
      if (a.painExtension) painExtension++;

      return {
        sessionNumber: idx + 1,
        id: a.id,
        date: a.createdAt,
        missionId: a.missionId,
        missionName:
          a.missionId === 1
            ? "Apple Archer (Shoulder Flexion)"
            : "Garden Keeper (Reaching & Hand)",
        level: a.sessionLevel,
        score: a.sessionScore,
        hits: a.sessionHits,
        time: a.sessionTime || "—",
        hasPain,
        painAbduction: a.painAbduction,
        painFlexion: a.painFlexion,
        painExternalRotation: a.painExternalRotation,
        painInternalRotation: a.painInternalRotation,
        painExtension: a.painExtension,
        notes: a.notes,
        therapistName: a.therapist?.name || "Terapis",
      };
    });

    const totalSessions = patientAssessments.length;

    res.json({
      patient: {
        name: latest.patientName,
        age: latest.patientAge,
        firstSessionDate: first.createdAt,
        lastSessionDate: latest.createdAt,
        totalSessions,
        latestLevel: latest.sessionLevel,
        latestScore: latest.sessionScore,
        avgScore: Math.round(totalScore / totalSessions),
        maxScore,
        avgHits: (totalHits / totalSessions).toFixed(1),
        painFreeSessions: totalSessions - painSessions,
        painSessionCount: painSessions,
        painRatePercent: Math.round((painSessions / totalSessions) * 100),
      },
      painMetrics: {
        abductionCount: painAbduction,
        flexionCount: painFlexion,
        externalRotationCount: painExternalRotation,
        internalRotationCount: painInternalRotation,
        extensionCount: painExtension,
      },
      sessionHistory, // ordered chronologically ascending
    });
  } catch (err) {
    console.error("[Patient Summary Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Patient Detail: Report Payload for PDF Generation ────────────────────────

app.get("/api/patients/:name/report", authenticateToken, requireActiveSubscription, async (req, res) => {
  try {
    const rawName = decodeURIComponent(req.params.name).trim();
    const therapist = await prisma.therapist.findUnique({
      where: { id: req.therapist.id },
      select: {
        id: true,
        name: true,
        licenseNumber: true,
        specialization: true,
        email: true,
        phoneNumber: true,
      },
    });

    const allAssessments = await prisma.assessment.findMany({
      where: { therapistId: req.therapist.id },
      orderBy: { createdAt: "asc" },
    });

    const patientAssessments = allAssessments.filter(
      (a) => a.patientName.trim().toLowerCase() === rawName.toLowerCase(),
    );

    if (patientAssessments.length === 0) {
      return res.status(404).json({ error: "Pasien tidak ditemukan" });
    }

    const latest = patientAssessments[patientAssessments.length - 1];
    const first = patientAssessments[0];

    const painSessionsCount = patientAssessments.filter(
      (a) =>
        a.painAbduction ||
        a.painFlexion ||
        a.painExternalRotation ||
        a.painInternalRotation ||
        a.painExtension,
    ).length;
    const painRate = Math.round(
      (painSessionsCount / patientAssessments.length) * 100,
    );
    const latestNotes = latest.notes;

    const dynamicRecommendation = latestNotes
      ? `Evaluasi Klinis Sesi Terakhir: "${latestNotes}". Rekomendasi Terapi: Pasien telah menyelesaikan ${patientAssessments.length} sesi latihan aktif pada Level ${latest.sessionLevel} dengan akurasi ${latest.sessionHits}/10 target (Skor: ${latest.sessionScore}). ${
          painRate > 0
            ? `Terdapat keluhan nyeri pada ${painSessionsCount} dari ${patientAssessments.length} sesi (${painRate}%). Disarankan pembatasan elevasi lengan di atas zona nyeri dan kompres dingin pasca-latihan.`
            : `Pasien telah mencapai kondisi bebas nyeri optimal (pain-free). Disarankan melanjutkan ke level kesulitan lebih tinggi untuk peningkatan ketahanan isometrik dan rentang gerak bahu.`
        }`
      : `Pasien telah menyelesaikan seluruh rangkaian ${patientAssessments.length} sesi latihan dengan tingkat kesulitan adaptif Level ${latest.sessionLevel}. Disarankan pemantauan ROM berkala.`;

    const reportData = {
      reportId: `MW-${Date.now().toString().slice(-6)}`,
      generatedAt: new Date().toISOString(),
      therapist,
      patient: {
        name: latest.patientName,
        age: latest.patientAge,
        firstSession: first.createdAt,
        lastSession: latest.createdAt,
        totalSessions: patientAssessments.length,
        latestNotes,
      },
      recommendation: dynamicRecommendation,
      sessions: patientAssessments.map((a, i) => ({
        index: i + 1,
        id: a.id,
        date: a.createdAt,
        missionId: a.missionId,
        missionTitle: a.missionId === 1 ? "Apple Archer" : "Garden Keeper",
        targetMovement:
          a.missionId === 1
            ? "Shoulder Flexion & Elevation"
            : "Shoulder Abduction & Hand Reaching",
        level: a.sessionLevel,
        score: a.sessionScore,
        hits: a.sessionHits,
        time: a.sessionTime || "—",
        painChecklist: {
          abduction: a.painAbduction,
          flexion: a.painFlexion,
          externalRotation: a.painExternalRotation,
          internalRotation: a.painInternalRotation,
          extension: a.painExtension,
        },
        notes: a.notes || "Tidak ada catatan khusus dari terapis.",
      })),
    };

    res.json({ report: reportData });
  } catch (err) {
    console.error("[Patient Report Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Subscription & Midtrans Payment Gateway ─────────────────────────────────

// 1. Get Midtrans Public Client Config
app.get("/api/subscription/config", (req, res) => {
  res.json({
    clientKey: MIDTRANS_CLIENT_KEY,
    isProduction: MIDTRANS_IS_PRODUCTION,
    snapJsUrl: MIDTRANS_SNAP_JS,
    planPrice: SUBSCRIPTION_PRICE,
    planDurationDays: SUBSCRIPTION_DURATION_DAYS,
  });
});

// 2. Get Current Therapist Subscription & Cooldown Status
app.get("/api/subscription/status", authenticateToken, async (req, res) => {
  try {
    let sub = await prisma.subscription.findUnique({
      where: { therapistId: req.therapist.id },
    });

    if (
      sub &&
      sub.status === "ACTIVE" &&
      sub.endDate &&
      new Date() > new Date(sub.endDate)
    ) {
      sub = await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "EXPIRED" },
      });
    }

    const metrics = calculateSubscriptionMetrics(sub);
    res.json(metrics);
  } catch (err) {
    console.error("[Subscription Status Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 3. Get Payment History for Therapist
app.get("/api/subscription/history", authenticateToken, async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { therapistId: req.therapist.id },
      orderBy: { createdAt: "desc" },
      include: {
        subscription: {
          select: {
            planName: true,
            status: true,
            startDate: true,
            endDate: true,
          },
        },
      },
    });

    res.json({ payments });
  } catch (err) {
    console.error("[Payment History Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 4. Create Midtrans Snap Payment Transaction
app.post(
  "/api/subscription/create-transaction",
  authenticateToken,
  async (req, res) => {
    try {
      const therapist = await prisma.therapist.findUnique({
        where: { id: req.therapist.id },
      });

      if (!therapist) {
        return res.status(404).json({ error: "Terapis tidak ditemukan" });
      }

      // Periksa cooldown subscription 30 hari
      const existingSub = await prisma.subscription.findUnique({
        where: { therapistId: therapist.id },
      });

      const metrics = calculateSubscriptionMetrics(existingSub);

      // Jika cooldown masih aktif dan tidak ada bypass testing (?force=true), tolak transaksi baru
      if (metrics.isCooldownActive && !req.body.force) {
        return res.status(400).json({
          error: "Cooldown pembayaran aktif",
          message: `Subscription Anda masih aktif. Pembayaran berikutnya dapat dilakukan setelah masa cooldown 30 hari berakhir (tersisa ${metrics.cooldownRemainingDays} hari).`,
          cooldownUntil: metrics.cooldownUntil,
          remainingDays: metrics.cooldownRemainingDays,
        });
      }

      const orderId = `MW-SUB-${therapist.id}-${Date.now()}`;
      const payload = {
        transaction_details: {
          order_id: orderId,
          gross_amount: SUBSCRIPTION_PRICE,
        },
        item_details: [
          {
            id: "MW-PRO-30D",
            price: SUBSCRIPTION_PRICE,
            quantity: 1,
            name: "MoveWall AI Pro (30 Hari)",
          },
        ],
        customer_details: {
          first_name: therapist.name,
          email: therapist.email || `${therapist.username}@movewall.ai`,
          phone: therapist.phoneNumber || undefined,
        },
      };

      const authHeader = Buffer.from(`${MIDTRANS_SERVER_KEY}:`).toString(
        "base64",
      );
      const snapRes = await fetch(MIDTRANS_SNAP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${authHeader}`,
        },
        body: JSON.stringify(payload),
      });

      const snapData = await snapRes.json();

      if (!snapRes.ok) {
        console.error("[Midtrans Snap API Error]", snapData);
        return res.status(502).json({
          error: "Gagal membuat transaksi ke payment gateway Midtrans",
          details: snapData,
        });
      }

      // Simpan data payment transaksi PENDING ke database
      const payment = await prisma.payment.create({
        data: {
          orderId,
          therapistId: therapist.id,
          subscriptionId: existingSub ? existingSub.id : null,
          amount: SUBSCRIPTION_PRICE,
          status: "PENDING",
          snapToken: snapData.token,
          snapRedirectUrl: snapData.redirect_url,
        },
      });

      res.json({
        token: snapData.token,
        redirect_url: snapData.redirect_url,
        orderId,
        payment,
      });
    } catch (err) {
      console.error("[Create Transaction Error]", err);
      res.status(500).json({ error: "Internal server error: " + err.message });
    }
  },
);

// 5. Synchronize Transaction Status with Midtrans Core API
app.post(
  "/api/subscription/sync/:orderId",
  authenticateToken,
  async (req, res) => {
    try {
      const { orderId } = req.params;

      const payment = await prisma.payment.findFirst({
        where: { orderId, therapistId: req.therapist.id },
      });

      if (!payment) {
        return res.status(404).json({ error: "Transaksi tidak ditemukan" });
      }

      // Hubungi Midtrans API untuk cek status transaksi secara langsung
      const authHeader = Buffer.from(`${MIDTRANS_SERVER_KEY}:`).toString(
        "base64",
      );
      const midtransRes = await fetch(
        `${MIDTRANS_CORE_API_URL}/${orderId}/status`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Basic ${authHeader}`,
          },
        },
      );

      const midtransData = await midtransRes.json();

      if (!midtransRes.ok && midtransData.status_code !== "404") {
        return res.status(502).json({
          error: "Gagal mengambil status dari Midtrans",
          details: midtransData,
        });
      }

      const txStatus = midtransData.transaction_status;
      const fraudStatus = midtransData.fraud_status;
      let newPaymentStatus = payment.status;
      let isSettled = false;

      if (txStatus === "capture") {
        if (fraudStatus === "accept") {
          newPaymentStatus = "SETTLEMENT";
          isSettled = true;
        } else if (fraudStatus === "challenge") {
          newPaymentStatus = "CHALLENGE";
        }
      } else if (txStatus === "settlement") {
        newPaymentStatus = "SETTLEMENT";
        isSettled = true;
      } else if (["cancel", "deny", "expire"].includes(txStatus)) {
        newPaymentStatus = txStatus.toUpperCase();
      } else if (txStatus === "pending") {
        newPaymentStatus = "PENDING";
      }

      const updatedPayment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: newPaymentStatus,
          paymentType: midtransData.payment_type || payment.paymentType,
          transactionId: midtransData.transaction_id || payment.transactionId,
          paidAt: isSettled
            ? midtransData.settlement_time
              ? new Date(midtransData.settlement_time)
              : new Date()
            : payment.paidAt,
          rawResponse: JSON.stringify(midtransData),
        },
      });

      // Jika pembayaran berhasil/settlement, aktifkan subscription 30 hari & cooldown 30 hari
      let updatedSub = null;
      if (isSettled) {
        const now = new Date();
        const startDate = now;
        const endDate = new Date(
          now.getTime() + SUBSCRIPTION_DURATION_DAYS * 24 * 60 * 60 * 1000,
        );
        const cooldownUntil = endDate; // Cooldown 30 hari untuk pembayaran berikutnya

        updatedSub = await prisma.subscription.upsert({
          where: { therapistId: req.therapist.id },
          create: {
            therapistId: req.therapist.id,
            status: "ACTIVE",
            planName: "MoveWall AI Pro 30 Hari",
            startDate,
            endDate,
            cooldownUntil,
          },
          update: {
            status: "ACTIVE",
            planName: "MoveWall AI Pro 30 Hari",
            startDate,
            endDate,
            cooldownUntil,
          },
        });

        await prisma.payment.update({
          where: { id: payment.id },
          data: { subscriptionId: updatedSub.id },
        });
      } else {
        updatedSub = await prisma.subscription.findUnique({
          where: { therapistId: req.therapist.id },
        });
      }

      res.json({
        payment: updatedPayment,
        subscription: calculateSubscriptionMetrics(updatedSub),
        midtransStatus: midtransData,
      });
    } catch (err) {
      console.error("[Sync Transaction Error]", err);
      res.status(500).json({ error: "Internal server error: " + err.message });
    }
  },
);

// 6. Webhook / Notification Handler dari Midtrans
app.post("/api/subscription/notification", async (req, res) => {
  try {
    const notification = req.body;
    const { order_id, status_code, gross_amount, signature_key } = notification;

    if (!order_id || !signature_key) {
      return res.status(400).json({ error: "Invalid notification payload" });
    }

    // Verifikasi validitas signature key
    const calculatedSignature = crypto
      .createHash("sha512")
      .update(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY)
      .digest("hex");

    if (calculatedSignature !== signature_key) {
      console.warn(
        "[Midtrans Webhook] Signature mismatch untuk order:",
        order_id,
      );
      return res.status(403).json({ error: "Signature key tidak cocok" });
    }

    const payment = await prisma.payment.findUnique({
      where: { orderId: order_id },
    });

    if (!payment) {
      console.warn(
        "[Midtrans Webhook] Transaksi order tidak ditemukan:",
        order_id,
      );
      return res.status(404).json({ error: "Order tidak ditemukan" });
    }

    const txStatus = notification.transaction_status;
    const fraudStatus = notification.fraud_status;
    let newPaymentStatus = payment.status;
    let isSettled = false;

    if (txStatus === "capture") {
      if (fraudStatus === "accept") {
        newPaymentStatus = "SETTLEMENT";
        isSettled = true;
      } else if (fraudStatus === "challenge") {
        newPaymentStatus = "CHALLENGE";
      }
    } else if (txStatus === "settlement") {
      newPaymentStatus = "SETTLEMENT";
      isSettled = true;
    } else if (["cancel", "deny", "expire"].includes(txStatus)) {
      newPaymentStatus = txStatus.toUpperCase();
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: newPaymentStatus,
        paymentType: notification.payment_type || payment.paymentType,
        transactionId: notification.transaction_id || payment.transactionId,
        paidAt: isSettled ? new Date() : payment.paidAt,
        rawResponse: JSON.stringify(notification),
      },
    });

    if (isSettled) {
      const now = new Date();
      const startDate = now;
      const endDate = new Date(
        now.getTime() + SUBSCRIPTION_DURATION_DAYS * 24 * 60 * 60 * 1000,
      );
      const cooldownUntil = endDate;

      const sub = await prisma.subscription.upsert({
        where: { therapistId: payment.therapistId },
        create: {
          therapistId: payment.therapistId,
          status: "ACTIVE",
          planName: "MoveWall AI Pro 30 Hari",
          startDate,
          endDate,
          cooldownUntil,
        },
        update: {
          status: "ACTIVE",
          planName: "MoveWall AI Pro 30 Hari",
          startDate,
          endDate,
          cooldownUntil,
        },
      });

      await prisma.payment.update({
        where: { id: payment.id },
        data: { subscriptionId: sub.id },
      });
    }

    res.json({ status: "ok" });
  } catch (err) {
    console.error("[Midtrans Notification Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 7. Dev / Sandbox Simulator: Simulasi Sukses Pembayaran
app.post(
  "/api/subscription/test-simulate-success/:orderId",
  authenticateToken,
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const payment = await prisma.payment.findFirst({
        where: { orderId, therapistId: req.therapist.id },
      });

      if (!payment) {
        return res.status(404).json({ error: "Transaksi tidak ditemukan" });
      }

      const now = new Date();
      const startDate = now;
      const endDate = new Date(
        now.getTime() + SUBSCRIPTION_DURATION_DAYS * 24 * 60 * 60 * 1000,
      );
      const cooldownUntil = endDate;

      const sub = await prisma.subscription.upsert({
        where: { therapistId: req.therapist.id },
        create: {
          therapistId: req.therapist.id,
          status: "ACTIVE",
          planName: "MoveWall AI Pro 30 Hari",
          startDate,
          endDate,
          cooldownUntil,
        },
        update: {
          status: "ACTIVE",
          planName: "MoveWall AI Pro 30 Hari",
          startDate,
          endDate,
          cooldownUntil,
        },
      });

      const updatedPayment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "SETTLEMENT",
          paymentType: "qris_sandbox_simulated",
          paidAt: now,
          subscriptionId: sub.id,
        },
      });

      res.json({
        message: "Simulasi pembayaran Midtrans berhasil diselesaikan!",
        payment: updatedPayment,
        subscription: calculateSubscriptionMetrics(sub),
      });
    } catch (err) {
      console.error("[Simulate Success Error]", err);
      res.status(500).json({ error: "Internal server error: " + err.message });
    }
  },
);

// ─── Seed database (calls prisma/seed.js dynamically) ──────────────────────────

app.post("/api/dev/seed", async (req, res) => {
  try {
    const { seedDatabase } = require("./prisma/seed");
    await seedDatabase();
    res.status(201).json({
      message:
        "Database berhasil di-seed secara dinamis menggunakan dataset prisma/seed.js!",
      credentials: [
        { username: "therapist01", password: "movewall2026" },
        { username: "therapist02", password: "movewall2026" },
      ],
    });
  } catch (err) {
    console.error("[Seed Error]", err);
    res.status(500).json({ error: "Internal server error: " + err.message });
  }
});

// ─── Start Server (lokal) atau export untuk Vercel serverless ────────────────

async function main() {
  try {
    await prisma.$connect();
    console.log("[MoveWall] ✅ Connected to PostgreSQL via Prisma");

    app.listen(PORT, () => {
      console.log(`[MoveWall] 🚀 Backend running at http://localhost:${PORT}`);
      console.log(`[MoveWall] 📋 API endpoints:`);
      console.log(`           POST   /api/auth/login`);
      console.log(`           POST   /api/auth/register`);
      console.log(`           GET    /api/auth/me`);
      console.log(`           POST   /api/assessment`);
      console.log(`           GET    /api/assessments`);
      console.log(`           GET    /api/assessment/:id`);
      console.log(`           GET    /api/patients`);
      console.log(`           POST   /api/dev/seed  (dummy data)`);
    });
  } catch (err) {
    console.error("[MoveWall] ❌ Failed to connect to database:", err);
    process.exit(1);
  }
}

// Jalankan server saat dieksekusi langsung (npm start / node server.js)
// Ketika di-import oleh Vercel sebagai serverless, blok ini dilewati
if (require.main === module) {
  main();
}

// Graceful shutdown (hanya relevan di mode non-serverless)
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  console.log("[MoveWall] 👋 Server shutdown gracefully");
  process.exit(0);
});

// Export app untuk Vercel serverless handler
module.exports = app;
