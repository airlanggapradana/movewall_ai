/**
 * MoveWall AI — validasi dan normalisasi data klinis sesi.
 * Murni (tanpa akses database) agar mudah diuji.
 */

// Versi teks persetujuan data yang ditampilkan ke pasien. Naikkan bila redaksi berubah.
const CONSENT_VERSION = "2026-11-v1";

// Lima gerakan bahu yang dinilai nyerinya. `flag` adalah kolom boolean lama.
const PAIN_MOVEMENTS = [
  { key: "Flexion", flag: "painFlexion", score: "painFlexionScore" },
  { key: "Abduction", flag: "painAbduction", score: "painAbductionScore" },
  {
    key: "ExternalRotation",
    flag: "painExternalRotation",
    score: "painExternalRotationScore",
  },
  {
    key: "InternalRotation",
    flag: "painInternalRotation",
    score: "painInternalRotationScore",
  },
  { key: "Extension", flag: "painExtension", score: "painExtensionScore" },
];

// Wilayah peta nyeri bahu. Awalan L_/R_ = sisi kiri/kanan pasien.
const PAIN_REGION_CODES = [
  "ANTERIOR", // bahu depan
  "LATERAL", // sisi bahu (deltoid)
  "UPPER_ARM", // lengan atas
  "POSTERIOR", // bahu belakang
  "SCAPULA", // tulang belikat
  "TRAPEZIUS", // otot trapezius atas / sisi leher
];
const PAIN_REGIONS = PAIN_REGION_CODES.flatMap((code) => [
  `L_${code}`,
  `R_${code}`,
]);

class ValidationError extends Error {}

function isBlank(value) {
  return value === undefined || value === null || value === "";
}

/**
 * Membaca skala nyeri numerik 0–10 dan menurunkan flag boolean lama.
 * Klien lama yang hanya mengirim boolean tetap diterima (skor = null).
 */
function normalizePain(body) {
  const data = {};
  for (const m of PAIN_MOVEMENTS) {
    const rawScore = body[m.score];
    if (!isBlank(rawScore)) {
      const score = Number(rawScore);
      if (!Number.isInteger(score) || score < 0 || score > 10) {
        throw new ValidationError(
          `${m.score} harus bilangan bulat 0–10.`,
        );
      }
      data[m.score] = score;
      data[m.flag] = score > 0;
    } else {
      data[m.score] = null;
      data[m.flag] = !!body[m.flag];
    }
  }
  return data;
}

function normalizePainRegions(raw) {
  if (isBlank(raw)) return [];
  if (!Array.isArray(raw)) {
    throw new ValidationError("painRegions harus berupa daftar kode wilayah.");
  }
  const unique = [...new Set(raw)];
  const invalid = unique.filter((code) => !PAIN_REGIONS.includes(code));
  if (invalid.length > 0) {
    throw new ValidationError(
      `Kode wilayah nyeri tidak dikenal: ${invalid.join(", ")}`,
    );
  }
  return unique;
}

/**
 * ROM maksimum, akurasi, dan kejadian kompensasi dari klien.
 * Semuanya opsional: null berarti kamera tidak merekam metrik ini.
 */
function normalizeSessionMetrics(body) {
  const out = { maxRomDeg: null, accuracyPercent: null, compensationEvents: null };

  if (!isBlank(body.maxRomDeg)) {
    const v = Number(body.maxRomDeg);
    if (!Number.isFinite(v) || v < 0 || v > 180) {
      throw new ValidationError("maxRomDeg harus angka 0–180.");
    }
    out.maxRomDeg = Math.round(v * 10) / 10;
  }
  if (!isBlank(body.accuracyPercent)) {
    const v = Number(body.accuracyPercent);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      throw new ValidationError("accuracyPercent harus angka 0–100.");
    }
    out.accuracyPercent = Math.round(v);
  }
  if (!isBlank(body.compensationEvents)) {
    const v = Number(body.compensationEvents);
    if (!Number.isInteger(v) || v < 0 || v > 10000) {
      throw new ValidationError(
        "compensationEvents harus bilangan bulat non-negatif.",
      );
    }
    out.compensationEvents = v;
  }
  return out;
}

function hasAnyPain(record) {
  return PAIN_MOVEMENTS.some((m) => record[m.flag]);
}

/** Skor nyeri tertinggi dari satu sesi, atau null bila tidak ada skor numerik. */
function maxPainScore(record) {
  const scores = PAIN_MOVEMENTS.map((m) => record[m.score]).filter(
    (s) => typeof s === "number",
  );
  return scores.length ? Math.max(...scores) : null;
}

/**
 * Validasi dan normalisasi resep batas aman & adaptif gerak pasien.
 * (Fitur 1: Safety Ceiling & Personal Target).
 */
function validatePrescription(body) {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Payload resep latihan tidak valid.");
  }

  const initialTarget = body.initialTargetRom !== undefined && body.initialTargetRom !== null
    ? Number(body.initialTargetRom)
    : 45.0;
  const ceiling = body.maxSafetyCeiling !== undefined && body.maxSafetyCeiling !== null
    ? Number(body.maxSafetyCeiling)
    : 135.0;
  const minRom = body.minFunctionalRom !== undefined && body.minFunctionalRom !== null
    ? Number(body.minFunctionalRom)
    : 30.0;
  const adaptive = body.adaptiveEnabled !== undefined ? Boolean(body.adaptiveEnabled) : true;

  if (!Number.isFinite(initialTarget) || initialTarget < 15 || initialTarget > 180) {
    throw new ValidationError("Target ROM awal harus bernilai angka antara 15° dan 180°.");
  }
  if (!Number.isFinite(ceiling) || ceiling < 15 || ceiling > 180) {
    throw new ValidationError("Batas aman (Safety Ceiling) harus bernilai angka antara 15° dan 180°.");
  }
  if (!Number.isFinite(minRom) || minRom < 15 || minRom > 180) {
    throw new ValidationError("Batas fungsional minimum harus bernilai angka antara 15° dan 180°.");
  }

  if (minRom > initialTarget) {
    throw new ValidationError("Batas fungsional minimum tidak boleh lebih besar dari Target ROM awal.");
  }
  if (initialTarget > ceiling) {
    throw new ValidationError("Target ROM awal tidak boleh melebihi Batas Aman (Safety Ceiling).");
  }

  return {
    initialTargetRom: Math.round(initialTarget * 10) / 10,
    maxSafetyCeiling: Math.round(ceiling * 10) / 10,
    minFunctionalRom: Math.round(minRom * 10) / 10,
    adaptiveEnabled: adaptive,
  };
}

module.exports = {
  CONSENT_VERSION,
  PAIN_MOVEMENTS,
  PAIN_REGIONS,
  ValidationError,
  normalizePain,
  normalizePainRegions,
  normalizeSessionMetrics,
  hasAnyPain,
  maxPainScore,
  validatePrescription,
};

