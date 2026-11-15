const express = require("express");
const { accountSelect, requireAdmin } = require("./account-access");
const { validateProfile } = require("./registration-validation");
const { enqueueNotification, RETRY_WINDOW_MS, MAX_ATTEMPTS } = require("./notifications");
const { rateLimit } = require("./rate-limit");
const { applicationFilters, statusCounts, dashboardSummary } = require("./admin-dashboard");
const transitions = {
  APPROVE: { from: ["PENDING"], to: "APPROVED", checklist: true },
  REQUEST_REVISION: { from: ["PENDING"], to: "NEEDS_REVISION", reason: true },
  REJECT: { from: ["PENDING"], to: "REJECTED", reason: true },
  SUSPEND: { from: ["APPROVED"], to: "SUSPENDED", reason: true },
  RESTORE: { from: ["SUSPENDED"], to: "APPROVED", reason: true, checklist: true },
  REOPEN: { from: ["REJECTED"], to: "PENDING", reason: true },
};
class ApplicationError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
const conflict = () => new ApplicationError(409, "Pengajuan telah berubah. Muat ulang sebelum melanjutkan.");
const wrap = handler => async (req, res, next) => {
  try { await handler(req, res); } catch (err) {
    if (err.code === "P2034") return res.status(409).json({ error: "Pengajuan berubah. Muat ulang dan coba lagi." });
    if (err.code === "P2002") return res.status(409).json({ error: "Username atau email sudah digunakan." });
    if (err instanceof ApplicationError) return res.status(err.status).json({ error: err.message, ...err.extra });
    next(err);
  }
};
async function history(tx, id) {
  return tx.applicationDecision.findMany({ where: { therapistId: id }, orderBy: { version: "asc" },
    select: { id: true, fromStatus: true, toStatus: true, reason: true, createdAt: true,
      actor: { select: { name: true, role: true } } } });
}
function versionOf(body) {
  if (!Number.isSafeInteger(body?.expectedVersion) || body.expectedVersion < 0) {
    throw new ApplicationError(400, "Versi pengajuan wajib disertakan. Muat ulang halaman.");
  }
  return body.expectedVersion;
}

async function decideApplication({ prisma, actor, id, body }) {
  if (actor.role !== "ADMIN" || !actor.isActive || actor.applicationStatus !== "APPROVED") throw new ApplicationError(403, "Akses administrator diperlukan.");
  if (actor.id === id) throw new ApplicationError(403, "Admin tidak dapat meninjau akunnya sendiri.");
  const transition = Object.hasOwn(transitions, body?.action) ? transitions[body.action] : null;
  if (!transition) throw new ApplicationError(400, "Keputusan tidak valid.");
  const expectedVersion = versionOf(body);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length > 2000 || (transition.reason && !reason)) throw new ApplicationError(400, "Alasan wajib diisi, maksimal 2000 karakter.");
  const checklist = body.checklist;
  if (transition.checklist && !["identity", "clinic", "profession"].every(key => checklist?.[key] === true)) {
    throw new ApplicationError(400, "Periksa identitas, klinik, dan informasi profesi terlebih dahulu.");
  }
  return prisma.$transaction(async tx => {
    const account = await tx.therapist.findUnique({ where: { id }, select: accountSelect });
    if (!account || account.role !== "THERAPIST") throw new ApplicationError(404, "Pengajuan tidak ditemukan.");
    if (!transition.from.includes(account.applicationStatus) || account.applicationVersion !== expectedVersion) throw conflict();
    const updated = await tx.therapist.updateMany({
      where: { id, applicationStatus: account.applicationStatus, applicationVersion: expectedVersion },
      data: { applicationStatus: transition.to, applicationVersion: { increment: 1 }, reviewedAt: new Date(), reviewedById: actor.id,
        ...(body.action === "SUSPEND" ? { isActive: false } : {}),
        ...(body.action === "RESTORE" ? { isActive: true } : {}) },
    });
    if (!updated.count) throw conflict();
    const decision = await tx.applicationDecision.create({ data: {
      therapistId: id, actorId: actor.id, version: expectedVersion + 1, fromStatus: account.applicationStatus, toStatus: transition.to,
      reason: reason || null,
      ...(transition.checklist ? { checklist: { identity: true, clinic: true, profession: true } } : {}),
    } });
    await enqueueNotification(tx, account, decision);
    return tx.therapist.findUnique({ where: { id }, select: accountSelect });
  });
}

async function resubmitApplication({ prisma, id, body }) {
  const expectedVersion = versionOf(body);
  const { data, errors } = validateProfile(body);
  if (Object.keys(errors).length) throw new ApplicationError(400, "Periksa kembali data pengajuan.", { errors });
  return prisma.$transaction(async tx => {
    const account = await tx.therapist.findUnique({ where: { id }, select: accountSelect });
    if (!account || account.role !== "THERAPIST" || !account.isActive || account.applicationStatus !== "NEEDS_REVISION") {
      throw new ApplicationError(403, "Perbaikan hanya tersedia pada pengajuan yang perlu diperbaiki.");
    }
    const updated = await tx.therapist.updateMany({
      where: { id, applicationStatus: "NEEDS_REVISION", applicationVersion: expectedVersion },
      data: { ...data, applicationStatus: "PENDING", applicationVersion: { increment: 1 }, submittedAt: new Date(), reviewedAt: null, reviewedById: null },
    });
    if (!updated.count) throw conflict();
    const decision = await tx.applicationDecision.create({ data: {
      therapistId: id, actorId: id, version: expectedVersion + 1, fromStatus: "NEEDS_REVISION", toStatus: "PENDING", reason: "Pengajuan diperbaiki dan dikirim ulang.",
    } });
    await enqueueNotification(tx, { ...account, ...data }, decision);
    return tx.therapist.findUnique({ where: { id }, select: accountSelect });
  });
}

function createApplicationRouter({ prisma, authenticateSession, contactUrl = "", reviewEstimate = "", emailConfigured = false }) {
  const router = express.Router();
  router.use(["/auth/application", "/admin"], authenticateSession);
  router.use(["/auth/application", "/admin"], (req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  router.get("/auth/application", wrap(async (req, res) => {
    res.json({ application: req.therapist, history: await history(prisma, req.therapist.id), contactUrl, reviewEstimate });
  }));
  router.put("/auth/application", rateLimit({ limit: 5, windowMs: 15 * 60000, key: req => req.therapist.id }), wrap(async (req, res) => {
    const application = await resubmitApplication({ prisma, id: req.therapist.id, body: req.body });
    res.json({ application, message: "Perbaikan terkirim untuk pemeriksaan admin." });
  }));
  router.use("/admin", requireAdmin);
  router.get("/admin/dashboard", wrap(async (req, res) => {
    let summary;
    try { summary = await dashboardSummary(prisma, req.query.month); }
    catch (err) { if (err.message.startsWith("Periode harus")) throw new ApplicationError(400, err.message); throw err; }
    res.json({ ...summary, emailConfigured, contactUrl, reviewEstimate });
  }));
  router.get("/admin/activity", wrap(async (req, res) => {
    const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
    const where = { therapist: { role: "THERAPIST" } };
    const [events, total] = await Promise.all([
      prisma.applicationDecision.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, skip: (page - 1) * 20,
        select: { id: true, therapistId: true, fromStatus: true, toStatus: true, reason: true, createdAt: true,
          actor: { select: { name: true } }, therapist: { select: { name: true } } } }),
      prisma.applicationDecision.count({ where }),
    ]);
    res.json({ events, total, page, pageSize: 20 });
  }));
  router.get("/admin/notifications", wrap(async (req, res) => {
    const status = req.query.status || "FAILED";
    if (!["PENDING", "SENDING", "SENT", "FAILED"].includes(status)) throw new ApplicationError(400, "Status pengiriman tidak valid.");
    const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
    const where = { status, therapist: { role: "THERAPIST" } };
    const [notifications, total] = await Promise.all([
      prisma.notificationOutbox.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, skip: (page - 1) * 20,
        select: { id: true, therapistId: true, subject: true, status: true, attempts: true, lastError: true, firstAttemptAt: true, createdAt: true,
          therapist: { select: { name: true } } } }),
      prisma.notificationOutbox.count({ where }),
    ]);
    res.json({ notifications, total, page, pageSize: 20, emailConfigured });
  }));
  router.get("/admin/applications", wrap(async (req, res) => {
    let filters;
    try { filters = applicationFilters(req.query); } catch (err) { throw new ApplicationError(400, err.message); }
    const { where, base } = filters;
    const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
    const [applications, total, groups] = await Promise.all([
      prisma.therapist.findMany({ where, select: accountSelect, orderBy: [{ submittedAt: "desc" }, { id: "desc" }], take: 25, skip: (page - 1) * 25 }),
      prisma.therapist.count({ where }),
      prisma.therapist.groupBy({ by: ["applicationStatus"], where: base, _count: { _all: true } }),
    ]);
    res.json({ applications, total, page, pageSize: 25, counts: statusCounts(groups), emailConfigured });
  }));
  router.get("/admin/applications/:id", wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new ApplicationError(400, "ID tidak valid.");
    const application = await prisma.therapist.findUnique({ where: { id }, select: accountSelect });
    if (!application || application.role !== "THERAPIST") throw new ApplicationError(404, "Pengajuan tidak ditemukan.");
    const notifications = await prisma.notificationOutbox.findMany({ where: { therapistId: id }, orderBy: { createdAt: "desc" }, take: 30,
      select: { id: true, status: true, subject: true, attempts: true, lastError: true, createdAt: true, firstAttemptAt: true } });
    res.json({ application, history: await history(prisma, id), notifications, emailConfigured });
  }));
  router.post("/admin/applications/:id/decision", wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new ApplicationError(400, "ID tidak valid.");
    res.json({ application: await decideApplication({ prisma, actor: req.therapist, id, body: req.body }) });
  }));
  router.post("/admin/notifications/:id/retry", wrap(async (req, res) => {
    const job = await prisma.notificationOutbox.findUnique({ where: { id: req.params.id } });
    if (!job) throw new ApplicationError(404, "Notifikasi tidak ditemukan.");
    if (job.status !== "FAILED" || job.attempts >= MAX_ATTEMPTS || (job.firstAttemptAt && Date.now() - job.firstAttemptAt >= RETRY_WINDOW_MS)) {
      throw new ApplicationError(409, "Pengiriman tidak dapat diulang: periksa status provider dan batas idempotensi.");
    }
    const updated = await prisma.notificationOutbox.updateMany({ where: { id: job.id, status: "FAILED", attempts: job.attempts },
      data: { status: "PENDING", nextAttemptAt: new Date() } });
    if (!updated.count) throw conflict();
    res.json({ message: "Notifikasi masuk antrean kembali." });
  }));
  return router;
}
module.exports = { createApplicationRouter, decideApplication, resubmitApplication, transitions, ApplicationError };
