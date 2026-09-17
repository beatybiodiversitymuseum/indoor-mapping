import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pointFeatureIconFeatures, pointFeatureIconName } from "../app/point-feature-style.js";
import { INTERACTIVE_MAP_LAYERS } from "../app/map-layer-policy.js";

const feature = (layer, name) => ({ properties: { viewer_layer: layer, name: { en: name } } });

test("point openings and fixtures receive meaningful icon types", () => {
  assert.equal(pointFeatureIconName(feature("opening", "Front Entrance")), "door");
  assert.equal(pointFeatureIconName(feature("opening", "Front Emergency Exit")), "emergency-exit");
  assert.equal(pointFeatureIconName(feature("opening", "Ramp Entrance")), "ramp");
  assert.equal(pointFeatureIconName(feature("opening", "Accessibility Entrance")), "accessible-entrance");
  assert.equal(pointFeatureIconName(feature("opening", "Staff Door")), "staff-door");
  assert.equal(pointFeatureIconName(feature("fixture", "Discovery Lab Table 1")), "table");
  assert.equal(pointFeatureIconName(feature("fixture", "Theatre Projection Booth")), "projector");
  assert.equal(pointFeatureIconName(feature("fixture", "Theatre Screen")), "screen");
  assert.ok(INTERACTIVE_MAP_LAYERS.includes("imdf-point-feature-icons"));
});

test("all current point openings and fixtures produce selectable icon features", async () => {
  const features = [];
  for (const layer of ["opening", "fixture"]) {
    const data = JSON.parse(await readFile(new URL(`../geojson/${layer}.geojson`, import.meta.url), "utf8"));
    features.push(...data.features.map((item) => ({ ...item, properties: { ...item.properties, viewer_layer: layer, viewer_feature_id: item.id } })));
  }
  const expected = features.filter((item) => item.geometry.type === "Point");
  const icons = pointFeatureIconFeatures({ type: "FeatureCollection", features });
  assert.equal(icons.features.length, expected.length);
  assert.ok(icons.features.every((item) => item.properties.point_feature_icon));
});
