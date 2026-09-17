import Database from "better-sqlite3";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const databasePath = path.resolve(process.env.USAGE_DB_PATH || path.join(process.cwd(), ".data", "usage.sqlite3"));
if (!existsSync(databasePath)) {
  console.error(`No usage database found at ${databasePath}`);
  process.exitCode = 1;
} else {
  const db = new Database(databasePath, { readonly: true });
  const rows = db.prepare("SELECT id, occurred_at, received_at, session_id, event_type, feature_id, query, metadata FROM usage_events ORDER BY occurred_at").all();
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const columns = ["id", "occurred_at", "received_at", "session_id", "event_type", "feature_id", "query", "metadata"];
  const csv = `${columns.join(",")}\n${rows.map((row) => columns.map((column) => escape(row[column])).join(",")).join("\n")}\n`;
  const outputPath = process.argv[2];
  if (outputPath) {
    const resolved = path.resolve(outputPath);
    mkdirSync(path.dirname(resolved), { recursive: true });
    writeFileSync(resolved, csv);
    console.error(`Exported ${rows.length} events to ${resolved}`);
  } else {
    process.stdout.write(csv);
  }
  db.close();
}
