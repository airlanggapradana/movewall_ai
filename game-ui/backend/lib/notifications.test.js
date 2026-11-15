const test = require("node:test");
const assert = require("node:assert/strict");
const { createStore } = require("../test-support/application-store");
const { processNotifications, createResendTransport, enqueueNotification, RETRY_WINDOW_MS } = require("./notifications");
async function fixture() {
  const prisma = createStore();
  await enqueueNotification(prisma, { id: 1, email: "rina@example.test" }, { id: "event-one", toStatus: "NEEDS_REVISION", reason: "Perbaiki nama klinik." });
  return prisma;
}
test("outbox survives delivery failure and retries with the same event id", async () => {
  const prisma = await fixture(); const time = Date.now() + 100;
  await processNotifications({ prisma, now: () => new Date(time), transport: async () => { throw new Error("connection reset"); } });
  assert.equal(prisma.state.notifications[0].status, "PENDING"); assert.equal(prisma.state.notifications[0].attempts, 1);
  const seen = [];
  const transport = createResendTransport({ apiKey: "fake", from: "MoveWall <no-reply@example.test>", fetchImpl: async (url, options) => {
    seen.push(options); return { ok: true, json: async () => ({ id: "provider-one" }) };
  } });
  await processNotifications({ prisma, now: () => new Date(time + 61000), transport });
  await processNotifications({ prisma, now: () => new Date(time + 62000), transport });
  assert.equal(seen.length, 1); assert.equal(seen[0].headers["Idempotency-Key"], "application/event-one");
  assert.match(JSON.parse(seen[0].body).text, /Perbaiki nama klinik/); assert.equal(prisma.state.notifications[0].status, "SENT");
});
test("two workers claim a job once; expired leases retain the idempotency event", async () => {
  const prisma = await fixture(); let sends = 0;
  const options = { prisma, now: () => new Date(Date.now() + 100), transport: async () => { sends++; return "sent"; } };
  await Promise.all([processNotifications(options), processNotifications(options)]); assert.equal(sends, 1);
  Object.assign(prisma.state.notifications[0], { status: "SENDING", lockedUntil: new Date(0), attempts: 1, firstAttemptAt: new Date() });
  await processNotifications(options); assert.equal(sends, 2); assert.equal(prisma.state.notifications[0].eventId, "event-one");
});
test("ambiguous sends beyond provider idempotency window are never resent", async () => {
  const prisma = await fixture(); const time = new Date();
  Object.assign(prisma.state.notifications[0], { status: "SENDING", firstAttemptAt: new Date(time - RETRY_WINDOW_MS - 1), lockedUntil: new Date(0) });
  await processNotifications({ prisma, now: () => time, transport: async () => { throw new Error("MUST NOT SEND"); } });
  assert.equal(prisma.state.notifications[0].status, "FAILED"); assert.match(prisma.state.notifications[0].lastError, /idempotensi/);
});
test("retry is bounded and provider errors never store secret payloads", async () => {
  const prisma = await fixture(); const base = Date.now() + 100;
  const transport = createResendTransport({ apiKey: "fake", from: "fake", fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({ message: "secret-payload" }) }) });
  for (let i = 0; i < 5; i++) await processNotifications({ prisma, now: () => new Date(base + i * 3600000), transport });
  assert.equal(prisma.state.notifications[0].status, "FAILED"); assert.equal(prisma.state.notifications[0].attempts, 5);
  assert.equal(prisma.state.notifications[0].lastError, "Resend HTTP 503");
});

test("first approval queues an announcement email", async () => {
  const prisma = createStore();
  await enqueueNotification(prisma, { id: 1, name: "Rina", email: "rina@example.test" }, { id: "event-approve", fromStatus: "PENDING", toStatus: "APPROVED" });
  const [job] = prisma.state.notifications;
  assert.equal(job.recipient, "rina@example.test"); assert.match(job.subject, /disetujui/);
  assert.match(job.body, /Halo Rina/); assert.match(job.body, /telah disetujui/);
});
test("approval retains the applicant-visible reason and configured login link", async () => {
  const previous = process.env.APP_URL;
  process.env.APP_URL = "https://movewall-ai.vercel.app/";
  try {
    const prisma = createStore();
    await enqueueNotification(prisma, { id: 1, name: "Rina", email: "rina@example.test" }, { id: "approval-with-note", fromStatus: "PENDING", toStatus: "APPROVED", reason: "Identitas dan klinik telah diperiksa." });
    assert.match(prisma.state.notifications[0].body, /Catatan admin: Identitas dan klinik telah diperiksa\./);
    assert.match(prisma.state.notifications[0].body, /Masuk di: https:\/\/movewall-ai\.vercel\.app\/login\.html/);
  } finally { if (previous === undefined) delete process.env.APP_URL; else process.env.APP_URL = previous; }
});
