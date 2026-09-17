import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildRoutingNetwork, findApprovedRoute } from "../app/routing.js";
import { findMultiStopRoute } from "../app/route-interaction.js";

const navigation = { type: "FeatureCollection", features: (await Promise.all(["navigation_path", "navigation_access", "navigation_stop"].map(async (name) => JSON.parse(await readFile(new URL(`../geojson/${name}.geojson`, import.meta.url), "utf8"))))).flatMap((collection) => collection.features) };
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
const viewingCoordinates = new Set(navigation.features.filter((item) => item.properties.wayfinding_type === "viewing_stop").map((item) => JSON.stringify(item.geometry.coordinates)));
const isApprovedSubsegment = (coordinates) => approvedLines.some((line) => pointIsOnLine(coordinates[0], line) && pointIsOnLine(coordinates.at(-1), line))
  || viewingCoordinates.has(JSON.stringify(coordinates[0])) || viewingCoordinates.has(JSON.stringify(coordinates.at(-1)));

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

test("routes through the ramp centerline and around the corner to the whale", () => {
  const entrance = feature("ramp_entrance");
  const exit = feature("ramp_exit");
  const whale = feature("blue_whale_skeleton");
  const rampRoute = findApprovedRoute(network, entrance, exit);
  const whaleRoute = findApprovedRoute(network, entrance, whale);
  assert.ok(rampRoute);
  assert.ok(whaleRoute);
  assert.ok(whaleRoute.distanceMeters > rampRoute.distanceMeters);
  assert.deepEqual(whaleRoute.features.at(-1).geometry.coordinates.at(-1), [-123.2509732, 49.2632654]);
});

test("routes every Discovery Lab table through the spine, door and PATH-001", () => {
  const door = feature("discovery_lab_doors");
  const museumDestination = feature("col_1_cab_21");
  for (let table = 1; table <= 8; table++) {
    const source = feature(`discovery_lab_table_${table}`);
    assert.ok(findApprovedRoute(network, source, door));
    assert.ok(findApprovedRoute(network, source, museumDestination));
  }
});

test("routes the Discovery Lab sink and microscope through the lab spine", () => {
  const door = feature("discovery_lab_doors");
  const museumDestination = feature("col_1_cab_21");
  for (const sourceName of ["discovery_lab_sink", "discovery_lab_microscope"]) {
    const source = feature(sourceName);
    assert.ok(findApprovedRoute(network, source, door));
    assert.ok(findApprovedRoute(network, source, museumDestination));
  }
});

test("routes the theatre doors and accessibility ramp through PATH-213", () => {
  const west = feature("theatre_west_doors");
  const east = feature("theatre_east_doors");
  const rampEntrance = feature("theatre_accessibility_ramp_entrance");
  const rampExit = feature("theatre_accessibility_ramp_exit");
  const museumDestination = feature("col_1_cab_21");
  assert.ok(findApprovedRoute(network, rampEntrance, west));
  assert.ok(findApprovedRoute(network, rampExit, east));
  assert.ok(findApprovedRoute(network, rampEntrance, rampExit));
  for (const source of [west, east, rampEntrance, rampExit]) assert.ok(findApprovedRoute(network, source, museumDestination));
});

test("routes the Discovery Lab emergency exit directly through the lab doors", () => {
  const emergencyExit = feature("discovery_lab_emergency_exit");
  const doors = feature("discovery_lab_doors");
  const museumDestination = feature("col_1_cab_21");
  assert.ok(findApprovedRoute(network, emergencyExit, doors));
  assert.ok(findApprovedRoute(network, emergencyExit, museumDestination));
});
