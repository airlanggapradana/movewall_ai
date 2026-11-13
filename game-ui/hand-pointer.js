/* Temporal filtering for camera samples, independent of the Canvas frame rate. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MoveWallHandPointer = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  class HandPointer {
    constructor() { this.reset(); }

    reset() {
      this.lastSampleAt = null;
      this.target = null;
      this.position = null;
    }

    sample(x, y, now) {
      if (![x, y, now].every(Number.isFinite)) return;
      if (this.lastSampleAt !== null && now <= this.lastSampleAt) return;
      if (!this.target || now - this.lastSampleAt > 300) {
        this.target = { x, y };
        if (!this.position) this.position = { x, y };
      } else {
        const dt = (now - this.lastSampleAt) / 1000;
        const distance = Math.hypot(x - this.target.x, y - this.target.y);
        // Strong damping for landmark noise; faster response for deliberate reaches.
        const cutoff = Math.min(12, 2 + 4 * distance / dt);
        const alpha = 1 - Math.exp(-2 * Math.PI * cutoff * dt);
        this.target.x += (x - this.target.x) * alpha;
        this.target.y += (y - this.target.y) * alpha;
      }
      this.lastSampleAt = now;
    }

    advance(dt) {
      if (!this.position || !Number.isFinite(dt) || dt <= 0) return this.position;
      const alpha = 1 - Math.exp(-30 * dt);
      this.position.x += (this.target.x - this.position.x) * alpha;
      this.position.y += (this.target.y - this.position.y) * alpha;
      return this.position;
    }
  }

  function facingLeft(pointerX, targetX, previous = true, deadband = 24) {
    if (targetX < pointerX - deadband) return true;
    if (targetX > pointerX + deadband) return false;
    return previous;
  }

  return { HandPointer, facingLeft };
});
