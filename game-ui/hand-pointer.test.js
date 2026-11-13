const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { HandPointer, facingLeft } = require("./hand-pointer.js");

test("stationary landmark noise is damped while rendering between camera samples", () => {
  const pointer = new HandPointer();
  pointer.sample(0.5, 0.5, 0);
  let peakError = 0;
  for (let frame = 1; frame <= 120; frame++) {
    if (frame % 2 === 0) {
      const noise = frame % 4 === 0 ? 0.006 : -0.006;
      pointer.sample(0.5 + noise, 0.5 - noise, frame * 1000 / 60);
    }
    const position = pointer.advance(1 / 60);
    peakError = Math.max(peakError, Math.abs(position.x - 0.5));
  }
  assert.ok(peakError < 0.003, `remaining noise: ${peakError}`);
});

test("moving hand stays responsive at camera rates of 15 and 30 FPS", () => {
  for (const sampleEvery of [2, 4]) {
    const pointer = new HandPointer();
    pointer.sample(0.2, 0.4, 0);
    for (let frame = 1; frame <= 120; frame++) {
      const x = 0.2 + frame / 120 * 0.6;
      if (frame % sampleEvery === 0) pointer.sample(x, 0.4, frame * 1000 / 60);
      const position = pointer.advance(1 / 60);
      assert.ok(position.x <= x, "must not overshoot the hand");
      assert.ok(x - position.x < 0.05, "reach must stay within 5% of screen width");
    }
  }
});

test("render smoothing follows elapsed time across different display rates", () => {
  function render(fps) {
    const pointer = new HandPointer();
    pointer.sample(0.2, 0.4, 0);
    pointer.sample(0.8, 0.6, 1000 / 30);
    for (let frame = 0; frame < fps / 10; frame++) pointer.advance(1 / fps);
    return pointer.position;
  }
  const slow = render(30);
  const fast = render(120);
  assert.ok(Math.abs(slow.x - fast.x) < 1e-10);
  assert.ok(Math.abs(slow.y - fast.y) < 1e-10);
});

test("short dropouts hold position and reacquisition moves smoothly", () => {
  const pointer = new HandPointer();
  pointer.sample(0.3, 0.4, 0);
  for (let i = 0; i < 8; i++) pointer.advance(1 / 60);
  assert.deepEqual(pointer.position, { x: 0.3, y: 0.4 });
  pointer.sample(0.6, 0.4, 150);
  const resumed = pointer.advance(1 / 60).x;
  assert.ok(resumed > 0.3 && resumed < 0.6);
  pointer.reset();
  pointer.sample(0.8, 0.2, 1000);
  assert.deepEqual(pointer.advance(1 / 60), { x: 0.8, y: 0.2 });
});

test("duplicate timestamps and invalid samples cannot corrupt the pointer", () => {
  const pointer = new HandPointer();
  pointer.sample(0.3, 0.4, 100);
  pointer.sample(0.9, 0.8, 100);
  pointer.sample(NaN, 0.8, 200);
  assert.deepEqual(pointer.advance(1 / 60), { x: 0.3, y: 0.4 });
});

test("can direction holds near pot center and changes after a deliberate crossing", () => {
  let left = false;
  for (const x of [499, 501, 496, 504, 500]) {
    left = facingLeft(x, 500, left);
    assert.equal(left, false);
  }
  left = facingLeft(530, 500, left);
  assert.equal(left, true);
  assert.equal(facingLeft(500, 500, left), true);
  assert.equal(facingLeft(470, 500, left), false);
});

// Run the real gameplay function to catch position feedback from target attraction.
const mission = fs.readFileSync(require.resolve("./mission2.js"), "utf8");
const wateringLogic = mission.slice(
  mission.indexOf("function updateWateringLogic(dt)"),
  mission.indexOf("function waterPot(pot)")
);

test("watering checks preserve camera position and still require open hand, ROM and range", () => {
  const pot = { x: 0.5, y: 0.52, requiredRom: 65, waterProgress: 0 };
  const game = {
    running: true, painStop: false, targetCooldown: 0, level: 1,
    handFollow: { x: 0.53, y: 0.5, visible: true },
    canTipPos: { x: 900, y: 600 }, clinicalAngle: 65, isHandOpen: true,
  };
  const context = vm.createContext({
    game, canvas: { clientWidth: 1280, clientHeight: 720 },
    getTargetPot: () => pot, setFeedback() {}, waterPot() {},
    audio: { startWaterSound() {}, stopWaterSound() {} },
  });
  vm.runInContext(wateringLogic, context);
  for (let frame = 0; frame < 30; frame++) {
    vm.runInContext("updateWateringLogic(1 / 60)", context);
    assert.equal(game.handFollow.x, 0.53);
    assert.equal(game.handFollow.y, 0.5);
  }
  assert.equal(game.isWatering, true);
  assert.ok(pot.waterProgress > 0);

  for (const change of [
    { isHandOpen: false },
    { isHandOpen: true, clinicalAngle: 20 },
    { clinicalAngle: 65, handFollow: { x: 0.9, y: 0.9, visible: true } },
  ]) {
    Object.assign(game, change);
    const previousProgress = pot.waterProgress;
    vm.runInContext("updateWateringLogic(1 / 60)", context);
    assert.equal(game.isWatering, false);
    assert.equal(pot.waterProgress, previousProgress);
  }
});
