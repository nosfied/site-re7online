import { ConversationOperationalStatus, Prisma } from "@prisma/client";
import { normalizeWaId } from "../config/env.js";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";
import { runtimeStorage } from "../storage/runtimeStorage.js";
import { canonicalizeBrazilWaId, normalizeWaIdDigits } from "../utils/waid.js";
import {
  buildCrmWhatsappExternalUserHash,
  buildCrmWhatsappIdentityCandidates,
} from "../crm/crmWhatsappIdentity.js";

export const IMMUTABLE_PRIVACY_AUDIT_EVENTS = [
  "conversation.deleted",
  "conversation.anonymized",
  "retention.executed",
  "conversation.reactivated_after_retention",
] as const;

export type PrivacyRetentionAction = "conversation_delete" | "conversation_anonymize" | "retention";

export const DATA_SUBJECT_ANONYMIZED_EVENT = "privacy.subject.anonymized";
export const ANONYMIZED_SUBJECT_NAME = "Usuario Anonimizado";
export const ANONYMIZED_LEAD_NOTE_BODY = "[nota anonimizada]";

export type PrivacyConversationTarget = {
  id: string;
  waId: string;
  waIdCanonical: string | null;
  channel?: string | null;
  provider?: string | null;
  channelAccountId?: string | null;
  externalUserHash?: string | null;
  externalUserRef?: string | null;
  legacyWaId?: string | null;
  deletedAt?: Date | null;
  anonymizedAt?: Date | null;
};

type PrismaClientLike = ReturnType<typeof getPrisma>;

type DataSubjectGraph = {
  subjectId: string;
  contact: {
    id: string;
    waId: string;
    name: string | null;
    channel?: string | null;
    provider?: string | null;
    channelAccountId?: string | null;
    externalUserHash?: string | null;
    externalUserRef?: string | null;
    legacyWaId?: string | null;
    operationallyExcludedAt?: Date | null;
  } | null;
  subjectLead: {
    id: string;
    waId: string | null;
    waIdCanonical: string | null;
    phone: string | null;
    name: string | null;
    externalUserHash?: string | null;
    externalUserRef?: string | null;
    legacyWaId?: string | null;
    contactChannelIdentityId?: string | null;
  } | null;
  contactIds: string[];
  identityKeys: string[];
  externalUserHashes: string[];
  identities: Array<{ id: string; contactId: string | null }>;
  leads: Array<{ id: string }>;
  leadNotes: Array<{ id: string }>;
  conversations: Array<PrivacyConversationTarget>;
  runtimeStates: Array<{ id: string }>;
  inboundMessages: number;
  outboundMessages: number;
  events: number;
  consentRecords: number;
  optOutEvents: number;
  campaignSeedEvents: number;
  campaignOutboundMessages: number;
};

export type DataSubjectPrivacyPreview = {
  ok: true;
  subject: {
    contactId: string | null;
    leadId: string | null;
    leadIds: string[];
    alreadyAnonymized: boolean;
    operationalStatus: "active" | "excluded";
    privacyStatus: "identifiable" | "anonymized";
    displayName: string | null;
    phoneDisplay: string | null;
  };
  counts: {
    contacts: number;
    leads: number;
    contactChannelIdentities: number;
    conversations: number;
    runtimeStates: number;
    leadNotes: number;
    inboundMessages: number;
    outboundMessages: number;
    events: number;
    consentRecords: number;
    optOutEvents: number;
    campaignRelationships: number;
  };
  actions: Array<{ entity: string; count: number; action: string }>;
  fieldsToAnonymize: string[];
  historicalObjectsPreserved: string[];
};

type ExecutePrivacyRetentionParams = {
  prisma: PrismaClientLike;
  clientId: string;
  clientKey: string;
  actorId: string;
  requestId: string;
  action: PrivacyRetentionAction;
  rawConversationId?: string;
  reason?: string;
  dryRun?: boolean;
};

export function normalizeRetentionDays(value: unknown) {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 3650) return null;
  return days;
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function maskPersonalWaId(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  const synthetic = raw.match(/^(messenger|instagram):/i);
  if (synthetic) return `${synthetic[1].toLowerCase()}:******`;
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}******${digits.slice(-4)}`;
  }
  if (raw.length <= 4) return "******";
  return `${raw.slice(0, 2)}******${raw.slice(-2)}`;
}

function buildAnonymizedWaId(target: PrivacyConversationTarget) {
  if (/^(messenger|instagram):[a-f0-9]{16,64}$/i.test(target.waId)) {
    return `anon:${target.id.slice(0, 12)}`;
  }
  const masked = maskPersonalWaId(target.waId);
  return masked.includes("*") ? `${masked}:${target.id.slice(0, 8)}` : `anon:${target.id.slice(0, 12)}`;
}

function buildAnonymizedExternalUserHash(target: PrivacyConversationTarget) {
  return `anon:${target.id.slice(0, 12)}`;
}

function buildAnonymizedSubjectWaId(subjectId: string) {
  return `anon:subject:${subjectId.slice(0, 12)}`;
}

function buildAnonymizedSubjectExternalUserHash(subjectId: string) {
  return `anon:subject:${subjectId.slice(0, 12)}`;
}

function isAnonymizedSubjectValue(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.startsWith("anon:");
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function buildPrivacyIdentityKeys(values: Array<string | null | undefined>) {
  return uniqueStrings(values.flatMap((value) => [value, ...buildCrmWhatsappIdentityCandidates([value])]));
}

function buildPrivacyAuditPayload(params: {
  userId: string;
  clientId: string;
  conversationId?: string | null;
  action: string;
  details?: Record<string, unknown>;
}) {
  return {
    userId: params.userId,
    clientId: params.clientId,
    conversationId: params.conversationId ?? null,
    timestamp: new Date().toISOString(),
    action: params.action,
    ...(params.details ? { details: params.details } : {}),
  };
}

async function persistPrivacyAuditEvent(
  prisma: PrismaClientLike,
  params: {
    clientId: string;
    conversationId?: string | null;
    waId?: string | null;
    waIdCanonical?: string | null;
    requestId: string;
    eventName: "conversation.deleted" | "conversation.anonymized" | "retention.executed";
    payload: Prisma.InputJsonValue;
  }
) {
  await prisma.event.create({
    data: {
      clientId: params.clientId,
      conversationId: params.conversationId ?? null,
      waId: params.waId ?? null,
      waIdCanonical: params.waIdCanonical ?? null,
      requestId: `${params.requestId}:${params.eventName}`,
      eventName: params.eventName,
      payloadJson: params.payload,
    },
  });
}

function buildSubjectIdentityAnonymizationOperations(
  prisma: PrismaClientLike | Prisma.TransactionClient,
  params: {
    clientId: string;
    contactIds: string[];
    identityIds: string[];
    leadIds: string[];
    leadNoteIds: string[];
    waIds: string[];
    externalUserHashes: string[];
    anonymizedWaId: string;
    anonymizedExternalUserHash: string;
    now: Date;
    eventConversationId?: string | null;
    eventReason: string;
  }
) {
  const identitySelector = {
    OR: [
      ...(params.waIds.length > 0 ? [{ waId: { in: params.waIds } }, { waIdCanonical: { in: params.waIds } }] : []),
      ...(params.externalUserHashes.length > 0 ? [{ externalUserHash: { in: params.externalUserHashes } }] : []),
    ],
  };
  return [
    prisma.contact.updateMany({
      where: {
        clientId: params.clientId,
        OR: [
          ...(params.contactIds.length > 0 ? [{ id: { in: params.contactIds } }] : []),
          ...(params.waIds.length > 0 ? [{ waId: { in: params.waIds } }] : []),
        ],
      },
      data: {
        waId: params.anonymizedWaId,
        name: ANONYMIZED_SUBJECT_NAME,
        externalUserHash: null,
        externalUserRef: null,
        legacyWaId: null,
        operationallyExcludedAt: params.now,
      },
    }),
    prisma.contactChannelIdentity.updateMany({
      where: {
        clientId: params.clientId,
        OR: [
          ...(params.identityIds.length > 0 ? [{ id: { in: params.identityIds } }] : []),
          ...(params.waIds.length > 0 ? [{ legacyWaId: { in: params.waIds } }] : []),
          ...(params.externalUserHashes.length > 0 ? [{ externalUserHash: { in: params.externalUserHashes } }] : []),
        ],
      },
      data: {
        externalUserHash: params.anonymizedExternalUserHash,
        externalUserRef: null,
        legacyWaId: null,
        displayName: ANONYMIZED_SUBJECT_NAME,
        contactId: null,
      },
    }),
    prisma.lead.updateMany({
      where: {
        tenantId: params.clientId,
        OR: [
          ...(params.leadIds.length > 0 ? [{ id: { in: params.leadIds } }] : []),
          ...(identitySelector.OR.length > 0 ? identitySelector.OR : []),
        ],
      },
      data: {
        waId: params.anonymizedWaId,
        waIdCanonical: params.anonymizedWaId,
        externalUserHash: null,
        externalUserRef: null,
        legacyWaId: null,
        contactChannelIdentityId: null,
        name: ANONYMIZED_SUBJECT_NAME,
        phone: params.anonymizedWaId,
        city: null,
        service: null,
        email: null,
        company: null,
      },
    }),
    prisma.leadNote.updateMany({
      where: {
        tenantId: params.clientId,
        OR: [
          ...(params.leadNoteIds.length > 0 ? [{ id: { in: params.leadNoteIds } }] : []),
          ...(params.leadIds.length > 0 ? [{ leadId: { in: params.leadIds } }] : []),
        ],
      },
      data: { body: ANONYMIZED_LEAD_NOTE_BODY },
    }),
    prisma.outboundMessage.updateMany({
      where: { clientId: params.clientId, ...(identitySelector.OR.length > 0 ? identitySelector : { id: "__none__" }) },
      data: {
        waId: params.anonymizedWaId,
        waIdCanonical: params.anonymizedWaId,
        externalUserHash: null,
        externalUserRef: null,
        externalMessageId: null,
        legacyWaId: null,
        bodyText: "[mensagem anonimizada]",
        errorBody: null,
        rawPayload: Prisma.JsonNull,
      },
    }),
    prisma.event.updateMany({
      where: {
        clientId: params.clientId,
        eventName: { notIn: [...IMMUTABLE_PRIVACY_AUDIT_EVENTS, DATA_SUBJECT_ANONYMIZED_EVENT] },
        OR: [
          ...(params.eventConversationId ? [{ conversationId: params.eventConversationId }] : []),
          ...(params.waIds.length > 0 ? [{ waId: { in: params.waIds } }, { waIdCanonical: { in: params.waIds } }] : []),
        ],
      },
      data: {
        waId: params.anonymizedWaId,
        waIdCanonical: params.anonymizedWaId,
        payloadJson: { anonymized: true, reason: params.eventReason },
      },
    }),
  ];
}

export async function getOrCreateRetentionConfig(prisma: PrismaClientLike, clientId: string) {
  return prisma.retentionConfig.upsert({
    where: { clientId },
    update: {},
    create: { clientId, retentionDays: 90 },
  });
}

async function resolveDataSubjectGraph(
  prisma: PrismaClientLike,
  params: { clientId: string; contactId?: string | null; leadId?: string | null }
): Promise<DataSubjectGraph | null> {
  const contactSelect = {
    id: true,
    waId: true,
    name: true,
    channel: true,
    provider: true,
    channelAccountId: true,
    externalUserHash: true,
    externalUserRef: true,
    legacyWaId: true,
    operationallyExcludedAt: true,
  } as const;
  const leadSelect = {
    id: true,
    waId: true,
    waIdCanonical: true,
    phone: true,
    name: true,
    externalUserHash: true,
    externalUserRef: true,
    legacyWaId: true,
    contactChannelIdentityId: true,
  } as const;
  let contact = params.contactId
    ? await prisma.contact.findFirst({
        where: { id: params.contactId, clientId: params.clientId },
        select: contactSelect,
      })
    : null;
  let subjectLead = params.leadId
    ? await prisma.lead.findFirst({
        where: { id: params.leadId, tenantId: params.clientId },
        select: leadSelect,
      })
    : null;
  if (!contact && !subjectLead) return null;

  const seedIdentityKeys = buildPrivacyIdentityKeys([
    contact?.waId,
    contact?.externalUserRef,
    contact?.legacyWaId,
    subjectLead?.waId,
    subjectLead?.waIdCanonical,
    subjectLead?.phone,
    subjectLead?.externalUserRef,
    subjectLead?.legacyWaId,
  ]);
  const externalUserHashes = uniqueStrings([
    contact?.externalUserHash,
    subjectLead?.externalUserHash,
    ...seedIdentityKeys.map((key) => buildCrmWhatsappExternalUserHash(key)),
  ]);
  const identityFilters = [
    ...(contact ? [{ contactId: contact.id }] : []),
    ...(subjectLead?.contactChannelIdentityId ? [{ id: subjectLead.contactChannelIdentityId }] : []),
    ...(seedIdentityKeys.length > 0 ? [{ legacyWaId: { in: seedIdentityKeys } }] : []),
    ...(externalUserHashes.length > 0 ? [{ externalUserHash: { in: externalUserHashes } }] : []),
  ];
  const identities = identityFilters.length
    ? await prisma.contactChannelIdentity.findMany({
        where: { clientId: params.clientId, OR: identityFilters },
        select: { id: true, contactId: true },
      })
    : [];
  const identityContactIds = uniqueStrings(identities.map((identity) => identity.contactId));
  const resolvedContactId = contact?.id ?? null;
  if (resolvedContactId && identityContactIds.some((contactId) => contactId !== resolvedContactId)) {
    throw new Error("ambiguous_subject_identity");
  }
  if (!contact && identityContactIds.length > 1) throw new Error("ambiguous_subject_identity");
  if (!contact && identityContactIds.length === 1) {
    contact = await prisma.contact.findFirst({
      where: { id: identityContactIds[0], clientId: params.clientId },
      select: contactSelect,
    });
    if (!contact) throw new Error("ambiguous_subject_identity");
  }
  const identityKeys = buildPrivacyIdentityKeys([
    ...seedIdentityKeys,
    contact?.waId,
    contact?.externalUserRef,
    contact?.legacyWaId,
  ]);
  const identityIds = identities.map((identity) => identity.id);
  const leads = await prisma.lead.findMany({
    where: {
      tenantId: params.clientId,
      OR: [
        ...(subjectLead ? [{ id: subjectLead.id }] : []),
        ...(identityKeys.length > 0 ? [{ waId: { in: identityKeys } }, { waIdCanonical: { in: identityKeys } }] : []),
        ...(externalUserHashes.length > 0 ? [{ externalUserHash: { in: externalUserHashes } }] : []),
        ...(identityIds.length > 0 ? [{ contactChannelIdentityId: { in: identityIds } }] : []),
      ],
    },
    select: { id: true },
  });
  const leadIds = leads.map((lead) => lead.id);
  const [leadNotes, conversations, runtimeStates, inboundMessages, outboundMessages, events, consentRecords, optOutEvents] =
    await Promise.all([
      leadIds.length
        ? prisma.leadNote.findMany({ where: { tenantId: params.clientId, leadId: { in: leadIds } }, select: { id: true } })
        : Promise.resolve([]),
      prisma.conversation.findMany({
        where: {
          clientId: params.clientId,
          OR: [
            ...(identityKeys.length > 0 ? [{ waId: { in: identityKeys } }, { waIdCanonical: { in: identityKeys } }] : []),
            ...(externalUserHashes.length > 0 ? [{ externalUserHash: { in: externalUserHashes } }] : []),
          ],
        },
        select: {
          id: true,
          waId: true,
          waIdCanonical: true,
          channel: true,
          provider: true,
          channelAccountId: true,
          externalUserHash: true,
          externalUserRef: true,
          legacyWaId: true,
          deletedAt: true,
          anonymizedAt: true,
        },
      }),
      prisma.conversationRuntimeState.findMany({
        where: {
          clientId: params.clientId,
          OR: [
            ...(identityKeys.length > 0 ? [{ waId: { in: identityKeys } }, { waIdCanonical: { in: identityKeys } }] : []),
            ...(externalUserHashes.length > 0 ? [{ externalUserHash: { in: externalUserHashes } }] : []),
          ],
        },
        select: { id: true },
      }),
      prisma.inboundMessage.count({
        where: {
          clientId: params.clientId,
          OR: [
            ...(identityKeys.length > 0 ? [{ waId: { in: identityKeys } }, { waIdCanonical: { in: identityKeys } }] : []),
            ...(externalUserHashes.length > 0 ? [{ externalUserHash: { in: externalUserHashes } }] : []),
          ],
        },
      }),
      prisma.outboundMessage.count({
        where: {
          clientId: params.clientId,
          OR: [
            ...(identityKeys.length > 0 ? [{ waId: { in: identityKeys } }, { waIdCanonical: { in: identityKeys } }] : []),
            ...(externalUserHashes.length > 0 ? [{ externalUserHash: { in: externalUserHashes } }] : []),
          ],
        },
      }),
      prisma.event.count({
        where: {
          clientId: params.clientId,
          OR: [
            ...(identityKeys.length > 0 ? [{ waId: { in: identityKeys } }, { waIdCanonical: { in: identityKeys } }] : []),
          ],
        },
      }),
      prisma.contactConsent.count({
        where: {
          clientId: params.clientId,
          OR: [
            ...(contact ? [{ contactId: contact.id }] : []),
            ...(leadIds.length > 0 ? [{ leadId: { in: leadIds } }] : []),
          ],
        },
      }),
      prisma.event.count({
        where: {
          clientId: params.clientId,
          eventName: { in: ["contact.opt_out.recorded", "contact.opt_out.revoked"] },
          OR: identityKeys.length > 0 ? [{ waIdCanonical: { in: identityKeys } }, { waId: { in: identityKeys } }] : undefined,
        },
      }),
    ]);
  return {
    subjectId: contact?.id ?? subjectLead?.id ?? leadIds[0] ?? "",
    contact,
    subjectLead,
    contactIds: contact ? [contact.id] : [],
    identityKeys,
    externalUserHashes,
    identities,
    leads,
    leadNotes,
    conversations,
    runtimeStates,
    inboundMessages,
    outboundMessages,
    events,
    consentRecords,
    optOutEvents,
    campaignSeedEvents: 0,
    campaignOutboundMessages: outboundMessages,
  };
}

function buildDataSubjectPreview(graph: DataSubjectGraph): DataSubjectPrivacyPreview {
  const subjectWaId = graph.contact?.waId ?? graph.subjectLead?.waIdCanonical ?? graph.subjectLead?.waId ?? graph.subjectLead?.phone ?? null;
  const alreadyAnonymized = isAnonymizedSubjectValue(subjectWaId);
  const phoneDisplay = subjectWaId ? normalizeWaIdDigits(subjectWaId) || null : null;
  return {
    ok: true,
    subject: {
      contactId: graph.contact?.id ?? null,
      leadId: graph.subjectLead?.id ?? graph.leads[0]?.id ?? null,
      leadIds: graph.leads.map((lead) => lead.id),
      alreadyAnonymized,
      operationalStatus: graph.contact?.operationallyExcludedAt || alreadyAnonymized ? "excluded" : "active",
      privacyStatus: alreadyAnonymized ? "anonymized" : "identifiable",
      displayName: graph.contact?.name ?? graph.subjectLead?.name ?? null,
      phoneDisplay,
    },
    counts: {
      contacts: graph.contactIds.length,
      leads: graph.leads.length,
      contactChannelIdentities: graph.identities.length,
      conversations: graph.conversations.length,
      runtimeStates: graph.runtimeStates.length,
      leadNotes: graph.leadNotes.length,
      inboundMessages: graph.inboundMessages,
      outboundMessages: graph.outboundMessages,
      events: graph.events,
      consentRecords: graph.consentRecords,
      optOutEvents: graph.optOutEvents,
      campaignRelationships: graph.campaignOutboundMessages,
    },
    actions: [
      { entity: "Contato", count: graph.contactIds.length, action: alreadyAnonymized ? "Ja anonimizado" : "Anonimizar" },
      { entity: "Leads", count: graph.leads.length, action: "Anonimizar dados pessoais" },
      { entity: "Identidades", count: graph.identities.length, action: "Anonimizar e desvincular" },
      { entity: "Conversas", count: graph.conversations.length, action: graph.conversations.length ? "Anonimizar" : "Sem conversas" },
      { entity: "Notas", count: graph.leadNotes.length, action: "Anonimizar conteudo" },
      { entity: "Campanhas/outbound", count: graph.campaignOutboundMessages, action: "Preservar historico sem PII" },
      { entity: "Consentimento/opt-out", count: graph.consentRecords + graph.optOutEvents, action: "Preservar evidencia sem PII" },
    ],
    fieldsToAnonymize: [
      "nome",
      "telefone/waId",
      "referencias externas",
      "displayName",
      "conteudo de notas",
      "conteudo de mensagens quando vinculado ao titular",
    ],
    historicalObjectsPreserved: [
      "campanhas",
      "contadores de campanha",
      "eventos de auditoria sem PII",
      "historico financeiro sem recalculo",
    ],
  };
}

export async function previewDataSubjectAnonymization(
  prisma: PrismaClientLike,
  params: { clientId: string; contactId?: string | null; leadId?: string | null }
) {
  const graph = await resolveDataSubjectGraph(prisma, params);
  if (!graph) return { ok: false as const, error: "subject_not_found" as const };
  return buildDataSubjectPreview(graph);
}

export async function anonymizeDataSubject(
  prisma: PrismaClientLike,
  params: {
    clientId: string;
    clientKey: string;
    contactId?: string | null;
    leadId?: string | null;
    actorId: string;
    requestId: string;
    confirmation: string;
    dryRun?: boolean;
  }
) {
  if (params.confirmation !== "ANONIMIZAR TITULAR") {
    return { ok: false as const, error: "confirmation_required" as const };
  }
  const graph = await resolveDataSubjectGraph(prisma, params);
  if (!graph) return { ok: false as const, error: "subject_not_found" as const };
  const preview = buildDataSubjectPreview(graph);
  if (params.dryRun) return { ok: true as const, preview, dryRun: true as const };
  if (preview.subject.alreadyAnonymized) {
    await persistPrivacyAuditEvent(prisma, {
      clientId: params.clientId,
      requestId: `${params.requestId}:${DATA_SUBJECT_ANONYMIZED_EVENT}:noop`,
      eventName: "retention.executed",
      payload: buildPrivacyAuditPayload({
        userId: params.actorId,
        clientId: params.clientId,
        action: DATA_SUBJECT_ANONYMIZED_EVENT,
        details: {
          result: "already_anonymized",
          contactId: graph.contact?.id ?? null,
          leadId: graph.subjectLead?.id ?? null,
          counts: preview.counts,
        },
      }) as Prisma.InputJsonValue,
    });
    return { ok: true as const, alreadyAnonymized: true as const, preview };
  }

  for (const conversation of graph.conversations) {
    if (conversation.anonymizedAt) continue;
    await anonymizeConversationPrivacyData(prisma, {
      clientId: params.clientId,
      clientKey: params.clientKey,
      conversation,
      userId: params.actorId,
      requestId: `${params.requestId}:conversation:${conversation.id}`,
    });
  }

  const now = new Date();
  const anonymizedWaId = buildAnonymizedSubjectWaId(graph.subjectId);
  const anonymizedExternalUserHash = buildAnonymizedSubjectExternalUserHash(graph.subjectId);
  const identityIds = graph.identities.map((identity) => identity.id);
  const leadIds = graph.leads.map((lead) => lead.id);
  const leadNoteIds = graph.leadNotes.map((note) => note.id);
  const [contacts, contactChannelIdentities, leads, leadNotes, outboundMessages, events, inboundMessages] =
    await prisma.$transaction([
      ...buildSubjectIdentityAnonymizationOperations(prisma, {
        clientId: params.clientId,
        contactIds: graph.contactIds,
        identityIds,
        leadIds,
        leadNoteIds,
        waIds: graph.identityKeys,
        externalUserHashes: graph.externalUserHashes,
        anonymizedWaId,
        anonymizedExternalUserHash,
        now,
        eventConversationId: null,
        eventReason: "privacy_subject_anonymized",
      }),
      prisma.inboundMessage.updateMany({
        where: {
          clientId: params.clientId,
          OR: [
            ...(graph.identityKeys.length > 0 ? [{ waId: { in: graph.identityKeys } }, { waIdCanonical: { in: graph.identityKeys } }] : []),
            ...(graph.externalUserHashes.length > 0 ? [{ externalUserHash: { in: graph.externalUserHashes } }] : []),
          ],
        },
        data: {
          waId: anonymizedWaId,
          waIdCanonical: anonymizedWaId,
          externalUserHash: null,
          externalUserRef: null,
          externalMessageId: null,
          legacyWaId: null,
          bodyText: "[mensagem anonimizada]",
          rawPayload: Prisma.JsonNull,
        },
      }),
    ]);

  for (const key of Array.from(new Set([...graph.identityKeys, anonymizedWaId]))) {
    await runtimeStorage.deleteConversation(key, params.clientKey);
  }

  const resultCounts = {
    contacts: contacts.count,
    contactChannelIdentities: contactChannelIdentities.count,
    leads: leads.count,
    leadNotes: leadNotes.count,
    outboundMessages: outboundMessages.count,
    inboundMessages: inboundMessages.count,
    events: events.count,
    conversations: graph.conversations.length,
  };
  await prisma.event.create({
    data: {
      clientId: params.clientId,
      requestId: `${params.requestId}:${DATA_SUBJECT_ANONYMIZED_EVENT}`,
      eventName: DATA_SUBJECT_ANONYMIZED_EVENT,
      payloadJson: {
        userId: params.actorId,
        clientId: params.clientId,
        contactId: graph.contact?.id ?? null,
        leadId: graph.subjectLead?.id ?? null,
        leadIds,
        identityIds,
        timestamp: new Date().toISOString(),
        result: "anonymized",
        counts: resultCounts,
      },
    },
  });
  logger.info({
    event: DATA_SUBJECT_ANONYMIZED_EVENT,
    clientId: params.clientId,
    contactId: graph.contact?.id ?? null,
    leadId: graph.subjectLead?.id ?? null,
    counts: resultCounts,
  });
  return { ok: true as const, preview, anonymized: resultCounts };
}

export async function findPrivacyConversationTarget(
  prisma: PrismaClientLike,
  clientId: string,
  rawConversationId: string
): Promise<PrivacyConversationTarget | null> {
  if (!rawConversationId) return null;
  const exactRaw = rawConversationId.trim();
  const syntheticRaw = /^(messenger|instagram):[a-f0-9]{16,64}$/i.test(exactRaw) ? exactRaw.toLowerCase() : null;
  const normalizedWaId = syntheticRaw ? "" : normalizeWaId(exactRaw);
  const idLookup = isUuidLike(exactRaw) ? [{ id: exactRaw }] : [];
  const exactLookup = exactRaw
    ? [
        { waId: syntheticRaw ?? exactRaw },
        { waIdCanonical: syntheticRaw ?? exactRaw },
      ]
    : [];
  const waIdLookup = normalizedWaId
    ? [
        { waId: normalizedWaId },
        { waIdCanonical: canonicalizeBrazilWaId(normalizedWaId) },
      ]
    : [];
  return prisma.conversation.findFirst({
    where: {
      clientId,
      OR: [...idLookup, ...exactLookup, ...waIdLookup],
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      waId: true,
      waIdCanonical: true,
      channel: true,
      provider: true,
      channelAccountId: true,
      externalUserHash: true,
      externalUserRef: true,
      legacyWaId: true,
      deletedAt: true,
      anonymizedAt: true,
    },
  });
}

function buildConversationPrivacyWhere(target: PrivacyConversationTarget) {
  const values = Array.from(new Set([target.waId, target.waIdCanonical].filter(Boolean))) as string[];
  return {
    OR: [
      { waId: { in: values } },
      { waIdCanonical: { in: values } },
    ],
  };
}

async function deleteConversationPrivacyData(
  prisma: PrismaClientLike,
  params: {
    clientId: string;
    clientKey: string;
    conversation: PrivacyConversationTarget;
    userId: string;
    requestId: string;
    audit: boolean;
    dryRun?: boolean;
  }
) {
  const target = params.conversation;
  const scopedWaWhere = buildConversationPrivacyWhere(target);
  const matchingConversations = await prisma.conversation.findMany({
    where: {
      clientId: params.clientId,
      OR: [{ id: target.id }, ...scopedWaWhere.OR],
    },
    select: { id: true, waId: true, waIdCanonical: true, deletedAt: true },
  });
  const conversationIds = matchingConversations.map((item) => item.id);
  const waIds = Array.from(
    new Set(matchingConversations.flatMap((item) => [item.waId, item.waIdCanonical].filter(Boolean) as string[]))
  );

  if (params.dryRun) {
    return {
      deleted: {
        action: "soft_delete",
        conversations: conversationIds.length,
        softDeletedConversations: conversationIds.length,
        metrics: 0,
        messages: 0,
        inboundMessages: 0,
        outboundMessages: 0,
        runtimeStates: waIds.length,
        events: 0,
        contacts: 0,
        leads: 0,
        leadNotes: 0,
      },
      dryRun: true,
    };
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const conversations = await tx.conversation.updateMany({
      where: { clientId: params.clientId, id: { in: conversationIds }, deletedAt: null },
      data: {
        deletedAt: now,
        closedAt: now,
        departmentId: null,
      },
    });
    const runtimeStates = await tx.conversationRuntimeState.updateMany({
      where: { clientId: params.clientId, OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: waIds } }] },
      data: {
        status: ConversationOperationalStatus.CLOSED,
        closedAt: now,
        assignedUserId: null,
        assignedTo: null,
        assignedAt: null,
        departmentId: null,
        queueId: null,
        handoffStatus: "NONE",
        handoffReleasedAt: now,
        mode: "BOT",
      },
    });
    return { conversations, runtimeStates };
  });

  for (const waId of waIds) {
    await runtimeStorage.deleteConversation(waId, params.clientKey);
  }

  if (params.audit) {
    const payload = buildPrivacyAuditPayload({
      userId: params.userId,
      clientId: params.clientId,
      conversationId: target.id,
      action: "conversation.deleted",
      details: {
        action: "soft_delete",
        softDeletedConversations: result.conversations.count,
        preservedIdentity: true,
        preservedHistory: true,
      },
    });
    await persistPrivacyAuditEvent(prisma, {
      clientId: params.clientId,
      conversationId: null,
      waId: null,
      waIdCanonical: null,
      requestId: params.requestId,
      eventName: "conversation.deleted",
      payload: payload as Prisma.InputJsonValue,
    });
    logger.info({ event: "conversation.deleted", ...payload });
  }

  return {
    deleted: {
      action: "soft_delete",
      conversations: result.conversations.count,
      softDeletedConversations: result.conversations.count,
      metrics: 0,
      messages: 0,
      inboundMessages: 0,
      outboundMessages: 0,
      runtimeStates: result.runtimeStates.count,
      events: 0,
      contacts: 0,
      leads: 0,
      leadNotes: 0,
    },
  };
}

async function anonymizeConversationPrivacyData(
  prisma: PrismaClientLike,
  params: {
    clientId: string;
    clientKey: string;
    conversation: PrivacyConversationTarget;
    userId: string;
    requestId: string;
    dryRun?: boolean;
  }
) {
  const target = params.conversation;
  const anonymizedWaId = buildAnonymizedWaId(target);
  const anonymizedExternalUserHash = buildAnonymizedExternalUserHash(target);
  const scopedWaWhere = buildConversationPrivacyWhere(target);
  const waIds = Array.from(new Set([target.waId, target.waIdCanonical].filter(Boolean))) as string[];
  const now = new Date();

  if (params.dryRun) {
    return {
      anonymized: {
        conversation: 1,
        messages: 0,
        runtimeStates: 0,
        inboundMessages: 0,
        outboundMessages: 0,
        contacts: 0,
        contactChannelIdentities: 0,
        leads: 0,
        leadNotes: 0,
        events: 0,
      },
      waId: anonymizedWaId,
      dryRun: true,
    };
  }

  const matchingLeads = await prisma.lead.findMany({
    where: { tenantId: params.clientId, OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: waIds } }] },
    select: { id: true },
  });
  const leadIds = matchingLeads.map((item) => item.id);

  const [
    conversation,
    messages,
    runtimeStates,
    inbound,
    contacts,
    contactChannelIdentities,
    leads,
    leadNotes,
    outboundMessages,
    events,
  ] = await prisma.$transaction([
    prisma.conversation.updateMany({
      where: { clientId: params.clientId, id: target.id },
      data: {
        waId: anonymizedWaId,
        waIdCanonical: anonymizedWaId,
        externalUserHash: null,
        externalUserRef: null,
        legacyWaId: null,
        anonymizedAt: now,
        deletedAt: now,
        closedAt: now,
        historyVisibleAfter: now,
        departmentId: null,
      },
    }),
    prisma.message.updateMany({
      where: {
        conversation: { clientId: params.clientId },
        OR: [{ conversationId: target.id }, { waId: { in: waIds } }],
      },
      data: {
        waId: anonymizedWaId,
        bodyText: "[mensagem anonimizada]",
        intent: null,
        metaMessageId: null,
      },
    }),
    prisma.conversationRuntimeState.updateMany({
      where: { clientId: params.clientId, ...scopedWaWhere },
      data: {
        waId: anonymizedWaId,
        waIdCanonical: anonymizedWaId,
        conversationKey: `${params.clientKey}:${anonymizedWaId}`,
        externalUserHash: null,
        externalUserRef: null,
        legacyWaId: null,
        answers: {},
        status: "CLOSED",
        closedAt: now,
        assignedUserId: null,
        assignedTo: null,
        assignedAt: null,
        departmentId: null,
        queueId: null,
        handoffStatus: "NONE",
        handoffReleasedAt: now,
        mode: "BOT",
      },
    }),
    prisma.inboundMessage.updateMany({
      where: { clientId: params.clientId, OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: waIds } }] },
      data: {
        waId: anonymizedWaId,
        waIdCanonical: anonymizedWaId,
        externalUserHash: null,
        externalUserRef: null,
        externalMessageId: null,
        legacyWaId: null,
        bodyText: "[mensagem anonimizada]",
        rawPayload: Prisma.JsonNull,
      },
    }),
    ...buildSubjectIdentityAnonymizationOperations(prisma, {
      clientId: params.clientId,
      contactIds: [],
      identityIds: [],
      leadIds,
      leadNoteIds: [],
      waIds,
      externalUserHashes: uniqueStrings([target.externalUserHash]),
      anonymizedWaId,
      anonymizedExternalUserHash,
      now,
      eventConversationId: target.id,
      eventReason: "conversation_anonymized",
    }),
  ]);

  for (const waId of Array.from(new Set([...waIds, anonymizedWaId]))) {
    await runtimeStorage.deleteConversation(waId, params.clientKey);
  }

  const payload = buildPrivacyAuditPayload({
    userId: params.userId,
    clientId: params.clientId,
    conversationId: target.id,
    action: "conversation.anonymized",
    details: { anonymizedWaId: maskPersonalWaId(target.waId) },
  });
  await persistPrivacyAuditEvent(prisma, {
    clientId: params.clientId,
    conversationId: target.id,
    waId: anonymizedWaId,
    waIdCanonical: anonymizedWaId,
    requestId: params.requestId,
    eventName: "conversation.anonymized",
    payload: payload as Prisma.InputJsonValue,
  });
  logger.info({ event: "conversation.anonymized", ...payload });
  logger.info({
    event: "ai.memory.cleared",
    clientId: params.clientId,
    clientKey: params.clientKey,
    conversationId: target.id,
    runtimeStates: runtimeStates.count,
    reason: "conversation_anonymized",
  });

  return {
    anonymized: {
      conversation: conversation.count,
      messages: messages.count,
      runtimeStates: runtimeStates.count,
      inboundMessages: inbound.count,
      outboundMessages: outboundMessages.count,
      contacts: contacts.count,
      contactChannelIdentities: contactChannelIdentities.count,
      leads: leads.count,
      leadNotes: leadNotes.count,
      events: events.count,
    },
    waId: anonymizedWaId,
  };
}

async function executeRetentionForClient(
  prisma: PrismaClientLike,
  params: {
    clientId: string;
    clientKey: string;
    userId: string;
    requestId: string;
    dryRun?: boolean;
  }
) {
  const retention = await getOrCreateRetentionConfig(prisma, params.clientId);
  const cutoff = new Date(Date.now() - retention.retentionDays * 24 * 60 * 60 * 1000);
  const conversations = await prisma.conversation.findMany({
    where: {
      clientId: params.clientId,
      deletedAt: null,
      createdAt: { lt: cutoff },
      updatedAt: { lt: cutoff },
      OR: [{ lastInboundAt: null }, { lastInboundAt: { lt: cutoff } }],
      AND: [{ OR: [{ lastOutboundAt: null }, { lastOutboundAt: { lt: cutoff } }] }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, waId: true, waIdCanonical: true, deletedAt: true, anonymizedAt: true },
  });

  if (params.dryRun) {
    return {
      retentionDays: retention.retentionDays,
      cutoff: cutoff.toISOString(),
      deletedConversations: conversations.length,
      softDeletedConversations: conversations.length,
      anonymizedConversations: conversations.length,
      dryRun: true,
    };
  }

  let softDeletedConversations = 0;
  let anonymizedConversations = 0;
  for (const conversation of conversations) {
    try {
      const anonymized = await anonymizeConversationPrivacyData(prisma, {
        clientId: params.clientId,
        clientKey: params.clientKey,
        conversation,
        userId: params.userId,
        requestId: `${params.requestId}:retention:anonymize:${conversation.id}`,
      });
      anonymizedConversations += anonymized.anonymized.conversation;
      const softDeleted = await deleteConversationPrivacyData(prisma, {
        clientId: params.clientId,
        clientKey: params.clientKey,
        conversation,
        userId: params.userId,
        requestId: `${params.requestId}:retention:${conversation.id}`,
        audit: false,
      });
      softDeletedConversations += Math.max(
        softDeleted.deleted.softDeletedConversations,
        anonymized.anonymized.conversation
      );
      logger.info({
        event: "privacy.retention.item_anonymized",
        clientId: params.clientId,
        conversationId: conversation.id,
      });
    } catch (error) {
      logger.error({
        event: "privacy.retention.failed",
        clientId: params.clientId,
        conversationId: conversation.id,
        message: (error as Error).message,
      });
      throw error;
    }
  }
  const payload = buildPrivacyAuditPayload({
    userId: params.userId,
    clientId: params.clientId,
    conversationId: null,
    action: "retention.executed",
    details: {
      retentionDays: retention.retentionDays,
      cutoff: cutoff.toISOString(),
      action: "soft_delete_anonymize",
      anonymizedConversations,
      softDeletedConversations,
    },
  });
  await persistPrivacyAuditEvent(prisma, {
    clientId: params.clientId,
    requestId: params.requestId,
    eventName: "retention.executed",
    payload: payload as Prisma.InputJsonValue,
  });
  logger.info({ event: "retention.executed", ...payload });
  return {
    retentionDays: retention.retentionDays,
    cutoff: cutoff.toISOString(),
    deletedConversations: softDeletedConversations,
    softDeletedConversations,
    anonymizedConversations,
  };
}

export async function executePrivacyRetention(params: ExecutePrivacyRetentionParams) {
  logger.info({
    event: "privacy.retention.started",
    clientId: params.clientId,
    action: params.action,
    actorId: params.actorId,
    reason: params.reason ?? null,
    dryRun: params.dryRun === true,
    requestId: params.requestId,
  });

  try {
    let result: Record<string, unknown>;
    if (params.action === "retention") {
      result = await executeRetentionForClient(params.prisma, {
        clientId: params.clientId,
        clientKey: params.clientKey,
        userId: params.actorId,
        requestId: params.requestId,
        dryRun: params.dryRun,
      });
    } else {
      const target = await findPrivacyConversationTarget(params.prisma, params.clientId, params.rawConversationId ?? "");
      if (!target) {
        logger.info({
          event: "privacy.retention.skipped",
          clientId: params.clientId,
          action: params.action,
          reason: "conversation_not_found",
          requestId: params.requestId,
        });
        return { skipped: true, reason: "conversation_not_found" };
      }
      result =
        params.action === "conversation_delete"
          ? await deleteConversationPrivacyData(params.prisma, {
              clientId: params.clientId,
              clientKey: params.clientKey,
              conversation: target,
              userId: params.actorId,
              requestId: params.requestId,
              audit: true,
              dryRun: params.dryRun,
            })
          : await anonymizeConversationPrivacyData(params.prisma, {
              clientId: params.clientId,
              clientKey: params.clientKey,
              conversation: target,
              userId: params.actorId,
              requestId: params.requestId,
              dryRun: params.dryRun,
            });
    }

    logger.info({
      event: "privacy.retention.completed",
      clientId: params.clientId,
      action: params.action,
      dryRun: params.dryRun === true,
      requestId: params.requestId,
    });
    return result;
  } catch (error) {
    logger.error({
      event: "privacy.retention.failed",
      clientId: params.clientId,
      action: params.action,
      requestId: params.requestId,
      message: (error as Error).message,
    });
    throw error;
  }
}
