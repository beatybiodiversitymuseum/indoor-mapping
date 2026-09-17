import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AMENITY_ICON_SCALE, AMENITY_ICON_SIZE_EXPRESSION, amenityIconFeatures, amenityIconName } from "../app/amenity-style.js";
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
  assert.deepEqual(AMENITY_ICON_SIZE_EXPRESSION[4], ["case", ["==", ["get", "amenity_icon"], "fire-extinguisher"], AMENITY_ICON_SCALE.min * 0.5, AMENITY_ICON_SCALE.min]);
});

test("bathroom unit polygons produce icons at their display points", async () => {
  const units = JSON.parse(await readFile(new URL("../geojson/unit.geojson", import.meta.url), "utf8"));
  const collection = { type: "FeatureCollection", features: units.features.map((feature) => ({ ...feature, properties: { ...feature.properties, viewer_layer: "unit" } })) };
  const bathrooms = amenityIconFeatures(collection);
  assert.equal(bathrooms.features.length, 3);
  assert.ok(bathrooms.features.every((feature) => feature.properties.amenity_icon === "toilet" && feature.geometry.type === "Point"));
});
