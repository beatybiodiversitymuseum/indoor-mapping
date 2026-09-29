import assert from "node:assert/strict";
import test from "node:test";
import { analyticsAuthorized } from "../app/analytics-auth.js";

const basic = (value) => `Basic ${Buffer.from(value).toString("base64")}`;

test("analytics accepts the configured basic-auth credentials", () => {
  assert.equal(analyticsAuthorized(basic("beaty:beaty")), true);
  assert.equal(analyticsAuthorized(basic("admin:secret"), "admin", "secret"), true);
});

test("analytics rejects missing and incorrect credentials", () => {
  assert.equal(analyticsAuthorized(null), false);
  assert.equal(analyticsAuthorized("Bearer token"), false);
  assert.equal(analyticsAuthorized(basic("beaty:wrong")), false);
  assert.equal(analyticsAuthorized(basic("wrong:beaty")), false);
});
