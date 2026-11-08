const test = require("node:test");
const assert = require("node:assert/strict");
const { KinematicRecorder, KinematicPlayer } = require("./kinematic-replay.js");

function createMockLandmarks() {
  const lm = Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: 0.5, z: 0 }));
  lm[0] = { x: 0.50, y: 0.15 };  // nose
  lm[11] = { x: 0.42, y: 0.30 }; // left shoulder
  lm[12] = { x: 0.58, y: 0.30 }; // right shoulder
  lm[13] = { x: 0.38, y: 0.45 }; // left elbow
  lm[14] = { x: 0.62, y: 0.45 }; // right elbow
  lm[15] = { x: 0.35, y: 0.60 }; // left wrist
  lm[16] = { x: 0.65, y: 0.60 }; // right wrist
  lm[23] = { x: 0.45, y: 0.70 }; // left hip
  lm[24] = { x: 0.55, y: 0.70 }; // right hip
  return lm;
}

test("KinematicRecorder: samples skeletal frames and throttles rate", () => {
  const recorder = new KinematicRecorder({ sampleIntervalMs: 80 });
  const lm = createMockLandmarks();

  recorder.start(1000);
  assert.equal(recorder.isRecording, true);

  // First sample at t=1000
  recorder.sample(lm, 45.2, false, 1000);
  assert.equal(recorder.frames.length, 1);
  assert.equal(recorder.frames[0].t, 0);
  assert.equal(recorder.frames[0].a, 45.2);
  assert.equal(recorder.frames[0].c, 0);
  assert.equal(recorder.frames[0].j.length, 9);

  // Throttled sample (only 20ms later, should be ignored)
  recorder.sample(lm, 50.0, false, 1020);
  assert.equal(recorder.frames.length, 1);

  // Allowed sample (90ms later)
  recorder.sample(lm, 55.4, true, 1090);
  assert.equal(recorder.frames.length, 2);
  assert.equal(recorder.frames[1].t, 90);
  assert.equal(recorder.frames[1].a, 55.4);
  assert.equal(recorder.frames[1].c, 1); // compensation recorded

  const exported = recorder.exportData(1200);
  assert.equal(exported.version, "1.0");
  assert.equal(exported.durationMs, 200);
  assert.equal(exported.frameCount, 2);
});

test("KinematicRecorder: exports valid compact JSON string", () => {
  const recorder = new KinematicRecorder();
  recorder.start(0);
  recorder.sample(createMockLandmarks(), 90, false, 0);

  const json = recorder.exportJson(500);
  assert.ok(typeof json === "string");
  const parsed = JSON.parse(json);
  assert.equal(parsed.frames.length, 1);
  assert.equal(parsed.frames[0].a, 90);
});

test("KinematicPlayer: loads data, seeks, and retrieves matching frame", () => {
  const replayData = {
    version: "1.0",
    durationMs: 1000,
    frames: [
      { t: 0, a: 30, c: 0, j: [] },
      { t: 300, a: 60, c: 0, j: [] },
      { t: 700, a: 95, c: 1, j: [] },
      { t: 1000, a: 110, c: 0, j: [] },
    ],
  };

  const player = new KinematicPlayer(replayData);
  assert.equal(player.durationMs, 1000);
  assert.equal(player.frames.length, 4);

  // Initial frame
  assert.equal(player.getCurrentFrame().t, 0);

  // Seek to 350ms
  player.seek(350);
  const f350 = player.getCurrentFrame();
  assert.equal(f350.t, 300);

  // Seek to 750ms
  player.seek(750);
  const f750 = player.getCurrentFrame();
  assert.equal(f750.t, 700);
  assert.equal(f750.c, 1); // compensation frame

  // Seek to end
  player.seek(1500);
  assert.equal(player.currentTimeMs, 1000);
  assert.equal(player.getCurrentFrame().t, 1000);
});

test("KinematicPlayer: play, pause, and speed adjustments", () => {
  const player = new KinematicPlayer({
    durationMs: 500,
    frames: [{ t: 0, a: 20 }, { t: 500, a: 80 }],
  });

  player.play();
  assert.equal(player.isPlaying, true);

  player.setPlaybackSpeed(1.5);
  assert.equal(player.playbackSpeed, 1.5);

  player.pause();
  assert.equal(player.isPlaying, false);

  player.togglePlay();
  assert.equal(player.isPlaying, true);
});

