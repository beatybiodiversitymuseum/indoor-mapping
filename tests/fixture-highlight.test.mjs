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

  assert.equal(fixtureHighlightState(cabinetA, exhibitA, [exhibitA]), "current");
  assert.equal(fixtureHighlightState(cabinetA, exhibitB, [exhibitA, exhibitB]), "previous");
  assert.equal(fixtureHighlightState(cabinetB, exhibitB, [exhibitA, exhibitB]), "current");
});

test("an unfinished route does not create a separate previous highlight", () => {
  const cabinetA = feature("fixture-a", "fixture", "cabinet-a");
  const exhibitA = feature("exhibit-a", "exhibit", "cabinet-a");

  assert.equal(fixtureHighlightState(cabinetA, null, [exhibitA]), null);
});

test("every earlier stop remains blue in a multi-stop route", () => {
  const cabinetA = feature("fixture-a", "fixture", "cabinet-a");
  const cabinetB = feature("fixture-b", "fixture", "cabinet-b");
  const cabinetC = feature("fixture-c", "fixture", "cabinet-c");
  const stops = [feature("a", "exhibit", "cabinet-a"), feature("b", "exhibit", "cabinet-b"), feature("c", "exhibit", "cabinet-c")];
  assert.equal(fixtureHighlightState(cabinetA, stops[2], stops), "previous");
  assert.equal(fixtureHighlightState(cabinetB, stops[2], stops), "previous");
  assert.equal(fixtureHighlightState(cabinetC, stops[2], stops), "current");
});
