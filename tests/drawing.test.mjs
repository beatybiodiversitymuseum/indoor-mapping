import assert from "node:assert/strict";
import test from "node:test";
import { drawingGeometry, drawingVertices, measureDrawing } from "../app/drawing.js";
import { normalizeDrawnGeometry } from "../app/report-issue.js";

test("polygon completion closes the ring and editing removes only its closing vertex", () => {
  const vertices = [[0, 0], [0.001, 0], [0, 0.001]];
  const geometry = drawingGeometry("Polygon", vertices);
  assert.deepEqual(geometry.coordinates, [[...vertices, vertices[0]]]);
  assert.deepEqual(drawingVertices(geometry), vertices);
  assert.deepEqual(normalizeDrawnGeometry(geometry), geometry);
  for (const coordinates of [[vertices], [[[0, 0], [0.001, 0], [0, 0]]], [geometry.coordinates[0], geometry.coordinates[0]]]) {
    assert.throws(() => normalizeDrawnGeometry({ type: "Polygon", coordinates }), /Draw/);
  }
});

test("measurements include polyline length and polygon area and closing edge", () => {
  const degree = 180 / (Math.PI * 6371008.8);
  const square = [[0, 0], [10 * degree, 0], [10 * degree, 10 * degree], [0, 10 * degree]];
  assert.equal(measureDrawing("LineString", square), "Length: 30.0 m");
  assert.equal(measureDrawing("Polygon", square), "Area: 100.0 m² · Perimeter: 40.0 m");
  assert.equal(measureDrawing("Polygon", [...square].reverse()), "Area: 100.0 m² · Perimeter: 40.0 m");
  assert.equal(measureDrawing("Point", [[0, 0]]), "");
});

test("reference measurements radiate from the fixed first point", async () => {
  const { drawingMeasurementLabels, referenceMeasurementLines } = await import("../app/drawing.js");
  const degree = 180 / (Math.PI * 6371008.8);
  const vertices = [[0, 0], [10 * degree, 0], [0, 20 * degree]];
  const lines = referenceMeasurementLines(vertices[0], vertices.slice(1));
  assert.deepEqual(lines.map((line) => line.geometry.coordinates), [[vertices[0], vertices[1]], [vertices[0], vertices[2]]]);
  const labels = drawingMeasurementLabels("LineString", vertices.slice(1), vertices[0]);
  assert.deepEqual(labels.map((label) => label.text), ["Reference point", "P1: 10.0 m from reference", "P2: 20.0 m from reference", "Length: 22.4 m"]);
  assert.deepEqual(labels[1].coordinates, [5 * degree, 0]);
  assert.deepEqual(drawingMeasurementLabels("Point", []), []);
  assert.equal(drawingMeasurementLabels("Polygon", vertices).length, 4);
});


test("a separate reference measures every vertex without entering the geometry", async () => {
  const { relativeDrawingPoints, drawingMeasurementLabels, referenceMeasurementLines } = await import("../app/drawing.js");
  const degree = 180 / (Math.PI * 6371008.8);
  const vertices = [[10 * degree, 0], [0, 20 * degree], [-10 * degree, 0]];
  const geometry = drawingGeometry("Polygon", vertices);
  assert.deepEqual(relativeDrawingPoints([0, 0], vertices), [
    { east_m: 10, north_m: 0, distance_m: 10 },
    { east_m: 0, north_m: 20, distance_m: 20 },
    { east_m: -10, north_m: 0, distance_m: 10 },
  ]);
  assert.equal(referenceMeasurementLines([0, 0], vertices).length, 3);
  assert.equal(referenceMeasurementLines(null, vertices).length, 0);
  assert.equal(drawingMeasurementLabels("Point", [vertices[0]], [0, 0])[1].text, "P1: 10.0 m from reference");
  assert.deepEqual(drawingVertices(geometry), vertices);
  assert.equal(relativeDrawingPoints([10 * degree, 0], [vertices[0]])[0].distance_m, 0);
});
