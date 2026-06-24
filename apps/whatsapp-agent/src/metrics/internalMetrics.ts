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
  minMs: number;
  maxMs: number;
  lastMs: number;
};

const counters = new Map<string, CounterRecord>();
const gauges = new Map<string, GaugeRecord>();
const timings = new Map<string, Omit<TimingRecord, "avgMs">>();

const ALLOWED_LABELS = new Set([
  "channel",
  "event",
  "feature",
  "method",
  "module",
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
    });
  },
};

export function getMetricsSnapshot() {
  const generatedAt = new Date().toISOString();
  return {
    ok: true,
    generatedAt,
    counters: Array.from(counters.values()).sort(compareMetricRecords),
    gauges: Array.from(gauges.values()).sort(compareMetricRecords),
    timings: Array.from(timings.values())
      .map((item): TimingRecord => ({
        ...item,
        avgMs: item.count > 0 ? Math.round(item.totalMs / item.count) : 0,
      }))
      .sort(compareMetricRecords),
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
  if (pathname.includes("/mfa") || pathname.startsWith("/auth/")) return "mfa";
  if (pathname.includes("/scheduling")) return "scheduling";
  if (pathname.includes("/telegram")) return "telegram";
  if (pathname.includes("/webchat")) return "webchat";
  if (pathname.includes("/campaign")) return "campaign";
  if (pathname === "/health") return "health";
  if (pathname.startsWith("/admin/")) return "admin";
  if (pathname.startsWith("/app/")) return "app";
  return "http";
}
