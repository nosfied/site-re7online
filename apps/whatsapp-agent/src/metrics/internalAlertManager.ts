import crypto from "node:crypto";
import { logger } from "../logger/logger.js";
import { getMetricsSnapshot } from "./internalMetrics.js";

type MetricsSnapshot = ReturnType<typeof getMetricsSnapshot>;

export type AlertSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";
export type AlertStatus = "active" | "resolved";

export type InternalAlert = {
  id: string;
  fingerprint: string;
  severity: AlertSeverity;
  source: string;
  status: AlertStatus;
  message: string;
  firstSeen: string;
  lastSeen: string;
  occurrences: number;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  metadata: Record<string, string | number | boolean | null>;
};

type AlertCandidate = {
  fingerprint: string;
  severity: AlertSeverity;
  source: string;
  message: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export const DEFAULT_ALERT_THRESHOLDS = {
  dbOfflineGaugeValue: 0,
  errorCount: readNumberEnv("ALERT_ERROR_COUNT_THRESHOLD", 10),
  requestP95Ms: readNumberEnv("ALERT_REQUEST_P95_MS_THRESHOLD", 3000),
  memoryRssBytes: readNumberEnv("ALERT_MEMORY_RSS_BYTES_THRESHOLD", 512 * 1024 * 1024),
};

const alerts = new Map<string, InternalAlert>();
const fingerprintToId = new Map<string, string>();

export function evaluateInternalAlerts(snapshot: MetricsSnapshot = getMetricsSnapshot()) {
  const candidates = buildAlertCandidates(snapshot);
  const seen = new Set(candidates.map((candidate) => candidate.fingerprint));
  const now = new Date().toISOString();

  for (const candidate of candidates) {
    upsertAlert(candidate, now);
  }

  for (const alert of alerts.values()) {
    if (alert.status === "active" && !seen.has(alert.fingerprint)) {
      alert.status = "resolved";
      alert.resolved = true;
      alert.resolvedAt = now;
      alert.lastSeen = now;
      logger.info({
        event: "alert.resolved",
        module: "ops",
        alertId: alert.id,
        severity: alert.severity,
        source: alert.source,
        fingerprint: alert.fingerprint,
      });
    }
  }

  return getInternalAlertSnapshot();
}

export function getInternalAlertSnapshot() {
  const items = Array.from(alerts.values()).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    active: items.filter((alert) => alert.status === "active"),
    resolved: items.filter((alert) => alert.status === "resolved"),
    acknowledged: items.filter((alert) => alert.acknowledged),
    counts: {
      active: items.filter((alert) => alert.status === "active").length,
      resolved: items.filter((alert) => alert.status === "resolved").length,
      acknowledged: items.filter((alert) => alert.acknowledged).length,
      total: items.length,
    },
  };
}

export function acknowledgeInternalAlert(id: string) {
  const alert = alerts.get(id);
  if (!alert) return null;
  if (!alert.acknowledged) {
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();
    logger.info({
      event: "alert.acknowledged",
      module: "ops",
      alertId: alert.id,
      severity: alert.severity,
      source: alert.source,
      fingerprint: alert.fingerprint,
    });
  }
  return alert;
}

export function resetInternalAlertsForTest() {
  alerts.clear();
  fingerprintToId.clear();
}

function upsertAlert(candidate: AlertCandidate, now: string) {
  const existingId = fingerprintToId.get(candidate.fingerprint);
  if (existingId) {
    const existing = alerts.get(existingId);
    if (existing) {
      existing.severity = candidate.severity;
      existing.source = candidate.source;
      existing.message = candidate.message;
      existing.metadata = candidate.metadata ?? {};
      existing.lastSeen = now;
      existing.occurrences += 1;
      if (existing.status === "resolved") {
        existing.status = "active";
        existing.resolved = false;
        existing.resolvedAt = null;
        existing.acknowledged = false;
        existing.acknowledgedAt = null;
      }
      return existing;
    }
  }

  const alert: InternalAlert = {
    id: crypto.randomUUID(),
    fingerprint: candidate.fingerprint,
    severity: candidate.severity,
    source: candidate.source,
    status: "active",
    message: candidate.message,
    firstSeen: now,
    lastSeen: now,
    occurrences: 1,
    acknowledged: false,
    acknowledgedAt: null,
    resolved: false,
    resolvedAt: null,
    metadata: candidate.metadata ?? {},
  };
  alerts.set(alert.id, alert);
  fingerprintToId.set(alert.fingerprint, alert.id);
  logger.warn({
    event: "alert.created",
    module: "ops",
    alertId: alert.id,
    severity: alert.severity,
    source: alert.source,
    fingerprint: alert.fingerprint,
    metadata: alert.metadata,
  });
  return alert;
}

function buildAlertCandidates(snapshot: MetricsSnapshot): AlertCandidate[] {
  const candidates: AlertCandidate[] = [];
  const dbOffline = snapshot.gauges.some(
    (gauge) => gauge.name === "health.db.status" && gauge.value <= DEFAULT_ALERT_THRESHOLDS.dbOfflineGaugeValue
  );
  if (!snapshot.ok || dbOffline) {
    candidates.push({
      fingerprint: "health:nok",
      severity: "CRITICAL",
      source: "health",
      message: "Health check is not OK.",
      metadata: { dbOffline },
    });
  }
  if (dbOffline) {
    candidates.push({
      fingerprint: "db:offline",
      severity: "CRITICAL",
      source: "db",
      message: "Database health gauge reports offline.",
      metadata: { gauge: "health.db.status" },
    });
  }

  const errorCount = sumCounters(snapshot, "http.errors");
  if (errorCount >= DEFAULT_ALERT_THRESHOLDS.errorCount) {
    candidates.push({
      fingerprint: "runtime:error_rate",
      severity: "ERROR",
      source: "runtime",
      message: "HTTP error count is above the internal threshold.",
      metadata: { errorCount, threshold: DEFAULT_ALERT_THRESHOLDS.errorCount },
    });
  }

  const requestP95Ms = maxTimingP95(snapshot, ["request_duration", "http.request.duration", "route_duration"]);
  if (requestP95Ms >= DEFAULT_ALERT_THRESHOLDS.requestP95Ms) {
    candidates.push({
      fingerprint: "runtime:latency_p95",
      severity: "WARNING",
      source: "runtime",
      message: "Request p95 latency is above the internal threshold.",
      metadata: { requestP95Ms, threshold: DEFAULT_ALERT_THRESHOLDS.requestP95Ms },
    });
  }

  const memoryRss = getGaugeValue(snapshot, "process.memory.rss.bytes");
  if (memoryRss != null && memoryRss >= DEFAULT_ALERT_THRESHOLDS.memoryRssBytes) {
    candidates.push({
      fingerprint: "process:memory_rss",
      severity: "WARNING",
      source: "process",
      message: "Process RSS memory is above the internal threshold.",
      metadata: { memoryRss, threshold: DEFAULT_ALERT_THRESHOLDS.memoryRssBytes },
    });
  }

  return candidates;
}

function sumCounters(snapshot: MetricsSnapshot, name: string) {
  return snapshot.counters.filter((counter) => counter.name === name).reduce((sum, counter) => sum + counter.value, 0);
}

function maxTimingP95(snapshot: MetricsSnapshot, names: string[]) {
  const allowed = new Set(names);
  return snapshot.timings
    .filter((timing) => allowed.has(timing.name))
    .reduce((max, timing) => Math.max(max, timing.p95Ms), 0);
}

function getGaugeValue(snapshot: MetricsSnapshot, name: string) {
  const values = snapshot.gauges.filter((gauge) => gauge.name === name).map((gauge) => gauge.value);
  if (values.length === 0) return null;
  return Math.max(...values);
}

function readNumberEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
