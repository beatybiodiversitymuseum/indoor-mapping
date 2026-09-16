#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const navigationPath = new URL("../geojson/navigation.geojson", import.meta.url);
const navigation = JSON.parse(await readFile(navigationPath, "utf8"));

const EARTH_RADIUS_METERS = 6371000;
const UBC_NORTH_BEARING = 332.53;
const EAST_BEARING = (UBC_NORTH_BEARING + 90) % 360;
const radians = EAST_BEARING * Math.PI / 180;
const coordinateKey = (coordinate) => coordinate.map((value) => value.toFixed(9)).join(",");

const corrections = [
  { pathIds: ["PATH-015", "PATH-089", "PATH-090"], shiftMeters: 0.42894 },
  { pathIds: ["PATH-038", "PATH-128", "PATH-129"], shiftMeters: 0.51351 },
  { pathIds: ["PATH-193", "PATH-057", "PATH-058", "PATH-054"], shiftMeters: -0.43121 },
];

function translated(coordinate, meters) {
  const eastMeters = Math.sin(radians) * meters;
  const northMeters = Math.cos(radians) * meters;
  const latitude = coordinate[1] * Math.PI / 180;
  return [
    coordinate[0] + eastMeters / (Math.cos(latitude) * EARTH_RADIUS_METERS) * 180 / Math.PI,
    coordinate[1] + northMeters / EARTH_RADIUS_METERS * 180 / Math.PI,
  ].map((value) => Number(value.toFixed(12)));
}

for (const correction of corrections) {
  const pathIdSet = new Set(correction.pathIds);
  const paths = navigation.features.filter((feature) => pathIdSet.has(feature.properties?.debug_id));
  if (paths.length !== correction.pathIds.length) throw new Error(`Missing path in ${correction.pathIds.join(", ")}`);
  if (paths.every((path) => path.properties.metadata?.manual_corridor_centering?.shift_meters_east === correction.shiftMeters)) continue;

  const movedNodes = new Map();
  for (const path of paths) {
    for (const coordinate of path.geometry.coordinates) {
      movedNodes.set(coordinateKey(coordinate), translated(coordinate, correction.shiftMeters));
    }
  }

  for (const feature of navigation.features) {
    const properties = feature.properties || {};
    let movedAtNode = false;
    if (feature.geometry?.type === "LineString" && properties.wayfinding_type === "walking_path") {
      feature.geometry.coordinates = feature.geometry.coordinates.map((coordinate) => movedNodes.get(coordinateKey(coordinate)) || coordinate);
      if (feature.geometry.coordinates.some((coordinate) => [...movedNodes.values()].includes(coordinate))) {
        properties.start_point = feature.geometry.coordinates[0];
        properties.end_point = feature.geometry.coordinates.at(-1);
        properties.display_point = {
          type: "Point",
          coordinates: feature.geometry.coordinates[0].map((value, index) => Number(((value + feature.geometry.coordinates.at(-1)[index]) / 2).toFixed(12))),
        };
      }
    }

    if (feature.geometry?.type === "Point" && movedNodes.has(coordinateKey(feature.geometry.coordinates))) {
      feature.geometry.coordinates = movedNodes.get(coordinateKey(feature.geometry.coordinates));
      if (properties.display_point?.coordinates) properties.display_point.coordinates = feature.geometry.coordinates;
      movedAtNode = true;
    }

    const projectedPathIds = properties.metadata?.projected_to_paths?.map((path) => path.projected_to_path_debug_id) || [];
    if (!movedAtNode && feature.geometry?.type === "Point" && properties.wayfinding_type === "access_projection" && projectedPathIds.some((id) => pathIdSet.has(id))) {
      feature.geometry.coordinates = translated(feature.geometry.coordinates, correction.shiftMeters);
      if (properties.display_point?.coordinates) properties.display_point.coordinates = feature.geometry.coordinates;
      properties.metadata.manual_corridor_centering = {
        shift_meters_east: correction.shiftMeters,
        path_debug_ids: correction.pathIds,
      };
    }
  }

  for (const path of paths) {
    path.properties.metadata.manual_corridor_centering = {
      shift_meters_east: correction.shiftMeters,
      path_debug_ids: correction.pathIds,
    };
  }
}

await writeFile(navigationPath, `${JSON.stringify(navigation, null, 2)}\n`);
