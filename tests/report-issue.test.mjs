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

test("map additions preserve point and polyline GeoJSON in the review issue", () => {
  for (const geometry of [
    { type: "Point", coordinates: [-123.1, 49.2] },
    { type: "LineString", coordinates: [[-123.1, 49.2], [-123.2, 49.3]] },
  ]) {
    const report = normalizeIssueReport({ issue_type: "missing_feature", description: "A missing map feature", session_id: "s", level_id: "main", geometry });
    const issue = buildGitHubIssue(report);
    assert.match(issue.title, /^Map addition:/);
    const feature = JSON.parse(issue.body.split("```geojson\n")[1].split("\n```")[0]);
    assert.deepEqual(feature.geometry, geometry);
    assert.equal(feature.properties.level_id, "main");
  }
});

test("map additions reject invalid or oversized drawings", () => {
  for (const geometry of [
    { type: "Polygon", coordinates: [] },
    { type: "Point", coordinates: [181, 49] },
    { type: "Point", coordinates: [0, null] },
    { type: "LineString", coordinates: [[0, 0]] },
    { type: "LineString", coordinates: [[0, 0], [0, 0]] },
    { type: "LineString", coordinates: Array.from({ length: 501 }, (_, i) => [i / 10, 0]) },
  ]) assert.throws(() => normalizeIssueReport({ issue_type: "missing_feature", description: "A missing map feature", session_id: "s", geometry }), /Draw/);
});

test("map additions retain an existing icon and reject unknown icons", () => {
  const input = { issue_type: "missing_feature", description: "A missing map feature", session_id: "s", geometry: { type: "Point", coordinates: [-123, 49] }, icon: "amenity-icons/sink" };
  const report = normalizeIssueReport(input);
  const issue = buildGitHubIssue(report);
  const feature = JSON.parse(issue.body.split("```geojson\n")[1].split("\n```")[0]);
  assert.equal(feature.properties.icon, input.icon);
  assert.match(issue.body, /Map icon: Sink/);
  assert.throws(() => normalizeIssueReport({ ...input, icon: "https://example.com/icon.png" }), /valid map icon/);
});

test("feature submissions use addition language instead of problem report categories", () => {
  const report = normalizeIssueReport({ issue_type: "missing_feature", description: "A new polygon feature", session_id: "s", geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [0, 1], [0, 0]]] } });
  const issue = buildGitHubIssue(report);
  assert.equal(issue.title, "Map addition: Proposed polygon");
  assert.match(issue.body, /Submission type:\*\* New map feature/);
  assert.doesNotMatch(issue.body, /Visitor report|Issue type|general map report|Missing place or exhibit/);
});

test("polylines and polygons discard point icons from stale drafts", () => {
  for (const geometry of [
    { type: "LineString", coordinates: [[0, 0], [1, 0]] },
    { type: "Polygon", coordinates: [[[0, 0], [1, 0], [0, 1], [0, 0]]] },
  ]) {
    const report = normalizeIssueReport({ issue_type: "missing_feature", description: "A new map feature", session_id: "s", geometry, icon: "amenity-icons/sink" });
    assert.equal(report.icon, "");
    const issue = buildGitHubIssue(report);
    assert.doesNotMatch(issue.body, /Map icon/);
    const feature = JSON.parse(issue.body.split("```geojson\n")[1].split("\n```")[0]);
    assert.equal(Object.hasOwn(feature.properties, "icon"), false);
  }
});

test("reference points and relative offsets survive submission without changing geometry", () => {
  const degree = 180 / (Math.PI * 6371008.8);
  const input = { issue_type: "missing_feature", description: "A point relative to an anchor", session_id: "s", geometry: { type: "Point", coordinates: [10 * degree, 0] }, reference_point: [0, 0] };
  const report = normalizeIssueReport(input);
  const issue = buildGitHubIssue(report);
  const feature = JSON.parse(issue.body.split("```geojson\n")[1].split("\n```")[0]);
  assert.deepEqual(feature.geometry, input.geometry);
  assert.deepEqual(feature.properties.reference_point, [0, 0]);
  assert.deepEqual(feature.properties.relative_points, [{ east_m: 10, north_m: 0, distance_m: 10 }]);
  const unset = buildGitHubIssue(normalizeIssueReport({ ...input, reference_point: null }));
  assert.doesNotMatch(unset.body, /relative_points|reference_point/);
  assert.throws(() => normalizeIssueReport({ ...input, reference_point: [181, 0] }), /valid map coordinates/);
});
