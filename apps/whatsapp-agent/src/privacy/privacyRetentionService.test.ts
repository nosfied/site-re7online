import { env } from "../config/env.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPrivateCampaignSeedFields,
  readPrivateCampaignSeedFields,
} from "../campaigns/campaignSeedPrivacy.js";
import { runtimeStorage } from "../storage/runtimeStorage.js";
import {
  anonymizeDataSubject,
  executePrivacyRetention,
  findPrivacyConversationTarget,
  normalizeRetentionDays,
  previewDataSubjectAnonymization,
} from "./privacyRetentionService.js";

process.env.APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "privacy-retention-service-test-secret";

async function runFakeTransaction(self: unknown, input: Array<Promise<unknown>> | ((tx: unknown) => Promise<unknown>)) {
  if (typeof input === "function") return input(self);
  return Promise.all(input);
}

test("normalizeRetentionDays accepts configured bounds", () => {
  assert.equal(normalizeRetentionDays(1), 1);
  assert.equal(normalizeRetentionDays("90"), 90);
  assert.equal(normalizeRetentionDays(3650), 3650);
  assert.equal(normalizeRetentionDays(0), null);
  assert.equal(normalizeRetentionDays(3651), null);
  assert.equal(normalizeRetentionDays("invalid"), null);
});

test("executePrivacyRetention dry-run does not mutate retention targets", async () => {
  const beforeMode = env.STORAGE_MODE; env.STORAGE_MODE = "postgres";
  let mutationCalled = false;
  const prisma = {
    retentionConfig: {
      async findUnique() {
        return { retentionDays: 90 };
      },
    },
    conversation: {
      async findMany() {
        return [
          {
            id: "conversation-1", clientId: "client-1", channel: null, provider: null, channelAccountId: null, externalUserHash: null,
            createdAt: new Date("2020-01-01"), updatedAt: new Date("2020-01-01"), lastInboundAt: null, lastOutboundAt: null,
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
    conversationRuntimeState: { async findMany() { return [{
      id: "runtime-1", clientId: "client-1", waId: "558499999999", waIdCanonical: "558499999999",
      channel: null, provider: null, channelAccountId: null, externalUserHash: null,
      mode: "BOT", status: "CLOSED", handoffStatus: "NONE", assignedUserId: null,
      assignedTo: null, assignedAt: null, queueId: null, updatedAt: new Date("2020-01-01"),
      lastInboundAt: null, lastOutboundAt: null,
    }]; } },
    message: { async findFirst() { return null; } },
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
  env.STORAGE_MODE = beforeMode;
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
      async findMany() {
        return [{ id: "identity-1", contactId: "contact-1" }];
      },
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
    async $transaction(input: Array<Promise<unknown>> | ((tx: unknown) => Promise<unknown>)) {
      return runFakeTransaction(this, input);
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
      async findMany() {
        return [{ id: "identity-1", contactId: "contact-1" }];
      },
      async updateMany({ data }: { data: Record<string, unknown> }) {
        updatePayloads.push({ model: "contactChannelIdentity", data });
        assert.match(String(data.externalUserHash), /^anon:cci:[a-f0-9]{32}$/);
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
    async $transaction(input: Array<Promise<unknown>> | ((tx: unknown) => Promise<unknown>)) {
      return runFakeTransaction(this, input);
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
  multipleIdentities?: boolean;
  partialState?: boolean;
  failOnIdentityUpdate?: boolean;
  withCampaignSeed?: boolean;
} = {}) {
  const subjectId = params.leadOnly ? "lead-1" : "contact-1";
  const contactWaId = params.alreadyAnonymized ? `anon:subject:${subjectId}` : "558499990001";
  const operationallyExcludedAt: Date | null = params.operationallyExcludedAt ?? null;
  const identities = [
    {
      id: "identity-1",
      contactId: params.leadOnly || params.partialState ? null : "contact-1",
      externalUserHash: params.partialState ? "anon:conversation-1" : "whatsapp:oldhash",
      externalUserRef: params.partialState ? null : "558499990001",
      legacyWaId: params.partialState ? null : "558499990001",
      displayName: params.partialState ? "Usuario Anonimizado" : "Maria Privacidade",
    },
    ...(params.multipleIdentities || params.partialState
      ? [{
          id: "identity-2",
          contactId: params.leadOnly ? null : "contact-1",
          externalUserHash: "whatsapp:oldhash-2",
          externalUserRef: "8499990001",
          legacyWaId: "8499990001",
          displayName: "Maria Privacidade",
        }]
      : []),
  ];
  const campaignSeedPayload = params.withCampaignSeed
    ? {
        campaignId: "campaign-1",
        templateName: "data_exame",
        leadIds: ["lead-1", "lead-other"],
        ...buildPrivateCampaignSeedFields({
          clientId: "client-1",
          waIds: ["558499990001", "558400000002"],
          componentsByWaId: {
            "558499990001": [{ type: "body", parameters: [{ type: "text", text: "Maria" }] }],
            "558400000002": [{ type: "body", parameters: [{ type: "text", text: "Outro" }] }],
          },
        }),
      }
    : null;
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
    identities,
    identity: identities[0],
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
    events: [
      ...(campaignSeedPayload
        ? [{
            id: "seed-event-1",
            eventName: "campaign.seed.saved",
            payloadJson: campaignSeedPayload,
            messageId: "campaign-1",
          }]
        : []),
    ] as Array<{ id?: string; eventName: string; payloadJson: unknown; waId?: string | null; waIdCanonical?: string | null; messageId?: string | null }>,
    conversation: {
      id: "conversation-1",
      waId: params.partialState ? "anon:conversation-1" : "558499990001",
      waIdCanonical: params.partialState ? "anon:conversation-1" : "558499990001",
      channel: "whatsapp",
      provider: "meta",
      channelAccountId: "phone-1",
      externalUserHash: params.partialState ? null : "whatsapp:oldhash",
      externalUserRef: null,
      legacyWaId: null,
      deletedAt: params.softDeletedConversation || params.partialState ? new Date("2026-09-20T10:00:00.000Z") : null,
      anonymizedAt: params.partialState ? new Date("2026-09-20T10:00:00.000Z") : null,
    },
  };
  const restoreObject = (target: Record<string, unknown>, source: Record<string, unknown>) => {
    for (const key of Object.keys(target)) delete target[key];
    Object.assign(target, source);
  };
  const restoreState = (restored: typeof state) => {
    restoreObject(state.contact as unknown as Record<string, unknown>, restored.contact as unknown as Record<string, unknown>);
    state.identities.splice(0, state.identities.length, ...restored.identities);
    state.identity = state.identities[0];
    restoreObject(state.lead as unknown as Record<string, unknown>, restored.lead as unknown as Record<string, unknown>);
    restoreObject(state.note as unknown as Record<string, unknown>, restored.note as unknown as Record<string, unknown>);
    state.events.splice(0, state.events.length, ...restored.events);
    restoreObject(state.conversation as unknown as Record<string, unknown>, restored.conversation as unknown as Record<string, unknown>);
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
        return state.identities.map((identity) => ({ id: identity.id, contactId: identity.contactId }));
      },
      async updateMany({ where, data }: { where?: { id?: string }; data: Record<string, unknown> }) {
        const matches = state.identities.filter((identity) => !where?.id || identity.id === where.id);
        if (params.failOnIdentityUpdate) throw new Error("injected_identity_failure");
        for (const identity of matches) Object.assign(identity, data);
        return { count: matches.length };
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
      async updateMany({ data }: { data: Record<string, unknown> }) {
        Object.assign(state.conversation, data);
        return { count: 1 };
      },
      async findMany() {
        return params.softDeletedConversation || params.partialState
          ? [state.conversation]
          : [];
      },
    },
    conversationRuntimeState: {
      async findMany() {
        return [];
      },
      async updateMany() {
        return { count: 1 };
      },
    },
    message: {
      async updateMany() {
        return { count: 1 };
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
      async findMany({ where }: { where?: { eventName?: string | { in?: string[] } } } = {}) {
        const eventNames =
          typeof where?.eventName === "string"
            ? [where.eventName]
            : where?.eventName?.in ?? null;
        return eventNames
          ? state.events.filter((event) => eventNames.includes(event.eventName))
          : state.events;
      },
      async updateMany({ data }: { data: Record<string, unknown> }) {
        state.events.push({ eventName: "event.updateMany", payloadJson: data.payloadJson, waId: data.waId as string, waIdCanonical: data.waIdCanonical as string });
        return { count: 3 };
      },
      async update({ where, data }: { where: { id: string }; data: { payloadJson: unknown } }) {
        const event = state.events.find((item) => item.id === where.id);
        if (event) event.payloadJson = data.payloadJson;
        return event ?? {};
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
    async $transaction(input: Array<Promise<unknown>> | ((tx: unknown) => Promise<unknown>)) {
      if (typeof input !== "function") return Promise.all(input);
      const snapshot = structuredClone(state);
      try {
        return await input(this);
      } catch (error) {
        restoreState(snapshot);
        throw error;
      }
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

test("data subject anonymization rolls back conversation mutations when a later identity update fails", async () => {
  const deletedWaIds: string[] = [];
  const originalDeleteConversation = runtimeStorage.deleteConversation;
  runtimeStorage.deleteConversation = async (waId: string) => {
    deletedWaIds.push(waId);
  };
  const { prisma, state } = makeSubjectPrivacyPrisma({
    softDeletedConversation: true,
    failOnIdentityUpdate: true,
  });
  const originalConversation = { ...state.conversation };
  const originalContact = { ...state.contact };
  const originalIdentity = { ...state.identity };
  const originalLead = { ...state.lead };

  try {
    await assert.rejects(
      anonymizeDataSubject(prisma as never, {
        clientId: "client-1",
        clientKey: "tenant",
        contactId: "contact-1",
        actorId: "admin-1",
        requestId: "subject-late-failure",
        confirmation: "ANONIMIZAR TITULAR",
      }),
      /injected_identity_failure/
    );

    assert.deepEqual(state.conversation, originalConversation);
    assert.deepEqual(state.contact, originalContact);
    assert.deepEqual(state.identity, originalIdentity);
    assert.deepEqual(state.lead, originalLead);
    assert.equal(state.events.some((event) => event.eventName === "privacy.subject.anonymized"), false);
    assert.equal(state.events.some((event) => event.eventName === "conversation.anonymized"), false);
    assert.deepEqual(deletedWaIds, []);
  } finally {
    runtimeStorage.deleteConversation = originalDeleteConversation;
  }
});

test("data subject anonymization assigns unique deterministic hashes to multiple CCIs in the same tuple", async () => {
  const { prisma, state } = makeSubjectPrivacyPrisma({ multipleIdentities: true });
  const result = await anonymizeDataSubject(prisma as never, {
    clientId: "client-1",
    clientKey: "tenant",
    contactId: "contact-1",
    actorId: "admin-1",
    requestId: "subject-multiple-cci",
    confirmation: "ANONIMIZAR TITULAR",
  });

  assert.equal(result.ok, true);
  assert.equal(state.identities.length, 2);
  const hashes = state.identities.map((identity) => identity.externalUserHash);
  assert.equal(new Set(hashes).size, 2);
  for (const identity of state.identities) {
    assert.match(identity.externalUserHash, /^anon:cci:[a-f0-9]{32}$/);
    assert.equal(identity.externalUserRef, null);
    assert.equal(identity.legacyWaId, null);
    assert.equal(identity.contactId, null);
    assert.equal(identity.displayName, "Usuario Anonimizado");
    assert.equal(JSON.stringify(identity).includes("558499990001"), false);
  }
});

test("data subject anonymization converges production-like partial state without duplicate conversation event", async () => {
  const { prisma, state } = makeSubjectPrivacyPrisma({
    partialState: true,
    softDeletedConversation: true,
  });
  const result = await anonymizeDataSubject(prisma as never, {
    clientId: "client-1",
    clientKey: "tenant",
    contactId: "contact-1",
    actorId: "admin-1",
    requestId: "subject-partial-recovery",
    confirmation: "ANONIMIZAR TITULAR",
  });

  assert.equal(result.ok, true);
  assert.equal(state.contact.waId, "anon:subject:contact-1");
  assert.equal(state.lead.waId, "anon:subject:contact-1");
  assert.equal(state.conversation.waId, "anon:conversation-1");
  assert.equal(state.events.filter((event) => event.eventName === "conversation.anonymized").length, 0);
  assert.equal(state.events.filter((event) => event.eventName === "privacy.subject.anonymized").length, 1);
  assert.equal(new Set(state.identities.map((identity) => identity.externalUserHash)).size, state.identities.length);
  assert.equal(state.identities.every((identity) => identity.contactId === null), true);
});

test("data subject anonymization unlinks campaign seed so re-registering the same phone does not resurrect relationships", async () => {
  const { prisma, state } = makeSubjectPrivacyPrisma({ withCampaignSeed: true });
  const seedBefore = state.events.find((event) => event.eventName === "campaign.seed.saved");
  assert.ok(seedBefore);
  assert.deepEqual(readPrivateCampaignSeedFields(seedBefore.payloadJson).recipients, ["558499990001", "558400000002"]);

  const preview = await previewDataSubjectAnonymization(prisma as never, {
    clientId: "client-1",
    contactId: "contact-1",
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.counts.campaignRelationships, 3);

  const result = await anonymizeDataSubject(prisma as never, {
    clientId: "client-1",
    clientKey: "tenant",
    contactId: "contact-1",
    actorId: "admin-1",
    requestId: "subject-campaign-unlink",
    confirmation: "ANONIMIZAR TITULAR",
  });

  assert.equal(result.ok, true);
  const seedAfter = state.events.find((event) => event.id === "seed-event-1");
  assert.ok(seedAfter);
  assert.equal(seedAfter.messageId, "campaign-1");
  assert.equal(JSON.stringify(seedAfter.payloadJson).includes("558499990001"), false);
  assert.equal(JSON.stringify(seedAfter.payloadJson).includes("lead-1"), false);
  const privateSeed = readPrivateCampaignSeedFields(seedAfter.payloadJson);
  assert.deepEqual(privateSeed.recipients, ["558400000002"]);
  assert.deepEqual(privateSeed.componentsByWaId?.["558400000002"], [
    { type: "body", parameters: [{ type: "text", text: "Outro" }] },
  ]);
  assert.equal(privateSeed.componentsByWaId?.["558499990001"], undefined);
  assert.deepEqual((seedAfter.payloadJson as { leadIds?: string[] }).leadIds, ["lead-other"]);

  const reRegisteredIdentityCandidates = ["558499990001"];
  const wouldRelinkBySeedRecipient = privateSeed.recipients.some((recipient) => reRegisteredIdentityCandidates.includes(recipient));
  const wouldRelinkByLeadId = ((seedAfter.payloadJson as { leadIds?: string[] }).leadIds ?? []).includes("lead-new");
  assert.equal(wouldRelinkBySeedRecipient, false);
  assert.equal(wouldRelinkByLeadId, false);
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
