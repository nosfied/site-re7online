import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVE_MESSAGE_DELIVERED_EVENT_TYPE,
} from "./activeMessageBilling.js";
import {
  buildActiveMessageBillingCsv,
  buildActiveMessageBillingReport,
} from "./activeMessageBillingReport.js";

function raw(params: {
  campaignId: string;
  status: string;
  category?: string;
  cost?: number | null;
  rejected?: boolean;
}) {
  return {
    source: "campaign",
    campaignId: params.campaignId,
    metaStatus: {
      lastStatus: params.status,
      lastStatusAt: "2026-09-10T12:00:00.000Z",
      pricingCategory: params.category ?? "utility",
      statusDetail: params.rejected ? "rejected by provider" : null,
    },
    metaUsage: {
      source: "campaign",
      metaCategory: params.category ?? "utility",
      deliveryStatus: params.status,
      estimatedMetaCostUsd: params.cost ?? null,
    },
  };
}

test("builds contractual campaign billing report with decimal-safe total", async () => {
  const campaignId = "campaign-1";
  const prisma = {
    campaign: {
      async findMany() {
        return [
          {
            id: campaignId,
            name: "Lote CRA",
            templateName: "utility_notice",
            totalRecipients: 100,
            sentCount: 90,
            blockedCount: 2,
            createdAt: new Date("2026-09-10T10:00:00.000Z"),
          },
        ];
      },
    },
    outboundMessage: {
      async findMany() {
        return [
          ...Array.from({ length: 20 }, (_, index) => ({
            id: `sent-${index}`,
            messageId: `campaign.${campaignId}.${index}`,
            status: "SENT",
            rawPayload: raw({ campaignId, status: "sent" }),
            createdAt: new Date("2026-09-10T10:00:00.000Z"),
          })),
          ...Array.from({ length: 20 }, (_, index) => ({
            id: `delivered-${index}`,
            messageId: `campaign.${campaignId}.d${index}`,
            status: "SENT",
            rawPayload: raw({ campaignId, status: "delivered", cost: 0.008 }),
            createdAt: new Date("2026-09-10T10:01:00.000Z"),
          })),
          ...Array.from({ length: 60 }, (_, index) => ({
            id: `read-${index}`,
            messageId: `campaign.${campaignId}.r${index}`,
            status: "SENT",
            rawPayload: raw({ campaignId, status: "read", cost: 0.008 }),
            createdAt: new Date("2026-09-10T10:02:00.000Z"),
          })),
          ...Array.from({ length: 2 }, (_, index) => ({
            id: `failed-${index}`,
            messageId: `campaign.${campaignId}.f${index}`,
            status: "FAILED",
            rawPayload: raw({ campaignId, status: "failed" }),
            createdAt: new Date("2026-09-10T10:03:00.000Z"),
          })),
          ...Array.from({ length: 3 }, (_, index) => ({
            id: `rejected-${index}`,
            messageId: `campaign.${campaignId}.x${index}`,
            status: "FAILED",
            rawPayload: raw({ campaignId, status: "failed", rejected: true }),
            createdAt: new Date("2026-09-10T10:04:00.000Z"),
          })),
        ];
      },
    },
    event: {
      calls: 0,
      async findMany() {
        this.calls += 1;
        if (this.calls > 1) return [];
        return Array.from({ length: 75 }, (_, index) => ({
          id: `billing-${index}`,
          messageId: `campaign.${campaignId}.b${index}`,
          eventName: ACTIVE_MESSAGE_DELIVERED_EVENT_TYPE,
          payloadJson: { campaignId },
          createdAt: new Date("2026-09-10T12:00:00.000Z"),
        }));
      },
    },
  };

  const report = await buildActiveMessageBillingReport({
    prisma,
    clientId: "client-1",
    month: "2026-09",
    unitPrice: "0.0444167",
    now: new Date("2026-09-11T00:00:00.000Z"),
  });

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].processed, 100);
  assert.equal(report.rows[0].sent, 20);
  assert.equal(report.rows[0].delivered, 20);
  assert.equal(report.rows[0].read, 60);
  assert.equal(report.rows[0].failed, 5);
  assert.equal(report.rows[0].rejected, 3);
  assert.equal(report.rows[0].blocked, 2);
  assert.equal(report.rows[0].billableDelivered, 75);
  assert.equal(report.rows[0].unitPrice, "0.0444167");
  assert.equal(report.rows[0].total, "3.3312525");
  assert.equal(report.summary.total, "3.3312525");

  const csv = buildActiveMessageBillingCsv(report);
  assert.match(csv, /^campaign,template,category,processed,sent,delivered,read,failed,rejected,blocked,optOut,billableDelivered,unitPrice,total,metaEstimatedCostUsd\n/);
  assert.match(csv, /Lote CRA,utility_notice,utility,100,20,20,60,5,3,2,0,75,0\.0444167,3\.3312525,/);
});
