import { UBC_NORTH_BEARING } from "./constants.js";

export const COLLECTION_BADGE_OFFSET_METERS = 1.05;
export const COLLECTION_BADGE_SIZE = 256;
export const COLLECTION_BADGE_SCALE = { minZoom: 17, min: 0.1, maxZoom: 21, max: 0.24 };

// MapLibre multiplies icon offsets by icon-size, so half the source image
// remains exactly one displayed radius at every zoom level.
export const collectionBadgeIconOffset = [0, COLLECTION_BADGE_SIZE / 2];

export const COLLECTIONS = [
  { id: "vertebrate", firstGroup: 1, lastGroup: 5, color: "#6f2615", fixtureColor: "#8c6b64", sectionColor: "#b9aeab" },
  { id: "marine", firstGroup: 6, lastGroup: 6, color: "#f79120", fixtureColor: "#c9a77e", sectionColor: "#d5c8b9" },
  { id: "herbarium", firstGroup: 7, lastGroup: 18, color: "#3e793a", fixtureColor: "#748d72", sectionColor: "#adb7ac" },
  { id: "entomology", firstGroup: 19, lastGroup: 19, color: "#6f448e", fixtureColor: "#85758f", sectionColor: "#b4aeb7" },
  { id: "fish", firstGroup: 20, lastGroup: 25, color: "#1a2c57", fixtureColor: "#637086", sectionColor: "#a8adb5" },
  { id: "fossil", firstGroup: 26, lastGroup: 26, color: "#c42127", fixtureColor: "#aa7173", sectionColor: "#c5b2b3" },
];

export function cabinetGroup(feature) {
  const name = feature?.properties?.alt_name?.en || "";
  const face = Number(name.match(/^col_(\d+)_cab_/)?.[1]);
  return Number.isFinite(face) ? Math.ceil(face / 2) : null;
}

export function drawerGroup(feature) {
  const name = feature?.properties?.alt_name?.en || "";
  const face = Number(name.match(/^di_(\d+)_/)?.[1]);
  return Number.isFinite(face) ? Math.ceil(face / 2) : null;
}

export function collectionForGroup(group) {
  return COLLECTIONS.find(({ firstGroup, lastGroup }) => group >= firstGroup && group <= lastGroup) || null;
}

export function collectionForFixture(feature) {
  return collectionForGroup(cabinetGroup(feature) ?? drawerGroup(feature));
}

export const collectionFixtureColorExpression = (fallback) => [
  "match",
  ["get", "viewer_collection"],
  ...COLLECTIONS.flatMap(({ id, fixtureColor }) => [id, fixtureColor]),
  fallback,
];

function toLocalMeters(coordinate, origin, bearing = UBC_NORTH_BEARING) {
  const latitude = origin[1] * Math.PI / 180;
  const x = (coordinate[0] - origin[0]) * 111320 * Math.cos(latitude);
  const y = (coordinate[1] - origin[1]) * 111320;
  const angle = bearing * Math.PI / 180;
  return {
    east: x * Math.cos(angle) - y * Math.sin(angle),
    north: x * Math.sin(angle) + y * Math.cos(angle),
  };
}

function fromLocalMeters({ east, north }, origin, bearing = UBC_NORTH_BEARING) {
  const angle = bearing * Math.PI / 180;
  const x = east * Math.cos(angle) + north * Math.sin(angle);
  const y = -east * Math.sin(angle) + north * Math.cos(angle);
  return [
    origin[0] + x / (111320 * Math.cos(origin[1] * Math.PI / 180)),
    origin[1] + y / 111320,
  ];
}

function fixtureCoordinates(feature) {
  if (feature?.geometry?.type !== "Polygon") return [];
  return feature.geometry.coordinates.flat(1);
}

export function collectionBadgeFeatures(collection, bearing = UBC_NORTH_BEARING) {
  const fixtures = (collection?.features || []).filter((feature) => cabinetGroup(feature));
  const origin = fixtures[0]?.properties?.display_point?.coordinates || fixtureCoordinates(fixtures[0])[0];
  if (!origin) return { type: "FeatureCollection", features: [] };

  const features = COLLECTIONS.flatMap((definition) => {
    const members = fixtures.filter((feature) => collectionForFixture(feature)?.id === definition.id);
    const coordinates = members.flatMap(fixtureCoordinates);
    if (!coordinates.length) return [];
    const points = coordinates.map((coordinate) => toLocalMeters(coordinate, origin, bearing));
    const east = (Math.min(...points.map((point) => point.east)) + Math.max(...points.map((point) => point.east))) / 2;
    const north = Math.min(...points.map((point) => point.north)) - COLLECTION_BADGE_OFFSET_METERS;
    return [{
      type: "Feature",
      id: `collection-badge-${definition.id}`,
      properties: { collection: definition.id },
      geometry: { type: "Point", coordinates: fromLocalMeters({ east, north }, origin, bearing) },
    }];
  });
  return { type: "FeatureCollection", features };
}

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

export function collectionSectionFeatures(collection, bearing = UBC_NORTH_BEARING) {
  const fixtures = (collection?.features || []).filter((feature) => cabinetGroup(feature));
  const origin = fixtures[0]?.properties?.display_point?.coordinates || fixtureCoordinates(fixtures[0])[0];
  if (!origin) return { type: "FeatureCollection", features: [] };

  const groupCenters = new Map();
  for (const feature of fixtures) {
    const group = cabinetGroup(feature);
    const coordinate = feature.properties?.display_point?.coordinates;
    if (!coordinate) continue;
    const point = toLocalMeters(coordinate, origin, bearing);
    const existing = groupCenters.get(group) || [];
    existing.push(point);
    groupCenters.set(group, existing);
  }
  const centers = new Map([...groupCenters].map(([group, points]) => [group, {
    east: points.reduce((sum, point) => sum + point.east, 0) / points.length,
    north: points.reduce((sum, point) => sum + point.north, 0) / points.length,
  }]));
  const orderedGroups = [...centers].sort(([a], [b]) => a - b);
  const columnPitch = median(orderedGroups.slice(1).map(([, center], index) => Math.abs(center.east - orderedGroups[index][1].east)));
  if (!Number.isFinite(columnPitch)) return { type: "FeatureCollection", features: [] };
  const padding = columnPitch / 2;
  const allPoints = fixtures.flatMap(fixtureCoordinates).map((coordinate) => toLocalMeters(coordinate, origin, bearing));
  const commonNorth = Math.max(...allPoints.map((point) => point.north)) + padding;
  const boundaryBefore = (group) => {
    const index = orderedGroups.findIndex(([candidate]) => candidate === group);
    if (index > 0) return (orderedGroups[index - 1][1].east + orderedGroups[index][1].east) / 2;
    return orderedGroups[index][1].east - Math.abs(orderedGroups[index + 1][1].east - orderedGroups[index][1].east) / 2;
  };
  const boundaryAfter = (group) => {
    const index = orderedGroups.findIndex(([candidate]) => candidate === group);
    if (index < orderedGroups.length - 1) return (orderedGroups[index][1].east + orderedGroups[index + 1][1].east) / 2;
    return orderedGroups[index][1].east + Math.abs(orderedGroups[index][1].east - orderedGroups[index - 1][1].east) / 2;
  };

  return {
    type: "FeatureCollection",
    features: COLLECTIONS.flatMap((definition) => {
      const members = fixtures.filter((feature) => {
        const group = cabinetGroup(feature);
        return group >= definition.firstGroup && group <= definition.lastGroup;
      });
      const points = members.flatMap(fixtureCoordinates).map((coordinate) => toLocalMeters(coordinate, origin, bearing));
      const sectionCenters = [...centers].filter(([group]) => group >= definition.firstGroup && group <= definition.lastGroup).map(([, center]) => center);
      if (!points.length || !sectionCenters.length) return [];
      const west = boundaryBefore(definition.firstGroup);
      const east = boundaryAfter(definition.lastGroup);
      const south = Math.min(...points.map((point) => point.north)) - padding;
      const north = commonNorth;
      const ring = [
        { east: west, north: south }, { east, north: south },
        { east, north }, { east: west, north }, { east: west, north: south },
      ].map((point) => fromLocalMeters(point, origin, bearing));
      return [{
        type: "Feature",
        id: `collection-section-${definition.id}`,
        properties: { collection: definition.id, color: definition.sectionColor },
        geometry: { type: "Polygon", coordinates: [ring] },
      }];
    }),
  };
}
