import type { Prisma, PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { issueClientAuthToken } from "../auth/clientAuth.js";

export const PLATFORM_SUPPORT_GRANT_DURATIONS_HOURS = [1, 4, 8, 24] as const;
export type PlatformSupportGrantDurationHours = (typeof PLATFORM_SUPPORT_GRANT_DURATIONS_HOURS)[number];

type SupportPrisma = PrismaClient | Prisma.TransactionClient;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getPlatformSupportTenantKey() {
  return (process.env.PLATFORM_SUPPORT_ACCESS_TENANT_KEY || process.env.PLATFORM_SUPPORT_TENANT_KEY || env.PLATFORM_SUPPORT_TENANT_KEY || "")
    .trim();
}

export function normalizePlatformSupportDurationHours(value: unknown): PlatformSupportGrantDurationHours | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  return PLATFORM_SUPPORT_GRANT_DURATIONS_HOURS.includes(parsed as PlatformSupportGrantDurationHours)
    ? (parsed as PlatformSupportGrantDurationHours)
    : null;
}

function normalizeReason(value: unknown) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text ? text.slice(0, 240) : null;
}

function publicGrant(grant: {
  id: string;
  reason: string | null;
  scope: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
  grantedBy?: { id: string; name: string } | null;
  revokedBy?: { id: string; name: string } | null;
}) {
  const now = new Date();
  const active = !grant.revokedAt && grant.expiresAt.getTime() > now.getTime();
  return {
    id: grant.id,
    active,
    status: active ? "AUTHORIZED" : grant.revokedAt ? "REVOKED" : "EXPIRED",
    scope: grant.scope,
    reason: grant.reason,
    createdAt: grant.createdAt.toISOString(),
    expiresAt: grant.expiresAt.toISOString(),
    revokedAt: grant.revokedAt?.toISOString() ?? null,
    revokeReason: grant.revokeReason,
    grantedBy: grant.grantedBy ? { id: grant.grantedBy.id, name: grant.grantedBy.name } : null,
    revokedBy: grant.revokedBy ? { id: grant.revokedBy.id, name: grant.revokedBy.name } : null,
  };
}

async function recordSupportEvent(params: {
  prisma: SupportPrisma;
  clientId: string;
  eventName: string;
  requestId: string;
  payload: Record<string, unknown>;
}) {
  await params.prisma.event.create({
    data: {
      clientId: params.clientId,
      eventName: params.eventName,
      requestId: params.requestId,
      payloadJson: params.payload as Prisma.InputJsonObject,
    },
  });
}

export async function getCurrentPlatformSupportGrant(params: {
  prisma: SupportPrisma;
  clientId: string;
}) {
  const grant = await params.prisma.platformSupportAccessGrant.findFirst({
    where: {
      clientId: params.clientId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      grantedBy: { select: { id: true, name: true } },
      revokedBy: { select: { id: true, name: true } },
    },
  });
  return grant ? publicGrant(grant) : null;
}

export async function grantPlatformSupportAccess(params: {
  prisma: PrismaClient;
  clientId: string;
  actorUserId: string;
  durationHours: unknown;
  reason: unknown;
  requestId: string;
}) {
  const durationHours = normalizePlatformSupportDurationHours(params.durationHours);
  if (!durationHours) {
    return { ok: false as const, status: 400, error: "invalid_duration" };
  }
  const reason = normalizeReason(params.reason);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);
  const result = await params.prisma.$transaction(async (tx) => {
    await tx.platformSupportAccessGrant.updateMany({
      where: {
        clientId: params.clientId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        revokedAt: now,
        revokedByUserId: params.actorUserId,
        revokeReason: "replaced_by_new_grant",
      },
    });
    await tx.platformSupportSession.updateMany({
      where: {
        actingClientId: params.clientId,
        endedAt: null,
      },
      data: {
        endedAt: now,
        endReason: "grant_replaced",
      },
    });
    const grant = await tx.platformSupportAccessGrant.create({
      data: {
        clientId: params.clientId,
        grantedByUserId: params.actorUserId,
        reason,
        scope: "ADMIN",
        expiresAt,
      },
      include: {
        grantedBy: { select: { id: true, name: true } },
        revokedBy: { select: { id: true, name: true } },
      },
    });
    await recordSupportEvent({
      prisma: tx,
      clientId: params.clientId,
      eventName: "support.access.granted",
      requestId: `${params.requestId}:support-access-granted:${grant.id}`,
      payload: {
        actorUserId: params.actorUserId,
        grantId: grant.id,
        scope: grant.scope,
        durationHours,
        expiresAt: grant.expiresAt.toISOString(),
        reasonPresent: Boolean(reason),
      },
    });
    return grant;
  });
  return { ok: true as const, grant: publicGrant(result) };
}

export async function revokePlatformSupportAccess(params: {
  prisma: PrismaClient;
  clientId: string;
  actorUserId: string;
  requestId: string;
}) {
  const now = new Date();
  const grant = await params.prisma.platformSupportAccessGrant.findFirst({
    where: {
      clientId: params.clientId,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  if (!grant) return { ok: false as const, status: 404, error: "support_access_not_active" };
  await params.prisma.$transaction(async (tx) => {
    await tx.platformSupportAccessGrant.update({
      where: { id: grant.id },
      data: {
        revokedAt: now,
        revokedByUserId: params.actorUserId,
        revokeReason: "tenant_revoked",
      },
    });
    await tx.platformSupportSession.updateMany({
      where: { grantId: grant.id, endedAt: null },
      data: { endedAt: now, endReason: "grant_revoked" },
    });
    await recordSupportEvent({
      prisma: tx,
      clientId: params.clientId,
      eventName: "support.access.revoked",
      requestId: `${params.requestId}:support-access-revoked:${grant.id}`,
      payload: {
        actorUserId: params.actorUserId,
        grantId: grant.id,
        reason: "tenant_revoked",
      },
    });
  });
  return { ok: true as const, grant: await getCurrentPlatformSupportGrant({ prisma: params.prisma, clientId: params.clientId }) };
}

export async function createPlatformSupportSession(params: {
  prisma: PrismaClient;
  actingClientKey: string;
  supportClientId: string;
  supportUserId: string;
  supportUserName: string;
  supportUserEmail: string;
  supportUserRole: string;
  sourceAppSessionId?: string | null;
  requestId: string;
}) {
  const supportTenantKey = getPlatformSupportTenantKey();
  if (!supportTenantKey) return { ok: false as const, status: 503, error: "support_access_unavailable" };
  const supportClient = await params.prisma.client.findUnique({
    where: { clientKey: supportTenantKey },
    select: { id: true, status: true },
  });
  if (!supportClient || supportClient.id !== params.supportClientId) {
    return { ok: false as const, status: 403, error: "support_identity_required" };
  }
  if (!["ADMIN", "SUPERVISOR"].includes(params.supportUserRole.trim().toUpperCase())) {
    return { ok: false as const, status: 403, error: "support_identity_required" };
  }
  const target = await params.prisma.client.findUnique({
    where: { clientKey: params.actingClientKey },
    select: { id: true, clientKey: true, name: true, status: true, features: true, profile: true },
  });
  if (!target) return { ok: false as const, status: 404, error: "tenant_not_found" };
  const now = new Date();
  const grant = await params.prisma.platformSupportAccessGrant.findFirst({
    where: {
      clientId: target.id,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (!grant) return { ok: false as const, status: 403, error: "support_access_not_authorized" };
  const session = await params.prisma.platformSupportSession.create({
    data: {
      grantId: grant.id,
      actingClientId: target.id,
      supportClientId: params.supportClientId,
      supportUserId: params.supportUserId,
      sourceAppSessionId: params.sourceAppSessionId ?? null,
      expiresAt: grant.expiresAt,
    },
    select: { id: true, expiresAt: true },
  });
  await recordSupportEvent({
    prisma: params.prisma,
    clientId: target.id,
    eventName: "support.access.entered",
    requestId: `${params.requestId}:support-access-entered:${session.id}`,
    payload: {
      supportUserId: params.supportUserId,
      supportClientId: params.supportClientId,
      supportSessionId: session.id,
      grantId: grant.id,
      actingClientId: target.id,
      actingClientKey: target.clientKey,
      scope: grant.scope,
      expiresAt: session.expiresAt.toISOString(),
    },
  });
  const token = issueClientAuthToken(
    {
      id: params.supportUserId,
      clientId: target.id,
      name: params.supportUserName,
      email: params.supportUserEmail,
      role: "ADMIN",
      supportAccess: {
        accessType: "platform_support",
        grantId: grant.id,
        supportClientId: params.supportClientId,
        supportUserId: params.supportUserId,
        sourceAppSessionId: params.sourceAppSessionId ?? null,
      },
    },
    session.id,
    session.expiresAt
  );
  return {
    ok: true as const,
    token,
    expiresAt: session.expiresAt.toISOString(),
    client: target,
    supportAccess: {
      accessType: "platform_support" as const,
      grantId: grant.id,
      supportSessionId: session.id,
      supportClientId: params.supportClientId,
      supportUserId: params.supportUserId,
      expiresAt: session.expiresAt.toISOString(),
    },
  };
}

export function isPlatformSupportContext(value: unknown) {
  return isRecord(value) && value.accessType === "platform_support";
}
