import test from "node:test";
import assert from "node:assert/strict";
import { runtimeStorage } from "../storage/runtimeStorage.js";
import {
  executePrivacyRetention,
  findPrivacyConversationTarget,
  normalizeRetentionDays,
} from "./privacyRetentionService.js";

test("normalizeRetentionDays accepts configured bounds", () => {
  assert.equal(normalizeRetentionDays(1), 1);
  assert.equal(normalizeRetentionDays("90"), 90);
  assert.equal(normalizeRetentionDays(3650), 3650);
  assert.equal(normalizeRetentionDays(0), null);
  assert.equal(normalizeRetentionDays(3651), null);
  assert.equal(normalizeRetentionDays("invalid"), null);
});

test("executePrivacyRetention dry-run does not mutate retention targets", async () => {
  let mutationCalled = false;
  const prisma = {
    retentionConfig: {
      async upsert() {
        return { retentionDays: 90 };
      },
    },
    conversation: {
      async findMany() {
        return [
          {
            id: "conversation-1",
            waId: "558499999999",
            waIdCanonical: "558499999999",
            deletedAt: null,
            anonymizedAt: null,
          },
        ];
      },
      async updateMany() {
        mutationCalled = true;
        return { count: 1 };
      },
    },
    event: {
      async create() {
        mutationCalled = true;
        return {};
      },
    },
  };

  const result = await executePrivacyRetention({
    prisma: prisma as never,
    clientId: "client-1",
    clientKey: "tenant",
    actorId: "system",
    requestId: "test-retention",
    action: "retention",
    dryRun: true,
  });

  assert.equal(mutationCalled, false);
  assert.equal(result.dryRun, true);
  assert.equal(result.anonymizedConversations, 1);
});

test("conversation anonymize deletes original and anonymized runtime states", async () => {
  const deletedWaIds: string[] = [];
  const originalDeleteConversation = runtimeStorage.deleteConversation;
  runtimeStorage.deleteConversation = async (waId: string) => {
    deletedWaIds.push(waId);
  };

  const prisma = {
    conversation: {
      async findFirst() {
        return {
          id: "12345678-1234-4234-9234-123456789abc",
          waId: "558499999999",
          waIdCanonical: "558499999999",
          deletedAt: null,
          anonymizedAt: null,
        };
      },
      async updateMany() {
        return { count: 1 };
      },
    },
    conversationRuntimeState: {
      async updateMany() {
        return { count: 1 };
      },
    },
    message: {
      async updateMany({ data }: { data: { bodyText: string } }) {
        assert.equal(data.bodyText, "[mensagem anonimizada]");
        return { count: 1 };
      },
    },
    inboundMessage: {
      async updateMany() {
        return { count: 1 };
      },
    },
    outboundMessage: {
      async updateMany() {
        return { count: 1 };
      },
    },
    contact: {
      async updateMany() {
        return { count: 1 };
      },
    },
    contactChannelIdentity: {
      async updateMany() {
        return { count: 1 };
      },
    },
    lead: {
      async findMany() {
        return [{ id: "lead-1" }];
      },
      async updateMany({ data }: { data: { email: null; company: null } }) {
        assert.equal(data.email, null);
        assert.equal(data.company, null);
        return { count: 1 };
      },
    },
    leadNote: {
      async updateMany({ data }: { data: { body: string } }) {
        assert.equal(data.body, "[nota anonimizada]");
        return { count: 1 };
      },
    },
    event: {
      async updateMany() {
        return { count: 1 };
      },
      async create() {
        return {};
      },
    },
    async $transaction(operations: Array<Promise<unknown>>) {
      return Promise.all(operations);
    },
  };

  try {
    const result = await executePrivacyRetention({
      prisma: prisma as never,
      clientId: "client-1",
      clientKey: "tenant",
      actorId: "admin",
      requestId: "test-anonymize",
      action: "conversation_anonymize",
      rawConversationId: "558499999999",
    });

    assert.equal(result.waId, "5584******9999:12345678");
    assert.deepEqual(deletedWaIds.sort(), ["558499999999", "5584******9999:12345678"].sort());
  } finally {
    runtimeStorage.deleteConversation = originalDeleteConversation;
  }
});

test("findPrivacyConversationTarget resolves synthetic messenger waId", async () => {
  let receivedWhere: unknown = null;
  const prisma = {
    conversation: {
      async findFirst(args: { where: unknown }) {
        receivedWhere = args.where;
        return {
          id: "12345678-1234-4234-9234-123456789abc",
          waId: "messenger:abcdefabcdef1234",
          waIdCanonical: "messenger:abcdefabcdef1234",
          channel: "messenger",
          provider: "meta",
          channelAccountId: "page-1",
          externalUserHash: "abcdefabcdef1234",
          externalUserRef: "encrypted-ref",
          legacyWaId: null,
          deletedAt: null,
          anonymizedAt: null,
        };
      },
    },
  };

  const target = await findPrivacyConversationTarget(
    prisma as never,
    "client-1",
    "messenger:ABCDEFABCDEF1234"
  );

  assert.equal(target?.waId, "messenger:abcdefabcdef1234");
  assert.deepEqual(receivedWhere, {
    clientId: "client-1",
    OR: [
      { waId: "messenger:abcdefabcdef1234" },
      { waIdCanonical: "messenger:abcdefabcdef1234" },
    ],
  });
});

test("conversation delete resolves synthetic messenger waId and closes runtime state", async () => {
  const deletedWaIds: string[] = [];
  const originalDeleteConversation = runtimeStorage.deleteConversation;
  runtimeStorage.deleteConversation = async (waId: string) => {
    deletedWaIds.push(waId);
  };

  const prisma = {
    conversation: {
      async findFirst() {
        return {
          id: "12345678-1234-4234-9234-123456789abc",
          waId: "messenger:abcdefabcdef1234",
          waIdCanonical: "messenger:abcdefabcdef1234",
          channel: "messenger",
          provider: "meta",
          channelAccountId: "page-1",
          externalUserHash: "abcdefabcdef1234",
          externalUserRef: "encrypted-ref",
          legacyWaId: null,
          deletedAt: null,
          anonymizedAt: null,
        };
      },
      async findMany() {
        return [
          {
            id: "12345678-1234-4234-9234-123456789abc",
            waId: "messenger:abcdefabcdef1234",
            waIdCanonical: "messenger:abcdefabcdef1234",
            deletedAt: null,
          },
        ];
      },
      async updateMany({ data }: { data: Record<string, unknown> }) {
        assert.ok(data.deletedAt);
        assert.equal(data.departmentId, null);
        return { count: 1 };
      },
    },
    conversationRuntimeState: {
      async updateMany({ data }: { data: Record<string, unknown> }) {
        assert.equal(data.status, "CLOSED");
        assert.equal(data.assignedUserId, null);
        assert.equal(data.mode, "BOT");
        return { count: 1 };
      },
    },
    event: {
      async create() {
        return {};
      },
    },
    async $transaction(callback: (tx: unknown) => Promise<unknown>) {
      return callback(this);
    },
  };

  try {
    const result = await executePrivacyRetention({
      prisma: prisma as never,
      clientId: "client-1",
      clientKey: "tenant",
      actorId: "admin",
      requestId: "test-delete-messenger",
      action: "conversation_delete",
      rawConversationId: "messenger:abcdefabcdef1234",
    });

    const deleted = result.deleted as { softDeletedConversations: number };
    assert.equal(deleted.softDeletedConversations, 1);
    assert.deepEqual(deletedWaIds, ["messenger:abcdefabcdef1234"]);
  } finally {
    runtimeStorage.deleteConversation = originalDeleteConversation;
  }
});

test("conversation anonymize clears multichannel identity for messenger records", async () => {
  const deletedWaIds: string[] = [];
  const updatePayloads: Record<string, unknown>[] = [];
  const originalDeleteConversation = runtimeStorage.deleteConversation;
  runtimeStorage.deleteConversation = async (waId: string) => {
    deletedWaIds.push(waId);
  };

  const prisma = {
    conversation: {
      async findFirst() {
        return {
          id: "12345678-1234-4234-9234-123456789abc",
          waId: "messenger:abcdefabcdef1234",
          waIdCanonical: "messenger:abcdefabcdef1234",
          channel: "messenger",
          provider: "meta",
          channelAccountId: "page-1",
          externalUserHash: "abcdefabcdef1234",
          externalUserRef: "encrypted-ref",
          legacyWaId: null,
          deletedAt: null,
          anonymizedAt: null,
        };
      },
      async updateMany({ data }: { data: Record<string, unknown> }) {
        updatePayloads.push({ model: "conversation", data });
        assert.equal(data.waId, "anon:12345678-123");
        assert.equal(data.externalUserHash, null);
        assert.equal(data.externalUserRef, null);
        return { count: 1 };
      },
    },
    conversationRuntimeState: {
      async updateMany({ data }: { data: Record<string, unknown> }) {
        updatePayloads.push({ model: "runtime", data });
        assert.equal(data.externalUserHash, null);
        assert.equal(data.externalUserRef, null);
        return { count: 1 };
      },
    },
    message: {
      async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        updatePayloads.push({ model: "message", data });
        assert.deepEqual(where, {
          conversation: { clientId: "client-1" },
          OR: [
            { conversationId: "12345678-1234-4234-9234-123456789abc" },
            { waId: { in: ["messenger:abcdefabcdef1234"] } },
          ],
        });
        assert.equal(data.bodyText, "[mensagem anonimizada]");
        assert.equal(data.metaMessageId, null);
        return { count: 1 };
      },
    },
    inboundMessage: {
      async updateMany({ data }: { data: Record<string, unknown> }) {
        updatePayloads.push({ model: "inbound", data });
        assert.equal(data.externalUserHash, null);
        assert.equal(data.externalUserRef, null);
        assert.equal(data.externalMessageId, null);
        return { count: 1 };
      },
    },
    outboundMessage: {
      async updateMany({ data }: { data: Record<string, unknown> }) {
        updatePayloads.push({ model: "outbound", data });
        assert.equal(data.externalUserHash, null);
        assert.equal(data.externalUserRef, null);
        assert.equal(data.externalMessageId, null);
        return { count: 1 };
      },
    },
    contact: {
      async updateMany({ data }: { data: Record<string, unknown> }) {
        updatePayloads.push({ model: "contact", data });
        assert.equal(data.externalUserHash, null);
        assert.equal(data.externalUserRef, null);
        return { count: 1 };
      },
    },
    contactChannelIdentity: {
      async updateMany({ data }: { data: Record<string, unknown> }) {
        updatePayloads.push({ model: "contactChannelIdentity", data });
        assert.equal(data.externalUserHash, "anon:12345678-123");
        assert.equal(data.externalUserRef, null);
        assert.equal(data.legacyWaId, null);
        assert.equal(data.contactId, null);
        return { count: 1 };
      },
    },
    lead: {
      async findMany() {
        return [{ id: "lead-1" }];
      },
      async updateMany({ data }: { data: Record<string, unknown> }) {
        updatePayloads.push({ model: "lead", data });
        assert.equal(data.externalUserHash, null);
        assert.equal(data.externalUserRef, null);
        assert.equal(data.contactChannelIdentityId, null);
        assert.equal(data.email, null);
        assert.equal(data.company, null);
        return { count: 1 };
      },
    },
    leadNote: {
      async updateMany() {
        return { count: 1 };
      },
    },
    event: {
      async updateMany({ data }: { data: Record<string, unknown> }) {
        assert.deepEqual(data.payloadJson, { anonymized: true, reason: "conversation_anonymized" });
        return { count: 1 };
      },
      async create() {
        return {};
      },
    },
    async $transaction(operations: Array<Promise<unknown>>) {
      return Promise.all(operations);
    },
  };

  try {
    const result = await executePrivacyRetention({
      prisma: prisma as never,
      clientId: "client-1",
      clientKey: "tenant",
      actorId: "admin",
      requestId: "test-anonymize-messenger",
      action: "conversation_anonymize",
      rawConversationId: "messenger:abcdefabcdef1234",
    });

    assert.equal(result.waId, "anon:12345678-123");
    assert.deepEqual(deletedWaIds.sort(), ["anon:12345678-123", "messenger:abcdefabcdef1234"].sort());
    assert.deepEqual(
      updatePayloads.map((item) => item.model).sort(),
      [
        "contact",
        "contactChannelIdentity",
        "conversation",
        "inbound",
        "lead",
        "message",
        "outbound",
        "runtime",
      ].sort()
    );
  } finally {
    runtimeStorage.deleteConversation = originalDeleteConversation;
  }
});
