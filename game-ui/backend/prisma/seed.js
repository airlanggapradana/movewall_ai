/**
 * MoveWall AI — Prisma Seed Script
 * Populates database with 2 default therapist accounts.
 *
 * Usage:
 *   npx prisma db seed
 *   or
 *   node prisma/seed.js
 */

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:admin123@localhost:5432/movewall_db";

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 [MoveWall] Starting therapist database seeding (2 data)...\n");

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
    });

    console.log(`✅ Seeded therapist:`);
    console.log(`   - ID             : ${therapist.id}`);
    console.log(`   - Nama           : ${therapist.name}`);
    console.log(`   - Username       : ${therapist.username}`);
    console.log(`   - Email          : ${therapist.email}`);
    console.log(`   - Spesialisasi   : ${therapist.specialization}`);
    console.log(`   - No. Lisensi/SIP: ${therapist.licenseNumber}`);
    console.log("──────────────────────────────────────────────────");
  }

  // Find therapist01 for assigning patient assessments
  const therapist1 = await prisma.therapist.findUnique({
    where: { username: "therapist01" },
  });

  if (therapist1) {
    console.log("\n📋 Seeding sample patient assessment records...");

    const sampleAssessments = [
      // ── Budi Pratama (48 th) ──────────────────────────────
      {
        patientName: "Budi Pratama",
        patientAge: 48,
        painAbduction: true,
        painFlexion: true,
        painExternalRotation: false,
        painInternalRotation: false,
        painExtension: false,
        notes: "Pasien mengeluh nyeri tajam saat mengangkat lengan di atas 60°. Perlu pembatasan ROM elevasi.",
        missionId: 1,
        sessionScore: 420,
        sessionHits: 5,
        sessionLevel: 1,
        sessionTime: "01:25",
        createdAt: new Date(Date.now() - 4 * 86400000), // 4 hari lalu
        therapistId: therapist1.id,
      },
      {
        patientName: "Budi Pratama",
        patientAge: 48,
        painAbduction: false,
        painFlexion: true,
        painExternalRotation: false,
        painInternalRotation: false,
        painExtension: false,
        notes: "Nyeri abduksi berkurang, stabilitas siku membaik saat menahan repetisi 2 detik di posisi hold.",
        missionId: 1,
        sessionScore: 680,
        sessionHits: 8,
        sessionLevel: 1,
        sessionTime: "01:10",
        createdAt: new Date(Date.now() - 3 * 86400000), // 3 hari lalu
        therapistId: therapist1.id,
      },
      {
        patientName: "Budi Pratama",
        patientAge: 48,
        painAbduction: false,
        painFlexion: true,
        painExternalRotation: false,
        painInternalRotation: false,
        painExtension: false,
        notes: "Mencoba reaching pada pot busur 75°, koordinasi tangan buka-tutup dengan MediaPipe sangat baik.",
        missionId: 2,
        sessionScore: 850,
        sessionHits: 9,
        sessionLevel: 1,
        sessionTime: "00:54",
        createdAt: new Date(Date.now() - 1 * 86400000), // 1 hari lalu
        therapistId: therapist1.id,
      },
      {
        patientName: "Budi Pratama",
        patientAge: 48,
        painAbduction: false,
        painFlexion: false,
        painExternalRotation: false,
        painInternalRotation: false,
        painExtension: false,
        notes: "Peningkatan signifikan! Pasien mampu mencapai elevasi 110° tanpa rasa sakit. Disarankan lanjut Level 2.",
        missionId: 2,
        sessionScore: 1120,
        sessionHits: 10,
        sessionLevel: 2,
        sessionTime: "00:42",
        createdAt: new Date(), // hari ini
        therapistId: therapist1.id,
      },

      // ── Siti Aminah (56 th) ───────────────────────────────
      {
        patientName: "Siti Aminah",
        patientAge: 56,
        painAbduction: true,
        painFlexion: false,
        painExternalRotation: true,
        painInternalRotation: false,
        painExtension: false,
        notes: "Rentang gerak terbatas karena osteoarthritis. Nyeri krepitasi saat elevasi 45°.",
        missionId: 1,
        sessionScore: 350,
        sessionHits: 4,
        sessionLevel: 1,
        sessionTime: "01:30",
        createdAt: new Date(Date.now() - 5 * 86400000),
        therapistId: therapist1.id,
      },
      {
        patientName: "Siti Aminah",
        patientAge: 56,
        painAbduction: true,
        painFlexion: false,
        painExternalRotation: false,
        painInternalRotation: false,
        painExtension: false,
        notes: "Kompensasi miring batang tubuh berkurang setelah instruksi postur tegak di depan proyeksi.",
        missionId: 1,
        sessionScore: 590,
        sessionHits: 7,
        sessionLevel: 1,
        sessionTime: "01:15",
        createdAt: new Date(Date.now() - 2 * 86400000),
        therapistId: therapist1.id,
      },
      {
        patientName: "Siti Aminah",
        patientAge: 56,
        painAbduction: true,
        painFlexion: false,
        painExternalRotation: false,
        painInternalRotation: false,
        painExtension: false,
        notes: "Kekuatan isometrik bahu meningkat, repetisi stabil hingga apel ke-9. Nyeri berkurang ke skala 2/10.",
        missionId: 1,
        sessionScore: 760,
        sessionHits: 9,
        sessionLevel: 1,
        sessionTime: "00:58",
        createdAt: new Date(),
        therapistId: therapist1.id,
      },

      // ── Ahmad Fauzi (32 th) ───────────────────────────────
      {
        patientName: "Ahmad Fauzi",
        patientAge: 32,
        painAbduction: false,
        painFlexion: false,
        painExternalRotation: false,
        painInternalRotation: true,
        painExtension: true,
        notes: "Gerakan eksplosif bagus, timbul nyeri saat deselerasi cepat atau rotasi internal bahu dominan.",
        missionId: 2,
        sessionScore: 820,
        sessionHits: 9,
        sessionLevel: 1,
        sessionTime: "01:05",
        createdAt: new Date(Date.now() - 3 * 86400000),
        therapistId: therapist1.id,
      },
      {
        patientName: "Ahmad Fauzi",
        patientAge: 32,
        painAbduction: false,
        painFlexion: false,
        painExternalRotation: false,
        painInternalRotation: true,
        painExtension: false,
        notes: "Menyiram pot busur tinggi dengan mulus, keluhan ekstensi hilang, rotasi internal membaik.",
        missionId: 2,
        sessionScore: 1240,
        sessionHits: 10,
        sessionLevel: 2,
        sessionTime: "00:46",
        createdAt: new Date(Date.now() - 1 * 86400000),
        therapistId: therapist1.id,
      },
      {
        patientName: "Ahmad Fauzi",
        patientAge: 32,
        painAbduction: false,
        painFlexion: false,
        painExternalRotation: false,
        painInternalRotation: false,
        painExtension: false,
        notes: "Tidak ada keluhan nyeri. Kontrol skapula simetris dan ritme ritmis pada ROM 135°.",
        missionId: 1,
        sessionScore: 1350,
        sessionHits: 10,
        sessionLevel: 2,
        sessionTime: "00:38",
        createdAt: new Date(),
        therapistId: therapist1.id,
      },

      // ── Dewi Lestari (41 th) ──────────────────────────────
      {
        patientName: "Dewi Lestari",
        patientAge: 41,
        painAbduction: false,
        painFlexion: true,
        painExternalRotation: true,
        painInternalRotation: false,
        painExtension: false,
        notes: "Adhesive capsulitis fase thawing. Pemanasan pendulum 5 menit sebelum sesi.",
        missionId: 1,
        sessionScore: 510,
        sessionHits: 6,
        sessionLevel: 1,
        sessionTime: "01:22",
        createdAt: new Date(Date.now() - 2 * 86400000),
        therapistId: therapist1.id,
      },
      {
        patientName: "Dewi Lestari",
        patientAge: 41,
        painAbduction: false,
        painFlexion: false,
        painExternalRotation: true,
        painInternalRotation: false,
        painExtension: false,
        notes: "Rentang elevasi meningkat ~15°. Toleransi gerak aktif tanpa kelelahan berlebih.",
        missionId: 2,
        sessionScore: 790,
        sessionHits: 8,
        sessionLevel: 1,
        sessionTime: "01:02",
        createdAt: new Date(),
        therapistId: therapist1.id,
      },
    ];

    // Clear existing assessments to avoid duplication on re-seed
    await prisma.assessment.deleteMany({
      where: { therapistId: therapist1.id },
    });

    for (const item of sampleAssessments) {
      await prisma.assessment.create({ data: item });
    }

    console.log(`✅ Berhasil membuat ${sampleAssessments.length} rekam asesmen untuk 4 pasien teladan!`);

    // Also assign sample patient to therapist02 if exists
    const therapist2 = await prisma.therapist.findUnique({
      where: { username: "therapist02" },
    });
    if (therapist2) {
      await prisma.assessment.deleteMany({
        where: { therapistId: therapist2.id },
      });
      for (const item of sampleAssessments.slice(0, 4)) {
        await prisma.assessment.create({
          data: {
            ...item,
            therapistId: therapist2.id,
          },
        });
      }
    }
  }

  console.log("\n🎉 Seeding selesai! Data Terapis & Riwayat Pasien siap digunakan.");
  console.log("📋 Kredensial Login Default:");
  console.log("   1. Username: therapist01 | Password: movewall2026");
  console.log("   2. Username: therapist02 | Password: movewall2026\n");

  return { success: true };
}

module.exports = { seedDatabase: main };

if (require.main === module) {
  main()
    .catch((e) => {
      console.error("❌ Seeding gagal:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
      await pool.end();
    });
}
