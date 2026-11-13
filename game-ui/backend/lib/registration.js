const { validateRegistration } = require("./registration-validation");

function createRegistrationHandler({ prisma, bcrypt, inviteCode, safeEqual }) {
  return async (req, res) => {
    if (!inviteCode) {
      return res.status(403).json({ error: "Registrasi akun ditutup. Hubungi administrator." });
    }
    const result = validateRegistration(req.body);
    if (!result.inviteCode || !safeEqual(result.inviteCode, inviteCode)) {
      return res.status(403).json({
        error: "Kode undangan tidak valid. Periksa kembali atau hubungi administrator.",
        errors: { inviteCode: "Kode undangan tidak valid." },
      });
    }
    if (Object.keys(result.errors).length) {
      return res.status(400).json({
        error: "Periksa kembali data pendaftaran Anda.", errors: result.errors,
      });
    }
    try {
      const therapist = await prisma.therapist.create({
        data: {
          ...result.data,
          password: await bcrypt.hash(result.data.password, 12),
          role: "THERAPIST",
        },
        select: {
          id: true, name: true, username: true, email: true,
          specialization: true, licenseNumber: true, phoneNumber: true,
          role: true, createdAt: true,
        },
      });
      return res.status(201).json({ message: "Akun terapis berhasil dibuat.", therapist });
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
