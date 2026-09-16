export const ICON_EXHIBIT_TYPES = ["window", "shadowbox", "floor"];
export const ICON_LAYER_ID = "imdf-exhibit-icons";
export const UBC_NORTH_BEARING = 332.53;
export const DRAWER_COUNT_OFFSET_EM = 0.9;
export const DRAWER_MARKER_OFFSET_PX = 11;
export const DRAWER_TOP_ICON_SCALE = 0.75;
export const EXHIBIT_ICON_SCALE = { minZoom: 17, min: 0.525, maxZoom: 21, max: 0.75 };

export const exhibitPointFilter = [
  "all",
  ["!=", ["get", "local_category"], "cabinet_exhibit"],
  ["!=", ["get", "local_category"], "fossil_excavation_exhibit"],
  ["!", ["in", ["get", "exhibit_type"], ["literal", ICON_EXHIBIT_TYPES]]],
];

export function drawerMarkerShape(features) {
  return features.some((feature) =>
    feature.properties?.fixture_alt_names?.some((name) => /_top$/.test(name))
    || /Top$/.test(feature.properties?.archive?.public_reference_code || ""),
  ) ? "full-circle" : "half-circle-tab";
}

export function countOffsetForBearing(bearing) {
  const radians = ((bearing - UBC_NORTH_BEARING) * Math.PI) / 180;
  const clean = (value) => Number(value.toFixed(3)) || 0;
  return [
    clean(Math.sin(radians) * DRAWER_COUNT_OFFSET_EM),
    clean(-Math.cos(radians) * DRAWER_COUNT_OFFSET_EM),
  ];
}

export const exhibitImageExpression = [
  "match", ["get", "exhibit_type"],
  "floor", "exhibit-full-circle",
  "exhibit-half-circle",
];

export function drawerSourceOptions(data) {
  return { type: "geojson", data };
}

export const drawerCountFilter = ["!=", ["get", "marker_shape"], "full-circle"];
