import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AMENITY_ICON_OFFSET_EXPRESSION, AMENITY_ICON_SCALE, AMENITY_ICON_SIZE_EXPRESSION, amenityIconFeatures, amenityIconName } from "../app/amenity-style.js";
import { INTERACTIVE_MAP_LAYERS } from "../app/map-layer-policy.js";

test("known amenities receive corresponding icons", () => {
  const feature = (category) => ({ properties: { viewer_layer: "amenity", category } });
  assert.equal(amenityIconName(feature("fireextinguisher")), "fire-extinguisher");
  assert.equal(amenityIconName(feature("waste")), "trash");
  assert.equal(amenityIconName(feature("sink")), "sink");
  assert.equal(amenityIconName(feature("seating")), "seating");
  assert.equal(amenityIconName(feature("equipment")), "microscope");
  assert.ok(INTERACTIVE_MAP_LAYERS.includes("imdf-amenity-icons"));
  assert.deepEqual(AMENITY_ICON_SIZE_EXPRESSION.slice(0, 3), ["interpolate", ["linear"], ["zoom"]]);
  assert.deepEqual(AMENITY_ICON_SIZE_EXPRESSION[4], ["case", ["==", ["get", "amenity_icon"], "fire-extinguisher"], AMENITY_ICON_SCALE.min * 0.575, AMENITY_ICON_SCALE.min]);
  assert.deepEqual(AMENITY_ICON_OFFSET_EXPRESSION, ["coalesce", ["get", "amenity_icon_offset"], ["literal", [0, 0]]]);
});

test("fire extinguisher icons offset away from their north and south rows", () => {
  const fireExtinguisher = (id, issue) => ({ id, geometry: { type: "Point", coordinates: [-123.25, 49.26] }, properties: { viewer_layer: "amenity", category: "fireextinguisher", source_issue_number: issue } });
  const south = fireExtinguisher("south", 6);
  const north = fireExtinguisher("north", 22);
  const icons = amenityIconFeatures({ features: [south, north] }).features;
  assert.deepEqual(icons.map(({ properties }) => properties.amenity_icon_offset), [[0, 24], [0, -24]]);
});

test("bathroom unit polygons produce icons at their display points", async () => {
  const units = JSON.parse(await readFile(new URL("../geojson/unit.geojson", import.meta.url), "utf8"));
  const collection = { type: "FeatureCollection", features: units.features.map((feature) => ({ ...feature, properties: { ...feature.properties, viewer_layer: "unit" } })) };
  const bathrooms = amenityIconFeatures(collection);
  assert.equal(bathrooms.features.length, 3);
  assert.ok(bathrooms.features.every((feature) => feature.properties.amenity_icon === "toilet" && feature.geometry.type === "Point"));
});
