import { fixtureRouteId } from './routing.js';
export function nextRouteSelection(from, to, feature) {
  if (!from || to) return [feature, null];
  if (fixtureRouteId(from) === fixtureRouteId(feature)) return [from, null];
  return [from, feature];
}
export function routeStoppingCoordinate(network, feature) {
  return network?.connections.get(fixtureRouteId(feature))?.[0]?.coordinates[0] || null;
}
export function isMapBackground(feature) {
  return !feature || ['unit','level','footprint','venue','building','detail'].includes(feature.properties?.viewer_layer || feature.feature_type);
}
