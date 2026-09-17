import { buildGitHubIssue, normalizeIssueReport } from "../../report-issue.js";
import { assertIssueReportAllowed, recordIssueReportAttempt } from "../../usage-store.js";

export const runtime = "nodejs";

export async function POST(request) {
  let report;
  try {
    report = normalizeIssueReport(await request.json());
    assertIssueReportAllowed(report.sessionId);
  } catch (error) {
    const rateLimited = error?.message === "Report rate limit exceeded";
    return Response.json({ error: rateLimited ? "Too many reports have been submitted. Please try again later." : error?.message || "Invalid report" }, { status: rateLimited ? 429 : 400 });
  }

  const token = process.env.GITHUB_ISSUE_TOKEN;
  const repository = process.env.GITHUB_ISSUE_REPOSITORY || "beatybiodiversitymuseum/indoor-mapping";
  if (!token || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    console.error("GitHub issue reporting is not configured");
    return Response.json({ error: "Problem reporting is temporarily unavailable." }, { status: 503 });
  }

  recordIssueReportAttempt(report.sessionId, "started");
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/issues`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(buildGitHubIssue(report)),
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const issue = await response.json();
    return Response.json({ number: issue.number });
  } catch (error) {
    console.error("Unable to create GitHub issue", error);
    return Response.json({ error: "The report could not be submitted. Please try again." }, { status: 502 });
  }
}
