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
  OPENAI_API_KEY: string;
  WHATSAPP_AI_ENABLED: boolean;
  WHATSAPP_AI_MODEL: string;
  WHATSAPP_AI_MAX_OUTPUT_TOKENS: number;
  WHATSAPP_AI_TEMPERATURE: number;
  WHATSAPP_AI_SYSTEM_PROMPT: string;
  WHATSAPP_AI_TIMEOUT_MS: number;
  DISABLE_DEBUG_COMMANDS: boolean;
  OUTBOUND_TEMPLATE_FALLBACK: boolean;
  OUTBOUND_TEMPLATE_DEFAULT_NAME: string;
  OUTBOUND_TEMPLATE_DEFAULT_LANG: string;
  OUTBOUND_TEMPLATE_FALLBACK_NAME: string;
  OUTBOUND_TEMPLATE_FALLBACK_LANG: string;
  OUTBOUND_TEMPLATE_INTENT_MAP: Record<string, { name: string; language?: string }>;
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
  return input.replace(/\D/g, "");
}

function toNumber(value: string | undefined, fallback: number) {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
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
    OPENAI_API_KEY,
    WHATSAPP_AI_ENABLED,
    WHATSAPP_AI_MODEL,
    WHATSAPP_AI_MAX_OUTPUT_TOKENS,
    WHATSAPP_AI_TEMPERATURE,
    WHATSAPP_AI_SYSTEM_PROMPT,
    WHATSAPP_AI_TIMEOUT_MS,
    DISABLE_DEBUG_COMMANDS,
    OUTBOUND_TEMPLATE_FALLBACK,
    OUTBOUND_TEMPLATE_DEFAULT_NAME,
    OUTBOUND_TEMPLATE_DEFAULT_LANG,
    OUTBOUND_TEMPLATE_FALLBACK_NAME,
    OUTBOUND_TEMPLATE_FALLBACK_LANG,
    OUTBOUND_TEMPLATE_INTENT_MAP,
    CLIENT_ID,
    OUTBOUND_TEMPLATES_BY_CLIENT,
    verifyTokenPresent,
    accessTokenPresent,
    phoneNumberIdPresent,
    outboundEnabled: accessTokenPresent && phoneNumberIdPresent,
  };
}

export const env = getEnv();
