import test from "node:test";
import assert from "node:assert/strict";
import { createWebchatInboundMessage } from "./webchatInboundService.js";

function makeDate(value: string) {
  return new Date(value);
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "session_1",
    clientId: "tenant_a",
    siteId: "site_1",
    visitorId: "visitor_1",
    tokenHash: "hash",
    status: "active",
    originDomain: "portal.example.com",
    expiresAt: makeDate("2026-06-22T10:00:00.000Z"),
    lastSeenAt: makeDate("2026-06-21T10:00:00.000Z"),
    createdAt: makeDate("2026-06-21T10:00:00.000Z"),
    visitor: {
      id: "visitor_1",
      visitorIdHash: "visitor_hash_1",
      name: "Ana",
      email: "ana@example.com",
      phone: null,
    },
    site: {
      id: "site_1",
      clientId: "tenant_a",
      name: "Portal",
      slug: "portal",
      status: "active",
      client: {
        id: "tenant_a",
        clientKey: "demo",
        name: "Demo",
        status: "ACTIVE",
        features: { webchat: true },
        profile: "government",
      },
      allowedDomains: [{ domain: "portal.example.com" }],
    },
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  const state = {
    contacts: [] as Array<Record<string, unknown>>,
    identities: [] as Array<Record<string, unknown>>,
    conversations: [] as Array<Record<string, unknown>>,
    runtimeStates: [] as Array<Record<string, unknown>>,
    inboundMessages: [] as Array<Record<string, unknown>>,
    leads: [] as Array<Record<string, unknown>>,
    events: [] as Array<Record<string, unknown>>,
    webchatSessions: [] as Array<Record<string, unknown>>,
    webchatVisitors: [] as Array<Record<string, unknown>>,
  };
  const tx = {
    contact: {
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.contacts[0];
        const item = existing ? { ...existing, ...update } : { id: "contact_1", ...create };
        state.contacts[0] = item;
        return { id: item.id };
      },
    },
    contactChannelIdentity: {
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.identities[0];
        const item = existing ? { ...existing, ...update } : { id: "identity_1", ...create };
        state.identities[0] = item;
        return { id: item.id };
      },
    },
    conversation: {
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.conversations[0];
        const item: Record<string, unknown> = existing ? { ...existing, ...update } : { id: "conversation_1", ...create };
        state.conversations[0] = item;
        return { id: String(item.id), waId: String(item.waId) };
      },
    },
    conversationRuntimeState: {
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.runtimeStates[0];
        const item: Record<string, unknown> = existing ? { ...existing, ...update } : { id: "runtime_1", ...create };
        state.runtimeStates[0] = item;
        return { id: String(item.id), status: String(item.status) };
      },
    },
    inboundMessage: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const item = {
          id: "inbound_1",
          createdAt: makeDate("2026-06-21T10:00:00.000Z"),
          ...data,
        };
        state.inboundMessages.push(item);
        return item;
      },
    },
    lead: {
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.leads[0];
        const item = existing ? { ...existing, ...update } : { id: "lead_1", ...create };
        state.leads[0] = item;
        return { id: item.id };
      },
    },
    webchatSession: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.webchatSessions.push(data);
        return { id: "session_1", ...data };
      },
    },
    webchatVisitor: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.webchatVisitors.push(data);
        return { id: "visitor_1", ...data };
      },
    },
    event: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.events.push(data);
        return { id: "event_1" };
      },
    },
  };
  const base = {
    state,
    webchatSession: {
      findUnique: async () => makeSession(),
      update: tx.webchatSession.update,
    },
    department: {
      findFirst: async () => ({ id: "department_1", name: "Atendimento Geral" }),
      create: async () => ({ id: "department_1", name: "Atendimento Geral" }),
    },
    queue: {
      upsert: async () => ({ id: "queue_1", name: "Fila Geral", departmentId: "department_1" }),
    },
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
  };
  return { ...base, ...overrides } as never;
}

test("createWebchatInboundMessage rejects disabled feature", async () => {
  const prisma = makePrisma({
    webchatSession: {
      findUnique: async () => makeSession({
        site: {
          ...makeSession().site,
          client: { ...makeSession().site.client, features: { webchat: false } },
        },
      }),
    },
  });
  const result = await createWebchatInboundMessage({
    prisma,
    requestId: "req_1",
    input: { sessionToken: "wcs_existing", text: "Olá" },
    origin: "https://portal.example.com",
    ip: "203.0.113.10",
  });
  assert.deepEqual(result, { ok: false, error: "feature_not_enabled" });
});

test("createWebchatInboundMessage rejects invalid origin", async () => {
  const result = await createWebchatInboundMessage({
    prisma: makePrisma(),
    requestId: "req_2",
    input: { sessionToken: "wcs_existing", text: "Olá" },
    origin: "https://evil.example.com",
    ip: "203.0.113.11",
  });
  assert.deepEqual(result, { ok: false, error: "webchat_origin_not_allowed" });
});

test("createWebchatInboundMessage rejects missing session", async () => {
  const prisma = makePrisma({
    webchatSession: {
      findUnique: async () => null,
    },
  });
  const result = await createWebchatInboundMessage({
    prisma,
    requestId: "req_3",
    input: { sessionToken: "wcs_missing", text: "Olá" },
    origin: "https://portal.example.com",
    ip: "203.0.113.12",
  });
  assert.deepEqual(result, { ok: false, error: "webchat_session_not_found" });
});

test("createWebchatInboundMessage rejects empty message", async () => {
  const result = await createWebchatInboundMessage({
    prisma: makePrisma(),
    requestId: "req_4",
    input: { sessionToken: "wcs_existing", text: "   " },
    origin: "https://portal.example.com",
    ip: "203.0.113.13",
  });
  assert.deepEqual(result, { ok: false, error: "webchat_message_required" });
});

test("createWebchatInboundMessage persists webchat inbound without outbound or raw token leakage", async () => {
  const realtimeEvents: Array<Record<string, unknown>> = [];
  const prisma = makePrisma() as any;
  const result = await createWebchatInboundMessage({
    prisma,
    requestId: "req_5",
    input: { sessionToken: "wcs_existing", text: "Preciso de atendimento" },
    origin: "https://portal.example.com",
    ip: "203.0.113.14",
    publishRealtimeEvent: (event: any) => {
      realtimeEvents.push(event);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(prisma.state.contacts.length, 1);
  assert.equal(prisma.state.identities.length, 1);
  assert.equal(prisma.state.conversations.length, 1);
  assert.equal(prisma.state.runtimeStates.length, 1);
  assert.equal(prisma.state.inboundMessages.length, 1);
  assert.equal(prisma.state.leads.length, 1);
  assert.equal(prisma.state.events.length, 1);
  assert.equal(prisma.state.inboundMessages[0].channel, "webchat");
  assert.equal(prisma.state.inboundMessages[0].provider, "converta");
  assert.equal(prisma.state.inboundMessages[0].bodyText, "Preciso de atendimento");
  assert.equal(prisma.state.runtimeStates[0].mode, "HUMAN");
  assert.equal(prisma.state.runtimeStates[0].status, "WAITING");
  assert.equal(realtimeEvents.length, 1);
  assert.equal(realtimeEvents[0].type, "message.created");
  assert.equal(JSON.stringify(prisma.state.events).includes("wcs_existing"), false);
  assert.equal(JSON.stringify(prisma.state.inboundMessages[0].rawPayload).includes("Preciso de atendimento"), false);
});
