import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { logger } from "../logger/logger.js";

type PrismaLike = {
  conversation: {
    findUnique(args: unknown): Promise<{ id: string; deletedAt: Date | null; anonymizedAt: Date | null } | null>;
  };
  event?: {
    create(args: unknown): Promise<unknown>;
  };
};

export type AnonymizedIdentityGuardResult =
  | { blocked: false; conversationId?: string | null; softDeleted?: boolean }
  | { blocked: true; conversationId: string; reason: "anonymized_identity" };

function safeIdentifierHint(value: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const digits = normalized.replace(/\D+/g, "");
  const suffix = digits.length >= 4 ? digits.slice(-4) : null;
  const hash = crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  return { suffix, hash };
}

export async function guardAgainstAnonymizedIdentityRehydration(params: {
  prisma: PrismaLike;
  clientId: string;
  tenantKey?: string | null;
  channel: string;
  provider?: string | null;
  channelAccountId?: string | null;
  waId: string;
  requestId: string;
  source: string;
}): Promise<AnonymizedIdentityGuardResult> {
  const existing = await params.prisma.conversation.findUnique({
    where: { clientId_waId: { clientId: params.clientId, waId: params.waId } },
    select: { id: true, deletedAt: true, anonymizedAt: true },
  });
  if (!existing) return { blocked: false };
  if (!existing.anonymizedAt) {
    return { blocked: false, conversationId: existing.id, softDeleted: Boolean(existing.deletedAt) };
  }

  const identifier = safeIdentifierHint(params.waId);
  const payload = {
    action: "inbound.anonymized_identity_seen",
    source: params.source,
    tenantKey: params.tenantKey ?? null,
    channel: params.channel,
    provider: params.provider ?? null,
    channelAccountId: params.channelAccountId ?? null,
    conversationId: existing.id,
    identifierSuffix: identifier?.suffix ?? null,
    identifierHash: identifier?.hash ?? null,
  };
  try {
    await params.prisma.event?.create({
      data: {
        clientId: params.clientId,
        conversationId: existing.id,
        requestId: `${params.requestId}:anonymized-identity`,
        eventName: "inbound.anonymized_identity_seen",
        payloadJson: payload as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    logger.warn({
      event: "privacy.anonymized_rehydration_audit_failed",
      requestId: params.requestId,
      clientId: params.clientId,
      channel: params.channel,
      message: (error as Error).message,
    });
  }
  logger.warn({
    event: "privacy.anonymized_rehydration_blocked",
    requestId: params.requestId,
    clientId: params.clientId,
    tenantKey: params.tenantKey ?? null,
    channel: params.channel,
    provider: params.provider ?? null,
    channelAccountId: params.channelAccountId ?? null,
    conversationId: existing.id,
    identifierSuffix: identifier?.suffix ?? null,
    identifierHash: identifier?.hash ?? null,
  });
  return { blocked: true, conversationId: existing.id, reason: "anonymized_identity" };
}
