const test = require("node:test");
const assert = require("node:assert/strict");
const { decideApplication, resubmitApplication } = require("./applications");
const { canAccessClinical, createAuthentication } = require("./account-access");
const { createStore } = require("../test-support/application-store");
const admin = { id: 99, role: "ADMIN", isActive: true, applicationStatus: "APPROVED" };
const profile = { name: "Rina", username: "rina", email: "rina@klinik.id", clinicName: "Klinik Rina" };
const checklist = { identity: true, clinic: true, profession: true };
function fixture(status = "PENDING") { return createStore([{ id: 1, ...profile, role: "THERAPIST", isActive: status !== "SUSPENDED", applicationStatus: status, applicationVersion: 0 }]); }
const decision = (prisma, action, extra = {}) => decideApplication({ prisma, actor: admin, id: 1, body: { action, expectedVersion: 0, reason: "Alasan yang terlihat pendaftar", checklist, ...extra } });

test("approval, suspension and restoration are audited and do not create subscriptions", async () => {
  const prisma = fixture();
  const approved = await decision(prisma, "APPROVE"); assert.equal(canAccessClinical(approved), true);
  const suspended = await decision(prisma, "SUSPEND", { expectedVersion: 1 }); assert.equal(canAccessClinical(suspended), false);
  const restored = await decision(prisma, "RESTORE", { expectedVersion: 2 }); assert.equal(canAccessClinical(restored), true);
  assert.deepEqual(prisma.state.decisions.map(row => row.toStatus), ["APPROVED", "SUSPENDED", "APPROVED"]);
  assert.equal(prisma.state.notifications.length, 3);
  assert.match(prisma.state.notifications[2].subject, /dipulihkan/);
});
test("revision resubmits only the owner's profile and resets review", async () => {
  const prisma = fixture(); await decision(prisma, "REQUEST_REVISION");
  const result = await resubmitApplication({ prisma, id: 1, body: { ...profile, clinicName: "Klinik Baru", expectedVersion: 1, role: "ADMIN", isActive: false, applicationStatus: "APPROVED", password: "injected" } });
  assert.equal(result.applicationStatus, "PENDING"); assert.equal(result.role, "THERAPIST"); assert.equal(result.isActive, true);
  assert.equal(result.clinicName, "Klinik Baru"); assert.equal(result.reviewedAt, null);
  assert.equal(prisma.state.accounts[0].password, undefined);
  await assert.rejects(resubmitApplication({ prisma, id: 1, body: { ...profile, expectedVersion: 2 } }), { status: 403 });
});
test("approved and rejected accounts cannot change identity through resubmission", async () => {
  for (const status of ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]) {
    await assert.rejects(resubmitApplication({ prisma: fixture(status), id: 1, body: { ...profile, expectedVersion: 0 } }), { status: 403 });
  }
});
test("decisions validate actor, transition, checklist, version and reason", async () => {
  const prisma = fixture();
  for (const action of ["REQUEST_REVISION", "REJECT"]) await assert.rejects(decision(prisma, action, { reason: " " }), { status: 400 });
  await assert.rejects(decision(prisma, "APPROVE", { checklist: {} }), { status: 400 });
  await assert.rejects(decision(prisma, "RESTORE"), { status: 409 });
  await assert.rejects(decision(prisma, "toString"), { status: 400 });
  await assert.rejects(decision(prisma, "APPROVE", { expectedVersion: 8 }), { status: 409 });
  await assert.rejects(decideApplication({ prisma, actor: { ...admin, id: 1 }, id: 1, body: { action: "APPROVE" } }), { status: 403 });
  await assert.rejects(decideApplication({ prisma, actor: { ...admin, role: "THERAPIST" }, id: 1, body: {} }), { status: 403 });
  assert.equal(prisma.state.decisions.length, 0);
});
test("rejection can be reopened for review with a visible reason", async () => {
  const prisma = fixture(); await decision(prisma, "REJECT");
  const reopened = await decision(prisma, "REOPEN", { expectedVersion: 1 });
  assert.equal(reopened.applicationStatus, "PENDING");
});
test("concurrent reviews and resubmissions accept one current version only", async () => {
  const prisma = fixture();
  const results = await Promise.allSettled([decision(prisma, "APPROVE"), decision(prisma, "REJECT")]);
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
  assert.equal(prisma.state.decisions.length, 1); assert.equal(prisma.state.notifications.length, 1);
  const revision = fixture("NEEDS_REVISION");
  const resubmits = await Promise.allSettled([1, 2].map(() => resubmitApplication({ prisma: revision, id: 1, body: { ...profile, expectedVersion: 0 } })));
  assert.equal(resubmits.filter(row => row.status === "fulfilled").length, 1);
});
test("outbox persistence failure rolls back the status and history", async () => {
  const prisma = fixture(); prisma.notificationOutbox.create = async () => { throw new Error("storage unavailable"); };
  await assert.rejects(decision(prisma, "APPROVE"), /storage unavailable/);
  assert.equal(prisma.state.accounts[0].applicationStatus, "PENDING"); assert.equal(prisma.state.decisions.length, 0);
});
test("an existing JWT re-reads current account access and ignores its role claim", async () => {
  const prisma = fixture("APPROVED");
  const authenticate = createAuthentication({ prisma, jwt: { verify: () => ({ id: 1, role: "ADMIN" }) }, secret: "test" });
  const req = { headers: { authorization: "Bearer token" } };
  const res = { status() { return this; }, json() { throw new Error("unexpected auth rejection"); } };
  await authenticate(req, res, () => {}); assert.equal(req.therapist.role, "THERAPIST"); assert.equal(canAccessClinical(req.therapist), true);
  await decision(prisma, "SUSPEND"); await authenticate(req, res, () => {}); assert.equal(canAccessClinical(req.therapist), false);
  for (const applicationStatus of ["PENDING", "NEEDS_REVISION", "REJECTED", "SUSPENDED"]) assert.equal(canAccessClinical({ ...req.therapist, isActive: true, applicationStatus }), false);
  assert.equal(canAccessClinical({ ...admin, applicationStatus: "APPROVED" }), false);
});
