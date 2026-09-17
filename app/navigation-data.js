import { readFile } from "node:fs/promises";
import path from "node:path";

export const NAVIGATION_FILES = ["navigation_path.geojson", "navigation_access.geojson", "navigation_stop.geojson"];

export async function loadNavigationData() {
  const collections = await Promise.all(NAVIGATION_FILES.map(async (name) => JSON.parse(await readFile(path.join(process.cwd(), "geojson", name), "utf8"))));
  return { type: "FeatureCollection", features: collections.flatMap((collection) => collection.features) };
}

const coordinateKey = (coordinate) => coordinate.map((value) => value.toFixed(9)).join(",");

function intersection(a, b, c, d) {
  const denominator = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (Math.abs(denominator) < 1e-14) return null;
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / denominator;
  const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] : null;
}

export function generatedJunctionFeatures(collection) {
  const lines = collection.features.filter((feature) => feature.properties?.wayfinding_type === "walking_path").map((feature) => feature.geometry.coordinates);
  const coordinates = new Map();
  for (const line of lines) for (const coordinate of [line[0], line.at(-1)]) coordinates.set(coordinateKey(coordinate), coordinate);
  for (let first = 0; first < lines.length; first++) for (let second = first + 1; second < lines.length; second++) {
    const coordinate = intersection(lines[first][0], lines[first].at(-1), lines[second][0], lines[second].at(-1));
    if (coordinate) coordinates.set(coordinateKey(coordinate), coordinate);
  }
  return [...coordinates.values()].sort((a, b) => coordinateKey(a).localeCompare(coordinateKey(b))).map((coordinate, index) => ({
    type: "Feature",
    id: `generated-junction-${index + 1}`,
    properties: { wayfinding_type: "walking_junction", debug_id: `JCT-${String(index + 1).padStart(3, "0")}`, generated: true },
    geometry: { type: "Point", coordinates: coordinate },
  }));
}
