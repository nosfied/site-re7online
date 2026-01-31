export type Env = {
  PORT: number;
  ENV: string;
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_ACCESS_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_API_VERSION: string;
  WHATSAPP_ALLOWLIST: string[];
  WHATSAPP_ECHO_ENABLED: boolean;
  WHATSAPP_DEFAULT_REPLY: string;
  WHATSAPP_SANDBOX: boolean;
  WHATSAPP_DEDUP_WINDOW_SECONDS: number;
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
  const WHATSAPP_ECHO_ENABLED = (process.env.WHATSAPP_ECHO_ENABLED ?? "false") === "true";
  const WHATSAPP_DEFAULT_REPLY =
    process.env.WHATSAPP_DEFAULT_REPLY ??
    "Olá! Em breve nosso atendimento estará disponível por aqui.";
  const WHATSAPP_SANDBOX = (process.env.WHATSAPP_SANDBOX ?? "false") === "true";
  const WHATSAPP_DEDUP_WINDOW_SECONDS = toNumber(
    process.env.WHATSAPP_DEDUP_WINDOW_SECONDS,
    86400
  );

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
    WHATSAPP_ECHO_ENABLED,
    WHATSAPP_DEFAULT_REPLY,
    WHATSAPP_SANDBOX,
    WHATSAPP_DEDUP_WINDOW_SECONDS,
    verifyTokenPresent,
    accessTokenPresent,
    phoneNumberIdPresent,
    outboundEnabled: accessTokenPresent && phoneNumberIdPresent,
  };
}

export const env = getEnv();
