import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  buildPasswordResetUrlFromBase,
  hashResetToken,
  isSmtpConfigured,
  sendPasswordResetEmail,
} from "./appSessionService.js";

export const FIRST_ACCESS_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type PrismaForFirstAccess = Pick<
  PrismaClient,
  "passwordResetToken" | "user" | "event" | "$transaction"
>;

export type FirstAccessDeliveryMode = "prepare_only" | "email";

export type FirstAccessUserStatus =
  | "password_configured"
  | "token_active"
  | "token_expired"
  | "not_ready";

export function buildFirstAccessTokenHash(token: string) {
  return hashResetToken(token);
}

export function buildFirstAccessStatus(params: {
  passwordHash?: string | null;
  token?: { expiresAt: Date; usedAt?: Date | null } | null;
  now?: Date;
}): FirstAccessUserStatus {
  if (params.passwordHash) return "password_configured";
  const token = params.token ?? null;
  if (!token || token.usedAt) return "not_ready";
  return token.expiresAt > (params.now ?? new Date()) ? "token_active" : "token_expired";
}

export async function getFirstAccessUserStatus(params: {
  prisma: PrismaForFirstAccess;
  clientId: string;
  userId: string;
  now?: Date;
}) {
  const user = await params.prisma.user.findFirst({
    where: { id: params.userId, clientId: params.clientId },
    select: {
      id: true,
      passwordHash: true,
      passwordResetTokens: {
        where: { usedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { expiresAt: true, usedAt: true },
      },
    },
  });
  if (!user) return null;
  const token = user.passwordResetTokens[0] ?? null;
  return {
    status: buildFirstAccessStatus({
      passwordHash: user.passwordHash,
      token,
      now: params.now,
    }),
    tokenExpiresAt: token?.expiresAt ?? null,
  };
}

export async function prepareFirstAccessForUsers(params: {
  prisma: PrismaForFirstAccess;
  clientId: string;
  userIds?: string[];
  deliveryMode?: FirstAccessDeliveryMode;
  actorUserId?: string | null;
  requestId: string;
  passwordResetBaseUrl?: string;
}) {
  const deliveryMode = params.deliveryMode ?? "prepare_only";
  const now = new Date();
  const expiresAt = new Date(now.getTime() + FIRST_ACCESS_TOKEN_TTL_MS);
  const where =
    params.userIds && params.userIds.length > 0
      ? { clientId: params.clientId, id: { in: params.userIds }, isActive: true }
      : { clientId: params.clientId, isActive: true };
  const users = await params.prisma.user.findMany({
    where,
    orderBy: [{ createdAt: "asc" }],
    select: { id: true, email: true, name: true, passwordHash: true },
  });
  const foundIds = new Set(users.map((user) => user.id));
  const missingUserIds = (params.userIds ?? []).filter((userId) => !foundIds.has(userId));
  if (missingUserIds.length > 0) {
    return {
      ok: false as const,
      reason: "user_not_found" as const,
      requestedCount: params.userIds?.length ?? 0,
      missingCount: missingUserIds.length,
    };
  }

  const deliveryConfigured = Boolean(params.passwordResetBaseUrl && isSmtpConfigured());
  let deliveredCount = 0;
  let issuedCount = 0;
  let skippedPasswordConfiguredCount = 0;
  for (const user of users) {
    if (user.passwordHash) {
      skippedPasswordConfiguredCount += 1;
      continue;
    }
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = hashResetToken(token);
    await params.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: {
          clientId: params.clientId,
          userId: user.id,
          usedAt: null,
        },
        data: { usedAt: now },
      });
      await tx.passwordResetToken.create({
        data: {
          clientId: params.clientId,
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });
    });
    issuedCount += 1;
    if (deliveryMode === "email" && params.passwordResetBaseUrl && deliveryConfigured) {
      const result = await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl: buildPasswordResetUrlFromBase(params.passwordResetBaseUrl, token),
      });
      if (result.ok) deliveredCount += 1;
    }
  }

  await params.prisma.event.create({
    data: {
      clientId: params.clientId,
      requestId: `${params.requestId}:first-access`,
      eventName: "auth.first_access.prepared",
      payloadJson: {
        actorUserId: params.actorUserId ?? null,
        deliveryMode,
        deliveryConfigured,
        requestedCount: params.userIds?.length ?? users.length,
        eligibleCount: users.length,
        issuedCount,
        deliveredCount,
        skippedPasswordConfiguredCount,
      },
    },
  });

  return {
    ok: true as const,
    deliveryMode,
    deliveryConfigured,
    requestedCount: params.userIds?.length ?? users.length,
    eligibleCount: users.length,
    issuedCount,
    deliveredCount,
    skippedPasswordConfiguredCount,
    expiresAt,
  };
}
