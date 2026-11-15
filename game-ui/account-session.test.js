const test = require("node:test");
const assert = require("node:assert/strict");
const { routeFor, apiBaseFor } = require("./account-session");
test("session routing keeps review and clinical roles separate", () => {
  for (const applicationStatus of ["PENDING", "NEEDS_REVISION", "REJECTED", "SUSPENDED"]) {
    assert.equal(routeFor({ role: "THERAPIST", isActive: true, applicationStatus }), "application.html");
  }
  assert.equal(routeFor({ role: "THERAPIST", isActive: true, applicationStatus: "APPROVED" }), "dashboard.html");
  assert.equal(routeFor({ role: "THERAPIST", isActive: false, applicationStatus: "APPROVED" }), "application.html");
  assert.equal(routeFor({ role: "ADMIN", isActive: true, applicationStatus: "APPROVED" }), "admin.html");
  assert.equal(routeFor({ role: "ADMIN", isActive: false }), "application.html");
});
test("hosted account requests use the website API proxy while explicit development backends remain available", () => {
  assert.equal(apiBaseFor({ hostname: "movewall-ai.vercel.app", origin: "https://movewall-ai.vercel.app" }), "https://movewall-ai.vercel.app/api");
  assert.equal(apiBaseFor({ hostname: "localhost", origin: "http://localhost:3000" }), "http://localhost:3001/api");
  assert.equal(apiBaseFor({ hostname: "localhost", origin: "http://localhost:3000", useLocal: "false" }), "https://movewall-backend-production.up.railway.app/api");
  assert.equal(apiBaseFor({ hostname: "localhost", origin: "http://localhost:3000", override: "http://127.0.0.1:4567/" }), "http://127.0.0.1:4567/api");
});
test("network failures and unreadable proxy responses report an uncertain result without resending a POST", async () => {
  const vm = require("node:vm"), fs = require("node:fs");
  for (const fetchImpl of [async () => { throw new TypeError("Failed to fetch"); }, async () => new Response("Bad gateway", { status: 502 })]) {
    let calls = 0;
    const context = { window: { location: { hostname: "movewall-ai.vercel.app", origin: "https://movewall-ai.vercel.app", replace() {} }, fetch: async (...args) => { calls++; return fetchImpl(...args); } }, sessionStorage: { getItem: key => key === "mw_token" ? "test-token" : null } };
    vm.runInNewContext(fs.readFileSync(require.resolve("./account-session"), "utf8"), context);
    await assert.rejects(context.window.MoveWallSession.request("/admin/applications/1/decision", { method: "POST", body: "{}" }), { code: "NETWORK_ERROR" });
    assert.equal(calls, 1);
  }
});
