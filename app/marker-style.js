import { UBC_NORTH_BEARING } from "./constants.js";
import { knownAmenityPointFilter } from "./amenity-style.js";
import { knownPointFeatureFilter } from "./point-feature-style.js";

export const ICON_EXHIBIT_TYPES = ["floor"];
export const ICON_LAYER_ID = "imdf-exhibit-icons";
export const CABINET_EXHIBIT_ICON_LAYER_ID = "imdf-cabinet-exhibit-icons";
export { UBC_NORTH_BEARING };
export const DRAWER_COUNT_OFFSET_EM = 0.9;
export const DRAWER_MARKER_OFFSET_PX = 11;
export const EXHIBIT_ICON_SCALE = { minZoom: 17, min: 0.525, maxZoom: 21, max: 0.75 };
export const FULL_CIRCLE_ICON_SCALE = { minZoom: 17, min: 0.394, maxZoom: 21, max: 0.5625 };
export const DRAWER_TOP_ICON_SCALE = FULL_CIRCLE_ICON_SCALE.max;
const DRAWER_GROUPS_COUNT_SIZE = 12;
export const NUMBERED_MARKER_SCALE = { ...EXHIBIT_ICON_SCALE };

export const numberedMarkerSizeExpression = [
  "interpolate", ["linear"], ["zoom"],
  NUMBERED_MARKER_SCALE.minZoom, NUMBERED_MARKER_SCALE.min,
  NUMBERED_MARKER_SCALE.maxZoom, NUMBERED_MARKER_SCALE.max,
];
export const numberedMarkerTextSizeExpression = [
  "interpolate", ["linear"], ["zoom"],
  NUMBERED_MARKER_SCALE.minZoom, DRAWER_GROUPS_COUNT_SIZE * NUMBERED_MARKER_SCALE.min / NUMBERED_MARKER_SCALE.max,
  NUMBERED_MARKER_SCALE.maxZoom, DRAWER_GROUPS_COUNT_SIZE,
];

export const exhibitPointFilter = [
  "all",
  knownAmenityPointFilter,
  knownPointFeatureFilter,
  ["!=", ["get", "local_category"], "cabinet_exhibit"],
  ["!=", ["get", "local_category"], "fossil_excavation_exhibit"],
  ["!", ["all", ["==", ["get", "viewer_layer"], "exhibit"], ["has", "fixture_alt_names"]]],
  ["!", ["in", ["get", "exhibit_type"], ["literal", ICON_EXHIBIT_TYPES]]],
];

export function cabinetExhibitGroups(collection) {
  const features = collection?.features || [];
  const labelsByFixture = new Map();
  const groups = new Map();
  for (const feature of features) {
    const properties = feature.properties || {};
    if ((properties.viewer_layer || feature.feature_type) !== "exhibit") continue;
    const fixtureName = properties.fixture_alt_names?.find((name) => /^col_\d+_cab_\d+$/.test(name));
    if (!fixtureName) continue;
    if (properties.exhibit_type === "label") {
      labelsByFixture.set(fixtureName, feature);
      continue;
    }
    if (["drawer", "floor"].includes(properties.exhibit_type)) continue;
    groups.set(fixtureName, [...(groups.get(fixtureName) || []), feature]);
  }
  return {
    type: "FeatureCollection",
    features: [...groups.entries()].map(([fixtureName, exhibits]) => {
      const reference = exhibits.find((feature) => Number.isFinite(feature.properties?.marker_bearing)) || labelsByFixture.get(fixtureName) || exhibits[0];
      const count = exhibits.reduce((sum, feature) => sum + (feature.properties?.display_count || 1), 0);
      const fixtureId = exhibits.find((feature) => feature.properties?.fixture_id)?.properties.fixture_id
        || exhibits.flatMap((feature) => feature.properties?.fixture_ids || [])[0];
      const bearing = reference.properties?.marker_bearing || 0;
      return {
        type: "Feature",
        id: fixtureId || `cabinet-exhibits-${fixtureName}`,
        properties: {
          viewer_feature_id: fixtureId || null,
          fixture_alt_name: fixtureName,
          exhibit_count: count,
          marker_bearing: bearing,
          count_offset: countOffsetForBearing(bearing),
        },
        geometry: reference.geometry,
      };
    }),
  };
}

export const cabinetExhibitCountFilter = [">", ["get", "exhibit_count"], 1];
export const cabinetExhibitIconSizeExpression = [
  "interpolate", ["linear"], ["zoom"],
  EXHIBIT_ICON_SCALE.minZoom, EXHIBIT_ICON_SCALE.min,
  EXHIBIT_ICON_SCALE.maxZoom, EXHIBIT_ICON_SCALE.max,
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

export const exhibitImageExpression = "exhibit-full-circle";

export function drawerSourceOptions(data) {
  return { type: "geojson", data };
}

export const drawerCountFilter = ["!=", ["get", "marker_shape"], "full-circle"];
