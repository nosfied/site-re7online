import type { PrismaClient } from "@prisma/client";
import { filterOptedOutCampaignRecipients, normalizeOptOutWaId } from "../campaigns/optOutRegistry.js";
import { isOperationalContactLifecycle } from "../contacts/contactLifecycle.js";
import { isWebSessionTextOutboundReady } from "../web-session/webSessionOutboundService.js";
import { resolveWhatsappPrimaryTransport } from "../web-session/hybridIdentity.js";

export type CrmConversationStartBlockedReason =
  | "contact_not_found"
  | "contact_not_active"
  | "invalid_identity"
  | "channel_unavailable"
  | "new_freeform_requires_model"
  | "not_authorized"
  | "active_send_blocked";

export type CrmConversationStartEligibility =
  | {
      allowed: true;
      waId: string;
      waIdCanonical: string;
      displayName: string | null;
      contactId: string | null;
      leadId: string;
    }
  | { allowed: false; reason: CrmConversationStartBlockedReason };

export function isCrmStartAuthorizedRole(role: string | null | undefined) {
  const normalized = String(role ?? "").trim().toUpperCase();
  return normalized === "ADMIN" || normalized === "SUPERVISOR";
}

export async function isWhatsappFreeformStartTransportReady(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  clientStatus: string | null | undefined;
}) {
  if (params.clientStatus !== "ACTIVE") {
    return { allowed: false as const, reason: "channel_unavailable" as const };
  }
  const primaryTransport = await resolveWhatsappPrimaryTransport({
    prisma: params.prisma,
    clientId: params.clientId,
  });
  if (primaryTransport !== "web_session") {
    return { allowed: false as const, reason: "new_freeform_requires_model" as const };
  }
  const ready = await isWebSessionTextOutboundReady({
    prisma: params.prisma,
    clientId: params.clientId,
    clientKey: params.clientKey,
  });
  return ready
    ? { allowed: true as const }
    : { allowed: false as const, reason: "channel_unavailable" as const };
}

export async function resolveCrmContactConversationStartEligibility(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  clientStatus: string | null | undefined;
  leadId: string;
  actorRole: string | null | undefined;
}): Promise<CrmConversationStartEligibility> {
  if (!isCrmStartAuthorizedRole(params.actorRole)) {
    return { allowed: false, reason: "not_authorized" };
  }
  const lead = await params.prisma.lead.findFirst({
    where: { id: params.leadId, tenantId: params.clientId },
    select: {
      id: true,
      waId: true,
      waIdCanonical: true,
      phone: true,
      name: true,
      channel: true,
      contactChannelIdentityId: true,
    },
  });
  if (!lead) return { allowed: false, reason: "contact_not_found" };
  if (lead.channel && lead.channel.toLowerCase() !== "whatsapp") {
    return { allowed: false, reason: "invalid_identity" };
  }

  const identity = lead.contactChannelIdentityId
    ? await params.prisma.contactChannelIdentity.findFirst({
        where: { clientId: params.clientId, id: lead.contactChannelIdentityId },
        select: {
          contactId: true,
          displayName: true,
          contact: {
            select: {
              id: true,
              name: true,
              lifecycle: true,
            },
          },
        },
      })
    : null;
  const contact =
    identity?.contact ??
    (await params.prisma.contact.findFirst({
      where: {
        clientId: params.clientId,
        OR: [{ waId: lead.waId }, { waId: lead.waIdCanonical ?? lead.waId }],
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, lifecycle: true },
    }));
  if (contact && !isOperationalContactLifecycle(contact.lifecycle)) {
    return { allowed: false, reason: "contact_not_active" };
  }
  const normalized = normalizeOptOutWaId(lead.phone || lead.waIdCanonical || lead.waId);
  if (!normalized) return { allowed: false, reason: "invalid_identity" };
  const optOuts = await filterOptedOutCampaignRecipients(params.prisma, {
    clientId: params.clientId,
    waIds: [normalized.waIdCanonical],
  });
  if (optOuts.blocked.length > 0) {
    return { allowed: false, reason: "active_send_blocked" };
  }
  const transport = await isWhatsappFreeformStartTransportReady({
    prisma: params.prisma,
    clientId: params.clientId,
    clientKey: params.clientKey,
    clientStatus: params.clientStatus,
  });
  if (!transport.allowed) return { allowed: false, reason: transport.reason };

  return {
    allowed: true,
    waId: normalized.waIdCanonical,
    waIdCanonical: normalized.waIdCanonical,
    displayName: lead.name ?? identity?.displayName ?? contact?.name ?? null,
    contactId: identity?.contactId ?? contact?.id ?? null,
    leadId: lead.id,
  };
}
