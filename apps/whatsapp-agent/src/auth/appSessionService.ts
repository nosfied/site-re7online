import crypto from "node:crypto";
import nodemailer from "nodemailer";
import type { IncomingMessage } from "node:http";
import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";
import { hashPassword, verifyClientAuthTokenDetailed } from "./clientAuth.js";
import { normalizeUserRole, type ClientAuthContext } from "./clientAuthMiddleware.js";
import {
  APP_AUTH_SESSION_TTL_MS,
  APP_AUTH_SESSION_TTL_SECONDS,
  buildAppAuthSessionExpiresAt,
  isAppAuthSessionExpired,
} from "./sessionPolicy.js";

export { APP_AUTH_SESSION_TTL_MS, APP_AUTH_SESSION_TTL_SECONDS };
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

export type AppSessionRejectReason =
  | "missing_token"
  | "invalid_token"
  | "token_expired"
  | "session_not_found"
  | "session_replaced"
  | "session_revoked"
  | "session_expired";

export type AppSessionValidation =
  | { ok: true; auth: ClientAuthContext }
  | { ok: false; reason: AppSessionRejectReason };

export type AppSessionRenewal =
  | {
      ok: true;
      session: { id: string; expiresAt: Date };
      user: {
        id: string;
        clientId: string;
        name: string;
        email: string;
        role: string;
        departmentId: string | null;
        departmentName: string | null;
        client: {
          id: string;
          clientKey: string;
          name: string;
          status: string;
          features: unknown;
          profile: string | null;
        };
      };
    }
  | { ok: false; reason: AppSessionRejectReason };

function getBearerToken(req: IncomingMessage) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return "";
  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return "";
  return token.trim();
}

function getRequestIp(req: IncomingMessage) {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return String(raw || req.socket.remoteAddress || "").split(",")[0]?.trim() || "";
}

export function hashSensitiveValue(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function hashResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function markExpiredAppSession(params: {
  clientId: string;
  userId: string;
  sessionId: string;
  role?: string | null;
  tx?: Prisma.TransactionClient;
}) {
  const prisma = params.tx ?? getPrisma();
  const now = new Date();
  const revoked = await prisma.appAuthSession.updateMany({
    where: {
      id: params.sessionId,
      clientId: params.clientId,
      userId: params.userId,
      revokedAt: null,
    },
    data: {
      revokedAt: now,
      revokeReason: "session_expired",
    },
  });
  if (revoked.count > 0) {
    await prisma.event.create({
      data: {
        clientId: params.clientId,
        eventName: "auth.session_expired",
        requestId: `auth.session_expired:${params.sessionId}`,
        payloadJson: {
          userId: params.userId,
          role: params.role ?? null,
          sessionId: params.sessionId,
          reason: "session_expired",
        },
      },
    });
  }
  return revoked.count;
}

export function buildSessionExpiredMessage(reason: AppSessionRejectReason) {
  if (reason === "session_replaced") {
    return "Sua sessao foi encerrada porque houve um novo login em outro dispositivo.";
  }
  if (reason === "session_expired" || reason === "token_expired") {
    return "Sessao expirada. Faca login novamente.";
  }
  if (reason === "session_revoked") {
    return "Sessao encerrada. Faca login novamente.";
  }
  return "Sessao invalida. Faca login novamente.";
}

export async function revokeUserPushSubscriptions(params: {
  clientId: string;
  userId: string;
  reason: string;
  tx?: Prisma.TransactionClient;
}) {
  const prisma = params.tx ?? getPrisma();
  const result = await prisma.pushSubscription.updateMany({
    where: {
      clientId: params.clientId,
      userId: params.userId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  logger.info({
    event: "auth.push.revoked",
    clientId: params.clientId,
    userId: params.userId,
    reason: params.reason,
    count: result.count,
  });
  return result.count;
}

export async function createExclusiveAppSession(params: {
  clientId: string;
  userId: string;
  req: IncomingMessage;
}) {
  const prisma = getPrisma();
  const now = new Date();
  const expiresAt = buildAppAuthSessionExpiresAt(now);
  const userAgent = String(params.req.headers["user-agent"] ?? "").slice(0, 500) || null;
  const ipHash = hashSensitiveValue(getRequestIp(params.req));
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: params.userId, clientId: params.clientId },
      select: { role: true },
    });
    const revoked = await tx.appAuthSession.updateMany({
      where: {
        clientId: params.clientId,
        userId: params.userId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        revokeReason: "replaced_by_new_login",
      },
    });
    const push = await revokeUserPushSubscriptions({
      clientId: params.clientId,
      userId: params.userId,
      reason: "replaced_by_new_login",
      tx,
    });
    const session = await tx.appAuthSession.create({
      data: {
        clientId: params.clientId,
        userId: params.userId,
        userAgent,
        ipHash,
        expiresAt,
      },
      select: {
        id: true,
        expiresAt: true,
      },
    });
    if (revoked.count > 0) {
      await tx.event.create({
        data: {
          clientId: params.clientId,
          eventName: "auth.session_replaced",
          requestId: `auth.session_replaced:${session.id}`,
          payloadJson: {
            userId: params.userId,
            role: user?.role ?? null,
            sessionId: session.id,
            replacedCount: revoked.count,
          },
        },
      });
    }
    await tx.event.create({
      data: {
        clientId: params.clientId,
        eventName: "auth.login",
        requestId: `auth.login:${session.id}`,
        payloadJson: {
          userId: params.userId,
          role: user?.role ?? null,
          sessionId: session.id,
        },
      },
    });
    return { session, replaced: revoked.count, revokedPush: push };
  });
  if (result.replaced > 0) {
    logger.info({
      event: "auth.session.replaced",
      clientId: params.clientId,
      userId: params.userId,
      count: result.replaced,
      revokedPush: result.revokedPush,
    });
  }
  return result.session;
}

export async function validateAppSessionFromRequest(
  req: IncomingMessage
): Promise<AppSessionValidation> {
  const token = getBearerToken(req);
  if (!token) return { ok: false, reason: "missing_token" };
  const tokenResult = verifyClientAuthTokenDetailed(token);
  if (!tokenResult.ok) {
    return {
      ok: false,
      reason: tokenResult.reason === "token_expired" ? "token_expired" : "invalid_token",
    };
  }
  const payload = tokenResult.payload;
  if (payload.supportAccess?.accessType === "platform_support") {
    const now = new Date();
    const supportSession = await getPrisma().platformSupportSession.findFirst({
      where: {
        id: payload.sid,
        actingClientId: payload.clientId,
        supportUserId: payload.sub,
      },
      select: {
        id: true,
        grantId: true,
        actingClientId: true,
        supportClientId: true,
        supportUserId: true,
        sourceAppSessionId: true,
        expiresAt: true,
        lastSeenAt: true,
        endedAt: true,
        endReason: true,
        grant: {
          select: {
            id: true,
            clientId: true,
            expiresAt: true,
            revokedAt: true,
            scope: true,
          },
        },
        supportUser: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
            client: {
              select: { id: true, status: true },
            },
          },
        },
        actingClient: {
          select: { status: true },
        },
      },
    });
    if (!supportSession) return { ok: false, reason: "session_not_found" };
    if (
      payload.supportAccess.grantId !== supportSession.grantId ||
      payload.supportAccess.supportClientId !== supportSession.supportClientId ||
      payload.supportAccess.supportUserId !== supportSession.supportUserId
    ) {
      return { ok: false, reason: "session_not_found" };
    }
    if (supportSession.endedAt) {
      return {
        ok: false,
        reason:
          supportSession.endReason === "grant_expired"
            ? "session_expired"
            : "session_revoked",
      };
    }
    if (
      supportSession.expiresAt.getTime() <= now.getTime() ||
      supportSession.grant.expiresAt.getTime() <= now.getTime()
    ) {
      await getPrisma().platformSupportSession.update({
        where: { id: supportSession.id },
        data: { endedAt: now, endReason: "grant_expired" },
      });
      await getPrisma().event.create({
        data: {
          clientId: supportSession.actingClientId,
          eventName: "support.access.expired",
          requestId: `support.access.expired:${supportSession.id}`,
          payloadJson: {
            supportUserId: supportSession.supportUserId,
            supportClientId: supportSession.supportClientId,
            supportSessionId: supportSession.id,
            grantId: supportSession.grantId,
          },
        },
      }).catch(() => null);
      return { ok: false, reason: "session_expired" };
    }
    if (
      supportSession.grant.revokedAt ||
      supportSession.grant.clientId !== supportSession.actingClientId ||
      !supportSession.supportUser.isActive ||
      supportSession.supportUser.client.status !== "ACTIVE"
    ) {
      await getPrisma().platformSupportSession.update({
        where: { id: supportSession.id },
        data: { endedAt: now, endReason: supportSession.grant.revokedAt ? "grant_revoked" : "support_identity_revoked" },
      }).catch(() => null);
      return { ok: false, reason: "session_revoked" };
    }
    if (now.getTime() - supportSession.lastSeenAt.getTime() > 5 * 60 * 1000) {
      await getPrisma().platformSupportSession.update({
        where: { id: supportSession.id },
        data: { lastSeenAt: now },
      });
    }
    return {
      ok: true,
      auth: {
        userId: payload.sub,
        clientId: payload.clientId,
        role: "ADMIN",
        email: payload.email,
        sessionId: payload.sid,
        supportAccess: {
          accessType: "platform_support",
          grantId: supportSession.grantId,
          supportSessionId: supportSession.id,
          supportClientId: supportSession.supportClientId,
          supportUserId: supportSession.supportUserId,
          sourceAppSessionId: supportSession.sourceAppSessionId,
          expiresAt: supportSession.expiresAt.toISOString(),
        },
      },
    };
  }
  const session = await getPrisma().appAuthSession.findFirst({
    where: {
      id: payload.sid,
      clientId: payload.clientId,
      userId: payload.sub,
    },
    select: {
      id: true,
      revokedAt: true,
      revokeReason: true,
      createdAt: true,
      expiresAt: true,
      lastSeenAt: true,
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          client: {
            select: { status: true },
          },
        },
      },
    },
  });
  if (!session) return { ok: false, reason: "session_not_found" };
  if (session.revokedAt) {
    return {
      ok: false,
      reason:
        session.revokeReason === "replaced_by_new_login"
          ? "session_replaced"
          : session.revokeReason === "session_expired"
            ? "session_expired"
          : "session_revoked",
    };
  }
  const now = new Date();
  if (
    isAppAuthSessionExpired({
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      now,
    })
  ) {
    await markExpiredAppSession({
      clientId: payload.clientId,
      userId: payload.sub,
      sessionId: session.id,
      role: session.user.role,
    });
    return { ok: false, reason: "session_expired" };
  }
  if (!session.user.isActive || session.user.client.status !== "ACTIVE") {
    return { ok: false, reason: "session_revoked" };
  }
  if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await getPrisma().appAuthSession.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    });
  }
  return {
    ok: true,
    auth: {
      userId: payload.sub,
      clientId: payload.clientId,
      role: normalizeUserRole(payload.role),
      email: payload.email,
      sessionId: payload.sid,
    },
  };
}

export async function renewAppSessionFromRequest(
  req: IncomingMessage
): Promise<AppSessionRenewal> {
  const token = getBearerToken(req);
  if (!token) return { ok: false, reason: "missing_token" };
  const tokenResult = verifyClientAuthTokenDetailed(token);
  if (!tokenResult.ok) {
    return {
      ok: false,
      reason: tokenResult.reason === "token_expired" ? "token_expired" : "invalid_token",
    };
  }
  const payload = tokenResult.payload;
  const prisma = getPrisma();
  const now = new Date();
  const userAgent = String(req.headers["user-agent"] ?? "").slice(0, 500) || null;
  const ipHash = hashSensitiveValue(getRequestIp(req));
  const currentSession = await prisma.appAuthSession.findFirst({
    where: {
      id: payload.sid,
      clientId: payload.clientId,
      userId: payload.sub,
    },
    select: {
      id: true,
      clientId: true,
      userId: true,
      createdAt: true,
      revokedAt: true,
      revokeReason: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          clientId: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          departmentId: true,
          department: { select: { name: true } },
          client: {
            select: {
              id: true,
              clientKey: true,
              name: true,
              status: true,
              features: true,
              profile: true,
            },
          },
        },
      },
    },
  });
  if (!currentSession) return { ok: false, reason: "session_not_found" };
  if (currentSession.revokedAt) {
    if (currentSession.revokeReason === "session_renewed") {
      const replacement = await prisma.appAuthSession.findFirst({
        where: {
          clientId: payload.clientId,
          userId: payload.sub,
          revokedAt: null,
          id: { not: currentSession.id },
          createdAt: { gte: currentSession.createdAt },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
        },
      });
      if (
        replacement &&
        !isAppAuthSessionExpired({
          createdAt: replacement.createdAt,
          expiresAt: replacement.expiresAt,
          now,
        }) &&
        currentSession.user.isActive &&
        currentSession.user.client.status === "ACTIVE"
      ) {
        return {
          ok: true,
          session: { id: replacement.id, expiresAt: replacement.expiresAt },
          user: {
            id: currentSession.user.id,
            clientId: currentSession.user.clientId,
            name: currentSession.user.name,
            email: currentSession.user.email,
            role: currentSession.user.role,
            departmentId: currentSession.user.departmentId,
            departmentName: currentSession.user.department?.name ?? null,
            client: currentSession.user.client,
          },
        };
      }
    }
    return {
      ok: false,
      reason:
        currentSession.revokeReason === "replaced_by_new_login"
          ? "session_replaced"
          : currentSession.revokeReason === "session_expired"
            ? "session_expired"
          : "session_revoked",
    };
  }
  if (
    isAppAuthSessionExpired({
      createdAt: currentSession.createdAt,
      expiresAt: currentSession.expiresAt,
      now,
    })
  ) {
    await markExpiredAppSession({
      clientId: payload.clientId,
      userId: payload.sub,
      sessionId: currentSession.id,
      role: currentSession.user.role,
    });
    return { ok: false, reason: "session_expired" };
  }
  if (!currentSession.user.isActive || currentSession.user.client.status !== "ACTIVE") {
    return { ok: false, reason: "session_revoked" };
  }

  return prisma.$transaction(async (tx): Promise<AppSessionRenewal> => {
    const renewedAt = new Date();
    const revoked = await tx.appAuthSession.updateMany({
      where: {
        id: currentSession.id,
        clientId: payload.clientId,
        userId: payload.sub,
        revokedAt: null,
      },
      data: {
        revokedAt: renewedAt,
        revokeReason: "session_renewed",
      },
    });
    if (revoked.count === 0) {
      const reloaded = await tx.appAuthSession.findUnique({
        where: { id: currentSession.id },
        select: { revokeReason: true },
      });
      if (reloaded?.revokeReason === "session_renewed") {
        const replacement = await tx.appAuthSession.findFirst({
          where: {
            clientId: payload.clientId,
            userId: payload.sub,
            revokedAt: null,
            id: { not: currentSession.id },
            createdAt: { gte: currentSession.createdAt },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            createdAt: true,
            expiresAt: true,
          },
        });
        if (
          replacement &&
          !isAppAuthSessionExpired({
            createdAt: replacement.createdAt,
            expiresAt: replacement.expiresAt,
            now: renewedAt,
          })
        ) {
          return {
            ok: true,
            session: { id: replacement.id, expiresAt: replacement.expiresAt },
            user: {
              id: currentSession.user.id,
              clientId: currentSession.user.clientId,
              name: currentSession.user.name,
              email: currentSession.user.email,
              role: currentSession.user.role,
              departmentId: currentSession.user.departmentId,
              departmentName: currentSession.user.department?.name ?? null,
              client: currentSession.user.client,
            },
          };
        }
      }
      return { ok: false, reason: "session_revoked" };
    }
    const nextSession = await tx.appAuthSession.create({
      data: {
        clientId: payload.clientId,
        userId: payload.sub,
        userAgent,
        ipHash,
        expiresAt: buildAppAuthSessionExpiresAt(renewedAt),
      },
      select: {
        id: true,
        expiresAt: true,
      },
    });
    await tx.event.create({
      data: {
        clientId: payload.clientId,
        eventName: "auth.session_renewed",
        requestId: `auth.session_renewed:${currentSession.id}`,
        payloadJson: {
          userId: payload.sub,
          role: currentSession.user.role,
          oldSessionId: currentSession.id,
          newSessionId: nextSession.id,
        },
      },
    });
    return {
      ok: true,
      session: nextSession,
      user: {
        id: currentSession.user.id,
        clientId: currentSession.user.clientId,
        name: currentSession.user.name,
        email: currentSession.user.email,
        role: currentSession.user.role,
        departmentId: currentSession.user.departmentId,
        departmentName: currentSession.user.department?.name ?? null,
        client: currentSession.user.client,
      },
    };
  });
}

export async function revokeAppSession(params: {
  clientId: string;
  userId: string;
  sessionId: string;
  reason: string;
}) {
  const prisma = getPrisma();
  const result = await prisma.$transaction(async (tx) => {
    const revoked = await tx.appAuthSession.updateMany({
      where: {
        id: params.sessionId,
        clientId: params.clientId,
        userId: params.userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokeReason: params.reason,
      },
    });
    if (revoked.count > 0) {
      const user = await tx.user.findFirst({
        where: { id: params.userId, clientId: params.clientId },
        select: { role: true },
      });
      await tx.event.create({
        data: {
          clientId: params.clientId,
          eventName: params.reason === "logout" ? "auth.logout" : "auth.session_revoked",
          requestId: `auth.session_revoked:${params.sessionId}:${params.reason}`,
          payloadJson: {
            userId: params.userId,
            role: user?.role ?? null,
            sessionId: params.sessionId,
            reason: params.reason,
          },
        },
      });
    }
    return revoked;
  });
  logger.info({
    event: "auth.session.revoked",
    clientId: params.clientId,
    userId: params.userId,
    sessionId: params.sessionId,
    reason: params.reason,
    count: result.count,
  });
  return result.count;
}

export async function revokeAllUserSessionsAndPush(params: {
  clientId: string;
  userId: string;
  reason: string;
}) {
  const now = new Date();
  const result = await getPrisma().$transaction(async (tx) => {
    const sessions = await tx.appAuthSession.updateMany({
      where: {
        clientId: params.clientId,
        userId: params.userId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        revokeReason: params.reason,
      },
    });
    const push = await revokeUserPushSubscriptions({ ...params, tx });
    if (sessions.count > 0) {
      const user = await tx.user.findFirst({
        where: { id: params.userId, clientId: params.clientId },
        select: { role: true },
      });
      await tx.event.create({
        data: {
          clientId: params.clientId,
          eventName: "auth.session_revoked",
          requestId: `auth.session_revoked:${params.userId}:${params.reason}:${crypto.randomUUID()}`,
          payloadJson: {
            userId: params.userId,
            role: user?.role ?? null,
            reason: params.reason,
            revokedCount: sessions.count,
          },
        },
      });
    }
    return { sessions: sessions.count, push };
  });
  logger.info({
    event: "auth.session.revoked",
    clientId: params.clientId,
    userId: params.userId,
    reason: params.reason,
    count: result.sessions,
  });
  return result;
}

function isSmtpConfigured() {
  return Boolean(env.SMTP_HOST.trim() && env.SMTP_FROM.trim());
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildPasswordResetEmail(params: {
  name: string;
  resetUrl: string;
}) {
  const greetingName = params.name.trim() ? `, ${params.name.trim()}` : "";
  const escapedGreetingName = escapeHtml(greetingName);
  const escapedResetUrl = escapeHtml(params.resetUrl);
  const text = [
    `Ola${greetingName}.`,
    "",
    "Recebemos uma solicitacao para redefinir sua senha no Converta.",
    "Use o link abaixo em ate 30 minutos:",
    params.resetUrl,
    "",
    "Se voce nao solicitou isso, ignore esta mensagem. Nenhuma alteracao sera feita sem acessar o link.",
    "",
    "Equipe Converta",
  ].join("\n");
  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Recuperacao de senha Converta</title>
  </head>
  <body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#10203b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d9e2ef;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#06132a;padding:22px 24px;color:#ffffff;">
                <div style="font-size:20px;font-weight:700;letter-spacing:.2px;">Converta</div>
                <div style="margin-top:4px;font-size:13px;color:#cbd5e1;">Recuperacao de senha</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px;">
                <p style="margin:0 0 14px;font-size:16px;line-height:1.5;">Ola${escapedGreetingName}.</p>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#334155;">
                  Recebemos uma solicitacao para redefinir sua senha no Converta.
                  O link abaixo expira em <strong>30 minutos</strong> e pode ser usado apenas uma vez.
                </p>
                <p style="margin:26px 0;text-align:center;">
                  <a href="${escapedResetUrl}" style="display:inline-block;background:#fc6c16;color:#ffffff;text-decoration:none;font-weight:700;border-radius:10px;padding:13px 20px;">
                    Redefinir senha
                  </a>
                </p>
                <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#64748b;">
                  Se o botao nao funcionar, copie e cole este link no navegador:
                </p>
                <p style="margin:0 0 18px;word-break:break-all;font-size:12px;line-height:1.5;color:#475569;">${escapedResetUrl}</p>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
                  Se voce nao solicitou essa alteracao, ignore este e-mail. Nenhuma alteracao sera feita sem acessar o link.
                </p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e2e8f0;padding:16px 24px;font-size:12px;color:#64748b;background:#f8fafc;">
                E-mail automatico. Nao responda esta mensagem.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return {
    subject: "Redefina sua senha no Converta",
    text,
    html,
  };
}

export function buildResendPasswordResetPayload(params: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  return {
    from: params.from,
    to: [params.to],
    subject: params.subject,
    text: params.text,
    html: params.html,
  };
}

function shouldUseResendApiFallback() {
  return env.SMTP_HOST.trim().toLowerCase() === "smtp.resend.com";
}

async function sendPasswordResetViaResendApi(params: {
  to: string;
  message: ReturnType<typeof buildPasswordResetEmail>;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SMTP_PASS}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      buildResendPasswordResetPayload({
        from: env.SMTP_FROM,
        to: params.to,
        subject: params.message.subject,
        text: params.message.text,
        html: params.message.html,
      })
    ),
  });
  if (!response.ok) {
    throw new Error(`resend_api_failed:${response.status}`);
  }
}

async function sendPasswordResetEmail(params: {
  to: string;
  name: string;
  resetUrl: string;
}) {
  if (!isSmtpConfigured()) return { ok: false as const, reason: "smtp_not_configured" as const };
  const message = buildPasswordResetEmail({
    name: params.name,
    resetUrl: params.resetUrl,
  });
  if (shouldUseResendApiFallback()) {
    await sendPasswordResetViaResendApi({
      to: params.to,
      message,
    });
    return { ok: true as const };
  }
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth:
      env.SMTP_USER.trim() || env.SMTP_PASS.trim()
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
  });
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: params.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  return { ok: true as const };
}

export function buildPasswordResetUrlFromBase(base: string, token: string) {
  const baseUrl = base.trim().replace(/\/+$/, "");
  if (!baseUrl) return "";
  const resetBaseUrl = baseUrl.endsWith("/app/reset-password")
    ? baseUrl
    : `${baseUrl}/app/reset-password`;
  return `${resetBaseUrl}?token=${encodeURIComponent(token)}`;
}

export function buildPasswordResetUrl(token: string) {
  return buildPasswordResetUrlFromBase(env.PASSWORD_RESET_BASE_URL, token);
}

export async function requestPasswordReset(params: {
  email: string;
  req: IncomingMessage;
}) {
  const email = params.email.trim().toLowerCase();
  const prisma = getPrisma();
  const user = email
    ? await prisma.user.findFirst({
        where: {
          email,
          isActive: true,
          client: { status: "ACTIVE" },
        },
        select: {
          id: true,
          clientId: true,
          email: true,
          name: true,
        },
      })
    : null;

  if (!user) {
    logger.info({
      event: "auth.password_reset.requested",
      outcome: "not_found_or_inactive",
    });
    return { ok: true as const, delivered: false };
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: {
        clientId: user.clientId,
        userId: user.id,
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });
    await tx.passwordResetToken.create({
      data: {
        clientId: user.clientId,
        userId: user.id,
        tokenHash,
        expiresAt,
        requestedIpHash: hashSensitiveValue(getRequestIp(params.req)),
        userAgent: String(params.req.headers["user-agent"] ?? "").slice(0, 500) || null,
      },
    });
  });

  const resetUrl = buildPasswordResetUrl(token);
  let delivered = false;
  if (resetUrl) {
    try {
      const emailResult = await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl,
      });
      delivered = emailResult.ok;
      if (emailResult.ok) {
        logger.info({
          event: "auth.password_reset.email_sent",
          clientId: user.clientId,
          userId: user.id,
        });
      }
    } catch (error) {
      logger.warn({
        event: "auth.password_reset.email_failed",
        clientId: user.clientId,
        userId: user.id,
        message: (error as Error).message,
      });
    }
  } else {
    logger.warn({
      event: "auth.password_reset.email_failed",
      clientId: user.clientId,
      userId: user.id,
      reason: "password_reset_base_url_missing",
    });
  }
  if (resetUrl && !isSmtpConfigured()) {
    logger.warn({
      event: "auth.password_reset.email_failed",
      clientId: user.clientId,
      userId: user.id,
      reason: "smtp_not_configured",
    });
  }

  logger.info({
    event: "auth.password_reset.requested",
    clientId: user.clientId,
    userId: user.id,
    delivered,
    deliveryConfigured: Boolean(resetUrl && isSmtpConfigured()),
  });
  return { ok: true as const, delivered };
}

export async function resetPasswordWithToken(params: {
  token: string;
  password: string;
}) {
  const tokenHash = hashResetToken(params.token.trim());
  const prisma = getPrisma();
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      clientId: true,
      userId: true,
      usedAt: true,
      expiresAt: true,
    },
  });
  if (!record || record.usedAt) {
    return { ok: false as const, reason: "invalid_token" as const };
  }
  if (record.expiresAt <= new Date()) {
    return { ok: false as const, reason: "token_expired" as const };
  }
  if (params.password.length < 8) {
    return { ok: false as const, reason: "weak_password" as const };
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash: hashPassword(params.password) },
    });
    await tx.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    await tx.passwordResetToken.updateMany({
      where: {
        clientId: record.clientId,
        userId: record.userId,
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });
    const revokedSessions = await tx.appAuthSession.updateMany({
      where: {
        clientId: record.clientId,
        userId: record.userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokeReason: "password_reset",
      },
    });
    if (revokedSessions.count > 0) {
      await tx.event.create({
        data: {
          clientId: record.clientId,
          eventName: "auth.session_revoked",
          requestId: `auth.session_revoked:${record.userId}:password_reset:${crypto.randomUUID()}`,
          payloadJson: {
            userId: record.userId,
            role: null,
            reason: "password_reset",
            revokedCount: revokedSessions.count,
          },
        },
      });
    }
    await revokeUserPushSubscriptions({
      clientId: record.clientId,
      userId: record.userId,
      reason: "password_reset",
      tx,
    });
  });
  logger.info({
    event: "auth.password_reset.completed",
    clientId: record.clientId,
    userId: record.userId,
  });
  return { ok: true as const };
}
