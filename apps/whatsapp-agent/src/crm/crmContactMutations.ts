import type { PrismaClient } from "@prisma/client";
import {
  normalizeOptOutWaId,
  recordContactOptOut,
  revokeContactOptOut,
} from "../campaigns/optOutRegistry.js";
import { hashWhatsAppExternalUser } from "../channels/whatsappBackfillDryRun.js";
import {
  recordCrmContactOperationalExclusion,
  recordCrmContactOperationalReactivation,
} from "../contacts/contactOperationalExclusion.js";
import { persistEvent } from "../db/persist.js";
import { shouldProjectConversationToHumanInbox } from "../inbox/messageVisibility.js";
import { normalizeWaIdDigits } from "../utils/waid.js";
import {
  CrmContactUpsertError,
  upsertCrmContactInTransaction,
} from "./crmContactUpsert.js";
import {
  buildCrmWhatsappExternalUserHash,
  buildCrmWhatsappIdentityCandidates,
} from "./crmWhatsappIdentity.js";

export const CRM_CONTACT_UPDATED_EVENT = "crm.contact.updated";
export const CRM_LEAD_STATUS_CHANGED_EVENT = "crm.lead.status_changed";

export type CrmStatusConfig = {
  id: string;
  label: string;
  isActive?: boolean;
};

export type CrmBasicContactPatch = {
  displayName?: unknown;
  name?: unknown;
  companyName?: unknown;
  company?: unknown;
  email?: unknown;
  city?: unknown;
};

export class CrmContactMutationError extends Error {
  constructor(
    public code:
      | "contact_not_found"
      | "bad_request"
      | "invalid_email"
      | "status_not_configured"
      | "opt_out_identity_unavailable"
      | "identity_conflict"
      | "active_conversation_exists"
      | "hidden_active_conversation_exists",
    message: string,
    public status = 400,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim().slice(0, maxLength);
  return normalized.length > 0 ? normalized : null;
}

function normalizeEmail(value: unknown) {
  const normalized = normalizeOptionalText(value, 180);
  if (!normalized) return normalized;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new CrmContactMutationError("invalid_email", "Invalid email", 400);
  }
  return normalized.toLowerCase();
}

function normalizeStatus(value: unknown) {
  const status = String(value ?? "").trim().toUpperCase();
  return /^[A-Z0-9_-]{2,80}$/.test(status) ? status : null;
}

function getActiveStatusIds(statuses: CrmStatusConfig[]) {
  return new Set(
    statuses
      .filter((status) => status.isActive !== false)
      .map((status) => String(status.id ?? "").trim().toUpperCase())
      .filter(Boolean)
  );
}

async function getLeadForTenant(prisma: PrismaClient, clientId: string, leadId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, tenantId: clientId },
    select: {
      id: true,
      tenantId: true,
      waId: true,
      waIdCanonical: true,
      channel: true,
      provider: true,
      contactChannelIdentityId: true,
      name: true,
      phone: true,
      externalUserRef: true,
      legacyWaId: true,
      externalUserHash: true,
      city: true,
      email: true,
      company: true,
      status: true,
      contactChannelIdentity: {
        select: {
          contactId: true,
          contact: {
            select: {
              id: true,
              waId: true,
              externalUserRef: true,
              legacyWaId: true,
              operationallyExcludedAt: true,
            },
          },
        },
      },
    },
  });
  if (!lead) {
    throw new CrmContactMutationError("contact_not_found", "Contact not found", 404);
  }
  return lead;
}

type CrmMutationLead = Awaited<ReturnType<typeof getLeadForTenant>>;

function buildOperationalContactLookupCandidates(lead: CrmMutationLead) {
  const directValues = [
    lead.waId,
    lead.waIdCanonical,
    lead.phone,
    normalizeWaIdDigits(lead.phone ?? ""),
    normalizeWaIdDigits(lead.waIdCanonical ?? ""),
    normalizeWaIdDigits(lead.waId ?? ""),
    lead.externalUserRef,
    lead.legacyWaId,
    lead.contactChannelIdentity?.contact?.waId,
    lead.contactChannelIdentity?.contact?.externalUserRef,
    lead.contactChannelIdentity?.contact?.legacyWaId,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return Array.from(new Set([...directValues, ...buildCrmWhatsappIdentityCandidates(directValues)]));
}

function buildOperationalContactHashCandidates(identityCandidates: string[], lead: CrmMutationLead) {
  return Array.from(
    new Set(
      [
        lead.externalUserHash,
        ...identityCandidates.flatMap((candidate) => [
          buildCrmWhatsappExternalUserHash(candidate),
          hashWhatsAppExternalUser(candidate),
          `hash:${hashWhatsAppExternalUser(candidate)}`,
        ]),
      ]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
}

async function resolveOperationalContactForLead(
  prisma: PrismaClient,
  params: { clientId: string; lead: CrmMutationLead }
) {
  const direct = params.lead.contactChannelIdentity?.contactId && params.lead.contactChannelIdentity.contact
    ? {
        id: params.lead.contactChannelIdentity.contactId,
        waId: params.lead.contactChannelIdentity.contact.waId,
        externalUserRef: params.lead.contactChannelIdentity.contact.externalUserRef,
        legacyWaId: params.lead.contactChannelIdentity.contact.legacyWaId,
        operationallyExcludedAt: params.lead.contactChannelIdentity.contact.operationallyExcludedAt,
      }
    : null;
  if (direct) return direct;

  const identityCandidates = buildOperationalContactLookupCandidates(params.lead);
  const hashCandidates = buildOperationalContactHashCandidates(identityCandidates, params.lead);
  if (identityCandidates.length === 0 && hashCandidates.length === 0) return null;

  const [identities, contacts] = await Promise.all([
    prisma.contactChannelIdentity.findMany({
      where: {
        clientId: params.clientId,
        OR: [
          ...(params.lead.contactChannelIdentityId ? [{ id: params.lead.contactChannelIdentityId }] : []),
          { externalUserRef: { in: identityCandidates } },
          { legacyWaId: { in: identityCandidates } },
          { externalUserHash: { in: hashCandidates } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 3,
      select: {
        contactId: true,
        contact: {
          select: {
            id: true,
            waId: true,
            externalUserRef: true,
            legacyWaId: true,
            operationallyExcludedAt: true,
          },
        },
      },
    }),
    prisma.contact.findMany({
      where: {
        clientId: params.clientId,
        OR: [
          { waId: { in: identityCandidates } },
          { externalUserRef: { in: identityCandidates } },
          { legacyWaId: { in: identityCandidates } },
          { externalUserHash: { in: hashCandidates } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 3,
      select: {
        id: true,
        waId: true,
        externalUserRef: true,
        legacyWaId: true,
        operationallyExcludedAt: true,
      },
    }),
  ]);
  const identityContacts = identities.flatMap((identity) => (identity.contact ? [identity.contact] : []));
  const resolved = [...identityContacts, ...contacts];
  const contactIds = new Set(resolved.map((contact) => contact.id));
  if (contactIds.size > 1) {
    throw new CrmContactMutationError(
      "identity_conflict",
      "Multiple possible contacts found for this identity",
      409
    );
  }
  return resolved[0] ?? null;
}

async function materializeOperationalContactForLead(
  prisma: PrismaClient,
  params: {
    clientId: string;
    lead: CrmMutationLead;
    userId: string;
    requestId: string;
  }
) {
  const phone = params.lead.phone ?? params.lead.waIdCanonical ?? params.lead.waId;
  try {
    const result = await upsertCrmContactInTransaction(prisma as never, {
      clientId: params.clientId,
      input: {
        name: params.lead.name,
        phone,
      },
      actorUserId: params.userId,
      requestId: `crm-contact-operational-materialize:${params.lead.id}:${params.requestId}`,
      source: "crm_manual",
      audit: false,
      crmStatusId: params.lead.status,
    });
    return prisma.contact.findFirst({
      where: { clientId: params.clientId, id: result.contactId },
      select: {
        id: true,
        waId: true,
        externalUserRef: true,
        legacyWaId: true,
        operationallyExcludedAt: true,
      },
    });
  } catch (error) {
    if (error instanceof CrmContactUpsertError && error.code === "identity_conflict") {
      throw new CrmContactMutationError("identity_conflict", error.message, error.status);
    }
    throw new CrmContactMutationError("contact_not_found", "Contact not found", 404);
  }
}

function isWhatsappChannel(channel: string | null | undefined) {
  return !channel || channel.toLowerCase() === "whatsapp";
}

function resolveOptOutWaId(lead: {
  phone: string | null;
  waIdCanonical: string | null;
  waId: string;
  channel: string | null;
}) {
  if (!isWhatsappChannel(lead.channel)) return null;
  return (
    normalizeOptOutWaId(lead.phone)?.waId ??
    normalizeOptOutWaId(lead.waIdCanonical)?.waId ??
    normalizeOptOutWaId(lead.waId)?.waId ??
    null
  );
}

async function recordCrmEvent(params: {
  clientId: string;
  lead: { id: string; waId: string; waIdCanonical: string | null; status?: string | null };
  eventName: string;
  requestId: string;
  payloadJson: Record<string, unknown>;
}) {
  await persistEvent({
    clientId: params.clientId,
    waId: params.lead.waId,
    waIdCanonical: params.lead.waIdCanonical,
    requestId: `${params.eventName}:${params.lead.id}:${params.requestId}`,
    eventName: params.eventName,
    payloadJson: {
      leadId: params.lead.id,
      ...params.payloadJson,
    },
  });
}

export async function updateCrmContactBasics(
  prisma: PrismaClient,
  params: {
    clientId: string;
    leadId: string;
    patch: CrmBasicContactPatch;
    userId: string;
    requestId: string;
  }
) {
  const lead = await getLeadForTenant(prisma, params.clientId, params.leadId);
  const name = Object.prototype.hasOwnProperty.call(params.patch, "displayName")
    ? normalizeOptionalText(params.patch.displayName, 120)
    : Object.prototype.hasOwnProperty.call(params.patch, "name")
      ? normalizeOptionalText(params.patch.name, 120)
      : undefined;
  const company = Object.prototype.hasOwnProperty.call(params.patch, "companyName")
    ? normalizeOptionalText(params.patch.companyName, 160)
    : Object.prototype.hasOwnProperty.call(params.patch, "company")
      ? normalizeOptionalText(params.patch.company, 160)
      : undefined;
  const email = Object.prototype.hasOwnProperty.call(params.patch, "email")
    ? normalizeEmail(params.patch.email)
    : undefined;
  const city = Object.prototype.hasOwnProperty.call(params.patch, "city")
    ? normalizeOptionalText(params.patch.city, 120)
    : undefined;

  const data: { name?: string | null; company?: string | null; email?: string | null; city?: string | null } = {};
  const fieldsChanged: string[] = [];
  if (name !== undefined && name !== lead.name) {
    data.name = name;
    fieldsChanged.push("displayName");
  }
  if (company !== undefined && company !== lead.company) {
    data.company = company;
    fieldsChanged.push("companyName");
  }
  if (email !== undefined && email !== lead.email) {
    data.email = email;
    fieldsChanged.push("email");
  }
  if (city !== undefined && city !== lead.city) {
    data.city = city;
    fieldsChanged.push("city");
  }

  if (fieldsChanged.length > 0) {
    await prisma.lead.update({ where: { id: lead.id }, data });
    if (name !== undefined) {
      await prisma.contact.updateMany({
        where: {
          clientId: params.clientId,
          OR: [{ waId: lead.waId }, { waId: lead.waIdCanonical ?? lead.waId }],
        },
        data: { name },
      });
      if (lead.contactChannelIdentityId) {
        await prisma.contactChannelIdentity.updateMany({
          where: { clientId: params.clientId, id: lead.contactChannelIdentityId },
          data: { displayName: name },
        });
      }
    }
    await recordCrmEvent({
      clientId: params.clientId,
      lead,
      eventName: CRM_CONTACT_UPDATED_EVENT,
      requestId: params.requestId,
      payloadJson: {
        fieldsChanged,
        userId: params.userId,
      },
    });
  }

  return { fieldsChanged };
}

export async function updateCrmLeadStatus(
  prisma: PrismaClient,
  params: {
    clientId: string;
    leadId: string;
    status: unknown;
    statuses: CrmStatusConfig[];
    userId: string;
    requestId: string;
  }
) {
  const nextStatus = normalizeStatus(params.status);
  if (!nextStatus || !getActiveStatusIds(params.statuses).has(nextStatus)) {
    throw new CrmContactMutationError("status_not_configured", "CRM status is not active for this tenant", 400);
  }
  const lead = await getLeadForTenant(prisma, params.clientId, params.leadId);
  if (lead.status !== nextStatus) {
    await prisma.lead.update({ where: { id: lead.id }, data: { status: nextStatus } });
    await recordCrmEvent({
      clientId: params.clientId,
      lead,
      eventName: CRM_LEAD_STATUS_CHANGED_EVENT,
      requestId: params.requestId,
      payloadJson: {
        from: lead.status,
        to: nextStatus,
        userId: params.userId,
      },
    });
  }
  return { status: nextStatus };
}

export async function recordCrmContactOptOut(
  prisma: PrismaClient,
  params: {
    clientId: string;
    leadId: string;
    userId: string;
    requestId: string;
    reason?: string | null;
  }
) {
  const lead = await getLeadForTenant(prisma, params.clientId, params.leadId);
  const waId = resolveOptOutWaId(lead);
  if (!waId) {
    throw new CrmContactMutationError(
      "opt_out_identity_unavailable",
      "Contact does not have a WhatsApp identity available for opt-out",
      400
    );
  }
  await recordContactOptOut({
    clientId: params.clientId,
    waId,
    channel: lead.channel || "whatsapp",
    source: "crm",
    reason: params.reason || "manual_crm_opt_out",
    userId: params.userId,
    requestId: `crm-contact-opt-out:${lead.id}:${params.requestId}`,
  });
  return { ok: true };
}

function resolveLeadOperationalIdentity(lead: {
  waId: string;
  waIdCanonical: string | null;
  phone: string | null;
}) {
  return lead.waIdCanonical ?? normalizeOptOutWaId(lead.phone)?.waIdCanonical ?? lead.waId;
}

function resolveLeadOperationalIdentityKeys(lead: {
  waId: string;
  waIdCanonical: string | null;
  phone: string | null;
  contactChannelIdentity?: {
    contact?: {
      waId: string | null;
      externalUserRef: string | null;
      legacyWaId: string | null;
    } | null;
  } | null;
}) {
  return Array.from(
    new Set(
      [
        lead.waId,
        lead.waIdCanonical,
        normalizeOptOutWaId(lead.phone)?.waIdCanonical,
        lead.contactChannelIdentity?.contact?.waId,
        lead.contactChannelIdentity?.contact?.externalUserRef,
        lead.contactChannelIdentity?.contact?.legacyWaId,
      ]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
}

async function assertNoActiveOperationalConversation(
  prisma: PrismaClient,
  params: { clientId: string; identityKeys: string[] }
) {
  if (params.identityKeys.length === 0) return;
  const active = await prisma.conversationRuntimeState.findFirst({
    where: {
      clientId: params.clientId,
      OR: [
        { status: { in: ["WAITING", "IN_PROGRESS", "WAITING_USER"] } },
        { closedAt: null, NOT: { status: "CLOSED" } },
      ],
      AND: [
        {
          OR: [
            { waId: { in: params.identityKeys } },
            { waIdCanonical: { in: params.identityKeys } },
          ],
        },
      ],
    },
    select: {
      id: true,
      conversationKey: true,
      waId: true,
      waIdCanonical: true,
      status: true,
      mode: true,
      handoffStatus: true,
      assignedUserId: true,
      assignedAt: true,
      departmentId: true,
      queueId: true,
      handoffActivatedAt: true,
      closedAt: true,
      updatedAt: true,
    },
  });
  if (active) {
    if (!isActiveOperationalBlockingConversation(active)) return;
    if (isHiddenTechnicalBlockingConversation(active)) {
      throw new CrmContactMutationError(
        "hidden_active_conversation_exists",
        "Este contato possui uma conversa pendente associada que precisa ser retirada da operacao antes da exclusao.",
        409,
        {
          conversationId: active.waIdCanonical ?? active.waId,
          conversationIdentity: active.waIdCanonical ?? active.waId,
          visibility: "hidden",
          status: active.status,
          mode: active.mode,
          updatedAt: active.updatedAt?.toISOString(),
        }
      );
    }
    throw new CrmContactMutationError(
      "active_conversation_exists",
      "Contact has an active operational conversation",
      409,
      {
        conversationId: active.waIdCanonical ?? active.waId,
        conversationIdentity: active.waIdCanonical ?? active.waId,
        visibility: "visible",
        status: active.status,
        mode: active.mode,
        updatedAt: active.updatedAt?.toISOString(),
      }
    );
  }
}

export function isHiddenTechnicalBlockingConversation(conversation: {
  status?: string | null;
  mode?: string | null;
  handoffStatus?: string | null;
  assignedUserId?: string | null;
  assignedAt?: Date | string | null;
  departmentId?: string | null;
  queueId?: string | null;
  handoffActivatedAt?: Date | string | null;
  closedAt?: Date | string | null;
}) {
  const toProjectionDate = (value: Date | string | null | undefined) =>
    value instanceof Date ? value.toISOString() : value;
  if (
    shouldProjectConversationToHumanInbox({
      ...conversation,
      assignedAt: toProjectionDate(conversation.assignedAt),
      handoffActivatedAt: conversation.handoffActivatedAt,
    })
  ) return false;
  const status = String(conversation.status ?? "").trim().toUpperCase();
  const mode = String(conversation.mode ?? "").trim().toUpperCase();
  const handoffStatus = String(conversation.handoffStatus ?? "").trim().toUpperCase();
  const hasHumanEvidence =
    Boolean(conversation.assignedUserId) ||
    Boolean(conversation.assignedAt) ||
    Boolean(conversation.handoffActivatedAt) ||
    handoffStatus === "ACTIVE";
  if (hasHumanEvidence) return false;
  if (status === "CLOSED") return false;
  return mode === "BOT" || handoffStatus === "NONE" || handoffStatus === "";
}

export function isActiveOperationalBlockingConversation(conversation: {
  status?: string | null;
  closedAt?: Date | string | null;
}) {
  const status = String(conversation.status ?? "").trim().toUpperCase();
  return status === "WAITING" || status === "IN_PROGRESS" || status === "WAITING_USER" || (!conversation.closedAt && status !== "CLOSED");
}

export async function excludeCrmContactFromOperation(
  prisma: PrismaClient,
  params: {
    clientId: string;
    leadId: string;
    userId: string;
    requestId: string;
    reason?: string | null;
  }
) {
  return prisma.$transaction(async (tx) => {
    const lead = await getLeadForTenant(tx as PrismaClient, params.clientId, params.leadId);
    const contact =
      (await resolveOperationalContactForLead(tx as PrismaClient, {
        clientId: params.clientId,
        lead,
      })) ??
      (await materializeOperationalContactForLead(tx as PrismaClient, {
      clientId: params.clientId,
      lead,
        userId: params.userId,
        requestId: params.requestId,
      }));
    if (!contact) {
      throw new CrmContactMutationError("contact_not_found", "Contact not found", 404);
    }
    await assertNoActiveOperationalConversation(tx as PrismaClient, {
      clientId: params.clientId,
      identityKeys: resolveLeadOperationalIdentityKeys({
        ...lead,
        contactChannelIdentity: {
          ...(lead.contactChannelIdentity ?? {}),
          contact,
        },
      }),
    });
    if (!contact.operationallyExcludedAt) {
      await tx.contact.update({
        where: { id: contact.id },
        data: { operationallyExcludedAt: new Date() },
      });
    }
    await recordCrmContactOperationalExclusion({
      prisma: tx as PrismaClient,
      clientId: params.clientId,
      leadId: lead.id,
      contactId: contact.id,
      waId: lead.waId,
      waIdCanonical: resolveLeadOperationalIdentity(lead),
      actorUserId: params.userId,
      requestId: params.requestId,
      reason: params.reason,
    });
    return { excluded: true };
  });
}

export async function reactivateCrmContactForOperation(
  prisma: PrismaClient,
  params: {
    clientId: string;
    leadId: string;
    userId: string;
    requestId: string;
  }
) {
  return prisma.$transaction(async (tx) => {
    const lead = await getLeadForTenant(tx as PrismaClient, params.clientId, params.leadId);
    const contact = await resolveOperationalContactForLead(tx as PrismaClient, {
      clientId: params.clientId,
      lead,
    });
    if (!contact) {
      throw new CrmContactMutationError("contact_not_found", "Contact not found", 404);
    }
    if (contact.operationallyExcludedAt) {
      await tx.contact.update({
        where: { id: contact.id },
        data: { operationallyExcludedAt: null },
      });
    }
    await recordCrmContactOperationalReactivation({
      prisma: tx as PrismaClient,
      clientId: params.clientId,
      leadId: lead.id,
      contactId: contact.id,
      waId: lead.waId,
      waIdCanonical: resolveLeadOperationalIdentity(lead),
      actorUserId: params.userId,
      requestId: params.requestId,
      source: "manual_crm_reactivation",
    });
    return { reactivated: true };
  });
}

export async function revokeCrmContactOptOut(
  prisma: PrismaClient,
  params: {
    clientId: string;
    leadId: string;
    userId: string;
    requestId: string;
    reason?: string | null;
  }
) {
  const lead = await getLeadForTenant(prisma, params.clientId, params.leadId);
  const waId = resolveOptOutWaId(lead);
  if (!waId) {
    throw new CrmContactMutationError(
      "opt_out_identity_unavailable",
      "Contact does not have a WhatsApp identity available for opt-out",
      400
    );
  }
  await revokeContactOptOut({
    clientId: params.clientId,
    waId,
    channel: lead.channel || "whatsapp",
    source: "crm",
    reason: params.reason || "manual_crm_opt_out_revoke",
    userId: params.userId,
    requestId: `crm-contact-opt-out-revoke:${lead.id}:${params.requestId}`,
  });
  return { ok: true };
}
