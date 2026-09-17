import { readFile } from "node:fs/promises";
import path from "node:path";
import { LAYERS } from "./constants.js";
import { collectionForFixture } from "./collection-style.js";

let mapDataPromise;

async function readMapData() {
  const collections = await Promise.all(LAYERS.map(async ({ id: layer }) => {
    const file = path.join(process.cwd(), "geojson", `${layer}.geojson`);
    const collection = JSON.parse(await readFile(file, "utf8"));
    return collection.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        viewer_feature_id: feature.id ?? null,
        viewer_layer: layer,
        ...(layer === "fixture" && collectionForFixture(feature) ? { viewer_collection: collectionForFixture(feature).id } : {}),
      },
    }));
  }));

  const features = collections.flat();
  const unitLevels = new Map(features.filter((feature) => feature.properties.viewer_layer === "unit").map((feature) => [feature.id, feature.properties.level_id]));
  return {
    type: "FeatureCollection",
    features: features.map((feature) => {
      const properties = feature.properties;
      const referencedUnitLevel = properties.unit_ids?.map((id) => unitLevels.get(id)).find(Boolean);
      return { ...feature, properties: { ...properties, viewer_level_id: properties.level_id || referencedUnitLevel || null } };
    }),
  };
}

export function loadMapData() {
  mapDataPromise ||= readMapData();
  return mapDataPromise;
}

const deferredPropertyNames = new Set([
  "archive", "details", "image", "image_transcriptions", "location_correction",
  "metadata", "note", "photo_text", "sources", "specimens", "taxonomy",
]);

export function mapShellData(collection) {
  return {
    ...collection,
    features: collection.features.map((feature) => ({
      ...feature,
      properties: Object.fromEntries(Object.entries(feature.properties).filter(([name]) => !deferredPropertyNames.has(name))),
    })),
  };
}
