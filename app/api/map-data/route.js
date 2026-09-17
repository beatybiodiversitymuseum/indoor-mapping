import { loadMapData } from "../../map-data-store.js";

export const dynamic = "force-static";

export async function GET() {
  return Response.json(await loadMapData());
}
