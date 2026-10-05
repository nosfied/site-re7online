import type { PrismaClient } from "@prisma/client";
import { filterOptedOutCampaignRecipients } from "../campaigns/optOutRegistry.js";
import {
  isWhatsappTransportEnabledForRouting,
  resolveInteractiveContactStartPolicy,
  resolveWhatsappTransportRoutingSettings,
} from "../config/tenantOperationalConfig.js";
import { isOperationalContactLifecycle } from "../contacts/contactLifecycle.js";
import { loadOperationallyExcludedWaIds } from "../contacts/contactOperationalExclusion.js";
import { getFeatures } from "../features/clientFeatures.js";
import {
  isWebSessionTextOutboundReady,
  resolveWebSessionTextAvailability,
  resolveWebSessionTextRecipient,
} from "../web-session/webSessionOutboundService.js";
import {
  resolveOperationalMetaWhatsappIdentity,
  resolveHybridWhatsappIdentityStatus,
  resolveWhatsappPrimaryTransport,
  type WhatsappPrimaryTransport,
} from "../web-session/hybridIdentity.js";
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
  | "contact_operationally_excluded"
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

export type EffectiveWhatsappOutboundTransport =
  | {
      status: "ready";
      provider: WhatsappPrimaryTransport;
      source: "explicit" | "configured_web_only" | "configured_cloud_only" | "hybrid_auto" | "hybrid_reactive_contingency";
      configuredMode: WhatsappConfiguredTenantMode;
    }
  | { status: "unavailable"; source: "explicit_unavailable" | "none_operational" | "configured_unavailable"; configuredMode: WhatsappConfiguredTenantMode };

export type WhatsappConfiguredTenantMode = "WEB_ONLY" | "CLOUD_ONLY" | "HYBRID" | "NONE";

export type WhatsappTemplateOutboundTransport =
  | {
      status: "ready";
      provider: "meta";
      source: "configured_cloud_only" | "hybrid_template";
      configuredMode: WhatsappConfiguredTenantMode;
    }
  | {
      status: "unavailable";
      source: "client_inactive" | "configured_unavailable" | "none_operational";
      configuredMode: WhatsappConfiguredTenantMode;
      reason: "client_inactive" | "meta_not_operational" | "web_only" | "none";
    };

export type ConfiguredWhatsappTenantModeSnapshot = {
  mode: WhatsappConfiguredTenantMode;
  webConfigured: boolean;
  metaConfigured: boolean;
  webTechnicallyConfigured?: boolean;
  metaTechnicallyConfigured?: boolean;
  webEnabledForRouting?: boolean;
  metaEnabledForRouting?: boolean;
  webRoutingPolicyExplicit?: boolean;
  metaRoutingPolicyExplicit?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMetaTransportOperationallyRemoved(rawPayload: unknown) {
  if (!isRecord(rawPayload)) return false;
  const operationalStatus = rawPayload.operationalStatus;
  return isRecord(operationalStatus) && operationalStatus.state === "removed";
}

async function resolveConfiguredMetaWhatsappTransport(params: {
  prisma: PrismaClient;
  clientId: string;
}) {
  const tenantMetaConfig = (params.prisma as unknown as {
    tenantMetaConfig?: PrismaClient["tenantMetaConfig"];
  }).tenantMetaConfig;
  const waPhoneNumber = (params.prisma as unknown as {
    waPhoneNumber?: PrismaClient["waPhoneNumber"];
  }).waPhoneNumber;
  const metaConfig = tenantMetaConfig
    ? await tenantMetaConfig.findUnique({
        where: { clientId: params.clientId },
        select: {
          phoneNumberId: true,
          wabaId: true,
          businessToken: true,
          rawPayload: true,
        },
      })
    : null;
  if (metaConfig) {
    if (isMetaTransportOperationallyRemoved(metaConfig.rawPayload)) return false;
    return Boolean(
      String(metaConfig.phoneNumberId ?? "").trim() ||
        String(metaConfig.wabaId ?? "").trim() ||
        String(metaConfig.businessToken ?? "").trim()
    );
  }
  const legacyPhoneMapping = waPhoneNumber
    ? await waPhoneNumber.findFirst({
        where: { clientId: params.clientId, display: { not: null } },
        select: { phoneNumberId: true, display: true },
        orderBy: { createdAt: "asc" },
      })
    : null;
  return Boolean(
    String(legacyPhoneMapping?.phoneNumberId ?? "").trim() ||
      String(legacyPhoneMapping?.display ?? "").trim()
  );
}

export async function resolveConfiguredWhatsappTenantMode(params: {
  prisma: PrismaClient;
  clientId: string;
}): Promise<ConfiguredWhatsappTenantModeSnapshot> {
  const [webAccount, metaTechnicallyConfigured, routingSettings] = await Promise.all([
    params.prisma.channelAccount.findFirst({
      where: {
        clientId: params.clientId,
        channel: "whatsapp",
        provider: "web_session",
        enabled: true,
      },
      include: {
        client: {
          select: {
            status: true,
            features: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
    }),
    resolveConfiguredMetaWhatsappTransport({
      prisma: params.prisma,
      clientId: params.clientId,
    }),
    resolveWhatsappTransportRoutingSettings({
      prisma: params.prisma,
      clientId: params.clientId,
    }),
  ]);
  const webTechnicallyConfigured = Boolean(
    webAccount &&
      webAccount.enabled === true &&
      webAccount.client.status === "ACTIVE" &&
      getFeatures(webAccount.client).whatsappWebSession === true
  );
  const legacyWebRoutingDefault = Boolean(webTechnicallyConfigured && webAccount?.runtimeEnabled === true);
  const webEnabledForRouting = isWhatsappTransportEnabledForRouting(
    routingSettings.settings,
    "webSession",
    legacyWebRoutingDefault
  );
  const metaEnabledForRouting = isWhatsappTransportEnabledForRouting(
    routingSettings.settings,
    "meta",
    metaTechnicallyConfigured
  );
  const webConfigured = webTechnicallyConfigured && webEnabledForRouting;
  const metaConfigured = metaTechnicallyConfigured && metaEnabledForRouting;
  const webRoutingPolicyExplicit = Boolean(routingSettings.settings.webSession);
  const metaRoutingPolicyExplicit = Boolean(routingSettings.settings.meta);
  const mode: WhatsappConfiguredTenantMode =
    webConfigured && metaConfigured
      ? "HYBRID"
      : webConfigured
        ? "WEB_ONLY"
        : metaConfigured
          ? "CLOUD_ONLY"
          : "NONE";
  return {
    mode,
    webConfigured,
    metaConfigured,
    webTechnicallyConfigured,
    metaTechnicallyConfigured,
    webEnabledForRouting,
    metaEnabledForRouting,
    webRoutingPolicyExplicit,
    metaRoutingPolicyExplicit,
  };
}

export type ReactiveWhatsappIntent = "INTERACTIVE_REPLY" | "PROTOCOL_NOTICE" | "REACTIVE_AUTOMATION";

export async function resolveEffectiveWhatsappOutboundTransport(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  clientStatus: string | null | undefined;
  intent?: ReactiveWhatsappIntent;
}): Promise<EffectiveWhatsappOutboundTransport> {
  if (params.clientStatus !== "ACTIVE") {
    return { status: "unavailable", source: "none_operational", configuredMode: "NONE" };
  }
  const explicitPrimary = await resolveWhatsappPrimaryTransport({
    prisma: params.prisma,
    clientId: params.clientId,
  });
  const [configuredMode, webAvailability, metaIdentity] = await Promise.all([
    resolveConfiguredWhatsappTenantMode({
      prisma: params.prisma,
      clientId: params.clientId,
    }),
    resolveWebSessionTextAvailability({
      prisma: params.prisma,
      clientId: params.clientId,
      clientKey: params.clientKey,
    }),
    resolveOperationalMetaWhatsappIdentity({
      prisma: params.prisma,
      clientId: params.clientId,
    }),
  ]);
  const webReady = webAvailability === "ready";
  const metaReady = Boolean(metaIdentity.canonicalNumber);

  if (explicitPrimary) {
    const configured = explicitPrimary === "web_session"
      ? configuredMode.webConfigured
      : configuredMode.metaConfigured;
    const ready = configured && (explicitPrimary === "web_session" ? webReady : metaReady);
    return ready
      ? { status: "ready", provider: explicitPrimary, source: "explicit", configuredMode: configuredMode.mode }
      : { status: "unavailable", source: "explicit_unavailable", configuredMode: configuredMode.mode };
  }

  if (configuredMode.mode === "HYBRID") {
    if (webReady) return { status: "ready", provider: "web_session", source: "hybrid_auto", configuredMode: configuredMode.mode };
    if (params.intent && webAvailability === "disconnected" && metaReady) {
      const identity = await resolveHybridWhatsappIdentityStatus(params);
      if (!identity.conflict && identity.web.canonicalNumber === identity.meta.canonicalNumber && !identity.numberReplacement) {
        return { status: "ready", provider: "meta", source: "hybrid_reactive_contingency", configuredMode: configuredMode.mode };
      }
    }
    return { status: "unavailable", source: "configured_unavailable", configuredMode: configuredMode.mode };
  }
  if (configuredMode.mode === "WEB_ONLY") {
    return webReady
      ? { status: "ready", provider: "web_session", source: "configured_web_only", configuredMode: configuredMode.mode }
      : { status: "unavailable", source: "configured_unavailable", configuredMode: configuredMode.mode };
  }
  if (configuredMode.mode === "CLOUD_ONLY") {
    return metaReady
      ? { status: "ready", provider: "meta", source: "configured_cloud_only", configuredMode: configuredMode.mode }
      : { status: "unavailable", source: "configured_unavailable", configuredMode: configuredMode.mode };
  }
  return { status: "unavailable", source: "none_operational", configuredMode: configuredMode.mode };
}

export async function resolveWhatsappTemplateOutboundTransport(params: {
  prisma: PrismaClient;
  clientId: string;
  clientStatus: string | null | undefined;
}): Promise<WhatsappTemplateOutboundTransport> {
  if (params.clientStatus !== "ACTIVE") {
    return {
      status: "unavailable",
      source: "client_inactive",
      configuredMode: "NONE",
      reason: "client_inactive",
    };
  }
  const [configuredMode, metaIdentity] = await Promise.all([
    resolveConfiguredWhatsappTenantMode({
      prisma: params.prisma,
      clientId: params.clientId,
    }),
    resolveOperationalMetaWhatsappIdentity({
      prisma: params.prisma,
      clientId: params.clientId,
    }),
  ]);
  if (configuredMode.mode === "NONE") {
    return {
      status: "unavailable",
      source: "none_operational",
      configuredMode: configuredMode.mode,
      reason: "none",
    };
  }
  if (configuredMode.mode === "WEB_ONLY") {
    return {
      status: "unavailable",
      source: "configured_unavailable",
      configuredMode: configuredMode.mode,
      reason: "web_only",
    };
  }
  if (!configuredMode.metaConfigured || !metaIdentity.canonicalNumber) {
    return {
      status: "unavailable",
      source: "configured_unavailable",
      configuredMode: configuredMode.mode,
      reason: "meta_not_operational",
    };
  }
  return {
    status: "ready",
    provider: "meta",
    source: configuredMode.mode === "HYBRID" ? "hybrid_template" : "configured_cloud_only",
    configuredMode: configuredMode.mode,
  };
}

export async function isWhatsappFreeformStartTransportReady(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  clientStatus: string | null | undefined;
  allowInteractiveContactStartViaWebSession?: boolean;
}) {
  const transport = await resolveEffectiveWhatsappOutboundTransport(params);
  if (transport.status === "ready" && transport.provider === "web_session") {
    const allowWebStart =
      params.allowInteractiveContactStartViaWebSession ??
      (await resolveInteractiveContactStartPolicy({
        prisma: params.prisma,
        clientId: params.clientId,
      })).allowInteractiveContactStartViaWebSession;
    if (!allowWebStart) {
      return { allowed: false as const, reason: "new_freeform_requires_model" as const };
    }
    return { allowed: true as const };
  }
  if (transport.status === "ready" && transport.provider === "meta") {
    return { allowed: false as const, reason: "new_freeform_requires_model" as const };
  }
  return { allowed: false as const, reason: "channel_unavailable" as const };
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
  const excluded = await loadOperationallyExcludedWaIds(params.prisma, {
    clientId: params.clientId,
    waIds: identityCandidates,
  });
  if (identityCandidates.some((candidate) => excluded.has(candidate))) {
    return { allowed: false, reason: "contact_operationally_excluded" };
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
