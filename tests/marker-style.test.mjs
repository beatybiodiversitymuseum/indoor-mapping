import test from "node:test";
import assert from "node:assert/strict";
import { DRAWER_MARKER_OFFSET_PX, DRAWER_TOP_ICON_SCALE, EXHIBIT_ICON_SCALE, ICON_EXHIBIT_TYPES, UBC_NORTH_BEARING, countOffsetForBearing, drawerCountFilter, drawerMarkerShape, drawerSourceOptions, exhibitImageExpression, exhibitPointFilter } from "../app/marker-style.js";
import { INTERACTIVE_MAP_LAYERS } from "../app/map-layer-policy.js";

test("the primary marker style uses map-flat symbols for mapped exhibit types", () => {
  assert.deepEqual(ICON_EXHIBIT_TYPES, ["window", "shadowbox", "floor"]);
  assert.deepEqual(exhibitImageExpression.slice(0, 2), ["match", ["get", "exhibit_type"]]);
  assert.equal(exhibitPointFilter.length, 6);
  assert.ok(INTERACTIVE_MAP_LAYERS.includes("imdf-exhibit-icons"));
});

test("drawer stack tops use full circles and other drawer counts use tabbed semicircles", () => {
  const feature = (name) => ({ properties: { fixture_alt_names: [name] } });
  assert.equal(drawerMarkerShape([feature("di_05_01_top")]), "full-circle");
  assert.equal(drawerMarkerShape([feature("di_05_01_L1")]), "half-circle-tab");
  assert.equal(DRAWER_TOP_ICON_SCALE, 0.75);
  assert.deepEqual(drawerCountFilter, ["!=", ["get", "marker_shape"], "full-circle"]);
});

test("drawer counts retain fixture-edge positions rather than clustering", () => {
  const data = { type: "FeatureCollection", features: [] };
  const options = drawerSourceOptions(data);
  assert.deepEqual(options, { type: "geojson", data });
  assert.equal("cluster" in options, false);
});

test("drawer glyphs and counts offset together along the outward normal", () => {
  assert.equal(DRAWER_MARKER_OFFSET_PX, 11);
  assert.deepEqual(countOffsetForBearing(UBC_NORTH_BEARING), [0, -0.9]);
  assert.deepEqual(countOffsetForBearing(UBC_NORTH_BEARING + 90), [0.9, 0]);
  assert.deepEqual(countOffsetForBearing(UBC_NORTH_BEARING + 180), [0, 0.9]);
});

test("individual exhibit and stack-top icons use the reviewed reduced scale", () => {
  assert.deepEqual(EXHIBIT_ICON_SCALE, { minZoom: 17, min: 0.525, maxZoom: 21, max: 0.75 });
  assert.equal(DRAWER_TOP_ICON_SCALE, 0.75);
});
