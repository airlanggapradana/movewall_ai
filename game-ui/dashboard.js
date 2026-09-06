/**
 * MoveWall AI — Clinical Tele-Rehabilitation Dashboard
 * Handles therapist auth guard, telemetry analytics, patient history, and PDF clinical reports.
 */

const API_BASE = "http://localhost:3001/api";

// ── State ─────────────────────────────────────────────────────────────────────
let currentTherapist = null;
let currentToken = null;
let allPatients = [];
let activePatientName = null;
let activeFilter = "all";

// ── DOM References ────────────────────────────────────────────────────────────
const therapistNameEl = document.getElementById("dashTherapistName");
const therapistSpecEl = document.getElementById("dashTherapistSpec");
const logoutBtn       = document.getElementById("dashLogoutBtn");

// KPI Els
const kpiTotalPatientsEl  = document.getElementById("kpiTotalPatients");
const kpiTotalSessionsEl  = document.getElementById("kpiTotalSessions");
const kpiMissionBreakdownEl = document.getElementById("kpiMissionBreakdown");
const kpiAvgScoreEl       = document.getElementById("kpiAvgScore");
const kpiAvgHitsEl        = document.getElementById("kpiAvgHits");
const kpiPainRateEl       = document.getElementById("kpiPainRate");
const kpiPainFreeEl       = document.getElementById("kpiPainFree");

// Patient Sidebar Els
const patientListContainer = document.getElementById("patientListContainer");
const patientSearchInput   = document.getElementById("patientSearchInput");
const patientCountBadge    = document.getElementById("dashPatientCountBadge");
const filterBtns           = document.querySelectorAll(".dash-filter-btn");

// Patient Workspace Els
const emptyPrompt          = document.getElementById("emptyPatientPrompt");
const patientWorkspace     = document.getElementById("patientWorkspaceWrapper");
const pAvatar              = document.getElementById("pAvatar");
const pName                = document.getElementById("pName");
const pAgeBadge            = document.getElementById("pAgeBadge");
const pSessionCount        = document.getElementById("pSessionCount");
const pPeriod              = document.getElementById("pPeriod");
const btnDownloadPdf       = document.getElementById("btnDownloadPdf");

const pAvgScore            = document.getElementById("pAvgScore");
const pMaxScore            = document.getElementById("pMaxScore");
const pAvgHits             = document.getElementById("pAvgHits");
const pLatestLevel         = document.getElementById("pLatestLevel");
const pPainRate            = document.getElementById("pPainRate");
const pPainFreeSessions    = document.getElementById("pPainFreeSessions");

const painMatrixContainer  = document.getElementById("painMatrixContainer");
const scoreProgressContainer = document.getElementById("scoreProgressContainer");
const sessionTableBody     = document.getElementById("sessionTableBody");
const pTableCountBadge     = document.getElementById("pTableCountBadge");

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(isoStr) {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(isoStr) {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Auth Verification ─────────────────────────────────────────────────────────

function checkAuth() {
  currentToken = sessionStorage.getItem("mw_token");
  const storedTherapist = sessionStorage.getItem("mw_therapist");

  if (!currentToken) {
    window.location.replace("./login.html");
    return false;
  }

  if (storedTherapist) {
    try {
      currentTherapist = JSON.parse(storedTherapist);
      therapistNameEl.textContent = currentTherapist.name || "Dr. Terapis";
      therapistSpecEl.textContent = currentTherapist.specialization || "Rehabilitasi Medik";
    } catch {
      // ignore
    }
  }

  // Also verify with backend
  fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${currentToken}` },
  })
    .then((res) => {
      if (!res.ok) throw new Error("Unauthorized");
      return res.json();
    })
    .then((data) => {
      currentTherapist = data.therapist;
      sessionStorage.setItem("mw_therapist", JSON.stringify(data.therapist));
      therapistNameEl.textContent = currentTherapist.name || "Dr. Terapis";
      therapistSpecEl.textContent = currentTherapist.specialization || "Rehabilitasi Medik";
    })
    .catch(() => {
      sessionStorage.removeItem("mw_token");
      sessionStorage.removeItem("mw_therapist");
      window.location.replace("./login.html");
    });

  return true;
}

logoutBtn.addEventListener("click", () => {
  sessionStorage.removeItem("mw_token");
  sessionStorage.removeItem("mw_therapist");
  window.location.replace("./login.html");
});

// ── Load Global Dashboard Stats ───────────────────────────────────────────────

async function loadDashboardStats() {
  try {
    const res = await fetch(`${API_BASE}/dashboard/stats`, {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    if (!res.ok) throw new Error("Gagal memuat statistik dashboard");
    const data = await res.json();
    const s = data.summary;

    kpiTotalPatientsEl.textContent = s.totalPatients || 0;
    kpiTotalSessionsEl.textContent = s.totalSessions || 0;
    kpiMissionBreakdownEl.textContent = `M1: ${s.missions.mission1} · M2: ${s.missions.mission2}`;
    kpiAvgScoreEl.textContent = s.avgScore || 0;
    kpiAvgHitsEl.textContent = `Avg Hits: ${s.avgHits}/10`;
    kpiPainRateEl.textContent = `${s.painPrevalencePercent}%`;
    kpiPainFreeEl.textContent = `${s.sessionsPainFree} sesi bebas nyeri`;
  } catch (err) {
    console.error("[Dashboard Stats Error]", err);
  }
}

// ── Load Patients Directory ───────────────────────────────────────────────────

async function loadPatientsDirectory() {
  try {
    patientListContainer.innerHTML = `<div class="dash-loading-state">Memuat data pasien...</div>`;
    const res = await fetch(`${API_BASE}/patients`, {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    if (!res.ok) throw new Error("Gagal memuat daftar pasien");
    const data = await res.json();
    allPatients = data.patients || [];

    patientCountBadge.textContent = `${allPatients.length} Pasien`;
    renderPatientList();

    // Auto-select first patient if none selected
    if (allPatients.length > 0 && !activePatientName) {
      selectPatient(allPatients[0].name);
    }
  } catch (err) {
    console.error("[Patients Directory Error]", err);
    patientListContainer.innerHTML = `<div class="dash-empty-list">Gagal memuat daftar pasien.</div>`;
  }
}

function renderPatientList() {
  const query = (patientSearchInput.value || "").trim().toLowerCase();

  const filtered = allPatients.filter((p) => {
    const matchName = p.name.toLowerCase().includes(query);
    let matchFilter = true;
    if (activeFilter === "pain") {
      matchFilter = p.hasPainHistory || p.latestHasPain;
    } else if (activeFilter === "painfree") {
      matchFilter = !p.hasPainHistory && !p.latestHasPain;
    }
    return matchName && matchFilter;
  });

  if (filtered.length === 0) {
    patientListContainer.innerHTML = `<div class="dash-empty-list">Tidak ada pasien yang sesuai filter.</div>`;
    return;
  }

  patientListContainer.innerHTML = "";
  filtered.forEach((p) => {
    const item = document.createElement("div");
    item.className = `dash-patient-item ${p.name === activePatientName ? "active" : ""}`;
    item.setAttribute("role", "option");
    item.setAttribute("tabindex", "0");

    const initials = p.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
    const statusChip = (p.hasPainHistory || p.latestHasPain)
      ? `<span class="dash-p-status-chip pain" title="Ada keluhan rasa nyeri">⚠️ Nyeri</span>`
      : `<span class="dash-p-status-chip free" title="Bebas keluhan rasa nyeri">✅ Bebas Nyeri</span>`;

    item.innerHTML = `
      <div class="dash-p-item-avatar">${initials}</div>
      <div class="dash-p-item-info">
        <div class="dash-p-item-top">
          <strong class="dash-p-item-name">${p.name}</strong>
          <span class="dash-p-item-age">${p.age} th</span>
        </div>
        <div class="dash-p-item-bottom">
          <span class="dash-p-item-sessions">${p.sessionCount} Sesi · Misi ${p.lastMissionId || 1}</span>
          ${statusChip}
        </div>
      </div>
    `;

    item.addEventListener("click", () => selectPatient(p.name));
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectPatient(p.name);
      }
    });

    patientListContainer.appendChild(item);
  });
}

patientSearchInput.addEventListener("input", () => {
  renderPatientList();
});

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeFilter = btn.dataset.filter;
    // Filtering logic can be combined with search
    renderPatientList();
  });
});

// ── Select and Display Patient Detail ─────────────────────────────────────────

async function selectPatient(name) {
  activePatientName = name;
  renderPatientList(); // update active highlight

  try {
    emptyPrompt.classList.add("hidden");
    patientWorkspace.classList.remove("hidden");

    // Show loading skeleton
    pName.textContent = name;
    pSessionCount.textContent = "Memuat rincian...";

    const res = await fetch(`${API_BASE}/patients/${encodeURIComponent(name)}/summary`, {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    if (!res.ok) throw new Error("Gagal mengambil ringkasan pasien");
    const data = await res.json();
    const p = data.patient;
    const pm = data.painMetrics;
    const sessions = data.sessionHistory || [];

    // Demographics
    pName.textContent = p.name;
    pAgeBadge.textContent = `${p.age} tahun`;
    pSessionCount.textContent = `${p.totalSessions} Sesi Selesai`;
    pPeriod.textContent = `Periode: ${formatDate(p.firstSessionDate)} – ${formatDate(p.lastSessionDate)}`;

    // Quick Stats
    pAvgScore.textContent = p.avgScore;
    pMaxScore.textContent = `Max: ${p.maxScore}`;
    pAvgHits.textContent = `${p.avgHits} / 10`;
    pLatestLevel.textContent = `Level ${p.latestLevel}`;
    pPainRate.textContent = `${p.painRatePercent}%`;
    pPainFreeSessions.textContent = `${p.painFreeSessions} dari ${p.totalSessions} sesi bebas nyeri`;

    // Render Pain Matrix
    renderPainMatrix(pm, p.totalSessions);

    // Render Score Progression Bars
    renderScoreProgress(sessions);
    drawTrendChart(document.getElementById("uiTrendCanvas"), sessions, true);

    // Render Session Table
    renderSessionTable(sessions);
  } catch (err) {
    console.error("[Select Patient Error]", err);
  }
}

// ── Biomechanics & Score Timeline Trend Chart ────────────────────────────────

function drawTrendChart(canvas, sessions, isDark = false) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  // Clear background
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = isDark ? "#0f172a" : "#f8fafc";
  ctx.fillRect(0, 0, w, h);

  if (!sessions || sessions.length === 0) {
    ctx.fillStyle = isDark ? "#64748b" : "#94a3b8";
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Belum ada data sesi untuk digambar pada grafik", w / 2, h / 2);
    return;
  }

  // Padding
  const padLeft = 50;
  const padRight = 40;
  const padTop = 26;
  const padBottom = 34;

  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  // Max score reference
  const scores = sessions.map((s) => s.score || 0);
  const rawMax = Math.max(...scores, 600);
  const maxVal = Math.ceil(rawMax / 400) * 400; // 800, 1200, 1600, etc.

  // Draw Grid Lines & Y-axis labels
  const yTicks = 4;
  ctx.lineWidth = 1;
  ctx.font = "9px Inter, sans-serif";
  ctx.textAlign = "right";

  for (let i = 0; i <= yTicks; i++) {
    const val = Math.round((maxVal / yTicks) * i);
    const y = padTop + chartH - (i / yTicks) * chartH;

    ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0";
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();

    ctx.fillStyle = isDark ? "#64748b" : "#64748b";
    ctx.fillText(val.toString(), padLeft - 8, y + 3);
  }

  // Calculate points
  const pts = sessions.map((s, idx) => {
    const x =
      sessions.length === 1
        ? padLeft + chartW / 2
        : padLeft + (idx / (sessions.length - 1)) * chartW;
    const y = padTop + chartH - ((s.score || 0) / maxVal) * chartH;
    return { x, y, session: s };
  });

  // Area under curve
  if (pts.length > 1) {
    const grad = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
    grad.addColorStop(0, isDark ? "rgba(56, 189, 248, 0.28)" : "rgba(37, 99, 235, 0.2)");
    grad.addColorStop(1, isDark ? "rgba(56, 189, 248, 0.0)" : "rgba(37, 99, 235, 0.0)");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, padTop + chartH);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, padTop + chartH);
    ctx.closePath();
    ctx.fill();
  }

  // Connecting Line
  ctx.strokeStyle = isDark ? "#38bdf8" : "#2563eb";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  pts.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();

  // Draw Dots & Labels
  pts.forEach((p, idx) => {
    const s = p.session;
    const hasPain = s.hasPain || (s.painChecklist && Object.values(s.painChecklist).some(Boolean));

    // Outer circle
    ctx.fillStyle = hasPain ? "#ef4444" : "#10b981";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isDark ? "#0f172a" : "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Value tag above point
    ctx.fillStyle = isDark ? "#ffffff" : "#1e3a8a";
    ctx.font = "bold 9.5px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${s.score} pt`, p.x, p.y - 9);

    // X-axis label below: Date / Session #
    const dateStr = s.date
      ? new Date(s.date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
      : `S${idx + 1}`;
    ctx.fillStyle = isDark ? "#cbd5e1" : "#334155";
    ctx.font = "9.5px Inter, sans-serif";
    ctx.fillText(`S${idx + 1} (${dateStr})`, p.x, padTop + chartH + 15);

    // Time / Level tag below date
    ctx.fillStyle = isDark ? "#38bdf8" : "#2563eb";
    ctx.font = "8.5px Inter, sans-serif";
    const timeInfo = s.time && s.time !== "—" ? ` · ${s.time}` : "";
    ctx.fillText(`Lv.${s.level}${timeInfo}`, p.x, padTop + chartH + 26);
  });
}

// ── Pain Matrix Visualization ─────────────────────────────────────────────────

function renderPainMatrix(pm, totalSessions) {
  const movements = [
    { label: "Fleksi Bahu (Shoulder Flexion)", count: pm.flexionCount, icon: "📐" },
    { label: "Abduksi Bahu (Shoulder Abduction)", count: pm.abductionCount, icon: "🏹" },
    { label: "Rotasi Eksternal (External Rotation)", count: pm.externalRotationCount, icon: "🔄" },
    { label: "Rotasi Internal (Internal Rotation)", count: pm.internalRotationCount, icon: "🔃" },
    { label: "Ekstensi Bahu (Shoulder Extension)", count: pm.extensionCount, icon: "🔙" },
  ];

  painMatrixContainer.innerHTML = "";

  movements.forEach((m) => {
    const pct = totalSessions > 0 ? Math.round((m.count / totalSessions) * 100) : 0;
    const row = document.createElement("div");
    row.className = "dash-pain-row";

    let barColor = "var(--good)";
    let badgeClass = "badge-good";
    if (pct > 50) {
      barColor = "var(--bad)";
      badgeClass = "badge-bad";
    } else if (pct > 0) {
      barColor = "var(--warn)";
      badgeClass = "badge-warn";
    }

    row.innerHTML = `
      <div class="dash-pain-label-wrap">
        <span class="dash-pain-icon">${m.icon}</span>
        <span class="dash-pain-label">${m.label}</span>
      </div>
      <div class="dash-pain-bar-wrap">
        <div class="dash-pain-bar-fill" style="width: ${Math.max(pct, 4)}%; background: ${barColor}"></div>
      </div>
      <div class="dash-pain-stat">
        <span class="dash-pain-pill ${badgeClass}">${m.count}/${totalSessions} Sesi (${pct}%)</span>
      </div>
    `;

    painMatrixContainer.appendChild(row);
  });
}

// ── Score Progress Visualization ─────────────────────────────────────────────

function renderScoreProgress(sessions) {
  scoreProgressContainer.innerHTML = "";

  if (sessions.length === 0) {
    scoreProgressContainer.innerHTML = `<div class="dash-empty-list">Belum ada riwayat sesi.</div>`;
    return;
  }

  const maxScore = Math.max(...sessions.map((s) => s.score), 1000);

  sessions.forEach((s) => {
    const pct = Math.min(Math.round((s.score / maxScore) * 100), 100);
    const item = document.createElement("div");
    item.className = "dash-score-bar-item";

    const mBadge = s.missionId === 1 ? `<span class="m-chip m1">M1 Archer</span>` : `<span class="m-chip m2">M2 Garden</span>`;

    item.innerHTML = `
      <div class="dash-score-bar-header">
        <span class="dash-score-session-idx">Sesi #${s.sessionNumber}</span>
        <span class="dash-score-m-badge">${mBadge}</span>
        <span class="dash-score-date">${formatDate(s.date)}</span>
        <strong class="dash-score-val">${s.score} Poin</strong>
      </div>
      <div class="dash-score-track">
        <div class="dash-score-fill" style="width: ${Math.max(pct, 6)}%">
          <span class="dash-score-fill-label">Level ${s.level} · ${s.hits}/10 Hits</span>
        </div>
      </div>
    `;

    scoreProgressContainer.appendChild(item);
  });
}

// ── Session Table Render ──────────────────────────────────────────────────────

function renderSessionTable(sessions) {
  sessionTableBody.innerHTML = "";
  pTableCountBadge.textContent = `${sessions.length} Sesi Terdata`;

  if (sessions.length === 0) {
    sessionTableBody.innerHTML = `<tr><td colspan="8" class="dash-table-empty">Belum ada data sesi untuk pasien ini.</td></tr>`;
    return;
  }

  // Reverse so latest is shown first in the table
  const reversed = [...sessions].reverse();

  reversed.forEach((s) => {
    const tr = document.createElement("tr");

    // Pain checklist badges
    const painBadges = [];
    if (s.painAbduction) painBadges.push(`<span class="pain-chip">Abduksi</span>`);
    if (s.painFlexion) painBadges.push(`<span class="pain-chip">Fleksi</span>`);
    if (s.painExternalRotation) painBadges.push(`<span class="pain-chip">Rot. Eks</span>`);
    if (s.painInternalRotation) painBadges.push(`<span class="pain-chip">Rot. Int</span>`);
    if (s.painExtension) painBadges.push(`<span class="pain-chip">Ekstensi</span>`);

    const painHtml =
      painBadges.length > 0
        ? `<div class="pain-chips-wrap">${painBadges.join("")}</div>`
        : `<span class="pain-free-pill">✅ Bebas Nyeri</span>`;

    const missionBadge =
      s.missionId === 1
        ? `<span class="table-mission-badge m1">🎯 M1 Archer</span>`
        : `<span class="table-mission-badge m2">🌿 M2 Garden</span>`;

    tr.innerHTML = `
      <td><strong>#${s.sessionNumber}</strong></td>
      <td class="cell-nowrap">${formatDateTime(s.date)}</td>
      <td>${missionBadge}</td>
      <td><span class="table-level-pill">Lv. ${s.level}</span></td>
      <td><strong>${s.time || "—"}</strong></td>
      <td><strong>${s.hits}</strong>/10</td>
      <td><strong class="cell-score">${s.score}</strong></td>
      <td>${painHtml}</td>
      <td class="cell-notes">${s.notes ? `"${s.notes}"` : `<span class="text-muted">—</span>`}</td>
    `;

    sessionTableBody.appendChild(tr);
  });
}

// ── PDF Export Engine & Report Population ─────────────────────────────────────

async function populatePdfReportTemplate(patientName) {
  const res = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientName)}/report`, {
    headers: { Authorization: `Bearer ${currentToken}` },
  });

  if (!res.ok) throw new Error("Gagal mengambil data laporan PDF");
  const { report } = await res.json();

  // Populate PDF Template Identifiers
  document.getElementById("pdfReportId").textContent = report.reportId;
  document.getElementById("pdfGeneratedDate").textContent = formatDateTime(report.generatedAt);
  document.getElementById("pdfPatientName").textContent = report.patient.name;
  document.getElementById("pdfPatientAge").textContent = `${report.patient.age} Tahun`;
  document.getElementById("pdfTotalSessions").textContent = `${report.patient.totalSessions} Sesi`;
  document.getElementById("pdfPeriod").textContent = `${formatDate(report.patient.firstSession)} s.d. ${formatDate(report.patient.lastSession)}`;

  document.getElementById("pdfTherapistName").textContent = report.therapist?.name || currentTherapist?.name || "Dr. Terapis";
  document.getElementById("pdfTherapistLicense").textContent = report.therapist?.licenseNumber || "SIP-2026-001";
  document.getElementById("pdfTherapistSpec").textContent = report.therapist?.specialization || "Rehabilitasi Medik & Fisioterapi";
  document.getElementById("pdfTherapistEmail").textContent = report.therapist?.email || "klinik@movewall.ai";

  // KPI Summary
  const scores = report.sessions.map((s) => s.score);
  const avgSc = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const maxSc = scores.length ? Math.max(...scores) : 0;
  const hits = report.sessions.map((s) => s.hits);
  const avgHt = hits.length ? (hits.reduce((a, b) => a + b, 0) / hits.length).toFixed(1) : 0;
  const painCount = report.sessions.filter((s) => Object.values(s.painChecklist).some(Boolean)).length;
  const painRate = report.sessions.length ? Math.round((painCount / report.sessions.length) * 100) : 0;

  document.getElementById("pdfAvgScore").textContent = avgSc;
  document.getElementById("pdfMaxScore").textContent = maxSc;
  document.getElementById("pdfAvgHits").textContent = `${avgHt} / 10`;
  document.getElementById("pdfPainRate").textContent = `${painRate}%`;

  // Draw Trend Chart by Date/Time on PDF Canvas
  drawTrendChart(document.getElementById("pdfTrendCanvas"), report.sessions, false);

  // Pain Checklist Summary Table in PDF
  const painSummaryTbody = document.getElementById("pdfPainSummaryTbody");
  painSummaryTbody.innerHTML = "";

  const painTypes = [
    { name: "Fleksi Bahu (Elevasi Sagital)", biomech: "Shoulder Flexion (M1 & M2)", key: "flexion" },
    { name: "Abduksi Bahu (Elevasi Koronal)", biomech: "Shoulder Abduction (M1)", key: "abduction" },
    { name: "Rotasi Eksternal Bahu", biomech: "Upper Extremity Reaching (M2)", key: "externalRotation" },
    { name: "Rotasi Internal Bahu", biomech: "Arm Retraction (M1 & M2)", key: "internalRotation" },
    { name: "Ekstensi Bahu", biomech: "Backward Arm Swing (M1)", key: "extension" },
  ];

  painTypes.forEach((pt) => {
    const occurrences = report.sessions.filter((s) => s.painChecklist[pt.key]).length;
    const pct = report.sessions.length ? Math.round((occurrences / report.sessions.length) * 100) : 0;
    let tol = "Optimal (Tanpa Keluhan Nyeri)";
    if (pct > 50) tol = "Terganggu (Nyeri Menetap >50% Sesi)";
    else if (pct > 0) tol = "Cukup Baik (Nyeri Ringan / Intermiten)";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${pt.name}</strong></td>
      <td>${pt.biomech}</td>
      <td>${occurrences} dari ${report.sessions.length} Sesi (${pct}%)</td>
      <td>${tol}</td>
    `;
    painSummaryTbody.appendChild(tr);
  });

  // Detailed Session History Table in PDF
  const pdfSessionTbody = document.getElementById("pdfSessionHistoryTbody");
  pdfSessionTbody.innerHTML = "";

  // Dynamic Clinical Recommendation from Database
  if (report.recommendation) {
    document.getElementById("pdfRecommendationText").textContent = report.recommendation;
  }

  report.sessions.forEach((s) => {
    const tr = document.createElement("tr");
    const pains = [];
    if (s.painChecklist.flexion) pains.push("Fleksi");
    if (s.painChecklist.abduction) pains.push("Abduksi");
    if (s.painChecklist.externalRotation) pains.push("Rot. Eks");
    if (s.painChecklist.internalRotation) pains.push("Rot. Int");
    if (s.painChecklist.extension) pains.push("Ekstensi");

    const painStr = pains.length ? pains.join(", ") : "Bebas Nyeri";

    tr.innerHTML = `
      <td>${s.index}</td>
      <td>${formatDate(s.date)}</td>
      <td><strong>${s.missionTitle}</strong></td>
      <td>Lv. ${s.level}</td>
      <td>${s.time || "—"}</td>
      <td>${s.hits}/10</td>
      <td>${s.score}</td>
      <td>${painStr}</td>
      <td style="font-size: 8pt">${s.notes}</td>
    `;
    pdfSessionTbody.appendChild(tr);
  });

  // Signature Block
  const nowStr = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  document.getElementById("pdfSigDate").textContent = nowStr;
  document.getElementById("pdfSigName").textContent = report.therapist?.name || currentTherapist?.name || "Dr. Terapis";
  document.getElementById("pdfSigLicense").textContent = `SIP: ${report.therapist?.licenseNumber || "SIP-2026-001"}`;

  return report;
}

// ── Button: Direct .PDF Download ──────────────────────────────────────────────

btnDownloadPdf.addEventListener("click", async () => {
  if (!activePatientName) return;

  const originalHtml = btnDownloadPdf.innerHTML;
  btnDownloadPdf.disabled = true;
  btnDownloadPdf.innerHTML = `
    <span class="login-btn-loader"></span>
    <span>Menyiapkan File PDF...</span>
  `;

  try {
    const report = await populatePdfReportTemplate(activePatientName);

    const element = document.getElementById("pdfReportContent");
    const cleanFileName = `${report.patient.name.replace(/\s+/g, "_")}_Laporan_Rehabilitasi_MoveWall.pdf`;

    const opt = {
      margin: [5, 5, 5, 5],
      filename: cleanFileName,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };

    // Use output('blob') to guarantee an explicit application/pdf MIME type and .pdf file extension
    const worker = html2pdf().set(opt).from(element);
    const pdfBlob = await worker.output("blob");

    // Force application/pdf blob download via clean HTML anchor
    const fileBlob = new Blob([pdfBlob], { type: "application/pdf" });
    const downloadUrl = URL.createObjectURL(fileBlob);
    const dlAnchor = document.createElement("a");
    dlAnchor.style.display = "none";
    dlAnchor.href = downloadUrl;
    dlAnchor.download = cleanFileName;
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    document.body.removeChild(dlAnchor);

    setTimeout(() => URL.revokeObjectURL(downloadUrl), 30000);

    btnDownloadPdf.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>File PDF Terunduh!</span>
    `;

    setTimeout(() => {
      btnDownloadPdf.disabled = false;
      btnDownloadPdf.innerHTML = originalHtml;
    }, 2500);

  } catch (err) {
    console.error("[PDF Download Error]", err);
    alert("Gagal mengunduh file PDF: " + err.message);
    btnDownloadPdf.disabled = false;
    btnDownloadPdf.innerHTML = originalHtml;
  }
});

// ── Button: Native Browser Print to PDF ────────────────────────────────────────

const btnPrintPdf = document.getElementById("btnPrintPdf");
if (btnPrintPdf) {
  btnPrintPdf.addEventListener("click", async () => {
    if (!activePatientName) return;

    const originalHtml = btnPrintPdf.innerHTML;
    btnPrintPdf.disabled = true;
    btnPrintPdf.innerHTML = `
      <span class="login-btn-loader"></span>
      <span>Membuka Dokumen...</span>
    `;

    try {
      await populatePdfReportTemplate(activePatientName);

      // Create a clean print window
      const printContents = document.getElementById("pdfReportContent").innerHTML;
      const printWindow = window.open("", "_blank", "width=850,height=900");
      if (!printWindow) {
        throw new Error("Jendela pop-up cetak terblokir oleh peramban. Izinkan pop-up untuk mencetak.");
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>${activePatientName} – Laporan Rehabilitasi MoveWall AI</title>
            <link rel="stylesheet" href="./styles.css">
            <style>
              @page { size: A4; margin: 10mm; }
              body { background: #ffffff !important; color: #1e293b !important; padding: 0 !important; margin: 0 !important; }
              .pdf-report-document { width: 100% !important; padding: 0 !important; }
            </style>
          </head>
          <body>
            <div class="pdf-report-document">${printContents}</div>
            <script>
              window.onload = function() {
                // Copy canvas from opener
                var srcCanvas = window.opener.document.getElementById('pdfTrendCanvas');
                var destCanvas = document.getElementById('pdfTrendCanvas');
                if (srcCanvas && destCanvas) {
                  var destCtx = destCanvas.getContext('2d');
                  destCtx.drawImage(srcCanvas, 0, 0);
                }
                setTimeout(function() {
                  window.print();
                }, 400);
              };
            <\/script>
          </body>
        </html>
      `);
      printWindow.document.close();

      setTimeout(() => {
        btnPrintPdf.disabled = false;
        btnPrintPdf.innerHTML = originalHtml;
      }, 1000);

    } catch (err) {
      console.error("[Print PDF Error]", err);
      alert(err.message);
      btnPrintPdf.disabled = false;
      btnPrintPdf.innerHTML = originalHtml;
    }
  });
}

// ── Initialize ────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  if (checkAuth()) {
    loadDashboardStats();
    loadPatientsDirectory();
  }
});
