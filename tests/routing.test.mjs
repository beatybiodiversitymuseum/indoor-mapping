import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildRoutingNetwork, findApprovedRoute } from "../app/routing.js";

const navigation = JSON.parse(await readFile(new URL("../geojson/navigation.geojson", import.meta.url), "utf8"));
const network = buildRoutingNetwork(navigation);
const feature = (altName) => ({ properties: { alt_name: { en: altName } } });
const approvedLines = navigation.features
  .filter((item) => ["walking_path", "connection_line"].includes(item.properties.wayfinding_type) && item.properties.route_confirmed)
  .map((item) => item.geometry.coordinates);
const meters = (a, b) => {
  const latitude = ((a[1] + b[1]) / 2) * Math.PI / 180;
  return Math.hypot((b[0] - a[0]) * Math.cos(latitude) * 6371000 * Math.PI / 180, (b[1] - a[1]) * 6371000 * Math.PI / 180);
};
const pointIsOnLine = (point, line) => Math.abs(meters(line[0], point) + meters(point, line.at(-1)) - meters(line[0], line.at(-1))) < 0.01;
const isApprovedSubsegment = (coordinates) => approvedLines.some((line) => pointIsOnLine(coordinates[0], line) && pointIsOnLine(coordinates.at(-1), line));

test("builds the planar graph from confirmed navigation lines", () => {
  assert.equal(network.graph.order, 2320);
  assert.equal(network.graph.size, 1428);
  assert.equal([...network.connections.values()].reduce((total, connections) => total + connections.length, 0), 3366);
});

test("returns only subsegments of approved LineStrings", () => {
  const route = findApprovedRoute(network, feature("di_27_18_top"), feature("col_1_cab_21"));
  assert.ok(route?.features.length > 2);
  for (const segment of route.features) assert.ok(isApprovedSubsegment(segment.geometry.coordinates));
});

test("does not invent access for an unconnected fixture", () => {
  assert.equal(findApprovedRoute(network, feature("not_connected"), feature("col_1_cab_21")), null);
});

test("uses approved connection interiors between columns 25 and 36", () => {
  const route = findApprovedRoute(network, feature("col_25_cab_09"), feature("col_36_cab_09"));
  assert.ok(route.distanceMeters < 41);
  for (const segment of route.features) assert.ok(isApprovedSubsegment(segment.geometry.coordinates));
});
