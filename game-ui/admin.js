(async () => {
  const $ = id => document.getElementById(id);
  const names = { PENDING: "Menunggu pemeriksaan", NEEDS_REVISION: "Perlu revisi", APPROVED: "Disetujui", REJECTED: "Ditolak", SUSPENDED: "Ditangguhkan" };
  const mailNames = { PENDING: "Menunggu pengiriman", SENDING: "Sedang dikirim", SENT: "Diterima Resend", FAILED: "Pengiriman gagal" };
  const actions = { PENDING: [["REJECT", "Tolak Pengajuan", "button-reject"], ["REQUEST_REVISION", "Minta Revisi", "button-soft"], ["APPROVE", "Setujui & Terbitkan Akses", "button-approve"]], APPROVED: [["SUSPEND", "Tangguhkan Akun", "button-reject"]], SUSPENDED: [["RESTORE", "Pulihkan Akses", "button-approve"]], REJECTED: [["REOPEN", "Buka Pemeriksaan Ulang", "button-indigo"]], NEEDS_REVISION: [] };
  const targetStatus = { APPROVE: "APPROVED", REQUEST_REVISION: "NEEDS_REVISION", REJECT: "REJECTED", SUSPEND: "SUSPENDED", RESTORE: "APPROVED", REOPEN: "PENDING" };
  const profileLabels = { name: "Nama lengkap", username: "Username", email: "Email", clinicName: "Klinik / instansi", specialization: "Spesialisasi", licenseNumber: "SIP / lisensi", phoneNumber: "Telepon", submittedAt: "Diajukan", reviewedAt: "Diperiksa" };
  let selected, admin, summary, page = 1, listSequence = 0, detailSequence = 0, summarySequence = 0, dialogSequence = 0, deciding = false;
  const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
  const number = value => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value);
  const date = value => value ? new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Makassar", dateStyle: "medium", timeStyle: "short" }) + " WITA" : "Belum diperiksa";
  const initials = name => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  const ref = account => `TRP-${new Date(account.createdAt).getFullYear()}-${String(account.id).padStart(3, "0")}`;
  function tell(message, error = false) { $("message").textContent = message; $("message").classList.toggle("is-error", error); }
  function tabCounts(counts) {
    $("statusTabs").replaceChildren();
    const tabs = [["", "Semua"], ["PENDING", "Menunggu"], ["NEEDS_REVISION", "Perlu Revisi"], ["APPROVED", "Disetujui"], ["REJECTED", "Ditolak"], ["SUSPENDED", "Ditangguhkan"]];
    for (const [status, label] of tabs) {
      const button = element("button", "", label); button.type = "button"; button.dataset.status = status;
      button.setAttribute("aria-pressed", String($("status").value === status));
      const count = status ? counts[status] : Object.values(counts).reduce((sum, value) => sum + value, 0);
      button.append(element("b", "", number(count || 0))); button.onclick = () => { if (deciding) return; $("status").value = status; page = 1; void list(true); };
      $("statusTabs").append(button);
    }
  }
  function highlight() {
    for (const button of $("applications").querySelectorAll("button")) {
      const active = Number(button.dataset.id) === selected?.id;
      button.setAttribute("aria-current", String(active)); button.querySelector(".queue-marker").textContent = active ? "Review Aktif" : "Lihat berkas";
    }
  }
  function clearDetail() { selected = null; detailSequence++; $("detail").classList.add("hidden"); $("historyCard").classList.add("hidden"); $("emptyDetail").classList.remove("hidden"); }
  function renderDecisionState() {
    $("statusBadge").textContent = names[selected.applicationStatus]; $("statusBadge").dataset.status = selected.applicationStatus;
    $("decisionForm").reset(); $("decisionError").textContent = ""; $("decisionActions").replaceChildren();
    const available = actions[selected.applicationStatus] || [];
    for (const [action, label, style] of available) { const button = element("button", `button ${style}`, label); button.type = "submit"; button.dataset.action = action; button.disabled = deciding; $("decisionActions").append(button); }
    $("decisionForm").classList.toggle("hidden", !available.length); $("noDecision").classList.toggle("hidden", available.length > 0);
  }
  async function list(resetSelection = false) {
    const sequence = ++listSequence;
    if (resetSelection) clearDetail();
    $("applications").setAttribute("aria-busy", "true"); $("previous").disabled = true; $("next").disabled = true;
    const query = new URLSearchParams(new FormData($("filters"))); query.set("page", page);
    $("filterCount").textContent = [...new FormData($("filters")).values()].filter(value => String(value).trim()).length;
    try {
      const data = await MoveWallSession.request(`/admin/applications?${query}`);
      if (sequence !== listSequence) return;
      $("applications").replaceChildren(); tabCounts(data.counts);
      $("listCount").textContent = `${number(data.total)} berkas`;
      $("paginationLabel").textContent = `Halaman ${data.page} dari ${Math.max(1, Math.ceil(data.total / data.pageSize))}`;
      $("previous").disabled = page <= 1; $("next").disabled = page * data.pageSize >= data.total;
      for (const account of data.applications) {
        const li = element("li"), button = element("button", "queue-item"); button.type = "button"; button.dataset.id = account.id;
        const avatar = element("span", "avatar queue-avatar", initials(account.name)), copy = element("span", "queue-copy"), meta = element("span", "queue-meta");
        copy.append(element("strong", "", account.name), element("span", "clinic", account.clinicName || "Klinik belum diisi"), element("span", "queue-status", names[account.applicationStatus]));
        meta.append(element("span", "queue-marker", "Lihat berkas"), element("small", "", ref(account)));
        button.append(avatar, copy, meta); button.title = `Diajukan ${date(account.submittedAt)}`;
        button.onclick = () => { if (!deciding) void detail(account.id).catch(err => tell(err.message, true)); }; li.append(button); $("applications").append(li);
      }
      highlight();
      if (!data.applications.length) $("applications").append(element("li", "inline-note", "Tidak ada pengajuan yang sesuai dengan filter ini."));
      else if (!selected) await detail(data.applications[0].id);
    } catch (err) { if (sequence === listSequence) tell(err.message, true); }
    finally { if (sequence === listSequence) $("applications").removeAttribute("aria-busy"); }
  }
  async function loadSummary() {
    const sequence = ++summarySequence;
    const data = await MoveWallSession.request(`/admin/dashboard?${new URLSearchParams({ month: $("month").value })}`);
    if (sequence !== summarySequence) return;
    summary = data;
    $("pendingPill").textContent = `${number(data.counts.PENDING)} Menunggu`;
    $("metricPending").textContent = number(data.counts.PENDING); $("metricToday").textContent = `+${number(data.submittedToday)} pendaftar baru hari ini`;
    $("metricOverdue").replaceChildren(element("span", "yellow-dot"), document.createTextNode(`${number(data.overdue)} berkas menunggu lebih dari 48 jam`));
    $("metricApproved").textContent = number(data.approvedMonthly);
    $("approvalTitle").textContent = $("month").value ? "Disetujui pada Periode" : "Disetujui Bulan Ini";
    $("metricApprovalChange").textContent = data.previousApprovedMonthly ? `${number((data.approvedMonthly - data.previousApprovedMonthly) / data.previousApprovedMonthly * 100)}% dari bulan sebelumnya` : "Belum ada persetujuan bulan sebelumnya";
    $("metricPeriod").textContent = new Date(`${data.month}-15T12:00:00+08:00`).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Makassar" });
    $("approvalChart").replaceChildren();
    const max = Math.max(1, ...data.approvalWeeks.map(week => week.count));
    for (const week of data.approvalWeeks) { const bar = element("span"); bar.style.height = `${Math.max(3, week.count / max * 44)}px`; bar.title = `Minggu ${week.week}: ${week.count} persetujuan`; $("approvalChart").append(bar); }
    $("approvalChart").setAttribute("aria-label", data.approvalWeeks.map(week => `Minggu ${week.week}: ${week.count}`).join(", "));
    const hours = data.verificationHours;
    $("metricDuration").textContent = hours == null ? "—" : number(hours >= 24 ? hours / 24 : hours);
    $("durationUnit").textContent = hours != null && hours >= 24 ? "Hari" : "Jam";
    const previous = data.previousVerificationHours;
    $("metricDurationChange").textContent = hours == null ? "Belum ada keputusan pada periode ini" : previous == null ? "Rata-rata hingga keputusan pertama" : `${number(Math.abs(hours - previous))} jam ${hours <= previous ? "lebih cepat" : "lebih lama"} dari bulan sebelumnya`;
    $("metricLicense").textContent = `${number(data.license.percentage)}%`;
    $("licenseReported").textContent = `${number(data.license.reported)} diisi`; $("licenseMissing").textContent = `${number(data.license.total - data.license.reported)} belum`;
    $("notificationDot").classList.toggle("hidden", !data.notifications.FAILED);
    const current = $("specialization").value;
    $("specialization").replaceChildren(new Option("Semua spesialisasi terapis", ""));
    for (const specialization of data.specializations) $("specialization").add(new Option(specialization, specialization));
    $("specialization").value = current;
  }
  function retryButton(job, after) {
    if (job.status !== "FAILED" || job.attempts >= 5 || (job.firstAttemptAt && Date.now() - new Date(job.firstAttemptAt) >= 23 * 3600000)) return null;
    const button = element("button", "button button-soft", "Coba kirim ulang"); button.type = "button";
    button.onclick = async () => { button.disabled = true; try { await MoveWallSession.request(`/admin/notifications/${job.id}/retry`, { method: "POST" }); await after(); void loadSummary().catch(err => tell(err.message, true)); tell("Email masuk antrean kembali."); } catch (err) { tell(err.message, true); button.disabled = false; } };
    return button;
  }
  async function detail(id) {
    const sequence = ++detailSequence;
    const data = await MoveWallSession.request(`/admin/applications/${id}`);
    if (sequence !== detailSequence) return;
    selected = data.application; highlight();
    $("emptyDetail").classList.add("hidden"); $("detail").classList.remove("hidden"); $("historyCard").classList.remove("hidden");
    renderDecisionState();
    $("applicationRef").textContent = `# ${ref(selected)}`; $("clinicName").textContent = selected.clinicName || "Belum diisi";
    $("detailTitle").textContent = selected.name; $("applicantAvatar").textContent = initials(selected.name);
    $("applicantSpecialization").textContent = `Spesialisasi: ${selected.specialization || "Belum diisi"}`;
    $("applicantEmail").textContent = selected.email || "Email belum diisi"; $("applicantPhone").textContent = selected.phoneNumber || "Telepon belum diisi";
    $("credentialIdentity").textContent = selected.name; $("credentialLicense").textContent = selected.licenseNumber || "Belum dicantumkan"; $("credentialProfession").textContent = selected.specialization || "Belum dicantumkan";
    $("history").replaceChildren();
    for (const event of data.history) {
      const li = element("li"), time = element("time", "", date(event.createdAt)); time.dateTime = event.createdAt;
      li.append(element("strong", "", `${names[event.toStatus]} · ${event.actor?.name || "Pengelola"}`), document.createTextNode(event.reason || "Tanpa alasan tambahan"), time); $("history").append(li);
    }
    if (!data.history.length) $("history").append(element("li", "", "Akun lama; belum ada riwayat pemeriksaan tercatat."));
    $("emailConfig").textContent = data.emailConfigured ? "Notifikasi tersimpan dalam antrean email. Diterima provider belum berarti masuk ke inbox." : "Pengiriman email belum diaktifkan. Pendaftar tetap dapat melihat keputusan di halaman status.";
    $("notifications").replaceChildren();
    for (const job of data.notifications) {
      const li = element("li", "", `${job.subject}\n${mailNames[job.status]} · ${job.attempts} percobaan${job.lastError ? `\n${job.lastError}` : ""}`);
      const retry = retryButton(job, () => detail(id)); if (retry) li.append(element("br"), retry); $("notifications").append(li);
    }
    if (!data.notifications.length) $("notifications").append(element("li", "inline-note", "Belum ada kejadian email untuk akun ini."));
  }
  $("decisionForm").onsubmit = async event => {
    event.preventDefault(); if (!selected || deciding) return;
    const action = event.submitter?.dataset.action;
    if (!(actions[selected.applicationStatus] || []).some(item => item[0] === action)) return;
    $("reason").required = action !== "APPROVE";
    const checklistRequired = ["APPROVE", "RESTORE"].includes(action);
    for (const input of $("reviewChecklist").querySelectorAll("input")) input.required = checklistRequired;
    if (!event.target.reportValidity()) return;
    const id = selected.id, expectedVersion = selected.applicationVersion, form = new FormData(event.target);
    let saved = false;
    deciding = true; $("decisionError").textContent = "";
    for (const button of $("decisionActions").querySelectorAll("button")) button.disabled = true;
    try {
      const result = await MoveWallSession.request(`/admin/applications/${id}/decision`, { method: "POST", body: JSON.stringify({ action, reason: form.get("reason"), expectedVersion, checklist: { identity: form.has("identity"), clinic: form.has("clinic"), profession: form.has("profession") } }) });
      saved = true; selected = result.application; renderDecisionState();
      await detail(id); await Promise.all([list(), loadSummary()]); tell("Keputusan tersimpan. Pendaftar dapat melihat status dan alasan terbaru.");
    } catch (err) {
      if (saved) {
        tell("Keputusan tersimpan. Pembaruan tampilan belum selesai; klik Perbarui data untuk memuat riwayat terbaru.");
      } else if (err.code === "NETWORK_ERROR" || [502, 503, 504].includes(err.status)) {
        // Never resend a decision automatically: the first request may have committed.
        let current = false;
        try { await detail(id); current = true; } catch { /* Keep the last known state until refresh succeeds. */ }
        if (current && selected.applicationVersion === expectedVersion + 1 && selected.applicationStatus === targetStatus[action]) {
          tell(`Status terbaru pengajuan: ${names[selected.applicationStatus]}. Respons keputusan sempat terputus; status sudah diperiksa kembali.`);
          await Promise.allSettled([list(), loadSummary()]);
        } else {
          const message = current && selected.applicationVersion === expectedVersion
            ? "Belum ada perubahan status. Periksa koneksi, lalu coba kembali jika diperlukan."
            : "Hasil keputusan belum dapat dipastikan. Klik Perbarui data sebelum mengambil keputusan lagi.";
          $("decisionError").textContent = message; tell(message, true);
        }
      } else { if (err.status === 409) await detail(id).catch(() => {}); $("decisionError").textContent = err.message; tell(err.message, true); }
    }
    finally { deciding = false; for (const button of $("decisionActions").querySelectorAll("button")) button.disabled = false; }
  };
  const dialog = $("adminDialog");
  function openDialog(title) { dialogSequence++; $("dialogTitle").textContent = title; $("dialogBody").replaceChildren(); if (!dialog.open) dialog.showModal(); return dialogSequence; }
  $("closeDialog").onclick = () => dialog.close(); dialog.addEventListener("close", () => dialogSequence++);
  function showFields(fields, account) { const dl = element("dl"); for (const [key, label] of Object.entries(fields)) { dl.append(element("dt", "", label), element("dd", "", key.endsWith("At") ? date(account[key]) : account[key] || "Belum diisi")); } $("dialogBody").append(dl); }
  $("profileButton").onclick = () => { if (!selected) return; openDialog("Profil pengajuan"); showFields(profileLabels, selected); };
  $("inviteButton").onclick = () => {
    openDialog("Undang Terapis Baru");
    const link = new URL("./register.html", location.href).href;
    $("dialogBody").append(element("p", "", "Bagikan tautan pendaftaran berikut kepada terapis. Setiap pengajuan tetap melalui pemeriksaan admin."));
    const label = element("label", "", "Tautan pendaftaran"), input = element("input"); input.value = link; input.readOnly = true; input.id = "registrationLink"; label.htmlFor = input.id;
    const copy = element("button", "button button-indigo", "Salin Tautan"), notice = element("p", "inline-note"); notice.setAttribute("role", "status");
    copy.onclick = async () => { try { await navigator.clipboard.writeText(link); notice.textContent = "Tautan berhasil disalin."; } catch { input.focus(); input.select(); notice.textContent = "Tekan Ctrl+C atau salin tautan yang dipilih."; } };
    const mail = element("a", "button button-white", "Buka Draf Email"); mail.href = `mailto:?subject=${encodeURIComponent("Pendaftaran terapis MoveWall AI")}&body=${encodeURIComponent(`Silakan ajukan pendaftaran terapis melalui ${link}\nPengajuan akan diperiksa oleh admin sebelum akses diberikan.`)}`;
    const buttons = element("div", "dialog-actions"); buttons.append(copy, mail); $("dialogBody").append(label, input, buttons, notice);
  };
  $("settingsButton").onclick = () => {
    openDialog("Informasi sistem");
    if (!summary) { $("dialogBody").append(element("p", "", "Data belum tersedia. Perbarui halaman untuk mencoba kembali.")); return; }
    showFields({ email: "Notifikasi email", contact: "Kontak bantuan", estimate: "Estimasi pemeriksaan", timezone: "Periode pelaporan" }, { email: summary.emailConfigured ? "Terkonfigurasi" : "Belum diaktifkan", contact: summary.contactUrl || "Belum ditetapkan", estimate: summary.reviewEstimate || "Belum ditetapkan", timezone: "WITA (UTC+08)" });
    $("dialogBody").append(element("p", "inline-note", "Informasi layanan ditetapkan oleh pengelola. Persetujuan akun tidak otomatis mengaktifkan langganan."));
  };
  async function inspectFromDialog(id) { dialog.close(); await detail(id); $("detail").scrollIntoView({ behavior: "smooth", block: "start" }); $("detail").focus({ preventScroll: true }); }
  async function feed(kind, feedPage = 1, status = "FAILED") {
    const sequence = openDialog(kind === "activity" ? "Riwayat keputusan" : "Notifikasi email");
    $("dialogBody").append(element("p", "inline-note", "Memuat…"));
    try {
      const data = await MoveWallSession.request(`/admin/${kind}?${new URLSearchParams({ page: feedPage, status })}`);
      if (sequence !== dialogSequence || !dialog.open) return;
      $("dialogBody").replaceChildren();
      if (kind === "notifications") {
        const label = element("label", "", "Status pengiriman"), select = element("select"); select.id = "mailStatus"; label.htmlFor = select.id;
        for (const [value, name] of Object.entries(mailNames)) select.add(new Option(name, value)); select.value = status; select.onchange = () => void feed(kind, 1, select.value);
        $("dialogBody").append(label, select, element("p", "inline-note", data.emailConfigured ? "Status pengiriman email dari antrean." : "Email belum diaktifkan; status akun tetap tersedia bagi pendaftar."));
      }
      const ul = element("ul", "event-list");
      for (const row of data.events || data.notifications) {
        const li = element("li"); li.append(element("strong", "", row.therapist.name), element("div", "", kind === "activity" ? `${names[row.fromStatus] || "Pendaftaran"} → ${names[row.toStatus]} · ${row.actor.name}\n${row.reason || "Tanpa alasan tambahan"}` : `${row.subject}\n${mailNames[row.status]} · ${row.attempts} percobaan${row.lastError ? `\n${row.lastError}` : ""}`), element("time", "", date(row.createdAt)));
        const buttons = element("div", "dialog-actions"), view = element("button", "button button-white", "Lihat Pengajuan"); view.onclick = () => void inspectFromDialog(row.therapistId).catch(err => tell(err.message, true)); buttons.append(view);
        if (kind === "notifications") { const retry = retryButton(row, () => feed(kind, feedPage, status)); if (retry) buttons.append(retry); }
        li.append(buttons); ul.append(li);
      }
      if (!ul.children.length) ul.append(element("li", "inline-note", "Belum ada data untuk pilihan ini."));
      const pagination = element("div", "pagination"), previous = element("button", "button button-soft", "Sebelumnya"), next = element("button", "button button-soft", "Berikutnya");
      previous.disabled = feedPage <= 1; next.disabled = feedPage * data.pageSize >= data.total;
      previous.onclick = () => void feed(kind, feedPage - 1, status); next.onclick = () => void feed(kind, feedPage + 1, status);
      pagination.append(previous, element("span", "", `Halaman ${feedPage} · ${data.total} kejadian`), next); $("dialogBody").append(ul, pagination);
    } catch (err) { if (sequence === dialogSequence) $("dialogBody").replaceChildren(element("p", "inline-error", err.message)); }
  }
  $("auditButton").onclick = () => void feed("activity");
  $("notificationsButton").onclick = () => void feed("notifications", 1, summary?.notifications.FAILED ? "FAILED" : "PENDING");
  async function refresh(reset = false) { if (deciding) return; await Promise.all([list(reset), loadSummary().catch(err => tell(err.message, true))]); }
  $("filters").onsubmit = event => { event.preventDefault(); if (!deciding) { page = 1; void refresh(true); } };
  for (const id of ["status", "specialization", "month"]) $(id).onchange = () => { if (!deciding) { page = 1; void refresh(true); } };
  $("previous").onclick = () => { if (!deciding && page > 1) { page--; void list(true); } };
  $("next").onclick = () => { if (!deciding) { page++; void list(true); } };
  $("refresh").onclick = async () => { $("refresh").disabled = true; try { if (selected && !deciding) await detail(selected.id); await refresh(); } finally { $("refresh").disabled = false; } };
  $("resetView").onclick = () => { if (deciding) return; $("filters").reset(); $("status").value = ""; page = 1; void refresh(true); };
  $("focusFilters").onclick = () => { $("filters").scrollIntoView({ behavior: "smooth", block: "center" }); $("search").focus({ preventScroll: true }); };
  $("logout").onclick = MoveWallSession.logout;
  try {
    admin = await MoveWallSession.verify();
    if (MoveWallSession.routeFor(admin) !== "admin.html") { location.replace(`./${MoveWallSession.routeFor(admin)}`); return; }
    $("adminName").textContent = admin.name; $("adminAvatar").textContent = initials(admin.name); $("reviewerName").textContent = admin.name;
    $("adminContent").classList.remove("hidden"); tell("Pilih pengajuan untuk memulai pemeriksaan."); await refresh();
  } catch (err) { tell(err.message, true); }
})();
