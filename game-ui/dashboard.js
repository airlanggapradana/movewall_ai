/**
 * MoveWall AI — Clinical Tele-Rehabilitation Dashboard
 * Handles therapist auth guard, telemetry analytics, patient history, and PDF clinical reports.
 */

// ─── API Base URL ─────────────────────────────────────────────────────────────
const DEFAULT_CLOUD_BACKEND = "https://movewallai-production.up.railway.app";
const BACKEND_ORIGIN =
  sessionStorage.getItem("mw_backend_url") ||
  window.MOVEWALL_BACKEND_URL ||
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? (sessionStorage.getItem("mw_use_local_backend") === "false" ? DEFAULT_CLOUD_BACKEND : "http://localhost:3001")
    : DEFAULT_CLOUD_BACKEND);

const API_BASE = `${BACKEND_ORIGIN}/api`;


// ── State ─────────────────────────────────────────────────────────────────────
let currentTherapist = null;
let currentToken = null;
let allPatients = [];
let activePatientName = null;
let activeFilter = "all";
let currentPatientHistory = [];

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
    if (res.status === 403) {
      const errData = await res.json().catch(() => ({}));
      if (errData.requiresSubscription) {
        const patientsPaywallOverlay = document.getElementById("patientsPaywallOverlay");
        const patientsContentWrapper = document.getElementById("patientsContentWrapper");
        patientsPaywallOverlay?.classList.remove("hidden");
        patientsContentWrapper?.classList.add("hidden");
        return;
      }
    }
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
    if (res.status === 403) {
      const errData = await res.json().catch(() => ({}));
      if (errData.requiresSubscription) {
        patientListContainer.innerHTML = `<div class="dash-empty-state" style="padding: 24px 12px; font-size: 0.82rem; color: #9a3412;">🔒 Akses direktori pasien terkunci.<br>Selesaikan pembayaran langganan di tab Langganan.</div>`;
        if (patientCountBadge) patientCountBadge.textContent = "Terkunci";
        return;
      }
    }
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
      ? `<span class="dash-p-status-chip pain" title="Ada keluhan rasa nyeri"><span class="chip-shape">▲</span> Keluhan Nyeri</span>`
      : `<span class="dash-p-status-chip free" title="Bebas keluhan rasa nyeri"><span class="chip-shape">●</span> Bebas Nyeri</span>`;

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

    // Show loading skeleton & patient initials avatar
    pName.textContent = name;
    pSessionCount.textContent = "Memuat rincian...";
    pAvatar.textContent = name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

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
    currentPatientHistory = sessions;
    drawTrendChart(document.getElementById("uiTrendCanvas"), sessions, false);

    // Render Session Table
    renderSessionTable(sessions);
  } catch (err) {
    console.error("[Select Patient Error]", err);
  }
}

// ── Biomechanics & Score Timeline Trend Chart (Studio Palette) ───────────────

function drawTrendChart(canvas, sessions, isDark = false) {
  if (!canvas) return;
  if (canvas.parentElement && canvas.parentElement.clientWidth > 50) {
    canvas.width = canvas.parentElement.clientWidth - 16;
  }
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  // Clear background (Studio clean white canvas)
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  if (!sessions || sessions.length === 0) {
    ctx.fillStyle = "#5C6B66";
    ctx.font = '12px "Atkinson Hyperlegible Next", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("Belum ada data sesi untuk digambar pada grafik", w / 2, h / 2);
    return;
  }

  // Padding
  const padLeft = 48;
  const padRight = 36;
  const padTop = 26;
  const padBottom = 34;

  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  // Max score reference
  const scores = sessions.map((s) => s.score || 0);
  const rawMax = Math.max(...scores, 600);
  const maxVal = Math.ceil(rawMax / 400) * 400;

  // Draw Grid Lines & Y-axis labels
  const yTicks = 4;
  ctx.lineWidth = 1;
  ctx.font = '10px "Atkinson Hyperlegible Next", sans-serif';
  ctx.textAlign = "right";

  for (let i = 0; i <= yTicks; i++) {
    const val = Math.round((maxVal / yTicks) * i);
    const y = padTop + chartH - (i / yTicks) * chartH;

    ctx.strokeStyle = "#E3DCCD"; // bone-200
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();

    ctx.fillStyle = "#5C6B66"; // ink-500
    ctx.fillText(val.toString(), padLeft - 8, y + 3);
  }

  // Draw Target Ceiling Guideline (Dashed line in Ember-600)
  const ceilingY = padTop + chartH - (0.85 * chartH);
  ctx.save();
  ctx.strokeStyle = "#C2410C"; // ember-600
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padLeft, ceilingY);
  ctx.lineTo(w - padRight, ceilingY);
  ctx.stroke();
  ctx.fillStyle = "#C2410C";
  ctx.font = '8.5px "Atkinson Hyperlegible Next", sans-serif';
  ctx.textAlign = "right";
  ctx.fillText("Batas Aman / Ceiling", w - padRight - 4, ceilingY - 4);
  ctx.restore();

  // Calculate points
  const pts = sessions.map((s, idx) => {
    const x =
      sessions.length === 1
        ? padLeft + chartW / 2
        : padLeft + (idx / (sessions.length - 1)) * chartW;
    const y = padTop + chartH - ((s.score || 0) / maxVal) * chartH;
    return { x, y, session: s };
  });

  // Area under curve with subtle clinical teal gradient
  if (pts.length > 1) {
    const grad = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
    grad.addColorStop(0, "rgba(23, 89, 79, 0.16)"); // primary-600 soft
    grad.addColorStop(1, "rgba(23, 89, 79, 0.0)");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, padTop + chartH);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, padTop + chartH);
    ctx.closePath();
    ctx.fill();
  }

  // Connecting Line (primary-600: #17594F)
  ctx.strokeStyle = "#17594F";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  pts.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();

  // Draw Dual-Indicator Markers & Labels
  pts.forEach((p, idx) => {
    const s = p.session;
    const hasPain = s.hasPain || (s.painChecklist && Object.values(s.painChecklist).some(Boolean));

    if (hasPain) {
      // Triangle marker for Pain (Status Koreksi: #A82C16)
      ctx.fillStyle = "#A82C16";
      ctx.beginPath();
      const r = 6;
      ctx.moveTo(p.x, p.y - r);
      ctx.lineTo(p.x + r, p.y + r);
      ctx.lineTo(p.x - r, p.y + r);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      // Circle marker for Pain-Free (Status Tercapai: #0B6B4A)
      ctx.fillStyle = "#0B6B4A";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Value tag above point (ink-900: #13211F)
    ctx.fillStyle = "#13211F";
    ctx.font = 'bold 9.5px "Atkinson Hyperlegible Next", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(`${s.score} pt`, p.x, p.y - 9);

    // X-axis label below: Date / Session #
    const dateStr = s.date
      ? new Date(s.date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
      : `S${idx + 1}`;
    ctx.fillStyle = "#34443F"; // ink-700
    ctx.font = '9.5px "Atkinson Hyperlegible Next", sans-serif';
    ctx.fillText(`S${idx + 1} (${dateStr})`, p.x, padTop + chartH + 15);

    // Level tag below date
    ctx.fillStyle = "#17594F"; // primary-600
    ctx.font = '8.5px "Atkinson Hyperlegible Next", sans-serif';
    const timeInfo = s.time && s.time !== "—" ? ` · ${s.time}` : "";
    ctx.fillText(`Lv.${s.level}${timeInfo}`, p.x, padTop + chartH + 26);
  });
}

// ── Pain Matrix Visualization (Biomekanika Sendi Bahu) ───────────────────────

function renderPainMatrix(pm, totalSessions) {
  const movements = [
    {
      label: "Fleksi Bahu (Shoulder Flexion)",
      count: pm.flexionCount,
      iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><polyline points="5 12 12 5 19 12"/></svg>`
    },
    {
      label: "Abduksi Bahu (Shoulder Abduction)",
      count: pm.abductionCount,
      iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>`
    },
    {
      label: "Rotasi Eksternal (External Rotation)",
      count: pm.externalRotationCount,
      iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`
    },
    {
      label: "Rotasi Internal (Internal Rotation)",
      count: pm.internalRotationCount,
      iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`
    },
    {
      label: "Ekstensi Bahu (Shoulder Extension)",
      count: pm.extensionCount,
      iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><polyline points="19 12 12 19 5 12"/></svg>`
    },
  ];

  painMatrixContainer.innerHTML = "";

  movements.forEach((m) => {
    const pct = totalSessions > 0 ? Math.round((m.count / totalSessions) * 100) : 0;
    const row = document.createElement("div");
    row.className = "dash-pain-row";

    let barColor = "var(--status-reach)";
    let badgeClass = "badge-reach";
    let statusLabel = `<span class="chip-shape">●</span> Bebas Nyeri`;

    if (pct > 50) {
      barColor = "var(--status-comp)";
      badgeClass = "badge-comp";
      statusLabel = `<span class="chip-shape">▲</span> Perhatian Tinggi`;
    } else if (pct > 0) {
      barColor = "var(--status-near)";
      badgeClass = "badge-near";
      statusLabel = `<span class="chip-shape">◆</span> Terpantau`;
    }

    row.innerHTML = `
      <div class="dash-pain-label-wrap">
        <span class="dash-pain-icon">${m.iconSvg}</span>
        <span class="dash-pain-label">${m.label}</span>
      </div>
      <div class="dash-pain-bar-wrap">
        <div class="dash-pain-bar-fill" style="width: ${Math.max(pct, 4)}%; background: ${barColor}"></div>
      </div>
      <div class="dash-pain-stat">
        <span class="dash-pain-pill ${badgeClass}">
          ${statusLabel} · ${m.count}/${totalSessions} Sesi (${pct}%)
        </span>
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
          <span class="dash-score-fill-label">Level ${s.level} · ${s.hits}/10 Target Hits</span>
        </div>
      </div>
    `;

    scoreProgressContainer.appendChild(item);
  });
}

// ── Session Table Render (FR-D.4 & FR-D.5) ───────────────────────────────────

function renderSessionTable(sessions) {
  sessionTableBody.innerHTML = "";
  pTableCountBadge.textContent = `${sessions.length} Sesi Terdata`;

  if (sessions.length === 0) {
    sessionTableBody.innerHTML = `<tr><td colspan="9" class="dash-table-empty">Belum ada data sesi untuk pasien ini.</td></tr>`;
    return;
  }

  // Reverse so latest is shown first in the table
  const reversed = [...sessions].reverse();

  reversed.forEach((s) => {
    const tr = document.createElement("tr");

    // Pain checklist badges (Dual Indicator: Triangle shape + Color + Text)
    const painBadges = [];
    if (s.painAbduction) painBadges.push(`<span class="pain-chip"><span class="chip-shape">▲</span> Abduksi</span>`);
    if (s.painFlexion) painBadges.push(`<span class="pain-chip"><span class="chip-shape">▲</span> Fleksi</span>`);
    if (s.painExternalRotation) painBadges.push(`<span class="pain-chip"><span class="chip-shape">▲</span> Rot. Eks</span>`);
    if (s.painInternalRotation) painBadges.push(`<span class="pain-chip"><span class="chip-shape">▲</span> Rot. Int</span>`);
    if (s.painExtension) painBadges.push(`<span class="pain-chip"><span class="chip-shape">▲</span> Ekstensi</span>`);

    const painHtml =
      painBadges.length > 0
        ? `<div class="pain-chips-wrap">${painBadges.join("")}</div>`
        : `<span class="pain-free-pill"><span class="chip-shape">●</span> Bebas Nyeri</span>`;

    const missionBadge =
      s.missionId === 1
        ? `<span class="table-mission-badge m1">M1 Archer</span>`
        : `<span class="table-mission-badge m2">M2 Garden</span>`;

    // FR-D.5: Distinct visual separation of Automated Data vs Therapist Clinical Notes
    const notesCellHtml = s.notes
      ? `<div class="dash-therapist-note">
           <div class="dash-note-meta">
             <span class="dash-note-author">Catatan Terapis</span>
             <span class="dash-note-badge">Klinis</span>
           </div>
           <div class="dash-note-text">"${s.notes}"</div>
         </div>`
      : `<div class="dash-auto-note">
           <span class="dash-auto-tag">Otomatis</span>
           <span class="dash-auto-text">Telemetri sesi tersimpan normal</span>
         </div>`;

    tr.innerHTML = `
      <td><strong>#${s.sessionNumber}</strong></td>
      <td class="cell-nowrap">${formatDateTime(s.date)}</td>
      <td>${missionBadge}</td>
      <td><span class="table-level-pill">Lv. ${s.level}</span></td>
      <td><strong>${s.time || "—"}</strong></td>
      <td><strong>${s.hits}</strong>/10</td>
      <td><strong class="cell-score">${s.score}</strong></td>
      <td>${painHtml}</td>
      <td class="cell-notes">${notesCellHtml}</td>
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

// ─── Subscription & Midtrans Payment Gateway Integration ─────────────────────

let currentSubscription = null;
let paymentHistoryList = [];

// Memuat SDK Midtrans Snap secara dinamis dari endpoint backend /api/subscription/config
async function ensureMidtransSnapLoaded() {
  if (typeof window.snap !== "undefined") return true;
  try {
    const res = await fetch(`${API_BASE}/subscription/config`);
    if (!res.ok) return false;
    const config = await res.json();
    if (!config.snapJsUrl || !config.clientKey) return false;

    return new Promise((resolve) => {
      let script = document.getElementById("midtrans-snap-script");
      if (script) {
        if (typeof window.snap !== "undefined") return resolve(true);
        script.addEventListener("load", () => resolve(true));
        script.addEventListener("error", () => resolve(false));
        return;
      }
      script = document.createElement("script");
      script.id = "midtrans-snap-script";
      script.src = config.snapJsUrl;
      script.setAttribute("data-client-key", config.clientKey);
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  } catch (e) {
    console.warn("[Midtrans Snap Loader]", e);
    return false;
  }
}

function initSubscriptionFeature() {
  ensureMidtransSnapLoaded();
  const viewTabPatients = document.getElementById("viewTabPatients");
  const viewTabSubscription = document.getElementById("viewTabSubscription");
  const patientsViewContainer = document.getElementById("patientsViewContainer");
  const subscriptionViewContainer = document.getElementById("subscriptionViewContainer");
  const dashNavSubBtn = document.getElementById("dashNavSubBtn");
  const btnRefreshHistory = document.getElementById("btnRefreshHistory");
  const btnPaySubscription = document.getElementById("btnPaySubscription");
  const btnSimulateSuccess = document.getElementById("btnSimulateSuccess");
  const btnPaywallBannerPay = document.getElementById("btnPaywallBannerPay");
  const btnUnlockPatientsView = document.getElementById("btnUnlockPatientsView");
  const navLinkM1 = document.getElementById("navLinkMission1");
  const navLinkM2 = document.getElementById("navLinkMission2");

  // Tab navigation switching
  if (viewTabPatients && viewTabSubscription) {
    viewTabPatients.addEventListener("click", () => {
      viewTabPatients.classList.add("active");
      viewTabPatients.setAttribute("aria-selected", "true");
      viewTabSubscription.classList.remove("active");
      viewTabSubscription.setAttribute("aria-selected", "false");
      patientsViewContainer?.classList.remove("hidden");
      subscriptionViewContainer?.classList.add("hidden");
    });

    viewTabSubscription.addEventListener("click", () => {
      viewTabSubscription.classList.add("active");
      viewTabSubscription.setAttribute("aria-selected", "true");
      viewTabPatients.classList.remove("active");
      viewTabPatients.setAttribute("aria-selected", "false");
      patientsViewContainer?.classList.add("hidden");
      subscriptionViewContainer?.classList.remove("hidden");

      // Reload subscription & history when switching tab
      loadSubscriptionStatus();
      loadPaymentHistory();
    });
  }

  // Intersep klik pada nav links Misi 1 & Misi 2 jika akun belum memiliki langganan aktif
  function handleMissionNavClick(e, missionName) {
    if (currentSubscription && !currentSubscription.isActive) {
      e.preventDefault();
      alert(`Akses permainan ${missionName} terkunci karena akun Anda belum memiliki langganan aktif. Silakan lakukan pembayaran langganan untuk membuka akses permainan.`);
      viewTabSubscription?.click();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  if (navLinkM1) {
    navLinkM1.addEventListener("click", (e) => handleMissionNavClick(e, "Misi 1 (Archer)"));
  }
  if (navLinkM2) {
    navLinkM2.addEventListener("click", (e) => handleMissionNavClick(e, "Misi 2 (Garden)"));
  }

  // Tombol aksi paywall banner & overlay
  if (btnPaywallBannerPay) {
    btnPaywallBannerPay.addEventListener("click", () => {
      viewTabSubscription?.click();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (btnUnlockPatientsView) {
    btnUnlockPatientsView.addEventListener("click", () => {
      viewTabSubscription?.click();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (dashNavSubBtn) {
    dashNavSubBtn.addEventListener("click", () => {
      viewTabSubscription?.click();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (btnRefreshHistory) {
    btnRefreshHistory.addEventListener("click", () => {
      loadPaymentHistory(true);
      loadSubscriptionStatus();
    });
  }

  if (btnPaySubscription) {
    btnPaySubscription.addEventListener("click", () => {
      handlePaySubscription();
    });
  }

  if (btnSimulateSuccess) {
    btnSimulateSuccess.addEventListener("click", () => {
      handleSimulatePayment();
    });
  }

  // Check URL query parameter (misal dari game redirect: ?view=subscription)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("view") === "subscription") {
    viewTabSubscription?.click();
  }

  // Initial load of subscription data
  loadSubscriptionStatus();
}

async function loadSubscriptionStatus() {
  const subTabStatusPill = document.getElementById("subTabStatusPill");
  const dashNavSubText = document.getElementById("dashNavSubText");
  const subBannerStatusBadge = document.getElementById("subBannerStatusBadge");
  const subPeriodText = document.getElementById("subPeriodText");
  const subDaysRemainingText = document.getElementById("subDaysRemainingText");
  const subCooldownBox = document.getElementById("subCooldownBox");
  const subCooldownPill = document.getElementById("subCooldownPill");
  const subCooldownDesc = document.getElementById("subCooldownDesc");
  const subCooldownProgressFill = document.getElementById("subCooldownProgressFill");
  const subCooldownStart = document.getElementById("subCooldownStart");
  const subCooldownEnd = document.getElementById("subCooldownEnd");
  const btnPaySubscription = document.getElementById("btnPaySubscription");
  const btnPayText = document.getElementById("btnPayText");
  const btnPayHelper = document.getElementById("btnPayHelper");

  // Elemen Gatekeeper / Paywall
  const dashPaywallGlobalBanner = document.getElementById("dashPaywallGlobalBanner");
  const patientsTabLockBadge = document.getElementById("patientsTabLockBadge");
  const navMission1Lock = document.getElementById("navMission1Lock");
  const navMission2Lock = document.getElementById("navMission2Lock");
  const navLinkM1 = document.getElementById("navLinkMission1");
  const navLinkM2 = document.getElementById("navLinkMission2");
  const patientsPaywallOverlay = document.getElementById("patientsPaywallOverlay");
  const patientsContentWrapper = document.getElementById("patientsContentWrapper");
  const viewTabSubscription = document.getElementById("viewTabSubscription");

  try {
    const res = await fetch(`${API_BASE}/subscription/status`, {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    if (!res.ok) throw new Error("Gagal memuat status langganan");
    const data = await res.json();
    currentSubscription = data;

    // ── Paywall State Management ──
    if (data.isActive) {
      // Akses Terbuka Penuh
      dashPaywallGlobalBanner?.classList.add("hidden");
      patientsTabLockBadge?.classList.add("hidden");
      navMission1Lock?.classList.add("hidden");
      navMission2Lock?.classList.add("hidden");
      navLinkM1?.classList.remove("locked");
      navLinkM2?.classList.remove("locked");
      patientsPaywallOverlay?.classList.add("hidden");
      patientsContentWrapper?.classList.remove("hidden");
    } else {
      // Akses Terkunci (Belum bayar / Expired)
      dashPaywallGlobalBanner?.classList.remove("hidden");
      patientsTabLockBadge?.classList.remove("hidden");
      navMission1Lock?.classList.remove("hidden");
      navMission2Lock?.classList.remove("hidden");
      navLinkM1?.classList.add("locked");
      navLinkM2?.classList.add("locked");
      patientsPaywallOverlay?.classList.remove("hidden");
      patientsContentWrapper?.classList.add("hidden");

      // Auto switch ke tab langganan saat pertama kali dibuka jika belum bayar
      const urlParams = new URLSearchParams(window.location.search);
      if (!sessionStorage.getItem("mw_viewed_sub_tab") && urlParams.get("view") !== "patients") {
        sessionStorage.setItem("mw_viewed_sub_tab", "true");
        viewTabSubscription?.click();
      }
    }

    // 1. Status Pill in Tab & Header Nav
    if (subTabStatusPill && dashNavSubText) {
      if (data.isActive) {
        subTabStatusPill.className = "dash-tab-pill-badge active";
        subTabStatusPill.textContent = `● PRO (${data.daysRemaining} Hari)`;
        dashNavSubText.textContent = `PRO Aktif (${data.daysRemaining} Hari)`;
      } else if (data.status === "EXPIRED") {
        subTabStatusPill.className = "dash-tab-pill-badge inactive";
        subTabStatusPill.textContent = "▲ Kedaluwarsa";
        dashNavSubText.textContent = "Kedaluwarsa";
      } else {
        subTabStatusPill.className = "dash-tab-pill-badge inactive";
        subTabStatusPill.textContent = "○ Belum Berlangganan";
        dashNavSubText.textContent = "Belum Langganan";
      }
    }

    // 2. Banner Badge
    if (subBannerStatusBadge) {
      if (data.isActive) {
        subBannerStatusBadge.className = "dash-sub-badge-indicator active";
        subBannerStatusBadge.textContent = "● Langganan Aktif (PRO 30 Hari)";
      } else if (data.status === "EXPIRED") {
        subBannerStatusBadge.className = "dash-sub-badge-indicator expired";
        subBannerStatusBadge.textContent = "▲ Langganan Kedaluwarsa";
      } else {
        subBannerStatusBadge.className = "dash-sub-badge-indicator inactive";
        subBannerStatusBadge.textContent = "○ Belum Berlangganan";
      }
    }

    // 3. Periode & Sisa Hari
    if (subPeriodText && subDaysRemainingText) {
      if (data.startDate && data.endDate) {
        subPeriodText.textContent = `${formatDate(data.startDate)} s/d ${formatDate(data.endDate)}`;
        subDaysRemainingText.textContent = data.isActive ? `${data.daysRemaining} Hari Tersisa` : "0 Hari (Berakhir)";
      } else {
        subPeriodText.textContent = "Belum Ada Periode Aktif";
        subDaysRemainingText.textContent = "0 Hari";
      }
    }

    // 4. Cooldown Box & Pay Button State
    if (subCooldownBox) {
      if (data.isCooldownActive) {
        subCooldownBox.className = "dash-cooldown-box active";
        if (subCooldownPill) subCooldownPill.textContent = `Cooldown Aktif: Sisa ${data.cooldownRemainingDays} Hari`;
        if (subCooldownDesc) {
          subCooldownDesc.textContent = `Masa cooldown pembayaran aktif selama 30 hari. Pembayaran perpanjangan berikutnya dapat dilakukan setelah masa aktif berakhir pada ${formatDate(data.cooldownUntil)}.`;
        }
        if (subCooldownStart) subCooldownStart.textContent = formatDate(data.startDate);
        if (subCooldownEnd) subCooldownEnd.textContent = formatDate(data.cooldownUntil);

        const daysPassed = Math.max(0, 30 - data.cooldownRemainingDays);
        const percent = Math.max(5, Math.min(100, Math.round((daysPassed / 30) * 100)));
        if (subCooldownProgressFill) subCooldownProgressFill.style.width = `${percent}%`;

        // Cooldown active -> Pay button locked
        if (btnPaySubscription) {
          btnPaySubscription.className = "dash-btn-pay-cta disabled";
          btnPaySubscription.disabled = true;
        }
        if (btnPayText) btnPayText.textContent = "Pembayaran Terkunci (Cooldown 30 Hari Aktif)";
        if (btnPayHelper) btnPayHelper.textContent = "Pembayaran perpanjangan berikutnya akan dibuka otomatis setelah cooldown 30 hari berakhir.";
      } else {
        // Cooldown expired / ready to pay
        subCooldownBox.className = "dash-cooldown-box ready";
        if (subCooldownPill) subCooldownPill.textContent = "Cooldown Selesai / Siap Bayar";
        if (subCooldownDesc) {
          subCooldownDesc.textContent = "Masa cooldown telah selesai. Anda dapat melakukan pembayaran untuk mengaktifkan langganan 30 hari berikutnya.";
        }
        if (subCooldownStart) subCooldownStart.textContent = "-";
        if (subCooldownEnd) subCooldownEnd.textContent = "Sekarang";
        if (subCooldownProgressFill) subCooldownProgressFill.style.width = "100%";

        if (btnPaySubscription) {
          btnPaySubscription.className = "dash-btn-pay-cta ready";
          btnPaySubscription.disabled = false;
        }
        if (btnPayText) btnPayText.textContent = "Bayar Langganan via Midtrans (Rp 300.000)";
        if (btnPayHelper) btnPayHelper.textContent = "Mendukung QRIS, GoPay, Transfer Bank VA, dan Kartu Kredit secara instan.";
      }
    }
  } catch (err) {
    console.error("[Load Subscription Error]", err);
  }
}

async function loadPaymentHistory(showToast = false) {
  const tbody = document.getElementById("paymentHistoryTbody");
  const emptyBox = document.getElementById("paymentHistoryEmpty");
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE}/subscription/history`, {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    if (!res.ok) throw new Error("Gagal memuat riwayat pembayaran");
    const data = await res.json();
    paymentHistoryList = data.payments || [];

    if (paymentHistoryList.length === 0) {
      tbody.innerHTML = "";
      emptyBox?.classList.remove("hidden");
      return;
    }

    emptyBox?.classList.add("hidden");
    tbody.innerHTML = paymentHistoryList
      .map((p) => {
        let statusBadge = "";
        const s = (p.status || "").toLowerCase();
        if (s === "settlement" || s === "success") {
          statusBadge = `<span class="dash-tx-status-badge settlement">● Berhasil</span>`;
        } else if (s === "pending") {
          statusBadge = `<span class="dash-tx-status-badge pending">▲ Menunggu Bayar</span>`;
        } else {
          statusBadge = `<span class="dash-tx-status-badge expire">✕ ${p.status || "Gagal"}</span>`;
        }

        const dateStr = formatDateTime(p.createdAt);
        const amountStr = `Rp ${Number(p.amount).toLocaleString("id-ID")}`;
        const payType = p.paymentType ? p.paymentType.toUpperCase() : "Midtrans";

        let actionBtns = `
          <button class="dash-btn-sync-tx" onclick="syncSpecificPayment('${p.orderId}')" title="Cek status terkini langsung ke Midtrans">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            <span>Cek</span>
          </button>
        `;

        if (s === "pending" && p.snapToken) {
          actionBtns += `
            <button class="dash-btn-resume-pay" onclick="resumeSnapPayment('${p.snapToken}', '${p.orderId}')" title="Lanjutkan pembayaran di popup Midtrans">
              <span>Bayar</span>
            </button>
          `;
        }

        return `
          <tr>
            <td>
              <span class="dash-tx-order-code" title="${p.orderId}">${p.orderId}</span>
            </td>
            <td>${dateStr}</td>
            <td>MoveWall Pro (30 Hari)</td>
            <td><strong>${amountStr}</strong></td>
            <td><span class="dash-midtrans-key-pill">${payType}</span></td>
            <td>${statusBadge}</td>
            <td>
              <div style="display: flex; gap: 6px;">
                ${actionBtns}
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    if (showToast) {
      alert("Riwayat pembayaran berhasil diperbarui!");
    }
  } catch (err) {
    console.error("[Payment History Error]", err);
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #dc2626; padding: 20px;">Gagal memuat riwayat: ${err.message}</td></tr>`;
  }
}

async function handlePaySubscription() {
  const btn = document.getElementById("btnPaySubscription");
  const btnText = document.getElementById("btnPayText");
  const originalText = btnText ? btnText.textContent : "Bayar Langganan";

  try {
    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = "Menghubungi Midtrans...";

    const res = await fetch(`${API_BASE}/subscription/create-transaction`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${currentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || data.error || "Gagal membuat transaksi");
    }

    const { token, orderId } = data;

    if (!token) {
      throw new Error("Token Snap Midtrans tidak ditemukan");
    }

    // Pastikan Midtrans Snap SDK termuat
    if (typeof window.snap === "undefined") {
      await ensureMidtransSnapLoaded();
    }

    // Buka Midtrans Snap Popup
    if (typeof window.snap !== "undefined") {
      window.snap.pay(token, {
        onSuccess: async function (result) {
          console.log("[Midtrans Snap Success]", result);
          await syncSpecificPayment(orderId);
          alert("Pembayaran berhasil! Subscription MoveWall AI Anda aktif selama 30 hari dengan masa cooldown 30 hari.");
          loadSubscriptionStatus();
          loadPaymentHistory();
        },
        onPending: async function (result) {
          console.log("[Midtrans Snap Pending]", result);
          await syncSpecificPayment(orderId);
          alert("Transaksi berhasil dibuat. Silakan selesaikan pembayaran sesuai instruksi.");
          loadSubscriptionStatus();
          loadPaymentHistory();
        },
        onError: function (result) {
          console.error("[Midtrans Snap Error]", result);
          alert("Pembayaran gagal atau dibatalkan.");
          loadPaymentHistory();
        },
        onClose: async function () {
          console.log("[Midtrans Snap Closed]");
          await syncSpecificPayment(orderId);
          loadSubscriptionStatus();
          loadPaymentHistory();
        },
      });
    } else {
      // Fallback redirection jika Snap JS tidak dimuat
      window.open(data.redirect_url, "_blank");
    }
  } catch (err) {
    console.error("[Pay Subscription Error]", err);
    alert(err.message);
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = originalText;
    loadSubscriptionStatus();
  }
}

window.syncSpecificPayment = async function (orderId) {
  try {
    const res = await fetch(`${API_BASE}/subscription/sync/${orderId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal sinkronisasi");

    loadSubscriptionStatus();
    loadPaymentHistory();
    return data;
  } catch (err) {
    console.error("[Sync Error]", err);
    alert("Sinkronisasi gagal: " + err.message);
  }
};

window.resumeSnapPayment = async function (snapToken, orderId) {
  if (typeof window.snap === "undefined") {
    await ensureMidtransSnapLoaded();
  }
  if (typeof window.snap !== "undefined") {
    window.snap.pay(snapToken, {
      onSuccess: async function () {
        await window.syncSpecificPayment(orderId);
      },
      onPending: async function () {
        await window.syncSpecificPayment(orderId);
      },
      onError: function () {
        alert("Pembayaran belum berhasil.");
      },
      onClose: async function () {
        await window.syncSpecificPayment(orderId);
      },
    });
  } else {
    alert("Snap popup tidak tersedia, silakan refresh halaman.");
  }
};

async function handleSimulatePayment() {
  try {
    // 1. Buat transaksi baru dengan force bypass cooldown untuk keperluan testing sandbox
    const createRes = await fetch(`${API_BASE}/subscription/create-transaction`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${currentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ force: true }),
    });

    const createData = await createRes.json();
    if (!createRes.ok) throw new Error(createData.message || createData.error);

    const orderId = createData.orderId;

    // 2. Panggil endpoint simulasi sukses
    const simRes = await fetch(`${API_BASE}/subscription/test-simulate-success/${orderId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${currentToken}` },
    });

    const simData = await simRes.json();
    if (!simRes.ok) throw new Error(simData.error || "Gagal simulasi");

    alert(`Simulasi Sukses! Subscription aktif selama 30 hari. Cooldown berikutnya aktif untuk 30 hari ke depan.`);
    loadSubscriptionStatus();
    loadPaymentHistory();
  } catch (err) {
    console.error("[Simulate Payment Error]", err);
    alert(err.message);
  }
}

// ── Initialize ────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  if (checkAuth()) {
    loadDashboardStats();
    loadPatientsDirectory();
    initSubscriptionFeature();
  }
});

// ── Window Resize: Redraw Chart Responsively ───────────────────────────────────
window.addEventListener("resize", () => {
  const trendCanvas = document.getElementById("uiTrendCanvas");
  if (trendCanvas && currentPatientHistory && currentPatientHistory.length > 0 && patientWorkspace && !patientWorkspace.classList.contains("hidden")) {
    drawTrendChart(trendCanvas, currentPatientHistory, false);
  }
});

