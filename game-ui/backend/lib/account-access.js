const accountSelect = {
  id: true, name: true, username: true, email: true, specialization: true,
  clinicName: true, licenseNumber: true, phoneNumber: true, role: true,
  isActive: true, applicationStatus: true, applicationVersion: true,
  submittedAt: true, reviewedAt: true, createdAt: true,
};

function canAccessClinical(account) {
  return account?.isActive === true && account.role === "THERAPIST" && account.applicationStatus === "APPROVED";
}

function destination(account) {
  if (account?.role === "ADMIN" && account.isActive && account.applicationStatus === "APPROVED") return "admin.html";
  return canAccessClinical(account) ? "dashboard.html" : "application.html";
}

function createAuthentication({ prisma, jwt, secret }) {
  return async function authenticateSession(req, res, next) {
    const match = /^Bearer (\S+)$/i.exec(req.headers.authorization || "");
    if (!match) return res.status(401).json({ error: "Silakan masuk terlebih dahulu." });
    let decoded;
    try { decoded = jwt.verify(match[1], secret, { algorithms: ["HS256"] }); }
    catch { return res.status(401).json({ error: "Sesi berakhir. Silakan masuk kembali." }); }
    if (!Number.isSafeInteger(decoded.id)) return res.status(401).json({ error: "Sesi tidak valid." });
    try {
      // Always re-read access from the database, including for previously issued tokens.
      const account = await prisma.therapist.findUnique({ where: { id: decoded.id }, select: accountSelect });
      if (!account) return res.status(401).json({ error: "Akun tidak ditemukan." });
      req.therapist = account;
      next();
    } catch (err) { next(err); }
  };
}

function requireClinical(req, res, next) {
  if (!canAccessClinical(req.therapist)) return res.status(403).json({
    error: "Akses klinis belum tersedia. Lihat status akun Anda.",
    requiresApproval: true, applicationStatus: req.therapist.applicationStatus,
    redirect: destination(req.therapist),
  });
  next();
}

function requireAdmin(req, res, next) {
  if (req.therapist?.role !== "ADMIN" || !req.therapist.isActive || req.therapist.applicationStatus !== "APPROVED") {
    return res.status(403).json({ error: "Akses administrator diperlukan." });
  }
  next();
}

module.exports = { accountSelect, canAccessClinical, destination, createAuthentication, requireClinical, requireAdmin };
