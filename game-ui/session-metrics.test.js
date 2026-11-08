const test = require("node:test");
const assert = require("node:assert/strict");
const { createRecorder } = require("./session-metrics");

function feed(rec, n, over) {
  for (let i = 0; i < n; i += 1) {
    rec.sample({
      angle: 90,
      targetRom: 90,
      under: 6,
      over: 7,
      compensation: false,
      now: i * 100,
      ...over,
    });
  }
}

test("data terlalu sedikit menghasilkan null, bukan angka palsu", () => {
  const rec = createRecorder();
  feed(rec, 5);
  assert.deepEqual(rec.snapshot(), {
    maxRomDeg: null,
    accuracyPercent: null,
    compensationEvents: null,
  });
});

test("ROM maksimum dan akurasi dihitung dari frame dekat target", () => {
  const rec = createRecorder();
  feed(rec, 20); // 20 frame di dalam jendela
  feed(rec, 20, { angle: 80 }); // dekat target (10°) tapi di luar jendela
  feed(rec, 20, { angle: 20 }); // jauh dari target: tidak dihitung akurasi
  const snap = rec.snapshot();
  assert.equal(snap.maxRomDeg, 90);
  assert.equal(snap.accuracyPercent, 50);
  assert.equal(snap.compensationEvents, 0);
});

test("frame terkompensasi tidak menaikkan ROM maksimum", () => {
  const rec = createRecorder();
  feed(rec, 20, { angle: 60, targetRom: 60 });
  feed(rec, 5, { angle: 120, targetRom: 60, compensation: true });
  assert.equal(rec.snapshot().maxRomDeg, 60);
});

test("episode kompensasi dihitung sekali per episode dengan jeda", () => {
  const rec = createRecorder();
  feed(rec, 20);
  // episode 1: 3 frame berturut-turut
  for (let i = 0; i < 3; i += 1) feed(rec, 1, { compensation: true, now: 5000 + i * 100 });
  feed(rec, 1, { now: 5400 }); // pulih
  // episode 2: berselang lama
  for (let i = 0; i < 2; i += 1) feed(rec, 1, { compensation: true, now: 9000 + i * 100 });
  assert.equal(rec.snapshot().compensationEvents, 2);
});

test("kedipan singkat kompensasi (<600ms) tidak dihitung dua kali", () => {
  const rec = createRecorder();
  feed(rec, 20);
  feed(rec, 1, { compensation: true, now: 5000 });
  feed(rec, 1, { now: 5100 });
  feed(rec, 1, { compensation: true, now: 5200 });
  assert.equal(rec.snapshot().compensationEvents, 1);
});

test("reset mengosongkan data", () => {
  const rec = createRecorder();
  feed(rec, 20);
  rec.reset();
  assert.equal(rec.snapshot().maxRomDeg, null);
});

