import { Prisma } from "@prisma/client";
import type {
  MetaUsageBillingRule,
  MetaUsageCategory,
  MetaUsageDeliveryStatus,
  MetaUsageMessageKind,
  MetaUsageSource,
} from "./metaUsageLedger.js";
import {
  getTenantMetaUsageSummary,
  parseMetaUsageMonth,
  resolveTenantMetaUsagePolicy,
  type MetaUsagePolicy,
  type MetaUsageSummary,
} from "./metaUsageSummary.js";

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

export type MetaUsageReportBucket = {
  deliveredBillableCount: number;
  deliveredEstimatedCostUsd: number;
  billableUnknownCostCount: number;
  sentPendingCount: number;
  failedCount: number;
  nonBillableCount: number;
  totalOutboundWithUsage: number;
};

export type MetaUsageReportCsvRow = {
  month: string;
  groupType: "category" | "source" | "status";
  groupKey: string;
  source: string;
  metaCategory: string;
  deliveryStatus: string;
  messageKind: string;
  deliveredBillableCount: number;
  deliveredEstimatedCostUsd: number;
  billableUnknownCostCount: number;
  sentPendingCount: number;
  failedCount: number;
  nonBillableCount: number;
  rateCardVersion: string;
  billingRule: string;
  notes: string;
};

export type MonthlyMetaUsageReport = {
  ok: true;
  reportType: "meta_usage_monthly";
  tenantKey: string | null;
  tenantName: string | null;
  month: string;
  generatedAt: string;
  currency: "USD";
  rateCardVersion: string;
  isEstimate: true;
  disclaimer: string;
  summary: {
    totalOutboundWithUsage: number;
    deliveredBillableCount: number;
    deliveredEstimatedCostUsd: number;
    billableUnknownCostCount: number;
    sentPendingCount: number;
    failedCount: number;
    nonBillableCount: number;
    unknownCategoryCount: number;
    currentPolicyMode: MetaUsagePolicy["mode"];
    policyEnabled: boolean;
    monthlyLimitUsd: number | null;
    monthlyMessageLimit: number | null;
    usagePercentUsd: number | null;
    usagePercentMessages: number | null;
    thresholdReached: number | null;
    limitExceeded: boolean;
  };
  byCategory: Record<string, MetaUsageReportBucket>;
  bySource: Record<string, MetaUsageReportBucket>;
  byStatus: Record<string, MetaUsageReportBucket>;
  policy: Pick<
    MetaUsagePolicy,
    | "enabled"
    | "mode"
    | "monthlyLimitUsd"
    | "monthlyMessageLimit"
    | "alertThresholds"
    | "includeEstimatedSent"
    | "includeDeliveredOnly"
    | "source"
  >;
  csvRows: MetaUsageReportCsvRow[];
  notes: string[];
};

export const META_USAGE_MONTHLY_REPORT_DISCLAIMER =
  "Relatorio estimativo. A cobranca final depende da entrega, categoria, pais e politica vigente da Meta.";

const DEFAULT_RATE_CARD_VERSION = "unknown";
const KNOWN_CATEGORIES: MetaUsageCategory[] = ["service", "utility", "marketing", "authentication", "unknown"];
const KNOWN_SOURCES: MetaUsageSource[] = [
  "inbox_text",
  "inbox_template",
  "canned_reply",
  "campaign",
  "manual_campaign_send",
  "bot",
  "unknown",
];
const KNOWN_STATUSES = ["delivered_read", "sent_pending", "failed", "non_billable", "unknown"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function emptyBucket(): MetaUsageReportBucket {
  return {
    deliveredBillableCount: 0,
    deliveredEstimatedCostUsd: 0,
    billableUnknownCostCount: 0,
    sentPendingCount: 0,
    failedCount: 0,
    nonBillableCount: 0,
    totalOutboundWithUsage: 0,
  };
}

function getBucket(target: Record<string, MetaUsageReportBucket>, key: string) {
  const normalizedKey = key || "unknown";
  target[normalizedKey] ??= emptyBucket();
  return target[normalizedKey];
}

function addCost(value: number, increment: number) {
  return Number((value + increment).toFixed(4));
}

function normalizeCategory(value: unknown): MetaUsageCategory {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "service":
      return "service";
    case "utility":
      return "utility";
    case "marketing":
      return "marketing";
    case "authentication":
      return "authentication";
    default:
      return "unknown";
  }
}

function normalizeSource(value: unknown): MetaUsageSource {
  switch (String(value ?? "").trim()) {
    case "inbox_text":
    case "inbox_template":
    case "canned_reply":
    case "campaign":
    case "manual_campaign_send":
    case "bot":
      return value as MetaUsageSource;
    default:
      return "unknown";
  }
}

function normalizeKind(value: unknown): MetaUsageMessageKind {
  switch (String(value ?? "").trim()) {
    case "free_text":
    case "template":
    case "canned_reply":
    case "media":
      return value as MetaUsageMessageKind;
    default:
      return "unknown";
  }
}

function normalizeDeliveryStatus(value: unknown): MetaUsageDeliveryStatus {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "queued":
      return "queued";
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "failed":
    case "failed_before_delivery":
      return "failed";
    default:
      return "unknown";
  }
}

function normalizeBillingRule(value: unknown): MetaUsageBillingRule | "unknown" {
  const text = String(value ?? "").trim();
  switch (text) {
    case "current_service_free":
    case "post_2026_10_service_billable":
    case "utility_billable":
    case "marketing_billable":
    case "authentication_billable":
    case "free_entry_point":
    case "non_billable_inbound":
    case "unknown":
      return text;
    default:
      return "unknown";
  }
}

function extractMetaUsage(rawPayload: Prisma.JsonValue | null) {
  if (!isRecord(rawPayload)) return null;
  const value = rawPayload.metaUsage;
  return isRecord(value) ? value : null;
}

function isCategoryEnabled(policy: MetaUsagePolicy, category: MetaUsageCategory) {
  if (category === "service") return policy.categories.service;
  if (category === "utility") return policy.categories.utility;
  if (category === "marketing") return policy.categories.marketing;
  if (category === "authentication") return policy.categories.authentication;
  return true;
}

function statusGroup(status: MetaUsageDeliveryStatus, estimatedBillable: boolean | "unknown") {
  if (status === "failed") return "failed";
  if (status === "delivered" || status === "read") {
    if (estimatedBillable === true) return "delivered_read";
    if (estimatedBillable === false) return "non_billable";
    return "unknown";
  }
  if (status === "sent" || status === "queued" || status === "unknown") return "sent_pending";
  return "unknown";
}

function addUsageToBucket(params: {
  bucket: MetaUsageReportBucket;
  status: MetaUsageDeliveryStatus;
  estimatedBillable: boolean | "unknown";
  cost: number | null;
}) {
  params.bucket.totalOutboundWithUsage += 1;
  if (params.status === "failed") {
    params.bucket.failedCount += 1;
    return;
  }
  if (params.status === "sent" || params.status === "queued" || params.status === "unknown") {
    params.bucket.sentPendingCount += 1;
    return;
  }
  if (params.status === "delivered" || params.status === "read") {
    if (params.estimatedBillable === false) {
      params.bucket.nonBillableCount += 1;
      return;
    }
    if (params.estimatedBillable !== true) return;
    params.bucket.deliveredBillableCount += 1;
    if (params.cost === null) {
      params.bucket.billableUnknownCostCount += 1;
    } else {
      params.bucket.deliveredEstimatedCostUsd = addCost(params.bucket.deliveredEstimatedCostUsd, params.cost);
    }
  }
}

function makeCsvRows(params: {
  month: string;
  byCategory: Record<string, MetaUsageReportBucket>;
  bySource: Record<string, MetaUsageReportBucket>;
  byStatus: Record<string, MetaUsageReportBucket>;
  rateCardVersion: string;
  billingRuleByCategory: Record<string, string>;
}) {
  const rows: MetaUsageReportCsvRow[] = [];
  for (const category of Object.keys(params.byCategory).sort()) {
    const bucket = params.byCategory[category];
    rows.push({
      month: params.month,
      groupType: "category",
      groupKey: category,
      source: "",
      metaCategory: category,
      deliveryStatus: "",
      messageKind: "",
      ...bucket,
      rateCardVersion: params.rateCardVersion,
      billingRule: params.billingRuleByCategory[category] ?? "unknown",
      notes: category === "unknown" ? "Valor a confirmar" : "",
    });
  }
  for (const source of Object.keys(params.bySource).sort()) {
    rows.push({
      month: params.month,
      groupType: "source",
      groupKey: source,
      source,
      metaCategory: "",
      deliveryStatus: "",
      messageKind: "",
      ...params.bySource[source],
      rateCardVersion: params.rateCardVersion,
      billingRule: "",
      notes: "",
    });
  }
  for (const status of Object.keys(params.byStatus).sort()) {
    rows.push({
      month: params.month,
      groupType: "status",
      groupKey: status,
      source: "",
      metaCategory: "",
      deliveryStatus: status,
      messageKind: "",
      ...params.byStatus[status],
      rateCardVersion: params.rateCardVersion,
      billingRule: "",
      notes: status === "sent_pending" ? "Pendente de entrega/falha" : "",
    });
  }
  return rows;
}

function sanitizeTenantText(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed.slice(0, 120) : null;
}

export async function buildMonthlyMetaUsageReport(params: {
  prisma: PrismaLike;
  clientId: string;
  tenantKey?: string | null;
  tenantName?: string | null;
  month: string;
  now?: Date;
  policy?: MetaUsagePolicy;
  summary?: MetaUsageSummary;
}): Promise<MonthlyMetaUsageReport> {
  const policy = params.policy ?? (await resolveTenantMetaUsagePolicy({ prisma: params.prisma, clientId: params.clientId }));
  const summary =
    params.summary ??
    (await getTenantMetaUsageSummary({
      prisma: params.prisma,
      clientId: params.clientId,
      tenantKey: params.tenantKey,
      month: params.month,
      now: params.now,
      policy,
    }));
  const range = monthRange(params.month);
  const messages = await params.prisma.outboundMessage.findMany({
    where: {
      clientId: params.clientId,
      createdAt: { gte: range.gte, lt: range.lt },
    },
    select: { id: true, messageId: true, rawPayload: true, createdAt: true },
  });

  const byCategory: Record<string, MetaUsageReportBucket> = {};
  const bySource: Record<string, MetaUsageReportBucket> = {};
  const byStatus: Record<string, MetaUsageReportBucket> = {};
  const billingRuleByCategory: Record<string, string> = {};
  let totalOutboundWithUsage = 0;
  let nonBillableCount = 0;
  let unknownCategoryCount = 0;
  let rateCardVersion = DEFAULT_RATE_CARD_VERSION;

  for (const category of KNOWN_CATEGORIES) getBucket(byCategory, category);
  for (const source of KNOWN_SOURCES) getBucket(bySource, source);
  for (const status of KNOWN_STATUSES) getBucket(byStatus, status);

  for (const message of messages) {
    const usage = extractMetaUsage(message.rawPayload);
    if (!usage || usage.direction === "inbound") continue;
    const category = normalizeCategory(usage.metaCategory);
    if (!isCategoryEnabled(policy, category)) continue;
    const source = normalizeSource(usage.source);
    const status = normalizeDeliveryStatus(usage.deliveryStatus);
    const kind = normalizeKind(usage.messageKind);
    const estimatedBillable =
      usage.estimatedBillable === true ? true : usage.estimatedBillable === false ? false : "unknown";
    const cost =
      typeof usage.estimatedMetaCostUsd === "number" && Number.isFinite(usage.estimatedMetaCostUsd)
        ? usage.estimatedMetaCostUsd
        : null;
    const billingRule = normalizeBillingRule(usage.billingRule);
    billingRuleByCategory[category] ??= billingRule;
    if (typeof usage.rateCardVersion === "string" && usage.rateCardVersion.trim()) {
      rateCardVersion = usage.rateCardVersion.trim().slice(0, 80);
    }
    totalOutboundWithUsage += 1;
    if (category === "unknown") unknownCategoryCount += 1;
    if ((status === "delivered" || status === "read") && estimatedBillable === false) {
      nonBillableCount += 1;
    }
    const buckets = [
      getBucket(byCategory, category),
      getBucket(bySource, source),
      getBucket(byStatus, statusGroup(status, estimatedBillable)),
    ];
    for (const bucket of buckets) {
      addUsageToBucket({ bucket, status, estimatedBillable, cost });
    }
    if (kind === "unknown") {
      // The report intentionally does not create a dedicated kind grouping yet.
      // Keeping this normalization here protects CSV detail fields from raw values.
    }
  }

  const csvRows = makeCsvRows({
    month: params.month,
    byCategory,
    bySource,
    byStatus,
    rateCardVersion,
    billingRuleByCategory,
  });

  return {
    ok: true,
    reportType: "meta_usage_monthly",
    tenantKey: sanitizeTenantText(params.tenantKey),
    tenantName: sanitizeTenantText(params.tenantName),
    month: params.month,
    generatedAt: (params.now ?? new Date()).toISOString(),
    currency: "USD",
    rateCardVersion,
    isEstimate: true,
    disclaimer: META_USAGE_MONTHLY_REPORT_DISCLAIMER,
    summary: {
      totalOutboundWithUsage,
      deliveredBillableCount: summary.deliveredBillableCount,
      deliveredEstimatedCostUsd: summary.deliveredEstimatedCostUsd,
      billableUnknownCostCount: summary.billableUnknownCostCount,
      sentPendingCount: summary.sentPendingCount,
      failedCount: summary.failedCount,
      nonBillableCount,
      unknownCategoryCount,
      currentPolicyMode: summary.policyMode,
      policyEnabled: summary.policyEnabled,
      monthlyLimitUsd: summary.monthlyLimitUsd,
      monthlyMessageLimit: summary.monthlyMessageLimit,
      usagePercentUsd: summary.usagePercentUsd,
      usagePercentMessages: summary.usagePercentMessages,
      thresholdReached: summary.thresholdReached,
      limitExceeded: summary.limitExceeded,
    },
    byCategory,
    bySource,
    byStatus,
    policy: {
      enabled: policy.enabled,
      mode: policy.mode,
      monthlyLimitUsd: policy.monthlyLimitUsd,
      monthlyMessageLimit: policy.monthlyMessageLimit,
      alertThresholds: policy.alertThresholds,
      includeEstimatedSent: policy.includeEstimatedSent,
      includeDeliveredOnly: policy.includeDeliveredOnly,
      source: policy.source,
    },
    csvRows,
    notes: [
      "Mensagens inbound nao entram no relatorio de custo Meta.",
      "Mensagens failed nao somam custo estimado.",
      "Mensagens sent/queued/unknown ficam como pendentes ate status final.",
      "Linhas com valor a confirmar indicam custo unitario indisponivel no rate card local.",
    ],
  };
}

function csvCell(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function formatUsd(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(4) : "";
}

export function buildMonthlyMetaUsageCsv(report: MonthlyMetaUsageReport) {
  const header = [
    "month",
    "groupType",
    "groupKey",
    "source",
    "metaCategory",
    "deliveryStatus",
    "messageKind",
    "deliveredBillableCount",
    "deliveredEstimatedCostUsd",
    "billableUnknownCostCount",
    "sentPendingCount",
    "failedCount",
    "nonBillableCount",
    "rateCardVersion",
    "billingRule",
    "notes",
  ];
  const lines = [header.join(",")];
  for (const row of report.csvRows) {
    lines.push(
      [
        row.month,
        row.groupType,
        row.groupKey,
        row.source,
        row.metaCategory,
        row.deliveryStatus,
        row.messageKind,
        row.deliveredBillableCount,
        formatUsd(row.deliveredEstimatedCostUsd),
        row.billableUnknownCostCount,
        row.sentPendingCount,
        row.failedCount,
        row.nonBillableCount,
        row.rateCardVersion,
        row.billingRule,
        row.notes,
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

export function buildMonthlyMetaUsageCsvFileName(params: { tenantKey?: string | null; month: string }) {
  const tenant = String(params.tenantKey ?? "tenant")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "tenant";
  const month = parseMetaUsageMonth(params.month) ?? "month";
  return `meta-usage-${tenant}-${month}.csv`;
}
