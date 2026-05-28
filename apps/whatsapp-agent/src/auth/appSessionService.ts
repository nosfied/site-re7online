import crypto from "node:crypto";
import nodemailer from "nodemailer";
import type { IncomingMessage } from "node:http";
import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";
import { hashPassword, verifyClientAuthTokenDetailed } from "./clientAuth.js";
import { normalizeUserRole, type ClientAuthContext } from "./clientAuthMiddleware.js";

export const APP_AUTH_SESSION_EXPIRES_AT = new Date("9999-12-31T23:59:59.999Z");
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
  const userAgent = String(params.req.headers["user-agent"] ?? "").slice(0, 500) || null;
  const ipHash = hashSensitiveValue(getRequestIp(params.req));
  const result = await prisma.$transaction(async (tx) => {
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
    const session = await tx.appAuthSession.create({
      data: {
        clientId: params.clientId,
        userId: params.userId,
        userAgent,
        ipHash,
        expiresAt: APP_AUTH_SESSION_EXPIRES_AT,
      },
      select: {
        id: true,
        expiresAt: true,
      },
    });
    return { session, replaced: revoked.count };
  });
  if (result.replaced > 0) {
    logger.info({
      event: "auth.session.replaced",
      clientId: params.clientId,
      userId: params.userId,
      count: result.replaced,
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
          : "session_revoked",
    };
  }
  const now = new Date();
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

export async function revokeAppSession(params: {
  clientId: string;
  userId: string;
  sessionId: string;
  reason: string;
}) {
  const result = await getPrisma().appAuthSession.updateMany({
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
    await tx.appAuthSession.updateMany({
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
