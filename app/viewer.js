"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { Building2, ChevronLeft, ChevronRight, Layers3, LocateFixed, MapPin, Navigation, Route, Search, X } from "lucide-react";
import { BASEMAP, DRAWER_GROUPS, GEOJSON, ICON_SIZE, LAYERS, LEVELS, MAP, MAP_LAYERS, POINT_CATEGORIES, ROUTING, VIEWER } from "./constants.js";
import { buildRoutingNetwork, findApprovedRoute, isRoutableFeature } from "./routing.js";

function nameOf(feature) {
  return feature?.properties?.name?.en || "Unnamed feature";
}

function featureCenter(feature) {
  if (feature.geometry.type === "Point") return feature.geometry.coordinates;
  if (feature.properties.display_point?.coordinates) return feature.properties.display_point.coordinates;
  const coordinates = feature.geometry.coordinates.flat(GEOJSON.coordinateNestingDepth);
  return coordinates.length >= GEOJSON.coordinateDimensions ? coordinates.slice(0, GEOJSON.coordinateDimensions) : MAP.center;
}

function pointFeatures(collection, predicate = () => true) {
  return {
    type: "FeatureCollection",
    features: collection?.features.filter((feature) => feature.geometry?.type === "Point" && predicate(feature)) || [],
  };
}

const emptyCollection = () => ({ type: "FeatureCollection", features: [] });

function displayDistanceMeters(a, b) {
  const latitude = ((a[1] + b[1]) / 2) * Math.PI / 180;
  const x = (b[0] - a[0]) * Math.cos(latitude) * ROUTING.earthRadiusMeters * Math.PI / 180;
  const y = (b[1] - a[1]) * ROUTING.earthRadiusMeters * Math.PI / 180;
  return Math.hypot(x, y);
}

const interpolateCoordinate = (from, to, fraction) => [from[0] + (to[0] - from[0]) * fraction, from[1] + (to[1] - from[1]) * fraction];

function removeCollinearCoordinates(coordinates) {
  return coordinates.filter((coordinate, index) => {
    if (!index || index === coordinates.length - 1) return true;
    const previous = coordinates[index - 1];
    const next = coordinates[index + 1];
    const incoming = [coordinate[0] - previous[0], coordinate[1] - previous[1]];
    const outgoing = [next[0] - coordinate[0], next[1] - coordinate[1]];
    const denominator = Math.hypot(...incoming) * Math.hypot(...outgoing);
    if (!denominator) return false;
    const normalizedCross = Math.abs(incoming[0] * outgoing[1] - incoming[1] * outgoing[0]) / denominator;
    const dot = incoming[0] * outgoing[0] + incoming[1] * outgoing[1];
    return normalizedCross > ROUTING.collinearDisplayThreshold || dot < 0;
  });
}

function smoothRouteCoordinates(coordinates) {
  const clean = removeCollinearCoordinates(coordinates);
  if (!ROUTING.smoothingDistanceMeters || clean.length < 3) return clean;
  const smoothed = [clean[0]];
  for (let index = 1; index < clean.length - 1; index++) {
    const previous = clean[index - 1];
    const corner = clean[index];
    const next = clean[index + 1];
    const incomingLength = displayDistanceMeters(previous, corner);
    const outgoingLength = displayDistanceMeters(corner, next);
    if (!incomingLength || !outgoingLength) {
      smoothed.push(corner);
      continue;
    }
    const trim = Math.min(ROUTING.smoothingDistanceMeters, incomingLength / ROUTING.smoothingSegmentDivisor, outgoingLength / ROUTING.smoothingSegmentDivisor);
    const curveStart = interpolateCoordinate(corner, previous, trim / incomingLength);
    const curveEnd = interpolateCoordinate(corner, next, trim / outgoingLength);
    smoothed.push(curveStart);
    for (let step = 1; step <= ROUTING.smoothingSteps; step++) {
      const t = step / (ROUTING.smoothingSteps + 1);
      const inverse = 1 - t;
      smoothed.push([
        inverse * inverse * curveStart[0] + 2 * inverse * t * corner[0] + t * t * curveEnd[0],
        inverse * inverse * curveStart[1] + 2 * inverse * t * corner[1] + t * t * curveEnd[1],
      ]);
    }
    smoothed.push(curveEnd);
  }
  smoothed.push(clean.at(-1));
  return smoothed;
}

function routeDisplayLine(route) {
  if (!route?.features.length) return emptyCollection();
  const rawCoordinates = route.features.flatMap((feature, index) => index ? feature.geometry.coordinates.slice(1) : feature.geometry.coordinates);
  const coordinates = smoothRouteCoordinates(rawCoordinates);
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }] };
}

function routeDisplayEndpoints(route) {
  if (!route?.features.length) return emptyCollection();
  const first = route.features[0].geometry.coordinates[0];
  const lastCoordinates = route.features.at(-1).geometry.coordinates;
  const last = lastCoordinates.at(-1);
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { endpoint: "start", label: "A" }, geometry: { type: "Point", coordinates: first } },
      { type: "Feature", properties: { endpoint: "destination", label: "B" }, geometry: { type: "Point", coordinates: last } },
    ],
  };
}

const isDrawer = (feature) => feature.properties.local_category === POINT_CATEGORIES.drawer;
const coordinateKey = (feature) => feature.geometry?.coordinates.join(",");

function drawerGroups(collection) {
  const groups = new Map();
  for (const feature of pointFeatures(collection, isDrawer).features) {
    const key = coordinateKey(feature);
    groups.set(key, [...(groups.get(key) || []), feature]);
  }
  return {
    type: "FeatureCollection",
    features: [...groups.entries()].map(([key, features]) => ({
      type: "Feature",
      id: `drawer-group-${key}`,
      geometry: features[0].geometry,
      properties: {
        drawer_count: features.length,
        viewer_group_key: key,
      },
    })),
  };
}

export default function Viewer() {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const visibleDataRef = useRef(null);
  const navigationDataRef = useRef(null);
  const [data, setData] = useState(null);
  const [navigationData, setNavigationData] = useState(null);
  const [routingNetwork, setRoutingNetwork] = useState(null);
  const [activeLayers, setActiveLayers] = useState(() => new Set(LAYERS.filter(({ enabledByDefault }) => enabledByDefault).map(({ id }) => id)));
  const [showNavigationDebug, setShowNavigationDebug] = useState(false);
  const [activeLevel, setActiveLevel] = useState("all");
  const [selected, setSelected] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [routeFrom, setRouteFrom] = useState(null);
  const [routeTo, setRouteTo] = useState(null);
  const [routeResult, setRouteResult] = useState(null);
  const [routeError, setRouteError] = useState("");

  const visibleData = useMemo(() => {
    if (!data) return null;
    return {
      ...data,
      features: data.features.filter((feature) => {
        if (!activeLayers.has(feature.properties.viewer_layer)) return false;
        if (activeLevel === "all") return true;
        const properties = feature.properties;
        return properties.viewer_level_id === activeLevel || properties.level_ids?.includes(activeLevel) || (feature.id === activeLevel && properties.viewer_layer === "level");
      }),
    };
  }, [data, activeLayers, activeLevel]);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term || !visibleData) return [];
    return visibleData.features.filter((feature) => `${nameOf(feature)} ${feature.properties.alt_name?.en || ""} ${feature.properties.category || ""} ${feature.properties.local_category || ""}`.toLowerCase().includes(term)).slice(0, VIEWER.searchResultLimit);
  }, [query, visibleData]);

  visibleDataRef.current = visibleData;
  navigationDataRef.current = navigationData;

  useEffect(() => {
    Promise.all([
      fetch("/map/api/map-data").then((response) => response.json()),
      fetch("/map/api/navigation").then((response) => response.json()),
    ]).then(([mapData, navigation]) => {
      setData(mapData);
      setNavigationData(navigation);
      setRoutingNetwork(buildRoutingNetwork(navigation));
    }).catch(() => setData({ type: "FeatureCollection", features: [] })).finally(() => setLoading(false));
    if (window.matchMedia(VIEWER.mobileMediaQuery).matches) setSidebarOpen(false);
  }, []);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;
    const matchColors = ["match", ["get", "viewer_layer"], ...LAYERS.flatMap(({ id, color }) => [id, color]), MAP_LAYERS.fallbackColor];
    const map = new maplibregl.Map({
      container: mapNode.current,
      center: MAP.center,
      zoom: MAP.initialZoom,
      bearing: MAP.bearing,
      pitch: MAP.pitch,
      maxZoom: MAP.maxZoom,
      attributionControl: false,
      style: {
        version: GEOJSON.mapStyleVersion,
        glyphs: BASEMAP.glyphs,
        sources: {},
        layers: [{ id: "background", type: "background", paint: { "background-color": MAP.backgroundColor } }],
      },
    });
    map.on("error", (event) => {
      const message = event.error?.message || "";
      if (message.includes("tile.openstreetmap.org") && message.includes("Failed to fetch")) return;
      if (message.includes("demotiles.maplibre.org/font") && message.includes("Failed to fetch")) return;
      console.error(event.error || event);
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.on("load", () => {
      map.addSource("osm", { type: "raster", tiles: BASEMAP.tiles, tileSize: BASEMAP.tileSize, attribution: BASEMAP.attribution });
      map.addLayer({ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": BASEMAP.saturation, "raster-opacity": BASEMAP.opacity } });
      map.addSource("imdf", {
        type: "geojson",
        data: visibleDataRef.current || { type: "FeatureCollection", features: [] },
        promoteId: "viewer_feature_id",
      });
      map.addSource("imdf-points", {
        type: "geojson",
        data: pointFeatures(visibleDataRef.current, (feature) => !isDrawer(feature)),
        promoteId: "viewer_feature_id",
      });
      map.addSource("imdf-drawers", {
        type: "geojson",
        data: drawerGroups(visibleDataRef.current),
        cluster: true,
        maxzoom: DRAWER_GROUPS.sourceMaxZoom,
        clusterMaxZoom: DRAWER_GROUPS.clusterMaxZoom,
        clusterRadius: DRAWER_GROUPS.clusterRadius,
        clusterProperties: {
          drawer_count: ["+", ["get", "drawer_count"]],
        },
      });
      map.addSource("approved-route", { type: "geojson", data: emptyCollection() });
      map.addSource("approved-route-endpoints", { type: "geojson", data: emptyCollection() });
      map.addSource("navigation-debug", { type: "geojson", data: emptyCollection() });
      map.addLayer({ id: "imdf-fill", type: "fill", source: "imdf", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": matchColors, "fill-opacity": ["match", ["get", "viewer_layer"], "fixture", MAP_LAYERS.fillOpacity.fixture, "unit", MAP_LAYERS.fillOpacity.unit, "level", MAP_LAYERS.fillOpacity.level, MAP_LAYERS.fillOpacity.fallback] } });
      map.addLayer({ id: "imdf-line", type: "line", source: "imdf", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": matchColors, "line-width": ["match", ["get", "viewer_layer"], "venue", MAP_LAYERS.lineWidth.venue, "level", MAP_LAYERS.lineWidth.level, MAP_LAYERS.lineWidth.fallback], "line-opacity": MAP_LAYERS.lineOpacity } });
      map.addLayer({ id: "imdf-point", type: "circle", source: "imdf-points", filter: ["all", ["!=", ["get", "local_category"], POINT_CATEGORIES.cabinet], ["!=", ["get", "local_category"], POINT_CATEGORIES.fossilExcavation]], paint: { "circle-color": matchColors, "circle-radius": ["interpolate", ["linear"], ["zoom"], MAP_LAYERS.pointRadius.minZoom, MAP_LAYERS.pointRadius.min, MAP_LAYERS.pointRadius.maxZoom, MAP_LAYERS.pointRadius.max], "circle-stroke-color": MAP_LAYERS.pointStrokeColor, "circle-stroke-width": MAP_LAYERS.pointStrokeWidth } });
      map.addLayer({ id: "imdf-drawer-group", type: "circle", source: "imdf-drawers", minzoom: DRAWER_GROUPS.minZoom, paint: { "circle-color": DRAWER_GROUPS.color, "circle-radius": DRAWER_GROUPS.radius, "circle-stroke-color": DRAWER_GROUPS.strokeColor, "circle-stroke-width": DRAWER_GROUPS.strokeWidth } });
      map.addLayer({ id: "imdf-drawer-group-count", type: "symbol", source: "imdf-drawers", minzoom: DRAWER_GROUPS.minZoom, layout: { "text-field": ["to-string", ["get", "drawer_count"]], "text-font": [DRAWER_GROUPS.countFont], "text-size": DRAWER_GROUPS.countFontSize }, paint: { "text-color": DRAWER_GROUPS.strokeColor } });
      map.addLayer({ id: "navigation-debug-line", type: "line", source: "navigation-debug", filter: ["==", ["geometry-type"], "LineString"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": MAP_LAYERS.navigationDebug.lineColor, "line-width": MAP_LAYERS.navigationDebug.lineWidth, "line-opacity": MAP_LAYERS.navigationDebug.lineOpacity } });
      map.addLayer({ id: "navigation-debug-point", type: "circle", source: "navigation-debug", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": MAP_LAYERS.navigationDebug.pointColor, "circle-radius": MAP_LAYERS.navigationDebug.pointRadius, "circle-stroke-color": MAP_LAYERS.navigationDebug.pointStrokeColor, "circle-stroke-width": MAP_LAYERS.navigationDebug.pointStrokeWidth } });
      map.addLayer({ id: "navigation-debug-label", type: "symbol", source: "navigation-debug", minzoom: MAP_LAYERS.navigationDebug.labelMinZoom, layout: { "text-field": ["get", "debug_id"], "text-font": [DRAWER_GROUPS.countFont], "text-size": MAP_LAYERS.navigationDebug.labelSize, "text-offset": [0, 1.1], "text-anchor": "top", "text-allow-overlap": false }, paint: { "text-color": MAP_LAYERS.navigationDebug.labelColor, "text-halo-color": MAP_LAYERS.navigationDebug.labelHaloColor, "text-halo-width": MAP_LAYERS.navigationDebug.labelHaloWidth } });
      map.addLayer({ id: "approved-route-casing", type: "line", source: "approved-route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ROUTING.lineCasingColor, "line-width": ROUTING.lineCasingWidth, "line-opacity": ROUTING.lineOpacity } });
      map.addLayer({ id: "approved-route", type: "line", source: "approved-route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ROUTING.lineColor, "line-width": ROUTING.lineWidth, "line-opacity": ROUTING.lineOpacity } });
      map.addLayer({ id: "approved-route-endpoints", type: "circle", source: "approved-route-endpoints", paint: { "circle-color": ["match", ["get", "endpoint"], "start", ROUTING.startColor, ROUTING.destinationColor], "circle-radius": ROUTING.endpointRadius, "circle-stroke-color": ROUTING.endpointStrokeColor, "circle-stroke-width": ROUTING.endpointStrokeWidth } });
      map.addLayer({ id: "approved-route-endpoint-labels", type: "symbol", source: "approved-route-endpoints", layout: { "text-field": ["get", "label"], "text-font": [ROUTING.endpointFont], "text-size": ROUTING.endpointFontSize }, paint: { "text-color": ROUTING.endpointTextColor } });
      map.addLayer({
        id: "imdf-fixture-extrusion",
        type: "fill-extrusion",
        source: "imdf",
        filter: [
          "all",
          ["==", ["geometry-type"], "Polygon"],
          ["==", ["get", "viewer_layer"], "fixture"]
        ],
        paint: {
          "fill-extrusion-color": matchColors,

          "fill-extrusion-height": [
            "match",
            ["get", "local_category"],

            "display_cabinet", 0.33,
            "drawer_island_box", 0.11,
            "table", 1.0,
            "case", 1.6,
            "wall_case", 2.5,

            1.0 // fallback height
          ],

          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.85
        }
      });
      const openDrawerGroup = async (event) => {
        const group = event.features?.[0];
        if (!group) return;
        const source = map.getSource("imdf-drawers");
        const leaves = group.properties.cluster
          ? await source.getClusterLeaves(group.properties.cluster_id, DRAWER_GROUPS.leafLimit, DRAWER_GROUPS.leafOffset)
          : [group];
        const keys = new Set(leaves.map((feature) => feature.properties.viewer_group_key));
        const features = visibleDataRef.current?.features.filter((feature) => isDrawer(feature) && keys.has(coordinateKey(feature))) || [];
        setSelected(null);
        setSelectedGroup(features);
      };
      map.on("click", "imdf-drawer-group", openDrawerGroup);
      map.on("click", "imdf-drawer-group-count", openDrawerGroup);
      for (const layer of ["navigation-debug-line", "navigation-debug-point", "navigation-debug-label"]) {
        map.on("click", layer, (event) => {
          const renderedFeature = event.features?.[0];
          if (!renderedFeature) return;
          const sourceFeature = navigationDataRef.current?.features.find((feature) => feature.id === renderedFeature.id || feature.properties?.debug_id === renderedFeature.properties?.debug_id || feature.properties?.alt_name?.en === renderedFeature.properties?.alt_name?.en);
          setSelected(sourceFeature || renderedFeature);
          setSelectedGroup(null);
          setQuery("");
        });
        map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
      }
      for (const layer of ["imdf-fill", "imdf-line", "imdf-point"]) {
        map.on("click", layer, (event) => {
          if (["imdf-fill", "imdf-line"].includes(layer)) {
            const featuresAbove = map.queryRenderedFeatures(event.point, {
              layers: ["imdf-drawer-group", "imdf-drawer-group-count", "imdf-point"],
            });
            if (featuresAbove.length) return;
          }
          const renderedFeature = event.features?.[0];
          if (!renderedFeature) return;
          const featureId = renderedFeature.id || renderedFeature.properties?.viewer_feature_id;
          const sourceFeature = visibleDataRef.current?.features.find((feature) => feature.id === featureId);
          setSelected(sourceFeature || renderedFeature);
          setSelectedGroup(null);
          setQuery("");
        });
        map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
      }
      for (const layer of ["imdf-drawer-group", "imdf-drawer-group-count"]) {
        map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
      }
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const source = mapRef.current?.getSource("imdf");
    if (source && visibleData) source.setData(visibleData);
    const pointSource = mapRef.current?.getSource("imdf-points");
    if (pointSource && visibleData) pointSource.setData(pointFeatures(visibleData, (feature) => !isDrawer(feature)));
    const drawerSource = mapRef.current?.getSource("imdf-drawers");
    if (drawerSource && visibleData) drawerSource.setData(drawerGroups(visibleData));
  }, [visibleData]);

  useEffect(() => {
    const source = mapRef.current?.getSource("navigation-debug");
    if (source) source.setData(showNavigationDebug && navigationData ? navigationData : emptyCollection());
  }, [navigationData, showNavigationDebug]);

  useEffect(() => {
    if (!routingNetwork || !routeFrom || !routeTo) {
      setRouteResult(null);
      setRouteError("");
      return;
    }
    const result = findApprovedRoute(routingNetwork, routeFrom, routeTo);
    setRouteResult(result);
    setRouteError(result ? "" : "No route connects these fixtures.");
  }, [routingNetwork, routeFrom, routeTo]);

  useEffect(() => {
    const source = mapRef.current?.getSource("approved-route");
    if (!source) return;
    source.setData(routeDisplayLine(routeResult));
    mapRef.current?.getSource("approved-route-endpoints")?.setData(routeDisplayEndpoints(routeResult));
    if (routeResult?.features.length) {
      const bounds = new maplibregl.LngLatBounds();
      routeResult.features.forEach((feature) => feature.geometry.coordinates.forEach((coordinate) => bounds.extend(coordinate)));
      mapRef.current.fitBounds(bounds, { padding: ROUTING.fitPadding, maxZoom: ROUTING.fitMaxZoom, duration: ROUTING.fitDurationMs });
    }
  }, [routeResult]);

  function toggleLayer(id) {
    setActiveLayers((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function focusFeature(feature) {
    mapRef.current?.flyTo({ center: featureCenter(feature), zoom: MAP.featureZoom, duration: MAP.flyDurationMs });
    setSelected(feature);
    setSelectedGroup(null);
    setQuery("");
  }

  function setRouteEndpoint(endpoint, feature) {
    if (endpoint === "from") setRouteFrom(feature);
    else setRouteTo(feature);
    setSelected(feature);
    setSelectedGroup(null);
    setQuery("");
  }

  function clearRoute() {
    setRouteFrom(null);
    setRouteTo(null);
    setRouteResult(null);
    setRouteError("");
  }

  const properties = selected?.properties || {};
  const selectedLayerLabel = properties.viewer_layer || properties.wayfinding_type || properties.category || "feature";
  return <main className="viewer-shell">
    <div ref={mapNode} className="map" />
    <header className="brand-bar"><div className="brand-mark"><Building2 size={ICON_SIZE.brand} /></div><div><strong>Beaty IDMF Viewer</strong><span>Indoor map data</span></div></header>
    <button className={`sidebar-toggle icon-button ${sidebarOpen ? "is-open" : ""}`} onClick={() => setSidebarOpen((value) => !value)} title={sidebarOpen ? "Close layers panel" : "Open layers panel"}>{sidebarOpen ? <ChevronLeft /> : <ChevronRight />}</button>
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
      <div className="search-wrap"><Search size={ICON_SIZE.search} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search features" aria-label="Search features" />{query && <button className="clear-button" onClick={() => setQuery("")} title="Clear search"><X size={ICON_SIZE.clear} /></button>}</div>
      {query && <div className="search-results">{matches.length ? matches.map((feature) => <button key={`${feature.properties.viewer_layer}-${feature.id}`} onClick={() => focusFeature(feature)}><span>{nameOf(feature)}</span><small>{feature.properties.viewer_layer}</small></button>) : <p>No matching features on current level.</p>}</div>}
      <section className="route-panel"><div className="section-title"><Route size={ICON_SIZE.section} /><h2>Route</h2>{(routeFrom || routeTo) && <button className="clear-button" onClick={clearRoute} title="Clear route"><X size={ICON_SIZE.clear} /></button>}</div>
        <div className="route-endpoint"><span>A</span><div><small>Start</small><strong>{routeFrom ? nameOf(routeFrom) : "Select a fixture"}</strong></div>{routeFrom && <button className="clear-button" onClick={() => setRouteFrom(null)} title="Clear start"><X size={ICON_SIZE.clear} /></button>}</div>
        <div className="route-endpoint"><span>B</span><div><small>Destination</small><strong>{routeTo ? nameOf(routeTo) : "Select a fixture"}</strong></div>{routeTo && <button className="clear-button" onClick={() => setRouteTo(null)} title="Clear destination"><X size={ICON_SIZE.clear} /></button>}</div>
        {routeResult && <p className="route-status"><Navigation size={14} /> Route · {Math.round(routeResult.distanceMeters)} m</p>}
        {routeError && <p className="route-error">{routeError}</p>}
      </section>
      <section><div className="section-title"><Layers3 size={ICON_SIZE.section} /><h2>Layers</h2><span>{visibleData?.features.length || 0}</span></div><div className="layer-list">
        {LAYERS.map((layer) => <label key={layer.id}><input type="checkbox" checked={activeLayers.has(layer.id)} onChange={() => toggleLayer(layer.id)} /><i style={{ background: layer.color }} /><span>{layer.label}</span><small>{data?.features.filter((feature) => feature.properties.viewer_layer === layer.id).length || 0}</small></label>)}
        <label><input type="checkbox" checked={showNavigationDebug} onChange={() => setShowNavigationDebug((value) => !value)} /><i style={{ background: MAP_LAYERS.navigationDebug.lineColor }} /><span>Navigation</span><small>{navigationData?.features.length || 0}</small></label>
      </div></section>
      <section><div className="section-title"><Building2 size={ICON_SIZE.section} /><h2>Level</h2></div><div className="segments">{LEVELS.map((level) => <button className={activeLevel === level.id ? "active" : ""} key={level.id} onClick={() => setActiveLevel(level.id)}>{level.label}</button>)}</div></section>
    </aside>
    <button className="locate-button icon-button" onClick={() => mapRef.current?.flyTo({ center: MAP.center, zoom: MAP.initialZoom })} title="Return to museum"><LocateFixed /></button>
    {selectedGroup && <aside className="inspector group-inspector"><div className="inspector-head"><div className="feature-icon"><Layers3 size={ICON_SIZE.feature} /></div><div><small>Grouped location</small><h2>{selectedGroup.every((feature) => feature.properties.local_category === "drawer_exhibit") ? "Drawers at this position" : "Features at this position"}</h2></div><button className="icon-button" onClick={() => setSelectedGroup(null)} title="Close grouped features"><X /></button></div><div className="group-list">
      {selectedGroup.map((feature) => <button key={feature.id} onClick={() => focusFeature(feature)}><span>{nameOf(feature)}</span><small>{feature.properties.alt_name?.en || feature.properties.viewer_layer}</small></button>)}
    </div></aside>}
    {selected && <aside className="inspector"><div className="inspector-head"><div className="feature-icon"><MapPin size={ICON_SIZE.feature} /></div><div><small>{selectedLayerLabel}</small><h2>{nameOf(selected)}</h2></div><button className="icon-button" onClick={() => setSelected(null)} title="Close feature details"><X /></button></div>
      {isRoutableFeature(routingNetwork, selected) && <div className="route-actions"><button onClick={() => setRouteEndpoint("from", selected)}><MapPin size={15} /> Start here</button><button onClick={() => setRouteEndpoint("to", selected)}><Navigation size={15} /> Route here</button></div>}
      <dl>
      {properties.local_category && <><dt>Local category</dt><dd>{properties.local_category.replaceAll("_", " ")}</dd></>}
      {properties.debug_id && <><dt>Debug ID</dt><dd className="mono">{properties.debug_id}</dd></>}
      {properties.alt_name?.en && <><dt>Feature ID</dt><dd className="mono">{properties.alt_name.en}</dd></>}
      {properties.wayfinding_type && <><dt>Wayfinding</dt><dd>{properties.wayfinding_type.replaceAll("_", " ")}</dd></>}
      {properties.sources?.length && <><dt>Sources</dt><dd className="mono">{properties.sources.join(", ")}</dd></>}
      {properties.targets?.length && <><dt>Targets</dt><dd className="mono">{properties.targets.join(", ")}</dd></>}
      {properties.source && !properties.sources?.length && <><dt>Source</dt><dd className="mono">{properties.source}</dd></>}
      {properties.target && !properties.targets?.length && <><dt>Target</dt><dd className="mono">{properties.target}</dd></>}
      {properties.short_name?.en && <><dt>Short name</dt><dd>{properties.short_name.en}</dd></>}
      {properties.ordinal !== undefined && <><dt>Ordinal</dt><dd>{properties.ordinal}</dd></>}
      {properties.source_issue_number && <><dt>Source issue</dt><dd><a href={properties.source_url} target="_blank" rel="noreferrer">#{properties.source_issue_number}</a></dd></>}
      {properties.category && <><dt>Category</dt><dd>{properties.category}</dd></>}
      <dt>Feature UUID</dt><dd className="mono">{selected.id || properties.viewer_feature_id || "Not assigned"}</dd>
    </dl></aside>}
    {loading && <div className="loading">Loading indoor map...</div>}
  </main>;
}
