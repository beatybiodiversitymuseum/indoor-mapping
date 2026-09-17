export const POINT_FEATURE_ICON_IDS = ["door", "emergency-exit", "accessible-entrance", "staff-door", "table", "projector", "screen", "fixture"];
export const POINT_FEATURE_ICON_SCALE = { minZoom: 17, min: 0.58, maxZoom: 21, max: 0.82 };

export function pointFeatureIconName(feature) {
  const properties = feature?.properties || {};
  const name = `${properties.name?.en || ""} ${properties.alt_name?.en || ""}`.toLowerCase();
  if (properties.viewer_layer === "opening") {
    if (name.includes("emergency")) return "emergency-exit";
    if (name.includes("ramp") || name.includes("accessibility")) return "accessible-entrance";
    if (name.includes("staff")) return "staff-door";
    return "door";
  }
  if (properties.viewer_layer === "fixture") {
    if (name.includes("table")) return "table";
    if (name.includes("projection booth")) return "projector";
    if (name.includes("screen")) return "screen";
    return "fixture";
  }
  return null;
}

export function pointFeatureIconFeatures(collection) {
  return {
    type: "FeatureCollection",
    features: (collection?.features || []).flatMap((feature) => {
      if (feature.geometry?.type !== "Point") return [];
      const icon = pointFeatureIconName(feature);
      if (!icon) return [];
      return [{ ...feature, properties: { ...feature.properties, point_feature_icon: icon } }];
    }),
  };
}

export const knownPointFeatureFilter = [
  "!",
  ["in", ["get", "viewer_layer"], ["literal", ["opening", "fixture"]]],
];
