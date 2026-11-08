const test = require("node:test");
const assert = require("node:assert/strict");
const PlayerTracker = require("./player-tracker.js");

function createMockLandmarks(options = {}) {
  const {
    lsX = 0.45, lsY = 0.30,
    rsX = 0.55, rsY = 0.30,
    lhX = 0.47, lhY = 0.65,
    rhX = 0.53, rhY = 0.65,
    vis = 0.9,
  } = options;

  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: vis }));
  landmarks[11] = { x: lsX, y: lsY, z: 0, visibility: vis };
  landmarks[12] = { x: rsX, y: rsY, z: 0, visibility: vis };
  landmarks[23] = { x: lhX, y: lhY, z: 0, visibility: vis };
  landmarks[24] = { x: rhX, y: rhY, z: 0, visibility: vis };
  return landmarks;
}

test("computeCentroid: calculates body centroid and geometry accurately", () => {
  const lm = createMockLandmarks({
    lsX: 0.40, lsY: 0.30,
    rsX: 0.60, rsY: 0.30,
    lhX: 0.45, lhY: 0.70,
    rhX: 0.55, rhY: 0.70,
  });

  const c = PlayerTracker.computeCentroid(lm);
  assert.ok(c);
  assert.equal(c.x, 0.5);
  assert.equal(c.y, 0.5);
  assert.ok(Math.abs(c.shoulderWidth - 0.20) < 0.001);
  assert.ok(Math.abs(c.torsoHeight - 0.40) < 0.001);
  assert.equal(c.shoulderTilt, 0);
});

test("computeCentroid: returns null when essential landmarks have low visibility", () => {
  const lm = createMockLandmarks({ vis: 0.1 });
  const c = PlayerTracker.computeCentroid(lm);
  assert.equal(c, null);
});

test("computeCentroid: returns null when input is empty or invalid", () => {
  assert.equal(PlayerTracker.computeCentroid(null), null);
  assert.equal(PlayerTracker.computeCentroid([]), null);
  assert.equal(PlayerTracker.computeCentroid([{ x: 0, y: 0 }]), null);
});

test("evaluateCameraCalibration: detects optimal distance and level shoulders", () => {
  const lm = createMockLandmarks({
    lsX: 0.42, lsY: 0.30,
    rsX: 0.58, rsY: 0.30,
    lhX: 0.45, lhY: 0.65,
    rhX: 0.55, rhY: 0.65,
  });

  const report = PlayerTracker.evaluateCameraCalibration(lm, 15.5);
  assert.equal(report.valid, true);
  assert.equal(report.distanceStatus, "OPTIMAL");
  assert.equal(report.shoulderStatus, "LEVEL");
  assert.equal(report.zeroOffset, 15.5);
});

test("evaluateCameraCalibration: detects too far when torso height < 0.20", () => {
  const lm = createMockLandmarks({
    lsX: 0.48, lsY: 0.40,
    rsX: 0.52, rsY: 0.40,
    lhX: 0.48, lhY: 0.55, // torso height = 0.15
    rhX: 0.52, rhY: 0.55,
  });

  const report = PlayerTracker.evaluateCameraCalibration(lm);
  assert.equal(report.distanceStatus, "TOO_FAR");
});

test("evaluateCameraCalibration: detects too close when torso height > 0.48", () => {
  const lm = createMockLandmarks({
    lsX: 0.30, lsY: 0.20,
    rsX: 0.70, rsY: 0.20,
    lhX: 0.35, lhY: 0.75, // torso height = 0.55
    rhX: 0.65, rhY: 0.75,
  });

  const report = PlayerTracker.evaluateCameraCalibration(lm);
  assert.equal(report.distanceStatus, "TOO_CLOSE");
});

test("evaluateCameraCalibration: detects shoulder tilt > 0.04", () => {
  const lm = createMockLandmarks({
    lsX: 0.40, lsY: 0.25, // tilted
    rsX: 0.60, rsY: 0.32,
    lhX: 0.45, lhY: 0.65,
    rhX: 0.55, rhY: 0.65,
  });

  const report = PlayerTracker.evaluateCameraCalibration(lm);
  assert.equal(report.shoulderStatus, "TILTED");
  assert.ok(report.shoulderLabel.includes("Bahu Miring"));
});

test("matchLockedPlayer: picks nearest body to locked centroid and ignores bystanders", () => {
  // Player at (0.35, 0.50)
  const player = createMockLandmarks({ lsX: 0.25, rsX: 0.45, lhX: 0.30, rhX: 0.40 });
  // Bystander at (0.80, 0.50)
  const bystander = createMockLandmarks({ lsX: 0.70, rsX: 0.90, lhX: 0.75, rhX: 0.85 });

  const lockedCentroid = { x: 0.36, y: 0.50 };

  const match = PlayerTracker.matchLockedPlayer([bystander, player], lockedCentroid, 0.38);
  assert.ok(match);
  assert.equal(match.landmarks, player);
  assert.ok(match.distance < 0.05);
});

test("matchLockedPlayer: returns null if player is occluded/out of bounds", () => {
  // Only bystander at (0.80, 0.50)
  const bystander = createMockLandmarks({ lsX: 0.70, rsX: 0.90, lhX: 0.75, rhX: 0.85 });
  const lockedCentroid = { x: 0.20, y: 0.50 }; // distance = 0.60 > 0.38

  const match = PlayerTracker.matchLockedPlayer([bystander], lockedCentroid, 0.38);
  assert.equal(match, null);
});

test("smoothCentroid: applies exponential smoothing factor", () => {
  const current = { x: 0.50, y: 0.50 };
  const detected = { x: 0.60, y: 0.60 };
  const smoothed = PlayerTracker.smoothCentroid(current, detected, 0.20);

  // 0.50 * 0.80 + 0.60 * 0.20 = 0.40 + 0.12 = 0.52
  assert.ok(Math.abs(smoothed.x - 0.52) < 0.001);
  assert.ok(Math.abs(smoothed.y - 0.52) < 0.001);
});

test("applyZeroOffset: normalizes elevation angle and clamps to 0", () => {
  assert.equal(PlayerTracker.applyZeroOffset(45.5, 15.0), 30.5);
  assert.equal(PlayerTracker.applyZeroOffset(12.0, 15.0), 0.0);
  assert.equal(PlayerTracker.applyZeroOffset(0, 0), 0.0);
});

