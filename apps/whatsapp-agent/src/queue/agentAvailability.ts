import type { Prisma, PrismaClient } from "@prisma/client";

export const AGENT_HEARTBEAT_INTERVAL_MS = 10_000;
export const AGENT_ONLINE_TTL_MS = 30_000;

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export type AgentAvailabilityView = {
  available: boolean;
  lastHeartbeatAt: Date | null;
  availabilityChangedAt: Date | null;
  effectiveAvailable: boolean;
};

export function isAgentEffectivelyAvailable(
  value: { available?: boolean | null; lastHeartbeatAt?: Date | string | null } | null | undefined,
  now = new Date()
) {
  if (!value?.available || !value.lastHeartbeatAt) return false;
  const heartbeatAt = value.lastHeartbeatAt instanceof Date ? value.lastHeartbeatAt : new Date(value.lastHeartbeatAt);
  if (!Number.isFinite(heartbeatAt.getTime())) return false;
  return heartbeatAt.getTime() >= now.getTime() - AGENT_ONLINE_TTL_MS;
}

function serializeAvailability(
  row: { available: boolean; lastHeartbeatAt: Date | null; availabilityChangedAt: Date } | null,
  now = new Date()
): AgentAvailabilityView {
  return {
    available: row?.available ?? false,
    lastHeartbeatAt: row?.lastHeartbeatAt ?? null,
    availabilityChangedAt: row?.availabilityChangedAt ?? null,
    effectiveAvailable: isAgentEffectivelyAvailable(row, now),
  };
}

export async function getAgentAvailability(params: {
  prisma: PrismaLike;
  clientId: string;
  userId: string;
  now?: Date;
}): Promise<AgentAvailabilityView> {
  const row = await params.prisma.agentAvailability.findUnique({
    where: { clientId_userId: { clientId: params.clientId, userId: params.userId } },
    select: { available: true, lastHeartbeatAt: true, availabilityChangedAt: true },
  });
  return serializeAvailability(row, params.now);
}

export async function setAgentAvailability(params: {
  prisma: PrismaLike;
  clientId: string;
  userId: string;
  available: boolean;
  now?: Date;
}): Promise<AgentAvailabilityView> {
  const now = params.now ?? new Date();
  const row = await params.prisma.agentAvailability.upsert({
    where: { clientId_userId: { clientId: params.clientId, userId: params.userId } },
    create: {
      clientId: params.clientId,
      userId: params.userId,
      available: params.available,
      availabilityChangedAt: now,
    },
    update: {
      available: params.available,
      availabilityChangedAt: now,
    },
    select: { available: true, lastHeartbeatAt: true, availabilityChangedAt: true },
  });
  return serializeAvailability(row, now);
}

export async function recordAgentHeartbeat(params: {
  prisma: PrismaLike;
  clientId: string;
  userId: string;
  now?: Date;
}): Promise<AgentAvailabilityView> {
  const now = params.now ?? new Date();
  const row = await params.prisma.agentAvailability.upsert({
    where: { clientId_userId: { clientId: params.clientId, userId: params.userId } },
    create: {
      clientId: params.clientId,
      userId: params.userId,
      available: false,
      lastHeartbeatAt: now,
      availabilityChangedAt: now,
    },
    update: {
      lastHeartbeatAt: now,
    },
    select: { available: true, lastHeartbeatAt: true, availabilityChangedAt: true },
  });
  return serializeAvailability(row, now);
}

export async function getEffectivelyAvailableUserIds(params: {
  prisma: PrismaLike;
  clientId: string;
  userIds: string[];
  now?: Date;
}) {
  const userIds = Array.from(new Set(params.userIds.map((id) => id.trim()).filter(Boolean)));
  if (userIds.length === 0) return new Set<string>();
  const now = params.now ?? new Date();
  const rows = await params.prisma.agentAvailability.findMany({
    where: {
      clientId: params.clientId,
      userId: { in: userIds },
      available: true,
    },
    select: { userId: true, available: true, lastHeartbeatAt: true },
  });
  return new Set(
    rows
      .filter((row) => isAgentEffectivelyAvailable(row, now))
      .map((row) => row.userId)
  );
}
