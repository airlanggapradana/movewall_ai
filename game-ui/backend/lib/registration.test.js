const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { validateRegistration } = require("./registration-validation");
const { existsSync } = require("node:fs");
const frontendContractPath = require("node:path").resolve(__dirname, "../../registration-validation.js");
const { createRegistrationHandler } = require("./registration");

const valid = {
  name: "  Rina Setiawati  ", username: "  rina  ",
  password: "  rahasia-12345  ", email: "rina@klinik.id", clinicName: " Klinik Rina ",
};

test("independently deployed frontend and backend enforce the same registration contract", {
  skip: !existsSync(frontendContractPath), // A backend-only deployment has no frontend checkout.
}, () => {
  const { validateRegistration: validateFrontend } = require(frontendContractPath);
  for (const body of [valid, {}, null, [], { ...valid, email: "INVALID" },
    { ...valid, email: " RINA@KLINIK.ID ", phoneNumber: " " },
    { ...valid, username: [], password: "a".repeat(73) },
    { ...valid, name: false, specialization: 123, inviteCode: {} },
    { ...valid, password: "🔐".repeat(19) }]) {
    assert.deepEqual(validateFrontend(body), validateRegistration(body));
  }
});

function fixture({ create } = {}) {
  const calls = [];
  const handler = createRegistrationHandler({
    prisma: { async $transaction(fn) { return fn(this); },
      applicationDecision: { async create({ data }) { return { id: "event-1", ...data }; } },
      notificationOutbox: { async create() {} },
      therapist: { async create(args) {
      calls.push(args);
      if (create) return create(args);
      return { id: 1, name: args.data.name, username: args.data.username, role: args.data.role, email: args.data.email };
    } } },
    bcrypt,
  });
  return {
    calls,
    async request(body) {
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
      await handler({ body }, res);
      return res;
    },
  };
}

test("normalizes Therapist fields and leaves optional fields null", () => {
  const { data, errors } = validateRegistration({ ...valid, role: "ADMIN", id: 50, isActive: false });
  assert.deepEqual(errors, {});
  assert.deepEqual(data, {
    name: "Rina Setiawati", username: "rina", password: valid.password,
    email: valid.email, clinicName: "Klinik Rina", specialization: null, licenseNumber: null, phoneNumber: null,
  });
});

test("validates required strings, optional field types, and email before Prisma", () => {
  for (const body of [null, [], {}, { ...valid, name: " " }, { ...valid, username: 10 },
    { ...valid, email: "invalid@" }, { ...valid, specialization: [] }, { ...valid, phoneNumber: 123 }]) {
    assert.ok(Object.keys(validateRegistration(body).errors).length);
  }
  const result = validateRegistration({ ...valid, email: " RINA@KLINIK.ID ", licenseNumber: " SIP-1 " });
  assert.equal(result.data.email, "rina@klinik.id");
  assert.equal(result.data.licenseNumber, "SIP-1");
});

test("rejects passwords shorter than 10 characters and longer than bcrypt's 72-byte limit", () => {
  for (const password of [null, 1234567890, "123456789", "a".repeat(73), "🔐".repeat(19)]) {
    assert.ok(validateRegistration({ ...valid, password }).errors.password);
  }
  assert.equal(validateRegistration({ ...valid, password: "a".repeat(72) }).errors.password, undefined);
});

test("creates a Therapist with hashed password, schema defaults, and a safe select", async () => {
  const app = fixture();
  const res = await app.request({ ...valid, passwordConfirm: valid.password, role: "USER", isActive: false });
  assert.equal(res.statusCode, 201);
  assert.equal(app.calls.length, 1);
  const { data, select } = app.calls[0];
  assert.equal(data.role, "THERAPIST");
  assert.equal(data.email, valid.email);
  assert.equal(data.isActive, true);
  assert.equal(data.applicationStatus, "PENDING");
  assert.ok(await bcrypt.compare(valid.password, data.password));
  for (const key of ["inviteCode", "passwordConfirm", "id", "createdAt"]) assert.equal(key in data, false);
  assert.equal(select.password, undefined);
  assert.equal(select.licenseNumber, true);
  assert.equal(select.phoneNumber, true);
  assert.equal(res.body.therapist.password, undefined);
});

test("stores all optional clinical fields as normalized strings", async () => {
  const app = fixture();
  await app.request({ ...valid, email: " RINA@KLINIK.ID ", specialization: " Fisioterapi ", licenseNumber: " SIP-1 ", phoneNumber: " +628123456789 " });
  const data = app.calls[0].data;
  assert.equal(data.email, "rina@klinik.id");
  assert.equal(data.specialization, "Fisioterapi");
  assert.equal(data.licenseNumber, "SIP-1");
  assert.equal(data.phoneNumber, "+628123456789");
});

test("registration needs email and clinic but no invitation", async () => {
  const app = fixture();
  for (const field of ["email", "clinicName"]) {
    const res = await app.request({ ...valid, [field]: " " });
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.errors[field]);
  }
  assert.equal(app.calls.length, 0);
  assert.equal((await app.request(valid)).statusCode, 201);
});

test("invalid data returns field errors without a database write", async () => {
  const app = fixture();
  const res = await app.request({ ...valid, name: " ", email: "bad-address", password: "short" });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(Object.keys(res.body.errors), ["name", "email", "password"]);
  assert.equal(app.calls.length, 0);
});

for (const field of ["username", "email"]) {
  test(`Prisma ${field} uniqueness violations return 409 and a field error`, async () => {
    const app = fixture({ create() { throw { code: "P2002", meta: { target: [field] } }; } });
    const res = await app.request(valid);
    assert.equal(res.statusCode, 409);
    assert.ok(res.body.errors[field]);
  });
}
