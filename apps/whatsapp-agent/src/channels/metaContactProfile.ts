import { logger } from "../logger/logger.js";

export const META_CONTACT_PROFILE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type PrismaLike = {
  contactChannelIdentity?: {
    findUnique?: (args: any) => Promise<{ displayName: string | null; lastSeenAt: Date | null } | null>;
    upsert?: (args: any) => Promise<unknown>;
  };
};

export type MetaContactProfileLookup = {
  displayName: string | null;
  source: "cache" | "api" | "stale-cache" | "none";
  lookupAttempted: boolean;
};

function normalizeDisplayName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 120) : "";
}

function isRecent(value: Date | string | null | undefined, now: Date, ttlMs = META_CONTACT_PROFILE_CACHE_TTL_MS) {
  if (!value) return false;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) && now.getTime() - timestamp <= ttlMs;
}

function safeErrorReason(error: unknown) {
  if (!error) return "unavailable";
  if (error instanceof Error && error.name) return error.name.slice(0, 80);
  return "profile_lookup_error";
}

export async function resolveMetaContactDisplayName(params: {
  prisma: PrismaLike;
  clientId: string;
  tenantKey: string;
  channel: "messenger" | "instagram";
  provider: "meta";
  channelAccountId: string;
  externalUserHash: string;
  requestId: string;
  fetchProfile: () => Promise<{ displayName: string | null }>;
  now?: Date;
}): Promise<MetaContactProfileLookup> {
  const now = params.now ?? new Date();
  const identity = params.prisma.contactChannelIdentity?.findUnique
    ? await params.prisma.contactChannelIdentity.findUnique({
        where: {
          clientId_channel_provider_channelAccountId_externalUserHash: {
            clientId: params.clientId,
            channel: params.channel,
            provider: params.provider,
            channelAccountId: params.channelAccountId,
            externalUserHash: params.externalUserHash,
          },
        },
        select: { displayName: true, lastSeenAt: true },
      })
    : null;
  const cachedName = normalizeDisplayName(identity?.displayName);
  if (cachedName && isRecent(identity?.lastSeenAt, now)) {
    return { displayName: cachedName, source: "cache", lookupAttempted: false };
  }

  try {
    const profile = await params.fetchProfile();
    const displayName = normalizeDisplayName(profile.displayName);
    if (displayName) {
      return { displayName, source: "api", lookupAttempted: true };
    }
    logger.info({
      event: "meta.profile_lookup.failed",
      requestId: params.requestId,
      tenantKey: params.tenantKey,
      channel: params.channel,
      provider: params.provider,
      channelAccountId: params.channelAccountId,
      externalUserHash: params.externalUserHash.slice(0, 16),
      reason: "unavailable",
    });
  } catch (error) {
    logger.info({
      event: "meta.profile_lookup.failed",
      requestId: params.requestId,
      tenantKey: params.tenantKey,
      channel: params.channel,
      provider: params.provider,
      channelAccountId: params.channelAccountId,
      externalUserHash: params.externalUserHash.slice(0, 16),
      reason: safeErrorReason(error),
    });
  }

  if (cachedName) {
    return { displayName: cachedName, source: "stale-cache", lookupAttempted: true };
  }
  return { displayName: null, source: "none", lookupAttempted: true };
}

export async function upsertMetaContactIdentity(params: {
  prisma: PrismaLike;
  clientId: string;
  contactId: string | null;
  channel: "messenger" | "instagram";
  provider: "meta";
  channelAccountId: string;
  externalUserHash: string;
  externalUserRef: string | null;
  legacyWaId: string | null;
  displayName: string | null;
  seenAt: Date;
}) {
  if (!params.prisma.contactChannelIdentity?.upsert) return;
  const displayName = normalizeDisplayName(params.displayName) || null;
  await params.prisma.contactChannelIdentity.upsert({
    where: {
      clientId_channel_provider_channelAccountId_externalUserHash: {
        clientId: params.clientId,
        channel: params.channel,
        provider: params.provider,
        channelAccountId: params.channelAccountId,
        externalUserHash: params.externalUserHash,
      },
    },
    create: {
      clientId: params.clientId,
      contactId: params.contactId,
      channel: params.channel,
      provider: params.provider,
      channelAccountId: params.channelAccountId,
      externalUserHash: params.externalUserHash,
      externalUserRef: params.externalUserRef,
      legacyWaId: params.legacyWaId,
      displayName,
      firstSeenAt: params.seenAt,
      lastSeenAt: params.seenAt,
    },
    update: {
      contactId: params.contactId,
      externalUserRef: params.externalUserRef,
      legacyWaId: params.legacyWaId,
      ...(displayName ? { displayName } : {}),
      lastSeenAt: params.seenAt,
    },
  });
}
