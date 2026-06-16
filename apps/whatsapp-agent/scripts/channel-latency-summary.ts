import fs from "node:fs";

type LatencyRow = {
  event?: string;
  [key: string]: unknown;
};

const args = process.argv.slice(2);
const fileArgIndex = args.findIndex((arg) => arg === "--file");
const filePath = fileArgIndex >= 0 ? args[fileArgIndex + 1] : null;

function readInput() {
  if (filePath) return fs.readFileSync(filePath, "utf8");
  return fs.readFileSync(0, "utf8");
}

function parseRows(input: string) {
  const rows: LatencyRow[] = [];
  for (const line of input.split(/\r?\n/)) {
    const start = line.indexOf("{");
    if (start < 0) continue;
    try {
      const parsed = JSON.parse(line.slice(start)) as LatencyRow;
      if (typeof parsed.event === "string" && parsed.event.startsWith("channel_latency.")) {
        rows.push(parsed);
      }
    } catch {
      // Ignore non-JSON PM2 prefix lines.
    }
  }
  return rows;
}

function percentile(values: number[], pct: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[index];
}

function numericKeys(rows: LatencyRow[]) {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (key.endsWith("Ms") && typeof value === "number" && Number.isFinite(value)) {
        keys.add(key);
      }
    }
  }
  return Array.from(keys).sort((left, right) => {
    if (left === "totalMs") return -1;
    if (right === "totalMs") return 1;
    return left.localeCompare(right);
  });
}

function summarize(rows: LatencyRow[]) {
  const byEvent = new Map<string, LatencyRow[]>();
  for (const row of rows) {
    byEvent.set(row.event ?? "unknown", [...(byEvent.get(row.event ?? "unknown") ?? []), row]);
  }
  return Array.from(byEvent.entries()).map(([event, eventRows]) => {
    const metrics: Record<string, { p50: number | null; p95: number | null; max: number | null }> = {};
    for (const key of numericKeys(eventRows)) {
      const values = eventRows
        .map((row) => row[key])
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      metrics[key] = {
        p50: percentile(values, 50),
        p95: percentile(values, 95),
        max: values.length ? Math.max(...values) : null,
      };
    }
    return { event, count: eventRows.length, metrics };
  });
}

const rows = parseRows(readInput());
console.log(JSON.stringify({ ok: true, count: rows.length, summary: summarize(rows) }, null, 2));
