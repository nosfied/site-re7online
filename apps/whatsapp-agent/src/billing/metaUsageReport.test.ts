import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import {
  buildMonthlyMetaUsageCsv,
  buildMonthlyMetaUsageCsvFileName,
  buildMonthlyMetaUsageReport,
} from "./metaUsageReport.js";

type FakeOutboundMessage = {
  id: string;
  messageId: string | null;
  rawPayload: Prisma.JsonValue | null;
  createdAt: Date;
};

function usage(params: {
  source?: string;
  category?: string;
  status?: string;
  kind?: string;
  billable?: boolean | "unknown";
  cost?: number | null;
  unitCost?: number | null;
  billingRule?: string;
  rateCardVersion?: string;
}): Prisma.JsonObject {
  return {
    metaUsage: {
      direction: "outbound",
      source: params.source ?? "campaign",
      messageKind: params.kind ?? "template",
      metaCategory: params.category ?? "utility",
      deliveryStatus: params.status ?? "delivered",
      estimatedBillable: params.billable ?? true,
      estimatedMetaUnitCostUsd:
        params.unitCost === null ? null : params.unitCost ?? (params.cost === null ? null : params.cost ?? 0.008),
      estimatedMetaCostUsd: params.cost === null ? null : params.cost ?? 0.008,
      billingRule: params.billingRule ?? "utility_billable",
      rateCardVersion: params.rateCardVersion ?? "meta-br-planning-2026-08",
      waIdLast4: "7784",
      waIdLength: 13,
      templateName: "nao_exportar_pii",
    },
  };
}

function message(id: string, rawPayload: Prisma.JsonValue | null, createdAt = "2026-08-03T10:00:00.000Z") {
  return {
    id,
    messageId: id,
    rawPayload,
    createdAt: new Date(createdAt),
  };
}

function fakePrisma(messages: FakeOutboundMessage[], config: Prisma.JsonValue = {}) {
  return {
    outboundMessage: {
      async findMany() {
        return messages;
      },
    },
    tenantOperationalConfig: {
      async findUnique() {
        return { config };
      },
    },
    event: {
      async create() {
        return {};
      },
    },
  };
}

test("monthly meta usage report handles an empty month without PII", async () => {
  const report = await buildMonthlyMetaUsageReport({
    prisma: fakePrisma([]),
    clientId: "tenant-1",
    tenantKey: "re7online",
    tenantName: "RE7ONLINE",
    month: "2026-08",
    now: new Date("2026-08-06T00:00:00.000Z"),
  });

  assert.equal(report.ok, true);
  assert.equal(report.reportType, "meta_usage_monthly");
  assert.equal(report.currency, "USD");
  assert.equal(report.isEstimate, true);
  assert.equal(report.summary.totalOutboundWithUsage, 0);
  assert.equal(report.summary.deliveredBillableCount, 0);
  assert.equal(report.byCategory.utility.deliveredBillableCount, 0);
  assert.equal(report.bySource.campaign.deliveredBillableCount, 0);
  assert.equal(report.byStatus.delivered_read.deliveredBillableCount, 0);
  assert.match(report.disclaimer, /Relatorio estimativo/);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("5584999997784"), false);
  assert.equal(serialized.includes("bodyText"), false);
  assert.equal(serialized.includes("rawPayload"), false);
  assert.equal(serialized.includes("token"), false);
});

test("monthly meta usage report aggregates delivered, pending, failed and unknown cost", async () => {
  const report = await buildMonthlyMetaUsageReport({
    prisma: fakePrisma([
      message(
        "delivered-utility",
        usage({ source: "campaign", category: "utility", status: "delivered", cost: 0.008 })
      ),
      message(
        "read-marketing",
        usage({
          source: "manual_campaign_send",
          category: "marketing",
          status: "read",
          cost: 0.0625,
          billingRule: "marketing_billable",
        }),
        "2026-08-03T10:01:00.000Z"
      ),
      message(
        "service-unknown",
        usage({
          source: "inbox_text",
          category: "service",
          status: "delivered",
          kind: "free_text",
          cost: null,
          unitCost: null,
          billingRule: "post_2026_10_service_billable",
        }),
        "2026-08-03T10:02:00.000Z"
      ),
      message(
        "sent-pending",
        usage({ source: "inbox_template", category: "authentication", status: "sent", cost: 0.0315 }),
        "2026-08-03T10:03:00.000Z"
      ),
      message(
        "failed",
        usage({ source: "campaign", category: "utility", status: "failed", billable: false, cost: null }),
        "2026-08-03T10:04:00.000Z"
      ),
      message(
        "non-billable",
        usage({
          source: "canned_reply",
          category: "service",
          status: "delivered",
          kind: "canned_reply",
          billable: false,
          cost: 0,
          billingRule: "current_service_free",
        }),
        "2026-08-03T10:05:00.000Z"
      ),
      message(
        "unknown-category",
        usage({ source: "bot", category: "other", status: "delivered", billable: "unknown", cost: null }),
        "2026-08-03T10:06:00.000Z"
      ),
      message("inbound-ignored", { metaUsage: { direction: "inbound", source: "inbox_text" } }, "2026-08-03T10:07:00.000Z"),
    ]),
    clientId: "tenant-1",
    tenantKey: "business",
    month: "2026-08",
    now: new Date("2026-11-01T00:00:00.000Z"),
  });

  assert.equal(report.summary.totalOutboundWithUsage, 7);
  assert.equal(report.summary.deliveredBillableCount, 3);
  assert.equal(report.summary.deliveredEstimatedCostUsd, 0.0705);
  assert.equal(report.summary.billableUnknownCostCount, 1);
  assert.equal(report.summary.sentPendingCount, 1);
  assert.equal(report.summary.failedCount, 1);
  assert.equal(report.summary.nonBillableCount, 1);
  assert.equal(report.summary.unknownCategoryCount, 1);
  assert.equal(report.byCategory.utility.deliveredBillableCount, 1);
  assert.equal(report.byCategory.marketing.deliveredEstimatedCostUsd, 0.0625);
  assert.equal(report.byCategory.service.billableUnknownCostCount, 1);
  assert.equal(report.byCategory.service.nonBillableCount, 1);
  assert.equal(report.bySource.manual_campaign_send.deliveredBillableCount, 1);
  assert.equal(report.bySource.inbox_template.sentPendingCount, 1);
  assert.equal(report.byStatus.delivered_read.deliveredBillableCount, 3);
  assert.equal(report.byStatus.sent_pending.sentPendingCount, 1);
  assert.equal(report.byStatus.failed.failedCount, 1);
  assert.equal(report.byStatus.non_billable.nonBillableCount, 1);
});

test("monthly meta usage CSV has stable header and excludes sensitive fields", async () => {
  const report = await buildMonthlyMetaUsageReport({
    prisma: fakePrisma([
      message("csv-1", usage({ source: "campaign", category: "utility", status: "delivered", cost: 0.008 })),
    ]),
    clientId: "tenant-1",
    tenantKey: "tenant key",
    month: "2026-08",
    now: new Date("2026-08-06T00:00:00.000Z"),
  });
  const csv = buildMonthlyMetaUsageCsv(report);

  assert.match(
    csv,
    /^month,groupType,groupKey,source,metaCategory,deliveryStatus,messageKind,deliveredBillableCount,deliveredEstimatedCostUsd,billableUnknownCostCount,sentPendingCount,failedCount,nonBillableCount,rateCardVersion,billingRule,notes\n/
  );
  assert.match(csv, /2026-08,category,utility,,utility,,/);
  assert.match(csv, /,1,0\.0080,0,0,0,0,/);
  assert.equal(csv.includes("7784"), false);
  assert.equal(csv.includes("5584999997784"), false);
  assert.equal(csv.includes("bodyText"), false);
  assert.equal(csv.includes("rawPayload"), false);
  assert.equal(csv.includes("metaMessageId"), false);
  assert.equal(csv.includes("token"), false);
  assert.equal(buildMonthlyMetaUsageCsvFileName({ tenantKey: "Tenant Key!", month: "2026-08" }), "meta-usage-tenant-key-2026-08.csv");
});

test("monthly meta usage report applies policy limits without mutating policy", async () => {
  const report = await buildMonthlyMetaUsageReport({
    prisma: fakePrisma(
      [
        message("limit-1", usage({ source: "campaign", category: "utility", status: "delivered", cost: 0.008 })),
      ],
      {
        metaUsagePolicy: {
          enabled: true,
          mode: "alert_only",
          monthlyLimitUsd: 0.01,
          monthlyMessageLimit: 1,
          alertThresholds: [70, 90, 100],
        },
      }
    ),
    clientId: "tenant-1",
    month: "2026-08",
    now: new Date("2026-08-06T00:00:00.000Z"),
  });

  assert.equal(report.summary.currentPolicyMode, "alert_only");
  assert.equal(report.summary.monthlyLimitUsd, 0.01);
  assert.equal(report.summary.monthlyMessageLimit, 1);
  assert.equal(report.summary.usagePercentUsd, 80);
  assert.equal(report.summary.usagePercentMessages, 100);
  assert.equal(report.summary.thresholdReached, 100);
  assert.equal(report.summary.limitExceeded, true);
});
