const test = require("node:test");
const assert = require("node:assert/strict");

// Polyfill mock localStorage for Node.js test environment
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
};

const SyncQueue = require("./sync-queue.js");

test("SyncQueue: enqueues items with unique clientSessionId", () => {
  SyncQueue.clear();
  assert.equal(SyncQueue.getPendingCount(), 0);

  const item1 = SyncQueue.enqueue({
    endpoint: "/api/assessment",
    payload: { patientName: "Test 1", sessionScore: 300 },
  });

  assert.ok(item1.clientSessionId);
  assert.equal(SyncQueue.getPendingCount(), 1);

  const queue = SyncQueue.getQueue();
  assert.equal(queue[0].payload.sessionScore, 300);
});

test("SyncQueue: drains queue when mock fetch succeeds", async () => {
  SyncQueue.clear();

  SyncQueue.enqueue({
    clientSessionId: "sess-abc-123",
    endpoint: "/api/assessment",
    payload: { patientName: "Patient A", sessionScore: 400 },
  });
  SyncQueue.enqueue({
    clientSessionId: "sess-xyz-789",
    endpoint: "/api/home-session/MW-HOME-001/assessment",
    payload: { patientName: "Patient B", sessionScore: 500 },
  });

  assert.equal(SyncQueue.getPendingCount(), 2);

  // Mock fetch that always returns 201 Created
  const mockFetch = async (url, options) => {
    return {
      ok: true,
      status: 201,
      json: async () => ({ message: "Created" }),
    };
  };

  const result = await SyncQueue.drainQueue({ fetchFn: mockFetch });
  assert.equal(result.synced, 2);
  assert.equal(result.failed, 0);
  assert.equal(result.remaining, 0);
  assert.equal(SyncQueue.getPendingCount(), 0);
});

test("SyncQueue: retains items on network failure and stops cascading", async () => {
  SyncQueue.clear();

  SyncQueue.enqueue({
    clientSessionId: "sess-fail-1",
    endpoint: "/api/assessment",
    payload: { patientName: "Patient C" },
  });

  // Mock fetch that throws a network connection error
  const mockFailingFetch = async () => {
    throw new Error("Failed to fetch: Network is offline");
  };

  const result = await SyncQueue.drainQueue({ fetchFn: mockFailingFetch });
  assert.equal(result.synced, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.remaining, 1);
  assert.equal(SyncQueue.getPendingCount(), 1);

  const queue = SyncQueue.getQueue();
  assert.equal(queue[0].attempts, 1);
  assert.ok(queue[0].lastError.includes("offline"));
});

