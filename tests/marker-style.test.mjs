import test from "node:test";
import assert from "node:assert/strict";
import { DRAWER_MARKER_OFFSET_PX, DRAWER_TOP_ICON_SCALE, EXHIBIT_ICON_SCALE, FULL_CIRCLE_ICON_SCALE, ICON_EXHIBIT_TYPES, NUMBERED_MARKER_SCALE, UBC_NORTH_BEARING, cabinetExhibitGroups, cabinetExhibitIconSizeExpression, countOffsetForBearing, drawerCountFilter, drawerMarkerShape, drawerSourceOptions, exhibitImageExpression, exhibitPointFilter, numberedMarkerSizeExpression, numberedMarkerTextSizeExpression } from "../app/marker-style.js";
import { INTERACTIVE_MAP_LAYERS } from "../app/map-layer-policy.js";

test("the primary marker style uses map-flat symbols for mapped exhibit types", () => {
  assert.deepEqual(ICON_EXHIBIT_TYPES, ["floor"]);
  assert.equal(exhibitImageExpression, "exhibit-full-circle");
  assert.equal(exhibitPointFilter.length, 7);
  assert.ok(INTERACTIVE_MAP_LAYERS.includes("imdf-exhibit-icons"));
});

test("cabinet exhibits share one counted fixture marker while labels stay excluded", () => {
  const label = { id: "label", feature_type: "exhibit", geometry: { type: "Point", coordinates: [1, 2] }, properties: { exhibit_type: "label", fixture_alt_names: ["col_1_cab_03"], fixture_id: "fixture", marker_bearing: 240 } };
  const window = { id: "window", feature_type: "exhibit", geometry: { type: "Point", coordinates: [1, 2] }, properties: { exhibit_type: "window", fixture_alt_names: ["col_1_cab_03"], fixture_id: "fixture", marker_bearing: 240 } };
  const shadowbox = { id: "shadowbox", feature_type: "exhibit", geometry: { type: "Point", coordinates: [1, 2] }, properties: { exhibit_type: "shadowbox", fixture_alt_names: ["col_1_cab_03"], fixture_id: "fixture", marker_bearing: 240 } };
  const groups = cabinetExhibitGroups({ features: [label, window, shadowbox] });
  assert.equal(groups.features.length, 1);
  assert.equal(groups.features[0].properties.exhibit_count, 2);
  assert.equal(groups.features[0].id, "fixture");
  assert.deepEqual(cabinetExhibitIconSizeExpression.slice(0, 3), ["interpolate", ["linear"], ["zoom"]]);
  assert.deepEqual(cabinetExhibitIconSizeExpression, ["interpolate", ["linear"], ["zoom"], 17, 0.525, 21, 0.75]);
});

test("numbered spots match approved cabinet markers and retain readable text", () => {
  assert.deepEqual(NUMBERED_MARKER_SCALE, EXHIBIT_ICON_SCALE);
  assert.deepEqual(numberedMarkerSizeExpression, ["interpolate", ["linear"], ["zoom"], 17, 0.525, 21, 0.75]);
  assert.deepEqual(numberedMarkerTextSizeExpression, ["interpolate", ["linear"], ["zoom"], 17, 8.4, 21, 12]);
});

test("drawer stack tops use full circles and other drawer counts use tabbed semicircles", () => {
  const feature = (name) => ({ properties: { fixture_alt_names: [name] } });
  assert.equal(drawerMarkerShape([feature("di_05_01_top")]), "full-circle");
  assert.equal(drawerMarkerShape([feature("di_05_01_L1")]), "half-circle-tab");
  assert.equal(DRAWER_TOP_ICON_SCALE, 0.5625);
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
  assert.deepEqual(FULL_CIRCLE_ICON_SCALE, { minZoom: 17, min: 0.394, maxZoom: 21, max: 0.5625 });
  assert.equal(DRAWER_TOP_ICON_SCALE, 0.5625);
});
