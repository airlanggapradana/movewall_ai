/**
 * MoveWall AI — Offline Sync Queue Module (Fitur 8: PWA Offline)
 * ══════════════════════════════════════════════════════════════════════════════
 * Provides a resilient offline queue for clinical assessments and tele-rehab
 * sessions when clinic or home internet connection is unstable or disconnected.
 * Guarantees idempotent zero-data-loss delivery via clientSessionId deduplication.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MoveWallSyncQueue = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STORAGE_KEY = "mw_offline_sync_queue";

  function generateUUID() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "sess_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 9);
  }

  function getStorage() {
    try {
      if (typeof localStorage !== "undefined") return localStorage;
    } catch (_) {}
    return null;
  }

  function loadQueue() {
    const storage = getStorage();
    if (!storage) return [];
    try {
      const data = storage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn("[MoveWall SyncQueue] Failed to parse offline queue:", e);
      return [];
    }
  }

  function saveQueue(queue) {
    const storage = getStorage();
    if (!storage) return false;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(queue));
      return true;
    } catch (e) {
      console.error("[MoveWall SyncQueue] Failed to persist offline queue:", e);
      return false;
    }
  }

  /**
   * Enqueues an assessment payload to be synced when connectivity is available.
   * @param {Object} item
   * @param {string} item.endpoint - Full or relative URL
   * @param {Object} item.payload - Assessment data body
   * @param {string} [item.token] - Optional JWT auth token
   * @returns {Object} Enqueued record with clientSessionId
   */
  function enqueue(item) {
    if (!item || !item.payload) {
      throw new Error("Invalid sync item: payload is required");
    }

    const queue = loadQueue();
    const clientSessionId = item.clientSessionId || item.payload.clientSessionId || generateUUID();
    item.payload.clientSessionId = clientSessionId;

    const record = {
      clientSessionId,
      endpoint: item.endpoint,
      payload: item.payload,
      token: item.token || null,
      queuedAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
    };

    // Replace if already in queue by clientSessionId, else push
    const existingIdx = queue.findIndex((q) => q.clientSessionId === clientSessionId);
    if (existingIdx >= 0) {
      queue[existingIdx] = record;
    } else {
      queue.push(record);
    }

    saveQueue(queue);
    console.info(`[MoveWall SyncQueue] Enqueued assessment [${clientSessionId}]. Queue size: ${queue.length}`);
    return record;
  }

  function getPendingCount() {
    return loadQueue().length;
  }

  function getQueue() {
    return loadQueue();
  }

  function remove(clientSessionId) {
    const queue = loadQueue();
    const filtered = queue.filter((item) => item.clientSessionId !== clientSessionId);
    saveQueue(filtered);
    return filtered.length;
  }

  function clear() {
    const storage = getStorage();
    if (storage) storage.removeItem(STORAGE_KEY);
  }

  /**
   * Attempts to drain all items in the queue by posting to their endpoints.
   * @param {Object} [options]
   * @param {Function} [options.fetchFn] - Custom fetch implementation
   * @returns {Promise<{synced: number, failed: number, remaining: number}>}
   */
  async function drainQueue(options = {}) {
    const fetchFn = options.fetchFn || (typeof fetch !== "undefined" ? fetch : null);
    if (!fetchFn) {
      return { synced: 0, failed: 0, remaining: getPendingCount() };
    }

    const queue = loadQueue();
    if (queue.length === 0) {
      return { synced: 0, failed: 0, remaining: 0 };
    }

    let synced = 0;
    let failed = 0;

    // Process items sequentially to avoid server concurrency bursts
    for (const item of [...queue]) {
      try {
        const headers = { "Content-Type": "application/json" };
        if (item.token) {
          headers["Authorization"] = `Bearer ${item.token}`;
        }

        const res = await fetchFn(item.endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(item.payload),
        });

        // 200 (deduplicated) or 201 (created) are both successful completions
        if (res.ok) {
          remove(item.clientSessionId);
          synced++;
          console.info(`[MoveWall SyncQueue] Successfully synced session [${item.clientSessionId}]`);
        } else {
          item.attempts = (item.attempts || 0) + 1;
          item.lastError = `HTTP ${res.status}`;
          failed++;
        }
      } catch (err) {
        item.attempts = (item.attempts || 0) + 1;
        item.lastError = err.message || "Network Error";
        failed++;
        // If network error, stop draining remaining items
        break;
      }
    }

    // Persist any updated attempt counts or errors on remaining items
    saveQueue(queue.filter((q) => loadQueue().some((curr) => curr.clientSessionId === q.clientSessionId)));

    return {
      synced,
      failed,
      remaining: getPendingCount(),
    };
  }

  /**
   * Initializes automatic listener for 'online' event and periodic drain.
   */
  function initAutoSync(onSyncSuccess = null) {
    if (typeof window === "undefined") return;

    const triggerSync = async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const count = getPendingCount();
      if (count > 0) {
        console.info(`[MoveWall SyncQueue] Online connection detected. Syncing ${count} pending sessions...`);
        const result = await drainQueue();
        if (result.synced > 0 && typeof onSyncSuccess === "function") {
          onSyncSuccess(result);
        }
      }
    };

    window.addEventListener("online", triggerSync);
    // Periodic check every 30 seconds
    setInterval(triggerSync, 30000);
    // Initial check on load
    setTimeout(triggerSync, 1500);
  }

  return {
    enqueue,
    drainQueue,
    getPendingCount,
    getQueue,
    remove,
    clear,
    initAutoSync,
    generateUUID,
    STORAGE_KEY,
  };
});
