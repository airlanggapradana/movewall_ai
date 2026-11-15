const test = require("node:test");
const assert = require("node:assert/strict");
const { parse } = require("pg-connection-string");
const { normalizeDatabaseUrl } = require("./database-url");

test("SSL aliases retain CA and hostname verification without deprecated modes", () => {
  for (const mode of ["prefer", "require", "verify-ca"]) {
    const normalized = normalizeDatabaseUrl(`postgresql://user:pass@db.example/test?sslmode=${mode}`);
    assert.equal(new URL(normalized).searchParams.get("sslmode"), "verify-full");
    const config = parse(normalized);
    assert.notEqual(config.ssl, false);
    assert.notEqual(config.ssl.rejectUnauthorized, false);
    assert.equal(config.ssl.checkServerIdentity, undefined);
  }
});

test("normalization preserves credentials, database, and other connection options", () => {
  const original = new URL("postgresql://user:p%40ss%23word@db.example:5432/clinic?sslmode=require&channel_binding=require&application_name=MoveWall");
  const actual = new URL(normalizeDatabaseUrl(original.toString()));
  for (const field of ["username", "password", "hostname", "port", "pathname"]) {
    assert.equal(actual[field], original[field]);
  }
  assert.equal(actual.searchParams.get("channel_binding"), "require");
  assert.equal(actual.searchParams.get("application_name"), "MoveWall");
});

test("explicit SSL policies and local URLs remain unchanged", () => {
  for (const suffix of ["", "?sslmode=disable", "?sslmode=verify-full", "?sslmode=require&uselibpqcompat=true"]) {
    const url = `postgresql://user:pass@localhost:5432/test${suffix}`;
    assert.equal(normalizeDatabaseUrl(url), url);
  }
});
