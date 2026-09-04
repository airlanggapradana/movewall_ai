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

  console.log("\n🎉 Seeding selesai! 2 Data Therapist berhasil disiapkan.");
  console.log("📋 Kredensial Login Default:");
  console.log("   1. Username: therapist01 | Password: movewall2026");
  console.log("   2. Username: therapist02 | Password: movewall2026\n");
}

main()
  .catch((e) => {
    console.error("❌ Seeding gagal:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
