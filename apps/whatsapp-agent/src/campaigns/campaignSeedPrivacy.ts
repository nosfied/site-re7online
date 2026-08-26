import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { normalizeWaIdDigits } from "../utils/waid.js";

const CIPHER_PREFIX = "v1:";
const CAMPAIGN_SEED_SECRET_REF = "CAMPAIGN_SEED_SECRET|CHANNEL_ACCOUNT_SECRET_KEY|APP_AUTH_SECRET";

type CampaignTemplateComponents = Array<{
  type: "body";
  parameters: Array<{ type: "text"; text: string }>;
}>;

function getSeedSecret() {
  return (
    process.env.CAMPAIGN_SEED_SECRET?.trim() ||
    process.env.CHANNEL_ACCOUNT_SECRET_KEY?.trim() ||
    process.env.APP_AUTH_SECRET?.trim() ||
    ""
  );
}

function getSeedKey(secret = getSeedSecret()) {
  const normalized = secret.trim();
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized, "utf8").digest();
}

function encryptSeedJson(value: unknown) {
  const key = getSeedKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${CIPHER_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

function decryptSeedJson(ciphertext: unknown) {
  const raw = typeof ciphertext === "string" ? ciphertext.trim() : "";
  const key = getSeedKey();
  if (!raw || !raw.startsWith(CIPHER_PREFIX) || !key) return null;
  const parts = raw.slice(CIPHER_PREFIX.length).split(":");
  if (parts.length !== 3) return null;
  try {
    const [ivRaw, tagRaw, encryptedRaw] = parts;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(decrypted) as unknown;
  } catch {
    return null;
  }
}

export function hashCampaignSeedRecipient(params: { clientId: string; waId: string }) {
  const normalized = normalizeWaIdDigits(params.waId);
  return crypto
    .createHash("sha256")
    .update(`${params.clientId}:${normalized}`, "utf8")
    .digest("hex");
}

function buildRecipientRefs(clientId: string, waIds: string[]) {
  return waIds.map((waId) => {
    const normalized = String(waId ?? "").trim();
    return {
      hash: hashCampaignSeedRecipient({ clientId, waId: normalized }),
      waIdLast4: normalized.slice(-4),
      waIdLength: normalized.length,
    };
  });
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function buildPrivateCampaignSeedFields(params: {
  clientId: string;
  waIds: string[];
  componentsByWaId?: Record<string, CampaignTemplateComponents>;
}): Prisma.JsonObject {
  const recipients = params.waIds.map((waId) => String(waId ?? "").trim()).filter(Boolean);
  const componentsByWaId = params.componentsByWaId ?? {};
  const recipientsCiphertext = encryptSeedJson(recipients);
  const componentsCiphertext =
    Object.keys(componentsByWaId).length > 0 ? encryptSeedJson(componentsByWaId) : null;
  if (!recipientsCiphertext || (Object.keys(componentsByWaId).length > 0 && !componentsCiphertext)) {
    throw new Error("campaign_seed_encryption_key_missing");
  }
  return {
    recipients: [],
    recipientCount: recipients.length,
    recipientRefs: buildRecipientRefs(params.clientId, recipients),
    recipientsCiphertext,
    componentsByWaId: undefined,
    componentsByWaIdCiphertext: componentsCiphertext ?? undefined,
    encryptionKeyRef: CAMPAIGN_SEED_SECRET_REF,
  };
}

export function readPrivateCampaignSeedFields(payload: unknown): {
  recipients: string[];
  componentsByWaId?: Record<string, CampaignTemplateComponents>;
} {
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const decryptedRecipients = parseStringArray(decryptSeedJson(record.recipientsCiphertext));
  const legacyRecipients = parseStringArray(record.recipients);
  const componentsRaw = decryptSeedJson(record.componentsByWaIdCiphertext) ?? record.componentsByWaId;
  const componentsByWaId =
    componentsRaw && typeof componentsRaw === "object" && !Array.isArray(componentsRaw)
      ? (componentsRaw as Record<string, CampaignTemplateComponents>)
      : undefined;
  return {
    recipients: decryptedRecipients.length > 0 ? decryptedRecipients : legacyRecipients,
    componentsByWaId,
  };
}
