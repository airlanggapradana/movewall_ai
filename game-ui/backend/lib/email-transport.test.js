const test = require("node:test");
const assert = require("node:assert/strict");
const { emailConfiguration, createEmailJsTransport, createEmailTransport } = require("./email-transport");
const { processNotifications, enqueueNotification } = require("./notifications");
const { createStore } = require("../test-support/application-store");
const config = { serviceId: "service-test", templateId: "template-test", publicKey: "public-test", privateKey: "private-test" };
const job = { recipient: "recipient@example.test", subject: "Disetujui", body: "Alasan admin\nBaris berikutnya", eventId: "decision-test" };
const ok = () => ({ ok: true, status: 200, text: async () => "OK" });
async function fixture() {
  const prisma = createStore();
  await enqueueNotification(prisma, { id: 1, email: job.recipient }, { id: job.eventId, toStatus: "APPROVED" });
  return prisma;
}
test("provider selection requires explicit complete configuration and keeps Resend compatible", () => {
  assert.deepEqual(emailConfiguration({}), { provider: "resend", configured: false });
  assert.equal(emailConfiguration({ RESEND_API_KEY: "test", EMAIL_FROM: "from@example.test" }).configured, true);
  assert.equal(emailConfiguration({ EMAIL_PROVIDER: "emailjs", RESEND_API_KEY: "test", EMAIL_FROM: "from@example.test" }).configured, false);
  const env = { EMAIL_PROVIDER: "emailjs", EMAILJS_SERVICE_ID: config.serviceId, EMAILJS_TEMPLATE_ID: config.templateId, EMAILJS_PUBLIC_KEY: config.publicKey };
  assert.equal(emailConfiguration(env).configured, true);
  assert.equal(createEmailTransport(env).provider, "emailjs");
  assert.throws(() => emailConfiguration({ EMAIL_PROVIDER: "unexpected" }));
  assert.throws(() => createEmailTransport({ EMAIL_PROVIDER: "emailjs" }));
});
test("EmailJS sends an escaped-template contract to the intended recipient and accepts the documented text response", async () => {
  let request;
  const transport = createEmailJsTransport({ ...config, fetchImpl: async (url, options) => { request = { url, ...options }; return ok(); } });
  assert.equal(await transport(job), null);
  assert.equal(transport.supportsIdempotency, false);
  assert.equal(request.url, "https://api.emailjs.com/api/v1.0/email/send");
  assert.deepEqual(JSON.parse(request.body), { service_id: config.serviceId, template_id: config.templateId, user_id: config.publicKey, accessToken: config.privateKey,
    template_params: { to_email: job.recipient, to_name: job.recipient, subject: job.subject, message: job.body, event_id: job.eventId,
      next_step_url: "", sender_name: "Administrator MoveWall", organization_name: "MoveWall AI", reply_to: "" } });
  assert.equal(request.headers["Idempotency-Key"], undefined);
});

test("the acceptance design is used only for approval and receives the applicant name and login link", async () => {
  const requests = [];
  const transport = createEmailJsTransport({ ...config, approvalTemplateId: "template-approval", appUrl: "https://example.test/", replyTo: "support@example.test",
    sleep: async () => {}, fetchImpl: async (_, options) => { requests.push(JSON.parse(options.body)); return ok(); } });
  for (const subject of ["Pengajuan disetujui", "Pengajuan ditolak", "Pengajuan perlu diperbaiki", "Akses akun dipulihkan", "Akun ditangguhkan", "Pengajuan diterima"]) {
    await transport({ ...job, subject: `MoveWall AI: ${subject}`, therapist: { name: "Rina" } });
  }
  assert.deepEqual(requests.map(request => request.template_id), ["template-approval", ...Array(5).fill(config.templateId)]);
  assert.equal(requests[0].template_params.to_name, "Rina");
  assert.equal(requests[0].template_params.next_step_url, "https://example.test/login.html");
  assert.equal(requests[0].template_params.reply_to, "support@example.test");
  assert.equal(requests[0].template_params.message, job.body);
});
test("concurrent EmailJS sends respect the one-request-per-second limit", async () => {
  let time = 1000; const requests = [];
  const transport = createEmailJsTransport({ ...config, now: () => time, sleep: async ms => { time += ms; }, fetchImpl: async () => { requests.push(time); return ok(); } });
  await Promise.all([transport(job), transport(job), transport(job)]);
  assert.deepEqual(requests, [1000, 2100, 3200]);
});
test("ambiguous EmailJS delivery is persisted for inspection and never automatically repeated", async () => {
  for (const fetchImpl of [async () => { throw new Error("sensitive error payload"); }, async () => ({ ok: false, status: 503 }), async () => ({ ok: true, status: 200, text: async () => "unexpected response" })]) {
    const prisma = await fixture(); let sends = 0;
    const transport = createEmailJsTransport({ ...config, fetchImpl: async (...args) => { sends++; return fetchImpl(...args); } });
    await processNotifications({ prisma, transport, now: () => new Date(Date.now() + 100) });
    await processNotifications({ prisma, transport, now: () => new Date(Date.now() + 3600000) });
    assert.equal(prisma.state.notifications[0].status, "UNCERTAIN"); assert.equal(sends, 1);
    assert.doesNotMatch(prisma.state.notifications[0].lastError, /sensitive/);
  }
});
test("expired EmailJS leases and attempted jobs from a different provider are held without sending", async () => {
  for (const previous of [{ status: "SENDING", lockedUntil: new Date(0) }, { status: "PENDING", lastError: "Resend HTTP 503" }]) {
    const prisma = await fixture(); Object.assign(prisma.state.notifications[0], previous, { attempts: 1, firstAttemptAt: new Date() });
    const transport = createEmailJsTransport({ ...config, fetchImpl: async () => { throw new Error("MUST NOT SEND"); } });
    await processNotifications({ prisma, transport, now: () => new Date(Date.now() + 100) });
    assert.equal(prisma.state.notifications[0].status, "UNCERTAIN"); assert.equal(prisma.state.notifications[0].attempts, 1);
  }
});

test("a confirmed Gmail rejection can be retried after configuration is fixed, but a timeout cannot", async () => {
  for (const status of [412, 408]) {
    const prisma = await fixture(); let sends = 0;
    Object.assign(prisma.state.notifications[0], { attempts: 1, firstAttemptAt: new Date(), lastError: `EmailJS HTTP ${status}` });
    const transport = createEmailJsTransport({ ...config, fetchImpl: async () => { sends++; return ok(); } });
    await processNotifications({ prisma, transport, now: () => new Date(Date.now() + 100) });
    assert.equal(sends, status === 412 ? 1 : 0);
    assert.equal(prisma.state.notifications[0].status, status === 412 ? "SENT" : "UNCERTAIN");
  }
});
test("an explicit EmailJS rate-limit rejection retries, while configuration errors remain failed", async () => {
  const prisma = await fixture(); let calls = 0, time = Date.now() + 100;
  const transport = createEmailJsTransport({ ...config, now: () => time, fetchImpl: async () => ++calls === 1 ? { ok: false, status: 429 } : ok() });
  await processNotifications({ prisma, transport, now: () => new Date(time) }); assert.equal(prisma.state.notifications[0].status, "PENDING");
  time += 61000; await processNotifications({ prisma, transport, now: () => new Date(time) });
  assert.equal(prisma.state.notifications[0].status, "SENT"); assert.equal(calls, 2);
  const invalid = await fixture();
  await processNotifications({ prisma: invalid, transport: createEmailJsTransport({ ...config, fetchImpl: async () => ({ ok: false, status: 403 }) }), now: () => new Date(Date.now() + 100) });
  assert.equal(invalid.state.notifications[0].status, "FAILED");
});
