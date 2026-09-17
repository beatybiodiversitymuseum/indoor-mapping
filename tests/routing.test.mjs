import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildRoutingNetwork, findApprovedRoute } from "../app/routing.js";
import { findMultiStopRoute } from "../app/route-interaction.js";

const navigation = JSON.parse(await readFile(new URL("../geojson/navigation.geojson", import.meta.url), "utf8"));
const network = buildRoutingNetwork(navigation);
const feature = (altName) => ({ properties: { alt_name: { en: altName } } });
const approvedLines = navigation.features
  .filter((item) => ["walking_path", "connection_line"].includes(item.properties.wayfinding_type) && item.properties.route_confirmed)
  .map((item) => item.geometry.coordinates);
const accessProjectionSourceCount = navigation.features
  .filter((item) => item.properties.wayfinding_type === "access_projection")
  .reduce((total, item) => total + (item.properties.sources?.length || 1), 0);
const meters = (a, b) => {
  const latitude = ((a[1] + b[1]) / 2) * Math.PI / 180;
  return Math.hypot((b[0] - a[0]) * Math.cos(latitude) * 6371000 * Math.PI / 180, (b[1] - a[1]) * 6371000 * Math.PI / 180);
};
const pointIsOnLine = (point, line) => Math.abs(meters(line[0], point) + meters(point, line.at(-1)) - meters(line[0], line.at(-1))) < 0.01;
const isApprovedSubsegment = (coordinates) => approvedLines.some((line) => pointIsOnLine(coordinates[0], line) && pointIsOnLine(coordinates.at(-1), line));

test("builds the planar graph from confirmed navigation lines", () => {
  assert.ok(network.graph.order > 0);
  assert.ok(network.graph.size >= approvedLines.length);
  assert.equal([...network.connections.values()].reduce((total, connections) => total + connections.length, 0), accessProjectionSourceCount);
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

test("joins each approved leg of a multi-stop route in order", () => {
  const stops = [feature("col_25_cab_09"), feature("col_36_cab_09"), feature("col_1_cab_21")];
  const route = findMultiStopRoute(network, stops);
  const firstLeg = findApprovedRoute(network, stops[0], stops[1]);
  const secondLeg = findApprovedRoute(network, stops[1], stops[2]);
  assert.ok(route);
  assert.equal(route.legRoutes.length, 2);
  assert.equal(route.features.length, firstLeg.features.length + secondLeg.features.length);
  assert.ok(Math.abs(route.distanceMeters - firstLeg.distanceMeters - secondLeg.distanceMeters) < 1e-9);
  const firstLegEnd = route.legRoutes[0].features.at(-1).geometry.coordinates.at(-1);
  const secondLegStart = route.legRoutes[1].features[0].geometry.coordinates[0];
  assert.deepEqual(firstLegEnd, secondLegStart);
});
