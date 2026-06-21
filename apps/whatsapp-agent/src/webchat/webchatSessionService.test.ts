import test from "node:test";
import assert from "node:assert/strict";
import {
  createWebchatSession,
  restoreWebchatSession,
} from "./webchatSessionService.js";

function makeDate(value: string) {
  return new Date(value);
}

function makeSite(overrides: Record<string, unknown> = {}) {
  return {
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
    settings: {
      theme: {},
      welcomeMessage: "Ola",
      collectName: true,
      collectEmail: false,
      collectPhone: false,
      allowAnonymous: true,
    },
    allowedDomains: [{ domain: "portal.example.com" }],
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
    lastSeenAt: makeDate("2026-06-21T10:00:00.000Z"),
    createdAt: makeDate("2026-06-21T10:00:00.000Z"),
    visitor: {
      id: "visitor_1",
      name: null,
      email: null,
      phone: null,
    },
    site: makeSite(),
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  const base = {
    webchatSite: {
      findFirst: async () => makeSite(),
    },
    webchatVisitor: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => ({
        id: "visitor_1",
        ...create,
      }),
      update: async () => ({ id: "visitor_1" }),
    },
    webchatSession: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "session_1",
        createdAt: makeDate("2026-06-21T10:00:00.000Z"),
        ...data,
      }),
      findUnique: async () => makeSession(),
      update: async ({ data }: { data: Record<string, unknown> }) => ({
        ...makeSession(),
        ...data,
      }),
    },
    event: {
      create: async () => ({ id: "event_1" }),
    },
  };
  return { ...base, ...overrides } as never;
}

test("createWebchatSession rejects invalid origin domain", async () => {
  const result = await createWebchatSession({
    prisma: makePrisma(),
    requestId: "req_1",
    input: { siteId: "site_1" },
    origin: "https://evil.example.com",
    ip: "203.0.113.10",
    userAgent: "test",
  });
  assert.deepEqual(result, { ok: false, error: "webchat_origin_not_allowed" });
});

test("createWebchatSession rejects inactive site", async () => {
  const prisma = makePrisma({
    webchatSite: {
      findFirst: async () => makeSite({ status: "inactive" }),
    },
  });
  const result = await createWebchatSession({
    prisma,
    requestId: "req_2",
    input: { siteId: "site_1" },
    origin: "https://portal.example.com",
    ip: "203.0.113.11",
    userAgent: "test",
  });
  assert.deepEqual(result, { ok: false, error: "webchat_site_inactive" });
});

test("createWebchatSession rejects disabled webchat feature", async () => {
  const prisma = makePrisma({
    webchatSite: {
      findFirst: async () => makeSite({ client: { ...makeSite().client, features: { webchat: false } } }),
    },
  });
  const result = await createWebchatSession({
    prisma,
    requestId: "req_3",
    input: { siteId: "site_1" },
    origin: "https://portal.example.com",
    ip: "203.0.113.12",
    userAgent: "test",
  });
  assert.deepEqual(result, { ok: false, error: "feature_not_enabled" });
});

test("createWebchatSession creates visitor and session without storing raw token in event", async () => {
  const events: Array<Record<string, unknown>> = [];
  const prisma = makePrisma({
    event: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        events.push(data);
        return { id: "event_1" };
      },
    },
  });
  const result = await createWebchatSession({
    prisma,
    requestId: "req_4",
    input: { siteId: "site_1", visitor: { name: "Ana" } },
    origin: "https://portal.example.com",
    ip: "203.0.113.13",
    userAgent: "test",
  });
  assert.equal(result.ok, true);
  assert.match(result.ok ? result.token : "", /^wcs_/);
  assert.equal(events.length, 1);
  assert.equal(JSON.stringify(events[0]).includes(result.ok ? result.token : "missing"), false);
});

test("restoreWebchatSession returns existing session for valid token", async () => {
  const result = await restoreWebchatSession({
    prisma: makePrisma(),
    requestId: "req_5",
    token: "wcs_existing",
    origin: "https://portal.example.com",
    ip: "203.0.113.14",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.session.id, "session_1");
    assert.equal(result.site.id, "site_1");
  }
});
