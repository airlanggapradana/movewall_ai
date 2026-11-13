/* Registration keeps the existing login API and session conventions. */
(() => {
  if (sessionStorage.getItem("mw_token")) {
    window.location.replace("./dashboard.html");
    return;
  }
  const cloudBackend = "https://movewall-backend-production.up.railway.app";
  const local = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const origin = sessionStorage.getItem("mw_backend_url") || window.MOVEWALL_BACKEND_URL ||
    (local && sessionStorage.getItem("mw_use_local_backend") !== "false" ? "http://localhost:3001" : cloudBackend);
  const apiBase = `${origin.replace(/\/$/, "")}/api`;
  const form = document.getElementById("regForm");
  const submit = document.getElementById("regSubmitBtn");
  const btnText = document.getElementById("regBtnText");
  const loader = document.getElementById("regBtnLoader");
  const errorBox = document.getElementById("regError");
  const successBox = document.getElementById("regSuccess");
  let submitting = false;

  function clearFieldError(input) {
    input.removeAttribute("aria-invalid");
    const errorId = `${input.id}Error`;
    const describedBy = (input.getAttribute("aria-describedby") || "").split(" ").filter(id => id && id !== errorId);
    if (describedBy.length) input.setAttribute("aria-describedby", describedBy.join(" "));
    else input.removeAttribute("aria-describedby");
    document.getElementById(errorId)?.remove();
  }

  function showError(message, errors = {}) {
    document.getElementById("regErrorText").textContent = message;
    errorBox.classList.remove("hidden");
    successBox.classList.add("hidden");
    let first;
    for (const [field, text] of Object.entries(errors)) {
      const input = form.elements.namedItem(field);
      if (!input) continue;
      clearFieldError(input);
      const error = document.createElement("p");
      error.id = `${input.id}Error`;
      error.className = "reg-field-error";
      error.textContent = text;
      input.closest(".login-field").append(error);
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", [input.getAttribute("aria-describedby"), error.id].filter(Boolean).join(" "));
      const details = input.closest("details");
      if (details) details.open = true;
      first ||= input;
    }
    (first || errorBox).focus();
  }

  function setLoading(loading) {
    submitting = loading;
    submit.disabled = loading;
    form.setAttribute("aria-busy", String(loading));
    btnText.textContent = loading ? "Membuat akun…" : "Buat akun terapis";
    loader.classList.toggle("hidden", !loading);
    submit.querySelector(".login-btn-arrow").classList.toggle("hidden", loading);
  }

  form.addEventListener("input", (event) => {
    if (event.target.matches("input")) clearFieldError(event.target);
  });
  document.querySelectorAll("[data-password-target]").forEach(button => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.passwordTarget);
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-pressed", String(show));
      const label = input.name === "passwordConfirm" ? "konfirmasi kata sandi" : "kata sandi";
      button.setAttribute("aria-label", `${show ? "Sembunyikan" : "Tampilkan"} ${label}`);
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    form.querySelectorAll("input").forEach(clearFieldError);
    errorBox.classList.add("hidden");
    const raw = Object.fromEntries(new FormData(form));
    const { data, inviteCode, errors } = MoveWallRegistration.validateRegistration(raw);
    if (raw.passwordConfirm !== data.password || !raw.passwordConfirm) {
      errors.passwordConfirm = "Konfirmasi kata sandi harus sama dengan kata sandi.";
    }
    if (Object.keys(errors).length) {
      showError("Periksa kembali field yang ditandai sebelum melanjutkan.", errors);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${apiBase}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, inviteCode }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        showError(result.error || "Pendaftaran gagal. Silakan coba lagi.", result.errors);
        setLoading(false);
        return;
      }
      if (!result.therapist?.username) throw new Error("invalid-response");
      document.getElementById("regSuccessText").textContent =
        `Akun ${result.therapist.name || data.name} berhasil dibuat. Silakan masuk menggunakan username dan kata sandi Anda.`;
      successBox.classList.remove("hidden");
      form.classList.add("hidden");
      document.querySelector(".login-link-row").classList.add("hidden");
      document.getElementById("regSuccessLogin").classList.remove("hidden");
      // Never persist credentials or the invitation code in browser storage.
      form.reset();
      successBox.focus();
    } catch (error) {
      showError(error.name === "AbortError"
        ? "Server belum merespons. Coba lagi sebentar atau periksa apakah akun sudah berhasil dibuat dengan masuk."
        : "Tidak dapat menghubungi server pendaftaran. Periksa koneksi Anda lalu coba lagi.");
      setLoading(false);
    } finally {
      clearTimeout(timeout);
    }
  });
})();
