import { Prisma } from "@prisma/client";

type PrismaLike = {
  outboundMessage: {
    findMany(args: {
      where: Record<string, unknown>;
      select: { id: true; messageId: true; rawPayload: true; createdAt: true };
    }): Promise<Array<{ id: string; messageId: string | null; rawPayload: Prisma.JsonValue | null; createdAt: Date }>>;
  };
  tenantOperationalConfig: {
    findUnique(args: {
      where: { clientId: string };
      select: { config: true };
    }): Promise<{ config: Prisma.JsonValue } | null>;
  };
  event: {
    create(args: {
      data: {
        clientId: string;
        messageId?: string;
        requestId: string;
        eventName: string;
        payloadJson: Prisma.InputJsonValue;
      };
    }): Promise<unknown>;
  };
};

export type MetaUsagePolicyMode = "alert_only" | "block_at_limit";
export type MetaUsagePolicySource = "db" | "default";

export type MetaUsagePolicy = {
  enabled: boolean;
  mode: MetaUsagePolicyMode;
  monthlyLimitUsd: number | null;
  monthlyMessageLimit: number | null;
  alertThresholds: number[];
  includeEstimatedSent: boolean;
  includeDeliveredOnly: boolean;
  categories: {
    service: boolean;
    utility: boolean;
    marketing: boolean;
    authentication: boolean;
  };
  effectiveFrom: string | null;
  contractLabel: string | null;
  source: MetaUsagePolicySource;
};

export type MetaUsageSummary = {
  month: string;
  tenantKey: string | null;
  policyMode: MetaUsagePolicyMode;
  policyEnabled: boolean;
  monthlyLimitUsd: number | null;
  monthlyMessageLimit: number | null;
  deliveredBillableCount: number;
  deliveredEstimatedCostUsd: number;
  billableUnknownCostCount: number;
  sentPendingCount: number;
  failedCount: number;
  byCategory: Record<string, MetaUsageSummaryBucket>;
  bySource: Record<string, MetaUsageSummaryBucket>;
  usagePercentUsd: number | null;
  usagePercentMessages: number | null;
  thresholdReached: number | null;
  nextThreshold: number | null;
  limitExceeded: boolean;
  shouldBlock: boolean;
  generatedAt: string;
  policy: MetaUsagePolicy;
};

export type MetaUsageSummaryBucket = {
  deliveredBillableCount: number;
  deliveredEstimatedCostUsd: number;
  billableUnknownCostCount: number;
  sentPendingCount: number;
  failedCount: number;
};

const DEFAULT_THRESHOLDS = [70, 90, 100];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeNonNegativeNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Number(value.toFixed(4));
}

function normalizeThresholds(value: unknown) {
  if (!Array.isArray(value)) return DEFAULT_THRESHOLDS;
  const thresholds = Array.from(
    new Set(
      value
        .map((item) => (typeof item === "number" && Number.isFinite(item) ? Math.floor(item) : null))
        .filter((item): item is number => item !== null && item > 0 && item <= 100)
    )
  ).sort((a, b) => a - b);
  return thresholds.length ? thresholds : DEFAULT_THRESHOLDS;
}

function normalizeCategories(value: unknown): MetaUsagePolicy["categories"] {
  const record = isRecord(value) ? value : {};
  return {
    service: record.service !== false,
    utility: record.utility !== false,
    marketing: record.marketing !== false,
    authentication: record.authentication !== false,
  };
}

function normalizeEffectiveFrom(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function normalizeContractLabel(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 120) : null;
}

export function normalizeMetaUsagePolicy(input: unknown, source: MetaUsagePolicySource = "db"): MetaUsagePolicy {
  const record = isRecord(input) ? input : {};
  const mode = record.mode === "block_at_limit" ? "block_at_limit" : "alert_only";
  return {
    enabled: record.enabled === true,
    mode,
    monthlyLimitUsd: normalizeNonNegativeNumber(record.monthlyLimitUsd),
    monthlyMessageLimit: normalizeNonNegativeNumber(record.monthlyMessageLimit),
    alertThresholds: normalizeThresholds(record.alertThresholds),
    includeEstimatedSent: record.includeEstimatedSent === true,
    includeDeliveredOnly: record.includeDeliveredOnly !== false,
    categories: normalizeCategories(record.categories),
    effectiveFrom: normalizeEffectiveFrom(record.effectiveFrom),
    contractLabel: normalizeContractLabel(record.contractLabel),
    source,
  };
}

export function defaultMetaUsagePolicy(): MetaUsagePolicy {
  return normalizeMetaUsagePolicy({}, "default");
}

export function parseMetaUsageMonth(input: string | null | undefined, now = new Date()) {
  const value = String(input ?? "").trim();
  if (value) {
    if (!/^\d{4}-\d{2}$/.test(value)) return null;
    const monthNumber = Number(value.slice(5, 7));
    if (monthNumber < 1 || monthNumber > 12) return null;
    return value;
  }
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthRange(month: string) {
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  return {
    gte: new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0)),
    lt: new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0)),
  };
}

function emptyBucket(): MetaUsageSummaryBucket {
  return {
    deliveredBillableCount: 0,
    deliveredEstimatedCostUsd: 0,
    billableUnknownCostCount: 0,
    sentPendingCount: 0,
    failedCount: 0,
  };
}

function getBucket(target: Record<string, MetaUsageSummaryBucket>, key: string) {
  const normalizedKey = key || "unknown";
  target[normalizedKey] ??= emptyBucket();
  return target[normalizedKey];
}

function addCost(value: number, increment: number) {
  return Number((value + increment).toFixed(4));
}

function extractMetaUsage(rawPayload: Prisma.JsonValue | null) {
  if (!isRecord(rawPayload)) return null;
  const value = rawPayload.metaUsage;
  if (!isRecord(value)) return null;
  return value;
}

function isCategoryEnabled(policy: MetaUsagePolicy, category: string) {
  if (category === "service") return policy.categories.service;
  if (category === "utility") return policy.categories.utility;
  if (category === "marketing") return policy.categories.marketing;
  if (category === "authentication") return policy.categories.authentication;
  return true;
}

function percent(value: number, limit: number | null) {
  if (limit === null || limit <= 0) return null;
  return Number(((value / limit) * 100).toFixed(2));
}

function resolveThreshold(params: {
  thresholds: number[];
  usagePercentUsd: number | null;
  usagePercentMessages: number | null;
}) {
  const current = Math.max(params.usagePercentUsd ?? 0, params.usagePercentMessages ?? 0);
  const reached = params.thresholds.filter((threshold) => current >= threshold);
  const next = params.thresholds.find((threshold) => current < threshold) ?? null;
  return {
    thresholdReached: reached.length ? reached[reached.length - 1] : null,
    nextThreshold: next,
    crossedThresholds: reached,
  };
}

export async function resolveTenantMetaUsagePolicy(params: {
  prisma: PrismaLike;
  clientId: string;
}) {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  if (!isRecord(record?.config) || !Object.prototype.hasOwnProperty.call(record.config, "metaUsagePolicy")) {
    return defaultMetaUsagePolicy();
  }
  return normalizeMetaUsagePolicy(record.config.metaUsagePolicy, "db");
}

export function shouldBlockByMetaUsage(policy: MetaUsagePolicy, summary: Pick<MetaUsageSummary, "limitExceeded">) {
  return policy.enabled === true && policy.mode === "block_at_limit" && summary.limitExceeded === true;
}

export async function getTenantMetaUsageSummary(params: {
  prisma: PrismaLike;
  clientId: string;
  tenantKey?: string | null;
  month: string;
  now?: Date;
  policy?: MetaUsagePolicy;
}) {
  const policy = params.policy ?? (await resolveTenantMetaUsagePolicy(params));
  const range = monthRange(params.month);
  const messages = await params.prisma.outboundMessage.findMany({
    where: {
      clientId: params.clientId,
      createdAt: { gte: range.gte, lt: range.lt },
    },
    select: { id: true, messageId: true, rawPayload: true, createdAt: true },
  });

  const byCategory: Record<string, MetaUsageSummaryBucket> = {};
  const bySource: Record<string, MetaUsageSummaryBucket> = {};
  let deliveredBillableCount = 0;
  let deliveredEstimatedCostUsd = 0;
  let billableUnknownCostCount = 0;
  let sentPendingCount = 0;
  let failedCount = 0;

  for (const message of messages) {
    const usage = extractMetaUsage(message.rawPayload);
    if (!usage || usage.direction === "inbound") continue;
    const category = typeof usage.metaCategory === "string" ? usage.metaCategory : "unknown";
    if (!isCategoryEnabled(policy, category)) continue;
    const source = typeof usage.source === "string" ? usage.source : "unknown";
    const status = typeof usage.deliveryStatus === "string" ? usage.deliveryStatus : "unknown";
    const estimatedBillable = usage.estimatedBillable === true;
    const cost = typeof usage.estimatedMetaCostUsd === "number" && Number.isFinite(usage.estimatedMetaCostUsd)
      ? usage.estimatedMetaCostUsd
      : null;
    const categoryBucket = getBucket(byCategory, category);
    const sourceBucket = getBucket(bySource, source);
    const buckets = [categoryBucket, sourceBucket];

    if (status === "failed") {
      failedCount += 1;
      for (const bucket of buckets) bucket.failedCount += 1;
      continue;
    }

    if (status === "delivered" || status === "read" || (!policy.includeDeliveredOnly && status === "sent")) {
      if (!estimatedBillable) continue;
      deliveredBillableCount += 1;
      for (const bucket of buckets) bucket.deliveredBillableCount += 1;
      if (cost === null) {
        billableUnknownCostCount += 1;
        for (const bucket of buckets) bucket.billableUnknownCostCount += 1;
      } else {
        deliveredEstimatedCostUsd = addCost(deliveredEstimatedCostUsd, cost);
        for (const bucket of buckets) {
          bucket.deliveredEstimatedCostUsd = addCost(bucket.deliveredEstimatedCostUsd, cost);
        }
      }
      continue;
    }

    if (status === "sent" || status === "queued" || status === "unknown") {
      sentPendingCount += 1;
      for (const bucket of buckets) bucket.sentPendingCount += 1;
    }
  }

  const usagePercentUsd = percent(deliveredEstimatedCostUsd, policy.monthlyLimitUsd);
  const usagePercentMessages = percent(deliveredBillableCount, policy.monthlyMessageLimit);
  const threshold = resolveThreshold({
    thresholds: policy.alertThresholds,
    usagePercentUsd,
    usagePercentMessages,
  });
  const limitExceeded = (usagePercentUsd ?? 0) >= 100 || (usagePercentMessages ?? 0) >= 100;
  const summaryBase = {
    month: params.month,
    tenantKey: params.tenantKey ?? null,
    policyMode: policy.mode,
    policyEnabled: policy.enabled,
    monthlyLimitUsd: policy.monthlyLimitUsd,
    monthlyMessageLimit: policy.monthlyMessageLimit,
    deliveredBillableCount,
    deliveredEstimatedCostUsd,
    billableUnknownCostCount,
    sentPendingCount,
    failedCount,
    byCategory,
    bySource,
    usagePercentUsd,
    usagePercentMessages,
    thresholdReached: threshold.thresholdReached,
    nextThreshold: threshold.nextThreshold,
    limitExceeded,
    generatedAt: (params.now ?? new Date()).toISOString(),
    policy,
  };
  const shouldBlock = shouldBlockByMetaUsage(policy, summaryBase);
  return {
    ...summaryBase,
    shouldBlock,
  } satisfies MetaUsageSummary;
}

function resolveLimitType(summary: MetaUsageSummary) {
  const usd = summary.usagePercentUsd ?? 0;
  const messages = summary.usagePercentMessages ?? 0;
  if (usd >= messages && summary.monthlyLimitUsd !== null) return "usd";
  if (summary.monthlyMessageLimit !== null) return "messages";
  return "unknown";
}

export async function evaluateMetaUsageThresholdAlerts(params: {
  prisma: PrismaLike;
  clientId: string;
  summary: MetaUsageSummary;
}) {
  const summary = params.summary;
  if (!summary.policy.enabled) return { created: 0, skipped: true };
  if (summary.monthlyLimitUsd === null && summary.monthlyMessageLimit === null) {
    return { created: 0, skipped: true };
  }
  const current = Math.max(summary.usagePercentUsd ?? 0, summary.usagePercentMessages ?? 0);
  const crossed = summary.policy.alertThresholds.filter((threshold) => current >= threshold);
  let created = 0;
  for (const threshold of crossed) {
    const eventName = threshold >= 100 ? "meta.usage.limit_exceeded" : "meta.usage.threshold_reached";
    try {
      await params.prisma.event.create({
        data: {
          clientId: params.clientId,
          messageId: `${summary.month}:${threshold}`,
          requestId: `meta-usage-threshold:${params.clientId}:${summary.month}:${threshold}`,
          eventName,
          payloadJson: {
            action: eventName,
            month: summary.month,
            threshold,
            usagePercent: Number(current.toFixed(2)),
            usagePercentUsd: summary.usagePercentUsd,
            usagePercentMessages: summary.usagePercentMessages,
            deliveredBillableCount: summary.deliveredBillableCount,
            deliveredEstimatedCostUsd: summary.deliveredEstimatedCostUsd,
            billableUnknownCostCount: summary.billableUnknownCostCount,
            limitType: resolveLimitType(summary),
            policyMode: summary.policyMode,
            limitExceeded: summary.limitExceeded,
          } as Prisma.InputJsonValue,
        },
      });
      created += 1;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        continue;
      }
      throw error;
    }
  }
  return { created, skipped: false };
}
