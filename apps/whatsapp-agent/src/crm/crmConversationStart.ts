import type { PrismaClient } from "@prisma/client";
import { filterOptedOutCampaignRecipients } from "../campaigns/optOutRegistry.js";
import { isOperationalContactLifecycle } from "../contacts/contactLifecycle.js";
import {
  isWebSessionTextOutboundReady,
  resolveWebSessionTextRecipient,
} from "../web-session/webSessionOutboundService.js";
import { resolveWhatsappPrimaryTransport } from "../web-session/hybridIdentity.js";
import {
  buildCrmWhatsappIdentityCandidates,
  normalizeCrmWhatsappIdentity,
} from "./crmWhatsappIdentity.js";

export type CrmConversationStartBlockedReason =
  | "contact_not_found"
  | "contact_not_active"
  | "invalid_identity"
  | "channel_unavailable"
  | "new_freeform_requires_model"
  | "not_authorized"
  | "active_send_blocked"
  | "identity_conflict";

export type CrmConversationStartEligibility =
  | {
      allowed: true;
      waId: string;
      waIdCanonical: string;
      displayName: string | null;
      contactId: string | null;
      leadId: string;
      providerCandidates: string[];
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
          externalUserRef: true,
          legacyWaId: true,
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
  const identityCandidates = buildCrmWhatsappIdentityCandidates([
    lead.phone,
    lead.waIdCanonical,
    lead.waId,
    identity?.externalUserRef,
    identity?.legacyWaId,
  ]);
  const contact =
    identity?.contact ??
    (await params.prisma.contact.findFirst({
      where: {
        clientId: params.clientId,
        OR: [
          { waId: { in: identityCandidates } },
          { externalUserRef: { in: identityCandidates } },
          { legacyWaId: { in: identityCandidates } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, lifecycle: true },
    }));
  if (contact && !isOperationalContactLifecycle(contact.lifecycle)) {
    return { allowed: false, reason: "contact_not_active" };
  }
  const normalized = normalizeCrmWhatsappIdentity(lead.phone || lead.waIdCanonical || lead.waId);
  if (!normalized) return { allowed: false, reason: "invalid_identity" };
  const optOuts = await filterOptedOutCampaignRecipients(params.prisma, {
    clientId: params.clientId,
    waIds: normalized.providerCandidates,
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
    waId: normalized.crmCanonicalPhone,
    waIdCanonical: normalized.crmCanonicalPhone,
    providerCandidates: normalized.providerCandidates,
    displayName: lead.name ?? identity?.displayName ?? contact?.name ?? null,
    contactId: identity?.contactId ?? contact?.id ?? null,
    leadId: lead.id,
  };
}

export async function resolveCrmWebSessionRecipient(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  leadId: string;
  candidates: string[];
  requestId: string;
}) {
  const knownConversation = await params.prisma.conversation.findMany({
    where: {
      clientId: params.clientId,
      deletedAt: null,
      anonymizedAt: null,
      OR: [{ waId: { in: params.candidates } }, { waIdCanonical: { in: params.candidates } }],
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 2,
    select: { waId: true, waIdCanonical: true },
  });
  if (knownConversation.length === 1) {
    return {
      ok: true as const,
      waId: knownConversation[0].waId,
      waIdCanonical: knownConversation[0].waIdCanonical ?? params.candidates[0] ?? knownConversation[0].waId,
      source: "existing_conversation" as const,
    };
  }
  if (knownConversation.length > 1) {
    return { ok: false as const, reason: "identity_conflict" as const };
  }

  const provider = await resolveWebSessionTextRecipient({
    prisma: params.prisma,
    clientId: params.clientId,
    clientKey: params.clientKey,
    candidates: params.candidates,
    requestId: params.requestId,
  });
  if (!provider.ok) return provider;
  const lead = await params.prisma.lead.findFirst({
    where: { id: params.leadId, tenantId: params.clientId },
    select: {
      contactChannelIdentityId: true,
      contactChannelIdentity: {
        select: {
          contactId: true,
        },
      },
    },
  });
  const contactId = lead?.contactChannelIdentity?.contactId ?? null;
  await params.prisma.$transaction([
    params.prisma.lead.updateMany({
      where: { id: params.leadId, tenantId: params.clientId },
      data: {
        externalUserRef: provider.recipientWaId,
        legacyWaId: provider.recipientWaId,
      },
    }),
    ...(contactId
      ? [
          params.prisma.contact.updateMany({
            where: { id: contactId, clientId: params.clientId },
            data: {
              externalUserRef: provider.recipientWaId,
              legacyWaId: provider.recipientWaId,
            },
          }),
        ]
      : []),
    ...(lead?.contactChannelIdentityId
      ? [
          params.prisma.contactChannelIdentity.updateMany({
            where: { id: lead.contactChannelIdentityId, clientId: params.clientId },
            data: {
              externalUserRef: provider.recipientWaId,
              legacyWaId: provider.recipientWaId,
            },
          }),
        ]
      : []),
  ]);
  return {
    ok: true as const,
    waId: provider.recipientWaId,
    waIdCanonical: params.candidates[0] ?? provider.recipientWaId,
    source: "provider_resolution" as const,
  };
}
