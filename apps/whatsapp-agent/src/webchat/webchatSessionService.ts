import crypto from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { getFeatures } from "../features/clientFeatures.js";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const MAX_NAME_LENGTH = 160;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 40;

type JsonInput = Record<string, unknown>;
type RateBucket = { count: number; windowStart: number; lastSeen: number };

const rateBuckets = new Map<string, RateBucket>();

function normalizeText(input: unknown, maxLength: number) {
  if (typeof input !== "string") return "";
  return input.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n").slice(0, maxLength);
}

function normalizeOptionalText(input: unknown, maxLength: number) {
  const value = normalizeText(input, maxLength);
  return value || null;
}

export function normalizeWebchatDomain(input: unknown) {
  const value = normalizeText(input, 253).toLowerCase();
  if (!value) return "";
  try {
    const parsed = value.startsWith("http://") || value.startsWith("https://")
      ? new URL(value)
      : new URL(`https://${value}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return value
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "")
      .replace(/^www\./, "")
      .trim();
  }
}

function hashValue(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function generateToken() {
  return `wcs_${crypto.randomBytes(32).toString("base64url")}`;
}

function getRateLimit(key: string) {
  const now = Date.now();
  for (const [bucketKey, value] of rateBuckets.entries()) {
    if (now - value.lastSeen > RATE_LIMIT_WINDOW_MS * 3) {
      rateBuckets.delete(bucketKey);
    }
  }
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { count: 1, windowStart: now, lastSeen: now });
    return { limited: false as const, retryAfterSec: 0 };
  }
  bucket.count += 1;
  bucket.lastSeen = now;
  if (bucket.count > RATE_LIMIT_MAX) {
    return {
      limited: true as const,
      retryAfterSec: Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - bucket.windowStart)) / 1000)),
    };
  }
  return { limited: false as const, retryAfterSec: 0 };
}

function serializeSession(item: {
  id: string;
  siteId: string;
  visitorId: string;
  status: string;
  originDomain: string;
  expiresAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
}) {
  return {
    id: item.id,
    siteId: item.siteId,
    visitorId: item.visitorId,
    status: item.status,
    originDomain: item.originDomain,
    expiresAt: item.expiresAt.toISOString(),
    lastSeenAt: item.lastSeenAt.toISOString(),
    createdAt: item.createdAt.toISOString(),
  };
}

function serializeSitePublic(site: {
  id: string;
  name: string;
  slug: string;
  settings: {
    theme: unknown;
    welcomeMessage: string | null;
    collectName: boolean;
    collectEmail: boolean;
    collectPhone: boolean;
    allowAnonymous: boolean;
  } | null;
}) {
  return {
    id: site.id,
    name: site.name,
    slug: site.slug,
    settings: {
      theme:
        site.settings?.theme && typeof site.settings.theme === "object" && !Array.isArray(site.settings.theme)
          ? site.settings.theme
          : {},
      welcomeMessage: site.settings?.welcomeMessage ?? null,
      collectName: site.settings?.collectName ?? true,
      collectEmail: site.settings?.collectEmail ?? false,
      collectPhone: site.settings?.collectPhone ?? false,
      allowAnonymous: site.settings?.allowAnonymous ?? true,
    },
  };
}

async function recordWebchatEvent(params: {
  prisma: PrismaClient;
  clientId: string;
  requestId: string;
  eventName: "webchat.session.started" | "webchat.session.restored";
  payload: Record<string, unknown>;
}) {
  try {
    await params.prisma.event.create({
      data: {
        clientId: params.clientId,
        requestId: params.requestId,
        eventName: params.eventName,
        payloadJson: params.payload as Prisma.InputJsonValue,
      },
    });
  } catch {
    // Audit failure must not block public session bootstrap.
  }
}

async function resolveActiveSite(params: {
  prisma: PrismaClient;
  siteId: string;
  originDomain: string;
}) {
  const site = await params.prisma.webchatSite.findFirst({
    where: { id: params.siteId },
    include: {
      client: { select: { id: true, clientKey: true, name: true, status: true, features: true, profile: true } },
      settings: true,
      allowedDomains: { where: { active: true }, select: { domain: true } },
    },
  });
  if (!site) return { ok: false as const, error: "webchat_site_not_found" };
  if (site.status !== "active") return { ok: false as const, error: "webchat_site_inactive" };
  if (site.client.status !== "ACTIVE") return { ok: false as const, error: "client_inactive" };
  if (!getFeatures(site.client).webchat) return { ok: false as const, error: "feature_not_enabled" };
  const allowed = site.allowedDomains.some((item) => normalizeWebchatDomain(item.domain) === params.originDomain);
  if (!allowed) return { ok: false as const, error: "webchat_origin_not_allowed" };
  return { ok: true as const, site };
}

export async function createWebchatSession(params: {
  prisma: PrismaClient;
  requestId: string;
  input: JsonInput;
  origin: string | null;
  ip: string;
  userAgent: string | null;
}) {
  const siteId = normalizeText(params.input.siteId, 120);
  if (!siteId) return { ok: false as const, error: "webchat_site_required" };
  const originDomain = normalizeWebchatDomain(params.origin);
  if (!originDomain) return { ok: false as const, error: "webchat_origin_required" };

  const ipHash = hashValue(params.ip || "unknown");
  const rate = getRateLimit(`session:${siteId}:${ipHash}`);
  if (rate.limited) return { ok: false as const, error: "webchat_rate_limited", retryAfterSec: rate.retryAfterSec };

  const resolved = await resolveActiveSite({ prisma: params.prisma, siteId, originDomain });
  if (!resolved.ok) return resolved;

  const visitorInput = params.input.visitor && typeof params.input.visitor === "object" && !Array.isArray(params.input.visitor)
    ? (params.input.visitor as Record<string, unknown>)
    : {};
  const name = normalizeOptionalText(visitorInput.name, MAX_NAME_LENGTH);
  const email = normalizeOptionalText(visitorInput.email, MAX_EMAIL_LENGTH);
  const phone = normalizeOptionalText(visitorInput.phone, MAX_PHONE_LENGTH);
  const allowAnonymous = resolved.site.settings?.allowAnonymous ?? true;
  if (!allowAnonymous && !name && !email && !phone) {
    return { ok: false as const, error: "webchat_identity_required" };
  }

  const token = generateToken();
  const visitorSeed = normalizeText(params.input.visitorId, 160) || token;
  const visitorIdHash = hashValue(`${resolved.site.id}:${visitorSeed}`);
  const tokenHash = hashValue(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  const visitor = await params.prisma.webchatVisitor.upsert({
    where: { siteId_visitorIdHash: { siteId: resolved.site.id, visitorIdHash } },
    create: {
      clientId: resolved.site.clientId,
      siteId: resolved.site.id,
      visitorIdHash,
      name,
      email,
      phone,
      lastSeenAt: now,
    },
    update: {
      name,
      email,
      phone,
      lastSeenAt: now,
    },
  });

  const session = await params.prisma.webchatSession.create({
    data: {
      clientId: resolved.site.clientId,
      siteId: resolved.site.id,
      visitorId: visitor.id,
      tokenHash,
      status: "active",
      originDomain,
      ipHash,
      userAgentHash: params.userAgent ? hashValue(params.userAgent) : null,
      expiresAt,
      lastSeenAt: now,
    },
  });

  await recordWebchatEvent({
    prisma: params.prisma,
    clientId: resolved.site.clientId,
    requestId: params.requestId,
    eventName: "webchat.session.started",
    payload: {
      siteId: resolved.site.id,
      sessionId: session.id,
      visitorId: visitor.id,
      originDomain,
      expiresAt: expiresAt.toISOString(),
    },
  });

  return {
    ok: true as const,
    token,
    session: serializeSession(session),
    visitor: { id: visitor.id, identified: Boolean(name || email || phone) },
    site: serializeSitePublic(resolved.site),
    tenant: { id: resolved.site.client.id, key: resolved.site.client.clientKey, name: resolved.site.client.name },
  };
}

export async function restoreWebchatSession(params: {
  prisma: PrismaClient;
  requestId: string;
  token: string;
  origin: string | null;
  ip: string;
}) {
  const token = normalizeText(params.token, 200);
  if (!token) return { ok: false as const, error: "webchat_token_required" };
  const originDomain = normalizeWebchatDomain(params.origin);
  if (!originDomain) return { ok: false as const, error: "webchat_origin_required" };
  const tokenHash = hashValue(token);
  const session = await params.prisma.webchatSession.findUnique({
    where: { tokenHash },
    include: {
      visitor: { select: { id: true, name: true, email: true, phone: true } },
      site: {
        include: {
          client: { select: { id: true, clientKey: true, name: true, status: true, features: true, profile: true } },
          settings: true,
          allowedDomains: { where: { active: true }, select: { domain: true } },
        },
      },
    },
  });
  if (!session) return { ok: false as const, error: "webchat_session_not_found" };
  const rate = getRateLimit(`restore:${session.siteId}:${hashValue(params.ip || "unknown")}`);
  if (rate.limited) return { ok: false as const, error: "webchat_rate_limited", retryAfterSec: rate.retryAfterSec };
  if (session.status !== "active") return { ok: false as const, error: "webchat_session_inactive" };
  if (session.expiresAt.getTime() <= Date.now()) {
    await params.prisma.webchatSession.update({ where: { id: session.id }, data: { status: "expired" } });
    return { ok: false as const, error: "webchat_session_expired" };
  }
  if (session.site.status !== "active") return { ok: false as const, error: "webchat_site_inactive" };
  if (session.site.client.status !== "ACTIVE") return { ok: false as const, error: "client_inactive" };
  if (!getFeatures(session.site.client).webchat) return { ok: false as const, error: "feature_not_enabled" };
  const allowed = session.site.allowedDomains.some((item) => normalizeWebchatDomain(item.domain) === originDomain);
  if (!allowed || session.originDomain !== originDomain) {
    return { ok: false as const, error: "webchat_origin_not_allowed" };
  }

  const updated = await params.prisma.webchatSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });
  await params.prisma.webchatVisitor.update({
    where: { id: session.visitorId },
    data: { lastSeenAt: new Date() },
  });

  await recordWebchatEvent({
    prisma: params.prisma,
    clientId: session.clientId,
    requestId: params.requestId,
    eventName: "webchat.session.restored",
    payload: {
      siteId: session.siteId,
      sessionId: session.id,
      visitorId: session.visitorId,
      originDomain,
    },
  });

  return {
    ok: true as const,
    session: serializeSession(updated),
    visitor: { id: session.visitor.id, identified: Boolean(session.visitor.name || session.visitor.email || session.visitor.phone) },
    site: serializeSitePublic(session.site),
    tenant: { id: session.site.client.id, key: session.site.client.clientKey, name: session.site.client.name },
  };
}
