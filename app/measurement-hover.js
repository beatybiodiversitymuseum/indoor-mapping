import maplibregl from "maplibre-gl";

function nearPath(pointer, path) {
  if (!path.length) return false;
  if (path.length === 1) return Math.hypot(pointer.x - path[0].x, pointer.y - path[0].y) <= 14;
  return path.slice(1).some((end, index) => {
    const start = path[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared ? Math.max(0, Math.min(1, ((pointer.x - start.x) * dx + (pointer.y - start.y) * dy) / lengthSquared)) : 0;
    return Math.hypot(pointer.x - start.x - fraction * dx, pointer.y - start.y - fraction * dy) <= 14;
  });
}

// Use projected geometry as the hover target; labels never intercept map gestures.
export function installMeasurementHover(map, labels) {
  const container = map.getContainer();
  const entries = labels.map(({ coordinates, text, hoverCoordinates }) => {
    const element = document.createElement("div");
    element.className = "map-measurement-label";
    element.textContent = text;
    element.style.visibility = "hidden";
    const marker = new maplibregl.Marker({ element, anchor: "bottom", offset: [0, -12] }).setLngLat(coordinates).addTo(map);
    return { marker, element, path: hoverCoordinates || [coordinates] };
  });
  const hide = () => entries.forEach(({ element }) => { element.style.visibility = "hidden"; });
  const move = (event) => {
    if (event.pointerType === "touch") return;
    const bounds = container.getBoundingClientRect();
    const pointer = { x: event.clientX - bounds.left - container.clientLeft, y: event.clientY - bounds.top - container.clientTop };
    entries.forEach(({ element, path }) => {
      element.style.visibility = nearPath(pointer, path.map((coordinate) => map.project(coordinate))) ? "visible" : "hidden";
    });
  };
  container.addEventListener("pointermove", move);
  container.addEventListener("pointerleave", hide);
  map.on("movestart", hide);
  return () => {
    container.removeEventListener("pointermove", move);
    container.removeEventListener("pointerleave", hide);
    map.off("movestart", hide);
    entries.forEach(({ marker }) => marker.remove());
  };
}
