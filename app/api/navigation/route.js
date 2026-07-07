import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-static";

export async function GET() {
  const file = path.join(process.cwd(), "geojson", "navigation.geojson");
  return Response.json(JSON.parse(await readFile(file, "utf8")));
}
