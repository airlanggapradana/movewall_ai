/**
 * MoveWall AI — Player Tracker & Camera Calibration Module (Fitur 9 & Fitur 4)
 * ══════════════════════════════════════════════════════════════════════════════
 * Provides:
 * 1. Body centroid computation from key torso landmarks (11, 12, 23, 24).
 * 2. Player Lock centroid continuity matching to prevent bystander interference (Fitur 9).
 * 3. Occlusion & lost-player auto-pause detection with grace frames (Fitur 9).
 * 4. Camera distance & shoulder leveling calibration (Fitur 4).
 * 5. Neutral posture zero-offset baseline normalization (Fitur 4).
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MoveWallPlayerTracker = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DISTANCE_TOO_FAR_THRESHOLD = 0.20;
  const DISTANCE_TOO_CLOSE_THRESHOLD = 0.48;
  const SHOULDER_TILT_THRESHOLD = 0.04;
  const DEFAULT_CENTROID_MAX_DISTANCE = 0.38;
  const DEFAULT_MAX_LOST_FRAMES = 25; // ~800ms at 30fps

  /**
   * Computes the body centroid and geometric properties from MediaPipe pose landmarks.
   * @param {Array<{x: number, y: number, z?: number, visibility?: number}>} landmarks 
   * @returns {Object|null} Centroid and geometry, or null if essential landmarks are missing.
   */
  function computeCentroid(landmarks) {
    if (!Array.isArray(landmarks) || landmarks.length < 25) return null;

    const ls = landmarks[11]; // Left shoulder
    const rs = landmarks[12]; // Right shoulder
    const lh = landmarks[23]; // Left hip
    const rh = landmarks[24]; // Right hip

    if (!ls || !rs) return null;

    // Bahu wajib terlihat jelas; panggul boleh diestimasi bila terpotong bawah kamera (mis. duduk di depan laptop)
    const shoulderVis = Math.min(ls.visibility ?? 1, rs.visibility ?? 1);
    if (shoulderVis < 0.2) return null;

    const midShoulderX = (ls.x + rs.x) * 0.5;
    const midShoulderY = (ls.y + rs.y) * 0.5;
    const shoulderWidth = Math.hypot(rs.x - ls.x, rs.y - ls.y);

    const hipsVisible =
      lh &&
      rh &&
      Math.min(lh.visibility ?? 1, rh.visibility ?? 1) >= 0.2;

    const midHipX = hipsVisible ? (lh.x + rh.x) * 0.5 : midShoulderX;
    const midHipY = hipsVisible
      ? (lh.y + rh.y) * 0.5
      : Math.min(0.95, midShoulderY + Math.max(0.24, shoulderWidth * 1.65));

    const x = (midShoulderX + midHipX) * 0.5;
    const y = (midShoulderY + midHipY) * 0.5;

    const torsoHeight = Math.hypot(midHipX - midShoulderX, midHipY - midShoulderY);
    const shoulderTilt = Math.abs(ls.y - rs.y);

    return {
      x,
      y,
      shoulderWidth,
      torsoHeight,
      shoulderTilt,
      estimatedHips: !hipsVisible,
      midShoulder: { x: midShoulderX, y: midShoulderY },
      midHip: { x: midHipX, y: midHipY },
    };
  }

  /**
   * Evaluates camera distance and shoulder leveling for camera calibration (Fitur 4).
   * @param {Array} landmarks 
   * @param {number} zeroOffset 
   * @returns {Object} Diagnostic report
   */
  function evaluateCameraCalibration(landmarks, zeroOffset = 0) {
    const centroid = computeCentroid(landmarks);
    if (!centroid) {
      return {
        valid: false,
        distanceStatus: "UNKNOWN",
        distanceLabel: "Tubuh belum terdeteksi penuh",
        distanceColor: "red",
        shoulderStatus: "UNKNOWN",
        shoulderLabel: "—",
        shoulderColor: "neutral",
        zeroOffset: zeroOffset || 0,
        torsoHeight: 0,
        shoulderTilt: 0,
      };
    }

    // 1. Distance evaluation
    let distStatus = "OPTIMAL";
    let distLabel = "Jarak Optimal (1.8m – 2.2m)";
    let distColor = "green";

    if (centroid.torsoHeight < DISTANCE_TOO_FAR_THRESHOLD) {
      distStatus = "TOO_FAR";
      distLabel = "Terlalu Jauh (>3m) — Harap maju sedikit";
      distColor = "orange";
    } else if (centroid.torsoHeight > DISTANCE_TOO_CLOSE_THRESHOLD) {
      distStatus = "TOO_CLOSE";
      distLabel = "Terlalu Dekat (<1.2m) — Harap mundur sedikit";
      distColor = "orange";
    }

    // 2. Shoulder leveling evaluation
    let shStatus = "LEVEL";
    let shLabel = "Bahu Sejajar (Optimal)";
    let shColor = "green";

    if (centroid.shoulderTilt > SHOULDER_TILT_THRESHOLD) {
      shStatus = "TILTED";
      const tiltDeg = Math.round(
        Math.atan2(centroid.shoulderTilt, Math.max(0.01, centroid.shoulderWidth)) * (180 / Math.PI)
      );
      shLabel = `Bahu Miring (~${tiltDeg}°) — Tegakkan badan`;
      shColor = "orange";
    }

    return {
      valid: true,
      distanceStatus: distStatus,
      distanceLabel: distLabel,
      distanceColor: distColor,
      shoulderStatus: shStatus,
      shoulderLabel: shLabel,
      shoulderColor: shColor,
      zeroOffset: Number(zeroOffset || 0),
      torsoHeight: Math.round(centroid.torsoHeight * 1000) / 1000,
      shoulderTilt: Math.round(centroid.shoulderTilt * 1000) / 1000,
    };
  }

  /**
   * Matches detected persons to the locked player centroid (Fitur 9).
   * @param {Array<Array>} allLandmarkSets Array of landmark sets from PoseLandmarker
   * @param {{x: number, y: number}|null} lockedCentroid Current centroid of locked player
   * @param {number} maxDistance Max Euclidean distance tolerance (normalized coordinates)
   * @returns {{landmarks: Array, centroid: Object, distance: number}|null}
   */
  function matchLockedPlayer(allLandmarkSets, lockedCentroid, maxDistance = DEFAULT_CENTROID_MAX_DISTANCE) {
    if (!Array.isArray(allLandmarkSets) || allLandmarkSets.length === 0) {
      return null;
    }

    // If no player is currently locked, pick the first valid body
    if (!lockedCentroid) {
      const first = allLandmarkSets[0];
      const c = computeCentroid(first);
      if (!c) return null;
      return { landmarks: first, centroid: c, distance: 0 };
    }

    let closest = null;
    let minDistance = Infinity;

    for (const lms of allLandmarkSets) {
      const c = computeCentroid(lms);
      if (!c) continue;

      const dist = Math.hypot(c.x - lockedCentroid.x, c.y - lockedCentroid.y);
      if (dist < minDistance) {
        minDistance = dist;
        closest = { landmarks: lms, centroid: c, distance: dist };
      }
    }

    if (closest && minDistance <= maxDistance) {
      return closest;
    }

    return null;
  }

  /**
   * Smoothly updates locked centroid using exponential moving average (EMA).
   * @param {{x: number, y: number}} current 
   * @param {{x: number, y: number}} detected 
   * @param {number} alpha Smoothing factor (0.0 to 1.0)
   * @returns {{x: number, y: number}}
   */
  function smoothCentroid(current, detected, alpha = 0.20) {
    if (!current) return { ...detected };
    return {
      x: current.x * (1 - alpha) + detected.x * alpha,
      y: current.y * (1 - alpha) + detected.y * alpha,
    };
  }

  /**
   * Normalizes raw clinical elevation angle by subtracting baseline resting zero-offset (Fitur 4).
   * @param {number} clinicalAngle Raw clinical angle (e.g. 20°)
   * @param {number} zeroOffset Baseline angle at rest (e.g. 18°)
   * @returns {number} Calibrated angle clamped at 0°
   */
  function applyZeroOffset(clinicalAngle, zeroOffset = 0) {
    const raw = Number(clinicalAngle) || 0;
    const offset = Number(zeroOffset) || 0;
    return Math.max(0, Math.round((raw - offset) * 10) / 10);
  }

  return {
    computeCentroid,
    evaluateCameraCalibration,
    matchLockedPlayer,
    smoothCentroid,
    applyZeroOffset,
    DISTANCE_TOO_FAR_THRESHOLD,
    DISTANCE_TOO_CLOSE_THRESHOLD,
    SHOULDER_TILT_THRESHOLD,
    DEFAULT_CENTROID_MAX_DISTANCE,
    DEFAULT_MAX_LOST_FRAMES,
  };
});

