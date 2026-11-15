/* Backend contract; kept aligned with ../../registration-validation.js by tests.
 * Both apps deploy independently. Only Therapist profile fields enter data. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MoveWallRegistration = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const labels = {
    name: "Nama lengkap", username: "Username", email: "Email profesional",
    specialization: "Spesialisasi", licenseNumber: "Nomor SIP / lisensi",
    phoneNumber: "Nomor telepon", clinicName: "Klinik / instansi",
  };

  function validateProfile(body) {
    const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
    const errors = {};
    const data = {};
    const required = ["name", "username", "email", "clinicName"];
    for (const [field, label] of Object.entries(labels)) {
      const value = input[field];
      if (value != null && typeof value !== "string") {
        errors[field] = `${label} harus berupa teks.`;
      }
      const normalized = typeof value === "string" ? value.trim() : "";
      if (required.includes(field) && !normalized && !errors[field]) {
        errors[field] = `${label} wajib diisi.`;
      }
      if (normalized.length > 200) errors[field] = `${label} maksimal 200 karakter.`;
      data[field] = normalized || null;
    }
    if (data.email) {
      data.email = data.email.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        errors.email = "Masukkan alamat email yang valid.";
      }
    }
    return { data, errors };
  }

  function validateRegistration(body) {
    const { data, errors } = validateProfile(body);
    const password = body?.password;
    if (typeof password !== "string" || password.length < 10) {
      errors.password = "Kata sandi minimal 10 karakter.";
    } else if (new TextEncoder().encode(password).length > 72) {
      // bcrypt only processes the first 72 bytes; never silently truncate a password.
      errors.password = "Kata sandi maksimal 72 byte. Kurangi panjang atau karakter khusus.";
    }
    data.password = typeof password === "string" ? password : "";
    return {
      data,
      errors,
    };
  }

  return { validateRegistration, validateProfile };
});
