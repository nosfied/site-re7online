import type { PrismaClient } from "@prisma/client";
import {
  normalizeOptOutWaId,
  recordContactOptOut,
  revokeContactOptOut,
} from "../campaigns/optOutRegistry.js";
import { persistEvent } from "../db/persist.js";

export const CRM_CONTACT_UPDATED_EVENT = "crm.contact.updated";
export const CRM_LEAD_STATUS_CHANGED_EVENT = "crm.lead.status_changed";
export const CRM_CONTACT_INACTIVATED_EVENT = "crm.contact.inactivated";

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
      | "opt_out_identity_unavailable",
    message: string,
    public status = 400
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

function getInactivationStatus(statuses: CrmStatusConfig[]) {
  const candidates = ["INATIVO", "INACTIVE", "SEM_INTERESSE", "PERDIDO", "LOST", "NO_RESPONSE"];
  const active = getActiveStatusIds(statuses);
  return candidates.find((candidate) => active.has(candidate)) ?? null;
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
      city: true,
      email: true,
      company: true,
      status: true,
    },
  });
  if (!lead) {
    throw new CrmContactMutationError("contact_not_found", "Contact not found", 404);
  }
  return lead;
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

export async function inactivateCrmContact(
  prisma: PrismaClient,
  params: {
    clientId: string;
    leadId: string;
    statuses: CrmStatusConfig[];
    userId: string;
    requestId: string;
  }
) {
  const inactiveStatus = getInactivationStatus(params.statuses);
  if (!inactiveStatus) {
    throw new CrmContactMutationError(
      "status_not_configured",
      "Configure an inactive CRM status before inactivating contacts",
      400
    );
  }
  const lead = await getLeadForTenant(prisma, params.clientId, params.leadId);
  if (lead.status !== inactiveStatus) {
    await prisma.lead.update({ where: { id: lead.id }, data: { status: inactiveStatus } });
    await recordCrmEvent({
      clientId: params.clientId,
      lead,
      eventName: CRM_CONTACT_INACTIVATED_EVENT,
      requestId: params.requestId,
      payloadJson: {
        from: lead.status,
        to: inactiveStatus,
        userId: params.userId,
      },
    });
  }
  return { status: inactiveStatus };
}
