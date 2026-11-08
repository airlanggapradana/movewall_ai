/**
 * MoveWall AI — Adaptive Difficulty Engine (v1.1.0)
 * Ported from adaptive_engine.py for browser & Node.js environments.
 * 
 * PRD §6.3: Adaptasi target ROM dievaluasi saat endSet(), bukan per-repetisi,
 * dengan safety ceiling keras dari terapis dan tombol darurat Stop/Nyeri (Pain Override).
 */

(function (root, factory) {
  if (typeof module === "object" && typeof module.exports === "object") {
    module.exports = factory();
  } else {
    root.MoveWallAdaptive = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VisualColor = Object.freeze({
    GREEN: "GREEN",
    YELLOW: "YELLOW",
    RED: "RED",
  });

  const RepQuality = Object.freeze({
    VALID: "VALID",
    PARTIAL: "PARTIAL",
    INVALID: "INVALID",
    NONE: "NONE",
  });

  const ROLLING_WINDOW_SIZE = 5;
  const DEFAULT_ROM_STEP_UP = 0.05;
  const DEFAULT_ROM_STEP_DOWN = 0.075;
  const FATIGUE_TEMPO_DROP_THRESHOLD = 0.40;

  class AdaptiveEngine {
    /**
     * @param {Object|string} optionsOrExerciseType
     * @param {number} [initialTargetRom]
     * @param {number} [maxSafetyCeiling]
     * @param {number} [minFunctionalRom]
     * @param {number} [repsPerSet]
     * @param {number} [romStepUp]
     * @param {number} [romStepDown]
     * @param {boolean} [adaptiveEnabled]
     */
    constructor(
      optionsOrExerciseType = "SHOULDER_FLEXION",
      initialTargetRom = 90.0,
      maxSafetyCeiling = 140.0,
      minFunctionalRom = 40.0,
      repsPerSet = 5,
      romStepUp = DEFAULT_ROM_STEP_UP,
      romStepDown = DEFAULT_ROM_STEP_DOWN,
      adaptiveEnabled = true,
    ) {
      let opts = {};
      if (typeof optionsOrExerciseType === "object" && optionsOrExerciseType !== null) {
        opts = optionsOrExerciseType;
      } else {
        opts = {
          exerciseType: optionsOrExerciseType,
          initialTargetRom,
          maxSafetyCeiling,
          minFunctionalRom,
          repsPerSet,
          romStepUp,
          romStepDown,
          adaptiveEnabled,
        };
      }

      this.exerciseType = opts.exerciseType || "SHOULDER_FLEXION";
      this.initialTargetRom = Number(opts.initialTargetRom ?? 90.0);
      this.targetRom = this.initialTargetRom;
      this.maxSafetyCeiling = Number(opts.maxSafetyCeiling ?? 140.0);
      this.minFunctionalRom = Number(opts.minFunctionalRom ?? 40.0);
      this.repsPerSet = Math.max(1, Number(opts.repsPerSet ?? 5));
      this.romStepUp = Number(opts.romStepUp ?? DEFAULT_ROM_STEP_UP);
      this.romStepDown = Number(opts.romStepDown ?? DEFAULT_ROM_STEP_DOWN);
      this.adaptiveEnabled = opts.adaptiveEnabled !== undefined ? Boolean(opts.adaptiveEnabled) : true;

      this._window = []; // Rolling window (max ROLLING_WINDOW_SIZE items)
      this._currentSetReps = []; // Current active set buffer

      this._totalValid = 0;
      this._totalPartial = 0;
      this._totalInvalid = 0;

      this._lastRepEndTime = null;
      this._repDurations = []; // Rolling durations (max ROLLING_WINDOW_SIZE items)
      this._fatigueOverrideActive = false;
      this._painOverrideActive = false;

      this._lastRepStatus = RepQuality.NONE;
      this._currentSetConsistencyBonus = 0.0;
    }

    /**
     * Rekam satu rep ke buffer set saat ini. TIDAK men-trigger adaptasi mid-set.
     * @param {string} quality - VALID | PARTIAL | INVALID
     * @param {number} peakAngle - Sudut puncak (derajat)
     * @param {number} [repDurationSeconds] - Durasi rep (detik)
     */
    recordRep(quality, peakAngle, repDurationSeconds = null) {
      const now = typeof performance !== "undefined" && performance.now
        ? performance.now() / 1000
        : Date.now() / 1000;

      let dur = repDurationSeconds;
      if (dur === null || dur === undefined) {
        dur = this._lastRepEndTime !== null ? Math.max(0.2, now - this._lastRepEndTime) : 2.0;
      }
      this._lastRepEndTime = now;

      const record = {
        quality,
        peakAngle: Number(peakAngle),
        targetRomAtTime: this.targetRom,
        durationSeconds: dur,
      };

      this._currentSetReps.push(record);
      this._repDurations.push(dur);
      if (this._repDurations.length > ROLLING_WINDOW_SIZE) {
        this._repDurations.shift();
      }

      if (quality === RepQuality.VALID) {
        this._totalValid += 1;
      } else if (quality === RepQuality.PARTIAL) {
        this._totalPartial += 1;
      } else {
        this._totalInvalid += 1;
      }

      this._lastRepStatus = quality;
    }

    /**
     * Akhiri set dan jalankan evaluasi adaptasi kesulitan (PRD 6.3).
     * @returns {Object} Ringkasan set
     */
    endSet() {
      for (const rec of this._currentSetReps) {
        this._window.push(rec);
        if (this._window.length > ROLLING_WINDOW_SIZE) {
          this._window.shift();
        }
      }

      this._currentSetConsistencyBonus = this._computeConsistencyBonus(this._currentSetReps);
      const targetBefore = this.targetRom;

      if (this._window.length >= ROLLING_WINDOW_SIZE && this.adaptiveEnabled) {
        this._runAdaptation();
      }

      const [sr, arar] = this._computeRollingMetrics();

      const summary = {
        reps_in_set: this._currentSetReps.length,
        success_rate: Math.round(sr * 10000) / 10000,
        arar: Math.round(arar * 10000) / 10000,
        consistency_bonus: Math.round(this._currentSetConsistencyBonus * 10000) / 10000,
        target_rom_before: Math.round(targetBefore * 100) / 100,
        target_rom_after: Math.round(this.targetRom * 100) / 100,
        adaptation_applied: Math.round((this.targetRom - targetBefore) * 100) / 100,
        fatigue_override: this._fatigueOverrideActive,
        pain_override: this._painOverrideActive,
      };

      this._currentSetReps = [];
      return summary;
    }

    /**
     * Aktifkan pain override saat pasien/terapis menekan tombol Stop/Nyeri.
     * Langsung turunkan target ke minFunctionalRom (PRD §6.3.5 & Risk #9).
     */
    triggerPainOverride() {
      this._painOverrideActive = true;
      this._fatigueOverrideActive = true;
      this.targetRom = this.minFunctionalRom;
    }

    /**
     * Reset status override nyeri (dilakukan oleh terapis).
     */
    resetPainOverride() {
      this._painOverrideActive = false;
      this._fatigueOverrideActive = false;
    }

    /**
     * Hasilkan array target ROM bertahap untuk gim (misal 10 target Apple Archer).
     * Rentang dari target awal hingga batas aman (Safety Ceiling).
     * @param {number} [count=10]
     * @returns {number[]}
     */
    generateTargets(count = 10) {
      const n = Math.max(1, count);
      if (n === 1) return [Math.round(this.targetRom)];

      const start = Math.min(this.targetRom, this.maxSafetyCeiling);
      const end = this.maxSafetyCeiling;
      const step = (end - start) / (n - 1);

      const targets = [];
      for (let i = 0; i < n; i++) {
        const val = Math.round(start + step * i);
        const clamped = Math.max(this.minFunctionalRom, Math.min(this.maxSafetyCeiling, val));
        targets.push(clamped);
      }
      return targets;
    }

    /**
     * Hasilkan payload JSON lengkap per frame sesuai PRD Request spec.
     */
    generatePayload(frameId, currentAngle, fsmState, repJustCompleted = false) {
      const [sr, arar] = this._computeRollingMetrics();
      const metrics = {
        valid_reps: this._totalValid,
        partial_reps: this._totalPartial,
        target_rom: Math.round(this.targetRom * 100) / 100,
        success_rate: Math.round(sr * 10000) / 10000,
        arar: Math.round(arar * 10000) / 10000,
        consistency_bonus: Math.round(this._currentSetConsistencyBonus * 10000) / 10000,
        reps_in_current_set: this._currentSetReps.length,
      };

      const repStatusStr = repJustCompleted ? this._lastRepStatus : RepQuality.NONE;
      const audioCue = this._determineAudioCue(fsmState, repJustCompleted);
      const color = this._determineVisualColor(currentAngle, fsmState, sr);

      const payloadObj = {
        frame_id: Number(frameId),
        exercise_type: this.exercise_type,
        current_angle: Math.round(Number(currentAngle) * 100) / 100,
        state: fsmState,
        rep_status: repStatusStr,
        metrics,
        audio_cue: audioCue,
        visual_overlay_color: color,
      };

      return {
        ...payloadObj,
        toDict() {
          return payloadObj;
        },
        toJSON(indent = null) {
          return JSON.stringify(payloadObj, null, indent);
        },
      };
    }

    getSessionSummary() {
      const [sr, arar] = this._computeRollingMetrics();
      return {
        total_reps: this._totalValid + this._totalPartial + this._totalInvalid,
        valid_reps: this._totalValid,
        partial_reps: this._totalPartial,
        invalid_reps: this._totalInvalid,
        final_target_rom: Math.round(this.targetRom * 100) / 100,
        success_rate_last5: Math.round(sr * 10000) / 10000,
        arar_last5: Math.round(arar * 10000) / 10000,
        fatigue_override_active: this._fatigueOverrideActive,
        pain_override_active: this._painOverrideActive,
      };
    }

    getCurrentSetCount() {
      return this._currentSetReps.length;
    }

    // ─── Internal Adaptation Logic ─────────────────────────────────────────────

    _runAdaptation() {
      if (this._painOverrideActive) {
        this.targetRom = this.minFunctionalRom;
        return;
      }

      if (this._checkFatigue()) {
        this._fatigueOverrideActive = true;
        this.targetRom = this.minFunctionalRom;
        return;
      }

      this._fatigueOverrideActive = false;
      const [sr, arar] = this._computeRollingMetrics();

      if (sr >= 0.90 && arar >= 1.05) {
        // PRD 6.3.3a: naik +5%, dibatasi safety ceiling
        this.targetRom = Math.min(
          this.targetRom * (1.0 + this.romStepUp),
          this.maxSafetyCeiling,
        );
      } else if (sr < 0.70) {
        // PRD 6.3.3c: turun -7.5%, dibatasi minFunctionalRom
        this.targetRom = Math.max(
          this.targetRom * (1.0 - this.romStepDown),
          this.minFunctionalRom,
        );
      }
      // SR 70-90%: flow zone, tidak ada perubahan (PRD 6.3.3b)
    }

    _computeRollingMetrics() {
      if (!this._window || this._window.length === 0) {
        return [0.0, 0.0];
      }
      const n = this._window.length;
      const validCount = this._window.filter((r) => r.quality === RepQuality.VALID).length;
      const sr = validCount / n;
      const arar = this._window.reduce((acc, r) => {
        return acc + (r.targetRomAtTime > 0 ? r.peakAngle / r.targetRomAtTime : 0);
      }, 0) / n;
      return [sr, arar];
    }

    _computeConsistencyBonus(reps) {
      if (!reps || reps.length < 2) {
        return 1.0;
      }
      const angles = reps.map((r) => r.peakAngle);
      const mean = angles.reduce((a, b) => a + b, 0) / angles.length;
      const variance = angles.reduce((a, b) => a + (b - mean) ** 2, 0) / angles.length;
      const stdDev = Math.sqrt(variance);
      const target = this.targetRom > 0 ? this.targetRom : 90.0;
      return Math.max(0.0, Math.min(1.0, 1.0 - (stdDev / target)));
    }

    _checkFatigue() {
      if (this._repDurations.length < ROLLING_WINDOW_SIZE) {
        return false;
      }
      const durs = this._repDurations;
      const earlyAvg = (durs[0] + durs[1] + durs[2]) / 3.0;
      const lateAvg = (durs[3] + durs[4]) / 2.0;
      if (earlyAvg <= 0) return false;
      return (lateAvg - earlyAvg) / earlyAvg > FATIGUE_TEMPO_DROP_THRESHOLD;
    }

    _determineAudioCue(fsmState, repJustCompleted) {
      if (this._painOverrideActive) {
        return "Sesi dihentikan. Istirahat dan hubungi terapis Anda.";
      }
      if (this._fatigueOverrideActive) {
        return "Terdeteksi kelelahan. Target diturunkan. Istirahat sejenak.";
      }
      if (repJustCompleted) {
        if (this._lastRepStatus === RepQuality.VALID) {
          return "Bagus sekali! Pertahankan!";
        } else if (this._lastRepStatus === RepQuality.PARTIAL) {
          return "Hampir! Coba angkat sedikit lebih tinggi.";
        } else {
          return "Gerakan kurang. Rentangkan lebih jauh.";
        }
      }
      if (fsmState === "ASCENDING") {
        return "Angkat lebih tinggi!";
      }
      if (fsmState === "PEAK_HOLD") {
        return "Tahan posisi ini!";
      }
      if (fsmState === "DESCENDING") {
        return "Turunkan perlahan.";
      }
      return null;
    }

    _determineVisualColor(currentAngle, fsmState, sr) {
      if (this._painOverrideActive || this._fatigueOverrideActive) {
        return VisualColor.RED;
      }
      if (fsmState === "RESTING") {
        return sr >= 0.70 ? VisualColor.GREEN : VisualColor.YELLOW;
      }
      const ratio = this.targetRom > 0 ? currentAngle / this.targetRom : 0.0;
      if (ratio >= 1.0) {
        return VisualColor.GREEN;
      } else if (ratio >= 0.70) {
        return VisualColor.YELLOW;
      }
      return VisualColor.RED;
    }
  }

  return {
    AdaptiveEngine,
    RepQuality,
    VisualColor,
    ROLLING_WINDOW_SIZE,
    DEFAULT_ROM_STEP_UP,
    DEFAULT_ROM_STEP_DOWN,
    FATIGUE_TEMPO_DROP_THRESHOLD,
  };
});

