import { fixtureRouteId } from "./routing.js";

export function fixtureHighlightState(feature, selected, routeFrom, routeTo) {
  if (feature?.properties?.viewer_layer !== "fixture") return null;

  const fixtureId = fixtureRouteId(feature);
  const selectedFixtureId = fixtureRouteId(selected);
  if (feature.id === selected?.id || (fixtureId && fixtureId === selectedFixtureId)) return "current";

  const previousFixtureId = routeTo ? fixtureRouteId(routeFrom) : null;
  if (fixtureId && fixtureId === previousFixtureId) return "previous";

  return null;
}
