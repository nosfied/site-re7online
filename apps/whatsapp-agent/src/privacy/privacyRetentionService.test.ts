import test from "node:test";
import assert from "node:assert/strict";
import { runtimeStorage } from "../storage/runtimeStorage.js";
import {
  executePrivacyRetention,
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
    lead: {
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
