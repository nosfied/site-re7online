import { Prisma, type PrismaClient } from "@prisma/client";
import { persistEvent } from "../db/persist.js";
import { clearAllWebSessionAuthState } from "./webSessionAuthStore.js";
import {
  clearWebSessionQrForRuntime,
  webSessionMetadataPatch,
} from "./webSessionConnectionRuntime.js";
import {
  fingerprintWebSessionNumber,
  markWebSessionAuthorizationInvalidatedByMetaIdentityChange,
  maskWebSessionNumber,
  normalizeWebSessionAuthorizedNumber,
  resolveWebSessionAuthorization,
} from "./webSessionAuthorization.js";

export type WhatsappPrimaryTransport = "meta" | "web_session";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeHybridWhatsappNumber(value: unknown) {
  return normalizeWebSessionAuthorizedNumber(typeof value === "string" ? value : "");
}

export function extractMetaDisplayPhoneFromRawPayload(rawPayload: unknown): string | null {
  if (!isRecord(rawPayload)) return null;
  const enrich = rawPayload.enrich;
  if (isRecord(enrich)) {
    const nested = extractMetaDisplayPhoneFromRawPayload(enrich);
    if (nested) return nested;
  }
  const phoneNumber = rawPayload.phoneNumber;
  if (isRecord(phoneNumber)) {
    const displayPhone = typeof phoneNumber.display_phone_number === "string"
      ? phoneNumber.display_phone_number.trim()
      : "";
    if (displayPhone) return displayPhone;
  }
  return typeof rawPayload.display_phone_number === "string"
    ? rawPayload.display_phone_number.trim() || null
    : null;
}

export function resolveProviderConfirmedMetaPublicWhatsappIdentity(displayPhoneNumber: unknown) {
  const rawDisplayPhoneNumber = typeof displayPhoneNumber === "string"
    ? displayPhoneNumber.trim()
    : "";
  const canonicalNumber = normalizeHybridWhatsappNumber(rawDisplayPhoneNumber);
  if (!rawDisplayPhoneNumber || !canonicalNumber) return null;
  return {
    rawDisplayPhoneNumber,
    canonicalNumber,
    maskedNumber: maskWebSessionNumber(canonicalNumber),
  };
}

export function buildMetaPublicWhatsappIdentityPayload(displayPhoneNumber: unknown) {
  const identity = resolveProviderConfirmedMetaPublicWhatsappIdentity(displayPhoneNumber);
  if (!identity) return null;
  return {
    provider: "meta" as const,
    evidence: "provider_confirmed_display_phone_number" as const,
    rawDisplayPhoneNumber: identity.rawDisplayPhoneNumber,
    canonicalNumber: identity.canonicalNumber,
    maskedNumber: identity.maskedNumber,
  };
}

function readCanonicalMetaPublicIdentityFromRawPayload(rawPayload: unknown): string | null {
  if (!isRecord(rawPayload)) return null;
  const publicWhatsappIdentity = rawPayload.publicWhatsappIdentity;
  if (!isRecord(publicWhatsappIdentity)) return null;
  return normalizeHybridWhatsappNumber(publicWhatsappIdentity.canonicalNumber);
}

export async function resolveOperationalMetaWhatsappIdentity(params: {
  prisma: PrismaClient;
  clientId: string;
}) {
  const tenantMetaConfig = (params.prisma as unknown as {
    tenantMetaConfig?: PrismaClient["tenantMetaConfig"];
  }).tenantMetaConfig;
  const waPhoneNumber = (params.prisma as unknown as {
    waPhoneNumber?: PrismaClient["waPhoneNumber"];
  }).waPhoneNumber;
  if (!tenantMetaConfig) {
    return {
      configured: false,
      canonicalNumber: null,
      maskedNumber: null,
      phoneNumberIdPresent: false,
      reason: "meta_not_configured" as const,
    };
  }
  const metaConfig = await tenantMetaConfig.findUnique({
    where: { clientId: params.clientId },
    select: {
      phoneNumberId: true,
      wabaId: true,
      businessToken: true,
      rawPayload: true,
    },
  });
  const businessToken = typeof metaConfig?.businessToken === "string"
    ? metaConfig.businessToken.trim()
    : "";
  const wabaId = typeof metaConfig?.wabaId === "string" ? metaConfig.wabaId.trim() : "";
  const phoneNumberId = typeof metaConfig?.phoneNumberId === "string"
    ? metaConfig.phoneNumberId.trim()
    : "";
  if (
    !phoneNumberId ||
    !businessToken ||
    !wabaId ||
    isMetaOperationallyRemoved(metaConfig?.rawPayload) ||
    !hasOperationalMetaSource(metaConfig?.rawPayload)
  ) {
    return {
      configured: false,
      canonicalNumber: null,
      maskedNumber: null,
      phoneNumberIdPresent: Boolean(phoneNumberId),
      reason: "meta_not_configured" as const,
    };
  }
  const phoneMapping = waPhoneNumber
    ? await waPhoneNumber.findFirst({
        where: { clientId: params.clientId, phoneNumberId },
        select: { display: true },
    })
    : null;
  const displayPhone = phoneMapping?.display?.trim() || extractMetaDisplayPhoneFromRawPayload(metaConfig?.rawPayload);
  const canonicalNumber =
    readCanonicalMetaPublicIdentityFromRawPayload(metaConfig?.rawPayload) ??
    normalizeHybridWhatsappNumber(displayPhone ?? "");
  if (!canonicalNumber) {
    return {
      configured: true,
      canonicalNumber: null,
      maskedNumber: null,
      phoneNumberIdPresent: true,
      reason: "meta_display_number_unavailable" as const,
    };
  }
  return {
    configured: true,
    canonicalNumber,
    maskedNumber: maskWebSessionNumber(canonicalNumber),
    phoneNumberIdPresent: true,
    reason: "ok" as const,
  };
}

function isMetaOperationallyRemoved(rawPayload: unknown) {
  if (!isRecord(rawPayload)) return false;
  const operationalStatus = rawPayload.operationalStatus;
  return isRecord(operationalStatus) && operationalStatus.state === "removed";
}

function hasOperationalMetaSource(rawPayload: unknown) {
  if (!isRecord(rawPayload)) return false;
  return typeof rawPayload.source === "string" && rawPayload.source.trim().length > 0;
}

function buildMetaRemovalRawPayload(rawPayload: unknown, actorUserId: string | null, requestId: string) {
  const previous = isRecord(rawPayload) ? rawPayload : {};
  return {
    ...previous,
    operationalStatus: {
      state: "removed",
      removedAt: new Date().toISOString(),
      removedBy: actorUserId,
      requestId,
    },
  } as Prisma.InputJsonValue;
}

export async function clearOperationalMetaWhatsappIdentity(params: {
  prisma: PrismaClient | Prisma.TransactionClient;
  clientId: string;
  actorUserId: string | null;
  requestId: string;
  reason: string;
}) {
  const tenantMetaConfig = (params.prisma as unknown as {
    tenantMetaConfig?: PrismaClient["tenantMetaConfig"];
  }).tenantMetaConfig;
  if (!tenantMetaConfig) return { cleared: false };
  const existing = await tenantMetaConfig.findUnique({
    where: { clientId: params.clientId },
    select: {
      id: true,
      phoneNumberId: true,
      wabaId: true,
      businessToken: true,
      rawPayload: true,
    },
  });
  if (!existing) return { cleared: false };
  const hadOperationalFields = Boolean(
    String(existing.phoneNumberId ?? "").trim() ||
      String(existing.wabaId ?? "").trim() ||
      String(existing.businessToken ?? "").trim()
  );
  await tenantMetaConfig.update({
    where: { clientId: params.clientId },
    data: {
      businessToken: null,
      businessId: null,
      businessPortfolioId: null,
      wabaId: null,
      phoneNumberId: null,
      rawPayload: buildMetaRemovalRawPayload(existing.rawPayload, params.actorUserId, params.requestId),
    },
  });
  const event = (params.prisma as unknown as { event?: PrismaClient["event"] }).event;
  if (event) {
    await event.create({
      data: {
        clientId: params.clientId,
        requestId: `${params.requestId}:meta-operational-identity-cleared`,
        eventName: "whatsapp.meta.operational_identity_cleared",
        payloadJson: {
          channel: "whatsapp",
          provider: "meta",
          reason: params.reason,
          actorUserId: params.actorUserId,
          hadOperationalFields,
        } as Prisma.InputJsonValue,
      },
    });
  }
  return { cleared: hadOperationalFields };
}

export async function resolveHybridWhatsappIdentityStatus(params: {
  prisma: PrismaClient;
  clientId: string;
}) {
  const [meta, webAuthorization] = await Promise.all([
    resolveOperationalMetaWhatsappIdentity(params),
    resolveWebSessionAuthorization(params),
  ]);
  const webNumber = webAuthorization.authorizedNumberCanonical;
  const conflict = Boolean(meta.canonicalNumber && webNumber && meta.canonicalNumber !== webNumber);
  return {
    meta,
    web: {
      status: webAuthorization.status,
      canonicalNumber: webNumber,
      maskedNumber: webAuthorization.authorizedNumberMasked,
    },
    conflict,
    logicalIdentity: meta.canonicalNumber
      ? {
          provider: "meta" as const,
          canonicalNumber: meta.canonicalNumber,
          maskedNumber: meta.maskedNumber,
        }
      : webNumber
        ? {
            provider: "web_session" as const,
            canonicalNumber: webNumber,
            maskedNumber: webAuthorization.authorizedNumberMasked,
          }
        : null,
  };
}

function readObservedWebSessionState(metadata: unknown) {
  if (!isRecord(metadata)) return null;
  const webSession = isRecord(metadata.webSession) ? metadata.webSession : {};
  return typeof webSession.observedState === "string" ? webSession.observedState : null;
}

export async function resolveOperationalWhatsappDisplayIdentity(params: {
  prisma: PrismaClient;
  clientId: string;
}) {
  const meta = await resolveOperationalMetaWhatsappIdentity(params);
  const channelAccount = (params.prisma as unknown as {
    channelAccount?: PrismaClient["channelAccount"];
  }).channelAccount;
  const webAccount = channelAccount
    ? await channelAccount.findFirst({
        where: {
          clientId: params.clientId,
          channel: "whatsapp",
          provider: "web_session",
          status: { not: "archived_duplicate" },
          runtimeEnabled: true,
        },
        select: { channelAccountId: true, metadata: true, status: true },
      })
    : null;
  const webCanonicalNumber =
    webAccount &&
    (webAccount.status === "connected" || readObservedWebSessionState(webAccount.metadata) === "CONNECTED")
      ? normalizeWebSessionAuthorizedNumber(webAccount.channelAccountId)
      : null;
  const webMaskedNumber = maskWebSessionNumber(webCanonicalNumber);

  if (meta.canonicalNumber && webCanonicalNumber && meta.canonicalNumber === webCanonicalNumber) {
    return {
      provider: "hybrid" as const,
      canonicalNumber: meta.canonicalNumber,
      maskedNumber: meta.maskedNumber,
    };
  }
  if (meta.canonicalNumber) {
    return {
      provider: "meta" as const,
      canonicalNumber: meta.canonicalNumber,
      maskedNumber: meta.maskedNumber,
    };
  }
  if (webCanonicalNumber) {
    return {
      provider: "web_session" as const,
      canonicalNumber: webCanonicalNumber,
      maskedNumber: webMaskedNumber,
    };
  }
  return {
    provider: "none" as const,
    canonicalNumber: null,
    maskedNumber: null,
  };
}

export async function validateWebSessionNumberAgainstMeta(params: {
  prisma: PrismaClient;
  clientId: string;
  number: string;
}) {
  const canonicalNumber = normalizeHybridWhatsappNumber(params.number);
  if (!canonicalNumber) {
    return { ok: false as const, code: "invalid_authorized_number", status: 400 };
  }
  const meta = await resolveOperationalMetaWhatsappIdentity({
    prisma: params.prisma,
    clientId: params.clientId,
  });
  if (meta.canonicalNumber && meta.canonicalNumber !== canonicalNumber) {
    return {
      ok: false as const,
      code: "web_session_meta_identity_mismatch",
      status: 409,
      metaNumberMasked: meta.maskedNumber,
      webNumberMasked: maskWebSessionNumber(canonicalNumber),
    };
  }
  return { ok: true as const, canonicalNumber };
}

export async function validateObservedWebSessionIdentityAgainstMeta(params: {
  prisma: PrismaClient;
  clientId: string;
  observedIdentity: string;
}) {
  const observedNumber = normalizeHybridWhatsappNumber(params.observedIdentity);
  if (!observedNumber) return null;
  const meta = await resolveOperationalMetaWhatsappIdentity({
    prisma: params.prisma,
    clientId: params.clientId,
  });
  if (!meta.canonicalNumber || meta.canonicalNumber === observedNumber) return null;
  return {
    expectedIdentityMasked: meta.maskedNumber,
    observedIdentityMasked: maskWebSessionNumber(observedNumber),
  };
}

export function readWhatsappPrimaryTransportFromConfig(config: unknown): WhatsappPrimaryTransport | null {
  if (!isRecord(config)) return null;
  const value = config.whatsappPrimaryTransport;
  return value === "meta" || value === "web_session" ? value : null;
}

export async function resolveWhatsappPrimaryTransport(params: {
  prisma: PrismaClient;
  clientId: string;
}) {
  const config = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  return readWhatsappPrimaryTransportFromConfig(config?.config);
}

export async function saveWhatsappPrimaryTransport(params: {
  prisma: PrismaClient;
  clientId: string;
  provider: WhatsappPrimaryTransport;
}) {
  const existing = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
  await params.prisma.tenantOperationalConfig.upsert({
    where: { clientId: params.clientId },
    update: {
      schemaVersion: 1,
      config: { ...existingConfig, whatsappPrimaryTransport: params.provider } as Prisma.InputJsonValue,
    },
    create: {
      clientId: params.clientId,
      schemaVersion: 1,
      config: { ...existingConfig, whatsappPrimaryTransport: params.provider } as Prisma.InputJsonValue,
    },
  });
  return params.provider;
}

export async function clearWhatsappPrimaryTransport(params: {
  prisma: PrismaClient | Prisma.TransactionClient;
  clientId: string;
}) {
  const existing = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  if (!isRecord(existing?.config) || !("whatsappPrimaryTransport" in existing.config)) {
    return { cleared: false };
  }
  const nextConfig = { ...existing.config };
  delete nextConfig.whatsappPrimaryTransport;
  await params.prisma.tenantOperationalConfig.update({
    where: { clientId: params.clientId },
    data: {
      schemaVersion: 1,
      config: nextConfig as Prisma.InputJsonValue,
    },
  });
  return { cleared: true };
}

export async function invalidateWebSessionForMetaIdentityChange(params: {
  prisma: PrismaClient;
  client: { id: string; clientKey: string };
  actorUserId: string | null;
  requestId: string;
  newMetaNumber: string | null;
}) {
  const accounts = await params.prisma.channelAccount.findMany({
    where: {
      clientId: params.client.id,
      channel: "whatsapp",
      provider: "web_session",
      status: { not: "archived_duplicate" },
    },
    select: { id: true, channelAccountId: true, metadata: true },
  });
  for (const account of accounts) {
    clearWebSessionQrForRuntime(account.id);
    await clearAllWebSessionAuthState({
      prisma: params.prisma,
      tenantKey: params.client.clientKey,
      channelAccountId: account.channelAccountId,
    });
    await params.prisma.channelAccount.update({
      where: { id: account.id },
      data: {
        runtimeEnabled: false,
        inboundPersistenceEnabled: false,
        outboundEnabled: false,
        status: "disabled",
        metadata: webSessionMetadataPatch(account.metadata, {
          desiredState: "DISCONNECTED",
          observedState: "DISCONNECTED",
          lastErrorCode: "meta_identity_changed",
          reconnectCount: 0,
        }),
      },
    });
  }
  await markWebSessionAuthorizationInvalidatedByMetaIdentityChange({
    prisma: params.prisma,
    clientId: params.client.id,
    actorUserId: params.actorUserId,
  });
  await persistEvent({
    clientId: params.client.id,
    requestId: `${params.requestId}:web-session-invalidated-by-meta`,
    eventName: "whatsapp.web.authorization.invalidated",
    payloadJson: {
      channel: "whatsapp",
      provider: "web_session",
      reason: "meta_identity_changed",
      actorUserId: params.actorUserId,
      newMetaNumber: {
        masked: maskWebSessionNumber(params.newMetaNumber),
        hash: fingerprintWebSessionNumber(params.newMetaNumber),
      },
      affectedAccounts: accounts.length,
    },
  });
  return { affectedAccounts: accounts.length };
}
