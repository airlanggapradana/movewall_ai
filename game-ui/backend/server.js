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
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

// ─── Prisma 7: Driver Adapter (pg) ───────────────────────────────────────────
const connectionString = process.env.DATABASE_URL ?? "postgresql://user:password@localhost:5432/movewall_db";
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "movewall_ai_super_secret_key_2026";
const JWT_EXPIRES_IN = "8h";

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  credentials: true,
}));
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

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "MoveWall AI Backend", timestamp: new Date().toISOString() });
});

// ── Auth: Login ───────────────────────────────────────────────────────────────

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
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
      { expiresIn: JWT_EXPIRES_IN }
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
    const { name, username, password, email, specialization, licenseNumber, phoneNumber } = req.body;

    if (!name || !username || !password) {
      return res.status(400).json({ error: "Name, username, and password are required" });
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

    res.status(201).json({ message: "Therapist registered successfully", therapist });
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
    if (!therapist) return res.status(404).json({ error: "Therapist not found" });
    res.json({ therapist });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Assessment: Create ────────────────────────────────────────────────────────

app.post("/api/assessment", authenticateToken, async (req, res) => {
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
      return res.status(400).json({ error: "patientName, patientAge, and missionId are required" });
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

    res.status(201).json({ message: "Assessment saved successfully", assessment });
  } catch (err) {
    console.error("[Assessment Create Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Assessment: Get all (for therapist's own assessments) ─────────────────────

app.get("/api/assessments", authenticateToken, async (req, res) => {
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

app.get("/api/assessment/:id", authenticateToken, async (req, res) => {
  try {
    const assessment = await prisma.assessment.findFirst({
      where: {
        id: parseInt(req.params.id),
        therapistId: req.therapist.id,
      },
    });
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });
    res.json({ assessment });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Patients: Get distinct patient list for current therapist ─────────────────

app.get("/api/patients", authenticateToken, async (req, res) => {
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

app.get("/api/dashboard/stats", authenticateToken, async (req, res) => {
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
    const patientNames = new Set(assessments.map((a) => a.patientName.trim().toLowerCase()));
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

    const avgScore = totalSessions > 0 ? Math.round(totalScore / totalSessions) : 0;
    const avgHits = totalSessions > 0 ? (totalHits / totalSessions).toFixed(1) : "0.0";
    const painRate = totalSessions > 0 ? Math.round((sessionsWithPain / totalSessions) * 100) : 0;

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

app.get("/api/patients/:name/summary", authenticateToken, async (req, res) => {
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
      (a) => a.patientName.trim().toLowerCase() === rawName.toLowerCase()
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
        missionName: a.missionId === 1 ? "Apple Archer (Shoulder Flexion)" : "Garden Keeper (Reaching & Hand)",
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

app.get("/api/patients/:name/report", authenticateToken, async (req, res) => {
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
      (a) => a.patientName.trim().toLowerCase() === rawName.toLowerCase()
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
        a.painExtension
    ).length;
    const painRate = Math.round((painSessionsCount / patientAssessments.length) * 100);
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
        targetMovement: a.missionId === 1 ? "Shoulder Flexion & Elevation" : "Shoulder Abduction & Hand Reaching",
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

// ─── Seed database (calls prisma/seed.js dynamically) ──────────────────────────

app.post("/api/dev/seed", async (req, res) => {
  try {
    const { seedDatabase } = require("./prisma/seed");
    await seedDatabase();
    res.status(201).json({
      message: "Database berhasil di-seed secara dinamis menggunakan dataset prisma/seed.js!",
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

// ─── Start Server ─────────────────────────────────────────────────────────────

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

main();

// Graceful shutdown
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  console.log("[MoveWall] 👋 Server shutdown gracefully");
  process.exit(0);
});
