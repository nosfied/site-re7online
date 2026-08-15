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
  const phoneNumberId = typeof metaConfig?.phoneNumberId === "string"
    ? metaConfig.phoneNumberId.trim()
    : "";
  if (!phoneNumberId) {
    return {
      configured: false,
      canonicalNumber: null,
      maskedNumber: null,
      phoneNumberIdPresent: false,
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
  const canonicalNumber = normalizeHybridWhatsappNumber(displayPhone ?? "");
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
