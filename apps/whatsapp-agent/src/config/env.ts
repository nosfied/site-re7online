export type Env = {
  PORT: number;
  ENV: string;
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_ACCESS_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_API_VERSION: string;
  WHATSAPP_ALLOWLIST: string[];
  verifyTokenPresent: boolean;
  accessTokenPresent: boolean;
  phoneNumberIdPresent: boolean;
  outboundEnabled: boolean;
};

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
    .filter(Boolean);

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
    verifyTokenPresent,
    accessTokenPresent,
    phoneNumberIdPresent,
    outboundEnabled: accessTokenPresent && phoneNumberIdPresent,
  };
}

export const env = getEnv();
