import { normalizeWaIdDigits } from "../utils/waid.js";

export type Env = {
  PORT: number;
  ENV: string;
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_ACCESS_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_API_VERSION: string;
  WHATSAPP_ALLOWLIST: string[];
  WHATSAPP_ADMIN_ALLOWLIST: string[];
  WHATSAPP_ECHO_ENABLED: boolean;
  WHATSAPP_DEFAULT_REPLY: string;
  WHATSAPP_SANDBOX: boolean;
  WHATSAPP_SANDBOX_TO: string;
  WHATSAPP_OUT_OF_WINDOW_TEMPLATE: string;
  WHATSAPP_DEDUP_WINDOW_SECONDS: number;
  META_APP_SECRET: string;
  META_INSTAGRAM_APP_SECRET: string;
  OPENAI_API_KEY: string;
  WHATSAPP_AI_ENABLED: boolean;
  WHATSAPP_AI_MODEL: string;
  WHATSAPP_AI_MAX_OUTPUT_TOKENS: number;
  WHATSAPP_AI_TEMPERATURE: number;
  WHATSAPP_AI_SYSTEM_PROMPT: string;
  WHATSAPP_AI_TIMEOUT_MS: number;
  AI_ASSISTANT_ENABLED: boolean;
  FLOW_INTENT_CLASSIFIER_ENABLED: boolean;
  FOLLOWUP_ENABLED: boolean;
  FOLLOWUP_DRY_RUN: boolean;
  FOLLOWUP_DEFAULT_DELAY_MINUTES: number;
  FOLLOWUP_MAX_PER_CONVERSATION: number;
  FOLLOWUP_MIN_INTERVAL_MINUTES: number;
  DISABLE_DEBUG_COMMANDS: boolean;
  OUTBOUND_TEMPLATE_FALLBACK: boolean;
  OUTBOUND_TEMPLATE_DEFAULT_NAME: string;
  OUTBOUND_TEMPLATE_DEFAULT_LANG: string;
  OUTBOUND_TEMPLATE_FALLBACK_NAME: string;
  OUTBOUND_TEMPLATE_FALLBACK_LANG: string;
  OUTBOUND_TEMPLATE_INTENT_MAP: Record<string, { name: string; language?: string }>;
  OUTBOUND_TEXT_ENABLED: boolean;
  HANDOFF_ENABLED: boolean;
  HANDOFF_ATTENDANT_WAID: string;
  HANDOFF_TEMPLATE_NAME: string;
  HANDOFF_TEMPLATE_LANG: string;
  HANDOFF_NOTIFY_FALLBACK_TO_TEMPLATE: boolean;
  ADMIN_TOKEN: string;
  APP_AUTH_SECRET: string;
  ALLOW_ADMIN_DEBUG_IN_PROD: boolean;
  CONV_STATE_DUAL_WRITE: boolean;
  CONV_STATE_SHADOW_COMPARE: boolean;
  CONV_STATE_DB_WRITE_STRICT: boolean;
  CONV_STATE_JSON_WRITE_ENABLED: boolean;
  CONV_STATE_READ_SOURCE: "json" | "hybrid" | "postgres";
  CONV_STATE_READ_SOURCE_SET: boolean;
  MULTICHANNEL_SHADOW_WRITE: boolean;
  MULTICHANNEL_SHADOW_STRICT: boolean;
  MULTICHANNEL_DUAL_READ: boolean;
  CHANNEL_ACCOUNTS_RUNTIME_SHADOW: boolean;
  CHANNEL_ACCOUNTS_DB_FIRST_MESSENGER: boolean;
  WEB_PUSH_VAPID_PUBLIC_KEY: string;
  WEB_PUSH_VAPID_PRIVATE_KEY: string;
  WEB_PUSH_SUBJECT: string;
  PASSWORD_RESET_BASE_URL: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER: string;
  SMTP_PASS: string;
  SMTP_FROM: string;
  STORAGE_MODE: "json" | "hybrid" | "postgres";
  STORAGE_MODE_SET: boolean;
  CLIENT_KEY: string;
  CLIENT_ID: string;
  OUTBOUND_TEMPLATES_BY_CLIENT: Record<
    string,
    Record<string, { name: string; language?: string }>
  >;
  verifyTokenPresent: boolean;
  accessTokenPresent: boolean;
  phoneNumberIdPresent: boolean;
  outboundEnabled: boolean;
};

export function normalizeWaId(input: string): string {
  return normalizeWaIdDigits(input);
}

function toNumber(value: string | undefined, fallback: number) {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

function toStorageMode(value: string | undefined): "json" | "hybrid" | "postgres" {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "hybrid" || normalized === "postgres") {
    return normalized;
  }
  return "json";
}

function toConversationReadSource(
  value: string | undefined
): "json" | "hybrid" | "postgres" {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "hybrid" || normalized === "postgres") {
    return normalized;
  }
  return "json";
}

export function getEnv(): Env {
  const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
  const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN ?? "";
  const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
  const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION ?? "v24.0";
  const WHATSAPP_ALLOWLIST = (process.env.WHATSAPP_ALLOWLIST ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizeWaId)
    .filter(Boolean);
  const WHATSAPP_ADMIN_ALLOWLIST = (process.env.WHATSAPP_ADMIN_ALLOWLIST ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizeWaId)
    .filter(Boolean);
  const WHATSAPP_ECHO_ENABLED = (process.env.WHATSAPP_ECHO_ENABLED ?? "false") === "true";
  const WHATSAPP_DEFAULT_REPLY =
    process.env.WHATSAPP_DEFAULT_REPLY ??
    "Olá! Em breve nosso atendimento estará disponível por aqui.";
  const WHATSAPP_SANDBOX = (process.env.WHATSAPP_SANDBOX ?? "false") === "true";
  const WHATSAPP_SANDBOX_TO = process.env.WHATSAPP_SANDBOX_TO ?? "";
  const WHATSAPP_OUT_OF_WINDOW_TEMPLATE =
    process.env.WHATSAPP_OUT_OF_WINDOW_TEMPLATE ?? "hello_world";
  const WHATSAPP_DEDUP_WINDOW_SECONDS = toNumber(
    process.env.WHATSAPP_DEDUP_WINDOW_SECONDS,
    86400
  );
  const META_APP_SECRET = process.env.META_APP_SECRET ?? "";
  const META_INSTAGRAM_APP_SECRET = process.env.META_INSTAGRAM_APP_SECRET ?? "";
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
  const WHATSAPP_AI_ENABLED = (process.env.WHATSAPP_AI_ENABLED ?? "false") === "true";
  const WHATSAPP_AI_MODEL = process.env.WHATSAPP_AI_MODEL ?? "gpt-4.1-mini";
  const WHATSAPP_AI_MAX_OUTPUT_TOKENS = toNumber(
    process.env.WHATSAPP_AI_MAX_OUTPUT_TOKENS,
    200
  );
  const WHATSAPP_AI_TEMPERATURE = Number(
    process.env.WHATSAPP_AI_TEMPERATURE ?? "0.4"
  );
  const WHATSAPP_AI_SYSTEM_PROMPT = process.env.WHATSAPP_AI_SYSTEM_PROMPT ?? "";
  const WHATSAPP_AI_TIMEOUT_MS = toNumber(process.env.WHATSAPP_AI_TIMEOUT_MS, 8000);
  const AI_ASSISTANT_ENABLED = (process.env.AI_ASSISTANT_ENABLED ?? "false") === "true";
  const FLOW_INTENT_CLASSIFIER_ENABLED =
    (process.env.FLOW_INTENT_CLASSIFIER_ENABLED ?? "false") === "true";
  const FOLLOWUP_ENABLED = (process.env.FOLLOWUP_ENABLED ?? "false") === "true";
  const FOLLOWUP_DRY_RUN = (process.env.FOLLOWUP_DRY_RUN ?? "true") !== "false";
  const FOLLOWUP_DEFAULT_DELAY_MINUTES = toNumber(
    process.env.FOLLOWUP_DEFAULT_DELAY_MINUTES,
    30
  );
  const FOLLOWUP_MAX_PER_CONVERSATION = toNumber(
    process.env.FOLLOWUP_MAX_PER_CONVERSATION,
    1
  );
  const FOLLOWUP_MIN_INTERVAL_MINUTES = toNumber(
    process.env.FOLLOWUP_MIN_INTERVAL_MINUTES,
    60
  );
  const DISABLE_DEBUG_COMMANDS =
    (process.env.DISABLE_DEBUG_COMMANDS ?? "true") === "true";
  const OUTBOUND_TEMPLATE_FALLBACK =
    (process.env.OUTBOUND_TEMPLATE_FALLBACK ?? "false") === "true";
  const OUTBOUND_TEMPLATE_DEFAULT_NAME =
    process.env.OUTBOUND_TEMPLATE_DEFAULT_NAME ?? "hello_world";
  const OUTBOUND_TEMPLATE_DEFAULT_LANG =
    process.env.OUTBOUND_TEMPLATE_DEFAULT_LANG ?? "pt_BR";
  const OUTBOUND_TEMPLATE_FALLBACK_NAME =
    process.env.OUTBOUND_TEMPLATE_FALLBACK_NAME ?? "";
  const OUTBOUND_TEMPLATE_FALLBACK_LANG =
    process.env.OUTBOUND_TEMPLATE_FALLBACK_LANG ?? "";
  const OUTBOUND_TEXT_ENABLED =
    (process.env.OUTBOUND_TEXT_ENABLED ?? "true") === "true";
  const HANDOFF_ENABLED = (process.env.HANDOFF_ENABLED ?? "false") === "true";
  const HANDOFF_ATTENDANT_WAID = normalizeWaId(
    process.env.HANDOFF_ATTENDANT_WAID ?? ""
  );
  const HANDOFF_TEMPLATE_NAME =
    process.env.HANDOFF_TEMPLATE_NAME ||
    process.env.HANDOFF_NOTIFY_TEMPLATE_NAME ||
    OUTBOUND_TEMPLATE_FALLBACK_NAME ||
    "hello_world";
  const HANDOFF_TEMPLATE_LANG =
    process.env.HANDOFF_TEMPLATE_LANG ||
    process.env.HANDOFF_NOTIFY_TEMPLATE_LANG ||
    OUTBOUND_TEMPLATE_FALLBACK_LANG ||
    "en_US";
  const HANDOFF_NOTIFY_FALLBACK_TO_TEMPLATE =
    (process.env.HANDOFF_NOTIFY_FALLBACK_TO_TEMPLATE ?? "true") === "true";
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";
  const APP_AUTH_SECRET = process.env.APP_AUTH_SECRET ?? "";
  if (process.env.NODE_ENV === "production" && !APP_AUTH_SECRET.trim()) {
    throw new Error("APP_AUTH_SECRET is required in production");
  }
  const ALLOW_ADMIN_DEBUG_IN_PROD =
    (process.env.ALLOW_ADMIN_DEBUG_IN_PROD ?? "false") === "true";
  const CONV_STATE_DUAL_WRITE =
    (process.env.CONV_STATE_DUAL_WRITE ?? "false") === "true";
  const CONV_STATE_SHADOW_COMPARE =
    (process.env.CONV_STATE_SHADOW_COMPARE ?? "false") === "true";
  const CONV_STATE_DB_WRITE_STRICT =
    (process.env.CONV_STATE_DB_WRITE_STRICT ?? "false") === "true";
  const CONV_STATE_JSON_WRITE_ENABLED =
    (process.env.CONV_STATE_JSON_WRITE_ENABLED ?? "true") !== "false";
  const CONV_STATE_READ_SOURCE_SET = Boolean(
    process.env.CONV_STATE_READ_SOURCE?.trim()
  );
  const CONV_STATE_READ_SOURCE = toConversationReadSource(
    process.env.CONV_STATE_READ_SOURCE
  );
  const MULTICHANNEL_SHADOW_WRITE =
    (process.env.MULTICHANNEL_SHADOW_WRITE ?? "false") === "true";
  const MULTICHANNEL_SHADOW_STRICT =
    (process.env.MULTICHANNEL_SHADOW_STRICT ?? "false") === "true";
  const MULTICHANNEL_DUAL_READ =
    (process.env.MULTICHANNEL_DUAL_READ ?? "false") === "true";
  const CHANNEL_ACCOUNTS_RUNTIME_SHADOW =
    (process.env.CHANNEL_ACCOUNTS_RUNTIME_SHADOW ?? "false") === "true";
  const CHANNEL_ACCOUNTS_DB_FIRST_MESSENGER =
    (process.env.CHANNEL_ACCOUNTS_DB_FIRST_MESSENGER ?? "false") === "true";
  const WEB_PUSH_VAPID_PUBLIC_KEY = process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "";
  const WEB_PUSH_VAPID_PRIVATE_KEY = process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? "";
  const WEB_PUSH_SUBJECT = process.env.WEB_PUSH_SUBJECT ?? "mailto:suporte@re7online.com";
  const PASSWORD_RESET_BASE_URL = process.env.PASSWORD_RESET_BASE_URL ?? "";
  const SMTP_HOST = process.env.SMTP_HOST ?? "";
  const SMTP_PORT = toNumber(process.env.SMTP_PORT, 587);
  const SMTP_USER = process.env.SMTP_USER ?? "";
  const SMTP_PASS = process.env.SMTP_PASS ?? "";
  const SMTP_FROM = process.env.SMTP_FROM ?? "";
  const STORAGE_MODE_SET = Boolean(process.env.STORAGE_MODE?.trim());
  const STORAGE_MODE = toStorageMode(process.env.STORAGE_MODE);
  const CLIENT_KEY = process.env.CLIENT_KEY ?? "";
  let OUTBOUND_TEMPLATE_INTENT_MAP: Record<string, { name: string; language?: string }> = {};
  const mapRaw = process.env.OUTBOUND_TEMPLATE_INTENT_MAP_JSON;
  if (mapRaw) {
    try {
      OUTBOUND_TEMPLATE_INTENT_MAP = JSON.parse(mapRaw) as Record<
        string,
        { name: string; language?: string }
      >;
    } catch {
      OUTBOUND_TEMPLATE_INTENT_MAP = {};
    }
  }
  const CLIENT_ID = process.env.CLIENT_ID ?? "default";
  let OUTBOUND_TEMPLATES_BY_CLIENT: Record<
    string,
    Record<string, { name: string; language?: string }>
  > = {};
  const templatesByClientRaw = process.env.OUTBOUND_TEMPLATES_BY_CLIENT_JSON;
  if (templatesByClientRaw) {
    try {
      OUTBOUND_TEMPLATES_BY_CLIENT = JSON.parse(templatesByClientRaw) as Record<
        string,
        Record<string, { name: string; language?: string }>
      >;
    } catch {
      OUTBOUND_TEMPLATES_BY_CLIENT = {};
      console.warn("[env] invalid OUTBOUND_TEMPLATES_BY_CLIENT_JSON, using {}");
    }
  }

  const verifyTokenPresent = WHATSAPP_VERIFY_TOKEN.length > 0;
  const accessTokenPresent = WHATSAPP_ACCESS_TOKEN.length > 0;
  const phoneNumberIdPresent = WHATSAPP_PHONE_NUMBER_ID.length > 0;

  return {
    PORT: toNumber(process.env.PORT, 3001),
    ENV: process.env.ENV ?? "dev",
    WHATSAPP_VERIFY_TOKEN,
    WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_API_VERSION,
    WHATSAPP_ALLOWLIST,
    WHATSAPP_ADMIN_ALLOWLIST,
    WHATSAPP_ECHO_ENABLED,
    WHATSAPP_DEFAULT_REPLY,
    WHATSAPP_SANDBOX,
    WHATSAPP_SANDBOX_TO,
    WHATSAPP_OUT_OF_WINDOW_TEMPLATE,
    WHATSAPP_DEDUP_WINDOW_SECONDS,
    META_APP_SECRET,
    META_INSTAGRAM_APP_SECRET,
    OPENAI_API_KEY,
    WHATSAPP_AI_ENABLED,
    WHATSAPP_AI_MODEL,
    WHATSAPP_AI_MAX_OUTPUT_TOKENS,
    WHATSAPP_AI_TEMPERATURE,
    WHATSAPP_AI_SYSTEM_PROMPT,
    WHATSAPP_AI_TIMEOUT_MS,
    AI_ASSISTANT_ENABLED,
    FLOW_INTENT_CLASSIFIER_ENABLED,
    FOLLOWUP_ENABLED,
    FOLLOWUP_DRY_RUN,
    FOLLOWUP_DEFAULT_DELAY_MINUTES,
    FOLLOWUP_MAX_PER_CONVERSATION,
    FOLLOWUP_MIN_INTERVAL_MINUTES,
    DISABLE_DEBUG_COMMANDS,
    OUTBOUND_TEMPLATE_FALLBACK,
    OUTBOUND_TEMPLATE_DEFAULT_NAME,
    OUTBOUND_TEMPLATE_DEFAULT_LANG,
    OUTBOUND_TEMPLATE_FALLBACK_NAME,
    OUTBOUND_TEMPLATE_FALLBACK_LANG,
    OUTBOUND_TEMPLATE_INTENT_MAP,
    OUTBOUND_TEXT_ENABLED,
    HANDOFF_ENABLED,
    HANDOFF_ATTENDANT_WAID,
    HANDOFF_TEMPLATE_NAME,
    HANDOFF_TEMPLATE_LANG,
    HANDOFF_NOTIFY_FALLBACK_TO_TEMPLATE,
    ADMIN_TOKEN,
    APP_AUTH_SECRET,
    ALLOW_ADMIN_DEBUG_IN_PROD,
    CONV_STATE_DUAL_WRITE,
    CONV_STATE_SHADOW_COMPARE,
    CONV_STATE_DB_WRITE_STRICT,
    CONV_STATE_JSON_WRITE_ENABLED,
    CONV_STATE_READ_SOURCE,
    CONV_STATE_READ_SOURCE_SET,
    MULTICHANNEL_SHADOW_WRITE,
    MULTICHANNEL_SHADOW_STRICT,
    MULTICHANNEL_DUAL_READ,
    CHANNEL_ACCOUNTS_RUNTIME_SHADOW,
    CHANNEL_ACCOUNTS_DB_FIRST_MESSENGER,
    WEB_PUSH_VAPID_PUBLIC_KEY,
    WEB_PUSH_VAPID_PRIVATE_KEY,
    WEB_PUSH_SUBJECT,
    PASSWORD_RESET_BASE_URL,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
    STORAGE_MODE,
    STORAGE_MODE_SET,
    CLIENT_KEY,
    CLIENT_ID,
    OUTBOUND_TEMPLATES_BY_CLIENT,
    verifyTokenPresent,
    accessTokenPresent,
    phoneNumberIdPresent,
    outboundEnabled: accessTokenPresent && phoneNumberIdPresent,
  };
}

export const env = getEnv();
