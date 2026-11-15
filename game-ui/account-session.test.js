const test = require("node:test");
const assert = require("node:assert/strict");
const { routeFor } = require("./account-session");
test("session routing keeps review and clinical roles separate", () => {
  for (const applicationStatus of ["PENDING", "NEEDS_REVISION", "REJECTED", "SUSPENDED"]) {
    assert.equal(routeFor({ role: "THERAPIST", isActive: true, applicationStatus }), "application.html");
  }
  assert.equal(routeFor({ role: "THERAPIST", isActive: true, applicationStatus: "APPROVED" }), "dashboard.html");
  assert.equal(routeFor({ role: "THERAPIST", isActive: false, applicationStatus: "APPROVED" }), "application.html");
  assert.equal(routeFor({ role: "ADMIN", isActive: true, applicationStatus: "APPROVED" }), "admin.html");
  assert.equal(routeFor({ role: "ADMIN", isActive: false }), "application.html");
});
