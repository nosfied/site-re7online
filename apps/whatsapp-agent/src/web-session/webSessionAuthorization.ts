import { withLockedTenantOperationalConfig } from "../config/tenantOperationalConfigStore.js";
import crypto from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

export type WebSessionAuthorizationStatus =
  | "AUTHORIZED"
  | "OWNED"
  | "RELEASED"
  | "INVALIDATED_BY_META_IDENTITY_CHANGE";

export type WebSessionAuthorization = {
  status: WebSessionAuthorizationStatus;
  authorizedNumberCanonical: string | null;
  authorizedNumberMasked: string | null;
  authorizedAt: string | null;
  authorizedBy: string | null;
  releasedAt: string | null;
  releasedBy: string | null;
  invalidatedAt: string | null;
  invalidatedBy: string | null;
  invalidationReason: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeWebSessionAuthorizedNumber(value: unknown) {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

export function maskWebSessionNumber(value: string | null | undefined) {
  const digits = normalizeWebSessionAuthorizedNumber(value ?? "");
  if (!digits) return null;
  return `****${digits.slice(-4)}`;
}

export function fingerprintWebSessionNumber(value: string | null | undefined) {
  const digits = normalizeWebSessionAuthorizedNumber(value ?? "");
  if (!digits) return null;
  return crypto.createHash("sha256").update(digits).digest("hex").slice(0, 16);
}

export function readWebSessionAuthorizationFromConfig(config: unknown): WebSessionAuthorization {
  const record = isRecord(config) ? config : {};
  const webSession = isRecord(record.webSessionAuthorization) ? record.webSessionAuthorization : {};
  const canonical = normalizeWebSessionAuthorizedNumber(webSession.authorizedNumberCanonical);
  const status =
    webSession.status === "INVALIDATED_BY_META_IDENTITY_CHANGE"
      ? "INVALIDATED_BY_META_IDENTITY_CHANGE"
      : webSession.status === "OWNED" && canonical
      ? "OWNED"
      : webSession.status === "AUTHORIZED" && canonical
        ? "AUTHORIZED"
        : webSession.status === "RELEASED"
          ? "RELEASED"
          : canonical
            ? "AUTHORIZED"
            : "RELEASED";
  return {
    status,
    authorizedNumberCanonical:
      status === "RELEASED" || status === "INVALIDATED_BY_META_IDENTITY_CHANGE" ? null : canonical,
    authorizedNumberMasked:
      status === "RELEASED" || status === "INVALIDATED_BY_META_IDENTITY_CHANGE"
        ? null
        : maskWebSessionNumber(canonical),
    authorizedAt: typeof webSession.authorizedAt === "string" ? webSession.authorizedAt : null,
    authorizedBy: typeof webSession.authorizedBy === "string" ? webSession.authorizedBy : null,
    releasedAt: typeof webSession.releasedAt === "string" ? webSession.releasedAt : null,
    releasedBy: typeof webSession.releasedBy === "string" ? webSession.releasedBy : null,
    invalidatedAt: typeof webSession.invalidatedAt === "string" ? webSession.invalidatedAt : null,
    invalidatedBy: typeof webSession.invalidatedBy === "string" ? webSession.invalidatedBy : null,
    invalidationReason:
      typeof webSession.invalidationReason === "string" ? webSession.invalidationReason : null,
  };
}

export async function resolveWebSessionAuthorization(params: {
  prisma: PrismaClient;
  clientId: string;
}) {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  return readWebSessionAuthorizationFromConfig(record?.config);
}

export async function saveWebSessionAuthorization(params: {
  prisma: PrismaClient;
  clientId: string;
  actorUserId: string;
  number: string;
}) {
  const canonical = normalizeWebSessionAuthorizedNumber(params.number);
  if (!canonical) return { ok: false as const, error: "invalid_authorized_number" };
  const now = new Date().toISOString();
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
    const existing = await params.prisma.tenantOperationalConfig.findUnique({
      where: { clientId: params.clientId },
      select: { config: true },
    });
    const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
    const current = readWebSessionAuthorizationFromConfig(existing?.config);
    const next = {
      status: current.status === "OWNED" && current.authorizedNumberCanonical === canonical ? "OWNED" : "AUTHORIZED",
      authorizedNumberCanonical: canonical,
      authorizedNumberMasked: maskWebSessionNumber(canonical),
      authorizedNumberHash: fingerprintWebSessionNumber(canonical),
      authorizedAt: now,
      authorizedBy: params.actorUserId,
      releasedAt: null,
      releasedBy: null,
    };
    await params.prisma.tenantOperationalConfig.upsert({
      where: { clientId: params.clientId },
      update: {
        schemaVersion: 1,
        config: { ...existingConfig, webSessionAuthorization: next } as Prisma.InputJsonValue,
      },
      create: {
        clientId: params.clientId,
        schemaVersion: 1,
        config: { ...existingConfig, webSessionAuthorization: next } as Prisma.InputJsonValue,
      },
    });
    return { ok: true as const, authorization: readWebSessionAuthorizationFromConfig({ webSessionAuthorization: next }) };
  });
}

export async function markWebSessionAuthorizationOwned(params: {
  prisma: PrismaClient;
  clientId: string;
  actorUserId?: string | null;
  observedIdentity: string;
}) {
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
    const current = await resolveWebSessionAuthorization({ prisma: params.prisma, clientId: params.clientId });
    const canonical = normalizeWebSessionAuthorizedNumber(params.observedIdentity);
    if (!canonical || current.authorizedNumberCanonical !== canonical) return current;
    const existing = await params.prisma.tenantOperationalConfig.findUnique({
      where: { clientId: params.clientId },
      select: { config: true },
    });
    const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
    const webSessionAuthorization = {
      ...(isRecord(existingConfig.webSessionAuthorization) ? existingConfig.webSessionAuthorization : {}),
      status: "OWNED",
      authorizedNumberCanonical: canonical,
      authorizedNumberMasked: maskWebSessionNumber(canonical),
      authorizedNumberHash: fingerprintWebSessionNumber(canonical),
      ownedAt: new Date().toISOString(),
      ownedBy: params.actorUserId ?? null,
    };
    await params.prisma.tenantOperationalConfig.upsert({
      where: { clientId: params.clientId },
      update: { schemaVersion: 1, config: { ...existingConfig, webSessionAuthorization } as Prisma.InputJsonValue },
      create: { clientId: params.clientId, schemaVersion: 1, config: { ...existingConfig, webSessionAuthorization } as Prisma.InputJsonValue },
    });
    return readWebSessionAuthorizationFromConfig({ webSessionAuthorization });
  }, { createIfMissing: false, onMissing: () => readWebSessionAuthorizationFromConfig({}) });
}

export async function markWebSessionAuthorizationReleased(params: {
  prisma: PrismaClient;
  clientId: string;
  actorUserId: string;
}) {
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
    const existing = await params.prisma.tenantOperationalConfig.findUnique({
      where: { clientId: params.clientId },
      select: { config: true },
    });
    const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
    const current = readWebSessionAuthorizationFromConfig(existing?.config);
    const webSessionAuthorization = {
      status: "RELEASED",
      previousNumberMasked: current.authorizedNumberMasked,
      previousNumberHash: fingerprintWebSessionNumber(current.authorizedNumberCanonical),
      releasedAt: new Date().toISOString(),
      releasedBy: params.actorUserId,
    };
    await params.prisma.tenantOperationalConfig.upsert({
      where: { clientId: params.clientId },
      update: { schemaVersion: 1, config: { ...existingConfig, webSessionAuthorization } as Prisma.InputJsonValue },
      create: { clientId: params.clientId, schemaVersion: 1, config: { ...existingConfig, webSessionAuthorization } as Prisma.InputJsonValue },
    });
    return readWebSessionAuthorizationFromConfig({ webSessionAuthorization });
  });
}

export async function markWebSessionAuthorizationInvalidatedByMetaIdentityChange(params: {
  prisma: PrismaClient;
  clientId: string;
  actorUserId: string | null;
  reason?: string | null;
}) {
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
    const existing = await params.prisma.tenantOperationalConfig.findUnique({
      where: { clientId: params.clientId },
      select: { config: true },
    });
    const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
    const current = readWebSessionAuthorizationFromConfig(existing?.config);
    const webSessionAuthorization = {
      status: "INVALIDATED_BY_META_IDENTITY_CHANGE",
      previousNumberMasked: current.authorizedNumberMasked,
      previousNumberHash: fingerprintWebSessionNumber(current.authorizedNumberCanonical),
      invalidatedAt: new Date().toISOString(),
      invalidatedBy: params.actorUserId,
      invalidationReason: params.reason ?? "meta_identity_changed",
    };
    await params.prisma.tenantOperationalConfig.upsert({
      where: { clientId: params.clientId },
      update: { schemaVersion: 1, config: { ...existingConfig, webSessionAuthorization } as Prisma.InputJsonValue },
      create: { clientId: params.clientId, schemaVersion: 1, config: { ...existingConfig, webSessionAuthorization } as Prisma.InputJsonValue },
    });
    return readWebSessionAuthorizationFromConfig({ webSessionAuthorization });
  });
}
