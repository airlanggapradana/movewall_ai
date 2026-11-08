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
let activePatientRef = null;
let activePatientPrescription = null;
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
const pMedRecord           = document.getElementById("pMedRecord");
const pAgeBadge            = document.getElementById("pAgeBadge");
const pConsentBadge        = document.getElementById("pConsentBadge");
const pSessionCount        = document.getElementById("pSessionCount");
const pPeriod              = document.getElementById("pPeriod");
const btnDownloadPdf       = document.getElementById("btnDownloadPdf");

const pAvgScore            = document.getElementById("pAvgScore");
const pMaxScore            = document.getElementById("pMaxScore");
const pAvgHits             = document.getElementById("pAvgHits");
const pBestRom             = document.getElementById("pBestRom");
const pAvgAccuracy         = document.getElementById("pAvgAccuracy");
const pLatestLevel         = document.getElementById("pLatestLevel");
const pPainRate            = document.getElementById("pPainRate");
const pPainFreeSessions    = document.getElementById("pPainFreeSessions");

const painMatrixContainer  = document.getElementById("painMatrixContainer");
const painNordicSummaryContainer = document.getElementById("painNordicSummaryContainer");
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
          <span class="dash-p-item-sessions">${p.medicalRecordNo ? `<code style="font-size:0.7rem;color:#0284c7;font-weight:700">${p.medicalRecordNo}</code> · ` : ""}${p.sessionCount} Sesi · Misi ${p.lastMissionId || 1}</span>
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
    if (pMedRecord) pMedRecord.textContent = p.medicalRecordNo || "—";
    if (pConsentBadge) {
      const hasConsent = p.consent?.given;
      pConsentBadge.textContent = hasConsent ? "✓ PDP Aktif" : "PDP Belum Ada";
      pConsentBadge.className = `dash-badge-consent ${hasConsent ? "active" : "pending"}`;
    }
    pAgeBadge.textContent = `${p.age} tahun`;
    pSessionCount.textContent = `${p.totalSessions} Sesi Selesai`;
    pPeriod.textContent = `Periode: ${formatDate(p.firstSessionDate)} – ${formatDate(p.lastSessionDate)}`;

    // Quick Stats
    pAvgScore.textContent = p.avgScore;
    pMaxScore.textContent = `Max: ${p.maxScore}`;
    pAvgHits.textContent = `${p.avgHits} / 10`;
    if (pBestRom) pBestRom.textContent = p.bestMaxRomDeg ? `${p.bestMaxRomDeg}°` : "—°";
    if (pAvgAccuracy) pAvgAccuracy.textContent = p.avgAccuracyPercent !== null ? `${p.avgAccuracyPercent}%` : "—%";
    pLatestLevel.textContent = `Level ${p.latestLevel}`;
    pPainRate.textContent = `${p.painRatePercent}%`;
    pPainFreeSessions.textContent = `${p.painFreeSessions} dari ${p.totalSessions} sesi bebas nyeri`;

    // Resep Latihan & Batas Aman (Fitur 1)
    activePatientRef = p.medicalRecordNo || p.name;
    activePatientPrescription = p.prescription || {
      initialTargetRom: 45.0,
      maxSafetyCeiling: 135.0,
      minFunctionalRom: 30.0,
      adaptiveEnabled: true,
    };
    updatePrescriptionUI(activePatientPrescription);

    // Update Quick Play Links
    const btnPlayM1 = document.getElementById("btnPlayMission1");
    const btnPlayM2 = document.getElementById("btnPlayMission2");
    if (btnPlayM1) btnPlayM1.href = `./index.html?patient=${encodeURIComponent(p.medicalRecordNo || p.name)}`;
    if (btnPlayM2) btnPlayM2.href = `./mission2.html?patient=${encodeURIComponent(p.medicalRecordNo || p.name)}`;

    // Render Pain Matrix
    renderPainMatrix(pm, p.totalSessions);

    // Render Score Progression Bars
    renderScoreProgress(sessions);
    currentPatientHistory = sessions;
    drawTrendChart(document.getElementById("uiTrendCanvas"), sessions, false);

    // Fitur 7 (Draf Ringkasan Klinis AI SOAP) & Fitur 5 (Mode Latihan Mandiri di Rumah)
    const latestSession = sessions[sessions.length - 1] || null;
    updateAiSummaryUI(latestSession);
    updateHomeSessionUI(p);

    // Render Session Table
    renderSessionTable(sessions);
  } catch (err) {
    console.error("[Select Patient Error]", err);
  }
}

// ── Biomechanics & Score Timeline Trend Chart (Design System v2.0) ───────────

function drawTrendChart(canvas, sessions, isDark = false) {
  if (!canvas) return;
  if (canvas.parentElement && canvas.parentElement.clientWidth > 50) {
    canvas.width = canvas.parentElement.clientWidth - 16;
  }
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  // Auto detect dark theme if not explicitly forced
  const isDarkTheme = isDark || document.documentElement.getAttribute("data-theme") === "dark";

  // v2.0 Semantic Tokens
  const colBg       = isDarkTheme ? "#121B2C" : "#FFFFFF"; // surface
  const colGrid     = isDarkTheme ? "#1F2A3F" : "#E2E8F0"; // border-subtle
  const colTextMute = isDarkTheme ? "#8B9BB2" : "#64748B"; // text-500
  const colTextBody = isDarkTheme ? "#CBD5E1" : "#334155"; // text-700
  const colTextHead = isDarkTheme ? "#F1F5F9" : "#0F172A"; // text-900
  const colS1       = isDarkTheme ? "#2DD4BF" : "#0F766E"; // chart-1 (S1)
  const colFill18   = isDarkTheme ? "rgba(45, 212, 191, 0.18)" : "rgba(15, 118, 110, 0.18)";
  const colFill0    = isDarkTheme ? "rgba(45, 212, 191, 0.0)"  : "rgba(15, 118, 110, 0.0)";
  const colCeiling  = isDarkTheme ? "#FB923C" : "#EA580C"; // ember-400 / ember-500
  const colReach    = isDarkTheme ? "#4FD6A5" : "#0B6B4A"; // status-reach
  const colComp     = isDarkTheme ? "#FF7A5C" : "#9F1239"; // status-comp (v2.0 crimson #9F1239)

  // Clear background
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = colBg;
  ctx.fillRect(0, 0, w, h);

  if (!sessions || sessions.length === 0) {
    ctx.fillStyle = colTextMute;
    ctx.font = '12px "Inter", sans-serif';
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
  ctx.font = '10px "Inter", sans-serif';
  ctx.textAlign = "right";

  for (let i = 0; i <= yTicks; i++) {
    const val = Math.round((maxVal / yTicks) * i);
    const y = padTop + chartH - (i / yTicks) * chartH;

    ctx.strokeStyle = colGrid;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();

    ctx.fillStyle = colTextMute;
    ctx.fillText(val.toString(), padLeft - 8, y + 3);
  }

  // Draw Target Ceiling Guideline (Dashed line in Ember) - Batas Aman Personal (Fitur 1)
  const ceilingDeg = activePatientPrescription ? activePatientPrescription.maxSafetyCeiling : 135;
  const ceilingRatio = Math.min(0.95, Math.max(0.25, (ceilingDeg / 180) * 0.9));
  const ceilingY = padTop + chartH - (ceilingRatio * chartH);
  ctx.save();
  ctx.strokeStyle = colCeiling;
  ctx.lineWidth = 1.3;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padLeft, ceilingY);
  ctx.lineTo(w - padRight, ceilingY);
  ctx.stroke();
  ctx.fillStyle = colCeiling;
  ctx.font = '8.5px "Inter", sans-serif';
  ctx.textAlign = "right";
  ctx.fillText(`Batas Aman: ${Math.round(ceilingDeg)}°`, w - padRight - 4, ceilingY - 4);
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

  // Area under curve: S1 area fill 18% memudar ke 0% opasitas (v2.0 spesifikasi)
  if (pts.length > 1) {
    const grad = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
    grad.addColorStop(0, colFill18);
    grad.addColorStop(1, colFill0);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, padTop + chartH);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, padTop + chartH);
    ctx.closePath();
    ctx.fill();
  }

  // Connecting Line (S1 Teal)
  ctx.strokeStyle = colS1;
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
      // Triangle marker for Pain/Kompensasi (Status Koreksi: crimson #9F1239 / dark #FF7A5C)
      ctx.fillStyle = colComp;
      ctx.beginPath();
      const r = 6;
      ctx.moveTo(p.x, p.y - r);
      ctx.lineTo(p.x + r, p.y + r);
      ctx.lineTo(p.x - r, p.y + r);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = isDarkTheme ? "#121B2C" : "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      // Circle marker for Pain-Free (Status Tercapai: #0B6B4A / dark #4FD6A5)
      ctx.fillStyle = colReach;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isDarkTheme ? "#121B2C" : "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Value tag above point: Skor + ROM Maksimum + Skala Nyeri (NRS)
    ctx.fillStyle = colTextHead;
    ctx.font = 'bold 9px "Inter", sans-serif';
    ctx.textAlign = "center";
    const romSnippet = s.maxRomDeg ? ` · ${s.maxRomDeg}°` : "";
    const painSnippet = hasPain && s.maxPainScore ? ` (NRS ${s.maxPainScore})` : "";
    ctx.fillText(`${s.score}pt${romSnippet}${painSnippet}`, p.x, p.y - 9);

    // X-axis label below: Date / Session #
    const dateStr = s.date
      ? new Date(s.date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
      : `S${idx + 1}`;
    ctx.fillStyle = colTextBody;
    ctx.font = '9.5px "Inter", sans-serif';
    ctx.fillText(`S${idx + 1} (${dateStr})`, p.x, padTop + chartH + 15);

    // Level tag below date
    ctx.fillStyle = colS1;
    ctx.font = '8.5px "Inter", sans-serif';
    const timeInfo = s.time && s.time !== "—" ? ` · ${s.time}` : "";
    ctx.fillText(`Lv.${s.level}${timeInfo}`, p.x, padTop + chartH + 26);
  });
}

// ── Pain Matrix Visualization (Biomekanika Sendi Bahu) ───────────────────────

function renderPainMatrix(pm, totalSessions) {
  const avgScores = pm.averageScores || {};
  const movements = [
    {
      label: "Fleksi Bahu (Shoulder Flexion)",
      count: pm.flexionCount,
      avgScore: avgScores.flexion,
      iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><polyline points="5 12 12 5 19 12"/></svg>`
    },
    {
      label: "Abduksi Bahu (Shoulder Abduction)",
      count: pm.abductionCount,
      avgScore: avgScores.abduction,
      iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>`
    },
    {
      label: "Rotasi Eksternal (External Rotation)",
      count: pm.externalRotationCount,
      avgScore: avgScores.externalRotation,
      iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`
    },
    {
      label: "Rotasi Internal (Internal Rotation)",
      count: pm.internalRotationCount,
      avgScore: avgScores.internalRotation,
      iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`
    },
    {
      label: "Ekstensi Bahu (Shoulder Extension)",
      count: pm.extensionCount,
      avgScore: avgScores.extension,
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

    const avgScoreSnippet =
      m.avgScore !== null && m.avgScore !== undefined && m.avgScore > 0
        ? ` · Skor NRS: <strong>${m.avgScore}/10</strong>`
        : "";

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
          ${statusLabel} · ${m.count}/${totalSessions} Sesi (${pct}%)${avgScoreSnippet}
        </span>
      </div>
    `;

    painMatrixContainer.appendChild(row);
  });

  // Render Nordic Body Map Region Summary (Fitur 2)
  if (painNordicSummaryContainer) {
    painNordicSummaryContainer.innerHTML = "";
    const regionCounts = pm.regionCounts || {};
    const regionEntries = Object.entries(regionCounts);

    const regionNames = {
      R_ANTERIOR: "Bahu Depan (Kanan)",
      R_LATERAL: "Sisi Deltoid (Kanan)",
      R_UPPER_ARM: "Lengan Atas (Kanan)",
      R_POSTERIOR: "Bahu Belakang (Kanan)",
      R_SCAPULA: "Belikat (Kanan)",
      R_TRAPEZIUS: "Leher / Trapezius (Kanan)",
      L_ANTERIOR: "Bahu Depan (Kiri)",
      L_LATERAL: "Sisi Deltoid (Kiri)",
      L_UPPER_ARM: "Lengan Atas (Kiri)",
      L_POSTERIOR: "Bahu Belakang (Kiri)",
      L_SCAPULA: "Belikat (Kiri)",
      L_TRAPEZIUS: "Leher / Trapezius (Kiri)",
    };

    if (regionEntries.length === 0) {
      painNordicSummaryContainer.innerHTML = `<span class="dash-empty-note">Tidak ada titik nyeri anatomi khusus yang dilaporkan pada riwayat sesi.</span>`;
    } else {
      regionEntries.sort((a, b) => b[1] - a[1]).forEach(([code, count]) => {
        const tag = document.createElement("span");
        tag.className = "dash-nordic-tag";
        tag.innerHTML = `<span>${regionNames[code] || code}</span> <span class="tag-count">${count}x</span>`;
        painNordicSummaryContainer.appendChild(tag);
      });
    }
  }
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
    sessionTableBody.innerHTML = `<tr><td colspan="12" class="dash-table-empty">Belum ada data sesi untuk pasien ini.</td></tr>`;
    return;
  }

  // Reverse so latest is shown first in the table
  const reversed = [...sessions].reverse();

  reversed.forEach((s) => {
    const tr = document.createElement("tr");

    // Mode Badge (Fitur 5: Klinik vs Mandiri di Rumah)
    const modeBadge = (s.sessionMode === "HOME")
      ? `<span class="dash-badge-mode home" title="Sesi Latihan Mandiri di Rumah">🏠 Mandiri</span>`
      : `<span class="dash-badge-mode clinic" title="Sesi Terawasi di Klinik">🏥 Klinik</span>`;

    // Pain checklist badges (Dual Indicator: Triangle shape + Color + Text + NRS Scale)
    const painBadges = [];
    const scores = s.painScores || {};
    if (s.painAbduction) painBadges.push(`<span class="pain-chip"><span class="chip-shape">▲</span> Abduksi ${scores.abduction ? `(${scores.abduction}/10)` : ""}</span>`);
    if (s.painFlexion) painBadges.push(`<span class="pain-chip"><span class="chip-shape">▲</span> Fleksi ${scores.flexion ? `(${scores.flexion}/10)` : ""}</span>`);
    if (s.painExternalRotation) painBadges.push(`<span class="pain-chip"><span class="chip-shape">▲</span> Rot. Eks ${scores.externalRotation ? `(${scores.externalRotation}/10)` : ""}</span>`);
    if (s.painInternalRotation) painBadges.push(`<span class="pain-chip"><span class="chip-shape">▲</span> Rot. Int ${scores.internalRotation ? `(${scores.internalRotation}/10)` : ""}</span>`);
    if (s.painExtension) painBadges.push(`<span class="pain-chip"><span class="chip-shape">▲</span> Ekstensi ${scores.extension ? `(${scores.extension}/10)` : ""}</span>`);

    let painSummaryPill = "";
    if (s.maxPainScore !== null && s.maxPainScore !== undefined && s.maxPainScore > 0) {
      let severityClass = s.maxPainScore <= 3 ? "mild" : s.maxPainScore <= 6 ? "mod" : "severe";
      painSummaryPill = `<span class="pain-score-pill ${severityClass}">NRS ${s.maxPainScore}/10</span>`;
    }

    const painHtml =
      painBadges.length > 0
        ? `<div class="pain-chips-wrap">${painBadges.join("")} ${painSummaryPill}</div>`
        : `<span class="pain-free-pill"><span class="chip-shape">●</span> Bebas Nyeri</span>`;

    const missionBadge =
      s.missionId === 1
        ? `<span class="table-mission-badge m1">M1 Archer</span>`
        : `<span class="table-mission-badge m2">M2 Garden</span>`;

    // Metrics Cell (Fitur 3: ROM Maksimum, Akurasi, Kompensasi)
    const romText = s.maxRomDeg ? `<strong>${s.maxRomDeg}°</strong>` : "—";
    const accText = s.accuracyPercent !== null && s.accuracyPercent !== undefined ? ` · ${s.accuracyPercent}%` : "";
    const compText = s.compensationEvents ? `<br><small style="color:#f87171">${s.compensationEvents}x kompensasi</small>` : "";
    const metricsHtml = `<div class="cell-metrics">${romText}${accText}${compText}</div>`;

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

    // Action Cell (Fitur 6: Replay Kerangka Gerak Kinematis)
    const replayActionHtml = s.hasReplay
      ? `<button type="button" class="btn-replay-action" data-session-id="${s.id}" data-patient-name="${escapeHtml(s.patientName || "")}" data-session-num="${s.sessionNumber}" data-session-mode="${s.sessionMode || "CLINIC"}" title="Putar visualisasi stick-figure 9 sendi">🎬 Replay</button>`
      : `<span class="replay-na" title="Data rekaman kinematis tidak tersedia pada sesi ini">—</span>`;

    tr.innerHTML = `
      <td><strong>#${s.sessionNumber}</strong></td>
      <td class="cell-nowrap">${formatDateTime(s.date)}</td>
      <td>${modeBadge}</td>
      <td>${missionBadge}</td>
      <td><span class="table-level-pill">Lv. ${s.level}</span></td>
      <td><strong>${s.time || "—"}</strong></td>
      <td><strong>${s.hits}</strong>/10</td>
      <td><strong class="cell-score">${s.score}</strong></td>
      <td>${metricsHtml}</td>
      <td>${painHtml}</td>
      <td class="cell-notes">${notesCellHtml}</td>
      <td class="cell-action">${replayActionHtml}</td>
    `;

    sessionTableBody.appendChild(tr);
  });
}

// ── PDF Export Engine & Report Population ─────────────────────────────────────

function escapePdfHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeAiDraftText(raw) {
  if (!raw) return "";
  if (typeof raw === "object") {
    if (typeof raw.formattedText === "string") {
      return normalizeAiDraftText(raw.formattedText);
    }
    if (raw.soap && typeof raw.soap === "object") {
      const s = raw.soap;
      const parts = [];
      if (s.subjective) parts.push(`[S - SUBJEKTIF]\n${s.subjective}`);
      if (s.objective) parts.push(`[O - OBJEKTIF]\n${s.objective}`);
      if (s.assessment) parts.push(`[A - ASESMEN]\n${s.assessment}`);
      if (s.plan) parts.push(`[P - PLAN TERAPI]\n${s.plan}`);
      return parts.join("\n\n").trim();
    }
    return "";
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "[object Object]" || trimmed.includes("[object Object]")) {
      return "";
    }
    // Handle case where string is a JSON-serialized object
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object") {
          return normalizeAiDraftText(parsed);
        }
      } catch (_) {
        // Not JSON, treat as plain string
      }
    }
    return trimmed;
  }
  return "";
}

function renderPdfRecommendation(report) {
  const recContainer = document.getElementById("pdfRecommendationText");
  const recBadge = document.getElementById("pdfRecommendationBadge");
  if (!recContainer) return;

  const isApprovedSoap = Boolean(report.aiSummaryApproved);
  if (recBadge) {
    if (isApprovedSoap) {
      recBadge.textContent = "✓ Disetujui Fisioterapis (SOAP)";
      recBadge.className = "pdf-rec-badge approved";
    } else {
      recBadge.textContent = "Evaluasi Telemetri Klinis";
      recBadge.className = "pdf-rec-badge";
    }
  }

  let cleanRec = normalizeAiDraftText(report.recommendation);
  if (!cleanRec) {
    const rx = report.patient?.prescription || { initialTargetRom: 45, maxSafetyCeiling: 135 };
    cleanRec = `[EVALUASI BIOMEKANIKA]\nPasien menyelesaikan ${report.patient?.totalSessions || report.sessions?.length || 0} sesi latihan aktif dengan Batas Aman (Safety Ceiling) ${rx.maxSafetyCeiling}°.\n\n[TINDAK LANJUT TERAPI]\nLanjutkan latihan adaptif terkontrol (Target Awal ${rx.initialTargetRom}°) dengan pemantauan toleransi nyeri dan postur bahu.`;
  }

  const labelMap = {
    "S - SUBJEKTIF": "S • Subjektif",
    "O - OBJEKTIF": "O • Objektif",
    "A - ASESMEN": "A • Asesmen",
    "P - PLAN TERAPI": "P • Plan Terapi",
    "EVALUASI BIOMEKANIKA": "Biomekanika",
    "TOLERANSI NYERI": "Toleransi Nyeri",
    "TINDAK LANJUT TERAPI": "Tindak Lanjut",
  };

  const sectionRegex = /\[([^\]]+)\]\s*/g;
  const matches = [...cleanRec.matchAll(sectionRegex)];

  if (matches.length > 0) {
    const rowsHtml = [];
    for (let i = 0; i < matches.length; i++) {
      const rawTag = matches[i][1].trim();
      const startIdx = matches[i].index + matches[i][0].length;
      const endIdx = i + 1 < matches.length ? matches[i + 1].index : cleanRec.length;
      const bodyText = cleanRec.slice(startIdx, endIdx).trim();
      if (!bodyText) continue;

      const upperTag = rawTag.toUpperCase();
      const friendlyLabel = labelMap[upperTag] || rawTag;
      const isPlanRow =
        upperTag.startsWith("P -") ||
        upperTag === "P" ||
        upperTag.includes("PLAN") ||
        upperTag.includes("TINDAK LANJUT");

      rowsHtml.push(`
        <div class="pdf-rec-soap-row${isPlanRow ? " highlight" : ""}">
          <span class="pdf-rec-soap-label">${escapePdfHtml(friendlyLabel)}</span>
          <span class="pdf-rec-soap-body">${escapePdfHtml(bodyText)}</span>
        </div>
      `);
    }

    if (rowsHtml.length > 0) {
      recContainer.innerHTML = `<div class="pdf-rec-soap-list">${rowsHtml.join("")}</div>`;
      return;
    }
  }

  recContainer.innerHTML = `<p class="pdf-rec-plain">${escapePdfHtml(cleanRec)}</p>`;
}

async function populatePdfReportTemplate(patientName) {
  const refParam = activePatientRef || patientName;
  const res = await fetch(`${API_BASE}/patients/${encodeURIComponent(refParam)}/report`, {
    headers: { Authorization: `Bearer ${currentToken}` },
  });

  if (!res.ok) throw new Error("Gagal mengambil data laporan PDF");
  const { report } = await res.json();

  // Populate PDF Template Identifiers
  document.getElementById("pdfReportId").textContent = report.reportId;
  document.getElementById("pdfGeneratedDate").textContent = formatDateTime(report.generatedAt);
  const pdfMedRecordEl = document.getElementById("pdfMedRecord");
  if (pdfMedRecordEl) pdfMedRecordEl.textContent = report.patient.medicalRecordNo || "—";
  const pdfConsentEl = document.getElementById("pdfConsent");
  if (pdfConsentEl) pdfConsentEl.textContent = report.patient.consent?.given ? "Persetujuan Aktif (UU PDP)" : "Persetujuan Tercatat";
  document.getElementById("pdfPatientName").textContent = report.patient.name;
  document.getElementById("pdfPatientAge").textContent = `${report.patient.age} Tahun`;
  document.getElementById("pdfTotalSessions").textContent = `${report.patient.totalSessions} Sesi`;
  const pdfCeilingEl = document.getElementById("pdfSafetyCeiling");
  if (pdfCeilingEl) {
    const rx = report.patient.prescription;
    pdfCeilingEl.textContent = rx ? `${rx.maxSafetyCeiling}° (Safety Ceiling)` : "135° (Safety Ceiling)";
  }
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

  const roms = report.sessions.map((s) => s.maxRomDeg).filter((r) => typeof r === "number");
  const bestRom = roms.length ? Math.max(...roms) : 0;
  const elBestRom = document.getElementById("pdfBestRom");
  if (elBestRom) elBestRom.textContent = bestRom ? `${bestRom}°` : "—°";

  const accs = report.sessions.map((s) => s.accuracyPercent).filter((a) => typeof a === "number");
  const avgAcc = accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : null;
  const elAvgAcc = document.getElementById("pdfAvgAccuracy");
  if (elAvgAcc) elAvgAcc.textContent = avgAcc !== null ? `${avgAcc}%` : "—%";

  document.getElementById("pdfAvgScore").textContent = avgSc;
  document.getElementById("pdfMaxScore").textContent = maxSc;
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

  // Dynamic / Approved SOAP Clinical Recommendation from Database
  renderPdfRecommendation(report);

  const pdfFooterMeta = document.getElementById("pdfFooterMeta");
  if (pdfFooterMeta) {
    pdfFooterMeta.textContent = `ID Dokumen: ${report.reportId}`;
  }

  report.sessions.forEach((s) => {
    const tr = document.createElement("tr");
    const pains = [];
    const scores = s.painScores || {};
    if (s.painChecklist.flexion) pains.push(`Fleksi${scores.flexion ? ` (${scores.flexion}/10)` : ""}`);
    if (s.painChecklist.abduction) pains.push(`Abduksi${scores.abduction ? ` (${scores.abduction}/10)` : ""}`);
    if (s.painChecklist.externalRotation) pains.push(`Rot. Eks${scores.externalRotation ? ` (${scores.externalRotation}/10)` : ""}`);
    if (s.painChecklist.internalRotation) pains.push(`Rot. Int${scores.internalRotation ? ` (${scores.internalRotation}/10)` : ""}`);
    if (s.painChecklist.extension) pains.push(`Ekstensi${scores.extension ? ` (${scores.extension}/10)` : ""}`);

    const painStr = pains.length ? pains.join(", ") : "Bebas Nyeri";
    const romStr = s.maxRomDeg ? `${s.maxRomDeg}°` : "—";
    const accStr = s.accuracyPercent !== null && s.accuracyPercent !== undefined ? ` (${s.accuracyPercent}%)` : "";

    tr.innerHTML = `
      <td>${s.index}</td>
      <td>${formatDate(s.date)}</td>
      <td><strong>${escapePdfHtml(s.missionTitle)}</strong></td>
      <td>Lv. ${s.level}</td>
      <td>${escapePdfHtml(s.time || "—")}</td>
      <td>${s.hits}/10</td>
      <td>${s.score}</td>
      <td>${romStr}${accStr}</td>
      <td>${escapePdfHtml(painStr)}</td>
      <td style="font-size: 8pt">${escapePdfHtml(s.notes || "Tidak ada catatan khusus dari terapis.")}</td>
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
      margin: [6, 6, 10, 6],
      filename: cleanFileName,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      pagebreak: {
        mode: ["css", "legacy"],
        avoid: [
          "tr",
          ".pdf-signature-section",
          ".pdf-recommendation-box",
          ".pdf-sig-block",
          ".pdf-chart-box",
          ".pdf-kpi-summary",
          ".pdf-info-grid",
        ],
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };

    // Stamp accurate page numbers and output explicit application/pdf Blob
    let pdfBlob;
    const worker = html2pdf().set(opt).from(element);
    try {
      const pdf = await worker.toPdf().get("pdf");
      const totalPages = pdf.internal.getNumberOfPages();
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(7.5);
        pdf.setTextColor(120, 113, 108);
        pdf.text(`Halaman ${i} / ${totalPages}`, pageW - 6, pageH - 3.8, {
          align: "right",
        });
      }
      pdfBlob = pdf.output("blob");
    } catch (_) {
      pdfBlob = await worker.output("blob");
    }

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

// ── Resep Latihan & Batas Aman (Fitur 1) ───────────────────────────────────────

function updatePrescriptionUI(rx) {
  const ceilingInput = document.getElementById("rxSafetyCeiling");
  const ceilingVal = document.getElementById("rxSafetyCeilingVal");
  const initialInput = document.getElementById("rxInitialTarget");
  const initialVal = document.getElementById("rxInitialTargetVal");
  const minInput = document.getElementById("rxMinFunctional");
  const minVal = document.getElementById("rxMinFunctionalVal");
  const adaptiveToggle = document.getElementById("rxAdaptiveToggle");
  const adaptiveToggleText = document.getElementById("rxAdaptiveToggleText");

  if (!ceilingInput || !rx) return;

  const ceiling = rx.maxSafetyCeiling ?? 135;
  const initial = rx.initialTargetRom ?? 45;
  const min = rx.minFunctionalRom ?? 30;
  const adaptive = rx.adaptiveEnabled !== false;

  ceilingInput.value = ceiling;
  if (ceilingVal) ceilingVal.textContent = `${ceiling}°`;

  if (initialInput) initialInput.value = initial;
  if (initialVal) initialVal.textContent = `${initial}°`;

  if (minInput) minInput.value = min;
  if (minVal) minVal.textContent = `${min}°`;

  if (adaptiveToggle) adaptiveToggle.checked = adaptive;
  if (adaptiveToggleText) {
    adaptiveToggleText.textContent = adaptive ? "Adaptif Otomatis Aktif" : "Target Tetap (Non-aktif)";
  }
}

function initPrescriptionControls() {
  const form = document.getElementById("rxForm");
  const ceilingInput = document.getElementById("rxSafetyCeiling");
  const ceilingVal = document.getElementById("rxSafetyCeilingVal");
  const initialInput = document.getElementById("rxInitialTarget");
  const initialVal = document.getElementById("rxInitialTargetVal");
  const minInput = document.getElementById("rxMinFunctional");
  const minVal = document.getElementById("rxMinFunctionalVal");
  const adaptiveToggle = document.getElementById("rxAdaptiveToggle");
  const adaptiveToggleText = document.getElementById("rxAdaptiveToggleText");
  const feedbackEl = document.getElementById("rxSaveFeedback");
  const btnSave = document.getElementById("btnSaveRx");
  const btnSaveText = document.getElementById("btnSaveRxText");
  const btnSaveLoader = document.getElementById("btnSaveRxLoader");

  if (!form || !ceilingInput) return;

  ceilingInput.addEventListener("input", (e) => {
    if (ceilingVal) ceilingVal.textContent = `${e.target.value}°`;
  });
  if (initialInput) {
    initialInput.addEventListener("input", (e) => {
      if (initialVal) initialVal.textContent = `${e.target.value}°`;
    });
  }
  if (minInput) {
    minInput.addEventListener("input", (e) => {
      if (minVal) minVal.textContent = `${e.target.value}°`;
    });
  }
  if (adaptiveToggle) {
    adaptiveToggle.addEventListener("change", (e) => {
      if (adaptiveToggleText) {
        adaptiveToggleText.textContent = e.target.checked
          ? "Adaptif Otomatis Aktif"
          : "Target Tetap (Non-aktif)";
      }
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activePatientRef) {
      alert("Pilih pasien terlebih dahulu sebelum menyimpan resep.");
      return;
    }

    const ceiling = parseFloat(ceilingInput.value);
    const initial = initialInput ? parseFloat(initialInput.value) : 45;
    const min = minInput ? parseFloat(minInput.value) : 30;
    const adaptive = adaptiveToggle ? adaptiveToggle.checked : true;

    if (min > initial) {
      showRxFeedback("Batas minimum tidak boleh lebih besar dari target awal.", "error");
      return;
    }
    if (initial > ceiling) {
      showRxFeedback("Target awal tidak boleh melebihi Batas Aman (Safety Ceiling).", "error");
      return;
    }

    try {
      if (btnSave) btnSave.disabled = true;
      if (btnSaveLoader) btnSaveLoader.classList.remove("hidden");
      if (btnSaveText) btnSaveText.textContent = "Menyimpan...";

      const res = await fetch(`${API_BASE}/patients/${encodeURIComponent(activePatientRef)}/prescription`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${currentToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          initialTargetRom: initial,
          maxSafetyCeiling: ceiling,
          minFunctionalRom: min,
          adaptiveEnabled: adaptive,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan resep");

      activePatientPrescription = data.prescription;
      showRxFeedback("✓ Resep & Batas Aman berhasil disimpan!", "success");

      // Redraw trend chart with updated ceiling line
      const trendCanvas = document.getElementById("uiTrendCanvas");
      if (trendCanvas && currentPatientHistory && currentPatientHistory.length > 0) {
        drawTrendChart(trendCanvas, currentPatientHistory, false);
      }
    } catch (err) {
      console.error("[Save Prescription Error]", err);
      showRxFeedback(`Gagal menyimpan: ${err.message}`, "error");
    } finally {
      if (btnSave) btnSave.disabled = false;
      if (btnSaveLoader) btnSaveLoader.classList.add("hidden");
      if (btnSaveText) btnSaveText.textContent = "Simpan Resep & Batas Aman";
    }
  });

  function showRxFeedback(msg, type) {
    if (!feedbackEl) return;
    feedbackEl.textContent = msg;
    feedbackEl.className = `dash-rx-feedback ${type}`;
    feedbackEl.classList.remove("hidden");
    setTimeout(() => {
      feedbackEl.classList.add("hidden");
    }, 4500);
  }
}

// ── Fitur 7: Draf Ringkasan Klinis AI & Fitur 5: Mode Mandiri di Rumah ────────

const aiSummaryStatusBadge = document.getElementById("aiSummaryStatusBadge");
const aiSummaryDraftText   = document.getElementById("aiSummaryDraftText");
const btnGenerateAiSummary = document.getElementById("btnGenerateAiSummary");
const btnApproveAiSummary  = document.getElementById("btnApproveAiSummary");
const aiSummaryFeedback    = document.getElementById("aiSummaryFeedback");

function updateAiSummaryUI(assessment) {
  if (!aiSummaryDraftText || !aiSummaryStatusBadge) return;
  const cleanDraft = normalizeAiDraftText(assessment?.aiSummaryDraft);
  if (cleanDraft) {
    aiSummaryDraftText.value = cleanDraft;
    if (assessment.aiSummaryApproved) {
      aiSummaryStatusBadge.textContent = "✅ Disetujui Fisioterapis";
      aiSummaryStatusBadge.className = "dash-ai-status-badge approved";
    } else {
      aiSummaryStatusBadge.textContent = "Draf AI (Belum Disetujui)";
      aiSummaryStatusBadge.className = "dash-ai-status-badge";
    }
  } else {
    aiSummaryDraftText.value = "";
    aiSummaryStatusBadge.textContent = "Belum Ada Draf";
    aiSummaryStatusBadge.className = "dash-ai-status-badge";
  }
  if (aiSummaryFeedback) {
    aiSummaryFeedback.textContent = "";
    aiSummaryFeedback.className = "dash-ai-feedback";
  }
}

const homeCodeDisplay     = document.getElementById("homeCodeDisplay");
const btnGenerateHomeCode = document.getElementById("btnGenerateHomeCode");
const homeCodeFeedback    = document.getElementById("homeCodeFeedback");
const btnCopyLinkM1       = document.getElementById("btnCopyLinkM1");
const btnCopyLinkM2       = document.getElementById("btnCopyLinkM2");

function updateHomeSessionUI(patient) {
  if (!homeCodeDisplay) return;
  const code = patient?.homeAccessCode;
  if (code) {
    homeCodeDisplay.textContent = code;
  } else {
    homeCodeDisplay.textContent = "Belum Dibuat";
  }
  if (homeCodeFeedback) {
    homeCodeFeedback.textContent = "";
    homeCodeFeedback.className = "dash-home-feedback";
  }
}

function initAiSummaryAndHomeControls() {
  if (btnGenerateAiSummary) {
    btnGenerateAiSummary.addEventListener("click", async () => {
      if (!activePatientRef) return;
      try {
        btnGenerateAiSummary.disabled = true;
        btnGenerateAiSummary.innerHTML = "<span>Memproses AI...</span>";
        if (aiSummaryFeedback) aiSummaryFeedback.textContent = "";

        const res = await fetch(`${API_BASE}/patients/${encodeURIComponent(activePatientRef)}/ai-summary`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${currentToken}`,
          },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal membuat draf AI");

        const draftText = normalizeAiDraftText(data.draft ?? data);
        if (!draftText) {
          throw new Error("Respons draf ringkasan AI tidak valid.");
        }

        aiSummaryDraftText.value = draftText;
        aiSummaryStatusBadge.textContent = "Draf Baru (Belum Disetujui)";
        aiSummaryStatusBadge.className = "dash-ai-status-badge";
        if (currentPatientHistory && currentPatientHistory.length > 0) {
          const latestItem = currentPatientHistory[currentPatientHistory.length - 1];
          latestItem.aiSummaryDraft = draftText;
          latestItem.aiSummaryApproved = false;
        }
        if (aiSummaryFeedback) {
          aiSummaryFeedback.textContent = "✓ Draf ringkasan SOAP berhasil dibuat. Tinjau dan klik 'Setujui' untuk digunakan pada laporan PDF.";
          aiSummaryFeedback.className = "dash-ai-feedback success";
        }
      } catch (err) {
        if (aiSummaryFeedback) {
          aiSummaryFeedback.textContent = err.message || "Gagal membuat draf ringkasan.";
          aiSummaryFeedback.className = "dash-ai-feedback error";
        }
      } finally {
        btnGenerateAiSummary.disabled = false;
        btnGenerateAiSummary.innerHTML = "<span>🤖 Buat / Perbarui Draf AI</span>";
      }
    });
  }

  if (btnApproveAiSummary) {
    btnApproveAiSummary.addEventListener("click", async () => {
      if (!activePatientRef) return;
      const summaryText = normalizeAiDraftText(aiSummaryDraftText ? aiSummaryDraftText.value : "");
      if (!summaryText) {
        if (aiSummaryFeedback) {
          aiSummaryFeedback.textContent = "Isi draf ringkasan tidak boleh kosong atau tidak valid. Klik 'Buat / Perbarui Draf AI' terlebih dahulu.";
          aiSummaryFeedback.className = "dash-ai-feedback error";
        }
        return;
      }

      try {
        btnApproveAiSummary.disabled = true;
        btnApproveAiSummary.innerHTML = "<span>Menyimpan...</span>";

        const res = await fetch(`${API_BASE}/patients/${encodeURIComponent(activePatientRef)}/ai-summary/approve`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${currentToken}`,
          },
          body: JSON.stringify({ summaryText }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal menyetujui draf ringkasan");

        aiSummaryStatusBadge.textContent = "✅ Disetujui Fisioterapis";
        aiSummaryStatusBadge.className = "dash-ai-status-badge approved";
        if (currentPatientHistory && currentPatientHistory.length > 0) {
          const latestItem = currentPatientHistory[currentPatientHistory.length - 1];
          latestItem.aiSummaryDraft = summaryText;
          latestItem.aiSummaryApproved = true;
        }
        if (aiSummaryFeedback) {
          aiSummaryFeedback.textContent = "✓ Draf klinis SOAP resmi disetujui! Laporan PDF akan menggunakan ringkasan ini.";
          aiSummaryFeedback.className = "dash-ai-feedback success";
        }
      } catch (err) {
        if (aiSummaryFeedback) {
          aiSummaryFeedback.textContent = err.message || "Gagal menyetujui ringkasan.";
          aiSummaryFeedback.className = "dash-ai-feedback error";
        }
      } finally {
        btnApproveAiSummary.disabled = false;
        btnApproveAiSummary.innerHTML = "<span>✅ Setujui & Gunakan di Laporan PDF</span>";
      }
    });
  }

  if (btnGenerateHomeCode) {
    btnGenerateHomeCode.addEventListener("click", async () => {
      if (!activePatientRef) return;
      try {
        btnGenerateHomeCode.disabled = true;
        btnGenerateHomeCode.innerHTML = "<span>Membuat kode...</span>";

        const res = await fetch(`${API_BASE}/patients/${encodeURIComponent(activePatientRef)}/home-code`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${currentToken}`,
          },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal membuat kode latihan mandiri");

        if (homeCodeDisplay) homeCodeDisplay.textContent = data.homeAccessCode;
        if (homeCodeFeedback) {
          homeCodeFeedback.textContent = `✓ Kode akses aktif: ${data.homeAccessCode}. Bagikan tautan ke pasien.`;
          homeCodeFeedback.className = "dash-home-feedback success";
        }
      } catch (err) {
        if (homeCodeFeedback) {
          homeCodeFeedback.textContent = err.message || "Gagal membuat kode.";
          homeCodeFeedback.className = "dash-home-feedback error";
        }
      } finally {
        btnGenerateHomeCode.disabled = false;
        btnGenerateHomeCode.innerHTML = "<span>🔑 Buat / Perbarui Kode Akses Mandiri</span>";
      }
    });
  }

  function copyHomePracticeLink(missionHtml, btnElement) {
    const code = homeCodeDisplay ? homeCodeDisplay.textContent.trim() : "";
    if (!code || code === "Belum Dibuat" || code === "—") {
      alert("Harap buat kode akses mandiri terlebih dahulu.");
      return;
    }
    const url = `${window.location.origin}/${missionHtml}?code=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(url).then(() => {
      const orig = btnElement.textContent;
      btnElement.textContent = "✓ Tersalin!";
      btnElement.style.background = "#16a34a";
      btnElement.style.color = "#ffffff";
      setTimeout(() => {
        btnElement.textContent = orig;
        btnElement.style.background = "";
        btnElement.style.color = "";
      }, 2000);
    }).catch(() => {
      prompt("Salin tautan latihan mandiri:", url);
    });
  }

  if (btnCopyLinkM1) {
    btnCopyLinkM1.addEventListener("click", () => copyHomePracticeLink("index.html", btnCopyLinkM1));
  }

  if (btnCopyLinkM2) {
    btnCopyLinkM2.addEventListener("click", () => copyHomePracticeLink("mission2.html", btnCopyLinkM2));
  }
}

// ── v2.0: Theme Toggle (Studio Terang / Studio Gelap) ─────────────────────────
const dashThemeToggle = document.getElementById("dashThemeToggle");
const iconThemeLight  = document.getElementById("iconThemeLight");
const iconThemeDark   = document.getElementById("iconThemeDark");

function updateThemeToggleUI(theme) {
  if (!iconThemeLight || !iconThemeDark) return;
  if (theme === "dark") {
    iconThemeLight.style.display = "none";
    iconThemeDark.style.display = "block";
    if (dashThemeToggle) dashThemeToggle.title = "Ganti ke Studio Terang";
  } else {
    iconThemeLight.style.display = "block";
    iconThemeDark.style.display = "none";
    if (dashThemeToggle) dashThemeToggle.title = "Ganti ke Studio Gelap";
  }
}

function initThemeToggle() {
  const saved = localStorage.getItem("mw-theme");
  const currentTheme = saved === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", currentTheme);
  updateThemeToggleUI(currentTheme);

  if (dashThemeToggle) {
    dashThemeToggle.addEventListener("click", () => {
      const activeTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", activeTheme);
      localStorage.setItem("mw-theme", activeTheme);
      updateThemeToggleUI(activeTheme);

      // Redraw trend chart if active
      const trendCanvas = document.getElementById("uiTrendCanvas");
      if (trendCanvas && currentPatientHistory && currentPatientHistory.length > 0 && patientWorkspace && !patientWorkspace.classList.contains("hidden")) {
        drawTrendChart(trendCanvas, currentPatientHistory, activeTheme === "dark");
      }
    });
  }
}

// ── v2.0: Global Shortcuts (Ctrl/Cmd + K untuk fokus pencarian) ───────────────
function initShortcuts() {
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      if (patientSearchInput) {
        e.preventDefault();
        patientSearchInput.focus();
        patientSearchInput.select();
      }
    }
  });
}

// ── Kinematic Skeleton Replay Controller (Fitur 6) ───────────────────────────

let activeReplayPlayer = null;
let replayRafId = null;

function formatDurationMs(ms) {
  if (!ms || ms < 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function openReplayModal(sessionId, meta = {}) {
  const modal = document.getElementById("skeletonReplayModal");
  const canvas = document.getElementById("replayCanvas");
  const angleBadge = document.getElementById("replayAngleBadge");
  const compBadge = document.getElementById("replayCompBadge");
  const modeBadge = document.getElementById("replayModeBadge");
  const metaDisplay = document.getElementById("replaySessionMeta");
  const timeCurrent = document.getElementById("replayTimeCurrent");
  const timeTotal = document.getElementById("replayTimeTotal");
  const seekSlider = document.getElementById("replaySeek");
  const playIcon = document.getElementById("replayPlayIcon");
  const playText = document.getElementById("replayPlayText");

  if (!modal || !canvas) return;

  // Show modal with loading state
  modal.classList.remove("hidden");
  if (metaDisplay) {
    metaDisplay.textContent = `Memuat data kinematis sesi #${meta.sessionNum || sessionId}...`;
  }

  try {
    const res = await fetch(`${API_BASE}/assessment/${sessionId}/replay`, {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    if (!res.ok) {
      throw new Error(`Gagal memuat data replay (HTTP ${res.status})`);
    }
    const data = await res.json();
    if (!data.replay || !data.replay.frames || !data.replay.frames.length) {
      alert("Sesi ini tidak memiliki data rekaman kerangka gerak.");
      closeReplayModal();
      return;
    }

    if (typeof MoveWallKinematics === "undefined" || !MoveWallKinematics.KinematicPlayer) {
      throw new Error("Modul MoveWallKinematics belum dimuat di halaman.");
    }

    activeReplayPlayer = new MoveWallKinematics.KinematicPlayer(data.replay);
    activeReplayPlayer.play();

    if (modeBadge) {
      modeBadge.textContent = data.sessionMode === "HOME" ? "🏠 Mandiri di Rumah" : "🏥 Klinik";
    }

    if (metaDisplay) {
      const pName = data.patientName || meta.patientName || "Pasien";
      const sNum = meta.sessionNum ? `#${meta.sessionNum}` : `ID ${sessionId}`;
      const romMax = data.maxRomDeg ? ` · ROM Max ${data.maxRomDeg}°` : "";
      metaDisplay.textContent = `${pName} · Sesi ${sNum}${romMax}`;
    }

    const duration = activeReplayPlayer.durationMs || 1000;
    if (timeTotal) timeTotal.textContent = formatDurationMs(duration);
    if (seekSlider) {
      seekSlider.min = "0";
      seekSlider.max = String(duration);
      seekSlider.value = "0";
    }

    function renderLoop(timestamp) {
      if (!activeReplayPlayer) return;

      activeReplayPlayer.update(timestamp);
      activeReplayPlayer.renderToCanvas(canvas);

      const frame = activeReplayPlayer.getCurrentFrame();
      if (frame) {
        if (angleBadge) {
          angleBadge.textContent = `Sudut: ${frame.a !== undefined ? frame.a : 0}°`;
        }
        if (compBadge) {
          if (frame.c) {
            compBadge.classList.remove("hidden");
          } else {
            compBadge.classList.add("hidden");
          }
        }
      }

      const currMs = Math.round(activeReplayPlayer.currentTimeMs);
      if (timeCurrent) timeCurrent.textContent = formatDurationMs(currMs);
      if (seekSlider && document.activeElement !== seekSlider) {
        seekSlider.value = String(currMs);
      }

      if (playIcon && playText) {
        if (activeReplayPlayer.isPlaying) {
          playIcon.textContent = "⏸";
          playText.textContent = "Jeda";
        } else {
          playIcon.textContent = "▶";
          playText.textContent = "Putar";
        }
      }

      replayRafId = requestAnimationFrame(renderLoop);
    }

    if (replayRafId) cancelAnimationFrame(replayRafId);
    replayRafId = requestAnimationFrame(renderLoop);
  } catch (err) {
    console.error("[Replay Error]", err);
    alert(err.message || "Gagal memutar replay gerakan kinematis.");
    closeReplayModal();
  }
}

function closeReplayModal() {
  if (activeReplayPlayer) {
    activeReplayPlayer.pause();
    activeReplayPlayer = null;
  }
  if (replayRafId) {
    cancelAnimationFrame(replayRafId);
    replayRafId = null;
  }
  const modal = document.getElementById("skeletonReplayModal");
  if (modal) modal.classList.add("hidden");
}

function initReplayModalControls() {
  const modal = document.getElementById("skeletonReplayModal");
  const btnClose = document.getElementById("btnReplayClose");
  const backdrop = document.getElementById("replayModalBackdrop");
  const btnPlayPause = document.getElementById("btnReplayPlayPause");
  const btnRestart = document.getElementById("btnReplayRestart");
  const seekSlider = document.getElementById("replaySeek");
  const speedButtons = document.querySelectorAll(".btn-replay-speed");

  if (btnClose) btnClose.addEventListener("click", closeReplayModal);
  if (backdrop) backdrop.addEventListener("click", closeReplayModal);

  if (btnPlayPause) {
    btnPlayPause.addEventListener("click", () => {
      if (!activeReplayPlayer) return;
      activeReplayPlayer.togglePlay();
    });
  }

  if (btnRestart) {
    btnRestart.addEventListener("click", () => {
      if (!activeReplayPlayer) return;
      activeReplayPlayer.seek(0);
      activeReplayPlayer.play();
    });
  }

  if (seekSlider) {
    seekSlider.addEventListener("input", (e) => {
      if (!activeReplayPlayer) return;
      const targetMs = Number(e.target.value);
      activeReplayPlayer.seek(targetMs);
    });
  }

  speedButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const spd = parseFloat(btn.dataset.speed);
      if (activeReplayPlayer && spd) {
        activeReplayPlayer.setPlaybackSpeed(spd);
      }
      speedButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // Table action button event delegation
  if (sessionTableBody) {
    sessionTableBody.addEventListener("click", (e) => {
      const targetBtn = e.target.closest(".btn-replay-action");
      if (!targetBtn) return;
      const sessionId = targetBtn.dataset.sessionId;
      const patientName = targetBtn.dataset.patientName;
      const sessionNum = targetBtn.dataset.sessionNum;
      const sessionMode = targetBtn.dataset.sessionMode;
      if (sessionId) {
        openReplayModal(sessionId, { patientName, sessionNum, sessionMode });
      }
    });
  }
}

// ── Initialize ────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();
  initShortcuts();
  initPrescriptionControls();
  initAiSummaryAndHomeControls();
  initReplayModalControls();
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


