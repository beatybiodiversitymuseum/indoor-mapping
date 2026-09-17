import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { WHALE_ICON_SCALE, WHALE_PHYSICAL_HEIGHT_METERS, whaleOverlayFeature } from "../app/whale-style.js";

test("the whale floor graphic is centered on the blue whale exhibit", async () => {
  const exhibits = JSON.parse(await readFile(new URL("../geojson/exhibit.geojson", import.meta.url)));
  const whale = exhibits.features.find((feature) => feature.properties?.alt_name?.en === "blue_whale_skeleton");
  whale.properties.viewer_layer = "exhibit";
  assert.deepEqual(whaleOverlayFeature({ type: "FeatureCollection", features: [whale] }).features[0].geometry.coordinates, whale.geometry.coordinates);
});

test("the whale artwork height matches the complete ramp run", () => {
  assert.ok(WHALE_PHYSICAL_HEIGHT_METERS > 31 && WHALE_PHYSICAL_HEIGHT_METERS < 33);
  assert.ok(Math.abs(WHALE_ICON_SCALE.max / WHALE_ICON_SCALE.min - 2 ** (WHALE_ICON_SCALE.maxZoom - WHALE_ICON_SCALE.minZoom)) < 1000);
});
