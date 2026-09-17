import { loadNavigationData } from "../../navigation-data.js";

export const dynamic = "force-static";

export async function GET() {
  const collection = await loadNavigationData();
  const routingProperties = new Set(["alt_name", "debug_id", "route_confirmed", "route_sources", "source", "sources", "target", "wayfinding_type"]);
  return Response.json({
    ...collection,
    features: collection.features.map((feature) => ({
      ...feature,
      properties: Object.fromEntries(Object.entries(feature.properties || {}).filter(([name]) => routingProperties.has(name))),
    })),
  });
}
