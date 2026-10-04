import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { resolveInboundConversationIdentity } from "./inboundConversationIdentity.js";

const modern = "5584994786787";
const legacy = "558494786787";

function fixture(rows: Array<Record<string, unknown>>) {
  const publicNumber = "558499995328";
  const matches = (row: Record<string, unknown>, clause: Record<string, unknown>) =>
    Object.entries(clause).some(([field, condition]) => {
      const value = String(row[field] ?? "");
      if (typeof condition === "object" && condition !== null) {
        const filter = condition as { in?: string[]; endsWith?: string };
        return (filter.in?.includes(value) ?? false) || (filter.endsWith ? value.endsWith(filter.endsWith) : false);
      }
      return value === condition;
    });
  const prisma = {
    conversation: {
      findMany: async ({ where }: { where: { clientId: string; OR: Record<string, unknown>[] } }) =>
        rows.filter((row) => row.clientId === where.clientId && !row.deletedAt && !row.anonymizedAt && where.OR.some((clause) => matches(row, clause))),
      findUnique: async ({ where }: { where: { id: string } }) => rows.find((row) => row.id === where.id) ?? null,
    },
    contact: { findFirst: async () => null },
    tenantMetaConfig: {
      findUnique: async () => ({ phoneNumberId: "meta-phone", businessToken: "synthetic", wabaId: "synthetic", rawPayload: { source: "fixture" } }),
    },
    waPhoneNumber: { findFirst: async () => ({ display: publicNumber, phoneNumberId: "meta-phone" }) },
    tenantOperationalConfig: {
      findUnique: async () => ({ config: { webSessionAuthorization: { status: "AUTHORIZED", authorizedNumberCanonical: publicNumber } } }),
    },
    channelAccount: { findMany: async () => [{ channelAccountId: "web-account" }] },
  } as unknown as PrismaClient;
  return prisma;
}

function row(waId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "conversation-1", clientId: "tenant-1", waId, waIdCanonical: waId,
    provider: "meta", phoneNumberId: "meta-phone", channelAccountId: null,
    deletedAt: null, anonymizedAt: null, updatedAt: new Date(), lastInboundAt: null, lastOutboundAt: null,
    ...overrides,
  };
}

test("confirmed hybrid account selects the existing conversation in both ninth-digit directions", async () => {
  for (const [existing, incoming] of [[modern, legacy], [legacy, modern]]) {
    const prisma = fixture([row(existing)]);
    const result = await resolveInboundConversationIdentity(prisma, {
      clientId: "tenant-1", waId: incoming, provider: "web_session", channelAccountId: "web-account",
    });
    assert.deepEqual(result, { waId: existing, reason: "resolved", conversationId: "conversation-1" });
  }
});

test("Meta winner can reuse the Web conversation on the same confirmed public account", async () => {
  const prisma = fixture([row(legacy, { provider: "web_session", phoneNumberId: null, channelAccountId: "web-account" })]);
  assert.equal((await resolveInboundConversationIdentity(prisma, {
    clientId: "tenant-1", waId: modern, provider: "meta", channelAccountId: "meta-phone",
  })).waId, legacy);
});

test("exact canonical alias returns the persisted winning waId and still verifies account", async () => {
  const prisma = fixture([row(legacy, { waIdCanonical: modern })]);
  assert.deepEqual(await resolveInboundConversationIdentity(prisma, {
    clientId: "tenant-1", waId: modern, provider: "web_session", channelAccountId: "web-account",
  }), { waId: legacy, reason: "resolved", conversationId: "conversation-1" });
  assert.equal((await resolveInboundConversationIdentity(prisma, {
    clientId: "tenant-1", waId: modern, provider: "web_session", channelAccountId: "other-account",
  })).reason, "unconfirmed_account");
});

test("tenant/account mismatch, ambiguity and anonymization never select a variant", async () => {
  const request = { clientId: "tenant-1", waId: legacy, provider: "web_session" as const, channelAccountId: "web-account" };
  assert.equal((await resolveInboundConversationIdentity(fixture([row(modern)]), { ...request, clientId: "tenant-2" })).reason, "unchanged");
  assert.equal((await resolveInboundConversationIdentity(fixture([row(modern)]), { ...request, channelAccountId: "other-web-account" })).reason, "unconfirmed_account");
  assert.equal((await resolveInboundConversationIdentity(fixture([row(modern, { phoneNumberId: "other-meta-phone" })]), request)).reason, "unconfirmed_account");
  assert.equal((await resolveInboundConversationIdentity(fixture([row(modern), row(modern, { id: "conversation-2" })]), request)).reason, "ambiguous");
  assert.equal((await resolveInboundConversationIdentity(fixture([row(modern, { anonymizedAt: new Date() })]), request)).reason, "unchanged");
});
