import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export type TemplateReviewNotificationMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type TemplateReviewNotificationSender = (
  message: TemplateReviewNotificationMessage
) => Promise<void>;

let senderOverride: TemplateReviewNotificationSender | null = null;

export function setTemplateReviewNotificationSenderForTests(
  sender: TemplateReviewNotificationSender | null
) {
  senderOverride = sender;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function resolveTemplateReviewNotifyEmail() {
  return (
    process.env.TEMPLATE_REVIEW_NOTIFY_EMAIL?.trim() ||
    process.env.TEMPLATE_REVIEW_FALLBACK_EMAIL?.trim() ||
    "re7online@gmail.com"
  );
}

export function sanitizeTemplateReviewNotificationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/(token|secret|password|pass|api[_-]?key)=([^&\s]+)/gi, "$1=[REDACTED]")
    .slice(0, 240);
}

function isSmtpConfigured() {
  return Boolean(env.SMTP_HOST.trim() && env.SMTP_FROM.trim());
}

async function defaultSender(message: TemplateReviewNotificationMessage) {
  if (!isSmtpConfigured()) {
    throw new Error("smtp_not_configured");
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
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

export async function sendTemplateReviewNotification(params: {
  tenantName: string;
  clientKey: string;
  requestedBy: string | null;
  name: string;
  category: string;
  language: string;
  content: string;
  variables: Array<{ key: string; description: string; example: string }>;
  adminPath: string;
}) {
  const to = resolveTemplateReviewNotifyEmail();
  const subject = `Nova solicitação de template — ${params.tenantName}`;
  const variableLines =
    params.variables.length > 0
      ? params.variables.map(
          (item) =>
            `- {{${item.key}}}: ${item.description || "sem descricao"} | exemplo: ${item.example || "sem exemplo"}`
        )
      : ["- Sem variaveis detectadas."];
  const text = [
    `Tenant: ${params.tenantName}`,
    `Client key: ${params.clientKey}`,
    `Solicitado por: ${params.requestedBy || "nao informado"}`,
    `Nome: ${params.name}`,
    `Categoria: ${params.category}`,
    `Idioma: ${params.language}`,
    "",
    "Conteudo:",
    params.content,
    "",
    "Variaveis:",
    ...variableLines,
    "",
    `Revisao interna: ${params.adminPath}`,
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2>Nova solicitação de template</h2>
      <p><strong>Tenant:</strong> ${escapeHtml(params.tenantName)}</p>
      <p><strong>Client key:</strong> ${escapeHtml(params.clientKey)}</p>
      <p><strong>Solicitado por:</strong> ${escapeHtml(params.requestedBy || "nao informado")}</p>
      <p><strong>Nome:</strong> ${escapeHtml(params.name)}</p>
      <p><strong>Categoria:</strong> ${escapeHtml(params.category)}</p>
      <p><strong>Idioma:</strong> ${escapeHtml(params.language)}</p>
      <p><strong>Conteúdo:</strong></p>
      <pre style="white-space:pre-wrap;background:#f3f4f6;padding:12px;border-radius:6px">${escapeHtml(params.content)}</pre>
      <p><strong>Variáveis:</strong></p>
      <ul>${variableLines.map((line) => `<li>${escapeHtml(line.replace(/^- /, ""))}</li>`).join("")}</ul>
      <p><strong>Revisão interna:</strong> ${escapeHtml(params.adminPath)}</p>
    </div>
  `;
  const sender = senderOverride ?? defaultSender;
  await sender({ to, subject, text, html });
  return { to };
}
