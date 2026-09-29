import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { summarizeUsageDatabase } from "../app/usage-store.js";

test("analytics tolerates malformed historical metadata", () => {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE usage_events (
    id INTEGER PRIMARY KEY,
    occurred_at TEXT NOT NULL,
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    feature_id TEXT,
    query TEXT,
    metadata TEXT
  )`);
  const insert = db.prepare(`INSERT INTO usage_events
    (occurred_at, session_id, event_type, feature_id, query, metadata)
    VALUES (datetime('now'), ?, 'route', ?, NULL, ?)`);
  insert.run("one", "feature-1", '{"found":true}');
  insert.run("two", "feature-2", '{"found":');
  insert.run("three", "feature-3", null);

  const analytics = summarizeUsageDatabase(db, 30);
  assert.equal(analytics.routeStats.total, 3);
  assert.equal(analytics.routeStats.found, 1);
  assert.equal(analytics.totals.sessions, 3);
  db.close();
});
