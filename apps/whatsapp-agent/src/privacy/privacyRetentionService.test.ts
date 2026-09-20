import test from "node:test";
import assert from "node:assert/strict";
import { runtimeStorage } from "../storage/runtimeStorage.js";
import {
  anonymizeDataSubject,
  executePrivacyRetention,
  findPrivacyConversationTarget,
  normalizeRetentionDays,
  previewDataSubjectAnonymization,
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

function makeSubjectPrivacyPrisma(params: {
  operationallyExcludedAt?: Date | null;
  alreadyAnonymized?: boolean;
  softDeletedConversation?: boolean;
  leadOnly?: boolean;
} = {}) {
  const subjectId = params.leadOnly ? "lead-1" : "contact-1";
  const contactWaId = params.alreadyAnonymized ? `anon:subject:${subjectId}` : "558499990001";
  const operationallyExcludedAt: Date | null = params.operationallyExcludedAt ?? null;
  const state = {
    contact: {
      id: "contact-1",
      clientId: "client-1",
      waId: contactWaId,
      name: "Maria Privacidade",
      channel: "whatsapp",
      provider: "meta",
      channelAccountId: "phone-1",
      externalUserHash: "whatsapp:oldhash",
      externalUserRef: "encrypted-ref",
      legacyWaId: "8499990001",
      operationallyExcludedAt,
    },
    identity: {
      id: "identity-1",
      contactId: params.leadOnly ? null : "contact-1",
      externalUserHash: "whatsapp:oldhash",
      legacyWaId: "558499990001",
      displayName: "Maria Privacidade",
    },
    lead: {
      id: "lead-1",
      waId: contactWaId,
      waIdCanonical: contactWaId,
      externalUserHash: params.alreadyAnonymized ? null : "whatsapp:oldhash",
      externalUserRef: "encrypted-ref",
      legacyWaId: "8499990001",
      contactChannelIdentityId: "identity-1",
      name: "Maria Privacidade",
      phone: contactWaId,
      email: "maria@example.test",
      company: "Empresa",
    },
    note: { id: "note-1", body: "observacao pessoal" },
    events: [] as Array<{ eventName: string; payloadJson: unknown; waId?: string | null; waIdCanonical?: string | null }>,
  };
  const prisma = {
    contact: {
      async findFirst({ where }: { where: { id: string; clientId: string } }) {
        if (params.leadOnly) return null;
        return where.id === state.contact.id && where.clientId === state.contact.clientId ? state.contact : null;
      },
      async updateMany({ data }: { data: Record<string, unknown> }) {
        if (params.leadOnly) return { count: 0 };
        Object.assign(state.contact, data);
        return { count: 1 };
      },
    },
    contactChannelIdentity: {
      async findMany() {
        return [{ id: state.identity.id, contactId: state.identity.contactId }];
      },
      async updateMany({ data }: { data: Record<string, unknown> }) {
        Object.assign(state.identity, data);
        return { count: 1 };
      },
    },
    lead: {
      async findFirst({ where }: { where: { id: string; tenantId: string } }) {
        return where.id === state.lead.id && where.tenantId === "client-1" ? state.lead : null;
      },
      async findMany() {
        return [{ id: state.lead.id }];
      },
      async updateMany({ data }: { data: Record<string, unknown> }) {
        Object.assign(state.lead, data);
        return { count: 1 };
      },
    },
    leadNote: {
      async findMany() {
        return [{ id: state.note.id }];
      },
      async updateMany({ data }: { data: { body: string } }) {
        state.note.body = data.body;
        return { count: 1 };
      },
    },
    conversation: {
      async findMany() {
        return params.softDeletedConversation
          ? [{
              id: "conversation-1",
              waId: "558499990001",
              waIdCanonical: "558499990001",
              channel: "whatsapp",
              provider: "meta",
              channelAccountId: "phone-1",
              externalUserHash: "whatsapp:oldhash",
              externalUserRef: null,
              legacyWaId: null,
              deletedAt: new Date("2026-09-20T10:00:00.000Z"),
              anonymizedAt: null,
            }]
          : [];
      },
    },
    conversationRuntimeState: {
      async findMany() {
        return [];
      },
    },
    inboundMessage: {
      async count() {
        return 0;
      },
      async updateMany() {
        return { count: 0 };
      },
    },
    outboundMessage: {
      async count() {
        return 2;
      },
      async updateMany() {
        return { count: 2 };
      },
    },
    event: {
      async count({ where }: { where?: { eventName?: { in?: string[] } } } = {}) {
        if (where?.eventName?.in?.includes("contact.opt_out.recorded")) return 1;
        return 3;
      },
      async updateMany({ data }: { data: Record<string, unknown> }) {
        state.events.push({ eventName: "event.updateMany", payloadJson: data.payloadJson, waId: data.waId as string, waIdCanonical: data.waIdCanonical as string });
        return { count: 3 };
      },
      async create({ data }: { data: { eventName: string; payloadJson: unknown; waId?: string | null; waIdCanonical?: string | null } }) {
        state.events.push(data);
        return {};
      },
    },
    contactConsent: {
      async count() {
        return 1;
      },
    },
    async $transaction(operations: Array<Promise<unknown>>) {
      return Promise.all(operations);
    },
  };
  return { prisma, state };
}

test("data subject preview is read-only for CRM-only contact", async () => {
  const { prisma, state } = makeSubjectPrivacyPrisma();
  const preview = await previewDataSubjectAnonymization(prisma as never, {
    clientId: "client-1",
    contactId: "contact-1",
  });

  assert.equal(preview.ok, true);
  assert.equal(preview.counts.contacts, 1);
  assert.equal(preview.counts.conversations, 0);
  assert.equal(preview.counts.leads, 1);
  assert.equal(preview.counts.leadNotes, 1);
  assert.equal(preview.counts.campaignRelationships, 2);
  assert.equal(preview.subject.operationalStatus, "active");
  assert.equal(preview.subject.privacyStatus, "identifiable");
  assert.equal(state.contact.name, "Maria Privacidade");
  assert.equal(state.note.body, "observacao pessoal");
});

test("data subject preview finds operationally excluded zero-conversation contact", async () => {
  const { prisma } = makeSubjectPrivacyPrisma({
    operationallyExcludedAt: new Date("2026-09-20T10:00:00.000Z"),
  });
  const preview = await previewDataSubjectAnonymization(prisma as never, {
    clientId: "client-1",
    contactId: "contact-1",
  });

  assert.equal(preview.ok, true);
  assert.equal(preview.counts.contacts, 1);
  assert.equal(preview.counts.conversations, 0);
  assert.equal(preview.subject.operationalStatus, "excluded");
  assert.equal(preview.subject.privacyStatus, "identifiable");
});

test("data subject preview finds subject with soft-deleted conversation", async () => {
  const { prisma } = makeSubjectPrivacyPrisma({
    operationallyExcludedAt: new Date("2026-09-20T10:00:00.000Z"),
    softDeletedConversation: true,
  });
  const preview = await previewDataSubjectAnonymization(prisma as never, {
    clientId: "client-1",
    contactId: "contact-1",
  });

  assert.equal(preview.ok, true);
  assert.equal(preview.counts.contacts, 1);
  assert.equal(preview.counts.conversations, 1);
  assert.equal(preview.subject.operationalStatus, "excluded");
  assert.equal(preview.subject.privacyStatus, "identifiable");
});

test("data subject preview supports lead-only subject without Contact or conversations", async () => {
  const { prisma, state } = makeSubjectPrivacyPrisma({ leadOnly: true });
  const preview = await previewDataSubjectAnonymization(prisma as never, {
    clientId: "client-1",
    leadId: "lead-1",
  });

  assert.equal(preview.ok, true);
  assert.equal(preview.subject.contactId, null);
  assert.equal(preview.subject.leadId, "lead-1");
  assert.deepEqual(preview.subject.leadIds, ["lead-1"]);
  assert.equal(preview.counts.contacts, 0);
  assert.equal(preview.counts.leads, 1);
  assert.equal(preview.counts.contactChannelIdentities, 1);
  assert.equal(preview.counts.conversations, 0);
  assert.equal(preview.subject.displayName, "Maria Privacidade");
  assert.equal(state.lead.name, "Maria Privacidade");
});

test("data subject preview denies cross-tenant or unknown lead-only subject", async () => {
  const { prisma } = makeSubjectPrivacyPrisma({ leadOnly: true });
  const preview = await previewDataSubjectAnonymization(prisma as never, {
    clientId: "client-1",
    leadId: "lead-foreign",
  });

  assert.deepEqual(preview, { ok: false, error: "subject_not_found" });
});

test("data subject anonymization handles zero-conversation subject without PII audit", async () => {
  const { prisma, state } = makeSubjectPrivacyPrisma();
  const result = await anonymizeDataSubject(prisma as never, {
    clientId: "client-1",
    clientKey: "tenant",
    contactId: "contact-1",
    actorId: "admin-1",
    requestId: "subject-anonymize",
    confirmation: "ANONIMIZAR TITULAR",
  });

  assert.equal(result.ok, true);
  assert.equal(state.contact.waId, "anon:subject:contact-1");
  assert.equal(state.contact.name, "Usuario Anonimizado");
  assert.equal(state.contact.externalUserHash, null);
  assert.ok(state.contact.operationallyExcludedAt instanceof Date);
  assert.equal(state.identity.contactId, null);
  assert.equal(state.identity.displayName, "Usuario Anonimizado");
  assert.equal(state.lead.waId, "anon:subject:contact-1");
  assert.equal(state.lead.contactChannelIdentityId, null);
  assert.equal(state.lead.email, null);
  assert.equal(state.note.body, "[nota anonimizada]");
  const audit = state.events.find((event) => event.eventName === "privacy.subject.anonymized");
  assert.ok(audit);
  assert.equal(JSON.stringify(audit).includes("Maria Privacidade"), false);
  assert.equal(JSON.stringify(audit).includes("558499990001"), false);
  assert.equal(JSON.stringify(audit).includes("observacao pessoal"), false);
});

test("data subject anonymization handles lead-only subject through shared identity primitive", async () => {
  const { prisma, state } = makeSubjectPrivacyPrisma({ leadOnly: true });
  const result = await anonymizeDataSubject(prisma as never, {
    clientId: "client-1",
    clientKey: "tenant",
    leadId: "lead-1",
    actorId: "admin-1",
    requestId: "subject-lead-only-anonymize",
    confirmation: "ANONIMIZAR TITULAR",
  });

  assert.equal(result.ok, true);
  assert.equal(state.contact.name, "Maria Privacidade");
  assert.equal(state.identity.contactId, null);
  assert.equal(state.identity.displayName, "Usuario Anonimizado");
  assert.equal(state.lead.waId, "anon:subject:lead-1");
  assert.equal(state.lead.contactChannelIdentityId, null);
  assert.equal(state.lead.email, null);
  assert.equal(state.note.body, "[nota anonimizada]");
  const audit = state.events.find((event) => event.eventName === "privacy.subject.anonymized");
  assert.ok(audit);
  assert.equal(JSON.stringify(audit).includes("Maria Privacidade"), false);
  assert.equal(JSON.stringify(audit).includes("558499990001"), false);
});

test("data subject anonymization handles operationally excluded zero-conversation subject", async () => {
  const { prisma, state } = makeSubjectPrivacyPrisma({
    operationallyExcludedAt: new Date("2026-09-20T10:00:00.000Z"),
  });
  const result = await anonymizeDataSubject(prisma as never, {
    clientId: "client-1",
    clientKey: "tenant",
    contactId: "contact-1",
    actorId: "admin-1",
    requestId: "subject-excluded-anonymize",
    confirmation: "ANONIMIZAR TITULAR",
  });

  assert.equal(result.ok, true);
  assert.equal(state.contact.waId, "anon:subject:contact-1");
  assert.equal(state.contact.name, "Usuario Anonimizado");
  assert.equal(state.note.body, "[nota anonimizada]");
});

test("data subject anonymization requires strong confirmation and is idempotent", async () => {
  const { prisma, state } = makeSubjectPrivacyPrisma();
  const denied = await anonymizeDataSubject(prisma as never, {
    clientId: "client-1",
    clientKey: "tenant",
    contactId: "contact-1",
    actorId: "admin-1",
    requestId: "subject-denied",
    confirmation: "ANONIMIZAR",
  });
  assert.deepEqual(denied, { ok: false, error: "confirmation_required" });

  await anonymizeDataSubject(prisma as never, {
    clientId: "client-1",
    clientKey: "tenant",
    contactId: "contact-1",
    actorId: "admin-1",
    requestId: "subject-first",
    confirmation: "ANONIMIZAR TITULAR",
  });
  const second = await anonymizeDataSubject(prisma as never, {
    clientId: "client-1",
    clientKey: "tenant",
    contactId: "contact-1",
    actorId: "admin-1",
    requestId: "subject-second",
    confirmation: "ANONIMIZAR TITULAR",
  });

  assert.equal(second.ok, true);
  assert.equal("alreadyAnonymized" in second && second.alreadyAnonymized, true);
  assert.equal(state.contact.waId, "anon:subject:contact-1");
});

test("data subject anonymization noops already anonymized subject", async () => {
  const { prisma, state } = makeSubjectPrivacyPrisma({ alreadyAnonymized: true });
  const result = await anonymizeDataSubject(prisma as never, {
    clientId: "client-1",
    clientKey: "tenant",
    contactId: "contact-1",
    actorId: "admin-1",
    requestId: "subject-already-anonymized",
    confirmation: "ANONIMIZAR TITULAR",
  });

  assert.equal(result.ok, true);
  assert.equal("alreadyAnonymized" in result && result.alreadyAnonymized, true);
  assert.equal(result.preview.subject.privacyStatus, "anonymized");
  assert.equal(state.contact.name, "Maria Privacidade");
});

test("data subject anonymization noops already anonymized lead-only subject", async () => {
  const { prisma, state } = makeSubjectPrivacyPrisma({ leadOnly: true, alreadyAnonymized: true });
  const result = await anonymizeDataSubject(prisma as never, {
    clientId: "client-1",
    clientKey: "tenant",
    leadId: "lead-1",
    actorId: "admin-1",
    requestId: "subject-lead-already-anonymized",
    confirmation: "ANONIMIZAR TITULAR",
  });

  assert.equal(result.ok, true);
  assert.equal("alreadyAnonymized" in result && result.alreadyAnonymized, true);
  assert.equal(result.preview.subject.privacyStatus, "anonymized");
  assert.equal(state.lead.name, "Maria Privacidade");
});
