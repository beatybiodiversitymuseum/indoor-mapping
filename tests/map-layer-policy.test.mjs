import test from "node:test";
import assert from "node:assert/strict";
import { DRAWER_OVERLAY_LAYERS, INTERACTIVE_MAP_LAYERS } from "../app/map-layer-policy.js";

test("drawer counts render as overlays without capturing map clicks", () => {
  assert.deepEqual(DRAWER_OVERLAY_LAYERS, ["imdf-drawer-group", "imdf-drawer-group-count"]);
  for (const layer of DRAWER_OVERLAY_LAYERS) assert.equal(INTERACTIVE_MAP_LAYERS.includes(layer), false);
  assert.ok(INTERACTIVE_MAP_LAYERS.includes("imdf-fixture-extrusion"));
  assert.ok(INTERACTIVE_MAP_LAYERS.includes("imdf-fill"));
});
