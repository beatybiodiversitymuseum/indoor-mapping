import { findApprovedRoute, fixtureRouteId } from './routing.js';
export function nextRouteSelection(from, to, feature) {
  if (!from || to) return [feature, null];
  if (fixtureRouteId(from) === fixtureRouteId(feature)) return [from, null];
  return [from, feature];
}
export function routeStoppingCoordinate(network, feature) {
  return network?.connections.get(fixtureRouteId(feature))?.[0]?.coordinates[0] || null;
}
export function routeEndpointHighlight(endpoint, from, to) {
  if (endpoint === "from" && from) return to ? "previous" : "current";
  if (endpoint === "to" && to) return "current";
  return null;
}
export function routeStopLabel(index) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}
export function appendRouteStop(stops, feature) {
  if (!feature || fixtureRouteId(stops.at(-1)) === fixtureRouteId(feature)) return stops;
  return [...stops, feature];
}
export function findMultiStopRoute(network, stops) {
  if (!network || stops.length < 2) return null;
  const legs = [];
  const legRoutes = [];
  let distanceMeters = 0;
  for (let index = 1; index < stops.length; index++) {
    const leg = findApprovedRoute(network, stops[index - 1], stops[index]);
    if (!leg) return null;
    legRoutes.push(leg);
    legs.push(...leg.features);
    distanceMeters += leg.distanceMeters;
  }
  return { type: "FeatureCollection", features: legs, legRoutes, distanceMeters };
}
export function isMapBackground(feature) {
  return !feature || ['unit','level','footprint','venue','building','detail'].includes(feature.properties?.viewer_layer || feature.feature_type);
}
