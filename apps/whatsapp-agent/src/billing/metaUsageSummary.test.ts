import assert from "node:assert/strict";
import test from "node:test";
import { getPrisma } from "../db.js";
import {
  evaluateMetaUsageThresholdAlerts,
  getTenantMetaUsageSummary,
  normalizeMetaUsagePolicy,
  shouldBlockByMetaUsage,
} from "./metaUsageSummary.js";

const prisma = getPrisma();
const prefix = `meta-usage-summary-${process.pid}-${Date.now()}`;

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { clientKey: { startsWith: prefix } },
    select: { id: true },
  });
  const clientIds = clients.map((client) => client.id);
  if (clientIds.length === 0) return;
  await prisma.outboundMessage.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.event.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
}

async function createClient(suffix: string) {
  return prisma.client.create({
    data: {
      clientKey: `${prefix}-${suffix}`,
      name: `Meta Usage Summary ${suffix}`,
      profile: "business",
      features: {},
    },
    select: { id: true, clientKey: true },
  });
}

function metaUsage(params: {
  source: string;
  category: string;
  status: string;
  billable?: boolean;
  cost?: number | null;
}) {
  return {
    metaUsage: {
      source: params.source,
      messageKind: "template",
      direction: "outbound",
      metaCategory: params.category,
      deliveryStatus: params.status,
      estimatedBillable: params.billable ?? true,
      estimatedMetaCostUsd: params.cost ?? null,
      billingRule: `${params.category}_billable`,
      waIdLast4: "1234",
      waIdLength: 12,
    },
  };
}

test.before(async () => {
  await cleanup();
});

test.after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("summarizes delivered billable usage without PII and leaves sent as pending by default", async () => {
  const client = await createClient("summary");
  const otherClient = await createClient("other");
  await prisma.tenantOperationalConfig.create({
    data: {
      clientId: client.id,
      config: {
        metaUsagePolicy: {
          enabled: true,
          mode: "alert_only",
          monthlyLimitUsd: 0.02,
          monthlyMessageLimit: 3,
          alertThresholds: [70, 90, 100],
        },
      },
    },
  });
  await prisma.outboundMessage.createMany({
    data: [
      {
        clientId: client.id,
        waId: "15551230001",
        waIdCanonical: "15551230001",
        messageId: `${prefix}.delivered`,
        type: "TEMPLATE",
        status: "SENT",
        rawPayload: metaUsage({ source: "campaign", category: "utility", status: "delivered", cost: 0.008 }),
        createdAt: new Date("2026-08-02T10:00:00.000Z"),
      },
      {
        clientId: client.id,
        waId: "15551230002",
        waIdCanonical: "15551230002",
        messageId: `${prefix}.read`,
        type: "TEMPLATE",
        status: "SENT",
        rawPayload: metaUsage({ source: "inbox_template", category: "utility", status: "read", cost: 0.008 }),
        createdAt: new Date("2026-08-02T10:01:00.000Z"),
      },
      {
        clientId: client.id,
        waId: "15551230003",
        waIdCanonical: "15551230003",
        messageId: `${prefix}.pending`,
        type: "TEMPLATE",
        status: "SENT",
        rawPayload: metaUsage({ source: "manual_campaign_send", category: "marketing", status: "sent", cost: 0.0625 }),
        createdAt: new Date("2026-08-02T10:02:00.000Z"),
      },
      {
        clientId: client.id,
        waId: "15551230004",
        waIdCanonical: "15551230004",
        messageId: `${prefix}.failed`,
        type: "TEMPLATE",
        status: "FAILED",
        rawPayload: metaUsage({ source: "campaign", category: "utility", status: "failed", billable: false }),
        createdAt: new Date("2026-08-02T10:03:00.000Z"),
      },
      {
        clientId: client.id,
        waId: "15551230005",
        waIdCanonical: "15551230005",
        messageId: `${prefix}.unknown-cost`,
        type: "TEMPLATE",
        status: "SENT",
        rawPayload: metaUsage({ source: "canned_reply", category: "service", status: "delivered", cost: null }),
        createdAt: new Date("2026-08-02T10:04:00.000Z"),
      },
      {
        clientId: otherClient.id,
        waId: "15551239999",
        waIdCanonical: "15551239999",
        messageId: `${prefix}.other`,
        type: "TEMPLATE",
        status: "SENT",
        rawPayload: metaUsage({ source: "campaign", category: "utility", status: "delivered", cost: 9 }),
        createdAt: new Date("2026-08-02T10:05:00.000Z"),
      },
    ],
  });

  const summary = await getTenantMetaUsageSummary({
    prisma,
    clientId: client.id,
    tenantKey: client.clientKey,
    month: "2026-08",
    now: new Date("2026-08-02T11:00:00.000Z"),
  });

  assert.equal(summary.deliveredBillableCount, 3);
  assert.equal(summary.deliveredEstimatedCostUsd, 0.016);
  assert.equal(summary.billableUnknownCostCount, 1);
  assert.equal(summary.sentPendingCount, 1);
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.byCategory.utility.deliveredBillableCount, 2);
  assert.equal(summary.bySource.campaign.failedCount, 1);
  assert.equal(summary.usagePercentUsd, 80);
  assert.equal(summary.usagePercentMessages, 100);
  assert.equal(summary.thresholdReached, 100);
  assert.equal(summary.limitExceeded, true);
  assert.equal(summary.shouldBlock, false);
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes("15551230001"), false);
  assert.equal(serialized.includes("token"), false);
  assert.equal(serialized.includes("bodyText"), false);
  assert.equal(serialized.includes("rawPayload"), false);

  const firstAlerts = await evaluateMetaUsageThresholdAlerts({
    prisma,
    clientId: client.id,
    summary,
  });
  const secondAlerts = await evaluateMetaUsageThresholdAlerts({
    prisma,
    clientId: client.id,
    summary,
  });
  assert.equal(firstAlerts.created, 3);
  assert.equal(secondAlerts.created, 0);
  const events = await prisma.event.findMany({
    where: { clientId: client.id, eventName: { in: ["meta.usage.threshold_reached", "meta.usage.limit_exceeded"] } },
    select: { eventName: true, payloadJson: true },
    orderBy: { eventName: "asc" },
  });
  assert.equal(events.length, 3);
  assert.equal(events.filter((event) => event.eventName === "meta.usage.limit_exceeded").length, 1);
  const eventPayload = JSON.stringify(events.map((event) => event.payloadJson));
  assert.equal(eventPayload.includes("15551230001"), false);
  assert.equal(eventPayload.includes("token"), false);
  assert.equal(eventPayload.includes("rawPayload"), false);
});

test("block_at_limit helper reports blocking but the policy stays disconnected from sending flows", async () => {
  const policy = normalizeMetaUsagePolicy({
    enabled: true,
    mode: "block_at_limit",
    monthlyLimitUsd: 1,
  });
  assert.equal(shouldBlockByMetaUsage(policy, { limitExceeded: true }), true);
  assert.equal(shouldBlockByMetaUsage(policy, { limitExceeded: false }), false);
});
