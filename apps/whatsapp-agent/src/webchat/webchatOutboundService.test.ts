import test from "node:test";
import assert from "node:assert/strict";
import { MessageStatus } from "@prisma/client";
import { createWebchatOutboundMessage } from "./webchatOutboundService.js";

function makeDate(value: string) {
  return new Date(value);
}

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    id: "tenant_a",
    clientKey: "demo",
    status: "ACTIVE",
    features: { webchat: true, webchatOutbound: true },
    profile: "government",
    ...overrides,
  };
}

function makeRuntimeState(overrides: Record<string, unknown> = {}) {
  return {
    id: "runtime_1",
    waId: "webchat:abc123",
    waIdCanonical: "webchat:abc123",
    channelAccountId: "site_1",
    externalUserHash: "visitor_hash_1",
    assignedAt: makeDate("2026-06-21T10:00:00.000Z"),
    assignedUserId: "user_1",
    departmentId: "department_1",
    ...overrides,
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "session_1",
    clientId: "tenant_a",
    siteId: "site_1",
    visitorId: "visitor_1",
    status: "active",
    originDomain: "portal.example.com",
    expiresAt: makeDate("2026-06-22T10:00:00.000Z"),
    site: {
      id: "site_1",
      status: "active",
      allowedDomains: [{ domain: "portal.example.com" }],
    },
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  const state = {
    outboundMessages: [] as Array<Record<string, unknown>>,
    events: [] as Array<Record<string, unknown>>,
    conversationUpdates: [] as Array<Record<string, unknown>>,
    runtimeUpdates: [] as Array<Record<string, unknown>>,
    runtimeWhere: [] as Array<Record<string, unknown>>,
  };
  const base = {
    state,
    client: {
      findUnique: async () => makeClient(),
    },
    conversationRuntimeState: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        state.runtimeWhere.push(where);
        return makeRuntimeState();
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        state.runtimeUpdates.push(data);
        return { count: 1 };
      },
    },
    webchatSession: {
      findFirst: async () => makeSession(),
    },
    conversation: {
      findFirst: async () => ({ id: "conversation_1" }),
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        state.conversationUpdates.push(data);
        return { count: 1 };
      },
    },
    outboundMessage: {
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.outboundMessages[0];
        const item = existing ? { ...existing, ...update } : { id: "outbound_1", ...create };
        state.outboundMessages[0] = item;
        return { id: item.id };
      },
    },
    event: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.events.push(data);
        return { id: "event_1" };
      },
    },
  };
  return { ...base, ...overrides } as never;
}

const allowUsageGate = async () => ({
  allowed: true,
  usage: {
    messagesSent: 0,
    messagesReceived: 0,
    templatesSent: 0,
    messagesLimit: null,
    period: "2026-06",
  },
  planName: null,
});
const recordMetrics = async () => undefined;

test("createWebchatOutboundMessage rejects disabled outbound feature", async () => {
  const prisma = makePrisma({
    client: {
      findUnique: async () => makeClient({ features: { webchat: true, webchatOutbound: false } }),
    },
  }) as any;
  const result = await createWebchatOutboundMessage({
    prisma,
    requestId: "req_1",
    clientId: "tenant_a",
    clientKey: "demo",
    waId: "webchat:abc123",
    text: "Resposta humana",
    usageGateCheck: allowUsageGate,
    metricsRecorder: recordMetrics,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "webchat_outbound_disabled");
  assert.equal(prisma.state.outboundMessages.length, 0);
  assert.equal(prisma.state.events[0].eventName, "webchat.outbound.blocked");
});

test("createWebchatOutboundMessage rejects missing session", async () => {
  const prisma = makePrisma({
    webchatSession: {
      findFirst: async () => null,
    },
  }) as any;
  const result = await createWebchatOutboundMessage({
    prisma,
    requestId: "req_2",
    clientId: "tenant_a",
    clientKey: "demo",
    waId: "webchat:abc123",
    text: "Resposta humana",
    usageGateCheck: allowUsageGate,
    metricsRecorder: recordMetrics,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "webchat_session_unavailable");
  assert.equal(prisma.state.outboundMessages.length, 0);
});

test("createWebchatOutboundMessage rejects inactive site", async () => {
  const prisma = makePrisma({
    webchatSession: {
      findFirst: async () => makeSession({ site: { ...makeSession().site, status: "inactive" } }),
    },
  }) as any;
  const result = await createWebchatOutboundMessage({
    prisma,
    requestId: "req_3",
    clientId: "tenant_a",
    clientKey: "demo",
    waId: "webchat:abc123",
    text: "Resposta humana",
    usageGateCheck: allowUsageGate,
    metricsRecorder: recordMetrics,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "webchat_site_inactive");
  assert.equal(prisma.state.outboundMessages.length, 0);
});

test("createWebchatOutboundMessage persists controlled outbound without public delivery", async () => {
  const prisma = makePrisma() as any;
  const result = await createWebchatOutboundMessage({
    prisma,
    requestId: "req_4",
    clientId: "tenant_a",
    clientKey: "demo",
    waId: "webchat:abc123",
    text: "Resposta humana",
    source: { channel: "webchat", provider: "converta", channelAccountId: "site_1" },
    usageGateCheck: allowUsageGate,
    metricsRecorder: recordMetrics,
  });
  assert.equal(result.ok, true);
  assert.equal(prisma.state.runtimeWhere[0].clientId, "tenant_a");
  assert.equal(prisma.state.runtimeWhere[0].channel, "webchat");
  assert.equal(prisma.state.outboundMessages.length, 1);
  assert.equal(prisma.state.outboundMessages[0].channel, "webchat");
  assert.equal(prisma.state.outboundMessages[0].provider, "converta");
  assert.equal(prisma.state.outboundMessages[0].status, MessageStatus.SENT);
  assert.equal(prisma.state.outboundMessages[0].bodyText, "Resposta humana");
  assert.equal((prisma.state.outboundMessages[0].rawPayload as any).delivery, "pending_public_polling");
  assert.equal(JSON.stringify(prisma.state.outboundMessages[0].rawPayload).includes("Resposta humana"), false);
  assert.equal(prisma.state.events[0].eventName, "webchat.message.outbound_created");
  assert.equal(prisma.state.runtimeUpdates[0].status, "IN_PROGRESS");
});
