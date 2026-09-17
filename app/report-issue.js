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

export function normalizeIssueReport(value) {
  if (!value || typeof value !== "object") throw new Error("Report must be an object");
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
  ].filter(Boolean) : ["- **Selected feature:** None (general map report)"];
  return {
    title: `Map report: ${report.issueTypeLabel} — ${location}`.slice(0, 240),
    body: [
      "## Visitor report",
      "",
      `**Issue type:** ${report.issueTypeLabel}`,
      "",
      "### Description",
      "",
      report.description,
      "",
      "### Map context",
      "",
      ...context,
      `- **Reported at:** ${report.occurredAt}`,
      "",
      "_Submitted from the museum indoor map._",
    ].join("\n"),
    labels: ["needs review"],
  };
}
