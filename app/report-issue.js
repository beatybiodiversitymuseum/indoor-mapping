import { mapIconOption } from "./map-icon-options.js";
import { drawingSummary, drawingVertices, relativeDrawingPoints } from "./drawing.js";

export const REPORT_TYPES = [
  { id: "incorrect_information", label: "Incorrect information" },
  { id: "wrong_location", label: "Wrong map location" },
  { id: "missing_feature", label: "Missing place or exhibit" },
  { id: "routing_problem", label: "Routing problem" },
  { id: "display_problem", label: "Display problem" },
  { id: "other", label: "Other" },
];

const reportTypeLabels = new Map(REPORT_TYPES.map(({ id, label }) => [id, label]));
const cleanText = (value, maxLength) => typeof value === "string" ? value.trim().slice(0, maxLength) : "";

export function normalizeDrawnGeometry(value) {
  if (!value || !["Point", "LineString", "Polygon"].includes(value.type)) throw new Error("Draw a point, polyline, or polygon");
  const validPosition = (position) => Array.isArray(position) && position.length === 2
    && position.every(Number.isFinite) && Math.abs(position[0]) <= 180 && Math.abs(position[1]) <= 90;
  if (value.type === "Point") {
    if (!validPosition(value.coordinates)) throw new Error("Draw valid map coordinates");
  } else {
    const polygon = value.type === "Polygon";
    if (polygon && (!Array.isArray(value.coordinates) || value.coordinates.length !== 1)) throw new Error("Draw a polygon with one closed ring");
    const positions = polygon ? value.coordinates[0] : value.coordinates;
    if (!Array.isArray(positions) || positions.length < (polygon ? 4 : 2) || positions.length > (polygon ? 501 : 500)
      || !positions.every(validPosition)
      || new Set(positions.map((position) => JSON.stringify(position))).size < (polygon ? 3 : 2)
      || (polygon && JSON.stringify(positions[0]) !== JSON.stringify(positions.at(-1)))) throw new Error("Draw valid map coordinates with enough distinct vertices and a closed polygon ring");
  }
  return { type: value.type, coordinates: value.coordinates };
}

export function normalizeIssueReport(value) {
  if (!value || typeof value !== "object") throw new Error("Report must be an object");
  if (value.geometry?.type === "Point" && value.icon != null && value.icon !== "" && !mapIconOption(value.icon)) throw new Error("Choose a valid map icon");
  const issueType = cleanText(value.issue_type, 40);
  const description = cleanText(value.description, 1000);
  const sessionId = cleanText(value.session_id, 64);
  if (!reportTypeLabels.has(issueType)) throw new Error("Choose a valid issue type");
  if (description.length < 10) throw new Error("Describe the problem in at least 10 characters");
  if (!sessionId) throw new Error("A session identifier is required");
  const coordinates = Array.isArray(value.coordinates) && value.coordinates.length >= 2
    && value.coordinates.slice(0, 2).every(Number.isFinite) ? value.coordinates.slice(0, 2) : null;
  const parsedTime = Date.parse(value.occurred_at);
  return {
    geometry: value.geometry == null ? null : normalizeDrawnGeometry(value.geometry),
    referencePoint: value.geometry && value.reference_point != null ? normalizeDrawnGeometry({ type: "Point", coordinates: value.reference_point }).coordinates : null,
    icon: value.geometry?.type === "Point" ? value.icon || "" : "",
    levelId: cleanText(value.level_id, 160),
    issueType,
    issueTypeLabel: reportTypeLabels.get(issueType),
    description,
    sessionId,
    featureId: cleanText(value.feature_id, 160),
    featureName: cleanText(value.feature_name, 200),
    featureLayer: cleanText(value.feature_layer, 80),
    coordinates,
    occurredAt: Number.isFinite(parsedTime) ? new Date(parsedTime).toISOString() : new Date().toISOString(),
  };
}

export function buildGitHubIssue(report) {
  const location = report.featureName || "General map";
  const context = report.featureId ? [
    `- **Selected feature:** ${report.featureName || "Unnamed feature"}`,
    `- **Feature ID:** \`${report.featureId.replaceAll("`", "") }\``,
    report.featureLayer ? `- **Layer:** ${report.featureLayer}` : null,
    report.coordinates ? `- **Map position:** ${report.coordinates.map((coordinate) => coordinate.toFixed(7)).join(", ")}` : null,
  ].filter(Boolean) : report.geometry ? ["- **Submission:** New map feature"] : ["- **Selected feature:** None (general map report)"];
  return {
    title: (report.geometry ? `Map addition: Proposed ${report.geometry.type === "LineString" ? "polyline" : report.geometry.type.toLowerCase()}` : `Map report: ${report.issueTypeLabel} — ${location}`).slice(0, 240),
    body: [
      report.geometry ? "## Proposed map feature" : "## Visitor report",
      "",
      report.geometry ? "**Submission type:** New map feature" : `**Issue type:** ${report.issueTypeLabel}`,
      "",
      "### Description",
      "",
      report.description,
      "",
      "### Map context",
      "",
      ...context,
      ...(report.geometry ? [
        "", "### Proposed map feature", "", drawingSummary(report.geometry), ...(report.geometry.type === "Point" ? [`Map icon: ${mapIconOption(report.icon)?.label || "No icon"}`] : []), "",
        "```geojson", JSON.stringify({ type: "Feature", properties: { level_id: report.levelId || null, ...(report.geometry.type === "Point" && report.icon ? { icon: report.icon } : {}), ...(report.referencePoint ? { reference_point: report.referencePoint, relative_points: relativeDrawingPoints(report.referencePoint, drawingVertices(report.geometry)) } : {}) }, geometry: report.geometry }, null, 2), "```", "",
      ] : []),
      `- **${report.geometry ? "Submitted" : "Reported"} at:** ${report.occurredAt}`,
      "",
      "_Submitted from the museum indoor map._",
    ].join("\n"),
    labels: ["needs review"],
  };
}
