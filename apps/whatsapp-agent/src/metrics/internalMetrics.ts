type MetricLabels = Record<string, string | number | boolean | null | undefined>;

type CounterRecord = {
  name: string;
  labels: Record<string, string>;
  value: number;
};

type GaugeRecord = {
  name: string;
  labels: Record<string, string>;
  value: number;
};

type TimingRecord = {
  name: string;
  labels: Record<string, string>;
  count: number;
  totalMs: number;
  avgMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  lastMs: number;
};

const counters = new Map<string, CounterRecord>();
const gauges = new Map<string, GaugeRecord>();
const timings = new Map<string, Omit<TimingRecord, "avgMs" | "p95Ms"> & { samples: number[] }>();
const MAX_TIMING_SAMPLES = 256;

const ALLOWED_LABELS = new Set([
  "channel",
  "dependency",
  "event",
  "feature",
  "method",
  "module",
  "operation",
  "provider",
  "route",
  "source",
  "status",
  "statusCode",
  "tenantId",
  "type",
]);

function normalizeLabelValue(value: string | number | boolean | null | undefined) {
  if (value == null) return "unknown";
  const text = String(value).trim();
  if (!text) return "unknown";
  if (text.includes("@")) return "[redacted]";
  if (/bearer|token|secret|cookie|authorization|ciphertext|password|otp|totp/i.test(text)) {
    return "[redacted]";
  }
  if (/^\+?\d{8,}$/.test(text.replace(/[\s().-]/g, ""))) return "[masked]";
  return text.slice(0, 96);
}

export function sanitizeMetricLabels(labels: MetricLabels = {}) {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(labels)) {
    if (!ALLOWED_LABELS.has(key)) continue;
    sanitized[key] = normalizeLabelValue(value);
  }
  return Object.fromEntries(Object.entries(sanitized).sort(([a], [b]) => a.localeCompare(b)));
}

function metricKey(name: string, labels: Record<string, string>) {
  return `${name}:${JSON.stringify(labels)}`;
}

export const metrics = {
  counter(name: string, labels?: MetricLabels, increment = 1) {
    const safeLabels = sanitizeMetricLabels(labels);
    const key = metricKey(name, safeLabels);
    const existing = counters.get(key);
    if (existing) {
      existing.value += increment;
      return;
    }
    counters.set(key, { name, labels: safeLabels, value: increment });
  },

  gauge(name: string, value: number, labels?: MetricLabels) {
    const safeLabels = sanitizeMetricLabels(labels);
    gauges.set(metricKey(name, safeLabels), { name, labels: safeLabels, value });
  },

  timing(name: string, durationMs: number, labels?: MetricLabels) {
    const safeLabels = sanitizeMetricLabels(labels);
    const key = metricKey(name, safeLabels);
    const safeDuration = Math.max(0, Math.round(durationMs));
    const existing = timings.get(key);
    if (existing) {
      existing.count += 1;
      existing.totalMs += safeDuration;
      existing.minMs = Math.min(existing.minMs, safeDuration);
      existing.maxMs = Math.max(existing.maxMs, safeDuration);
      existing.lastMs = safeDuration;
      existing.samples.push(safeDuration);
      if (existing.samples.length > MAX_TIMING_SAMPLES) existing.samples.shift();
      return;
    }
    timings.set(key, {
      name,
      labels: safeLabels,
      count: 1,
      totalMs: safeDuration,
      minMs: safeDuration,
      maxMs: safeDuration,
      lastMs: safeDuration,
      samples: [safeDuration],
    });
  },
};

export function getMetricsSnapshot() {
  collectProcessMetrics();
  const generatedAt = new Date().toISOString();
  const timingRecords = Array.from(timings.values())
    .map((item): TimingRecord => {
      const { samples, ...record } = item;
      return {
        ...record,
        avgMs: record.count > 0 ? Math.round(record.totalMs / record.count) : 0,
        p95Ms: approximateP95(samples),
      };
    })
    .sort(compareMetricRecords);
  return {
    ok: true,
    generatedAt,
    process: {
      uptimeSeconds: Math.round(process.uptime()),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    },
    counters: Array.from(counters.values()).sort(compareMetricRecords),
    gauges: Array.from(gauges.values()).sort(compareMetricRecords),
    timings: timingRecords,
    averages: timingRecords.map((item) => ({
      name: item.name,
      labels: item.labels,
      count: item.count,
      avgMs: item.avgMs,
      p95Ms: item.p95Ms,
      minMs: item.minMs,
      maxMs: item.maxMs,
    })),
  };
}

export function resetMetricsForTest() {
  counters.clear();
  gauges.clear();
  timings.clear();
}

function compareMetricRecords(a: { name: string; labels: Record<string, string> }, b: { name: string; labels: Record<string, string> }) {
  const byName = a.name.localeCompare(b.name);
  if (byName !== 0) return byName;
  return JSON.stringify(a.labels).localeCompare(JSON.stringify(b.labels));
}

function approximateP95(samples: number[]) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? 0;
}

function collectProcessMetrics() {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  const labels = { module: "process" };
  metrics.gauge("process.uptime.seconds", Math.round(process.uptime()), labels);
  metrics.gauge("process.memory.rss.bytes", memory.rss, labels);
  metrics.gauge("process.memory.heap_used.bytes", memory.heapUsed, labels);
  metrics.gauge("process.memory.heap_total.bytes", memory.heapTotal, labels);
  metrics.gauge("process.cpu.user.micros", cpu.user, labels);
  metrics.gauge("process.cpu.system.micros", cpu.system, labels);
}

export function normalizeMetricRoute(pathname: string) {
  return pathname
    .split("/")
    .map((segment) => {
      if (!segment) return segment;
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ":id";
      if (/^[a-z0-9]{18,}$/i.test(segment)) return ":id";
      if (/^\d{8,}$/.test(segment)) return ":id";
      return segment;
    })
    .join("/");
}

export function classifyMetricModule(pathname: string) {
  if (pathname.startsWith("/public-api/")) return "public_api";
  if (pathname.startsWith("/webhook")) return "webhook";
  if (pathname.startsWith("/webhooks") || pathname.includes("/webhooks")) return "webhook";
  if (pathname.includes("/search")) return "search";
  if (pathname.includes("/audio-transcriptions")) return "audio";
  if (pathname.includes("/mfa") || pathname.startsWith("/auth/mfa")) return "mfa";
  if (pathname.startsWith("/auth/")) return "auth";
  if (pathname.includes("/scheduling")) return "scheduling";
  if (pathname.includes("/telegram")) return "telegram";
  if (pathname.includes("/webchat")) return "webchat";
  if (pathname.includes("/campaign")) return "campaign";
  if (pathname === "/health") return "health";
  if (pathname.startsWith("/admin/")) return "admin";
  if (pathname.startsWith("/app/")) return "app";
  return "http";
}
