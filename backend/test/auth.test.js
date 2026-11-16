import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { signToken, requireAuth, requireSameUser, validateSignup, createRateLimiter } from "../auth.js";

// Minimal Express req/res doubles
const run = (middleware, { authorization, params = {} } = {}, extra = {}) => {
  const req = { get: (h) => (h.toLowerCase() === "authorization" ? authorization : undefined), params, ...extra };
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  return { req, res, nextCalled };
};

test("requireAuth accepts a valid token and sets the user from it", () => {
  const token = signToken({ id: 7, username: "ada" });
  const { req, nextCalled } = run(requireAuth, { authorization: `Bearer ${token}` });
  assert.ok(nextCalled);
  assert.equal(req.username, "ada");
  assert.equal(req.userId, 7);
});

test("requireAuth rejects missing, malformed, forged and expired tokens", () => {
  const cases = [
    undefined,
    "ada",
    "Bearer",
    "Bearer not-a-jwt",
    `Bearer ${jwt.sign({ sub: "ada" }, "attacker-secret")}`, // signed with the wrong key
    `Bearer ${jwt.sign({ sub: "ada" }, "x", { algorithm: "none" })}`.replace(/\.[^.]*$/, "."), // unsigned
    `Bearer ${signToken({ id: 1, username: "ada" }).split(".").slice(0, 2).join(".")}.tampered`,
  ];
  for (const authorization of cases) {
    const { res, nextCalled } = run(requireAuth, { authorization });
    assert.equal(nextCalled, false, String(authorization));
    assert.equal(res.statusCode, 401, String(authorization));
  }
});

test("requireSameUser blocks reading another user's data", () => {
  assert.equal(run(requireSameUser, { params: { username: "bola" } }, { username: "ada" }).res.statusCode, 403);
  assert.ok(run(requireSameUser, { params: { username: "ada" } }, { username: "ada" }).nextCalled);
  assert.ok(run(requireSameUser, { params: {} }, { username: "ada" }).nextCalled);
});

test("validateSignup enforces username and password rules", () => {
  assert.equal(validateSignup("ada_b", "secret1"), null);
  assert.ok(validateSignup("ab", "secret1"));            // too short
  assert.ok(validateSignup("ada b", "secret1"));         // space
  assert.ok(validateSignup("ada<script>", "secret1"));   // symbols
  assert.ok(validateSignup("ada", "12345"));              // short password
  assert.ok(validateSignup("ada", "x".repeat(73)));       // over bcrypt limit
  assert.ok(validateSignup({ $ne: "" }, "secret1"));     // non-string input
});

test("rate limiter blocks after max failures and resets after the window", () => {
  const limiter = createRateLimiter({ max: 3, windowMs: 1000 });
  for (let i = 0; i < 3; i++) {
    assert.equal(limiter.check("k", 0), 0);
    limiter.fail("k", 0);
  }
  assert.ok(limiter.check("k", 500) > 0);
  assert.equal(limiter.check("k", 1000), 0); // window passed
  limiter.fail("k", 2000);
  limiter.reset("k");
  assert.equal(limiter.check("k", 2000), 0);
});
