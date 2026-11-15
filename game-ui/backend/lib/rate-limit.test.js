const test = require("node:test");
const assert = require("node:assert/strict");
const { rateLimit } = require("./rate-limit");
test("rate limits requests by identity, sends retry time, and resets after the window", () => {
  let time = 1000, allowed = 0;
  const limiter = rateLimit({ limit: 2, windowMs: 60000, key: req => req.identity, now: () => time });
  const res = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  const send = identity => limiter({ identity }, res, () => allowed++);
  send("one"); send("one"); send("one"); assert.equal(allowed, 2); assert.equal(res.statusCode, 429); assert.equal(res.headers["Retry-After"], 60);
  send("two"); assert.equal(allowed, 3);
  time += 60000; send("one"); assert.equal(allowed, 4);
});
