import crypto from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { PrismaClient } from "@prisma/client";
import { logger } from "../logger/logger.js";

export const PUBLIC_API_SCOPES = [
  "read",
  "write",
  "contacts",
  "conversations",
  "messages",
  "campaigns",
  "webhooks",
] as const;

export type PublicApiScope = (typeof PUBLIC_API_SCOPES)[number];

const PUBLIC_API_KEY_PREFIX = "cvt_live";
const DEFAULT_RATE_LIMIT_PER_MINUTE = 120;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitBuckets = new Map<string, { count: number; windowStart: number; lastSeen: number }>();

export type PublicApiAuth = {
  apiKeyId: string;
  clientId: string;
  clientKey: string;
  tenantName: string;
  keyPrefix: string;
  scopes: PublicApiScope[];
  rateLimitPerMinute: number;
};

export function normalizePublicApiScopes(value: unknown) {
  const input = Array.isArray(value) ? value : [];
  const seen = new Set<PublicApiScope>();
  for (const item of input) {
    const scope = String(item ?? "").trim().toLowerCase();
    if ((PUBLIC_API_SCOPES as readonly string[]).includes(scope)) {
      seen.add(scope as PublicApiScope);
    }
  }
  return Array.from(seen);
}

export function hashPublicApiKey(secret: string) {
  return crypto.createHash("sha256").update(secret, "utf8").digest("hex");
}

export function generatePublicApiKeySecret() {
  const random = crypto.randomBytes(32).toString("base64url");
  return `${PUBLIC_API_KEY_PREFIX}_${random}`;
}

export function getPublicApiKeyPrefix(secret: string) {
  const [namespace, environment, random = ""] = secret.split("_");
  return `${namespace ?? "cvt"}_${environment ?? "live"}_${random.slice(0, 8)}`;
}

function getBearerToken(req: IncomingMessage) {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string") {
    const [scheme, token] = authHeader.split(" ");
    if (scheme?.toLowerCase() === "bearer" && token?.trim()) {
      return token.trim();
    }
  }
  const apiKeyHeader = req.headers["x-converta-api-key"];
  if (typeof apiKeyHeader === "string" && apiKeyHeader.trim()) {
    return apiKeyHeader.trim();
  }
  return "";
}

export function serializePublicApiKey(item: {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: unknown;
  status: string;
  rateLimitPerMinute: number | null;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    name: item.name,
    keyPrefix: item.keyPrefix,
    scopes: normalizePublicApiScopes(item.scopes),
    status: item.status,
    rateLimitPerMinute: item.rateLimitPerMinute,
    lastUsedAt: item.lastUsedAt?.toISOString() ?? null,
    expiresAt: item.expiresAt?.toISOString() ?? null,
    revokedAt: item.revokedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function listPublicApiKeys(params: {
  prisma: PrismaClient;
  clientId: string;
}) {
  const items = await params.prisma.publicApiKey.findMany({
    where: { clientId: params.clientId },
    orderBy: { createdAt: "desc" },
  });
  return items.map(serializePublicApiKey);
}

export async function createPublicApiKey(params: {
  prisma: PrismaClient;
  clientId: string;
  userId: string;
  name: string;
  scopes: unknown;
  expiresAt?: string | null;
  requestId: string;
}) {
  const name = params.name.trim();
  if (!name || name.length > 120) {
    return { ok: false as const, error: "invalid_name" };
  }
  const scopes = normalizePublicApiScopes(params.scopes);
  if (scopes.length === 0) {
    return { ok: false as const, error: "invalid_scopes" };
  }
  const expiresAt = params.expiresAt ? new Date(params.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return { ok: false as const, error: "invalid_expires_at" };
  }
  const secret = generatePublicApiKeySecret();
  const key = await params.prisma.publicApiKey.create({
    data: {
      clientId: params.clientId,
      name,
      keyPrefix: getPublicApiKeyPrefix(secret),
      keyHash: hashPublicApiKey(secret),
      scopes,
      status: "active",
      expiresAt,
      createdByUserId: params.userId,
    },
  });
  await recordPublicApiAuditEvent(params.prisma, {
    clientId: params.clientId,
    requestId: params.requestId,
    eventName: "api.key.created",
    payload: {
      apiKeyId: key.id,
      keyPrefix: key.keyPrefix,
      scopes,
      createdByUserId: params.userId,
      expiresAt: expiresAt?.toISOString() ?? null,
    },
  });
  return {
    ok: true as const,
    key: serializePublicApiKey(key),
    secret,
  };
}

export async function revokePublicApiKey(params: {
  prisma: PrismaClient;
  clientId: string;
  userId: string;
  keyId: string;
  requestId: string;
}) {
  const existing = await params.prisma.publicApiKey.findFirst({
    where: { id: params.keyId, clientId: params.clientId },
  });
  if (!existing) return { ok: false as const, error: "api_key_not_found" };
  if (existing.status === "revoked") {
    return { ok: true as const, key: serializePublicApiKey(existing) };
  }
  const key = await params.prisma.publicApiKey.update({
    where: { id: existing.id },
    data: {
      status: "revoked",
      revokedAt: new Date(),
      revokedByUserId: params.userId,
    },
  });
  await recordPublicApiAuditEvent(params.prisma, {
    clientId: params.clientId,
    requestId: params.requestId,
    eventName: "api.key.revoked",
    payload: {
      apiKeyId: key.id,
      keyPrefix: key.keyPrefix,
      revokedByUserId: params.userId,
    },
  });
  return { ok: true as const, key: serializePublicApiKey(key) };
}

export async function authenticatePublicApiRequest(params: {
  prisma: PrismaClient;
  req: IncomingMessage;
  requestId: string;
  requiredScopes: PublicApiScope[];
}) {
  const token = getBearerToken(params.req);
  if (!token) {
    logger.warn({ event: "api.denied", reason: "missing_key", requestId: params.requestId });
    return { ok: false as const, status: 401, error: "unauthorized", reason: "missing_key" };
  }

  const keyHash = hashPublicApiKey(token);
  const key = await params.prisma.publicApiKey.findUnique({
    where: { keyHash },
    include: {
      client: {
        select: { id: true, clientKey: true, name: true, status: true },
      },
    },
  });
  if (!key) {
    logger.warn({
      event: "api.denied",
      reason: "invalid_key",
      requestId: params.requestId,
      keyPrefix: getPublicApiKeyPrefix(token),
    });
    return { ok: false as const, status: 401, error: "unauthorized", reason: "invalid_key" };
  }

  const scopes = normalizePublicApiScopes(key.scopes);
  const now = new Date();
  const deniedReason =
    key.status !== "active"
      ? "key_revoked"
      : key.expiresAt && key.expiresAt.getTime() <= now.getTime()
        ? "key_expired"
        : key.client.status !== "ACTIVE"
          ? "client_inactive"
          : null;
  if (deniedReason) {
    await recordPublicApiAuditEvent(params.prisma, {
      clientId: key.clientId,
      requestId: params.requestId,
      eventName: "api.denied",
      payload: {
        apiKeyId: key.id,
        keyPrefix: key.keyPrefix,
        reason: deniedReason,
      },
    });
    return { ok: false as const, status: 403, error: "forbidden", reason: deniedReason };
  }

  const missingScopes = params.requiredScopes.filter((scope) => !scopes.includes(scope));
  if (missingScopes.length > 0) {
    await recordPublicApiAuditEvent(params.prisma, {
      clientId: key.clientId,
      requestId: params.requestId,
      eventName: "api.denied",
      payload: {
        apiKeyId: key.id,
        keyPrefix: key.keyPrefix,
        reason: "insufficient_scope",
        requiredScopes: params.requiredScopes,
        missingScopes,
      },
    });
    return { ok: false as const, status: 403, error: "forbidden", reason: "insufficient_scope" };
  }

  await params.prisma.publicApiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: now },
  });

  return {
    ok: true as const,
    auth: {
      apiKeyId: key.id,
      clientId: key.clientId,
      clientKey: key.client.clientKey,
      tenantName: key.client.name,
      keyPrefix: key.keyPrefix,
      scopes,
      rateLimitPerMinute: key.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE,
    } satisfies PublicApiAuth,
  };
}

export function checkPublicApiRateLimit(auth: PublicApiAuth) {
  const now = Date.now();
  const key = `public-api:${auth.apiKeyId}`;
  const limit = Math.max(1, auth.rateLimitPerMinute);
  const bucket = rateLimitBuckets.get(key);
  for (const [bucketKey, value] of rateLimitBuckets.entries()) {
    if (now - value.lastSeen > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitBuckets.delete(bucketKey);
    }
  }
  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(key, { count: 1, windowStart: now, lastSeen: now });
    return { limited: false as const, limit, remaining: limit - 1, retryAfterSec: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }
  bucket.lastSeen = now;
  if (bucket.count >= limit) {
    const resetAt = bucket.windowStart + RATE_LIMIT_WINDOW_MS;
    return {
      limited: true as const,
      limit,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((resetAt - now) / 1000)),
      resetAt,
    };
  }
  bucket.count += 1;
  const resetAt = bucket.windowStart + RATE_LIMIT_WINDOW_MS;
  return { limited: false as const, limit, remaining: Math.max(0, limit - bucket.count), retryAfterSec: 0, resetAt };
}

export async function recordPublicApiAuditEvent(
  prisma: PrismaClient,
  params: {
    clientId: string;
    requestId: string;
    eventName: "api.request" | "api.denied" | "api.rate_limited" | "api.key.created" | "api.key.revoked";
    payload: Record<string, unknown>;
  }
) {
  try {
    await prisma.event.create({
      data: {
        clientId: params.clientId,
        requestId: `${params.requestId}:${params.eventName}`,
        eventName: params.eventName,
        payloadJson: {
          action: params.eventName,
          timestamp: new Date().toISOString(),
          ...params.payload,
        },
      },
    });
  } catch (error) {
    logger.warn({
      event: "api.audit_failed",
      clientId: params.clientId,
      eventName: params.eventName,
      requestId: params.requestId,
      message: (error as Error).message,
    });
  }
}
