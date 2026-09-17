export const AMENITY_ICON_CATEGORIES = {
  fireextinguisher: "fire-extinguisher",
  restroom: "toilet",
  toilet: "toilet",
  bathroom: "toilet",
  waste: "trash",
  sink: "sink",
  seating: "seating",
  equipment: "microscope",
};

export const AMENITY_ICON_IDS = [...new Set(Object.values(AMENITY_ICON_CATEGORIES))];
export const AMENITY_ICON_SCALE = { minZoom: 17, min: 0.58, maxZoom: 21, max: 0.82 };
export const AMENITY_ICON_SIZE_EXPRESSION = [
  "interpolate", ["linear"], ["zoom"],
  AMENITY_ICON_SCALE.minZoom,
  ["case", ["==", ["get", "amenity_icon"], "fire-extinguisher"], AMENITY_ICON_SCALE.min * 0.5, AMENITY_ICON_SCALE.min],
  AMENITY_ICON_SCALE.maxZoom,
  ["case", ["==", ["get", "amenity_icon"], "fire-extinguisher"], AMENITY_ICON_SCALE.max * 0.5, AMENITY_ICON_SCALE.max],
];

export function amenityIconName(feature) {
  const properties = feature?.properties || {};
  if (properties.viewer_layer === "unit" && properties.source_layer === "Bathrooms") return "toilet";
  if (properties.viewer_layer !== "amenity") return null;
  return AMENITY_ICON_CATEGORIES[String(properties.category || "").toLowerCase()] || null;
}

export function amenityIconFeatures(collection) {
  return {
    type: "FeatureCollection",
    features: (collection?.features || []).flatMap((feature) => {
      const icon = amenityIconName(feature);
      if (!icon) return [];
      const coordinates = feature.geometry?.type === "Point"
        ? feature.geometry.coordinates
        : feature.properties?.display_point?.coordinates;
      if (!coordinates) return [];
      return [{
        type: "Feature",
        id: feature.id,
        properties: { ...feature.properties, amenity_icon: icon },
        geometry: { type: "Point", coordinates },
      }];
    }),
  };
}

export const knownAmenityPointFilter = [
  "!",
  [
    "all",
    ["==", ["get", "viewer_layer"], "amenity"],
    ["in", ["downcase", ["to-string", ["get", "category"]]], ["literal", Object.keys(AMENITY_ICON_CATEGORIES)]],
  ],
];
