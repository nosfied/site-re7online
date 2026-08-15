import crypto from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { readWebSessionLifecycle } from "./webSessionLifecycle.js";
import {
  fingerprintWebSessionNumber,
  markWebSessionAuthorizationOwned,
  maskWebSessionNumber,
  normalizeWebSessionAuthorizedNumber,
} from "./webSessionAuthorization.js";
import { validateObservedWebSessionIdentityAgainstMeta } from "./hybridIdentity.js";

export type WebSessionIdentityReconciliationResult =
  | {
      ok: true;
      action: "unchanged" | "changed" | "changed_archived_same_tenant_duplicate";
      accountId: string;
      clientId: string;
      channelAccountId: string;
      previousChannelAccountId: string;
      archivedConflictAccountId?: string;
    }
  | {
      ok: false;
      error:
        | "invalid_identity"
        | "web_session_account_not_found"
        | "web_session_identity_conflict"
        | "web_session_identity_mismatch";
      conflictAccountId?: string;
      conflictClientId?: string;
      expectedIdentityMasked?: string | null;
      observedIdentityMasked?: string | null;
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

function mergeArchivedDuplicateMetadata(metadata: unknown, params: {
  previousChannelAccountId: string;
  archivedAt: string;
  source: string;
  replacementAccountId: string;
}) {
  const base = asRecord(metadata);
  const webSession = asRecord(base.webSession);
  return {
    ...base,
    webSession: {
      ...webSession,
      archivedDuplicate: {
        source: params.source,
        archivedAt: params.archivedAt,
        previousIdentity: maskIdentity(params.previousChannelAccountId),
        replacementAccountId: params.replacementAccountId,
      },
    },
  } satisfies Prisma.InputJsonObject;
}

function buildArchivedChannelAccountId(accountId: string, channelAccountId: string) {
  return `archived:${accountId}:${maskIdentity(channelAccountId).hash}`;
}

function isInactiveSameTenantDuplicateCandidate(params: {
  currentClientId: string;
  conflict: {
    clientId: string;
    status: string;
    runtimeEnabled: boolean;
    metadata: unknown;
    secrets: Array<{ id: string; secretKind: string }>;
  };
}) {
  if (params.conflict.clientId !== params.currentClientId) return false;
  if (params.conflict.runtimeEnabled === true) return false;
  if (params.conflict.secrets.length > 0) return false;
  if (params.conflict.status === "connected" || params.conflict.status === "pending") return false;
  const lifecycle = readWebSessionLifecycle(params.conflict.metadata);
  if (lifecycle.desiredState === "CONNECTED") return false;
  if (
    lifecycle.observedState === "CONNECTED" ||
    lifecycle.observedState === "CONNECTING" ||
    lifecycle.observedState === "RECONNECTING" ||
    lifecycle.observedState === "QR_REQUIRED"
  ) {
    return false;
  }
  return true;
}

export async function reconcileWebSessionObservedIdentity(params: {
  prisma: PrismaClient;
  accountId: string;
  observedIdentity: unknown;
  requestId: string;
  source?: string;
  expectedIdentity?: string | null;
}): Promise<WebSessionIdentityReconciliationResult> {
  const nextChannelAccountId = normalizeWebSessionObservedIdentity(params.observedIdentity);
  if (!nextChannelAccountId) return { ok: false, error: "invalid_identity" };
  const expectedIdentity = normalizeWebSessionAuthorizedNumber(params.expectedIdentity ?? "");
  if (expectedIdentity && expectedIdentity !== nextChannelAccountId) {
    return {
      ok: false,
      error: "web_session_identity_mismatch",
      expectedIdentityMasked: maskWebSessionNumber(expectedIdentity),
      observedIdentityMasked: maskWebSessionNumber(nextChannelAccountId),
    };
  }
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
    const metaMismatch = await validateObservedWebSessionIdentityAgainstMeta({
      prisma: tx as unknown as PrismaClient,
      clientId: account.clientId,
      observedIdentity: nextChannelAccountId,
    });
    if (metaMismatch) {
      return {
        ok: false as const,
        error: "web_session_identity_mismatch" as const,
        expectedIdentityMasked: metaMismatch.expectedIdentityMasked,
        observedIdentityMasked: metaMismatch.observedIdentityMasked,
      };
    }

    if (account.channelAccountId === nextChannelAccountId) {
      if (expectedIdentity) {
        await markWebSessionAuthorizationOwned({
          prisma: tx as unknown as PrismaClient,
          clientId: account.clientId,
          observedIdentity: nextChannelAccountId,
        });
      }
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
      select: {
        id: true,
        clientId: true,
        channelAccountId: true,
        status: true,
        runtimeEnabled: true,
        metadata: true,
        secrets: {
          where: {
            secretKind: { in: ["baileysAuthState.v1", "baileysAuthState.staging.v1"] },
            status: "configured",
            secretCiphertext: { not: null },
          },
          select: { id: true, secretKind: true },
        },
      },
    });
    if (conflict) {
      const sameTenantInactiveDuplicate = isInactiveSameTenantDuplicateCandidate({
        currentClientId: account.clientId,
        conflict,
      });
      if (!sameTenantInactiveDuplicate) {
        return {
          ok: false as const,
          error: "web_session_identity_conflict" as const,
          conflictAccountId: conflict.id,
          conflictClientId: conflict.clientId,
        };
      }

      const archivedChannelAccountId = buildArchivedChannelAccountId(conflict.id, conflict.channelAccountId);
      await tx.channelAccount.update({
        where: { id: conflict.id },
        data: {
          channelAccountId: archivedChannelAccountId,
          status: "archived_duplicate",
          enabled: false,
          runtimeEnabled: false,
          inboundPersistenceEnabled: false,
          outboundEnabled: false,
          automationEnabled: false,
          aiEnabled: false,
          handoffEnabled: false,
          metadata: mergeArchivedDuplicateMetadata(conflict.metadata, {
            previousChannelAccountId: conflict.channelAccountId,
            archivedAt: observedAt,
            source,
            replacementAccountId: account.id,
          }),
        },
      });
      await tx.event.create({
        data: {
          clientId: account.clientId,
          requestId: `${params.requestId}:archive-duplicate:${conflict.id}`,
          eventName: "whatsapp.web.identity.duplicate_archived",
          payloadJson: {
            channel: "whatsapp",
            provider: "web_session",
            channelAccountId: conflict.id,
            replacementChannelAccountId: account.id,
            archivedIdentity: maskIdentity(conflict.channelAccountId),
            source,
            observedAt,
          },
        },
      });
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
    if (expectedIdentity) {
      await markWebSessionAuthorizationOwned({
        prisma: tx as unknown as PrismaClient,
        clientId: account.clientId,
        observedIdentity: nextChannelAccountId,
      });
      await tx.event.create({
        data: {
          clientId: account.clientId,
          requestId: `${params.requestId}:owned`,
          eventName: "whatsapp.web.number.owned",
          payloadJson: {
            channel: "whatsapp",
            provider: "web_session",
            channelAccountId: account.id,
            number: {
              masked: maskWebSessionNumber(nextChannelAccountId),
              hash: fingerprintWebSessionNumber(nextChannelAccountId),
            },
            source,
            observedAt,
          },
        },
      });
    }

    return {
      ok: true as const,
      action: conflict ? "changed_archived_same_tenant_duplicate" as const : "changed" as const,
      accountId: account.id,
      clientId: account.clientId,
      channelAccountId: nextChannelAccountId,
      previousChannelAccountId,
      ...(conflict ? { archivedConflictAccountId: conflict.id } : {}),
    };
  });
}
