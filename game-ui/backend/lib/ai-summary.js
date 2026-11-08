/**
 * MoveWall AI — Clinical AI Summary Synthesis Module (Fitur 7)
 * Menghasilkan draf ringkasan klinis SOAP berbasis angka terstruktur:
 * ROM maksimum, akurasi, kompensasi, NRS 0–10, Nordic Body Map, dan Safety Ceiling.
 * 
 * ATURAN KESELAMATAN KLINIS:
 * 1. Tidak menghasilkan diagnosis penyakit atau saran obat definitif.
 * 2. Hanya mengevaluasi tren biomekanika dan toleransi latihan.
 * 3. Wajib disetujui terapis sebelum dicantumkan dalam laporan rekam medis PDF.
 */

const NORDIC_REGION_NAMES = {
  L_ANTERIOR: "Bahu Depan Kiri (Anterior)",
  R_ANTERIOR: "Bahu Depan Kanan (Anterior)",
  L_LATERAL: "Deltoid Samping Kiri (Lateral)",
  R_LATERAL: "Deltoid Samping Kanan (Lateral)",
  L_POSTERIOR: "Bahu Belakang Kiri (Posterior)",
  R_POSTERIOR: "Bahu Belakang Kanan (Posterior)",
  L_SCAPULA: "Skapula / Belikat Kiri",
  R_SCAPULA: "Skapula / Belikat Kanan",
  L_UPPER_ARM: "Lengan Atas Kiri",
  R_UPPER_ARM: "Lengan Atas Kanan",
  L_TRAPEZIUS: "Trapezius Kiri (Leher)",
  R_TRAPEZIUS: "Trapezius Kanan (Leher)",
};

/**
 * Menghasilkan draf ringkasan klinis terstruktur (SOAP).
 * @param {Object} params
 * @param {Object} params.patient - { name, age, medicalRecordNo, prescription }
 * @param {Array} params.sessions - Daftar asesmen pasien kronologis
 * @param {Object} params.painMetrics - Agregasi insidensi nyeri
 * @returns {Object} { soap: { subjective, objective, assessment, plan }, formattedText, generatedAt }
 */
function generateClinicalSummaryDraft({ patient, sessions = [], painMetrics = {} }) {
  if (!sessions || sessions.length === 0) {
    const text = `Pasien ${patient?.name || "Pasien"} terdaftar dengan target awal ${patient?.prescription?.initialTargetRom || 45}° dan batas aman ${patient?.prescription?.maxSafetyCeiling || 135}°. Belum ada sesi latihan yang terekam.`;
    return {
      soap: {
        subjective: "Belum ada sesi latihan yang diselesaikan oleh pasien.",
        objective: `Target awal: ${patient?.prescription?.initialTargetRom || 45}°, Batas Aman: ${patient?.prescription?.maxSafetyCeiling || 135}°.`,
        assessment: "Evaluasi awal tertunda menunggu sesi latihan pertama.",
        plan: "Jadwalkan sesi pembuka kalibrasi kamera dan adaptasi gerak.",
      },
      formattedText: text,
      generatedAt: new Date().toISOString(),
    };
  }

  const totalSessions = sessions.length;
  const rx = patient.prescription || {
    initialTargetRom: 45.0,
    maxSafetyCeiling: 135.0,
    minFunctionalRom: 30.0,
    adaptiveEnabled: true,
  };

  // 1. Ekstraksi Metrik Objektif (O)
  const romValues = sessions.map((s) => s.maxRomDeg).filter((v) => typeof v === "number");
  const baselineRom = romValues.length ? romValues[0] : null;
  const bestRom = romValues.length ? Math.max(...romValues) : null;
  const latestSession = sessions[sessions.length - 1];
  const latestRom = latestSession?.maxRomDeg ?? null;
  const romDelta = bestRom !== null && baselineRom !== null ? Math.round((bestRom - baselineRom) * 10) / 10 : 0;

  const accuracies = sessions.map((s) => s.accuracyPercent).filter((v) => typeof v === "number");
  const avgAccuracy = accuracies.length ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length) : null;

  const compensations = sessions.map((s) => s.compensationEvents).filter((v) => typeof v === "number");
  const totalCompensations = compensations.reduce((a, b) => a + b, 0);

  // 2. Ekstraksi Metrik Subjektif / Nyeri (S)
  const painSessions = sessions.filter((s) => s.hasPain).length;
  const painRate = Math.round((painSessions / totalSessions) * 100);

  const allScores = sessions.flatMap((s) => {
    if (!s.painScores) return [];
    return Object.values(s.painScores).filter((v) => typeof v === "number");
  });
  const maxPain = allScores.length ? Math.max(...allScores) : 0;

  const allRegions = [...new Set(sessions.flatMap((s) => s.painRegions || []))];
  const regionalNames = allRegions.map((r) => NORDIC_REGION_NAMES[r] || r);

  // 3. Sintesis SOAP
  // Subjective
  let sText = "";
  if (painSessions === 0) {
    sText = `Pasien tidak melaporkan keluhan nyeri pada seluruh ${totalSessions} sesi latihan (NRS 0/10, pain-free optimal).`;
  } else {
    sText = `Terdapat keluhan nyeri pada ${painSessions} dari ${totalSessions} sesi (${painRate}%). Skor nyeri puncak tercatat ${maxPain}/10 (NRS). `;
    if (regionalNames.length > 0) {
      sText += `Distribusi titik nyeri terlokalisasi pada: ${regionalNames.join(", ")}.`;
    }
  }

  // Objective
  let oText = `Rentang gerak (ROM) bahu tercatat mulai dari baseline ${baselineRom ?? "—"}° hingga capaian tertinggi ${bestRom ?? "—"}° (peningkatan +${romDelta}°). `;
  oText += `Batas aman resep (Safety Ceiling): ${rx.maxSafetyCeiling}°. `;
  if (avgAccuracy !== null) {
    oText += `Rata-rata akurasi penahanan target: ${avgAccuracy}%. `;
  }
  oText += `Total kejadian kompensasi bahu terdeteksi: ${totalCompensations} kali selama ${totalSessions} sesi.`;

  // Assessment
  let aText = "";
  if (bestRom !== null && bestRom > rx.maxSafetyCeiling + 5) {
    if (painRate >= 50 || maxPain >= 5) {
      aText = `Capaian sudut aktif (${bestRom}°) sempat melampaui Batas Aman resep (${rx.maxSafetyCeiling}°) disertai keluhan nyeri (${painRate}% sesi, puncak NRS ${maxPain}/10). Perlu pembatasan elevasi disiplin di bawah koridor aman.`;
    } else {
      aText = `Capaian sudut aktif (${bestRom}°) telah melampaui Batas Aman resep saat ini (${rx.maxSafetyCeiling}°) dengan respons postur terkontrol.`;
    }
  } else if (painRate > 50 || maxPain >= 6) {
    aText = `Progresi gerak masih dipengaruhi sensitivitas nyeri pada ${painRate}% sesi (puncak NRS ${maxPain}/10). Perlu perhatian khusus pada elevasi di atas ${rx.minFunctionalRom}°.`;
  } else if (bestRom !== null && bestRom >= rx.maxSafetyCeiling * 0.95) {
    aText = `Pasien menunjukkan adaptasi motorik sangat baik, mendekati batas aman terapis (${rx.maxSafetyCeiling}°). Kontrol neuromuskular stabil.`;
  } else if (romDelta > 15) {
    aText = `Progresi rentang gerak aktif signifikan (+${romDelta}°). Toleransi gerak meningkat dengan stabilitas postur terkontrol.`;
  } else {
    aText = `Respons latihan stabil dengan fluktuasi sudut normal. Ritme motorik konsisten dalam koridor aman.`;
  }

  // Plan
  let pText = "";
  if (painRate === 0 && bestRom !== null && bestRom >= rx.maxSafetyCeiling * 0.9) {
    pText = `Pertimbangkan menaikkan Batas Aman (Safety Ceiling) ke ${Math.min(180, rx.maxSafetyCeiling + 10)}° pada konsultasi berikutnya. Lanjutkan Misi 2 untuk stabilisasi rotasi.`;
  } else if (maxPain >= 5 || painRate >= 50) {
    pText = `Pertahankan target awal di ${rx.initialTargetRom}° dan batasi ceiling di ${rx.maxSafetyCeiling}°. Berikan edukasi pendinginan dan kompres es bila nyeri timbul pasca-sesi.`;
  } else {
    pText = `Lanjutkan program adaptif saat ini (Ceiling: ${rx.maxSafetyCeiling}°, Target Awal: ${rx.initialTargetRom}°). Evaluasi kembali setelah 3 sesi tambahan.`;
  }

  const formattedText = `[S - SUBJEKTIF]\n${sText}\n\n[O - OBJEKTIF]\n${oText}\n\n[A - ASESMEN]\n${aText}\n\n[P - PLAN TERAPI]\n${pText}`;

  return {
    soap: {
      subjective: sText,
      objective: oText,
      assessment: aText,
      plan: pText,
    },
    formattedText,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  generateClinicalSummaryDraft,
  NORDIC_REGION_NAMES,
};

