export const WHALE_IMAGE_ID = "floor-whale";
export const WHALE_IMAGE_HEIGHT = 512;
export const WHALE_PHYSICAL_HEIGHT_METERS = 31.97375481493046;
// Doubling icon pixels for every zoom step keeps the artwork fixed to the same
// physical floor footprint instead of letting it grow or shrink geographically.
export const WHALE_ICON_SCALE = { minZoom: 0, min: 0.0000006113052368164063, maxZoom: 22, max: 2.564 };

export function whaleOverlayFeature(collection) {
  const whale = (collection?.features || []).find((feature) =>
    feature.properties?.viewer_layer === "exhibit"
    && feature.properties?.alt_name?.en === "blue_whale_skeleton"
  );
  if (!whale || whale.geometry?.type !== "Point") return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      id: "blue-whale-floor-graphic",
      properties: {},
      geometry: { type: "Point", coordinates: whale.geometry.coordinates },
    }],
  };
}
