const test = require("node:test");
const assert = require("node:assert/strict");
const { monthRange, applicationFilters, statusCounts } = require("./admin-dashboard");
test("month reporting uses WITA boundaries including year changes", () => {
  const range = monthRange("2026-01");
  assert.equal(range.start.toISOString(), "2025-12-31T16:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-01-31T16:00:00.000Z");
  assert.equal(range.previous.toISOString(), "2025-11-30T16:00:00.000Z");
  assert.equal(monthRange(undefined, new Date("2026-10-31T17:00:00Z")).month, "2026-11");
  for (const invalid of ["2026-00", "2026-13", "2026-1", "bad", ["2026-11"], {}]) assert.throws(() => monthRange(invalid));
});
test("combined filters keep therapists scoped and status facets independent", () => {
  const result = applicationFilters({ status: "SUSPENDED", q: "  Klinik Rina ", specialization: "Fisioterapi", month: "2026-11", role: "ADMIN" });
  assert.equal(result.where.role, "THERAPIST"); assert.equal(result.base.applicationStatus, undefined);
  assert.equal(result.where.applicationStatus, "SUSPENDED");
  assert.equal(result.base.specialization, "Fisioterapi");
  assert.equal(result.base.OR[0].name.contains, "Klinik Rina");
  assert.equal(result.base.submittedAt.gte.toISOString(), "2026-10-31T16:00:00.000Z");
  for (const query of [{ status: "ADMIN" }, { q: ["rina"] }, { specialization: {} }, { month: "2026-13" }]) assert.throws(() => applicationFilters(query));
  assert.deepEqual(statusCounts([{ applicationStatus: "PENDING", _count: { _all: 2 } }]), { PENDING: 2, NEEDS_REVISION: 0, APPROVED: 0, REJECTED: 0, SUSPENDED: 0 });
});
