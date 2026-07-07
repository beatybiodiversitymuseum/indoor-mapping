import { readFile } from "node:fs/promises";
import path from "node:path";
import { LAYERS } from "../../constants";

export const dynamic = "force-static";

export async function GET() {
  const collections = await Promise.all(LAYERS.map(async ({ id: layer }) => {
    const file = path.join(process.cwd(), "geojson", `${layer}.geojson`);
    const collection = JSON.parse(await readFile(file, "utf8"));
    return collection.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        viewer_feature_id: feature.id ?? null,
        viewer_layer: layer,
      },
    }));
  }));

  const features = collections.flat();
  const unitLevels = new Map(
    features
      .filter((feature) => feature.properties.viewer_layer === "unit")
      .map((feature) => [feature.id, feature.properties.level_id]),
  );
  const resolvedFeatures = features.map((feature) => {
    const properties = feature.properties;
    const referencedUnitLevel = properties.unit_ids?.map((id) => unitLevels.get(id)).find(Boolean);
    return {
      ...feature,
      properties: {
        ...properties,
        viewer_level_id: properties.level_id || referencedUnitLevel || null,
      },
    };
  });

  return Response.json({ type: "FeatureCollection", features: resolvedFeatures });
}
