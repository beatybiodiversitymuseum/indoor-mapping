import { fixtureRouteId } from "./routing.js";

export function fixtureHighlightState(feature, selected, routeStops = []) {
  if (feature?.properties?.viewer_layer !== "fixture") return null;

  const fixtureId = fixtureRouteId(feature);
  const selectedFixtureId = fixtureRouteId(selected);
  if (feature.id === selected?.id || (fixtureId && fixtureId === selectedFixtureId)) return "current";

  const previousFixtureIds = routeStops.length > 1 ? routeStops.slice(0, -1).map(fixtureRouteId) : [];
  if (fixtureId && previousFixtureIds.includes(fixtureId)) return "previous";

  return null;
}
