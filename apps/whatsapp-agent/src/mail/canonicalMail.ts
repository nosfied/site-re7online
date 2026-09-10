import nodemailer from "nodemailer";
import { env as runtimeEnv } from "../config/env.js";

export type CanonicalMailMessage = {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
};

export type CanonicalMailProvider = "resend_api" | "smtp";

export type CanonicalMailDeliveryStatus =
  | "DELIVERED"
  | "RETRYABLE_TRANSPORT_FAILURE"
  | "PERMANENT_FAILURE";

export type CanonicalMailDeliveryResult = {
  status: CanonicalMailDeliveryStatus;
  provider: CanonicalMailProvider;
  reason?: string;
};

type MailEnvLike = {
  SMTP_HOST?: string;
  SMTP_PORT?: string | number;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
};

type SmtpTransportFactory = typeof nodemailer.createTransport;

export function sanitizeMailDeliveryError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "unknown_error");
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/(token|secret|password|pass|api[_-]?key)=([^&\s]+)/gi, "$1=[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]")
    .replace(/\+?\d[\d\s().-]{8,}\d/g, "[redacted]")
    .slice(0, 240);
}

function toNumber(value: string | number | undefined, fallback: number) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : fallback;
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readMailEnv(env: MailEnvLike = runtimeEnv) {
  return {
    host: (env.SMTP_HOST || "").trim(),
    port: toNumber(env.SMTP_PORT, 587),
    user: (env.SMTP_USER || "").trim(),
    pass: (env.SMTP_PASS || "").trim(),
    from: (env.SMTP_FROM || "").trim(),
  };
}

export function isCanonicalMailConfigured(env: MailEnvLike = runtimeEnv) {
  const config = readMailEnv(env);
  return Boolean(config.host && config.from);
}

export function resolveCanonicalMailSmtpSecure(port: number) {
  return port === 465 || port === 2465;
}

export function resolveCanonicalMailProvider(env: MailEnvLike = runtimeEnv): CanonicalMailProvider {
  const config = readMailEnv(env);
  return config.host.toLowerCase() === "smtp.resend.com" ? "resend_api" : "smtp";
}

export function buildCanonicalResendPayload(params: {
  from: string;
  to: string | string[];
  subject: string;
  text: string;
  html: string;
}) {
  return {
    from: params.from,
    to: Array.isArray(params.to) ? params.to : [params.to],
    subject: params.subject,
    text: params.text,
    html: params.html,
  };
}

export function classifyMailDeliveryError(error: unknown): Exclude<CanonicalMailDeliveryStatus, "DELIVERED"> {
  const message = sanitizeMailDeliveryError(error).toLowerCase();
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
    message.includes("554") ||
    message.includes("resend_api_failed:400") ||
    message.includes("resend_api_failed:401") ||
    message.includes("resend_api_failed:403") ||
    message.includes("resend_api_failed:404")
  ) {
    return "PERMANENT_FAILURE";
  }
  return "RETRYABLE_TRANSPORT_FAILURE";
}

export function canonicalMailDeliveryError(result: CanonicalMailDeliveryResult) {
  return new Error(`mail_delivery_failed:${result.status}:${result.reason || "unknown_error"}`);
}

async function sendViaResendApi(params: { config: ReturnType<typeof readMailEnv>; message: CanonicalMailMessage }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.config.pass}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      buildCanonicalResendPayload({
        from: params.config.from,
        to: params.message.to,
        subject: params.message.subject,
        text: params.message.text,
        html: params.message.html,
      })
    ),
  });
  if (!response.ok) throw new Error(`resend_api_failed:${response.status}`);
}

async function sendViaSmtp(params: {
  config: ReturnType<typeof readMailEnv>;
  message: CanonicalMailMessage;
  smtpTransportFactory?: SmtpTransportFactory;
}) {
  const createTransport = params.smtpTransportFactory ?? nodemailer.createTransport;
  const transporter = createTransport({
    host: params.config.host,
    port: params.config.port,
    secure: resolveCanonicalMailSmtpSecure(params.config.port),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    auth:
      params.config.user || params.config.pass
        ? { user: params.config.user, pass: params.config.pass }
        : undefined,
  });
  await transporter.sendMail({
    from: params.config.from,
    to: params.message.to,
    subject: params.message.subject,
    text: params.message.text,
    html: params.message.html,
  });
}

export async function sendCanonicalMail(params: {
  message: CanonicalMailMessage;
  env?: MailEnvLike;
  smtpTransportFactory?: SmtpTransportFactory;
}): Promise<CanonicalMailDeliveryResult> {
  const config = readMailEnv(params.env);
  const provider = resolveCanonicalMailProvider(params.env);
  if (!config.host || !config.from) {
    return { status: "PERMANENT_FAILURE", provider, reason: "smtp_not_configured" };
  }
  try {
    if (provider === "resend_api") {
      await sendViaResendApi({ config, message: params.message });
    } else {
      await sendViaSmtp({
        config,
        message: params.message,
        smtpTransportFactory: params.smtpTransportFactory,
      });
    }
    return { status: "DELIVERED", provider };
  } catch (error) {
    return {
      status: classifyMailDeliveryError(error),
      provider,
      reason: sanitizeMailDeliveryError(error),
    };
  }
}
