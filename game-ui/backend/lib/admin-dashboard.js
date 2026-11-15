const STATUSES = ["PENDING", "NEEDS_REVISION", "APPROVED", "REJECTED", "SUSPENDED"];
// Reporting and the month selector use WITA (UTC+08), consistently across hosts.
const REPORT_OFFSET_MS = 8 * 3600000;
function monthRange(value, now = new Date()) {
  const month = value || new Date(now.getTime() + REPORT_OFFSET_MS).toISOString().slice(0, 7);
  if (typeof month !== "string" || !/^(20\d{2})-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Periode harus berupa tahun-bulan yang valid.");
  const [year, number] = month.split("-").map(Number);
  const at = delta => new Date(Date.UTC(year, number - 1 + delta, 1) - REPORT_OFFSET_MS);
  return { month, start: at(0), end: at(1), previous: at(-1) };
}
function applicationFilters(query) {
  if (query.status && !STATUSES.includes(query.status)) throw new Error("Filter status tidak valid.");
  if (query.specialization != null && (typeof query.specialization !== "string" || query.specialization.length > 200)) throw new Error("Filter spesialisasi tidak valid.");
  if (query.q != null && typeof query.q !== "string") throw new Error("Pencarian tidak valid.");
  const search = (query.q || "").trim().slice(0, 100);
  const base = { role: "THERAPIST",
    ...(query.specialization ? { specialization: query.specialization } : {}),
    ...(search ? { OR: ["name", "username", "email", "clinicName"].map(field => ({ [field]: { contains: search, mode: "insensitive" } })) } : {}),
  };
  if (query.month) { const range = monthRange(query.month); base.submittedAt = { gte: range.start, lt: range.end }; }
  return { base, where: { ...base, ...(query.status ? { applicationStatus: query.status } : {}) } };
}
function statusCounts(groups) {
  return Object.fromEntries(STATUSES.map(status => [status, groups.find(group => group.applicationStatus === status)?._count._all || 0]));
}
async function dashboardSummary(prisma, month, now = new Date()) {
  const range = monthRange(month, now);
  const today = new Date(Math.floor((now.getTime() + REPORT_OFFSET_MS) / 86400000) * 86400000 - REPORT_OFFSET_MS);
  const [groups, submittedToday, overdue, licenseReported, approvals, durations, notifications, specializations] = await Promise.all([
    prisma.therapist.groupBy({ by: ["applicationStatus"], where: { role: "THERAPIST" }, _count: { _all: true } }),
    prisma.therapist.count({ where: { role: "THERAPIST", createdAt: { gte: today, lt: new Date(today.getTime() + 86400000) } } }),
    prisma.therapist.count({ where: { role: "THERAPIST", applicationStatus: "PENDING", submittedAt: { lt: new Date(now.getTime() - 48 * 3600000) } } }),
    prisma.therapist.count({ where: { role: "THERAPIST", licenseNumber: { not: null }, NOT: { licenseNumber: "" } } }),
    prisma.$queryRaw`SELECT to_char(d."createdAt" + interval '8 hours', 'YYYY-MM') AS month,
      LEAST(5, (EXTRACT(DAY FROM d."createdAt" + interval '8 hours')::int - 1) / 7 + 1) AS week,
      COUNT(DISTINCT d."therapistId")::int AS count
      FROM application_decisions d JOIN therapists t ON t.id = d."therapistId"
      WHERE t.role = 'THERAPIST' AND d."fromStatus" = 'PENDING' AND d."toStatus" = 'APPROVED'
        AND d."createdAt" >= ${range.previous} AND d."createdAt" < ${range.end}
      GROUP BY month, week`,
    prisma.$queryRaw`SELECT to_char(d."createdAt" + interval '8 hours', 'YYYY-MM') AS month,
      AVG(EXTRACT(EPOCH FROM (d."createdAt" - COALESCE(p."createdAt", t."createdAt"))) / 3600)::float8 AS hours
      FROM application_decisions d JOIN therapists t ON t.id = d."therapistId"
      LEFT JOIN LATERAL (SELECT x."createdAt" FROM application_decisions x
        WHERE x."therapistId" = d."therapistId" AND x."toStatus" = 'PENDING' AND x.version < d.version
        ORDER BY x.version DESC LIMIT 1) p ON true
      WHERE t.role = 'THERAPIST' AND d."fromStatus" = 'PENDING'
        AND d."toStatus" IN ('APPROVED', 'REJECTED', 'NEEDS_REVISION')
        AND d."createdAt" >= ${range.previous} AND d."createdAt" < ${range.end}
        AND d."createdAt" >= COALESCE(p."createdAt", t."createdAt")
      GROUP BY month`,
    prisma.notificationOutbox.groupBy({ by: ["status"], where: { therapist: { role: "THERAPIST" } }, _count: { _all: true } }),
    prisma.therapist.findMany({ where: { role: "THERAPIST", specialization: { not: null }, NOT: { specialization: "" } }, distinct: ["specialization"], select: { specialization: true }, orderBy: { specialization: "asc" } }),
  ]);
  const counts = statusCounts(groups), total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const previousMonth = new Date(range.previous.getTime() + REPORT_OFFSET_MS).toISOString().slice(0, 7);
  const countMonth = value => approvals.filter(row => row.month === value).reduce((sum, row) => sum + row.count, 0);
  return { month: range.month, counts, total, submittedToday, overdue,
    approvedMonthly: countMonth(range.month), previousApprovedMonthly: countMonth(previousMonth),
    approvalWeeks: Array.from({ length: 5 }, (_, index) => ({ week: index + 1, count: approvals.find(row => row.month === range.month && row.week === index + 1)?.count || 0 })),
    verificationHours: durations.find(row => row.month === range.month)?.hours ?? null,
    previousVerificationHours: durations.find(row => row.month === previousMonth)?.hours ?? null,
    license: { reported: licenseReported, total, percentage: total ? Math.round(licenseReported / total * 1000) / 10 : 0 },
    notifications: Object.fromEntries(["PENDING", "SENDING", "SENT", "FAILED", "UNCERTAIN"].map(status => [status, notifications.find(row => row.status === status)?._count._all || 0])),
    specializations: specializations.map(row => row.specialization),
  };
}
module.exports = { monthRange, applicationFilters, statusCounts, dashboardSummary };
