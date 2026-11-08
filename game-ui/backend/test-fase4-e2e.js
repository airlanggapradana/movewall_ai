require("dotenv").config({ path: __dirname + "/.env" });
const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");
const Kinematics = require("../kinematic-replay.js");

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://user:password@localhost:5432/movewall_db";
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

test("Fase 4 E2E: Kinematic Replay Storage, Retrieval, and Deduplication", async () => {
  // 1. Find a seeded test patient
  const patient = await prisma.patient.findFirst({
    where: { name: "Budi Pratama" },
    include: { therapist: true },
  });
  assert.ok(patient, "Patient Budi Pratama should exist in seeded database");

  // 2. Generate simulated KinematicRecorder data
  const recorder = new Kinematics.KinematicRecorder({ sampleIntervalMs: 50 });
  function makeMockLandmarks(offset = 0) {
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.99 }));
    lm[0] = { x: 0.5, y: 0.2 - offset };
    lm[11] = { x: 0.42, y: 0.28 - offset };
    lm[12] = { x: 0.58, y: 0.28 - offset };
    lm[13] = { x: 0.38, y: 0.45 - offset };
    lm[14] = { x: 0.62, y: 0.45 - offset };
    lm[15] = { x: 0.36, y: 0.65 - offset };
    lm[16] = { x: 0.64, y: 0.65 - offset };
    lm[23] = { x: 0.44, y: 0.68 - offset };
    lm[24] = { x: 0.56, y: 0.68 - offset };
    return lm;
  }

  // Record 5 frames with slight arm elevation
  const startTime = 10000;
  for (let i = 0; i < 5; i++) {
    const lms = makeMockLandmarks(i * 0.02);
    recorder.sample(lms, 45 + i * 10, i === 3, startTime + i * 100);
  }

  const replayJson = recorder.exportJson(startTime + 500);
  assert.ok(replayJson, "Replay JSON should be generated");
  assert.ok(replayJson.length > 50, "Replay JSON should contain frames data");

  const clientSessionId = `test-sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // 3. Create assessment with kinematicReplayData & clientSessionId
  const createdAssessment = await prisma.assessment.create({
    data: {
      patientId: patient.id,
      patientName: patient.name,
      patientAge: patient.age,
      therapistId: patient.therapistId,
      sessionMode: "CLINIC",
      missionId: 1,
      sessionScore: 560,
      sessionHits: 10,
      sessionLevel: 2,
      sessionTime: "01:15",
      maxRomDeg: 85.0,
      accuracyPercent: 95.0,
      compensationEvents: 1,
      clientSessionId,
      kinematicReplayData: replayJson,
    },
  });

  assert.ok(createdAssessment.id);
  assert.equal(createdAssessment.clientSessionId, clientSessionId);
  assert.ok(createdAssessment.kinematicReplayData);

  // 4. Test deduplication check: finding existing assessment by clientSessionId
  const duplicateCheck = await prisma.assessment.findUnique({
    where: { clientSessionId },
  });
  assert.ok(duplicateCheck, "Should find existing assessment by clientSessionId");
  assert.equal(duplicateCheck.id, createdAssessment.id);

  // 5. Test KinematicPlayer loading and playback of stored replay data
  const parsedData = JSON.parse(createdAssessment.kinematicReplayData);
  const player = new Kinematics.KinematicPlayer(parsedData);
  assert.equal(player.frames.length, 5);
  assert.ok(player.durationMs >= 400);

  // Seek and check frame
  player.seek(300);
  const frameAt300 = player.getCurrentFrame();
  assert.ok(frameAt300, "Should retrieve frame at 300ms");
  assert.equal(frameAt300.c, 1, "Frame at 300ms was marked with compensation");

  // Test canvas rendering mock
  const mockCanvas = {
    width: 640,
    height: 480,
    getContext: () => ({
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      arc: () => {},
      fill: () => {},
      fillText: () => {},
      setLineDash: () => {},
      rect: () => {},
      roundRect: () => {},
    }),
  };
  assert.doesNotThrow(() => {
    player.renderToCanvas(mockCanvas, frameAt300);
  });

  // 6. Cleanup test assessment
  await prisma.assessment.delete({ where: { id: createdAssessment.id } });
  await pool.end();
});
