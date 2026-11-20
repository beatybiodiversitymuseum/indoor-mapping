// Local tangent-plane measurements are appropriate for museum-scale drawings.
const RADIUS = 6371008.8;
const radians = (degrees) => degrees * Math.PI / 180;

export function drawingGeometry(type, vertices) {
  if (type === "Point") return { type, coordinates: vertices[0] };
  if (type === "Polygon") return { type, coordinates: [[...vertices, vertices[0]]] };
  return { type, coordinates: vertices };
}

export function drawingVertices(geometry) {
  if (geometry.type === "Point") return [geometry.coordinates];
  if (geometry.type === "Polygon") return geometry.coordinates[0].slice(0, -1);
  return geometry.coordinates;
}

export function measureDrawing(type, vertices) {
  if (type === "Point" || vertices.length < 2) return "";
  const [originX, originY] = vertices[0];
  const points = vertices.map(([x, y]) => [radians(x - originX) * RADIUS * Math.cos(radians(originY)), radians(y - originY) * RADIUS]);
  let length = 0;
  let twiceArea = 0;
  for (let i = 0; i < points.length - 1; i++) length += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
  if (type !== "Polygon" || points.length < 3) return `Length: ${length.toFixed(1)} m`;
  length += Math.hypot(...points.at(-1));
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    twiceArea += points[i][0] * next[1] - next[0] * points[i][1];
  }
  return `Area: ${(Math.abs(twiceArea) / 2).toFixed(1)} m² · Perimeter: ${length.toFixed(1)} m`;
}

export function drawingSummary(geometry) {
  const vertices = drawingVertices(geometry);
  if (geometry.type === "Point") return "Point";
  return `${geometry.type === "Polygon" ? "Polygon" : "Polyline"} · ${vertices.length} vertices · ${measureDrawing(geometry.type, vertices)}`;
}

export function drawingMeasurementLabels(type, vertices, referencePoint = null) {
  if (!vertices.length && !referencePoint) return [];
  const midpoint = (a, b) => a.map((value, index) => (value + b[index]) / 2);
  const distance = (a, b) => measureDrawing("LineString", [a, b]).replace("Length: ", "");
  if (referencePoint) return [
    { coordinates: referencePoint, text: "Reference point", hoverCoordinates: [referencePoint] },
    ...vertices.map((point, index) => ({ coordinates: midpoint(referencePoint, point), text: `P${index + 1}: ${distance(referencePoint, point)} from reference`, hoverCoordinates: [referencePoint, point] })),
    ...(type !== "Point" && vertices.length > 1 ? [{ coordinates: vertices.at(-1), text: measureDrawing(type, vertices), hoverCoordinates: type === "Polygon" ? [...vertices, vertices[0]] : vertices }] : []),
  ];
  if (vertices.length < 2 || type === "Point") return [];
  const labels = vertices.slice(1).map((point, index) => ({ coordinates: midpoint(vertices[index], point), text: distance(vertices[index], point), hoverCoordinates: [vertices[index], point] }));
  if (type === "Polygon" && vertices.length > 2) labels.push({ coordinates: midpoint(vertices.at(-1), vertices[0]), text: distance(vertices.at(-1), vertices[0]), hoverCoordinates: [vertices.at(-1), vertices[0]] });
  labels.push({ coordinates: vertices.at(-1), text: measureDrawing(type, vertices), hoverCoordinates: type === "Polygon" ? [...vertices, vertices[0]] : vertices });
  return labels;
}

export function referenceMeasurementLines(referencePoint, vertices) {
  if (!referencePoint) return [];
  return vertices.map((point) => ({ type: "Feature", properties: { reference_measurement: true }, geometry: { type: "LineString", coordinates: [referencePoint, point] } }));
}

export function relativeDrawingPoints(referencePoint, vertices) {
  return vertices.map(([x, y]) => {
    const east = radians(x - referencePoint[0]) * RADIUS * Math.cos(radians(referencePoint[1]));
    const north = radians(y - referencePoint[1]) * RADIUS;
    return { east_m: Number(east.toFixed(3)), north_m: Number(north.toFixed(3)), distance_m: Number(Math.hypot(east, north).toFixed(3)) };
  });
}
