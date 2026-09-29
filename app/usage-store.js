import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

const EVENT_TYPES = new Set(["session_started", "session_ended", "search", "feature_selected", "route", "image_opened", "issue_reported"]);
const databasePath = path.resolve(/* turbopackIgnore: true */ process.env.USAGE_DB_PATH || path.join(process.cwd(), ".data", "usage.sqlite3"));
let database;
let lastCleanup = 0;

function getDatabase() {
  if (database) return database;
  mkdirSync(path.dirname(databasePath), { recursive: true });
  database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 3000");
  database.exec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_at TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      feature_id TEXT,
      query TEXT,
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS usage_events_session_idx ON usage_events(session_id, occurred_at);
    CREATE INDEX IF NOT EXISTS usage_events_type_idx ON usage_events(event_type, occurred_at);
    CREATE TABLE IF NOT EXISTS issue_report_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      session_id TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS issue_report_attempts_session_idx ON issue_report_attempts(session_id, received_at);
  `);
  return database;
}

const text = (value, maxLength) => typeof value === "string" ? value.trim().slice(0, maxLength) : null;

export function normalizeUsageEvent(value) {
  if (!value || typeof value !== "object") throw new Error("Event must be an object");
  const sessionId = text(value.session_id, 64);
  const eventType = text(value.event_type, 32);
  if (!sessionId || !EVENT_TYPES.has(eventType)) throw new Error("Invalid usage event");
  const parsedTime = Date.parse(value.occurred_at);
  const occurredAt = Number.isFinite(parsedTime) ? new Date(parsedTime).toISOString() : new Date().toISOString();
  const metadata = value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)
    ? JSON.stringify(value.metadata).slice(0, 4000)
    : null;
  return {
    occurredAt,
    sessionId,
    eventType,
    featureId: text(value.feature_id, 160),
    query: text(value.query, 200),
    metadata,
  };
}

export function saveUsageEvent(value) {
  const event = normalizeUsageEvent(value);
  const db = getDatabase();
  db.prepare(`INSERT INTO usage_events
    (occurred_at, session_id, event_type, feature_id, query, metadata)
    VALUES (@occurredAt, @sessionId, @eventType, @featureId, @query, @metadata)`
  ).run(event);

  const now = Date.now();
  if (now - lastCleanup > 24 * 60 * 60 * 1000) {
    const retentionDays = Math.max(1, Number(process.env.USAGE_RETENTION_DAYS) || 365);
    db.prepare("DELETE FROM usage_events WHERE julianday(occurred_at) < julianday('now', ?)").run(`-${retentionDays} days`);
    lastCleanup = now;
  }
}

export function assertIssueReportAllowed(sessionId) {
  const cleanSessionId = text(sessionId, 64);
  if (!cleanSessionId) throw new Error("Invalid report session");
  const limit = Math.max(1, Math.min(20, Number(process.env.REPORT_RATE_LIMIT_PER_HOUR) || 5));
  const count = getDatabase().prepare(`SELECT COUNT(*) AS count FROM issue_report_attempts
    WHERE session_id = ? AND julianday(received_at) >= julianday('now', '-1 hour')`).get(cleanSessionId).count;
  if (count >= limit) throw new Error("Report rate limit exceeded");
  return cleanSessionId;
}

export function recordIssueReportAttempt(sessionId, status) {
  getDatabase().prepare("INSERT INTO issue_report_attempts (session_id, status) VALUES (?, ?)")
    .run(text(sessionId, 64), text(status, 24) || "unknown");
}

export function summarizeUsageDatabase(db, days = 30) {
  const selectedDays = Math.max(1, Math.min(365, Number(days) || 30));
  const since = `-${selectedDays - 1} days`;
  const totals = db.prepare(`SELECT
      COUNT(DISTINCT session_id) AS sessions,
      COUNT(DISTINCT CASE WHEN event_type NOT IN ('session_started', 'session_ended') THEN session_id END) AS engaged_sessions,
      COUNT(*) AS events,
      SUM(event_type = 'search') AS searches,
      SUM(event_type = 'feature_selected') AS feature_selections,
      SUM(event_type = 'route') AS routes,
      SUM(event_type = 'image_opened') AS images_opened,
      SUM(event_type = 'issue_reported') AS issues_reported
    FROM usage_events WHERE julianday(occurred_at) >= julianday('now', ?)`).get(since);
  const sessionStats = db.prepare(`SELECT
      AVG(CASE WHEN json_valid(metadata) THEN json_extract(metadata, '$.duration_seconds') END) AS average_duration_seconds,
      MAX(CASE WHEN json_valid(metadata) THEN json_extract(metadata, '$.duration_seconds') END) AS longest_duration_seconds
    FROM usage_events WHERE event_type = 'session_ended' AND julianday(occurred_at) >= julianday('now', ?)`).get(since);
  const daily = db.prepare(`WITH RECURSIVE dates(day) AS (
      SELECT date('now', ?)
      UNION ALL SELECT date(day, '+1 day') FROM dates WHERE day < date('now')
    ) SELECT dates.day, COUNT(DISTINCT usage_events.session_id) AS sessions, COUNT(usage_events.id) AS events
      FROM dates LEFT JOIN usage_events ON date(usage_events.occurred_at) = dates.day
      GROUP BY dates.day ORDER BY dates.day`).all(since);
  const eventTypes = db.prepare(`SELECT event_type AS label, COUNT(*) AS count FROM usage_events
      WHERE julianday(occurred_at) >= julianday('now', ?) GROUP BY event_type ORDER BY count DESC`).all(since);
  const searches = db.prepare(`SELECT query AS label, COUNT(*) AS count FROM usage_events
      WHERE event_type = 'search' AND query IS NOT NULL AND query != '' AND julianday(occurred_at) >= julianday('now', ?)
      GROUP BY lower(query) ORDER BY count DESC, label LIMIT 10`).all(since);
  const searchStats = db.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN json_valid(metadata) AND json_extract(metadata, '$.result_count') = 0 THEN 1 ELSE 0 END) AS no_results,
      SUM(CASE WHEN json_valid(metadata) AND json_extract(metadata, '$.selected') = 1 THEN 1 ELSE 0 END) AS selected
    FROM usage_events WHERE event_type = 'search' AND julianday(occurred_at) >= julianday('now', ?)`).get(since);
  const noResultSearches = db.prepare(`SELECT query AS label, COUNT(*) AS count FROM usage_events
      WHERE event_type = 'search' AND query IS NOT NULL AND query != ''
        AND json_valid(metadata) AND json_extract(metadata, '$.result_count') = 0
        AND julianday(occurred_at) >= julianday('now', ?)
      GROUP BY lower(query) ORDER BY count DESC, label LIMIT 10`).all(since);
  const features = db.prepare(`SELECT feature_id AS label, COUNT(*) AS count FROM usage_events
      WHERE event_type IN ('feature_selected', 'image_opened') AND feature_id IS NOT NULL AND julianday(occurred_at) >= julianday('now', ?)
      GROUP BY feature_id ORDER BY count DESC, label LIMIT 10`).all(since);
  const routeStats = db.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN json_valid(metadata) THEN json_extract(metadata, '$.found') = 1 ELSE 0 END) AS found,
      AVG(CASE WHEN json_valid(metadata) AND json_extract(metadata, '$.found') = 1 THEN json_extract(metadata, '$.distance_meters') END) AS average_distance_meters
      FROM usage_events WHERE event_type = 'route' AND julianday(occurred_at) >= julianday('now', ?)`).get(since);
  const routeDestinations = db.prepare(`SELECT feature_id AS label, COUNT(*) AS count FROM usage_events
      WHERE event_type = 'route' AND feature_id IS NOT NULL AND julianday(occurred_at) >= julianday('now', ?)
      GROUP BY feature_id ORDER BY count DESC, label LIMIT 10`).all(since);
  return { days: selectedDays, totals, sessionStats, daily, eventTypes, searches, searchStats, noResultSearches, features, routeStats, routeDestinations };
}

export function getUsageAnalytics(days = 30) {
  return summarizeUsageDatabase(getDatabase(), days);
}

export { databasePath };
