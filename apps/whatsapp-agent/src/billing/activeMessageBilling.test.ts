import assert from "node:assert/strict";
import test from "node:test";
import { MessageType, Prisma } from "@prisma/client";
import {
  ACTIVE_MESSAGE_DELIVERED_EVENT_TYPE,
  recordActiveMessageDeliveryIfNeeded,
} from "./activeMessageBilling.js";

function outbound(overrides: Record<string, unknown> = {}) {
  return {
    id: "outbound-1",
    clientId: "client-1",
    waId: "5541999990001",
    waIdCanonical: "5541999990001",
    messageId: "campaign.campaign-1.1",
    metaMessageId: "wamid-1",
    type: MessageType.TEMPLATE,
    templateName: "utility_notice",
    createdAt: new Date("2026-09-02T12:00:00.000Z"),
    rawPayload: {
      source: "campaign",
      campaignId: "campaign-1",
      conversationId: "conversation-1",
      metaUsage: {
        source: "campaign",
        metaCategory: "utility",
      },
    },
    ...overrides,
  };
}

function prismaMock(params: {
  lastInboundAt?: Date | null;
  duplicate?: boolean;
} = {}) {
  const events: Array<Record<string, unknown>> = [];
  return {
    events,
    prisma: {
      conversation: {
        async findFirst() {
          return { id: "conversation-1", lastInboundAt: params.lastInboundAt ?? new Date("2026-09-01T10:00:00.000Z") };
        },
      },
      event: {
        async create(args: { data: Record<string, unknown> }) {
          if (params.duplicate) {
            throw new Prisma.PrismaClientKnownRequestError("duplicate", {
              code: "P2002",
              clientVersion: "test",
            });
          }
          events.push(args.data);
          return { id: "event-1", ...args.data };
        },
      },
    },
  };
}

test("creates one active billing event for delivered utility campaign outside the 24h window", async () => {
  const mock = prismaMock();
  const result = await recordActiveMessageDeliveryIfNeeded({
    prisma: mock.prisma,
    input: {
      outbound: outbound(),
      deliveryStatus: "delivered",
      deliveredAt: new Date("2026-09-02T12:01:00.000Z"),
      pricingCategory: "utility",
      providerMessageId: "wamid-1",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.billable, true);
  assert.equal(mock.events.length, 1);
  assert.equal(mock.events[0].eventName, ACTIVE_MESSAGE_DELIVERED_EVENT_TYPE);
  assert.equal((mock.events[0].payloadJson as Record<string, unknown>).customerServiceWindowOpenAtSend, false);
});

test("does not bill duplicate delivery or read after delivered", async () => {
  const duplicate = await recordActiveMessageDeliveryIfNeeded({
    prisma: prismaMock({ duplicate: true }).prisma,
    input: {
      outbound: outbound(),
      deliveryStatus: "read",
      deliveredAt: new Date("2026-09-02T12:02:00.000Z"),
      pricingCategory: "utility",
      providerMessageId: "wamid-1",
    },
  });

  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.billable, false);
  assert.equal(duplicate.reason, "duplicate");
});

test("excludes sent failed marketing unknown category opt-out and inside-window sends", async () => {
  const cases = [
    {
      name: "sent",
      input: { deliveryStatus: "sent", pricingCategory: "utility" },
      reason: "not_delivered",
    },
    {
      name: "failed",
      input: { deliveryStatus: "failed", pricingCategory: "utility" },
      reason: "not_delivered",
    },
    {
      name: "marketing",
      input: { deliveryStatus: "delivered", pricingCategory: "marketing" },
      reason: "not_utility",
    },
    {
      name: "unknown",
      input: { deliveryStatus: "delivered", pricingCategory: null },
      rawPayload: { source: "campaign", campaignId: "campaign-1" },
      reason: "not_utility",
    },
    {
      name: "opt-out",
      input: { deliveryStatus: "delivered", pricingCategory: "utility" },
      rawPayload: { source: "campaign.recipient.opt_out_blocked", campaignId: "campaign-1" },
      reason: "not_campaign",
    },
  ];

  for (const item of cases) {
    const result = await recordActiveMessageDeliveryIfNeeded({
      prisma: prismaMock().prisma,
      input: {
        outbound: outbound(item.rawPayload ? { rawPayload: item.rawPayload } : {}),
        deliveredAt: new Date("2026-09-02T12:01:00.000Z"),
        providerMessageId: "wamid-1",
        ...item.input,
      },
    });
    assert.equal(result.ok, true, item.name);
    assert.equal(result.billable, false, item.name);
    assert.equal(result.reason, item.reason, item.name);
  }

  const insideWindow = await recordActiveMessageDeliveryIfNeeded({
    prisma: prismaMock({ lastInboundAt: new Date("2026-09-02T11:30:00.000Z") }).prisma,
    input: {
      outbound: outbound(),
      deliveryStatus: "delivered",
      deliveredAt: new Date("2026-09-02T12:01:00.000Z"),
      pricingCategory: "utility",
      providerMessageId: "wamid-1",
    },
  });
  assert.equal(insideWindow.ok, true);
  assert.equal(insideWindow.billable, false);
  assert.equal(insideWindow.reason, "inside_window");
});

test("excludes formal campaign test-send from contractual active message billing", async () => {
  const result = await recordActiveMessageDeliveryIfNeeded({
    prisma: prismaMock().prisma,
    input: {
      outbound: outbound({
        messageId: "campaign-test.campaign-1.1",
        rawPayload: {
          source: "campaign_test_send",
          campaignTestSend: true,
          metaUsage: {
            source: "manual_campaign_send",
            campaignTestSend: true,
            metaCategory: "utility",
          },
        },
      }),
      deliveryStatus: "delivered",
      deliveredAt: new Date("2026-09-02T12:01:00.000Z"),
      pricingCategory: "utility",
      providerMessageId: "wamid-test",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.billable, false);
  assert.equal(result.reason, "not_campaign");
});
