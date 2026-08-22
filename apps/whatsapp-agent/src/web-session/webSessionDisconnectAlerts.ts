import type { Prisma, PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { resolveWebSessionAlertEmails } from "../config/tenantOperationalConfig.js";
import { logger } from "../logger/logger.js";
import type { WebSessionDisconnectInfo } from "./webSessionLifecycle.js";

export const WEB_SESSION_RECOVERABLE_DISCONNECT_ALERT_GRACE_MS = 3 * 60 * 1000;

const ALERT_ATTEMPT_EVENTS = [
  "web_session.disconnect_alert.sent",
  "web_session.disconnect_alert.failed",
  "web_session.disconnect_alert.skipped",
];

type WebSessionDisconnectAlertSender = (message: {
  to: string[];
  subject: string;
  text: string;
  html: string;
}) => Promise<void>;

let senderOverride: WebSessionDisconnectAlertSender | null = null;

export function setWebSessionDisconnectAlertSenderForTests(sender: WebSessionDisconnectAlertSender | null) {
  senderOverride = sender;
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
  return Boolean(env.SMTP_HOST.trim() && env.SMTP_FROM.trim());
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
  const message = error instanceof Error ? error.message : String(error || "unknown_error");
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/(token|secret|password|pass|api[_-]?key)=([^&\s]+)/gi, "$1=[REDACTED]")
    .slice(0, 160);
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
  if (!isSmtpConfigured()) throw new Error("smtp_not_configured");
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
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
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
    eventNames: ALERT_ATTEMPT_EVENTS,
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
    eventNames: ALERT_ATTEMPT_EVENTS,
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
  try {
    await (senderOverride ?? defaultSender)({ to: recipients, ...message });
    await recordAlertEvent({
      prisma: params.prisma,
      clientId: params.clientId,
      eventName: "web_session.disconnect_alert.sent",
      requestId: `web-session-alert:${params.channelAccountId}:sent:${Date.now()}`,
      payloadJson: basePayload,
    });
    return { sent: true as const, recipients: recipients.length };
  } catch (error) {
    const reason = sanitizeOperationalError(error);
    logger.warn({
      event: "web_session.disconnect_alert.email_failed",
      clientId: params.clientId,
      reason,
    });
    await recordAlertEvent({
      prisma: params.prisma,
      clientId: params.clientId,
      eventName: "web_session.disconnect_alert.failed",
      requestId: `web-session-alert:${params.channelAccountId}:failed:${Date.now()}`,
      payloadJson: { ...basePayload, reason },
    }).catch((eventError) => {
      logger.warn({
        event: "web_session.disconnect_alert.event_failed",
        clientId: params.clientId,
        reason: eventError instanceof Error ? eventError.message.slice(0, 160) : "unknown_error",
      });
    });
    return { sent: false as const, reason: "email_failed" as const };
  }
}
