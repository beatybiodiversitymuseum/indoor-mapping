export const LAYERS = [
  { id: "venue", label: "Venue", color: "#2563a6", enabledByDefault: false },
  { id: "building", label: "Buildings", color: "#64748b", enabledByDefault: false },
  { id: "footprint", label: "Footprints", color: "#8898a7", enabledByDefault: true },
  { id: "level", label: "Levels", color: "#2f766d", enabledByDefault: true },
  { id: "unit", label: "Units", color: "#89a35c", enabledByDefault: true },
  { id: "detail", label: "Details", color: "#c9943b", enabledByDefault: true },
  { id: "fixture", label: "Fixtures", color: "#8a5a44", enabledByDefault: true },
  { id: "opening", label: "Openings", color: "#d85d4d", enabledByDefault: true },
  { id: "kiosk", label: "Kiosks", color: "#7c5ab8", enabledByDefault: true },
  { id: "amenity", label: "Amenities", color: "#dd3f72", enabledByDefault: true },
];

export const LEVELS = [
  { id: "all", label: "All" },
  { id: "553481bd-bdec-4fe2-8e59-6110190e9b94", label: "G" },
  { id: "41d0e8ca-d315-4b25-938c-7955db2daf2e", label: "B" },
];

export const MAP = {
  center: [-123.25065, 49.26335],
  initialZoom: 19.2,
  featureZoom: 21,
  maxZoom: 24,
  flyDurationMs: 900,
  backgroundColor: "#e8ecee",
};

export const BASEMAP = {
  tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
  tileSize: 256,
  attribution: "© OpenStreetMap contributors",
  saturation: -0.65,
  opacity: 0.7,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
};

export const DRAWER_GROUPS = {
  minZoom: 19,
  clusterMaxZoom: 20,
  sourceMaxZoom: MAP.maxZoom,
  clusterRadius: 20,
  radius: 18,
  color: "#176d65",
  strokeColor: "#fff",
  strokeWidth: 2,
  countFont: "Noto Sans Regular",
  countFontSize: 12,
  leafLimit: 1000,
  leafOffset: 0,
};

export const MAP_LAYERS = {
  fallbackColor: "#64748b",
  fillOpacity: { fixture: 0.46, unit: 0.18, level: 0.1, fallback: 0.28 },
  lineWidth: { venue: 2.5, level: 2, fallback: 1.2 },
  lineOpacity: 0.9,
  pointRadius: { minZoom: 17, min: 3, maxZoom: 21, max: 7 },
  pointStrokeColor: "#fff",
  pointStrokeWidth: 1.5,
};

export const POINT_CATEGORIES = {
  cabinet: "cabinet_exhibit",
  drawer: "drawer_exhibit",
  fossilExcavation: "fossil_excavation_exhibit",
};

export const VIEWER = {
  searchResultLimit: 8,
  mobileMediaQuery: "(max-width: 700px)",
};

export const ROUTING = {
  coordinatePrecision: 9,
  earthRadiusMeters: 6371000,
  connectionToleranceMeters: 0.15,
  collinearToleranceMeters: 0.01,
  intersectionEpsilon: 1e-12,
  lineColor: "#0878a4",
  lineCasingColor: "#fff",
  lineWidth: 5,
  lineCasingWidth: 8,
  lineOpacity: 0.95,
  smoothingDistanceMeters: 0.3,
  smoothingSteps: 3,
  smoothingSegmentDivisor: 3,
  collinearDisplayThreshold: 0.001,
  startColor: "#176d65",
  destinationColor: "#c74444",
  endpointRadius: 10,
  endpointStrokeColor: "#fff",
  endpointStrokeWidth: 3,
  endpointTextColor: "#fff",
  endpointFont: "Noto Sans Regular",
  endpointFontSize: 11,
  fitPadding: 70,
  fitMaxZoom: 22,
  fitDurationMs: 700,
};

export const GEOJSON = {
  coordinateNestingDepth: 3,
  coordinateDimensions: 2,
  mapStyleVersion: 8,
};

export const ICON_SIZE = {
  brand: 19,
  search: 17,
  clear: 15,
  section: 16,
  feature: 18,
};
