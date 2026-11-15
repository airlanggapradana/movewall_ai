const { validateRegistration } = require("./registration-validation");
const { accountSelect } = require("./account-access");
const { enqueueNotification } = require("./notifications");

function createRegistrationHandler({ prisma, bcrypt }) {
  return async (req, res) => {
    const result = validateRegistration(req.body);
    if (Object.keys(result.errors).length) {
      return res.status(400).json({
        error: "Periksa kembali data pendaftaran Anda.", errors: result.errors,
      });
    }
    try {
      const password = await bcrypt.hash(result.data.password, 12);
      const therapist = await prisma.$transaction(async tx => {
        const account = await tx.therapist.create({
        data: {
          ...result.data,
          password,
          role: "THERAPIST",
          isActive: true,
          applicationStatus: "PENDING",
        },
        select: accountSelect,
        });
        const decision = await tx.applicationDecision.create({ data: {
          therapistId: account.id, actorId: account.id, version: 0, toStatus: "PENDING", reason: "Pengajuan pendaftaran diterima untuk pemeriksaan admin.",
        } });
        await enqueueNotification(tx, account, decision);
        return account;
      });
      return res.status(201).json({ message: "Pengajuan diterima. Silakan masuk untuk melihat status pemeriksaan admin.", therapist });
    } catch (err) {
      // Handle uniqueness at insert time too, including concurrent registrations.
      if (err.code === "P2002") {
        const target = Array.isArray(err.meta?.target)
          ? err.meta.target.join(" ") : String(err.meta?.target || "");
        const field = target.includes("email") ? "email" : target.includes("username") ? "username" : null;
        const error = field === "email" ? "Email sudah digunakan. Gunakan email lain atau masuk ke akun Anda."
          : field === "username" ? "Username sudah digunakan. Pilih username lain."
            : "Username atau email sudah digunakan.";
        return res.status(409).json({ error, ...(field ? { errors: { [field]: error } } : {}) });
      }
      console.error("[Register Error]", err);
      return res.status(500).json({ error: "Pendaftaran belum dapat diproses. Silakan coba lagi." });
    }
  };
}

module.exports = { createRegistrationHandler };
