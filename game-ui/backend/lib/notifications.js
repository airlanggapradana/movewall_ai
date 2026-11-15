const { randomUUID } = require("node:crypto");
const titles = {
  PENDING: "Pengajuan diterima", NEEDS_REVISION: "Pengajuan perlu diperbaiki",
  APPROVED: "Pengajuan disetujui", REJECTED: "Pengajuan ditolak", SUSPENDED: "Akun ditangguhkan",
};
const MAX_ATTEMPTS = 5;
// Resend retains idempotency keys for 24h. Never automatically resend an
// ambiguous attempt outside that window, even following a long worker outage.
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

async function enqueueNotification(tx, account, decision) {
  if (!account.email) return; // Migrated legacy accounts may not have email.
  const title = decision.fromStatus === "SUSPENDED" && decision.toStatus === "APPROVED"
    ? "Akses akun dipulihkan" : titles[decision.toStatus];
  const firstApproval = decision.fromStatus === "PENDING" && decision.toStatus === "APPROVED";
  const loginUrl = process.env.APP_URL ? `${process.env.APP_URL.replace(/\/+$/, "")}/login.html` : "";
  const body = firstApproval
    ? `Halo${account.name ? ` ${account.name}` : ""},\n\nKabar baik: pengajuan akun terapis Anda di MoveWall AI telah disetujui oleh administrator.${decision.reason ? `\n\nCatatan admin: ${decision.reason}` : ""}\n\nAnda sekarang dapat masuk dan menggunakan fitur terapis.${loginUrl ? `\n\nMasuk di: ${loginUrl}` : ""}\n\nPersetujuan akun tidak mengaktifkan langganan. Status terbaru tersedia di halaman status akun MoveWall AI.`
    : `${title}.\n\n${decision.reason || "Silakan masuk untuk melihat status pengajuan Anda."}\n\nPersetujuan akun tidak mengaktifkan langganan. Status terbaru tersedia di halaman status akun MoveWall AI.`;
  await tx.notificationOutbox.create({ data: {
    eventId: decision.id, therapistId: account.id, recipient: account.email,
    subject: `MoveWall AI: ${title}`, body,
  } });
}

function createResendTransport({ apiKey, from, fetchImpl = fetch }) {
  return async job => {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `application/${job.eventId}` },
      body: JSON.stringify({ from, to: [job.recipient], subject: job.subject, text: job.body }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload.id !== "string") {
      // Do not persist provider payloads that might contain credentials or PII.
      const error = new Error(`Resend HTTP ${response.status}`);
      error.permanent = response.status >= 400 && response.status < 500 && ![409, 429].includes(response.status);
      throw error;
    }
    return payload.id;
  };
}

async function processNotifications({ prisma, transport, now = () => new Date(), batchSize = 10 }) {
  const queryTime = now();
  const jobs = await prisma.notificationOutbox.findMany({
    where: { OR: [
      { status: "PENDING", nextAttemptAt: { lte: queryTime } },
      { status: "SENDING", lockedUntil: { lte: queryTime } },
    ] }, orderBy: { createdAt: "asc" }, take: batchSize,
  });
  for (const job of jobs) {
    const time = now();
    const lockToken = randomUUID();
    const claim = await prisma.notificationOutbox.updateMany({
      where: { id: job.id, status: job.status, attempts: job.attempts,
        ...(job.status === "SENDING" ? { lockedUntil: { lte: time } } : {}) },
      data: { status: "SENDING", lockToken, lockedUntil: new Date(time.getTime() + 60000),
        firstAttemptAt: job.firstAttemptAt || time, attempts: { increment: 1 } },
    });
    if (!claim.count) continue;
    const where = { id: job.id, lockToken };
    if ((job.firstAttemptAt && time - job.firstAttemptAt >= RETRY_WINDOW_MS) || job.attempts >= MAX_ATTEMPTS) {
      await prisma.notificationOutbox.updateMany({ where, data: {
        status: "FAILED", lastError: "Batas retry/idempotensi tercapai; periksa pengiriman di Resend sebelum tindakan lanjutan.",
        lockToken: null, lockedUntil: null,
      } });
      continue;
    }
    try {
      const providerId = await transport(job);
      await prisma.notificationOutbox.updateMany({ where, data: {
        status: "SENT", providerId, sentAt: now(), lastError: null, lockedUntil: null, lockToken: null,
      } });
    } catch (error) {
      await prisma.notificationOutbox.updateMany({ where, data: {
        status: error.permanent || job.attempts + 1 >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
        lastError: /^Resend HTTP \d+$/.test(error.message) ? error.message : "Pengiriman gagal atau respons tidak diterima.",
        nextAttemptAt: new Date(time.getTime() + Math.pow(2, job.attempts) * 60000),
        lockedUntil: null, lockToken: null,
      } });
    }
  }
}

module.exports = { enqueueNotification, createResendTransport, processNotifications, RETRY_WINDOW_MS, MAX_ATTEMPTS };
