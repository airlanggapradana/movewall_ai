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

// ─── Seed dummy therapist (only in development) ───────────────────────────────

app.post("/api/dev/seed", async (req, res) => {
  try {
    const defaultPassword = "movewall2026";
    const hashedPassword = await bcrypt.hash(defaultPassword, 12);

    const therapistsData = [
      {
        name: "Dr. Rina Setiawati, Sp.KFR",
        username: "therapist01",
        password: hashedPassword,
        email: "rina.setiawati@movewall.ai",
        specialization: "Rehabilitasi Medik & Shoulder ROM Therapy",
        licenseNumber: "SIP-2026-001",
        phoneNumber: "+62812345678",
        role: "THERAPIST",
        isActive: true,
      },
      {
        name: "Dr. Budi Santoso, Sp.OT",
        username: "therapist02",
        password: hashedPassword,
        email: "budi.santoso@movewall.ai",
        specialization: "Sports Medicine & Upper Extremity Rehabilitation",
        licenseNumber: "SIP-2026-002",
        phoneNumber: "+62812987654",
        role: "THERAPIST",
        isActive: true,
      },
    ];

    const results = [];
    for (const data of therapistsData) {
      const therapist = await prisma.therapist.upsert({
        where: { username: data.username },
        update: {
          name: data.name,
          email: data.email,
          specialization: data.specialization,
          licenseNumber: data.licenseNumber,
          phoneNumber: data.phoneNumber,
          role: data.role,
          isActive: data.isActive,
        },
        create: data,
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          specialization: true,
          licenseNumber: true,
          role: true,
          isActive: true,
        },
      });
      results.push(therapist);
    }

    res.status(201).json({
      message: "2 data therapist berhasil di-seed!",
      defaultPassword,
      therapists: results,
    });
  } catch (err) {
    console.error("[Seed Error]", err);
    res.status(500).json({ error: "Internal server error" });
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
