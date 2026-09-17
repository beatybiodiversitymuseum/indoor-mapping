"use client";

/* Remote exhibit images have dynamic archive URLs, so native img elements are intentional. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import maplibregl from "maplibre-gl";
import MiniSearch from "minisearch";
import { exhibitMarkerVisible } from "./exhibit-visibility.js";
import { fixtureHighlightState } from "./fixture-highlight.js";
import { CABINET_EXHIBIT_ICON_LAYER_ID, DRAWER_MARKER_OFFSET_PX, DRAWER_TOP_ICON_SCALE, EXHIBIT_ICON_SCALE, FULL_CIRCLE_ICON_SCALE, ICON_LAYER_ID, UBC_NORTH_BEARING, cabinetExhibitCountFilter, cabinetExhibitGroups, cabinetExhibitIconSizeExpression, countOffsetForBearing, drawerCountFilter, drawerMarkerShape, drawerSourceOptions, exhibitImageExpression, exhibitPointFilter, numberedMarkerSizeExpression, numberedMarkerTextSizeExpression } from "./marker-style.js";
import { DRAWER_OVERLAY_LAYERS, INTERACTIVE_MAP_LAYERS } from "./map-layer-policy.js";
import { appendRouteStop, findMultiStopRoute, nextRouteSelection, routeStopLabel, routeStoppingCoordinate, isMapBackground } from "./route-interaction.js";
import { relatedExhibitsForFeature } from "./exhibits.js";
import { Building2, ChevronLeft, ChevronRight, Flag, Layers3, LocateFixed, MapPin, Navigation, Route, Search, X } from "lucide-react";
import { BASEMAP, DRAWER_GROUPS, GEOJSON, ICON_SIZE, LAYERS, LEVELS, MAP, MAP_LAYERS, POINT_CATEGORIES, ROUTING, VIEWER } from "./constants.js";
import { buildRoutingNetwork, isRoutableFeature } from "./routing.js";
import { COLLECTIONS, COLLECTION_BADGE_SCALE, collectionBadgeFeatures, collectionBadgeIconOffset, collectionFixtureColorExpression, collectionSectionFeatures } from "./collection-style.js";
import { AMENITY_ICON_IDS, AMENITY_ICON_OFFSET_EXPRESSION, AMENITY_ICON_SIZE_EXPRESSION, amenityIconFeatures } from "./amenity-style.js";
import { POINT_FEATURE_ICON_IDS, POINT_FEATURE_ICON_SCALE, pointFeatureIconFeatures } from "./point-feature-style.js";
import { KEYBOARD_ROWS, applyVirtualKey, virtualKeyWithCaps } from "./virtual-keyboard.js";
import { sendUsageEvent } from "./usage-client.js";
import { REPORT_TYPES } from "./report-issue.js";
import { WHALE_ICON_SCALE, WHALE_IMAGE_ID, whaleOverlayFeature } from "./whale-style.js";

const SEARCH_FIELDS = ["name", "altName", "layer", "category", "localCategory", "reference", "publicClass", "scientificNames", "commonNames", "narrative", "notes", "specimenText", "fullText"];
const STORE_FIELDS = ["id", ...SEARCH_FIELDS];

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

export function levelBounds(collection) {
  const coordinates = (collection?.features || [])
    .filter((feature) => feature.properties?.viewer_layer === "level")
    .flatMap((feature) => feature.geometry?.coordinates?.flat(Infinity) || []);
  const pairs = [];
  for (let index = 0; index < coordinates.length - 1; index += 2) {
    if (Number.isFinite(coordinates[index]) && Number.isFinite(coordinates[index + 1])) pairs.push([coordinates[index], coordinates[index + 1]]);
  }
  if (!pairs.length) return null;
  return [
    [Math.min(...pairs.map(([longitude]) => longitude)), Math.min(...pairs.map(([, latitude]) => latitude))],
    [Math.max(...pairs.map(([longitude]) => longitude)), Math.max(...pairs.map(([, latitude]) => latitude))],
  ];
}

function fitLevelExtents(map, collection, duration = 0) {
  const bounds = levelBounds(collection);
  if (!bounds) return false;
  map.fitBounds(bounds, { padding: MAP.extentPadding, bearing: MAP.bearing, pitch: MAP.pitch, duration });
  return true;
}

const emptyCollection = () => ({ type: "FeatureCollection", features: [] });

const mapPropertyNames = new Set([
  "viewer_feature_id", "viewer_layer", "viewer_level_id", "viewer_collection",
  "level_id", "level_ids", "unit_ids", "name", "alt_name", "category",
  "local_category", "exhibit_type", "marker_bearing", "display_point",
  "related_fixture_id", "fixture_id", "fixture_ids", "navigation_point_ids",
  "stopping_point_ids", "wayfinding_type", "amenity", "public_class",
]);

function mapRenderCollection(collection) {
  if (!collection) return null;
  return {
    ...collection,
    features: collection.features.map((feature) => ({
      ...feature,
      properties: Object.fromEntries(Object.entries(feature.properties).filter(([name]) => mapPropertyNames.has(name) || name.startsWith("viewer_"))),
    })),
  };
}

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
  const routes = route.legRoutes?.length ? route.legRoutes : [route];
  return {
    type: "FeatureCollection",
    features: routes.map((leg, legIndex) => {
      const rawCoordinates = leg.features.flatMap((feature, index) => index ? feature.geometry.coordinates.slice(1) : feature.geometry.coordinates);
      return { type: "Feature", properties: { leg_index: legIndex }, geometry: { type: "LineString", coordinates: smoothRouteCoordinates(rawCoordinates) } };
    }),
  };
}

function routeDisplayEndpoints(stops, network) {
  return { type: "FeatureCollection", features: stops.flatMap((feature, index) => {
    const coordinates = routeStoppingCoordinate(network, feature);
    if (!coordinates) return [];
    return [{ type: "Feature", properties: { endpoint: index, label: routeStopLabel(index), highlight: index === stops.length - 1 ? "current" : "previous" }, geometry: { type: "Point", coordinates } }];
  }) };
}

const isDrawer = (feature) => (feature.properties.exhibit_type === "drawer" || feature.properties.local_category === POINT_CATEGORIES.drawer);
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
        marker_bearing: features[0].properties.marker_bearing,
        marker_shape: drawerMarkerShape(features),
        count_offset: countOffsetForBearing(features[0].properties.marker_bearing || 0),
      },
    })),
  };
}

function exhibitImageUrl(exhibit) {
  if (exhibit.properties?.image?.url) return exhibit.properties.image.url;
  if (exhibit.properties?.photo_submission) return exhibit.properties.photo_submission.image_url;
  const image = exhibit.properties?.image;
  const archive = exhibit.properties?.archive;
  const path = image?.path;
  if (!path || !archive?.collection) return "";
  const filename = path.split("/").at(-1);
  if (archive.collection === "labels") return `https://explore.beatymuseum.ubc.ca/docs/labels/${path.replace(/^labels\//, "")}`;
  if (archive.collection === "drawers" && filename) return `https://explore.beatymuseum.ubc.ca/docs/drawers/img/${filename}`;
  if (archive.collection === "shadowboxes" && filename) return `https://explore.beatymuseum.ubc.ca/docs/shadowboxes/img/${filename.toLowerCase()}`;
  return "";
}

function exhibitSummary(exhibit) {
  const properties = exhibit.properties || {};
  const archive = properties.archive || {};
  return archive.public_reference_code || archive.id || properties.image?.id || "";
}

function exhibitSubtitle(exhibit) {
  const properties = exhibit.properties || {};
  return [properties.exhibit_type?.replaceAll("_", " "), properties.public_class].filter(Boolean).join(" · ");
}

function exhibitSpecimenNames(exhibit) {
  const specimens = exhibit.properties?.specimens;
  if (!Array.isArray(specimens)) return [];
  const seen = new Set();
  return specimens
    .map((specimen) => ({
      scientificName: specimen.scientificName,
      commonName: specimen.commonName,
    }))
    .filter(({ scientificName, commonName }) => scientificName || commonName)
    .filter(({ scientificName, commonName }) => {
      const key = `${scientificName || ""}|${commonName || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

function exhibitNarrative(exhibit) {
  return exhibit.properties?.details?.text?.en || "";
}

function exhibitNotes(exhibit) {
  return exhibit.properties?.details?.notes || "";
}

function exhibitSpecimens(exhibit) {
  const specimens = exhibit.properties?.specimens;
  return Array.isArray(specimens) ? specimens : [];
}

function compactText(values) {
  return values.flat().filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function specimenSearchText(specimen) {
  return compactText([specimen.scientificName, specimen.commonName, specimen.specimenType, specimen.presence, specimen.catalogNumber, specimen.notes]);
}

function featureSearchDocument(feature) {
  const properties = feature.properties || {};
  const archive = properties.archive || {};
  const specimens = exhibitSpecimens(feature);
  const scientificNames = specimens.map((specimen) => specimen.scientificName).filter(Boolean);
  const commonNames = specimens.map((specimen) => specimen.commonName).filter(Boolean);
  const specimenText = specimens.map(specimenSearchText).filter(Boolean);
  const reference = compactText([archive.public_reference_code, archive.id, properties.image?.id]);
  const baseFields = {
    id: feature.id || properties.viewer_feature_id,
    name: nameOf(feature),
    altName: properties.alt_name?.en || "",
    layer: properties.viewer_layer || properties.wayfinding_type || "",
    category: properties.category || "",
    localCategory: properties.local_category || "",
    reference,
    publicClass: properties.public_class || "",
    scientificNames: scientificNames.join(" "),
    commonNames: commonNames.join(" "),
    narrative: exhibitNarrative(feature),
    notes: compactText([exhibitNotes(feature), properties.photo_text]),
    specimenText: specimenText.join(" "),
  };
  return {
    ...baseFields,
    fullText: compactText(Object.values(baseFields)),
  };
}

function buildSearchContext(features) {
  const documents = features.map(featureSearchDocument).filter((document) => document.id);
  const index = new MiniSearch({
    fields: SEARCH_FIELDS,
    storeFields: STORE_FIELDS,
    searchOptions: {
      boost: { name: 5, altName: 4, reference: 4, scientificNames: 3, commonNames: 3, localCategory: 2 },
      prefix: true,
      fuzzy: 0.18,
    },
  });
  index.addAll(documents);
  return {
    index,
    documentsById: new Map(documents.map((document) => [document.id, document])),
    featuresById: new Map(features.map((feature) => [feature.id || feature.properties?.viewer_feature_id, feature])),
  };
}

function searchTokens(query) {
  return [...new Set(query.toLowerCase().match(/[a-z0-9_.-]+/g) || [])].filter((token) => token.length > 1);
}

function searchContextResults(searchContext, query, { filter = () => true, limit = VIEWER.searchResultLimit } = {}) {
  const term = query.trim();
  if (!term || !searchContext) return [];
  return searchContext.index.search(term)
    .map((result) => {
      const feature = searchContext.featuresById.get(result.id);
      const document = searchContext.documentsById.get(result.id);
      return feature && document ? { feature, document, terms: result.terms || result.queryTerms || [] } : null;
    })
    .filter(Boolean)
    .filter(({ feature }) => filter(feature))
    .slice(0, limit);
}

function highlightedText(text, tokens) {
  const value = String(text || "");
  if (!value || !tokens.length) return value;
  const pattern = new RegExp(`(${tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  return value.split(pattern).map((part, index) => tokens.some((token) => part.toLowerCase() === token.toLowerCase())
    ? <mark key={`${part}-${index}`}>{part}</mark>
    : part);
}

function searchSnippet(document, tokens) {
  if (!tokens.length) return "";
  const fields = [document.scientificNames, document.commonNames, document.narrative, document.notes, document.specimenText];
  const text = fields.find((field) => tokens.some((token) => field?.toLowerCase().includes(token))) || "";
  if (!text) return "";
  const lower = text.toLowerCase();
  const firstMatch = Math.max(0, Math.min(...tokens.map((token) => lower.indexOf(token)).filter((index) => index >= 0)));
  const start = Math.max(0, firstMatch - 44);
  const end = Math.min(text.length, firstMatch + 110);
  return `${start ? "... " : ""}${text.slice(start, end).trim()}${end < text.length ? " ..." : ""}`;
}


function specimenLabel(specimen, index) {
  return specimen.scientificName || specimen.commonName || specimen.catalogNumber || `Specimen ${index + 1}`;
}


export default function Viewer() {
  const configuredBearing = MAP.bearing;
  const configuredPitch = MAP.pitch;
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const dataRef = useRef(null);
  const didFitInitialView = useRef(false);
  const userAdjustedView = useRef(false);
  const visibleDataRef = useRef(null);
  const renderDataRef = useRef(null);
  const navigationDataRef = useRef(null);
  const usageSessionRef = useRef(null);
  const usageStartedAtRef = useRef(0);
  const lastSearchLogRef = useRef("");
  const lastRouteLogRef = useRef("");
  const [data, setData] = useState(null);
  const [navigationData, setNavigationData] = useState(null);
  const [routingNetwork, setRoutingNetwork] = useState(null);
  const [activeLayers, setActiveLayers] = useState(() => new Set(LAYERS.filter(({ enabledByDefault }) => enabledByDefault).map(({ id }) => id)));
  const [showNavigationDebug, setShowNavigationDebug] = useState(false);
  const [activeLevel, setActiveLevel] = useState("all");
  const [selected, setSelected] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [query, setQuery] = useState("");
  const selectPlaceRef = useRef(null);
  const clearSelectionRef = useRef(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [routeStops, setRouteStops] = useState([]);
  const [appendStopArmed, setAppendStopArmed] = useState(false);
  const [routeResult, setRouteResult] = useState(null);
  const [routeError, setRouteError] = useState("");
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardTarget, setKeyboardTarget] = useState("search");
  const [keyboardCaps, setKeyboardCaps] = useState(false);
  const [viewedImage, setViewedImage] = useState(null);
  const [report, setReport] = useState(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState("");
  const routeFrom = routeStops[0] || null;
  const routeTo = routeStops.length > 1 ? routeStops.at(-1) : null;

  const visibleData = useMemo(() => {
    if (!data) return null;
    return {
      ...data,
      features: data.features.filter((feature) => {
        if (!activeLayers.has(feature.properties.viewer_layer) && feature.id !== selected?.id) return false;
        if (!exhibitMarkerVisible(feature, selected?.id)) return false;
        if (activeLevel === "all") return true;
        const properties = feature.properties;
        return properties.viewer_level_id === activeLevel || properties.level_ids?.includes(activeLevel) || (feature.id === activeLevel && properties.viewer_layer === "level");
      }).map((feature) => {
        const highlight = fixtureHighlightState(feature, selected, routeStops);
        if (feature.id !== selected?.id && !highlight) return feature;
        return {
          ...feature,
          properties: {
            ...feature.properties,
            ...(feature.id === selected?.id || highlight === "current" ? { viewer_selected: true } : {}),
            ...(highlight === "previous" ? { viewer_route_previous: true } : {}),
          },
        };
      }),
    };
  }, [data, activeLayers, activeLevel, selected, routeStops]);
  const renderData = useMemo(() => mapRenderCollection(visibleData), [visibleData]);

  const searchContext = useMemo(() => data ? buildSearchContext(data.features) : null, [data]);
  const searchResultTokens = useMemo(() => searchTokens(query), [query]);

  const matches = useMemo(() => searchContextResults(searchContext, query), [query, searchContext]);


  visibleDataRef.current = visibleData;
  renderDataRef.current = renderData;
  dataRef.current = data;
  navigationDataRef.current = navigationData;

  useEffect(() => {
    const sessionId = crypto.randomUUID();
    usageSessionRef.current = sessionId;
    usageStartedAtRef.current = Date.now();
    sendUsageEvent(sessionId, "session_started");
    const finishSession = () => sendUsageEvent(sessionId, "session_ended", {
      metadata: { duration_seconds: Math.round((Date.now() - usageStartedAtRef.current) / 1000) },
    }, { beacon: true });
    window.addEventListener("pagehide", finishSession, { once: true });
    return () => window.removeEventListener("pagehide", finishSession);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadDeferredData = () => {
      fetch("/map/api/map-data").then((response) => response.json()).then((mapData) => {
        const install = () => { if (!cancelled) setData(mapData); };
        if (window.requestIdleCallback) window.requestIdleCallback(install, { timeout: 2500 });
        else window.setTimeout(install, 0);
      }).catch(() => {});
      fetch("/map/api/navigation").then((response) => response.json()).then((navigation) => {
        if (cancelled) return;
        setNavigationData(navigation);
        const install = () => { if (!cancelled) setRoutingNetwork(buildRoutingNetwork(navigation)); };
        if (window.requestIdleCallback) window.requestIdleCallback(install, { timeout: 2500 });
        else window.setTimeout(install, 0);
      }).catch(() => {});
    };
    fetch("/map/api/map-shell").then((response) => response.json()).then((mapData) => {
      if (!cancelled) setData(mapData);
    }).catch(() => {
      if (!cancelled) setData(emptyCollection());
    }).finally(() => {
      if (!cancelled) {
        setLoading(false);
        loadDeferredData();
      }
    });
    if (window.matchMedia(VIEWER.mobileMediaQuery).matches) setSidebarOpen(false);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;
    const matchColors = ["match", ["get", "viewer_layer"], ...LAYERS.flatMap(({ id, color }) => [id, color]), MAP_LAYERS.fallbackColor];
    const fixtureDefaultColor = LAYERS.find(({ id }) => id === "fixture")?.color || MAP_LAYERS.fallbackColor;
    const fixtureColors = collectionFixtureColorExpression(fixtureDefaultColor);
    const featureColors = ["case", ["==", ["get", "viewer_layer"], "fixture"], fixtureColors, matchColors];
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
    map.on("movestart", (event) => {
      if (event.originalEvent) userAdjustedView.current = true;
    });
    let imageIdleCallback = null;
    map.on("load", () => {
      map.addSource("osm", { type: "raster", tiles: BASEMAP.tiles, tileSize: BASEMAP.tileSize, attribution: BASEMAP.attribution });
      map.addLayer({ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": BASEMAP.saturation, "raster-opacity": BASEMAP.opacity } });
      map.addSource("imdf", {
        type: "geojson",
        data: renderDataRef.current || { type: "FeatureCollection", features: [] },
        promoteId: "viewer_feature_id",
      });
      map.addSource("imdf-points", {
        type: "geojson",
        data: pointFeatures(renderDataRef.current, (feature) => !isDrawer(feature)),
        promoteId: "viewer_feature_id",
      });
      map.addSource("imdf-drawers", drawerSourceOptions(drawerGroups(visibleDataRef.current)));
      map.addSource("imdf-cabinet-exhibits", { type: "geojson", data: cabinetExhibitGroups(dataRef.current), promoteId: "viewer_feature_id" });
      map.addSource("imdf-amenity-icons", { type: "geojson", data: amenityIconFeatures(visibleDataRef.current), promoteId: "viewer_feature_id" });
      map.addSource("imdf-point-feature-icons", { type: "geojson", data: pointFeatureIconFeatures(visibleDataRef.current), promoteId: "viewer_feature_id" });
      map.addSource("collection-badges", { type: "geojson", data: collectionBadgeFeatures(visibleDataRef.current, MAP.bearing) });
      map.addSource("whale-overlay", { type: "geojson", data: whaleOverlayFeature(visibleDataRef.current) });
      map.addSource("collection-sections", { type: "geojson", data: collectionSectionFeatures(visibleDataRef.current, MAP.bearing) });
      map.addSource("approved-route", { type: "geojson", data: emptyCollection() });
      map.addSource("approved-route-endpoints", { type: "geojson", data: emptyCollection() });
      map.addSource("navigation-debug", { type: "geojson", data: emptyCollection() });
      map.addLayer({ id: "collection-sections", type: "fill", source: "collection-sections", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.58 } });
      map.addLayer({ id: "imdf-fill", type: "fill", source: "imdf", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": featureColors, "fill-opacity": ["match", ["get", "viewer_layer"], "fixture", MAP_LAYERS.fillOpacity.fixture, "unit", MAP_LAYERS.fillOpacity.unit, "level", MAP_LAYERS.fillOpacity.level, MAP_LAYERS.fillOpacity.fallback] } });
      map.addLayer({ id: "imdf-line", type: "line", source: "imdf", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": matchColors, "line-width": ["match", ["get", "viewer_layer"], "venue", MAP_LAYERS.lineWidth.venue, "level", MAP_LAYERS.lineWidth.level, MAP_LAYERS.lineWidth.fallback], "line-opacity": MAP_LAYERS.lineOpacity } });
      map.addLayer({ id: "imdf-point", type: "circle", source: "imdf-points", filter: exhibitPointFilter, paint: { "circle-color": matchColors, "circle-radius": ["interpolate", ["linear"], ["zoom"], MAP_LAYERS.pointRadius.minZoom, MAP_LAYERS.pointRadius.min, MAP_LAYERS.pointRadius.maxZoom, MAP_LAYERS.pointRadius.max], "circle-stroke-color": ["case", ["==", ["get", "viewer_selected"], true], "#f5b942", MAP_LAYERS.pointStrokeColor], "circle-stroke-width": ["case", ["==", ["get", "viewer_selected"], true], 3, MAP_LAYERS.pointStrokeWidth] } });
      map.addLayer({
        id: "imdf-point-feature-icons",
        type: "symbol",
        source: "imdf-point-feature-icons",
        layout: {
          "icon-image": ["concat", "point-feature-", ["get", "point_feature_icon"]],
          "icon-size": ["interpolate", ["linear"], ["zoom"], POINT_FEATURE_ICON_SCALE.minZoom, POINT_FEATURE_ICON_SCALE.min, POINT_FEATURE_ICON_SCALE.maxZoom, POINT_FEATURE_ICON_SCALE.max],
          "icon-allow-overlap": true,
          "icon-pitch-alignment": "map",
          "icon-rotation-alignment": "map",
          "icon-rotate": UBC_NORTH_BEARING,
        },
      });
      map.addLayer({
        id: "imdf-amenity-icons",
        type: "symbol",
        source: "imdf-amenity-icons",
        layout: {
          "icon-image": ["concat", "amenity-", ["get", "amenity_icon"]],
          "icon-size": AMENITY_ICON_SIZE_EXPRESSION,
          "icon-offset": AMENITY_ICON_OFFSET_EXPRESSION,
          "icon-allow-overlap": true,
          "icon-pitch-alignment": "map",
          "icon-rotation-alignment": "map",
          "icon-rotate": UBC_NORTH_BEARING,
        },
      });
      map.addLayer({
        id: "collection-badges",
        type: "symbol",
        source: "collection-badges",
        layout: {
          "icon-image": ["concat", "collection-badge-", ["get", "collection"]],
          "icon-size": ["interpolate", ["linear"], ["zoom"], COLLECTION_BADGE_SCALE.minZoom, COLLECTION_BADGE_SCALE.min, COLLECTION_BADGE_SCALE.maxZoom, COLLECTION_BADGE_SCALE.max],
          "icon-offset": collectionBadgeIconOffset,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-pitch-alignment": "map",
          "icon-rotation-alignment": "map",
          "icon-rotate": UBC_NORTH_BEARING,
        },
      });
      map.addLayer({
        id: "whale-overlay",
        type: "symbol",
        source: "whale-overlay",
        layout: {
          "icon-image": WHALE_IMAGE_ID,
          "icon-size": ["interpolate", ["exponential", 2], ["zoom"], WHALE_ICON_SCALE.minZoom, WHALE_ICON_SCALE.min, WHALE_ICON_SCALE.maxZoom, WHALE_ICON_SCALE.max],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-pitch-alignment": "map",
          "icon-rotation-alignment": "map",
          "icon-rotate": UBC_NORTH_BEARING,
        },
      });
      map.addLayer({ id: ICON_LAYER_ID, type: "symbol", source: "imdf-points", filter: ["==", ["get", "exhibit_type"], "floor"], layout: { "icon-image": exhibitImageExpression, "icon-size": ["interpolate", ["linear"], ["zoom"], FULL_CIRCLE_ICON_SCALE.minZoom, FULL_CIRCLE_ICON_SCALE.min, FULL_CIRCLE_ICON_SCALE.maxZoom, FULL_CIRCLE_ICON_SCALE.max], "icon-allow-overlap": true, "icon-pitch-alignment": "map", "icon-rotation-alignment": "map", "icon-rotate": ["coalesce", ["get", "marker_bearing"], 0] } });
      map.addLayer({ id: CABINET_EXHIBIT_ICON_LAYER_ID, type: "symbol", source: "imdf-cabinet-exhibits", layout: { "icon-image": ["case", cabinetExhibitCountFilter, "exhibit-half-circle-tab", "exhibit-half-circle"], "icon-offset": ["case", cabinetExhibitCountFilter, ["literal", [0, -DRAWER_MARKER_OFFSET_PX]], ["literal", [0, 0]]], "icon-size": cabinetExhibitIconSizeExpression, "icon-allow-overlap": true, "icon-pitch-alignment": "map", "icon-rotation-alignment": "map", "icon-rotate": ["get", "marker_bearing"] } });
      map.addLayer({ id: "imdf-cabinet-exhibit-count", type: "symbol", source: "imdf-cabinet-exhibits", filter: cabinetExhibitCountFilter, layout: { "text-field": ["to-string", ["get", "exhibit_count"]], "text-font": [DRAWER_GROUPS.countFont], "text-size": numberedMarkerTextSizeExpression, "text-offset": ["get", "count_offset"], "text-pitch-alignment": "map", "text-rotation-alignment": "map", "text-rotate": UBC_NORTH_BEARING, "text-allow-overlap": true }, paint: { "text-color": DRAWER_GROUPS.strokeColor } });
      map.addLayer({ id: "imdf-drawer-group-half", type: "symbol", source: "imdf-drawers", minzoom: DRAWER_GROUPS.minZoom, filter: ["==", ["get", "marker_shape"], "half-circle-tab"], layout: { "icon-image": "exhibit-half-circle-tab", "icon-size": numberedMarkerSizeExpression, "icon-offset": [0, -DRAWER_MARKER_OFFSET_PX], "icon-pitch-alignment": "map", "icon-rotation-alignment": "map", "icon-rotate": ["coalesce", ["get", "marker_bearing"], 0], "icon-allow-overlap": true } });
      map.addLayer({ id: "imdf-drawer-group", type: "symbol", source: "imdf-drawers", minzoom: DRAWER_GROUPS.minZoom, filter: ["==", ["get", "marker_shape"], "full-circle"], layout: { "icon-image": "exhibit-full-circle", "icon-size": DRAWER_TOP_ICON_SCALE, "icon-pitch-alignment": "map", "icon-rotation-alignment": "map", "icon-allow-overlap": true } });
      map.addLayer({ id: "imdf-drawer-group-count", type: "symbol", source: "imdf-drawers", minzoom: DRAWER_GROUPS.minZoom, filter: drawerCountFilter, layout: { "text-field": ["to-string", ["get", "drawer_count"]], "text-font": [DRAWER_GROUPS.countFont], "text-size": numberedMarkerTextSizeExpression, "text-offset": ["get", "count_offset"], "text-pitch-alignment": "map", "text-rotation-alignment": "map", "text-rotate": UBC_NORTH_BEARING }, paint: { "text-color": DRAWER_GROUPS.strokeColor } });
      map.addLayer({ id: "navigation-debug-line", type: "line", source: "navigation-debug", filter: ["==", ["geometry-type"], "LineString"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": MAP_LAYERS.navigationDebug.lineColor, "line-width": MAP_LAYERS.navigationDebug.lineWidth, "line-opacity": MAP_LAYERS.navigationDebug.lineOpacity } });
      map.addLayer({ id: "navigation-debug-point", type: "circle", source: "navigation-debug", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": MAP_LAYERS.navigationDebug.pointColor, "circle-radius": MAP_LAYERS.navigationDebug.pointRadius, "circle-stroke-color": MAP_LAYERS.navigationDebug.pointStrokeColor, "circle-stroke-width": MAP_LAYERS.navigationDebug.pointStrokeWidth } });
      map.addLayer({ id: "navigation-debug-label", type: "symbol", source: "navigation-debug", minzoom: MAP_LAYERS.navigationDebug.labelMinZoom, layout: { "text-field": ["get", "debug_id"], "text-font": [DRAWER_GROUPS.countFont], "text-size": MAP_LAYERS.navigationDebug.labelSize, "text-offset": [0, 1.1], "text-anchor": "top", "text-allow-overlap": false }, paint: { "text-color": MAP_LAYERS.navigationDebug.labelColor, "text-halo-color": MAP_LAYERS.navigationDebug.labelHaloColor, "text-halo-width": MAP_LAYERS.navigationDebug.labelHaloWidth } });
      map.addLayer({ id: "approved-route-casing", type: "line", source: "approved-route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ROUTING.lineCasingColor, "line-width": ROUTING.lineCasingWidth, "line-opacity": ROUTING.lineOpacity } });
      map.addLayer({ id: "approved-route", type: "line", source: "approved-route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ROUTING.lineColor, "line-width": ROUTING.lineWidth, "line-opacity": ROUTING.lineOpacity } });
      map.addLayer({ id: "approved-route-endpoints", type: "circle", source: "approved-route-endpoints", paint: { "circle-color": ["match", ["get", "highlight"], "previous", ROUTING.previousSelectionColor, ROUTING.currentSelectionColor], "circle-radius": ROUTING.endpointRadius, "circle-stroke-color": ROUTING.endpointStrokeColor, "circle-stroke-width": ROUTING.endpointStrokeWidth } });
      map.addLayer({ id: "approved-route-endpoint-labels", type: "symbol", source: "approved-route-endpoints", layout: { "text-field": ["get", "label"], "text-font": [ROUTING.endpointFont], "text-size": ROUTING.endpointFontSize }, paint: { "text-color": ROUTING.endpointTextColor } });
      map.addLayer({
        id: "imdf-fixture-extrusion",
        type: "fill-extrusion",
        source: "imdf",
        filter: [
          "all",
          ["==", ["geometry-type"], "Polygon"],
          ["==", ["get", "viewer_layer"], "fixture"],
          ["!=", ["get", "local_category"], "floor_display_fixture"]
        ],
        paint: {
          "fill-extrusion-color": [
            "case",
            ["==", ["get", "viewer_selected"], true],
            ROUTING.currentSelectionColor,
            ["==", ["get", "viewer_route_previous"], true],
            ROUTING.previousSelectionColor,
            fixtureColors
          ],

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
      for (const id of DRAWER_OVERLAY_LAYERS) map.moveLayer(id);
      map.moveLayer("imdf-cabinet-exhibit-count");
      map.moveLayer("collection-badges", "imdf-point");
      map.moveLayer("whale-overlay", "imdf-point");
      for (const id of ["approved-route-casing", "approved-route", "approved-route-endpoints", "approved-route-endpoint-labels"]) map.moveLayer(id);
      const deferredImageLayers = ["imdf-point-feature-icons", "imdf-amenity-icons", "collection-badges", "whale-overlay", ICON_LAYER_ID, CABINET_EXHIBIT_ICON_LAYER_ID, "imdf-drawer-group-half", "imdf-drawer-group"];
      for (const id of deferredImageLayers) map.setLayoutProperty(id, "visibility", "none");
      map.on("click", (event) => {
        const hits = map.queryRenderedFeatures(event.point, { layers: INTERACTIVE_MAP_LAYERS });
        const hit = hits.find(f => !isMapBackground(f));
        if (!hit) { clearSelectionRef.current(); return; }
        const featureId = hit.id || hit.properties?.viewer_feature_id;
        const feature = visibleDataRef.current?.features.find(f => f.id === featureId) || dataRef.current?.features.find(f => f.id === featureId);
        if (feature) selectPlaceRef.current(feature, Boolean(event.originalEvent?.shiftKey));
      });
      if (!didFitInitialView.current && !userAdjustedView.current && fitLevelExtents(map, visibleDataRef.current)) didFitInitialView.current = true;

      const installMapImages = async () => {
        const images = [
          ...["half-circle", "full-circle", "half-circle-tab"].map((type) => ({ id: `exhibit-${type}`, url: `/map/marker-icons/${type}.png` })),
          ...COLLECTIONS.map(({ id }) => ({ id: `collection-badge-${id}`, url: `/map/collection-badges/${id}.png` })),
          { id: WHALE_IMAGE_ID, url: "/map/floor-graphics/whale.png" },
          ...AMENITY_ICON_IDS.map((id) => ({ id: `amenity-${id}`, url: `/map/amenity-icons/${id}.png` })),
          ...POINT_FEATURE_ICON_IDS.map((id) => ({ id: `point-feature-${id}`, url: `/map/point-feature-icons/${id}.png` })),
        ];
        await Promise.allSettled(images.map(async ({ id, url }) => {
          const image = await map.loadImage(url);
          if (mapRef.current === map && !map.hasImage(id)) map.addImage(id, image.data);
        }));
        if (mapRef.current === map) for (const id of deferredImageLayers) map.setLayoutProperty(id, "visibility", "visible");
      };
      if (window.requestIdleCallback) imageIdleCallback = window.requestIdleCallback(installMapImages, { timeout: 1500 });
      else window.setTimeout(installMapImages, 0);
    });
    mapRef.current = map;
    return () => {
      if (imageIdleCallback !== null && window.cancelIdleCallback) window.cancelIdleCallback(imageIdleCallback);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const source = mapRef.current?.getSource("imdf");
    if (source && renderData) source.setData(renderData);
    const pointSource = mapRef.current?.getSource("imdf-points");
    if (pointSource && renderData) pointSource.setData(pointFeatures(renderData, (feature) => !isDrawer(feature)));
    const drawerSource = mapRef.current?.getSource("imdf-drawers");
    if (drawerSource && visibleData) drawerSource.setData(drawerGroups(visibleData));
    const cabinetExhibitSource = mapRef.current?.getSource("imdf-cabinet-exhibits");
    if (cabinetExhibitSource && data && activeLayers.has("exhibit")) cabinetExhibitSource.setData(cabinetExhibitGroups({ ...data, features: data.features.filter((feature) => activeLevel === "all" || feature.properties.viewer_level_id === activeLevel || feature.properties.level_ids?.includes(activeLevel)) }));
    else if (cabinetExhibitSource) cabinetExhibitSource.setData(emptyCollection());
    const amenityIconSource = mapRef.current?.getSource("imdf-amenity-icons");
    if (amenityIconSource && visibleData) amenityIconSource.setData(amenityIconFeatures(visibleData));
    const pointFeatureIconSource = mapRef.current?.getSource("imdf-point-feature-icons");
    if (pointFeatureIconSource && visibleData) pointFeatureIconSource.setData(pointFeatureIconFeatures(visibleData));
    const badgeSource = mapRef.current?.getSource("collection-badges");
    if (badgeSource && visibleData) badgeSource.setData(collectionBadgeFeatures(visibleData, configuredBearing));
    const whaleSource = mapRef.current?.getSource("whale-overlay");
    if (whaleSource && visibleData) whaleSource.setData(whaleOverlayFeature(visibleData));
    const sectionSource = mapRef.current?.getSource("collection-sections");
    if (sectionSource && visibleData) sectionSource.setData(collectionSectionFeatures(visibleData, configuredBearing));
    if (!didFitInitialView.current && !userAdjustedView.current && mapRef.current?.loaded() && fitLevelExtents(mapRef.current, visibleData)) didFitInitialView.current = true;
  }, [visibleData, renderData, data, activeLayers, activeLevel, configuredBearing]);

  useEffect(() => {
    const source = mapRef.current?.getSource("navigation-debug");
    if (source) source.setData(showNavigationDebug && navigationData ? navigationData : emptyCollection());
  }, [navigationData, showNavigationDebug]);

  useEffect(() => {
    mapRef.current?.jumpTo({ bearing: configuredBearing, pitch: configuredPitch });
  }, [configuredBearing, configuredPitch]);

  useEffect(() => {
    if (!routingNetwork || routeStops.length < 2) {
      setRouteResult(null);
      setRouteError("");
      return;
    }
    const result = findMultiStopRoute(routingNetwork, routeStops);
    setRouteResult(result);
    setRouteError(result ? "" : "One or more stops cannot be connected.");
    const signature = routeStops.map((feature) => feature.id).join(":");
    if (lastRouteLogRef.current !== signature) {
      lastRouteLogRef.current = signature;
      sendUsageEvent(usageSessionRef.current, "route", {
        feature_id: String(routeTo.id),
        metadata: { stop_feature_ids: routeStops.map((feature) => String(feature.id)), found: Boolean(result), distance_meters: result ? Math.round(result.distanceMeters * 10) / 10 : null },
      });
    }
  }, [routingNetwork, routeStops, routeTo]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      if (!normalized) lastSearchLogRef.current = "";
      return;
    }
    const timer = window.setTimeout(() => {
      if (lastSearchLogRef.current === normalized) return;
      lastSearchLogRef.current = normalized;
      sendUsageEvent(usageSessionRef.current, "search", { query: normalized, metadata: { result_count: matches.length } });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [query, matches.length]);

  useEffect(() => {
    const source = mapRef.current?.getSource("approved-route");
    if (!source) return;
    source.setData(routeDisplayLine(routeResult));
    mapRef.current?.getSource("approved-route-endpoints")?.setData(routeDisplayEndpoints(routeStops, routingNetwork));
  }, [routeResult, routeStops, routingNetwork]);

  function toggleLayer(id) {
    setActiveLayers((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function focusFeature(feature, source = "details") {
    const searchQuery = query.trim();
    if (source === "search" && searchQuery) {
      lastSearchLogRef.current = searchQuery;
      sendUsageEvent(usageSessionRef.current, "search", { query: searchQuery, feature_id: String(feature.id), metadata: { result_count: matches.length, selected: true } });
    }
    sendUsageEvent(usageSessionRef.current, "feature_selected", { feature_id: String(feature.id), metadata: { source, layer: feature.properties.viewer_layer } });
    if (activeLevel !== "all" && feature.properties.viewer_level_id) setActiveLevel(feature.properties.viewer_level_id);
    mapRef.current?.flyTo({ center: featureCenter(feature), zoom: MAP.featureZoom, duration: MAP.flyDurationMs });
    setSelected(feature);
    setSelectedGroup(null);
    setQuery("");
  }

  function clearRoute() {
    lastRouteLogRef.current = "";
    setRouteStops([]);
    setAppendStopArmed(false);
    setRouteResult(null);
    setRouteError("");
  }

  function removeRouteStop(index) {
    const nextStops = routeStops.filter((_, stopIndex) => stopIndex !== index);
    setRouteStops(nextStops);
    setSelected(nextStops.at(-1) || null);
    setAppendStopArmed(false);
  }

  selectPlaceRef.current = (feature, append = false) => {
    if (isMapBackground(feature)) {
      clearSelectionRef.current();
      return;
    }
    setSelected(feature);
    setSelectedGroup(null);
    setQuery("");
    sendUsageEvent(usageSessionRef.current, "feature_selected", { feature_id: String(feature.id), metadata: { source: append ? "shift-click" : "map", layer: feature.properties.viewer_layer } });
    if (isRoutableFeature(routingNetwork, feature)) {
      if (append || appendStopArmed) setRouteStops((stops) => appendRouteStop(stops, feature));
      else {
        const [from, to] = nextRouteSelection(routeFrom, routeTo, feature);
        setRouteStops([from, to].filter(Boolean));
      }
    }
  };
  clearSelectionRef.current = () => {
    clearRoute();
    setSelected(null);
    setSelectedGroup(null);
  };

  function routeEndpointControl(index, selectedFeature, placeholder = false) {
    const label = routeStopLabel(index);
    const highlight = selectedFeature ? (index === routeStops.length - 1 ? "current" : "previous") : "";
    return <div className={`route-endpoint${highlight ? ` ${highlight}` : ""}`} key={`route-stop-${index}-${selectedFeature?.id || "empty"}`}>
      <span>{label}</span>
      <div className="endpoint-select">
        <small>{index === 0 ? "Start" : index === routeStops.length - 1 && routeStops.length > 1 ? "Destination" : "Stop"}</small>
        <strong>{selectedFeature ? nameOf(selectedFeature) : "Click a place on the map"}</strong>
      </div>
      {!placeholder && selectedFeature && <button className="remove-stop" onClick={() => removeRouteStop(index)} title={`Remove stop ${label}`}><X /></button>}
    </div>;
  }

  const properties = selected?.properties || {};
  const selectedLayerLabel = properties.viewer_layer || properties.wayfinding_type || properties.category || "feature";
  const existingExhibits = relatedExhibitsForFeature(selected, data);
  const fixtureId = properties.related_fixture_id || (properties.viewer_layer === "fixture" ? selected.id : null);
  const selectedTranscriptions = [...new Map([
    ...(properties.viewer_layer === "exhibit" ? [] : properties.image_transcriptions || []).map((entry) => ({ ...entry, location_name: nameOf(selected), photo_text: properties.photo_text })),
    ...(fixtureId ? (data?.features || []).filter((feature) => feature.properties.viewer_layer !== "exhibit" && feature.properties.related_fixture_id === fixtureId).flatMap((feature) => (feature.properties.image_transcriptions || []).map((entry) => ({ ...entry, location_name: nameOf(feature), photo_text: feature.properties.photo_text }))) : []),
  ].map((entry) => [entry.image_url, entry])).values()];
  const photoGroups = new Map();
  for (const entry of selectedTranscriptions) {
    const key = JSON.stringify([entry.issue_url || entry.issue_number, entry.location_name]);
    if (!photoGroups.has(key)) photoGroups.set(key, []);
    photoGroups.get(key).push(entry);
  }
  const selectedExhibits = [...existingExhibits, ...[...photoGroups.entries()].map(([key, photos]) => ({
    id: `submission-${key}`,
    properties: {
      name: { en: photos[0].location_name },
      exhibit_type: "exhibit",
      archive: { public_reference_code: photos[0].location_name },
      photo_submission: photos[0],
      details: { text: { en: photos[0].photo_text || "" }, notes: "Automatically transcribed from the clearest photo." },
    },
  }))];

  function openReport() {
    setReport({ step: "edit", issueType: "incorrect_information", description: "", feature: selected, result: null });
    setReportError("");
    setKeyboardOpen(false);
  }

  function closeReport() {
    setReport(null);
    setReportError("");
    setKeyboardOpen(false);
  }

  function applyKeyboardKey(key) {
    if (keyboardTarget === "report") {
      setReport((current) => current ? { ...current, description: applyVirtualKey(current.description, key).slice(0, 1000) } : current);
    } else {
      setQuery((value) => applyVirtualKey(value, key));
    }
  }

  async function submitReport() {
    if (!report || reportSubmitting) return;
    setReportSubmitting(true);
    setReportError("");
    const feature = report.feature;
    try {
      const response = await fetch("/map/api/report-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issue_type: report.issueType,
          description: report.description,
          session_id: usageSessionRef.current,
          occurred_at: new Date().toISOString(),
          feature_id: feature ? String(feature.id) : "",
          feature_name: feature ? nameOf(feature) : "",
          feature_layer: feature?.properties?.viewer_layer || "",
          coordinates: feature ? featureCenter(feature) : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The report could not be submitted.");
      setReport((current) => ({ ...current, step: "success", result }));
      sendUsageEvent(usageSessionRef.current, "issue_reported", { feature_id: feature ? String(feature.id) : null, metadata: { issue_type: report.issueType, issue_number: result.number } });
    } catch (error) {
      setReportError(error.message || "The report could not be submitted.");
    } finally {
      setReportSubmitting(false);
    }
  }

  return <main className="viewer-shell" onClick={(event) => {
    if (!mapNode.current?.contains(event.target) && !event.target.closest("button, input, textarea, label, a, summary, .search-results, .exhibit-panel, .virtual-keyboard, .image-viewer, .report-overlay")) clearSelectionRef.current();
  }}>
    <div ref={mapNode} className="map" />
    <header className="brand-bar"><Image className="brand-logo" src="/map/branding/beaty-logo-stacked.svg" alt="Beaty Biodiversity Museum" width={55} height={64} priority /><span>Indoor map</span></header>
    <button className={`sidebar-toggle icon-button ${sidebarOpen ? "is-open" : ""}`} onClick={() => setSidebarOpen((value) => !value)} title={sidebarOpen ? "Close layers panel" : "Open layers panel"}>{sidebarOpen ? <ChevronLeft /> : <ChevronRight />}</button>
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
      <section className="place-search">
        <div className="search-wrap"><Search size={ICON_SIZE.search} /><input value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => { setKeyboardTarget("search"); setKeyboardOpen(true); }} inputMode="none" autoComplete="off" placeholder="Search places or exhibit text" aria-label="Search places or exhibit text" />{query && <button className="clear-button" onClick={() => setQuery("")} title="Clear search"><X size={ICON_SIZE.clear} /></button>}</div>
        {query && <div className="search-results">{matches.length ? matches.map(({ feature, document }) => {
          const snippet = searchSnippet(document, searchResultTokens);
          return <div className="search-result" key={`${feature.properties.viewer_layer}-${feature.id}`}>
            <button onClick={() => focusFeature(feature, "search")}>
              <span><strong>{highlightedText(document.name, searchResultTokens)}</strong>{snippet && <em>{highlightedText(snippet, searchResultTokens)}</em>}</span>
              <small>Details</small>
            </button>
          </div>;
        }) : <p>No matching places.</p>}</div>}
      </section>
      <section className="route-panel"><div className="section-title"><Route size={ICON_SIZE.section} /><h2>Route</h2>{routeStops.length > 0 && <button className="clear-button" onClick={clearRoute} title="Clear route"><X size={ICON_SIZE.clear} /></button>}</div>
        {routeStops.length ? routeStops.map((feature, index) => routeEndpointControl(index, feature)) : routeEndpointControl(0, null, true)}
        {routeStops.length < 2 && routeEndpointControl(1, null, true)}
        {routeStops.length >= 2 && <button className={`add-route-stop${appendStopArmed ? " active" : ""}`} onClick={() => setAppendStopArmed((value) => !value)}>{appendStopArmed ? "Done adding stops" : "+ Add stops"}</button>}
        {appendStopArmed && <p className="add-stop-hint">Tap each additional destination on the map.</p>}
        {routeResult && <p className="route-status"><Navigation size={14} /> Route · {Math.round(routeResult.distanceMeters)} m</p>}
        {routeError && <p className="route-error">{routeError}</p>}
      </section>
      <section><div className="section-title"><Layers3 size={ICON_SIZE.section} /><h2>Layers</h2><span>{visibleData?.features.length || 0}</span></div><div className="layer-list">
        {LAYERS.map((layer) => <label key={layer.id}><input type="checkbox" checked={activeLayers.has(layer.id)} onChange={() => toggleLayer(layer.id)} /><i style={{ background: layer.color }} /><span>{layer.label}</span><small>{data?.features.filter((feature) => feature.properties.viewer_layer === layer.id).length || 0}</small></label>)}
        <label><input type="checkbox" checked={showNavigationDebug} onChange={() => setShowNavigationDebug((value) => !value)} /><i style={{ background: MAP_LAYERS.navigationDebug.lineColor }} /><span>Navigation</span><small>{navigationData?.features.length || 0}</small></label>
      </div></section>
      <p className="usage-notice">Anonymous searches, routes and exhibit interactions are recorded to improve this map.</p>
      <button className="report-problem-button" onClick={openReport}><Flag size={16} />Report a problem</button>
      <section><div className="section-title"><Building2 size={ICON_SIZE.section} /><h2>Level</h2></div><div className="segments">{LEVELS.map((level) => <button className={activeLevel === level.id ? "active" : ""} key={level.id} onClick={() => setActiveLevel(level.id)}>{level.label}</button>)}</div></section>
    </aside>
    <button className="locate-button icon-button" onClick={() => mapRef.current && fitLevelExtents(mapRef.current, data, MAP.flyDurationMs)} title="Return to museum"><LocateFixed /></button>
    {selectedGroup && <aside className="inspector group-inspector"><div className="inspector-head"><div className="feature-icon"><Layers3 size={ICON_SIZE.feature} /></div><div><small>Grouped location</small><h2>{selectedGroup.every((feature) => feature.properties.local_category === "drawer_exhibit") ? "Drawers at this position" : "Features at this position"}</h2></div><button className="icon-button" onClick={() => setSelectedGroup(null)} title="Close grouped features"><X /></button></div><div className="group-list">
      {selectedGroup.map((feature) => <button key={feature.id} onClick={() => focusFeature(feature)}><span>{nameOf(feature)}</span><small>{feature.properties.alt_name?.en || feature.properties.viewer_layer}</small></button>)}
    </div></aside>}
    {selected && <aside className="inspector"><div className="inspector-head"><div className="feature-icon"><MapPin size={ICON_SIZE.feature} /></div><div><small>{selectedLayerLabel}</small><h2>{nameOf(selected)}</h2></div><button className="icon-button" onClick={() => clearSelectionRef.current()} title="Close feature details"><X /></button></div>

      {selectedExhibits.length > 0 && <section className="exhibit-panel"><div className="section-title"><MapPin size={ICON_SIZE.section} /><h2>Exhibits at this spot</h2><span>{selectedExhibits.length}</span></div><div className="exhibit-list">
        {selectedExhibits.map((exhibit) => {
          const imageUrl = exhibitImageUrl(exhibit);
          const specimenNames = exhibitSpecimenNames(exhibit);
          const specimens = exhibitSpecimens(exhibit);
          const narrative = exhibitNarrative(exhibit);
          const notes = exhibitNotes(exhibit);
          return <article className="exhibit-card" key={exhibit.id}>
            {imageUrl && <button className="exhibit-image-button" onClick={() => { setViewedImage({ url: imageUrl, alt: nameOf(exhibit) }); sendUsageEvent(usageSessionRef.current, "image_opened", { feature_id: String(exhibit.id) }); }} aria-label={`View image of ${nameOf(exhibit)}`}><img src={imageUrl} alt="" loading="lazy" /></button>}
            <div><small>{exhibitSubtitle(exhibit)}</small><strong>{exhibitSummary(exhibit)}</strong><span>{nameOf(exhibit)}</span>
              {specimenNames.length > 0 && <ul className="exhibit-names">{specimenNames.map(({ scientificName, commonName }) => <li key={`${scientificName || ""}-${commonName || ""}`}>{scientificName && <em>{scientificName}</em>}{scientificName && commonName ? " · " : ""}{commonName}</li>)}</ul>}
              {(specimens.length > 0 || narrative || notes) && <details className="exhibit-details"><summary>Full details</summary>
                {narrative && <section><h3>Narrative</h3><p>{narrative}</p></section>}
                {notes && <section><h3>Notes</h3><p>{notes}</p></section>}
                {specimens.length > 0 && <section><h3>Specimens</h3><ul>{specimens.map((specimen, index) => <li key={`${specimenLabel(specimen, index)}-${index}`}>
                  <strong>{specimen.scientificName && <em>{specimen.scientificName}</em>}{specimen.scientificName && specimen.commonName ? " · " : ""}{specimen.commonName || (!specimen.scientificName ? specimenLabel(specimen, index) : "")}</strong>
                  {[specimen.specimenType, specimen.presence, specimen.catalogNumber].filter(Boolean).length > 0 && <span>{[specimen.specimenType, specimen.presence, specimen.catalogNumber].filter(Boolean).join(" · ")}</span>}
                  {specimen.notes && <p>{specimen.notes}</p>}
                </li>)}</ul></section>}
              </details>}
            </div>
          </article>;
        })}
      </div></section>}
    </aside>}
    {report && <div className="report-overlay" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <div className="report-dialog">
        <div className="report-head"><div><small>Visitor feedback</small><h2 id="report-title">Report a problem</h2></div><button className="icon-button" onClick={closeReport} title="Close report form"><X /></button></div>
        {report.step === "edit" && <div className="report-content">
          <div className="report-context"><strong>{report.feature ? nameOf(report.feature) : "General map report"}</strong><span>{report.feature ? `Selected ${report.feature.properties.viewer_layer || "feature"}` : "No map feature selected"}</span></div>
          <fieldset><legend>What kind of problem is this?</legend><div className="report-types">{REPORT_TYPES.map((type) => <button type="button" className={report.issueType === type.id ? "active" : ""} aria-pressed={report.issueType === type.id} key={type.id} onClick={() => setReport((current) => ({ ...current, issueType: type.id }))}>{type.label}</button>)}</div></fieldset>
          <label className="report-description"><span>What should we know?</span><textarea value={report.description} maxLength={1000} inputMode="none" placeholder="Describe what is wrong and what you expected to see." onChange={(event) => setReport((current) => ({ ...current, description: event.target.value }))} onFocus={() => { setKeyboardTarget("report"); setKeyboardOpen(true); }} /><small>{report.description.length}/1000</small></label>
          <div className="report-actions"><button onClick={closeReport}>Cancel</button><button disabled={report.description.trim().length < 10} onClick={() => { setKeyboardOpen(false); setReport((current) => ({ ...current, step: "review" })); }}>Review report</button></div>
        </div>}
        {report.step === "review" && <div className="report-content report-review"><p><strong>Issue type</strong><span>{REPORT_TYPES.find(({ id }) => id === report.issueType)?.label}</span></p><p><strong>Map context</strong><span>{report.feature ? nameOf(report.feature) : "General map"}</span></p><p><strong>Description</strong><span>{report.description}</span></p>{reportError && <div className="report-error" role="alert">{reportError}</div>}<div className="report-actions"><button disabled={reportSubmitting} onClick={() => setReport((current) => ({ ...current, step: "edit" }))}>Back</button><button disabled={reportSubmitting} onClick={submitReport}>{reportSubmitting ? "Submitting…" : "Submit report"}</button></div></div>}
        {report.step === "success" && <div className="report-content report-success"><Flag /><h3>Thank you</h3><p>Your report was submitted as issue #{report.result.number}.</p><button onClick={closeReport}>Done</button></div>}
      </div>
    </div>}
    {keyboardOpen && <section className="virtual-keyboard" aria-label={`On-screen ${keyboardTarget === "report" ? "report" : "search"} keyboard`}>
      <div className="keyboard-head"><strong>{keyboardTarget === "report" ? "Description keyboard" : "Search keyboard"}</strong><button onClick={() => setKeyboardOpen(false)} aria-label="Close keyboard"><X /></button></div>
      {KEYBOARD_ROWS.map((row, index) => <div className={`keyboard-row keyboard-row-${index}`} key={index}>{row.map((key) => <button key={key} onPointerDown={(event) => event.preventDefault()} onClick={() => applyKeyboardKey(virtualKeyWithCaps(key, keyboardCaps))}>{key}</button>)}</div>)}
      <div className="keyboard-row keyboard-actions"><button className={keyboardCaps ? "caps-key active" : "caps-key"} aria-pressed={keyboardCaps} onClick={() => setKeyboardCaps((value) => !value)}>Caps</button><button onClick={() => applyKeyboardKey("clear")}>Clear</button><button className="space-key" onClick={() => applyKeyboardKey("space")}>Space</button><button onClick={() => applyKeyboardKey("backspace")}>⌫</button><button onClick={() => setKeyboardOpen(false)}>Done</button></div>
    </section>}
    {viewedImage && <div className="image-viewer" role="dialog" aria-modal="true" aria-label={viewedImage.alt} onClick={() => setViewedImage(null)}>
      <div className="image-frame" onClick={(event) => event.stopPropagation()}><div className="image-viewer-head"><strong>{viewedImage.alt}</strong><button className="icon-button" onClick={() => setViewedImage(null)} title="Close image"><X /></button></div><img src={viewedImage.url} alt={viewedImage.alt} /></div>
    </div>}
    {loading && <div className="loading">Loading indoor map...</div>}
  </main>;
}
