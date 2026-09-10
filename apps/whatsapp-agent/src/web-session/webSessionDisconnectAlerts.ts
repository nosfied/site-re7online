import type { Prisma, PrismaClient } from "@prisma/client";
import { resolveWebSessionAlertEmails } from "../config/tenantOperationalConfig.js";
import { logger } from "../logger/logger.js";
import {
  canonicalMailDeliveryError,
  isCanonicalMailConfigured,
  resolveCanonicalMailSmtpSecure,
  sanitizeMailDeliveryError,
  sendCanonicalMail,
} from "../mail/canonicalMail.js";
import type { WebSessionDisconnectInfo } from "./webSessionLifecycle.js";

export const WEB_SESSION_RECOVERABLE_DISCONNECT_ALERT_GRACE_MS = 3 * 60 * 1000;
export const WEB_SESSION_DISCONNECT_ALERT_MAX_ATTEMPTS = 3;
const WEB_SESSION_DISCONNECT_ALERT_RETRY_DELAYS_MS = [1_000, 5_000];

const ALERT_INCIDENT_EVENTS = [
  "web_session.disconnect_alert.sent",
  "web_session.disconnect_alert.failed",
  "web_session.disconnect_alert.failed_retryable",
  "web_session.disconnect_alert.failed_terminal",
  "web_session.disconnect_alert.skipped",
];

const ALERT_DEDUPE_EVENTS = [
  "web_session.disconnect_alert.sent",
  "web_session.disconnect_alert.failed_terminal",
  "web_session.disconnect_alert.skipped",
];

type WebSessionDisconnectAlertSender = (message: {
  to: string[];
  subject: string;
  text: string;
  html: string;
}) => Promise<void>;

let senderOverride: WebSessionDisconnectAlertSender | null = null;
let retryDelayOverride: ((delayMs: number) => Promise<void>) | null = null;

export function setWebSessionDisconnectAlertSenderForTests(sender: WebSessionDisconnectAlertSender | null) {
  senderOverride = sender;
}

export function setWebSessionDisconnectAlertRetryDelayForTests(delay: ((delayMs: number) => Promise<void>) | null) {
  retryDelayOverride = delay;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isSmtpConfigured() {
  return isCanonicalMailConfigured();
}

export function resolveWebSessionDisconnectAlertSmtpSecure(port: number) {
  return resolveCanonicalMailSmtpSecure(port);
}

function maskChannelAccountId(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? `****${digits.slice(-4)}` : "****";
}

function sanitizeReason(value: unknown) {
  if (typeof value !== "string") return null;
  return value.trim().replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 80) || null;
}

function sanitizeOperationalError(error: unknown) {
  return sanitizeMailDeliveryError(error).slice(0, 160);
}

function isRetryableAlertDeliveryError(error: unknown) {
  const message = sanitizeOperationalError(error).toLowerCase();
  if (
    message.includes("smtp_not_configured") ||
    message.includes("invalid recipient") ||
    message.includes("recipient rejected") ||
    message.includes("authentication") ||
    message.includes("invalid login") ||
    message.includes("535") ||
    message.includes("550") ||
    message.includes("551") ||
    message.includes("553") ||
    message.includes("554")
  ) {
    return false;
  }
  return (
    message.includes("greeting never received") ||
    message.includes("timeout") ||
    message.includes("timedout") ||
    message.includes("etimedout") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("eai_again") ||
    message.includes("esocket") ||
    message.includes("network")
  );
}

function waitBeforeAlertRetry(delayMs: number) {
  if (retryDelayOverride) return retryDelayOverride(delayMs);
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

function buildFingerprint(params: { clientId: string; channelAccountId: string }) {
  return `web_session_disconnect:${params.clientId}:${params.channelAccountId}`;
}

function readAlertFingerprint(payload: unknown) {
  return isRecord(payload) && typeof payload.fingerprint === "string" ? payload.fingerprint : null;
}

async function latestAlertEvent(params: {
  prisma: PrismaClient;
  clientId: string;
  fingerprint: string;
  eventNames: string[];
}) {
  const events = await params.prisma.event.findMany({
    where: {
      clientId: params.clientId,
      eventName: { in: params.eventNames },
    },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { id: true, eventName: true, createdAt: true, payloadJson: true },
  });
  return events.find((event) => readAlertFingerprint(event.payloadJson) === params.fingerprint) ?? null;
}

async function resolveWebSessionDisconnectAlertRecipients(params: {
  prisma: PrismaClient;
  clientId: string;
}) {
  const resolved = await resolveWebSessionAlertEmails({
    prisma: params.prisma,
    clientId: params.clientId,
  });
  return resolved.emails;
}

export function buildWebSessionDisconnectAlertEmail(params: {
  tenantName: string;
  clientKey: string;
  channelAccountId: string;
  observedState: string;
  detectedAt: string;
  disconnectInfo: Pick<WebSessionDisconnectInfo, "statusCode" | "reasonCode" | "classification">;
  reconnectStatus: "em andamento" | "falhou" | "nao disponivel";
}) {
  const subject = `[Converta] Canal WhatsApp desconectado — ${params.clientKey}`;
  const reason = sanitizeReason(params.disconnectInfo.reasonCode) ?? "unknown";
  const rows = [
    ["Tenant", params.tenantName || params.clientKey],
    ["Canal", `WhatsApp Web Session ${maskChannelAccountId(params.channelAccountId)}`],
    ["Estado", params.observedState],
    ["Horario detectado", params.detectedAt],
    ["Disconnect reason", reason],
    ["Raw status", params.disconnectInfo.statusCode === null ? "n/a" : String(params.disconnectInfo.statusCode)],
    ["Classificacao", params.disconnectInfo.classification],
    ["Reconnect automatico", params.reconnectStatus],
  ];
  const text = [
    `Tenant: ${rows[0][1]}`,
    `Canal: ${rows[1][1]}`,
    `Estado: ${params.observedState}`,
    `Horario detectado: ${params.detectedAt}`,
    `Ultimo disconnect reason: ${reason}`,
    `Raw status: ${params.disconnectInfo.statusCode === null ? "n/a" : params.disconnectInfo.statusCode}`,
    `Classificacao: ${params.disconnectInfo.classification}`,
    `Reconnect automatico: ${params.reconnectStatus}`,
    "",
    "Acao recomendada: acesse o painel do tenant e, se o estado for QR_REQUIRED, faca o pareamento por QR.",
    "",
    "E-mail automatico. Nao contem QR, credenciais, tokens ou conteudo de mensagens.",
  ].join("\n");
  const htmlRows = rows
    .map(([label, value]) => `<tr><td style="padding:6px 10px;color:#475569;">${escapeHtml(label)}</td><td style="padding:6px 10px;font-weight:700;">${escapeHtml(value)}</td></tr>`)
    .join("");
  const html = `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,Helvetica,sans-serif;color:#10203b;background:#f8fafc;padding:24px;"><h2 style="margin:0 0 12px;">Canal WhatsApp desconectado</h2><table>${htmlRows}</table><p>Acao recomendada: acesse o painel do tenant e, se o estado for QR_REQUIRED, faca o pareamento por QR.</p><p style="color:#64748b;font-size:12px;">E-mail automatico. Nao contem QR, credenciais, tokens ou conteudo de mensagens.</p></body></html>`;
  return { subject, text, html };
}

async function defaultSender(message: { to: string[]; subject: string; text: string; html: string }) {
  const result = await sendCanonicalMail({ message });
  if (result.status !== "DELIVERED") throw canonicalMailDeliveryError(result);
}

async function recordAlertEvent(params: {
  prisma: PrismaClient;
  clientId: string;
  eventName: string;
  requestId: string;
  payloadJson: Prisma.InputJsonValue;
}) {
  await params.prisma.event.create({
    data: {
      clientId: params.clientId,
      requestId: params.requestId,
      eventName: params.eventName,
      payloadJson: params.payloadJson,
    },
  });
}

export async function closeWebSessionDisconnectAlertIncident(params: {
  prisma: PrismaClient;
  clientId: string;
  channelAccountId: string;
  observedState: string;
  detectedAt?: string;
}) {
  const fingerprint = buildFingerprint(params);
  const latestAttempt = await latestAlertEvent({
    prisma: params.prisma,
    clientId: params.clientId,
    fingerprint,
    eventNames: ALERT_INCIDENT_EVENTS,
  });
  if (!latestAttempt) return { closed: false as const, reason: "no_open_incident" as const };
  const latestClose = await latestAlertEvent({
    prisma: params.prisma,
    clientId: params.clientId,
    fingerprint,
    eventNames: ["web_session.disconnect_alert.closed"],
  });
  if (latestClose && latestClose.createdAt >= latestAttempt.createdAt) {
    return { closed: false as const, reason: "already_closed" as const };
  }
  await recordAlertEvent({
    prisma: params.prisma,
    clientId: params.clientId,
    eventName: "web_session.disconnect_alert.closed",
    requestId: `web-session-alert:${params.channelAccountId}:closed:${Date.now()}`,
    payloadJson: {
      fingerprint,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: params.channelAccountId,
      observedState: params.observedState,
      detectedAt: params.detectedAt ?? new Date().toISOString(),
    },
  });
  return { closed: true as const };
}

export async function notifyWebSessionDisconnectAlert(params: {
  prisma: PrismaClient;
  clientId: string;
  clientKey: string;
  tenantName: string;
  channelAccountId: string;
  observedState: string;
  disconnectInfo: Pick<WebSessionDisconnectInfo, "statusCode" | "reasonCode" | "classification">;
  reconnectStatus: "em andamento" | "falhou" | "nao disponivel";
  detectedAt?: string;
}) {
  const fingerprint = buildFingerprint(params);
  const latestClose = await latestAlertEvent({
    prisma: params.prisma,
    clientId: params.clientId,
    fingerprint,
    eventNames: ["web_session.disconnect_alert.closed"],
  });
  const latestAttempt = await latestAlertEvent({
    prisma: params.prisma,
    clientId: params.clientId,
    fingerprint,
    eventNames: ALERT_DEDUPE_EVENTS,
  });
  if (latestAttempt && (!latestClose || latestAttempt.createdAt > latestClose.createdAt)) {
    return { sent: false as const, reason: "deduped" as const };
  }

  const recipients = await resolveWebSessionDisconnectAlertRecipients({
    prisma: params.prisma,
    clientId: params.clientId,
  });
  const detectedAt = params.detectedAt ?? new Date().toISOString();
  const basePayload = {
    fingerprint,
    channel: "whatsapp",
    provider: "web_session",
    channelAccountId: params.channelAccountId,
    observedState: params.observedState,
    rawStatusCode: params.disconnectInfo.statusCode,
    reasonCode: sanitizeReason(params.disconnectInfo.reasonCode),
    classification: params.disconnectInfo.classification,
    reconnectStatus: params.reconnectStatus,
    detectedAt,
    recipientCount: recipients.length,
  };
  if (recipients.length === 0) {
    await recordAlertEvent({
      prisma: params.prisma,
      clientId: params.clientId,
      eventName: "web_session.disconnect_alert.skipped",
      requestId: `web-session-alert:${params.channelAccountId}:skipped:${Date.now()}`,
      payloadJson: { ...basePayload, reason: "no_web_session_alert_emails" },
    });
    return { sent: false as const, reason: "no_recipients" as const };
  }

  const message = buildWebSessionDisconnectAlertEmail({
    tenantName: params.tenantName,
    clientKey: params.clientKey,
    channelAccountId: params.channelAccountId,
    observedState: params.observedState,
    detectedAt,
    disconnectInfo: params.disconnectInfo,
    reconnectStatus: params.reconnectStatus,
  });
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= WEB_SESSION_DISCONNECT_ALERT_MAX_ATTEMPTS; attempt += 1) {
    await recordAlertEvent({
      prisma: params.prisma,
      clientId: params.clientId,
      eventName: "web_session.disconnect_alert.attempt",
      requestId: `web-session-alert:${params.channelAccountId}:attempt:${attempt}:${Date.now()}`,
      payloadJson: { ...basePayload, attempt, maxAttempts: WEB_SESSION_DISCONNECT_ALERT_MAX_ATTEMPTS },
    });
    try {
      await (senderOverride ?? defaultSender)({ to: recipients, ...message });
      await recordAlertEvent({
        prisma: params.prisma,
        clientId: params.clientId,
        eventName: "web_session.disconnect_alert.sent",
        requestId: `web-session-alert:${params.channelAccountId}:sent:${Date.now()}`,
        payloadJson: { ...basePayload, attempt, maxAttempts: WEB_SESSION_DISCONNECT_ALERT_MAX_ATTEMPTS },
      });
      return { sent: true as const, recipients: recipients.length, attempts: attempt };
    } catch (error) {
      lastError = error;
      const reason = sanitizeOperationalError(error);
      const retryable = isRetryableAlertDeliveryError(error);
      const hasRetry = retryable && attempt < WEB_SESSION_DISCONNECT_ALERT_MAX_ATTEMPTS;
      logger.warn({
        event: retryable
          ? "web_session.disconnect_alert.email_failed_retryable"
          : "web_session.disconnect_alert.email_failed_terminal",
        clientId: params.clientId,
        reason,
        attempt,
        maxAttempts: WEB_SESSION_DISCONNECT_ALERT_MAX_ATTEMPTS,
      });
      if (!retryable) {
        await recordAlertEvent({
          prisma: params.prisma,
          clientId: params.clientId,
          eventName: "web_session.disconnect_alert.failed_terminal",
          requestId: `web-session-alert:${params.channelAccountId}:failed-terminal:${Date.now()}`,
          payloadJson: { ...basePayload, reason, attempt, maxAttempts: WEB_SESSION_DISCONNECT_ALERT_MAX_ATTEMPTS },
        }).catch((eventError) => {
          logger.warn({
            event: "web_session.disconnect_alert.event_failed",
            clientId: params.clientId,
            reason: eventError instanceof Error ? eventError.message.slice(0, 160) : "unknown_error",
          });
        });
        return { sent: false as const, reason: "email_failed_terminal" as const };
      }
      if (hasRetry) {
        const retryDelayMs = WEB_SESSION_DISCONNECT_ALERT_RETRY_DELAYS_MS[attempt - 1] ?? 5_000;
        await recordAlertEvent({
          prisma: params.prisma,
          clientId: params.clientId,
          eventName: "web_session.disconnect_alert.retry_scheduled",
          requestId: `web-session-alert:${params.channelAccountId}:retry:${attempt + 1}:${Date.now()}`,
          payloadJson: {
            ...basePayload,
            reason,
            attempt,
            nextAttempt: attempt + 1,
            maxAttempts: WEB_SESSION_DISCONNECT_ALERT_MAX_ATTEMPTS,
            retryDelayMs,
          },
        });
        await waitBeforeAlertRetry(retryDelayMs);
      }
    }
  }

  const reason = sanitizeOperationalError(lastError);
  logger.warn({
    event: "web_session.disconnect_alert.email_failed",
    clientId: params.clientId,
    reason,
    attempt: WEB_SESSION_DISCONNECT_ALERT_MAX_ATTEMPTS,
    maxAttempts: WEB_SESSION_DISCONNECT_ALERT_MAX_ATTEMPTS,
  });
  await recordAlertEvent({
    prisma: params.prisma,
    clientId: params.clientId,
    eventName: "web_session.disconnect_alert.failed_retryable",
    requestId: `web-session-alert:${params.channelAccountId}:failed-retryable:${Date.now()}`,
    payloadJson: {
      ...basePayload,
      reason,
      attempt: WEB_SESSION_DISCONNECT_ALERT_MAX_ATTEMPTS,
      maxAttempts: WEB_SESSION_DISCONNECT_ALERT_MAX_ATTEMPTS,
    },
  }).catch((eventError) => {
    logger.warn({
      event: "web_session.disconnect_alert.event_failed",
      clientId: params.clientId,
      reason: eventError instanceof Error ? eventError.message.slice(0, 160) : "unknown_error",
    });
  });
  return { sent: false as const, reason: "email_failed_retryable" as const };
}
