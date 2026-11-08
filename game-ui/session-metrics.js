/**
 * MoveWall AI — perekam metrik sesi (dipakai Misi 1 dan Misi 2).
 *
 * Merekam dari estimasi kamera selama sesi berjalan:
 *  - maxRomDeg           ROM maksimum yang tercapai tanpa kompensasi bahu (derajat)
 *  - accuracyPercent     % frame di dalam jendela target, dari seluruh frame yang
 *                        lengannya berada dekat target (±NEAR_TARGET_DEG)
 *  - compensationEvents  jumlah episode kompensasi (bahu terangkat)
 *
 * Ini estimasi kamera 2D, bukan pengukuran goniometer yang sudah divalidasi.
 */
(function (root) {
  "use strict";

  const NEAR_TARGET_DEG = 14; // sama dengan ambang warna kuning pada gim
  const MIN_FRAMES = 15; // di bawah ini data dianggap terlalu sedikit
  const EPISODE_GAP_MS = 600; // jeda minimum antar episode kompensasi

  function createRecorder() {
    let state;

    function reset() {
      state = {
        frames: 0,
        maxRom: 0,
        nearFrames: 0,
        inWindowFrames: 0,
        compensationEvents: 0,
        compensating: false,
        lastCompensationAt: -Infinity,
      };
    }

    /**
     * Dipanggil sekali per frame pose yang valid saat gim berjalan.
     * @param {object} s
     * @param {number} s.angle        sudut ROM klinis saat ini (derajat)
     * @param {number} s.targetRom    target ROM aktif
     * @param {number} s.under        toleransi di bawah target
     * @param {number} s.over         toleransi di atas target
     * @param {boolean} s.compensation bahu terangkat pada frame ini
     * @param {number} s.now          timestamp ms (performance.now())
     */
    function sample(s) {
      if (!state || !Number.isFinite(s.angle)) return;
      state.frames += 1;

      if (s.compensation) {
        if (
          !state.compensating &&
          s.now - state.lastCompensationAt >= EPISODE_GAP_MS
        ) {
          state.compensationEvents += 1;
        }
        state.compensating = true;
        state.lastCompensationAt = s.now;
        // Frame terkompensasi tidak dihitung sebagai ROM maupun akurasi.
        return;
      }
      state.compensating = false;

      if (s.angle > state.maxRom) state.maxRom = s.angle;

      if (Number.isFinite(s.targetRom)) {
        if (Math.abs(s.angle - s.targetRom) <= NEAR_TARGET_DEG) {
          state.nearFrames += 1;
          if (
            s.angle >= s.targetRom - s.under &&
            s.angle <= s.targetRom + s.over
          ) {
            state.inWindowFrames += 1;
          }
        }
      }
    }

    /** Hasil ringkas; nilai null bila datanya tidak cukup untuk dipercaya. */
    function snapshot() {
      if (!state || state.frames < MIN_FRAMES) {
        return { maxRomDeg: null, accuracyPercent: null, compensationEvents: null };
      }
      return {
        maxRomDeg: Math.round(state.maxRom * 10) / 10,
        accuracyPercent:
          state.nearFrames >= MIN_FRAMES
            ? Math.round((state.inWindowFrames / state.nearFrames) * 100)
            : null,
        compensationEvents: state.compensationEvents,
      };
    }

    reset();
    return { reset, sample, snapshot };
  }

  const api = { createRecorder, NEAR_TARGET_DEG, MIN_FRAMES };
  root.MoveWallMetrics = createRecorder();
  root.MoveWallMetricsFactory = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

