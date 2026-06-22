import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { MessageStatus, MessageType } from "@prisma/client";
import { listWebchatMessages } from "./webchatPollingService.js";

const SESSION_TOKEN = "wcs_test_token";

function makeDate(value: string) {
  return new Date(value);
}

function hashValue(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "session_1",
    clientId: "tenant_a",
    siteId: "site_1",
    visitorId: "visitor_1",
    tokenHash: hashValue(SESSION_TOKEN),
    status: "active",
    originDomain: "portal.example.com",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    visitor: {
      id: "visitor_1",
      visitorIdHash: "visitor_hash_1",
    },
    site: {
      id: "site_1",
      clientId: "tenant_a",
      status: "active",
      client: {
        id: "tenant_a",
        clientKey: "demo",
        status: "ACTIVE",
        features: { webchat: true },
        profile: "government",
      },
      allowedDomains: [{ domain: "portal.example.com" }],
    },
    ...overrides,
  };
}

function makeInbound(overrides: Record<string, unknown> = {}) {
  return {
    id: "inbound_1",
    clientId: "tenant_a",
    channel: "webchat",
    provider: "converta",
    channelAccountId: "site_1",
    externalUserHash: "visitor_hash_1",
    type: MessageType.TEXT,
    bodyText: "Mensagem do visitante",
    createdAt: makeDate("2026-06-22T12:00:00.000Z"),
    rawPayload: { private: true },
    waId: "webchat:secret",
    externalUserRef: "secret",
    ...overrides,
  };
}

function makeOutbound(overrides: Record<string, unknown> = {}) {
  return {
    id: "outbound_1",
    clientId: "tenant_a",
    channel: "webchat",
    provider: "converta",
    channelAccountId: "site_1",
    externalUserHash: "visitor_hash_1",
    type: MessageType.TEXT,
    status: MessageStatus.SENT,
    bodyText: "Resposta humana",
    createdAt: makeDate("2026-06-22T12:01:00.000Z"),
    rawPayload: { private: true },
    waId: "webchat:secret",
    externalUserRef: "secret",
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  const state = {
    session: makeSession() as Record<string, unknown> | null,
    inboundMessages: [] as Array<Record<string, unknown>>,
    outboundMessages: [] as Array<Record<string, unknown>>,
    inboundWhere: [] as Array<Record<string, unknown>>,
    outboundWhere: [] as Array<Record<string, unknown>>,
    events: [] as Array<Record<string, unknown>>,
    sessionUpdates: [] as Array<Record<string, unknown>>,
    visitorUpdates: [] as Array<Record<string, unknown>>,
  };
  const base = {
    state,
    webchatSession: {
      findUnique: async () => state.session,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.sessionUpdates.push(data);
        return { ...(state.session ?? {}), ...data };
      },
    },
    webchatVisitor: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.visitorUpdates.push(data);
        return { id: "visitor_1", ...data };
      },
    },
    inboundMessage: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        state.inboundWhere.push(where);
        return state.inboundMessages.filter((item) =>
          item.clientId === where.clientId &&
          item.channel === where.channel &&
          item.provider === where.provider &&
          item.channelAccountId === where.channelAccountId &&
          item.externalUserHash === where.externalUserHash
        );
      },
    },
    outboundMessage: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        state.outboundWhere.push(where);
        return state.outboundMessages.filter((item) =>
          item.clientId === where.clientId &&
          item.channel === where.channel &&
          item.provider === where.provider &&
          item.channelAccountId === where.channelAccountId &&
          item.externalUserHash === where.externalUserHash
        );
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

async function poll(prisma: any, query: Record<string, string | undefined> = {}) {
  return listWebchatMessages({
    prisma,
    requestId: crypto.randomUUID(),
    query: { sessionToken: SESSION_TOKEN, ...query },
    origin: "https://portal.example.com",
    ip: crypto.randomUUID(),
  });
}

test("listWebchatMessages rejects disabled webchat feature", async () => {
  const prisma = makePrisma() as any;
  prisma.state.session = makeSession({
    site: {
      ...makeSession().site,
      client: { ...makeSession().site.client, features: { webchat: false } },
    },
  });
  const result = await poll(prisma);
  assert.equal(result.ok, false);
  assert.equal(result.error, "feature_not_enabled");
  assert.equal(prisma.state.events[0].eventName, "webchat.polling.denied");
});

test("listWebchatMessages rejects invalid origin", async () => {
  const prisma = makePrisma() as any;
  const result = await listWebchatMessages({
    prisma,
    requestId: "req_origin",
    query: { sessionToken: SESSION_TOKEN },
    origin: "https://evil.example.net",
    ip: "127.0.0.1",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "webchat_origin_not_allowed");
  assert.equal(prisma.state.events[0].eventName, "webchat.polling.denied");
});

test("listWebchatMessages rejects inactive site", async () => {
  const prisma = makePrisma() as any;
  prisma.state.session = makeSession({ site: { ...makeSession().site, status: "inactive" } });
  const result = await poll(prisma);
  assert.equal(result.ok, false);
  assert.equal(result.error, "webchat_site_inactive");
});

test("listWebchatMessages rejects missing session", async () => {
  const prisma = makePrisma() as any;
  prisma.state.session = null;
  const result = await poll(prisma);
  assert.equal(result.ok, false);
  assert.equal(result.error, "webchat_session_not_found");
});

test("listWebchatMessages returns empty list for valid session without messages", async () => {
  const prisma = makePrisma() as any;
  const result = await poll(prisma);
  assert.equal(result.ok, true);
  assert.deepEqual(result.messages, []);
  assert.equal(result.page.nextCursor, null);
  assert.equal(prisma.state.events[0].eventName, "webchat.message.polled");
});

test("listWebchatMessages returns safe inbound and outbound timeline", async () => {
  const prisma = makePrisma() as any;
  prisma.state.inboundMessages = [
    makeInbound({ id: "inbound_1", bodyText: "Oi", createdAt: makeDate("2026-06-22T12:00:00.000Z") }),
  ];
  prisma.state.outboundMessages = [
    makeOutbound({ id: "outbound_1", bodyText: "Ola, como posso ajudar?", createdAt: makeDate("2026-06-22T12:01:00.000Z") }),
  ];
  const result = await poll(prisma);
  assert.equal(result.ok, true);
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].direction, "inbound");
  assert.equal(result.messages[0].text, "Oi");
  assert.equal(result.messages[0].status, "received");
  assert.equal(result.messages[1].direction, "outbound");
  assert.equal(result.messages[1].text, "Ola, como posso ajudar?");
  assert.equal(result.messages[1].status, "sent");
  const payload = JSON.stringify(result);
  assert.equal(payload.includes("rawPayload"), false);
  assert.equal(payload.includes("externalUserRef"), false);
  assert.equal(payload.includes("externalUserHash"), false);
  assert.equal(payload.includes("webchat:secret"), false);
  assert.equal(payload.includes(SESSION_TOKEN), false);
});

test("listWebchatMessages paginates with cursor", async () => {
  const prisma = makePrisma() as any;
  prisma.state.inboundMessages = [
    makeInbound({ id: "inbound_1", bodyText: "Primeira", createdAt: makeDate("2026-06-22T12:00:00.000Z") }),
    makeInbound({ id: "inbound_2", bodyText: "Segunda", createdAt: makeDate("2026-06-22T12:02:00.000Z") }),
  ];
  prisma.state.outboundMessages = [
    makeOutbound({ id: "outbound_1", bodyText: "Resposta", createdAt: makeDate("2026-06-22T12:01:00.000Z") }),
  ];
  const first = await poll(prisma, { limit: "2" });
  assert.equal(first.ok, true);
  assert.equal(first.messages.length, 2);
  assert.ok(first.page.nextCursor);
  const second = await poll(prisma, { limit: "2", cursor: first.page.nextCursor ?? undefined });
  assert.equal(second.ok, true);
  assert.equal(second.messages.length, 1);
  assert.equal(second.messages[0].text, "Segunda");
  assert.equal(second.page.nextCursor, null);
});

test("listWebchatMessages keeps tenant and session isolation", async () => {
  const prisma = makePrisma() as any;
  prisma.state.inboundMessages = [
    makeInbound({ id: "valid", bodyText: "Tenant correto" }),
    makeInbound({ id: "other_tenant", clientId: "tenant_b", bodyText: "Outro tenant" }),
    makeInbound({ id: "other_site", channelAccountId: "site_2", bodyText: "Outro site" }),
    makeInbound({ id: "other_visitor", externalUserHash: "visitor_hash_2", bodyText: "Outro visitante" }),
  ];
  const result = await poll(prisma);
  assert.equal(result.ok, true);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].text, "Tenant correto");
  assert.equal(prisma.state.inboundWhere[0].clientId, "tenant_a");
  assert.equal(prisma.state.inboundWhere[0].channelAccountId, "site_1");
  assert.equal(prisma.state.inboundWhere[0].externalUserHash, "visitor_hash_1");
});
