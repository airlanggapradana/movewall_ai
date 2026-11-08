const test = require("node:test");
const assert = require("node:assert/strict");
const { AdaptiveEngine, RepQuality } = require("./adaptive-engine");

const CFG = {
  exerciseType: "SHOULDER_FLEXION",
  initialTargetRom: 90.0,
  maxSafetyCeiling: 140.0,
  minFunctionalRom: 40.0,
  repsPerSet: 5,
};

test("Test 1: Adaptasi Per-Set (bukan per-rep)", () => {
  const e1 = new AdaptiveEngine(CFG);
  const romInit = e1.targetRom;
  for (let i = 0; i < 5; i++) {
    e1.recordRep(RepQuality.VALID, 100.0, 2.0);
  }
  // Target ROM TIDAK berubah sebelum endSet()
  assert.equal(e1.targetRom, romInit);

  const s1 = e1.endSet();
  // Target ROM NAIK setelah endSet()
  assert.ok(e1.targetRom > romInit);
  assert.ok(s1.adaptation_applied > 0);
  assert.equal(e1.targetRom, 90.0 * 1.05);
});

test("Test 2: Flow Zone SR=80% (target stabil)", () => {
  const e2 = new AdaptiveEngine(CFG);
  const romBefore2 = e2.targetRom;
  for (let i = 0; i < 4; i++) {
    e2.recordRep(RepQuality.VALID, 95.0, 2.0);
  }
  e2.recordRep(RepQuality.INVALID, 30.0, 2.0);
  const s2 = e2.endSet();

  assert.ok(Math.abs(s2.success_rate - 0.8) < 1e-4);
  assert.ok(Math.abs(e2.targetRom - romBefore2) < 0.01);
});

test("Test 3: Target ROM Turun (SR < 70%)", () => {
  const e3 = new AdaptiveEngine(CFG);
  const romBefore3 = e3.targetRom;
  for (let i = 0; i < 5; i++) {
    e3.recordRep(RepQuality.INVALID, 30.0, 2.0);
  }
  e3.endSet();

  assert.ok(e3.targetRom < romBefore3);
  assert.ok(e3.targetRom >= 40.0); // Tidak di bawah minFunctionalRom
});

test("Test 4: Pain Override (Tombol Stop/Nyeri)", () => {
  const e4 = new AdaptiveEngine(CFG);
  e4.recordRep(RepQuality.VALID, 95.0);
  e4.triggerPainOverride();

  assert.equal(e4._painOverrideActive, true);
  assert.equal(e4.targetRom, 40.0); // minFunctionalRom

  const p4 = e4.generatePayload(1, 45.0, "RESTING");
  assert.ok(p4.audio_cue && p4.audio_cue.includes("dihentikan"));
  assert.equal(p4.visual_overlay_color, "RED");

  e4.resetPainOverride();
  assert.equal(e4._painOverrideActive, false);
});

test("Test 5: Fatigue Override (auto, tempo drop > 40%)", () => {
  const e5 = new AdaptiveEngine(CFG);
  for (const dur of [1.5, 1.6, 1.4]) {
    e5.recordRep(RepQuality.VALID, 95.0, dur);
  }
  for (const dur of [3.0, 3.5]) {
    e5.recordRep(RepQuality.VALID, 95.0, dur);
  }
  e5.endSet();

  assert.equal(e5._fatigueOverrideActive, true);
  assert.equal(e5.targetRom, 40.0);
});

test("Test 6: Consistency Bonus", () => {
  const e6a = new AdaptiveEngine(CFG);
  for (const a of [89.0, 90.0, 91.0, 90.5, 89.5]) {
    e6a.recordRep(RepQuality.VALID, a, 2.0);
  }
  const s6a = e6a.endSet();

  const e6b = new AdaptiveEngine(CFG);
  for (const a of [45.0, 90.0, 30.0, 88.0, 55.0]) {
    e6b.recordRep(RepQuality.PARTIAL, a, 2.0);
  }
  const s6b = e6b.endSet();

  assert.ok(s6a.consistency_bonus > s6b.consistency_bonus);
});

test("Test 7: JSON Payload Schema v1.1", () => {
  const e7 = new AdaptiveEngine(CFG);
  e7.recordRep(RepQuality.VALID, 95.0);
  const p7 = e7.generatePayload(300, 88.0, "ASCENDING", true);
  const pd7 = p7.toDict();

  const reqKeys = [
    "frame_id",
    "exercise_type",
    "current_angle",
    "state",
    "rep_status",
    "metrics",
    "audio_cue",
    "visual_overlay_color",
  ];
  const reqMetrics = [
    "valid_reps",
    "partial_reps",
    "target_rom",
    "success_rate",
    "arar",
    "consistency_bonus",
    "reps_in_current_set",
  ];

  for (const k of reqKeys) {
    assert.ok(k in pd7, `Missing key in payload: ${k}`);
  }
  for (const k of reqMetrics) {
    assert.ok(k in pd7.metrics, `Missing metric: ${k}`);
  }
  assert.equal(pd7.rep_status, "VALID");
  assert.ok(typeof JSON.parse(p7.toJSON()) === "object");
});

test("Test 8: Max Safety Ceiling dipatuhi", () => {
  const e8 = new AdaptiveEngine("TEST", 135.0, 140.0, 40.0);
  for (let i = 0; i < 5; i++) {
    e8.recordRep(RepQuality.VALID, 150.0, 2.0);
  }
  e8.endSet();

  // 135 * 1.05 = 141.75, tapi dicap di 140.0
  assert.ok(e8.targetRom <= 140.0);
  assert.equal(e8.targetRom, 140.0);
});

test("Test 9: generateTargets menghasilkan array progresif dibatasi safety ceiling", () => {
  const e9 = new AdaptiveEngine("TEST", 45.0, 90.0, 30.0);
  const targets = e9.generateTargets(10);
  assert.equal(targets.length, 10);
  assert.equal(targets[0], 45);
  assert.equal(targets[targets.length - 1], 90);
  assert.ok(targets.every((t) => t >= 30 && t <= 90));
});

test("Test 10: adaptiveEnabled false menjaga target tetap konstan", () => {
  const e10 = new AdaptiveEngine({
    ...CFG,
    adaptiveEnabled: false,
  });
  for (let i = 0; i < 5; i++) {
    e10.recordRep(RepQuality.VALID, 100.0, 2.0);
  }
  const s10 = e10.endSet();
  assert.equal(e10.targetRom, 90.0);
  assert.equal(s10.adaptation_applied, 0);
});

