const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizePain,
  normalizePainRegions,
  normalizeSessionMetrics,
  maxPainScore,
  hasAnyPain,
  validatePrescription,
  ValidationError,
} = require("./clinical");

test("skor nyeri numerik menurunkan flag boolean", () => {
  const out = normalizePain({ painFlexionScore: 4, painAbductionScore: "0" });
  assert.equal(out.painFlexionScore, 4);
  assert.equal(out.painFlexion, true);
  assert.equal(out.painAbductionScore, 0);
  assert.equal(out.painAbduction, false);
  assert.equal(out.painExtensionScore, null);
});

test("klien lama yang hanya mengirim boolean tetap diterima", () => {
  const out = normalizePain({ painExtension: true });
  assert.equal(out.painExtension, true);
  assert.equal(out.painExtensionScore, null);
  assert.equal(out.painFlexion, false);
});

test("skor di luar 0–10 atau pecahan ditolak", () => {
  assert.throws(() => normalizePain({ painFlexionScore: 11 }), ValidationError);
  assert.throws(() => normalizePain({ painFlexionScore: -1 }), ValidationError);
  assert.throws(() => normalizePain({ painFlexionScore: 2.5 }), ValidationError);
  assert.throws(() => normalizePain({ painFlexionScore: "abc" }), ValidationError);
});

test("wilayah nyeri divalidasi dan didedup", () => {
  assert.deepEqual(
    normalizePainRegions(["R_ANTERIOR", "R_ANTERIOR", "L_SCAPULA"]),
    ["R_ANTERIOR", "L_SCAPULA"],
  );
  assert.deepEqual(normalizePainRegions(undefined), []);
  assert.throws(() => normalizePainRegions(["R_KNEE"]), ValidationError);
  assert.throws(() => normalizePainRegions("R_ANTERIOR"), ValidationError);
});

test("metrik sesi opsional dan dibatasi rentangnya", () => {
  assert.deepEqual(normalizeSessionMetrics({}), {
    maxRomDeg: null,
    accuracyPercent: null,
    compensationEvents: null,
  });
  assert.deepEqual(
    normalizeSessionMetrics({
      maxRomDeg: 123.456,
      accuracyPercent: 80.4,
      compensationEvents: 3,
    }),
    { maxRomDeg: 123.5, accuracyPercent: 80, compensationEvents: 3 },
  );
  assert.throws(() => normalizeSessionMetrics({ maxRomDeg: 200 }), ValidationError);
  assert.throws(() => normalizeSessionMetrics({ accuracyPercent: 101 }), ValidationError);
  assert.throws(() => normalizeSessionMetrics({ compensationEvents: -1 }), ValidationError);
});

test("maxPainScore dan hasAnyPain", () => {
  const rec = { painFlexionScore: 3, painAbductionScore: 7, painFlexion: true };
  assert.equal(maxPainScore(rec), 7);
  assert.equal(maxPainScore({}), null);
  assert.equal(hasAnyPain(rec), true);
  assert.equal(hasAnyPain({}), false);
});

test("validatePrescription memvalidasi rentang dan relasi batas ROM", () => {
  // Nilai default bila tidak disediakan
  assert.deepEqual(validatePrescription({}), {
    initialTargetRom: 45.0,
    maxSafetyCeiling: 135.0,
    minFunctionalRom: 30.0,
    adaptiveEnabled: true,
  });

  // Nilai kustom valid
  assert.deepEqual(
    validatePrescription({
      initialTargetRom: 60,
      maxSafetyCeiling: 120,
      minFunctionalRom: 35,
      adaptiveEnabled: false,
    }),
    {
      initialTargetRom: 60.0,
      maxSafetyCeiling: 120.0,
      minFunctionalRom: 35.0,
      adaptiveEnabled: false,
    },
  );

  // Batas minimum > initial target -> tolak
  assert.throws(
    () => validatePrescription({ initialTargetRom: 40, minFunctionalRom: 50 }),
    ValidationError,
  );

  // Initial target > ceiling -> tolak
  assert.throws(
    () => validatePrescription({ initialTargetRom: 140, maxSafetyCeiling: 120 }),
    ValidationError,
  );

  // Di luar rentang 15–180° -> tolak
  assert.throws(
    () => validatePrescription({ maxSafetyCeiling: 190 }),
    ValidationError,
  );
  assert.throws(
    () => validatePrescription({ minFunctionalRom: 10 }),
    ValidationError,
  );
});


