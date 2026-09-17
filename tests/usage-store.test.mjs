import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUsageEvent } from "../app/usage-store.js";

test("usage events accept the intended anonymous interaction fields", () => {
  const event = normalizeUsageEvent({
    session_id: "anonymous-session",
    event_type: "search",
    occurred_at: "2026-09-17T12:00:00.000Z",
    feature_id: "fixture-1",
    query: "  fossil  ",
    metadata: { result_count: 3 },
  });
  assert.equal(event.query, "fossil");
  assert.equal(event.featureId, "fixture-1");
  assert.equal(event.metadata, '{"result_count":3}');
});

test("usage events reject unknown event types and cap visitor text", () => {
  assert.throws(() => normalizeUsageEvent({ session_id: "session", event_type: "zoom" }), /Invalid usage event/);
  const event = normalizeUsageEvent({ session_id: "session", event_type: "search", query: "x".repeat(300) });
  assert.equal(event.query.length, 200);
});
