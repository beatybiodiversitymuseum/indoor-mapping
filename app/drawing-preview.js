"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { installMeasurementHover } from "./measurement-hover.js";
import { LAYERS, MAP } from "./constants.js";
import { mapIconOption } from "./map-icon-options.js";
import { drawingVertices, referenceMeasurementLines, drawingMeasurementLabels } from "./drawing.js";

export default function DrawingPreview({ geometry, mapData, icon, referencePoint }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const vertices = drawingVertices(geometry);
    const bounds = [...vertices, ...(referencePoint ? [referencePoint] : [])].reduce((bounds, coordinate) => bounds.extend(coordinate), new maplibregl.LngLatBounds());
    const colors = ["match", ["get", "viewer_layer"], ...LAYERS.flatMap(({ id, color }) => [id, color]), "#a6adb3"];
    const map = new maplibregl.Map({
      container: containerRef.current,
      interactive: false,
      attributionControl: false,
      bearing: MAP.bearing,
      center: vertices[0],
      zoom: MAP.featureZoom,
      style: {
        version: 8,
        sources: {
          indoor: { type: "geojson", data: mapData || { type: "FeatureCollection", features: [] } },
          drawing: { type: "geojson", data: { type: "Feature", properties: {}, geometry } },
          reference: { type: "geojson", data: { type: "FeatureCollection", features: referenceMeasurementLines(referencePoint, vertices) } },
        },
        layers: [
          { id: "background", type: "background", paint: { "background-color": MAP.backgroundColor } },
          { id: "indoor-fill", type: "fill", source: "indoor", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": colors, "fill-opacity": 0.35 } },
          { id: "indoor-outline", type: "line", source: "indoor", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": colors, "line-width": 1 } },
          { id: "drawing-fill", type: "fill", source: "drawing", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#b51635", "fill-opacity": 0.3 } },
          { id: "drawing-line", type: "line", source: "drawing", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": "#b51635", "line-width": 4 } },
          { id: "reference-lines", type: "line", source: "reference", paint: { "line-color": "#193d72", "line-width": 2, "line-dasharray": [3, 2] } },
          { id: "drawing-point", type: "circle", source: "drawing", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": "#b51635", "circle-radius": 7, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } },
        ],
      },
    });
    const removeMeasurementHover = installMeasurementHover(map, drawingMeasurementLabels(geometry.type, vertices, referencePoint));
    const selectedIcon = geometry.type === "Point" ? mapIconOption(icon) : null;
    if (selectedIcon) {
      const image = document.createElement("img");
      image.src = selectedIcon.url;
      image.alt = selectedIcon.label;
      image.width = 36;
      image.height = 36;
      image.style.objectFit = "contain";
      const center = vertices.reduce((sum, point) => [sum[0] + point[0] / vertices.length, sum[1] + point[1] / vertices.length], [0, 0]);
      new maplibregl.Marker({ element: image }).setLngLat(center).addTo(map);
    }
    const fit = () => {
      map.resize();
      map.fitBounds(bounds, { padding: 48, maxZoom: MAP.maxZoom, bearing: MAP.bearing, duration: 0 });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(containerRef.current);
    map.on("load", fit);
    return () => { observer.disconnect(); removeMeasurementHover(); map.remove(); };
  }, [geometry, mapData, icon, referencePoint]);

  return <figure className="drawing-preview"><div ref={containerRef} role="img" aria-label={`Map preview of your proposed ${geometry.type === "LineString" ? "polyline" : geometry.type.toLowerCase()}`} /><figcaption>Your drawing on the museum map</figcaption></figure>;
}
