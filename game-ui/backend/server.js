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
const {
  CONSENT_VERSION,
  PAIN_MOVEMENTS,
  ValidationError,
  normalizePain,
  normalizePainRegions,
  normalizeSessionMetrics,
  hasAnyPain,
  maxPainScore,
  validatePrescription,
} = require("./lib/clinical");
const { generateClinicalSummaryDraft } = require("./lib/ai-summary");

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

// R1: tidak ada nilai fallback. Tanpa secret, token bisa dipalsukan, jadi server
// menolak start. Secret pendek juga ditolak.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    "JWT_SECRET wajib diatur di environment (minimal 32 karakter). " +
      "Buat dengan: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
  );
}
const JWT_EXPIRES_IN = "8h";

// R3: registrasi terapis hanya dengan kode undangan. Tanpa env ini, registrasi mati.
const REGISTRATION_INVITE_CODE = process.env.REGISTRATION_INVITE_CODE || "";

// R2: endpoint seed bersifat destruktif. Hanya aktif bila diminta eksplisit
// dan tidak pernah di mode produksi.
const ALLOW_DEV_SEED =
  process.env.ALLOW_DEV_SEED === "true" &&
  process.env.NODE_ENV !== "production" &&
  !MIDTRANS_IS_PRODUCTION;

// R4/R5: simulator pembayaran dan bypass cooldown hanya untuk sandbox Midtrans.
const IS_PAYMENT_SANDBOX = !MIDTRANS_IS_PRODUCTION;

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

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
// Batas 5 MB: payload asesmen menyertakan replay kerangka gerak (kinematicReplayData),
// yang dapat melebihi default 100 KB milik express.json() pada sesi yang lebih panjang.
app.use(express.json({ limit: "5mb" }));

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

// ── Auth: Register (hanya dengan kode undangan) ───────────────────────────────

app.post("/api/auth/register", async (req, res) => {
  try {
    if (!REGISTRATION_INVITE_CODE) {
      return res
        .status(403)
        .json({ error: "Registrasi akun ditutup. Hubungi administrator." });
    }

    const {
      name,
      username,
      password,
      email,
      specialization,
      licenseNumber,
      phoneNumber,
      inviteCode,
    } = req.body;

    if (!inviteCode || !safeEqual(inviteCode, REGISTRATION_INVITE_CODE)) {
      return res.status(403).json({ error: "Kode undangan tidak valid" });
    }

    if (!name || !username || !password) {
      return res
        .status(400)
        .json({ error: "Name, username, and password are required" });
    }

    if (String(password).length < 10) {
      return res
        .status(400)
        .json({ error: "Password minimal 10 karakter" });
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

// ── Helpers: pasien, persetujuan, audit ───────────────────────────────────────

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function formatMedicalRecordNo(id) {
  return `MW-${String(id).padStart(6, "0")}`;
}

// Jejak akses data pasien. Kegagalan mencatat log tidak boleh memblokir permintaan.
async function audit(req, action, entity, entityId) {
  try {
    await prisma.auditLog.create({
      data: {
        therapistId: req.therapist.id,
        action,
        entity,
        entityId: entityId ?? null,
      },
    });
  } catch (err) {
    console.error("[Audit Log Error]", err);
  }
}

async function createPatient(
  tx,
  {
    name,
    age,
    therapistId,
    consent,
    initialTargetRom,
    maxSafetyCeiling,
    minFunctionalRom,
    adaptiveEnabled,
  },
) {
  const data = {
    // Nomor sementara; diganti setelah id database diketahui.
    medicalRecordNo: `PENDING-${crypto.randomUUID()}`,
    name,
    age,
    therapistId,
    consentGivenAt: consent ? new Date() : null,
    consentVersion: consent ? CONSENT_VERSION : null,
  };

  if (initialTargetRom !== undefined) data.initialTargetRom = initialTargetRom;
  if (maxSafetyCeiling !== undefined) data.maxSafetyCeiling = maxSafetyCeiling;
  if (minFunctionalRom !== undefined) data.minFunctionalRom = minFunctionalRom;
  if (adaptiveEnabled !== undefined) data.adaptiveEnabled = adaptiveEnabled;

  const created = await tx.patient.create({ data });
  return tx.patient.update({
    where: { id: created.id },
    data: { medicalRecordNo: formatMedicalRecordNo(created.id) },
  });
}

// Pasien dirujuk lewat nomor rekam medis (MW-000012) atau id numerik.
// Nama dipertahankan hanya untuk klien lama dan bila namanya tepat satu.
async function findPatientByRef(req) {
  const ref = decodeURIComponent(req.params.ref).trim();
  if (/^\d+$/.test(ref)) {
    return prisma.patient.findFirst({
      where: { id: parseInt(ref, 10), therapistId: req.therapist.id },
    });
  }
  if (/^MW-[\w\d]+$/i.test(ref)) {
    return prisma.patient.findFirst({
      where: {
        medicalRecordNo: { equals: ref, mode: "insensitive" },
        therapistId: req.therapist.id,
      },
    });
  }
  const matches = await prisma.patient.findMany({
    where: {
      therapistId: req.therapist.id,
      name: { equals: ref, mode: "insensitive" },
    },
    take: 2,
  });
  return matches.length === 1 ? matches[0] : null;
}

function consentInfo(patient) {
  return {
    given: !!patient.consentGivenAt,
    givenAt: patient.consentGivenAt,
    version: patient.consentVersion,
  };
}

function prescriptionInfo(patient) {
  return {
    initialTargetRom: patient.initialTargetRom ?? 45.0,
    maxSafetyCeiling: patient.maxSafetyCeiling ?? 135.0,
    minFunctionalRom: patient.minFunctionalRom ?? 30.0,
    adaptiveEnabled: patient.adaptiveEnabled ?? true,
  };
}

function averageOf(values) {
  const nums = values.filter((v) => typeof v === "number");
  return nums.length
    ? Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 10) / 10
    : null;
}

function sanitizeSummaryDraft(raw) {
  if (!raw) return null;
  if (typeof raw === "object") {
    return sanitizeSummaryDraft(raw.formattedText || raw.soap?.plan);
  }
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes("[object Object]")) return null;
  // Handle case where value is a JSON-serialized object stored as string
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        // Extract formattedText or build from soap parts
        if (typeof parsed.formattedText === "string" && parsed.formattedText.trim()) {
          return parsed.formattedText.trim();
        }
        if (parsed.soap && typeof parsed.soap === "object") {
          const s = parsed.soap;
          const parts = [];
          if (s.subjective) parts.push(`[S - SUBJEKTIF]\n${s.subjective}`);
          if (s.objective)  parts.push(`[O - OBJEKTIF]\n${s.objective}`);
          if (s.assessment) parts.push(`[A - EVALUASI]\n${s.assessment}`);
          if (s.plan)       parts.push(`[P - RENCANA]\n${s.plan}`);
          if (parts.length) return parts.join("\n\n");
        }
        return null;
      }
    } catch (_) {
      // Not JSON, treat as plain string
    }
  }
  return trimmed;
}

function buildDynamicClinicalRecommendation({ patient, assessments }) {
  const totalSessions = assessments.length;
  const latest = assessments[totalSessions - 1];
  const rx = prescriptionInfo(patient);

  const romValues = assessments.map((a) => a.maxRomDeg).filter((v) => typeof v === "number");
  const baselineRom = romValues.length ? romValues[0] : null;
  const bestRom = romValues.length ? Math.max(...romValues) : null;
  const romDelta =
    bestRom !== null && baselineRom !== null
      ? Math.round((bestRom - baselineRom) * 10) / 10
      : null;

  const avgAcc = averageOf(assessments.map((a) => a.accuracyPercent));
  const totalComp = assessments
    .map((a) => a.compensationEvents)
    .filter((v) => typeof v === "number")
    .reduce((s, v) => s + v, 0);

  const painSessionsCount = assessments.filter(hasAnyPain).length;
  const painRate = Math.round((painSessionsCount / totalSessions) * 100);
  const painPeakValues = assessments.map(maxPainScore).filter((v) => typeof v === "number");
  const peakPain = painPeakValues.length ? Math.max(...painPeakValues) : 0;

  const latestNotes =
    latest.notes && latest.notes.trim() && latest.notes.trim() !== "Tidak ada catatan khusus dari terapis."
      ? latest.notes.trim()
      : null;

  const evalParts = [];
  if (bestRom !== null) {
    const deltaStr = romDelta !== null && romDelta > 0 ? ` (progresi +${romDelta}° dari baseline ${baselineRom}°)` : "";
    evalParts.push(
      `Capaian ROM aktif tertinggi ${bestRom}°${deltaStr} dengan Batas Aman (Safety Ceiling) ${rx.maxSafetyCeiling}°.`
    );
  } else {
    evalParts.push(
      `Pasien menyelesaikan ${totalSessions} sesi latihan (Level ${latest.sessionLevel}, ${latest.sessionHits}/10 target, Batas Aman ${rx.maxSafetyCeiling}°).`
    );
  }
  if (avgAcc !== null) {
    evalParts.push(`Rata-rata akurasi penahanan target ${avgAcc}% dengan total ${totalComp} episode kompensasi postur.`);
  }

  let painSummary = "";
  if (painSessionsCount > 0) {
    painSummary = `Keluhan nyeri tercatat pada ${painSessionsCount} dari ${totalSessions} sesi (${painRate}%) dengan skor puncak NRS ${peakPain}/10.`;
  } else {
    painSummary = `Seluruh ${totalSessions} sesi berlangsung bebas nyeri optimal (NRS 0/10).`;
  }
  if (latestNotes) {
    painSummary += ` Catatan klinis terakhir: "${latestNotes}"`;
  }

  let planSummary = "";
  if (peakPain >= 5 || painRate >= 50) {
    planSummary = `Pertahankan target awal ${rx.initialTargetRom}° dan batasi elevasi di bawah Safety Ceiling ${rx.maxSafetyCeiling}° (fallback nyeri ${rx.minFunctionalRom}°). Hindari gerakan memaksa di zona nyeri serta lakukan pendinginan/kompres dingin 10–15 menit pasca-latihan bila keluhan muncul.`;
  } else if (painRate === 0 && bestRom !== null && bestRom >= rx.maxSafetyCeiling * 0.9) {
    planSummary = `Toleransi motorik dan kontrol skapula stabil mendekati batas aman. Pertimbangkan peningkatan Safety Ceiling bertahap (+10° hingga ${Math.min(180, rx.maxSafetyCeiling + 10)}°) dan lanjutkan variasi koordinasi Misi 2 pada evaluasi berikutnya.`;
  } else {
    planSummary = `Lanjutkan program latihan adaptif terkontrol (Target Awal ${rx.initialTargetRom}°, Safety Ceiling ${rx.maxSafetyCeiling}°) sebanyak 2–3 sesi per minggu sembari memantau stabilitas postur tanpa kompensasi bahu.`;
  }

  return `[EVALUASI BIOMEKANIKA]\n${evalParts.join(" ")}\n\n[TOLERANSI NYERI]\n${painSummary}\n\n[TINDAK LANJUT TERAPI]\n${planSummary}`;
}

function respondError(res, err, label) {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }
  console.error(label, err);
  return res.status(500).json({ error: "Internal server error" });
}

// ── Assessment: Create ────────────────────────────────────────────────────────

app.post("/api/assessment", authenticateToken, requireActiveSubscription, async (req, res) => {
  try {
    const {
      patientId,
      patientName,
      patientAge,
      consent,
      notes,
      missionId,
      sessionScore,
      sessionHits,
      sessionLevel,
      sessionTime,
    } = req.body;

    if (!missionId) {
      return res.status(400).json({ error: "missionId is required" });
    }

    const age =
      patientAge === undefined || patientAge === null || patientAge === ""
        ? null
        : parseInt(patientAge, 10);
    if (age !== null && (!Number.isInteger(age) || age < 1 || age > 120)) {
      return res.status(400).json({ error: "patientAge harus 1–120" });
    }

    // Validasi data klinis sebelum menyentuh database.
    const pain = normalizePain(req.body);
    const painRegions = normalizePainRegions(req.body.painRegions);
    const metrics = normalizeSessionMetrics(req.body);

    const clientSessionId = req.body.clientSessionId ? String(req.body.clientSessionId).trim() : null;
    if (clientSessionId) {
      const existing = await prisma.assessment.findUnique({
        where: { clientSessionId },
        include: { therapist: { select: { name: true, username: true } } },
      });
      if (existing) {
        return res.status(200).json({
          message: "Assessment already synchronized (deduplicated)",
          assessment: existing,
          deduplicated: true,
        });
      }
    }

    const kinematicReplayData = typeof req.body.kinematicReplayData === "string"
      ? req.body.kinematicReplayData
      : (req.body.kinematicReplayData ? JSON.stringify(req.body.kinematicReplayData) : null);

    const therapistId = req.therapist.id;
    let consentRecorded = false;

    const { assessment, patient } = await prisma.$transaction(async (tx) => {
      let patient;
      const hasPatientId =
        patientId !== undefined && patientId !== null && patientId !== "";

      if (hasPatientId) {
        const id = parseInt(patientId, 10);
        patient = Number.isInteger(id)
          ? await tx.patient.findFirst({ where: { id, therapistId } })
          : null;
        if (!patient) throw new HttpError(404, "Pasien tidak ditemukan");
      } else {
        const name = typeof patientName === "string" ? patientName.trim() : "";
        if (!name || age === null) {
          throw new HttpError(
            400,
            "patientId, atau patientName dan patientAge untuk pasien baru, wajib diisi",
          );
        }
        if (consent !== true) {
          throw new HttpError(
            400,
            "Persetujuan pengolahan data pasien wajib dicatat sebelum menyimpan.",
            { code: "CONSENT_REQUIRED" },
          );
        }
        patient = await createPatient(tx, { name, age, therapistId, consent: true });
        consentRecorded = true;
      }

      // Pasien lama (termasuk hasil migrasi) yang persetujuannya belum tercatat.
      if (!patient.consentGivenAt) {
        if (consent !== true) {
          throw new HttpError(
            400,
            "Persetujuan pengolahan data pasien ini belum tercatat. Centang persetujuan untuk melanjutkan.",
            { code: "CONSENT_REQUIRED" },
          );
        }
        patient = await tx.patient.update({
          where: { id: patient.id },
          data: { consentGivenAt: new Date(), consentVersion: CONSENT_VERSION },
        });
        consentRecorded = true;
      }

      if (age !== null && age !== patient.age) {
        patient = await tx.patient.update({
          where: { id: patient.id },
          data: { age },
        });
      }

      const assessment = await tx.assessment.create({
        data: {
          patientId: patient.id,
          patientName: patient.name,
          patientAge: patient.age,
          ...pain,
          painRegions,
          ...metrics,
          notes: notes || null,
          missionId: parseInt(missionId, 10),
          sessionScore: sessionScore || 0,
          sessionHits: sessionHits || 0,
          sessionLevel: sessionLevel || 1,
          sessionTime: sessionTime || null,
          sessionMode: req.body.sessionMode === "HOME" ? "HOME" : "CLINIC",
          clientSessionId: clientSessionId || null,
          kinematicReplayData: kinematicReplayData || null,
          therapistId,
        },
        include: {
          therapist: {
            select: { name: true, username: true },
          },
        },
      });

      return { assessment, patient };
    });

    if (consentRecorded) {
      await audit(req, "CONSENT_RECORDED", "Patient", patient.id);
    }

    res.status(201).json({
      message: "Assessment saved successfully",
      assessment,
      patient: {
        id: patient.id,
        medicalRecordNo: patient.medicalRecordNo,
        consent: consentInfo(patient),
        prescription: prescriptionInfo(patient),
        homeAccessCode: patient.homeAccessCode || null,
        name: patient.name,
        age: patient.age,
        consent: consentInfo(patient),
      },
    });
  } catch (err) {
    respondError(res, err, "[Assessment Create Error]");
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

// ── Patients: daftar pasien milik terapis ─────────────────────────────────────

app.get("/api/patients", authenticateToken, requireActiveSubscription, async (req, res) => {
  try {
    const rows = await prisma.patient.findMany({
      where: { therapistId: req.therapist.id },
      include: {
        assessments: {
          orderBy: { createdAt: "desc" },
          select: {
            createdAt: true,
            missionId: true,
            sessionScore: true,
            sessionLevel: true,
            sessionTime: true,
            painAbduction: true,
            painFlexion: true,
            painExternalRotation: true,
            painInternalRotation: true,
            painExtension: true,
            painAbductionScore: true,
            painFlexionScore: true,
            painExternalRotationScore: true,
            painInternalRotationScore: true,
            painExtensionScore: true,
            maxRomDeg: true,
            notes: true,
          },
        },
      },
    });

    const patients = rows
      .map((p) => {
        const sessions = p.assessments;
        const latest = sessions[0] || null;
        const painSessionCount = sessions.filter(hasAnyPain).length;
        const sessionCount = sessions.length;

        return {
          id: p.id,
          medicalRecordNo: p.medicalRecordNo,
          name: p.name,
          age: p.age,
          hasConsent: !!p.consentGivenAt,
          consentGivenAt: p.consentGivenAt,
          lastSession: latest ? latest.createdAt : p.createdAt,
          lastMissionId: latest ? latest.missionId : null,
          latestScore: latest ? latest.sessionScore : 0,
          latestLevel: latest ? latest.sessionLevel : 1,
          latestTime: (latest && latest.sessionTime) || "—",
          latestNotes: (latest && latest.notes) || null,
          latestHasPain: latest ? hasAnyPain(latest) : false,
          latestMaxPain: latest ? maxPainScore(latest) : null,
          latestMaxRomDeg: latest ? latest.maxRomDeg : null,
          prescription: prescriptionInfo(p),
          painSessionCount,
          sessionCount,
          hasPainHistory: painSessionCount > 0,
          painRatePercent: sessionCount
            ? Math.round((painSessionCount / sessionCount) * 100)
            : 0,
        };
      })
      .sort((a, b) => new Date(b.lastSession) - new Date(a.lastSession));

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
    const totalPatients = new Set(assessments.map((a) => a.patientId)).size;

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

      if (hasAnyPain(a)) sessionsWithPain++;
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
        avgMaxRomDeg: averageOf(assessments.map((a) => a.maxRomDeg)),
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

app.get("/api/patients/:ref/summary", authenticateToken, requireActiveSubscription, async (req, res) => {
  try {
    const patient = await findPatientByRef(req);
    if (!patient) {
      return res.status(404).json({ error: "Pasien tidak ditemukan" });
    }

    const patientAssessments = await prisma.assessment.findMany({
      where: { patientId: patient.id, therapistId: req.therapist.id },
      orderBy: { createdAt: "asc" },
      include: {
        therapist: {
          select: { name: true, licenseNumber: true, specialization: true },
        },
      },
    });

    if (patientAssessments.length === 0) {
      return res.status(404).json({ error: "Pasien belum memiliki sesi" });
    }

    await audit(req, "PATIENT_VIEW", "Patient", patient.id);

    const latest = patientAssessments[patientAssessments.length - 1];
    const first = patientAssessments[0];

    let totalScore = 0;
    let maxScore = 0;
    let totalHits = 0;
    const painCounts = {};
    for (const m of PAIN_MOVEMENTS) painCounts[m.key] = 0;
    let painSessions = 0;
    const regionCounts = {};

    const sessionHistory = patientAssessments.map((a, idx) => {
      totalScore += a.sessionScore;
      if (a.sessionScore > maxScore) maxScore = a.sessionScore;
      totalHits += a.sessionHits;

      const hasPain = hasAnyPain(a);
      if (hasPain) painSessions++;
      for (const m of PAIN_MOVEMENTS) if (a[m.flag]) painCounts[m.key]++;
      for (const region of a.painRegions || []) {
        regionCounts[region] = (regionCounts[region] || 0) + 1;
      }

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
        painScores: {
          abduction: a.painAbductionScore,
          flexion: a.painFlexionScore,
          externalRotation: a.painExternalRotationScore,
          internalRotation: a.painInternalRotationScore,
          extension: a.painExtensionScore,
        },
        maxPainScore: maxPainScore(a),
        painRegions: a.painRegions || [],
        maxRomDeg: a.maxRomDeg,
        accuracyPercent: a.accuracyPercent,
        compensationEvents: a.compensationEvents,
        sessionMode: a.sessionMode || "CLINIC",
        hasReplay: Boolean(a.kinematicReplayData),
        aiSummaryDraft: sanitizeSummaryDraft(a.aiSummaryDraft),
        aiSummaryApproved: Boolean(
          a.aiSummaryApproved && sanitizeSummaryDraft(a.aiSummaryDraft),
        ),
        notes: a.notes,
        therapistName: a.therapist?.name || "Terapis",
      };
    });

    const totalSessions = patientAssessments.length;
    const romValues = patientAssessments.map((a) => a.maxRomDeg);
    const bestRom = romValues.filter((v) => typeof v === "number");

    res.json({
      patient: {
        id: patient.id,
        medicalRecordNo: patient.medicalRecordNo,
        consent: consentInfo(patient),
        prescription: prescriptionInfo(patient),
        homeAccessCode: patient.homeAccessCode || null,
        name: patient.name,
        age: patient.age,
        firstSessionDate: first.createdAt,
        lastSessionDate: latest.createdAt,
        totalSessions,
        latestLevel: latest.sessionLevel,
        latestScore: latest.sessionScore,
        avgScore: Math.round(totalScore / totalSessions),
        maxScore,
        avgHits: (totalHits / totalSessions).toFixed(1),
        latestMaxRomDeg: latest.maxRomDeg,
        bestMaxRomDeg: bestRom.length ? Math.max(...bestRom) : null,
        avgAccuracyPercent: averageOf(
          patientAssessments.map((a) => a.accuracyPercent),
        ),
        avgMaxPainScore: averageOf(patientAssessments.map(maxPainScore)),
        painFreeSessions: totalSessions - painSessions,
        painSessionCount: painSessions,
        painRatePercent: Math.round((painSessions / totalSessions) * 100),
      },
      painMetrics: {
        abductionCount: painCounts.Abduction,
        flexionCount: painCounts.Flexion,
        externalRotationCount: painCounts.ExternalRotation,
        internalRotationCount: painCounts.InternalRotation,
        extensionCount: painCounts.Extension,
        averageScores: {
          abduction: averageOf(patientAssessments.map((a) => a.painAbductionScore)),
          flexion: averageOf(patientAssessments.map((a) => a.painFlexionScore)),
          externalRotation: averageOf(
            patientAssessments.map((a) => a.painExternalRotationScore),
          ),
          internalRotation: averageOf(
            patientAssessments.map((a) => a.painInternalRotationScore),
          ),
          extension: averageOf(patientAssessments.map((a) => a.painExtensionScore)),
        },
        regionCounts,
      },
      sessionHistory, // ordered chronologically ascending
    });
  } catch (err) {
    console.error("[Patient Summary Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Patient Detail: Update Exercise Prescription & Safety Ceiling ───────────

app.put("/api/patients/:ref/prescription", authenticateToken, requireActiveSubscription, async (req, res) => {
  try {
    const patient = await findPatientByRef(req);
    if (!patient) {
      return res.status(404).json({ error: "Pasien tidak ditemukan" });
    }

    let cleanPrescription;
    try {
      cleanPrescription = validatePrescription(req.body);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }

    const updated = await prisma.patient.update({
      where: { id: patient.id },
      data: {
        initialTargetRom: cleanPrescription.initialTargetRom,
        maxSafetyCeiling: cleanPrescription.maxSafetyCeiling,
        minFunctionalRom: cleanPrescription.minFunctionalRom,
        adaptiveEnabled: cleanPrescription.adaptiveEnabled,
      },
    });

    await audit(req, "PATIENT_PRESCRIPTION_UPDATE", "Patient", patient.id);

    res.json({
      message: "Resep latihan & batas aman berhasil diperbarui",
      prescription: prescriptionInfo(updated),
    });
  } catch (err) {
    console.error("[Patient Prescription Update Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Patient Detail: Generate AI Clinical Summary Draft (Fitur 7) ─────────────

app.post("/api/patients/:ref/ai-summary", authenticateToken, requireActiveSubscription, async (req, res) => {
  try {
    const patient = await findPatientByRef(req);
    if (!patient) {
      return res.status(404).json({ error: "Pasien tidak ditemukan" });
    }

    const patientAssessments = await prisma.assessment.findMany({
      where: { patientId: patient.id, therapistId: req.therapist.id },
      orderBy: { createdAt: "asc" },
    });

    const draftResult = generateClinicalSummaryDraft({
      patient: {
        id: patient.id,
        medicalRecordNo: patient.medicalRecordNo,
        name: patient.name,
        age: patient.age,
        prescription: prescriptionInfo(patient),
      },
      sessions: patientAssessments.map((a, idx) => ({
        sessionNumber: idx + 1,
        maxRomDeg: a.maxRomDeg,
        accuracyPercent: a.accuracyPercent,
        compensationEvents: a.compensationEvents,
        hasPain: hasAnyPain(a),
        painScores: {
          flexion: a.painFlexionScore,
          abduction: a.painAbductionScore,
          externalRotation: a.painExternalRotationScore,
          internalRotation: a.painInternalRotationScore,
          extension: a.painExtensionScore,
        },
        painRegions: a.painRegions || [],
      })),
    });

    if (patientAssessments.length > 0) {
      const latestAssessment = patientAssessments[patientAssessments.length - 1];
      await prisma.assessment.update({
        where: { id: latestAssessment.id },
        data: {
          aiSummaryDraft: draftResult.formattedText,
          aiSummaryApproved: false,
        },
      });
    }

    await audit(req, "AI_SUMMARY_GENERATED", "Patient", patient.id);

    res.json({
      draft: draftResult.formattedText,
      soap: draftResult.soap,
      generatedAt: draftResult.generatedAt,
    });
  } catch (err) {
    console.error("[Generate AI Summary Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Patient Detail: Approve AI Clinical Summary Draft (Fitur 7) ──────────────

app.put("/api/patients/:ref/ai-summary/approve", authenticateToken, requireActiveSubscription, async (req, res) => {
  try {
    const patient = await findPatientByRef(req);
    if (!patient) {
      return res.status(404).json({ error: "Pasien tidak ditemukan" });
    }

    const cleanSummary = sanitizeSummaryDraft(req.body?.summaryText);
    if (!cleanSummary) {
      return res.status(400).json({ error: "Teks ringkasan klinis tidak valid atau kosong" });
    }

    const latest = await prisma.assessment.findFirst({
      where: { patientId: patient.id, therapistId: req.therapist.id },
      orderBy: { createdAt: "desc" },
    });

    if (!latest) {
      return res.status(400).json({ error: "Belum ada sesi latihan yang dapat dilampiri ringkasan" });
    }

    await prisma.assessment.update({
      where: { id: latest.id },
      data: {
        aiSummaryDraft: cleanSummary,
        aiSummaryApproved: true,
      },
    });

    await audit(req, "AI_SUMMARY_APPROVED", "Assessment", latest.id);

    res.json({
      message: "Draf ringkasan klinis berhasil disetujui terapis",
      approvedSummary: cleanSummary,
    });
  } catch (err) {
    console.error("[Approve AI Summary Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Patient Detail: Generate/Refresh Home Tele-Rehab Access Code (Fitur 5) ────

app.post("/api/patients/:ref/home-code", authenticateToken, requireActiveSubscription, async (req, res) => {
  try {
    const patient = await findPatientByRef(req);
    if (!patient) {
      return res.status(404).json({ error: "Pasien tidak ditemukan" });
    }

    const code = `MW-HOME-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

    const updated = await prisma.patient.update({
      where: { id: patient.id },
      data: { homeAccessCode: code },
    });

    await audit(req, "HOME_CODE_GENERATED", "Patient", patient.id);

    res.json({
      message: "Kode akses latihan di rumah berhasil dibuat",
      homeAccessCode: updated.homeAccessCode,
    });
  } catch (err) {
    console.error("[Generate Home Code Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Home Tele-Rehab: Patient Session Retrieval (Public with Code) ─────────────

app.get("/api/home-session/:code", async (req, res) => {
  try {
    const code = decodeURIComponent(req.params.code).trim().toUpperCase();
    const patient = await prisma.patient.findUnique({
      where: { homeAccessCode: code },
      include: {
        therapist: {
          select: { name: true, licenseNumber: true, specialization: true },
        },
      },
    });

    if (!patient) {
      return res.status(404).json({ error: "Kode sesi latihan di rumah tidak valid atau telah kedaluwarsa" });
    }

    res.json({
      patient: {
        id: patient.id,
        medicalRecordNo: patient.medicalRecordNo,
        name: patient.name,
        age: patient.age,
        prescription: prescriptionInfo(patient),
      },
      therapist: patient.therapist,
    });
  } catch (err) {
    console.error("[Home Session Lookup Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Home Tele-Rehab: Submit Assessment from Home (Fitur 5) ────────────────────

app.post("/api/home-session/:code/assessment", async (req, res) => {
  try {
    const code = decodeURIComponent(req.params.code).trim().toUpperCase();
    const patient = await prisma.patient.findUnique({
      where: { homeAccessCode: code },
    });

    if (!patient) {
      return res.status(404).json({ error: "Kode sesi latihan di rumah tidak ditemukan" });
    }

    const clientSessionId = req.body.clientSessionId ? String(req.body.clientSessionId).trim() : null;
    if (clientSessionId) {
      const existing = await prisma.assessment.findUnique({
        where: { clientSessionId },
      });
      if (existing) {
        return res.status(200).json({
          message: "Sesi telah tersinkron sebelumnya (deduplicated)",
          assessmentId: existing.id,
          deduplicated: true,
        });
      }
    }

    const kinematicReplayData = typeof req.body.kinematicReplayData === "string"
      ? req.body.kinematicReplayData
      : (req.body.kinematicReplayData ? JSON.stringify(req.body.kinematicReplayData) : null);

    const {
      missionId,
      sessionScore,
      sessionHits,
      sessionLevel,
      sessionTime,
      notes,
    } = req.body;

    if (!missionId) {
      return res.status(400).json({ error: "missionId is required" });
    }

    let pain = {};
    let painRegions = [];
    let metrics = {};

    try {
      pain = normalizePain(req.body);
      painRegions = normalizePainRegions(req.body.painRegions);
      metrics = normalizeSessionMetrics(req.body.metrics || req.body);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }

    const assessment = await prisma.assessment.create({
      data: {
        patientId: patient.id,
        patientName: patient.name,
        patientAge: patient.age,
        ...pain,
        painRegions,
        ...metrics,
        notes: notes ? `[Latihan Mandiri di Rumah] ${notes}` : "[Latihan Mandiri di Rumah]",
        missionId: parseInt(missionId, 10),
        sessionScore: sessionScore || 0,
        sessionHits: sessionHits || 0,
        sessionLevel: sessionLevel || 1,
        sessionTime: sessionTime || null,
        sessionMode: "HOME",
        clientSessionId: clientSessionId || null,
        kinematicReplayData: kinematicReplayData || null,
        therapistId: patient.therapistId,
      },
    });

    res.json({
      message: "Sesi latihan mandiri di rumah berhasil tersinkron ke dashboard terapis!",
      assessmentId: assessment.id,
    });
  } catch (err) {
    console.error("[Home Assessment Submit Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Kinematic Skeleton Replay Retrieval (Fitur 6) ───────────────────────────

app.get("/api/assessment/:id/replay", authenticateToken, requireActiveSubscription, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid assessment ID" });
    }

    const assessment = await prisma.assessment.findUnique({
      where: { id },
      select: {
        id: true,
        patientName: true,
        missionId: true,
        maxRomDeg: true,
        accuracyPercent: true,
        compensationEvents: true,
        sessionMode: true,
        kinematicReplayData: true,
        createdAt: true,
      },
    });

    if (!assessment) {
      return res.status(404).json({ error: "Sesi asesmen tidak ditemukan" });
    }

    let parsedReplay = null;
    if (assessment.kinematicReplayData) {
      try {
        parsedReplay = JSON.parse(assessment.kinematicReplayData);
      } catch (_) {
        parsedReplay = null;
      }
    }

    res.json({
      id: assessment.id,
      patientName: assessment.patientName,
      missionId: assessment.missionId,
      maxRomDeg: assessment.maxRomDeg,
      accuracyPercent: assessment.accuracyPercent,
      compensationEvents: assessment.compensationEvents,
      sessionMode: assessment.sessionMode,
      replay: parsedReplay,
      createdAt: assessment.createdAt,
    });
  } catch (err) {
    console.error("[Get Replay Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Patient Detail: Report Payload for PDF Generation ────────────────────────

app.get("/api/patients/:ref/report", authenticateToken, requireActiveSubscription, async (req, res) => {
  try {
    const patient = await findPatientByRef(req);
    if (!patient) {
      return res.status(404).json({ error: "Pasien tidak ditemukan" });
    }

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

    const patientAssessments = await prisma.assessment.findMany({
      where: { patientId: patient.id, therapistId: req.therapist.id },
      orderBy: { createdAt: "asc" },
    });

    if (patientAssessments.length === 0) {
      return res.status(404).json({ error: "Pasien belum memiliki sesi" });
    }

    await audit(req, "PATIENT_REPORT", "Patient", patient.id);

    const latest = patientAssessments[patientAssessments.length - 1];
    const first = patientAssessments[0];

    const latestNotes = latest.notes;
    const cleanLatestDraft = sanitizeSummaryDraft(latest.aiSummaryDraft);
    const approvedDraft = latest.aiSummaryApproved ? cleanLatestDraft : null;
    const dynamicRecommendation = buildDynamicClinicalRecommendation({
      patient,
      assessments: patientAssessments,
    });

    const reportData = {
      reportId: `MW-${Date.now().toString().slice(-6)}`,
      generatedAt: new Date().toISOString(),
      therapist,
      patient: {
        id: patient.id,
        medicalRecordNo: patient.medicalRecordNo,
        consent: consentInfo(patient),
        prescription: prescriptionInfo(patient),
        homeAccessCode: patient.homeAccessCode || null,
        name: patient.name,
        age: patient.age,
        firstSession: first.createdAt,
        lastSession: latest.createdAt,
        totalSessions: patientAssessments.length,
        latestNotes,
      },
      recommendation: approvedDraft || dynamicRecommendation,
      recommendationSource: approvedDraft ? "SOAP_APPROVED" : "CLINICAL_DYNAMIC",
      aiSummaryDraft: cleanLatestDraft,
      aiSummaryApproved: Boolean(approvedDraft),
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
        painScores: {
          abduction: a.painAbductionScore,
          flexion: a.painFlexionScore,
          externalRotation: a.painExternalRotationScore,
          internalRotation: a.painInternalRotationScore,
          extension: a.painExtensionScore,
        },
        maxPainScore: maxPainScore(a),
        painRegions: a.painRegions || [],
        maxRomDeg: a.maxRomDeg,
        accuracyPercent: a.accuracyPercent,
        compensationEvents: a.compensationEvents,
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

      // R5: bypass cooldown (force) hanya berlaku di sandbox Midtrans. Di produksi diabaikan.
      const bypassCooldown = IS_PAYMENT_SANDBOX && req.body.force === true;
      if (metrics.isCooldownActive && !bypassCooldown) {
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
      // R4: simulator hanya ada di sandbox. Di produksi endpoint ini seolah tidak ada.
      if (!IS_PAYMENT_SANDBOX) {
        return res.status(404).json({ error: "Not found" });
      }

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

// R2: tidak terdaftar sama sekali kecuali ALLOW_DEV_SEED=true di lingkungan non-produksi.
if (ALLOW_DEV_SEED) {
  app.post("/api/dev/seed", authenticateToken, async (req, res) => {
    try {
      const { seedDatabase } = require("./prisma/seed");
      await seedDatabase();
      res.status(201).json({
        message:
          "Database berhasil di-seed dengan dataset prisma/seed.js. Kata sandi akun seed ada di output konsol server.",
      });
    } catch (err) {
      console.error("[Seed Error]", err);
      res.status(500).json({ error: "Internal server error: " + err.message });
    }
  });
}

// ─── Error handler global (body-parser: payload terlalu besar / JSON rusak) ───
app.use((err, req, res, next) => {
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "Data sesi terlalu besar untuk disimpan." });
  }
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Format data tidak valid." });
  }
  console.error("[Unhandled Error]", err);
  res.status(500).json({ error: "Internal server error" });
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
      console.log(`           POST   /api/auth/register  (kode undangan)`);
      console.log(`           GET    /api/auth/me`);
      console.log(`           POST   /api/assessment`);
      console.log(`           GET    /api/assessments`);
      console.log(`           GET    /api/assessment/:id`);
      console.log(`           GET    /api/patients`);
      console.log(`           GET    /api/patients/:id/summary`);
      console.log(`           GET    /api/patients/:id/report`);
      if (ALLOW_DEV_SEED) {
        console.log(`           POST   /api/dev/seed  (dev only)`);
      }
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
