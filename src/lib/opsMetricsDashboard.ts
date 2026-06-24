import type { OpsMetricsSnapshot } from "./whatsappAdminApi";

export const OPS_DASHBOARD_MODULES = ["auth", "public_api", "search", "audio", "scheduling", "webhook", "telegram", "webchat"] as const;

export function getOpsCounter(snapshot: OpsMetricsSnapshot | null, name: string, predicate?: (labels: Record<string, string>) => boolean) {
  return (snapshot?.counters ?? [])
    .filter((item) => item.name === name && (!predicate || predicate(item.labels)))
    .reduce((total, item) => total + item.value, 0);
}

export function getOpsGauge(snapshot: OpsMetricsSnapshot | null, name: string, predicate?: (labels: Record<string, string>) => boolean) {
  return (snapshot?.gauges ?? []).find((item) => item.name === name && (!predicate || predicate(item.labels)))?.value ?? null;
}

export function getOpsTiming(snapshot: OpsMetricsSnapshot | null, name: string, predicate?: (labels: Record<string, string>) => boolean) {
  const timings = (snapshot?.timings ?? []).filter((item) => item.name === name && (!predicate || predicate(item.labels)));
  if (timings.length === 0) return null;
  const count = timings.reduce((total, item) => total + item.count, 0);
  const totalMs = timings.reduce((total, item) => total + item.totalMs, 0);
  const p95Ms = Math.max(...timings.map((item) => item.p95Ms ?? 0));
  const maxMs = Math.max(...timings.map((item) => item.maxMs ?? 0));
  return {
    count,
    avgMs: count > 0 ? Math.round(totalMs / count) : 0,
    p95Ms,
    maxMs,
  };
}

export function buildOpsModuleRows(snapshot: OpsMetricsSnapshot | null) {
  return OPS_DASHBOARD_MODULES.map((module) => {
    const requestCount = getOpsCounter(snapshot, "request_count", (labels) => labels.module === module);
    const errors = getOpsCounter(snapshot, "http.errors", (labels) => labels.module === module);
    const timing = getOpsTiming(snapshot, "module_duration", (labels) => labels.module === module);
    return {
      module,
      requestCount,
      errors,
      avgMs: timing?.avgMs ?? null,
      p95Ms: timing?.p95Ms ?? null,
    };
  });
}

export function buildOpsSummary(snapshot: OpsMetricsSnapshot | null) {
  const requestTiming = getOpsTiming(snapshot, "request_duration");
  const dbTiming = getOpsTiming(snapshot, "db_duration");
  const dbStatus = getOpsGauge(snapshot, "health.db.status");
  return {
    dbStatus,
    uptimeSeconds: snapshot?.process?.uptimeSeconds ?? getOpsGauge(snapshot, "process.uptime.seconds"),
    memoryRss: snapshot?.process?.memory?.rss ?? getOpsGauge(snapshot, "process.memory.rss.bytes"),
    cpuUser: snapshot?.process?.cpu?.user ?? getOpsGauge(snapshot, "process.cpu.user.micros"),
    totalRequests: getOpsCounter(snapshot, "request_count"),
    totalErrors: getOpsCounter(snapshot, "http.errors"),
    requestAvgMs: requestTiming?.avgMs ?? null,
    requestP95Ms: requestTiming?.p95Ms ?? null,
    dbP95Ms: dbTiming?.p95Ms ?? null,
  };
}
