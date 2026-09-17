import { loadMapData, mapShellData } from "../../map-data-store.js";

export const dynamic = "force-static";

export async function GET() {
  return Response.json(mapShellData(await loadMapData()));
}
