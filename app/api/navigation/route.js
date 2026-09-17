import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-static";

export async function GET() {
  const file = path.join(process.cwd(), "geojson", "navigation.geojson");
  const collection = JSON.parse(await readFile(file, "utf8"));
  const routingProperties = new Set(["alt_name", "debug_id", "route_confirmed", "source", "sources", "target", "wayfinding_type"]);
  return Response.json({
    ...collection,
    features: collection.features.map((feature) => ({
      ...feature,
      properties: Object.fromEntries(Object.entries(feature.properties || {}).filter(([name]) => routingProperties.has(name))),
    })),
  });
}
