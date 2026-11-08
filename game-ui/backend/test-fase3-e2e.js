require("dotenv").config({ path: __dirname + "/.env" });
const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");
const { generateClinicalSummaryDraft } = require("./lib/ai-summary.js");

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://user:password@localhost:5432/movewall_db";
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

test("Fase 3 E2E: Database and AI summary / Home session verification", async () => {
  // 1. Find a seeded test patient
  const patient = await prisma.patient.findFirst({
    where: { name: "Budi Pratama" },
    include: { assessments: true, therapist: true },
  });
  console.log("Found patient:", patient ? patient.name : "null");

  assert.ok(patient, "Patient Budi Pratama should exist in seeded database");
  assert.ok(patient.initialTargetRom, "Prescription should exist");

  // 2. Test generateClinicalSummaryDraft on real patient assessments
  const summaryRes = generateClinicalSummaryDraft({
    patient,
    sessions: patient.assessments,
    therapist: patient.therapist,
  });
  const { formattedText } = summaryRes;

  assert.ok(formattedText.includes("[S - SUBJEKTIF]"), "Draft should include Subjective section");
  assert.ok(formattedText.includes("[O - OBJEKTIF]"), "Draft should include Objective section");
  assert.ok(formattedText.includes("[A - ASESMEN]"), "Draft should include Assessment section");
  assert.ok(formattedText.includes("[P - PLAN TERAPI]"), "Draft should include Plan section");
  assert.ok(formattedText.includes("Safety Ceiling"), "Draft should include safety ceiling reference");

  // 3. Test homeAccessCode generation & uniqueness
  const homeCode = `MW-HOME-TEST-${Date.now().toString(36).toUpperCase()}`;
  const updatedPatient = await prisma.patient.update({
    where: { id: patient.id },
    data: { homeAccessCode: homeCode },
  });
  assert.equal(updatedPatient.homeAccessCode, homeCode);

  // 4. Test Home assessment submission (sessionMode: "HOME")
  const homeAssessment = await prisma.assessment.create({
    data: {
      patientId: patient.id,
      patientName: patient.name,
      patientAge: patient.age,
      therapistId: patient.therapistId,
      sessionMode: "HOME",
      missionId: 1,
      sessionScore: 520,
      sessionHits: 9,
      sessionLevel: 2,
      sessionTime: "01:25",
      maxRomDeg: 108.5,
      accuracyPercent: 92.0,
      compensationEvents: 1,
      painFlexion: true,
      painFlexionScore: 3,
      painRegions: ["Anterior Bahu"],
      notes: "Latihan mandiri pasien di rumah via kode akses.",
      aiSummaryDraft: formattedText,
      aiSummaryApproved: true,
    },
  });

  assert.equal(homeAssessment.sessionMode, "HOME");
  assert.equal(homeAssessment.aiSummaryApproved, true);
  assert.ok(homeAssessment.aiSummaryDraft.length > 50);

  // 5. Cleanup test assessment
  await prisma.assessment.delete({ where: { id: homeAssessment.id } });
  await pool.end();
});
