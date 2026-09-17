import assert from "node:assert/strict";
import test from "node:test";
import { buildGitHubIssue, normalizeIssueReport } from "../app/report-issue.js";

test("visitor reports are normalized and formatted for review", () => {
  const report = normalizeIssueReport({
    issue_type: "wrong_location",
    description: "  This cabinet appears in the wrong aisle.  ",
    session_id: "anonymous-session",
    feature_id: "fixture-46",
    feature_name: "Cabinet 46",
    feature_layer: "fixture",
    coordinates: [-123.1, 49.2],
    occurred_at: "2026-09-17T12:00:00Z",
  });
  const issue = buildGitHubIssue(report);
  assert.match(issue.title, /Wrong map location.*Cabinet 46/);
  assert.match(issue.body, /fixture-46/);
  assert.deepEqual(issue.labels, ["needs review"]);
  assert.doesNotMatch(issue.body, /anonymous-session/);
});

test("visitor reports reject arbitrary categories and unclear descriptions", () => {
  assert.throws(() => normalizeIssueReport({ issue_type: "custom", description: "A sufficiently long note", session_id: "s" }), /valid issue type/);
  assert.throws(() => normalizeIssueReport({ issue_type: "other", description: "unclear", session_id: "s" }), /at least 10/);
});
