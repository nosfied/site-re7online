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

export type WhatsappNumberReplacement = {
  status: "ACTIVE";
  targetNumberCanonical: string;
  targetNumberMasked: string | null;
  previousMetaNumberMasked: string | null;
  previousWebNumberMasked: string | null;
  startedAt: string | null;
  startedBy: string | null;
};

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
  if (!metaConfig) {
    const legacyPhoneMapping = waPhoneNumber
      ? await waPhoneNumber.findFirst({
          where: { clientId: params.clientId, display: { not: null } },
          select: { display: true, phoneNumberId: true },
          orderBy: { createdAt: "asc" },
        })
      : null;
    const canonicalNumber = normalizeHybridWhatsappNumber(legacyPhoneMapping?.display ?? "");
    if (canonicalNumber) {
      return {
        configured: true,
        canonicalNumber,
        maskedNumber: maskWebSessionNumber(canonicalNumber),
        phoneNumberIdPresent: Boolean(String(legacyPhoneMapping?.phoneNumberId ?? "").trim()),
        reason: "legacy_wa_phone_number_display" as const,
      };
    }
  }
  const businessToken = typeof metaConfig?.businessToken === "string"
    ? metaConfig.businessToken.trim()
    : "";
  const wabaId = typeof metaConfig?.wabaId === "string" ? metaConfig.wabaId.trim() : "";
  const phoneNumberId = typeof metaConfig?.phoneNumberId === "string"
    ? metaConfig.phoneNumberId.trim()
    : "";
  const phoneMapping = waPhoneNumber
    ? await waPhoneNumber.findFirst({
        where: { clientId: params.clientId, phoneNumberId },
        select: { display: true },
      })
    : null;
  const providerConfirmedPhoneMappingIdentity =
    phoneMapping?.display
      ? resolveProviderConfirmedMetaPublicWhatsappIdentity(phoneMapping.display)
      : null;

  if (
    !phoneNumberId ||
    !businessToken ||
    !wabaId ||
    isMetaOperationallyRemoved(metaConfig?.rawPayload) ||
    (!hasOperationalMetaSource(metaConfig?.rawPayload) && !providerConfirmedPhoneMappingIdentity)
  ) {
    return {
      configured: false,
      canonicalNumber: null,
      maskedNumber: null,
      phoneNumberIdPresent: Boolean(phoneNumberId),
      reason: "meta_not_configured" as const,
    };
  }
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

export function readWhatsappNumberReplacementFromConfig(config: unknown): WhatsappNumberReplacement | null {
  const record = isRecord(config) ? config : {};
  const replacement = isRecord(record.whatsappNumberReplacement)
    ? record.whatsappNumberReplacement
    : null;
  if (!replacement || replacement.status !== "ACTIVE") return null;
  const targetNumberCanonical = normalizeHybridWhatsappNumber(replacement.targetNumberCanonical);
  if (!targetNumberCanonical) return null;
  return {
    status: "ACTIVE",
    targetNumberCanonical,
    targetNumberMasked: maskWebSessionNumber(targetNumberCanonical),
    previousMetaNumberMasked:
      typeof replacement.previousMetaNumberMasked === "string"
        ? replacement.previousMetaNumberMasked
        : null,
    previousWebNumberMasked:
      typeof replacement.previousWebNumberMasked === "string"
        ? replacement.previousWebNumberMasked
        : null,
    startedAt: typeof replacement.startedAt === "string" ? replacement.startedAt : null,
    startedBy: typeof replacement.startedBy === "string" ? replacement.startedBy : null,
  };
}

export async function resolveWhatsappNumberReplacement(params: {
  prisma: PrismaClient;
  clientId: string;
}) {
  const config = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  return readWhatsappNumberReplacementFromConfig(config?.config);
}

export async function startWhatsappNumberReplacement(params: {
  prisma: PrismaClient;
  clientId: string;
  actorUserId: string | null;
  requestId: string;
  targetNumber: string;
}) {
  const targetNumberCanonical = normalizeHybridWhatsappNumber(params.targetNumber);
  if (!targetNumberCanonical) {
    return { ok: false as const, status: 400, code: "invalid_replacement_number" };
  }
  const now = new Date().toISOString();
  const existing = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
  const [meta, webAuthorization] = await Promise.all([
    resolveOperationalMetaWhatsappIdentity(params),
    resolveWebSessionAuthorization(params),
  ]);
  const whatsappNumberReplacement = {
    status: "ACTIVE",
    targetNumberCanonical,
    targetNumberMasked: maskWebSessionNumber(targetNumberCanonical),
    targetNumberHash: fingerprintWebSessionNumber(targetNumberCanonical),
    previousMetaNumberMasked: meta.maskedNumber,
    previousMetaNumberHash: fingerprintWebSessionNumber(meta.canonicalNumber),
    previousWebNumberMasked: webAuthorization.authorizedNumberMasked,
    previousWebNumberHash: fingerprintWebSessionNumber(webAuthorization.authorizedNumberCanonical),
    startedAt: now,
    startedBy: params.actorUserId,
  };
  const nextConfig: Record<string, unknown> = {
    ...existingConfig,
    whatsappNumberReplacement,
  };
  delete nextConfig.whatsappPrimaryTransport;
  await params.prisma.tenantOperationalConfig.upsert({
    where: { clientId: params.clientId },
    update: { schemaVersion: 1, config: nextConfig as Prisma.InputJsonValue },
    create: {
      clientId: params.clientId,
      schemaVersion: 1,
      config: nextConfig as Prisma.InputJsonValue,
    },
  });
  await clearOperationalMetaWhatsappIdentity({
    prisma: params.prisma,
    clientId: params.clientId,
    actorUserId: params.actorUserId,
    requestId: params.requestId,
    reason: "admin_whatsapp_number_replacement_started",
  });
  const event = (params.prisma as unknown as { event?: PrismaClient["event"] }).event;
  if (event) {
    await event.create({
      data: {
        clientId: params.clientId,
        requestId: `${params.requestId}:whatsapp-number-replacement-started`,
        eventName: "whatsapp.number_replacement.started",
        payloadJson: {
          channel: "whatsapp",
          actorUserId: params.actorUserId,
          targetNumber: {
            masked: maskWebSessionNumber(targetNumberCanonical),
            hash: fingerprintWebSessionNumber(targetNumberCanonical),
          },
          previousMetaNumber: {
            masked: meta.maskedNumber,
            hash: fingerprintWebSessionNumber(meta.canonicalNumber),
          },
          previousWebNumber: {
            masked: webAuthorization.authorizedNumberMasked,
            hash: fingerprintWebSessionNumber(webAuthorization.authorizedNumberCanonical),
          },
          primaryTransportCleared: "whatsappPrimaryTransport" in existingConfig,
          metaIdentityCleared: Boolean(meta.canonicalNumber || meta.phoneNumberIdPresent),
        } as Prisma.InputJsonValue,
      },
    });
  }
  return {
    ok: true as const,
    replacement: readWhatsappNumberReplacementFromConfig({ whatsappNumberReplacement }),
  };
}

export async function cancelWhatsappNumberReplacement(params: {
  prisma: PrismaClient;
  clientId: string;
  actorUserId: string | null;
  requestId: string;
}) {
  const existing = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
  const current = readWhatsappNumberReplacementFromConfig(existingConfig);
  if (!current) return { cancelled: false, replacement: null };
  const nextConfig = { ...existingConfig };
  delete nextConfig.whatsappNumberReplacement;
  await params.prisma.tenantOperationalConfig.upsert({
    where: { clientId: params.clientId },
    update: { schemaVersion: 1, config: nextConfig as Prisma.InputJsonValue },
    create: {
      clientId: params.clientId,
      schemaVersion: 1,
      config: nextConfig as Prisma.InputJsonValue,
    },
  });
  const event = (params.prisma as unknown as { event?: PrismaClient["event"] }).event;
  if (event) {
    await event.create({
      data: {
        clientId: params.clientId,
        requestId: `${params.requestId}:whatsapp-number-replacement-cancelled`,
        eventName: "whatsapp.number_replacement.cancelled",
        payloadJson: {
          channel: "whatsapp",
          actorUserId: params.actorUserId,
          targetNumber: {
            masked: current.targetNumberMasked,
            hash: fingerprintWebSessionNumber(current.targetNumberCanonical),
          },
        } as Prisma.InputJsonValue,
      },
    });
  }
  return { cancelled: true, replacement: null };
}

export async function completeWhatsappNumberReplacementIfMatched(params: {
  prisma: PrismaClient;
  clientId: string;
  actorUserId: string | null;
  requestId: string;
  confirmedNumber: string | null | undefined;
  source: string;
}) {
  const confirmedNumberCanonical = normalizeHybridWhatsappNumber(params.confirmedNumber ?? "");
  if (!confirmedNumberCanonical) {
    return { completed: false as const, reason: "missing_confirmed_number" as const };
  }
  const existing = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
  const current = readWhatsappNumberReplacementFromConfig(existingConfig);
  if (!current) {
    return { completed: false as const, reason: "no_active_replacement" as const };
  }
  if (current.targetNumberCanonical !== confirmedNumberCanonical) {
    return { completed: false as const, reason: "target_mismatch" as const };
  }
  const nextConfig = { ...existingConfig };
  delete nextConfig.whatsappNumberReplacement;
  await params.prisma.tenantOperationalConfig.upsert({
    where: { clientId: params.clientId },
    update: { schemaVersion: 1, config: nextConfig as Prisma.InputJsonValue },
    create: {
      clientId: params.clientId,
      schemaVersion: 1,
      config: nextConfig as Prisma.InputJsonValue,
    },
  });
  const event = (params.prisma as unknown as { event?: PrismaClient["event"] }).event;
  if (event) {
    await event.create({
      data: {
        clientId: params.clientId,
        requestId: `${params.requestId}:whatsapp-number-replacement-completed`,
        eventName: "whatsapp.number_replacement.completed",
        payloadJson: {
          channel: "whatsapp",
          actorUserId: params.actorUserId,
          source: params.source,
          targetNumber: {
            masked: current.targetNumberMasked,
            hash: fingerprintWebSessionNumber(current.targetNumberCanonical),
          },
        } as Prisma.InputJsonValue,
      },
    });
  }
  return { completed: true as const, replacement: null };
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
  const [meta, webAuthorization, numberReplacement] = await Promise.all([
    resolveOperationalMetaWhatsappIdentity(params),
    resolveWebSessionAuthorization(params),
    resolveWhatsappNumberReplacement(params),
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
    numberReplacement,
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
  if (meta.canonicalNumber && webCanonicalNumber) {
    return {
      provider: "web_session" as const,
      canonicalNumber: webCanonicalNumber,
      maskedNumber: webMaskedNumber,
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
  const [meta, replacement] = await Promise.all([
    resolveOperationalMetaWhatsappIdentity({
      prisma: params.prisma,
      clientId: params.clientId,
    }),
    resolveWhatsappNumberReplacement({
      prisma: params.prisma,
      clientId: params.clientId,
    }),
  ]);
  if (replacement && replacement.targetNumberCanonical !== canonicalNumber) {
    return {
      ok: false as const,
      code: "web_session_replacement_target_mismatch",
      status: 409,
      targetNumberMasked: replacement.targetNumberMasked,
      webNumberMasked: maskWebSessionNumber(canonicalNumber),
    };
  }
  if (replacement && replacement.targetNumberCanonical === canonicalNumber) {
    return { ok: true as const, canonicalNumber };
  }
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
  await params.prisma.tenantOperationalConfig.upsert({
    where: { clientId: params.clientId },
    update: {
      schemaVersion: 1,
      config: nextConfig as Prisma.InputJsonValue,
    },
    create: {
      clientId: params.clientId,
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
