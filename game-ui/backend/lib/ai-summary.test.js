const test = require("node:test");
const assert = require("node:assert/strict");
const { generateClinicalSummaryDraft } = require("./ai-summary");

test("menghasilkan draf SOAP yang valid untuk pasien dengan sesi latihan", () => {
  const patient = {
    name: "Siti Aminah",
    age: 56,
    medicalRecordNo: "MW-000001",
    prescription: {
      initialTargetRom: 45.0,
      maxSafetyCeiling: 90.0,
      minFunctionalRom: 30.0,
      adaptiveEnabled: true,
    },
  };

  const sessions = [
    {
      sessionNumber: 1,
      maxRomDeg: 60.0,
      accuracyPercent: 70,
      compensationEvents: 3,
      hasPain: true,
      painScores: { flexion: 4, abduction: 5 },
      painRegions: ["R_ANTERIOR", "R_LATERAL"],
    },
    {
      sessionNumber: 2,
      maxRomDeg: 78.0,
      accuracyPercent: 85,
      compensationEvents: 1,
      hasPain: false,
      painScores: { flexion: 0, abduction: 0 },
      painRegions: [],
    },
  ];

  const draft = generateClinicalSummaryDraft({ patient, sessions });

  assert.ok(draft.soap);
  assert.ok(draft.soap.subjective.includes("Terdapat keluhan nyeri"));
  assert.ok(draft.soap.objective.includes("Batas aman resep (Safety Ceiling): 90°"));
  assert.ok(draft.soap.objective.includes("peningkatan +18°"));
  assert.ok(draft.soap.assessment.length > 10);
  assert.ok(draft.soap.plan.length > 10);
  assert.ok(draft.formattedText.includes("[S - SUBJEKTIF]"));
  assert.ok(draft.formattedText.includes("[O - OBJEKTIF]"));
  assert.ok(draft.formattedText.includes("[A - ASESMEN]"));
  assert.ok(draft.formattedText.includes("[P - PLAN TERAPI]"));
  // Memastikan tidak ada diagnosis palsu / halusinasi
  assert.ok(!draft.formattedText.includes("diagnosis definitif"));
});

test("menangani pasien tanpa riwayat sesi secara aman", () => {
  const draft = generateClinicalSummaryDraft({
    patient: { name: "Budi Pratama" },
    sessions: [],
  });

  assert.ok(draft.soap);
  assert.ok(draft.soap.subjective.includes("Belum ada sesi latihan"));
  assert.ok(draft.formattedText.includes("Belum ada sesi latihan"));
});

