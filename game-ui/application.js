(async () => {
  const $ = id => document.getElementById(id);
  const names = { PENDING: "Menunggu pemeriksaan", NEEDS_REVISION: "Perlu perbaikan", APPROVED: "Disetujui", REJECTED: "Ditolak", SUSPENDED: "Ditangguhkan" };
  const descriptions = {
    PENDING: "Pengajuan Anda telah diterima dan sedang menunggu pemeriksaan admin. Akses klinis dan pembayaran belum tersedia.",
    NEEDS_REVISION: "Admin meminta perbaikan. Baca alasannya dan lengkapi formulir di bawah.",
    APPROVED: "Akun terapis telah disetujui. Buka dashboard untuk mengelola langganan. Persetujuan tidak mengaktifkan langganan secara otomatis.",
    REJECTED: "Pengajuan belum dapat disetujui. Hubungi admin jika Anda ingin meminta peninjauan ulang.",
    SUSPENDED: "Akses klinis akun Anda ditangguhkan. Data dan riwayat pembayaran tetap tersimpan. Hubungi admin untuk peninjauan.",
  };
  const labels = { name: "Nama", username: "Username", email: "Email", clinicName: "Klinik / instansi", specialization: "Spesialisasi", licenseNumber: "SIP / lisensi", phoneNumber: "Telepon" };
  let application;
  let loading = false;
  $("logout").onclick = MoveWallSession.logout;
  async function load() {
    if (loading) return;
    loading = true; $("refresh").disabled = true;
    try {
      const data = await MoveWallSession.request("/auth/application");
      application = data.application;
      if (MoveWallSession.routeFor(application) === "admin.html") { location.replace("./admin.html"); return; }
      $("application").classList.remove("hidden");
      $("statusBadge").textContent = names[application.applicationStatus] || "Akses dibatasi";
      $("statusTitle").textContent = names[application.applicationStatus] || "Status akun";
      $("statusDescription").textContent = !application.isActive && application.applicationStatus !== "SUSPENDED"
        ? "Akun dinonaktifkan. Hubungi admin untuk pemeriksaan akses." : descriptions[application.applicationStatus];
      $("latestReason").textContent = data.history.at(-1)?.reason || "";
      $("profile").replaceChildren();
      for (const [key, label] of Object.entries(labels)) {
        const dt = document.createElement("dt"), dd = document.createElement("dd");
        dt.textContent = label; dd.textContent = application[key] || "Belum diisi"; $("profile").append(dt, dd);
        $("revisionForm").elements[key].value = application[key] || "";
      }
      $("dashboardLink").classList.toggle("hidden", MoveWallSession.routeFor(application) !== "dashboard.html");
      $("revisionSection").classList.toggle("hidden", application.applicationStatus !== "NEEDS_REVISION" || !application.isActive);
      $("reviewEstimate").textContent = data.reviewEstimate ? `Perkiraan pemeriksaan: ${data.reviewEstimate}` : "";
      $("reviewEstimate").classList.toggle("hidden", !data.reviewEstimate || application.applicationStatus !== "PENDING");
      if (/^(https:\/\/|mailto:)/i.test(data.contactUrl || "")) { $("contactAdmin").href = data.contactUrl; $("contactAdmin").classList.remove("hidden"); }
      $("history").replaceChildren();
      for (const event of data.history) {
        const li = document.createElement("li"), time = document.createElement("time");
        time.dateTime = event.createdAt; time.textContent = new Date(event.createdAt).toLocaleString("id-ID");
        li.textContent = `${names[event.toStatus]}${event.reason ? ` — ${event.reason}` : ""}`; li.append(time); $("history").append(li);
      }
      if (!data.history.length) $("history").textContent = "Belum ada riwayat keputusan. Hubungi admin untuk informasi akun lama.";
      $("message").textContent = "Status berhasil diperbarui. Halaman ini tetap menjadi acuan jika email belum diterima.";
    } catch (err) { $("message").textContent = err.message; }
    finally { loading = false; $("refresh").disabled = false; }
  }
  $("refresh").onclick = load;
  $("revisionForm").onsubmit = async event => {
    event.preventDefault(); if (!application || $("resubmit").disabled) return;
    const { data, errors } = MoveWallRegistration.validateProfile(Object.fromEntries(new FormData(event.target)));
    $("revisionErrors").textContent = Object.values(errors).join("\n");
    if (Object.keys(errors).length) return;
    $("resubmit").disabled = true;
    try {
      await MoveWallSession.request("/auth/application", { method: "PUT", body: JSON.stringify({ ...data, expectedVersion: application.applicationVersion }) });
      await load(); $("statusTitle").scrollIntoView({ behavior: "smooth" });
    } catch (err) { $("revisionErrors").textContent = [err.message, ...Object.values(err.errors || {})].join("\n"); }
    finally { $("resubmit").disabled = false; }
  };
  await load();
})();
