import crypto from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

export type WebSessionIdentityReconciliationResult =
  | {
      ok: true;
      action: "unchanged" | "changed";
      accountId: string;
      clientId: string;
      channelAccountId: string;
      previousChannelAccountId: string;
    }
  | {
      ok: false;
      error: "invalid_identity" | "web_session_account_not_found" | "web_session_identity_conflict";
      conflictAccountId?: string;
      conflictClientId?: string;
    };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeDigits(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

export function normalizeWebSessionObservedIdentity(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  const [identity] = text.split("@");
  const digits = normalizeDigits(identity?.split(":")[0] ?? text);
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

export function extractWebSessionObservedIdentity(input: unknown) {
  const record = asRecord(input);
  const user = asRecord(record.user);
  const creds = asRecord(asRecord(record.creds).me);
  const candidates = [
    user.id,
    user.jid,
    user.lid,
    creds.id,
    creds.jid,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeWebSessionObservedIdentity(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function maskIdentity(value: string) {
  const digits = normalizeDigits(value);
  return {
    last4: digits.slice(-4) || null,
    length: digits.length,
    hash: crypto.createHash("sha256").update(digits).digest("hex").slice(0, 16),
  };
}

function mergeIdentityMetadata(metadata: unknown, params: {
  previousChannelAccountId: string;
  nextChannelAccountId: string;
  observedAt: string;
  source: string;
}) {
  const base = asRecord(metadata);
  const webSession = asRecord(base.webSession);
  return {
    ...base,
    webSession: {
      ...webSession,
      identity: {
        source: params.source,
        observedAt: params.observedAt,
        current: maskIdentity(params.nextChannelAccountId),
        previous: maskIdentity(params.previousChannelAccountId),
      },
    },
  } satisfies Prisma.InputJsonObject;
}

export async function reconcileWebSessionObservedIdentity(params: {
  prisma: PrismaClient;
  accountId: string;
  observedIdentity: unknown;
  requestId: string;
  source?: string;
}): Promise<WebSessionIdentityReconciliationResult> {
  const nextChannelAccountId = normalizeWebSessionObservedIdentity(params.observedIdentity);
  if (!nextChannelAccountId) return { ok: false, error: "invalid_identity" };
  const observedAt = new Date().toISOString();
  const source = params.source ?? "worker";

  return params.prisma.$transaction(async (tx) => {
    const account = await tx.channelAccount.findUnique({
      where: { id: params.accountId },
      select: {
        id: true,
        clientId: true,
        channel: true,
        provider: true,
        channelAccountId: true,
        metadata: true,
      },
    });
    if (!account || account.channel !== "whatsapp" || account.provider !== "web_session") {
      return { ok: false as const, error: "web_session_account_not_found" as const };
    }

    if (account.channelAccountId === nextChannelAccountId) {
      return {
        ok: true as const,
        action: "unchanged" as const,
        accountId: account.id,
        clientId: account.clientId,
        channelAccountId: account.channelAccountId,
        previousChannelAccountId: account.channelAccountId,
      };
    }

    const previousChannelAccountId = account.channelAccountId;
    const conflict = await tx.channelAccount.findFirst({
      where: {
        id: { not: account.id },
        channel: "whatsapp",
        provider: "web_session",
        channelAccountId: nextChannelAccountId,
      },
      select: { id: true, clientId: true },
    });
    if (conflict) {
      return {
        ok: false as const,
        error: "web_session_identity_conflict" as const,
        conflictAccountId: conflict.id,
        conflictClientId: conflict.clientId,
      };
    }

    await tx.channelAccount.update({
      where: { id: account.id },
      data: {
        channelAccountId: nextChannelAccountId,
        metadata: mergeIdentityMetadata(account.metadata, {
          previousChannelAccountId,
          nextChannelAccountId,
          observedAt,
          source,
        }),
      },
    });
    await tx.event.create({
      data: {
        clientId: account.clientId,
        requestId: params.requestId,
        eventName: "whatsapp.web.identity.changed",
        payloadJson: {
          channel: "whatsapp",
          provider: "web_session",
          channelAccountId: account.id,
          oldIdentity: maskIdentity(previousChannelAccountId),
          newIdentity: maskIdentity(nextChannelAccountId),
          source,
          observedAt,
        },
      },
    });

    return {
      ok: true as const,
      action: "changed" as const,
      accountId: account.id,
      clientId: account.clientId,
      channelAccountId: nextChannelAccountId,
      previousChannelAccountId,
    };
  });
}
