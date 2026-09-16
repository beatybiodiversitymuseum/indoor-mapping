import test from "node:test";
import assert from "node:assert/strict";
import { fixtureHighlightState } from "../app/fixture-highlight.js";

function feature(id, layer, routeId) {
  return {
    id,
    properties: {
      viewer_layer: layer,
      route_fixture_id: routeId,
    },
  };
}

test("the current fixture is gold and the earlier route fixture remains blue", () => {
  const cabinetA = feature("fixture-a", "fixture", "cabinet-a");
  const cabinetB = feature("fixture-b", "fixture", "cabinet-b");
  const exhibitA = feature("exhibit-a", "exhibit", "cabinet-a");
  const exhibitB = feature("exhibit-b", "exhibit", "cabinet-b");

  assert.equal(fixtureHighlightState(cabinetA, exhibitA, exhibitA, null), "current");
  assert.equal(fixtureHighlightState(cabinetA, exhibitB, exhibitA, exhibitB), "previous");
  assert.equal(fixtureHighlightState(cabinetB, exhibitB, exhibitA, exhibitB), "current");
});

test("an unfinished route does not create a separate previous highlight", () => {
  const cabinetA = feature("fixture-a", "fixture", "cabinet-a");
  const exhibitA = feature("exhibit-a", "exhibit", "cabinet-a");

  assert.equal(fixtureHighlightState(cabinetA, null, exhibitA, null), null);
});
