import test from "node:test";
import assert from "node:assert/strict";
import {
  createWebchatAllowedDomain,
  createWebchatSite,
  listWebchat,
  updateWebchatAllowedDomain,
  updateWebchatSite,
  upsertWebchatSettings,
} from "./webchatService.js";

function makeDate(value: string) {
  return new Date(value);
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  const base = {
    webchatSite: {
      findMany: async () => [],
      findFirst: async () => ({ id: "site_1" }),
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "site_1",
        metadata: null,
        createdAt: makeDate("2026-06-21T10:00:00.000Z"),
        updatedAt: makeDate("2026-06-21T10:00:00.000Z"),
        ...data,
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "site_1",
        name: "Portal",
        slug: "portal",
        status: "inactive",
        metadata: null,
        createdAt: makeDate("2026-06-21T10:00:00.000Z"),
        updatedAt: makeDate("2026-06-21T10:00:00.000Z"),
        ...data,
      }),
    },
    webchatSettings: {
      findMany: async () => [],
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "settings_1",
        theme: null,
        welcomeMessage: null,
        collectName: true,
        collectEmail: false,
        collectPhone: false,
        allowAnonymous: true,
        metadata: null,
        createdAt: makeDate("2026-06-21T10:00:00.000Z"),
        updatedAt: makeDate("2026-06-21T10:00:00.000Z"),
        ...data,
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "settings_1",
        siteId: "site_1",
        theme: null,
        welcomeMessage: null,
        collectName: true,
        collectEmail: false,
        collectPhone: false,
        allowAnonymous: true,
        metadata: null,
        createdAt: makeDate("2026-06-21T10:00:00.000Z"),
        updatedAt: makeDate("2026-06-21T10:00:00.000Z"),
        ...data,
      }),
    },
    webchatAllowedDomain: {
      findMany: async () => [],
      findFirst: async () => ({ id: "domain_1" }),
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "domain_1",
        createdAt: makeDate("2026-06-21T10:00:00.000Z"),
        updatedAt: makeDate("2026-06-21T10:00:00.000Z"),
        ...data,
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "domain_1",
        siteId: "site_1",
        domain: "example.com",
        active: true,
        createdAt: makeDate("2026-06-21T10:00:00.000Z"),
        updatedAt: makeDate("2026-06-21T10:00:00.000Z"),
        ...data,
      }),
    },
  };
  return { ...base, ...overrides } as never;
}

test("listWebchat scopes every collection by clientId", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const prisma = makePrisma({
    webchatSite: { findMany: async (args: Record<string, unknown>) => (calls.push(args), []) },
    webchatSettings: { findMany: async (args: Record<string, unknown>) => (calls.push(args), []) },
    webchatAllowedDomain: { findMany: async (args: Record<string, unknown>) => (calls.push(args), []) },
  });
  await listWebchat({ prisma, clientId: "tenant_a" });
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.deepEqual(call.where, { clientId: "tenant_a" });
  }
});

test("createWebchatSite writes current clientId and normalizes slug", async () => {
  let created: Record<string, unknown> | null = null;
  const prisma = makePrisma({
    webchatSite: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created = data;
        return {
          id: "site_1",
          status: "inactive",
          metadata: null,
          createdAt: makeDate("2026-06-21T10:00:00.000Z"),
          updatedAt: makeDate("2026-06-21T10:00:00.000Z"),
          ...data,
        };
      },
    },
  });
  const result = await createWebchatSite({
    prisma,
    clientId: "tenant_a",
    input: { name: "Portal CAC", slug: "Portal CAC!" },
  });
  assert.equal(result.ok, true);
  assert.notEqual(created, null);
  const createdSite = created as unknown as Record<string, unknown>;
  assert.equal(createdSite.clientId, "tenant_a");
  assert.equal(createdSite.slug, "portal-cac");
});

test("updateWebchatSite does not update cross-tenant records", async () => {
  let updateCalled = false;
  const prisma = makePrisma({
    webchatSite: {
      findFirst: async () => null,
      update: async () => {
        updateCalled = true;
        return null;
      },
    },
  });
  const result = await updateWebchatSite({
    prisma,
    clientId: "tenant_a",
    siteId: "site_other",
    input: { name: "Portal" },
  });
  assert.deepEqual(result, { ok: false, error: "webchat_site_not_found" });
  assert.equal(updateCalled, false);
});

test("upsertWebchatSettings validates site tenant", async () => {
  let createCalled = false;
  const prisma = makePrisma({
    webchatSite: {
      findFirst: async () => null,
    },
    webchatSettings: {
      create: async () => {
        createCalled = true;
        return null;
      },
    },
  });
  const result = await upsertWebchatSettings({
    prisma,
    clientId: "tenant_a",
    input: { siteId: "site_other", welcomeMessage: "Ola" },
  });
  assert.deepEqual(result, { ok: false, error: "webchat_site_not_found" });
  assert.equal(createCalled, false);
});

test("createWebchatAllowedDomain normalizes domain and validates site", async () => {
  let created: Record<string, unknown> | null = null;
  const prisma = makePrisma({
    webchatSite: {
      findFirst: async (args: { where: Record<string, unknown> }) =>
        args.where.clientId === "tenant_a" && args.where.id === "site_1" ? { id: "site_1" } : null,
    },
    webchatAllowedDomain: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created = data;
        return {
          id: "domain_1",
          active: true,
          createdAt: makeDate("2026-06-21T10:00:00.000Z"),
          updatedAt: makeDate("2026-06-21T10:00:00.000Z"),
          ...data,
        };
      },
    },
  });
  const result = await createWebchatAllowedDomain({
    prisma,
    clientId: "tenant_a",
    input: { siteId: "site_1", domain: "https://Portal.Example.com/app", active: true },
  });
  assert.equal(result.ok, true);
  assert.notEqual(created, null);
  const createdDomain = created as unknown as Record<string, unknown>;
  assert.equal(createdDomain.clientId, "tenant_a");
  assert.equal(createdDomain.domain, "portal.example.com");
});

test("updateWebchatAllowedDomain does not update cross-tenant records", async () => {
  let updateCalled = false;
  const prisma = makePrisma({
    webchatAllowedDomain: {
      findFirst: async () => null,
      update: async () => {
        updateCalled = true;
        return null;
      },
    },
  });
  const result = await updateWebchatAllowedDomain({
    prisma,
    clientId: "tenant_a",
    domainId: "domain_other",
    input: { siteId: "site_1", domain: "example.com" },
  });
  assert.deepEqual(result, { ok: false, error: "webchat_domain_not_found" });
  assert.equal(updateCalled, false);
});
