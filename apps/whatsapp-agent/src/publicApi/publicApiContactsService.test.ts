import test from "node:test";
import assert from "node:assert/strict";
import {
  decodePublicContactsCursor,
  encodePublicContactsCursor,
  getPublicContact,
  listPublicContacts,
  maskPublicPhone,
  normalizePublicContactsLimit,
} from "./publicApiContactsService.js";

const now = new Date("2026-06-20T12:00:00.000Z");

function contact(overrides: Record<string, unknown> = {}) {
  return {
    id: "contact_1",
    clientId: "client_a",
    waId: "558499999999",
    name: "Maria",
    channel: "whatsapp",
    provider: "meta",
    channelAccountId: "phone_1",
    externalUserHash: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("maskPublicPhone redacts middle digits", () => {
  assert.equal(maskPublicPhone("558499999999"), "5584****9999");
  assert.equal(maskPublicPhone("12345"), "12345");
  assert.equal(maskPublicPhone(null), null);
});

test("normalizePublicContactsLimit clamps public limits", () => {
  assert.equal(normalizePublicContactsLimit(null), 50);
  assert.equal(normalizePublicContactsLimit("0"), 1);
  assert.equal(normalizePublicContactsLimit("200"), 100);
  assert.equal(normalizePublicContactsLimit("abc"), 50);
});

test("public contacts cursor roundtrips", () => {
  const encoded = encodePublicContactsCursor(now, "contact_1");
  assert.deepEqual(decodePublicContactsCursor(encoded), { updatedAt: now, id: "contact_1" });
  assert.equal(decodePublicContactsCursor("invalid"), null);
});

test("listPublicContacts scopes all queries by tenant", async () => {
  const calls: Array<{ model: string; where: unknown }> = [];
  const prisma = {
    contact: {
      findMany: async (args: { where: unknown }) => {
        calls.push({ model: "contact", where: args.where });
        return [contact()];
      },
    },
    lead: {
      findMany: async (args: { where: unknown }) => {
        calls.push({ model: "lead", where: args.where });
        return [];
      },
    },
    conversation: {
      findMany: async (args: { where: unknown }) => {
        calls.push({ model: "conversation", where: args.where });
        return [];
      },
    },
  };

  const result = await listPublicContacts({
    prisma: prisma as never,
    clientId: "client_a",
    query: { limit: "10" },
  });

  assert.equal(result.data.length, 1);
  assert.equal(result.data[0]?.phone, "5584****9999");
  assert.equal((calls[0]?.where as { clientId?: string }).clientId, "client_a");
  assert.equal((calls[0]?.where as { lifecycle?: string }).lifecycle, "ACTIVE");
  assert.equal((calls[1]?.where as { tenantId?: string }).tenantId, "client_a");
  assert.equal((calls[2]?.where as { clientId?: string }).clientId, "client_a");
  assert.equal((calls[2]?.where as { deletedAt?: null }).deletedAt, null);
  assert.equal((calls[2]?.where as { anonymizedAt?: null }).anonymizedAt, null);
});

test("listPublicContacts returns pagination metadata", async () => {
  const prisma = {
    contact: {
      findMany: async () => [
        contact({ id: "contact_2", updatedAt: new Date("2026-06-20T12:01:00.000Z") }),
        contact({ id: "contact_1", updatedAt: now }),
      ],
    },
    lead: {
      findMany: async () => [],
    },
    conversation: {
      findMany: async () => [],
    },
  };

  const result = await listPublicContacts({
    prisma: prisma as never,
    clientId: "client_a",
    query: { limit: "1" },
  });

  assert.equal(result.data.length, 1);
  assert.equal(result.page.hasMore, true);
  assert.equal(typeof result.page.nextCursor, "string");
  assert.equal(result.page.limit, 1);
});

test("getPublicContact returns null for contact outside tenant", async () => {
  const prisma = {
    contact: {
      findFirst: async (args: { where: { id: string; clientId: string } }) =>
        args.where.clientId === "client_a" && args.where.id === "contact_a" ? contact({ id: "contact_a" }) : null,
    },
    lead: {
      findMany: async () => [],
    },
    conversation: {
      findMany: async () => [],
    },
  };

  assert.equal(
    await getPublicContact({ prisma: prisma as never, clientId: "client_a", contactId: "contact_b" }),
    null
  );
  const result = await getPublicContact({ prisma: prisma as never, clientId: "client_a", contactId: "contact_a" });
  assert.equal(result?.id, "contact_a");
});

test("public contacts require active lifecycle for direct lookup", async () => {
  const calls: Array<{ where: Record<string, unknown> }> = [];
  const prisma = {
    contact: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        calls.push(args);
        return null;
      },
    },
    lead: {
      findMany: async () => [],
    },
    conversation: {
      findMany: async () => [],
    },
  };

  const result = await getPublicContact({ prisma: prisma as never, clientId: "client_a", contactId: "contact_provisional" });

  assert.equal(result, null);
  assert.equal(calls[0]?.where.lifecycle, "ACTIVE");
});
