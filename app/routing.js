import { UndirectedGraph } from "graphology";
import { dijkstra } from "graphology-shortest-path";
import { ROUTING } from "./constants.js";

const coordinateKey = (coordinate) => coordinate.map((value) => value.toFixed(ROUTING.coordinatePrecision)).join(",");

function segmentIntersection(a, b, c, d) {
  const denominator = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (Math.abs(denominator) < ROUTING.intersectionEpsilon) return null;
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / denominator;
  const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { coordinate: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], fractionA: t, fractionB: u };
}

function distanceMeters(a, b) {
  const latitude = ((a[1] + b[1]) / 2) * Math.PI / 180;
  const x = (b[0] - a[0]) * Math.cos(latitude) * ROUTING.earthRadiusMeters * Math.PI / 180;
  const y = (b[1] - a[1]) * ROUTING.earthRadiusMeters * Math.PI / 180;
  return Math.hypot(x, y);
}

function lineLength(coordinates) {
  return coordinates.slice(1).reduce((total, coordinate, index) => total + distanceMeters(coordinates[index], coordinate), 0);
}

function englishAltName(feature) {
  const value = feature?.properties?.alt_name;
  return typeof value === "string" ? value : value?.en;
}

function fractionOnSegment(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const fraction = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy);
  if (fraction < 0 || fraction > 1) return null;
  const projected = [start[0] + fraction * dx, start[1] + fraction * dy];
  return distanceMeters(point, projected) <= ROUTING.collinearToleranceMeters ? fraction : null;
}

function boxesOverlap(a, b) {
  const aLng = a.coordinates.map((coordinate) => coordinate[0]);
  const aLat = a.coordinates.map((coordinate) => coordinate[1]);
  const bLng = b.coordinates.map((coordinate) => coordinate[0]);
  const bLat = b.coordinates.map((coordinate) => coordinate[1]);
  return Math.max(...aLng) >= Math.min(...bLng) && Math.max(...bLng) >= Math.min(...aLng) && Math.max(...aLat) >= Math.min(...bLat) && Math.max(...bLat) >= Math.min(...aLat);
}

export function buildRoutingNetwork(collection) {
  const graph = new UndirectedGraph();
  const nodeCoordinates = new Map();
  const connections = new Map();
  const navigationNodes = new Map(
    collection.features
      .filter((feature) => feature.properties?.wayfinding_type === "walking_grid_point")
      .map((feature) => [englishAltName(feature), feature.geometry.coordinates]),
  );
  const routeLinesByKey = new Map();
  const connectionRecords = [];

  for (const feature of collection.features.filter((item) => item.geometry?.type === "LineString" && item.properties?.route_confirmed)) {
    const coordinates = feature.geometry.coordinates;
    const endpointKeys = [coordinateKey(coordinates[0]), coordinateKey(coordinates.at(-1))].sort();
    const key = endpointKeys.join("|");
    let line = routeLinesByKey.get(key);
    if (!line) {
      line = { coordinates, splits: [{ coordinate: coordinates[0], fraction: 0 }, { coordinate: coordinates.at(-1), fraction: 1 }], isWalking: false, terminalFractions: new Set() };
      routeLinesByKey.set(key, line);
    }
    if (feature.properties.wayfinding_type === "walking_path") line.isWalking = true;
    if (feature.properties.wayfinding_type !== "connection_line") continue;

    const fixtureId = feature.properties.source;
    const targetCoordinate = navigationNodes.get(feature.properties.target);
    if (!fixtureId || !targetCoordinate) continue;
    const firstDistance = distanceMeters(coordinates[0], targetCoordinate);
    const lastDistance = distanceMeters(coordinates.at(-1), targetCoordinate);
    if (Math.min(firstDistance, lastDistance) > ROUTING.connectionToleranceMeters) continue;
    const sourceCoordinate = firstDistance < lastDistance ? coordinates.at(-1) : coordinates[0];
    const sourceFraction = distanceMeters(sourceCoordinate, line.coordinates[0]) < distanceMeters(sourceCoordinate, line.coordinates.at(-1)) ? 0 : 1;
    line.terminalFractions.add(sourceFraction);
    connectionRecords.push({ fixtureId, line, sourceCoordinate, sourceFraction });
  }

  const routeLines = [...routeLinesByKey.values()];
  for (let firstIndex = 0; firstIndex < routeLines.length; firstIndex++) {
    const first = routeLines[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < routeLines.length; secondIndex++) {
      const second = routeLines[secondIndex];
      if (!boxesOverlap(first, second)) continue;
      const intersection = segmentIntersection(first.coordinates[0], first.coordinates.at(-1), second.coordinates[0], second.coordinates.at(-1));
      if (intersection) {
        first.splits.push({ coordinate: intersection.coordinate, fraction: intersection.fractionA });
        second.splits.push({ coordinate: intersection.coordinate, fraction: intersection.fractionB });
        continue;
      }
      for (const [coordinate, fraction] of [[first.coordinates[0], 0], [first.coordinates.at(-1), 1]]) {
        const otherFraction = fractionOnSegment(coordinate, second.coordinates[0], second.coordinates.at(-1));
        if (otherFraction !== null) second.splits.push({ coordinate, fraction: otherFraction });
      }
      for (const [coordinate, fraction] of [[second.coordinates[0], 0], [second.coordinates.at(-1), 1]]) {
        const otherFraction = fractionOnSegment(coordinate, first.coordinates[0], first.coordinates.at(-1));
        if (otherFraction !== null) first.splits.push({ coordinate, fraction: otherFraction });
      }
    }
  }

  for (const line of routeLines) {
    const orderedSplits = [...new Map(line.splits.map((split) => [coordinateKey(split.coordinate), split])).values()].sort((a, b) => a.fraction - b.fraction);
    line.orderedSplits = orderedSplits;
    for (const split of orderedSplits) {
      const node = coordinateKey(split.coordinate);
      if (!graph.hasNode(node)) graph.addNode(node);
      nodeCoordinates.set(node, split.coordinate);
    }
    for (let index = 1; index < orderedSplits.length; index++) {
      if (!line.isWalking && ((index === 1 && line.terminalFractions.has(0)) || (index === orderedSplits.length - 1 && line.terminalFractions.has(1)))) continue;
      const sourceCoordinate = orderedSplits[index - 1].coordinate;
      const targetCoordinate = orderedSplits[index].coordinate;
      const source = coordinateKey(sourceCoordinate);
      const target = coordinateKey(targetCoordinate);
      const segmentCoordinates = [sourceCoordinate, targetCoordinate];
      const weight = lineLength(segmentCoordinates);
      if (!graph.hasEdge(source, target)) graph.addUndirectedEdge(source, target, { weight, coordinates: segmentCoordinates });
      else if (weight < graph.getEdgeAttribute(graph.edge(source, target), "weight")) graph.mergeEdgeAttributes(graph.edge(source, target), { weight, coordinates: segmentCoordinates });
    }
  }

  for (const record of connectionRecords) {
    for (const split of record.line.orderedSplits) {
      if (Math.abs(split.fraction - record.sourceFraction) < ROUTING.intersectionEpsilon) continue;
      const targetNode = coordinateKey(split.coordinate);
      if (!graph.hasNode(targetNode) || networkDegree(graph, targetNode) === 0) continue;
      const coordinates = [record.sourceCoordinate, split.coordinate];
      const connection = { fixtureId: record.fixtureId, targetNode, coordinates, weight: lineLength(coordinates) };
      connections.set(record.fixtureId, [...(connections.get(record.fixtureId) || []), connection]);
    }
  }

  return { graph, connections, nodeCoordinates };
}

function networkDegree(graph, node) {
  return graph.degree(node);
}

export function fixtureRouteId(feature) {
  return feature?.properties?.alt_name?.en || null;
}

export function isRoutableFeature(network, feature) {
  return network?.connections.has(fixtureRouteId(feature)) || false;
}

export function findApprovedRoute(network, fromFeature, toFeature) {
  const fromId = fixtureRouteId(fromFeature);
  const toId = fixtureRouteId(toFeature);
  if (!fromId || !toId || fromId === toId) return null;
  const starts = network.connections.get(fromId) || [];
  const destinations = network.connections.get(toId) || [];
  let best = null;

  for (const start of starts) {
    for (const destination of destinations) {
      const nodePath = dijkstra.bidirectional(network.graph, start.targetNode, destination.targetNode, "weight");
      if (!nodePath) continue;
      const walkingEdges = nodePath.slice(1).map((node, index) => network.graph.edge(nodePath[index], node));
      const weight = start.weight + destination.weight + walkingEdges.reduce((sum, edge) => sum + network.graph.getEdgeAttribute(edge, "weight"), 0);
      if (!best || weight < best.weight) best = { start, destination, nodePath, walkingEdges, weight };
    }
  }
  if (!best) return null;

  const lines = [
    best.start.coordinates,
    ...best.walkingEdges.map((edge, index) => {
      const coordinates = network.graph.getEdgeAttribute(edge, "coordinates");
      const expectedStart = network.nodeCoordinates.get(best.nodePath[index]);
      return coordinateKey(coordinates[0]) === coordinateKey(expectedStart) ? coordinates : [...coordinates].reverse();
    }),
    [...best.destination.coordinates].reverse(),
  ];
  return {
    type: "FeatureCollection",
    features: lines.map((coordinates, index) => ({
      type: "Feature",
      properties: { segment_index: index },
      geometry: { type: "LineString", coordinates },
    })),
    distanceMeters: best.weight,
  };
}
