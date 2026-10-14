import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { buildCrmWhatsappIdentityCandidates } from "../crm/crmWhatsappIdentity.js";
import { normalizeWaIdDigits } from "../utils/waid.js";
import { encryptEpochSeed, newSeedMetadata, readEpochSeed, seedWriteEpoch, type SeedReadContext } from "./campaignSeedEpoch.js";

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
  const epoch = seedWriteEpoch();
  const metadata = epoch ? newSeedMetadata(params.clientId, epoch) : null;
  const recipientsCiphertext = metadata ? encryptEpochSeed(recipients, metadata, "recipientsCiphertext") : encryptSeedJson(recipients);
  const componentsCiphertext =
    Object.keys(componentsByWaId).length > 0 ? (metadata ? encryptEpochSeed(componentsByWaId, metadata, "componentsByWaIdCiphertext") : encryptSeedJson(componentsByWaId)) : null;
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
    encryptionKeyRef: metadata ? "CAMPAIGN_SEED_SECRET:" + metadata.epoch : CAMPAIGN_SEED_SECRET_REF,
    ...(metadata ? { seedEncryption: metadata } : {}),
  };
}

export function readPrivateCampaignSeedFields(payload: unknown, context?: SeedReadContext): {
  recipients: string[];
  componentsByWaId?: Record<string, CampaignTemplateComponents>;
} {
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const strict = Boolean(seedWriteEpoch()) || Boolean(record.seedEncryption) ||
    [record.recipientsCiphertext, record.componentsByWaIdCiphertext].some(v => typeof v === "string" && v.startsWith("v2:"));
  if (strict) {
    if ((record.recipients !== undefined && parseStringArray(record.recipients).length > 0) || record.componentsByWaId !== undefined) {
      throw new Error("campaign_seed_plaintext_fallback_denied");
    }
    const decoded = readEpochSeed(record, "recipientsCiphertext", context);
    if (!Array.isArray(decoded) || !decoded.every(v => typeof v === "string")) throw new Error("campaign_seed_recipients_invalid");
    const recipients = parseStringArray(decoded);
    const components = record.componentsByWaIdCiphertext === undefined ? undefined : readEpochSeed(record, "componentsByWaIdCiphertext", context);
    if (components !== undefined && (!components || typeof components !== "object" || Array.isArray(components))) {
      throw new Error("campaign_seed_components_invalid");
    }
    return { recipients, componentsByWaId: components as Record<string, CampaignTemplateComponents> | undefined };
  }
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

function getSeedRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function buildSeedIdentityCandidateSet(values: string[]) {
  return new Set(
    values.flatMap((value) => {
      const raw = String(value ?? "").trim();
      const digits = normalizeWaIdDigits(raw);
      return [raw, digits, ...buildCrmWhatsappIdentityCandidates([raw, digits])]
        .map((candidate) => String(candidate ?? "").trim())
        .filter(Boolean);
    })
  );
}

export function removeCampaignSeedSubjectReferences(params: {
  clientId: string;
  payload: unknown;
  identityCandidates: string[];
  leadIds?: string[];
}): {
  changed: boolean;
  payload: Prisma.InputJsonValue;
  removedRecipients: number;
  removedRecipientRefs: number;
  removedComponents: number;
  removedLeadIds: number;
} {
  const record = getSeedRecord(params.payload);
  const privateSeed = readPrivateCampaignSeedFields(record, { clientId: params.clientId });
  const identityCandidates = buildSeedIdentityCandidateSet(params.identityCandidates);
  const leadIdsToRemove = new Set(params.leadIds?.map((value) => String(value ?? "").trim()).filter(Boolean) ?? []);
  const shouldRemoveRecipient = (recipient: string) => {
    const candidates = buildSeedIdentityCandidateSet([recipient]);
    return Array.from(candidates).some((candidate) => identityCandidates.has(candidate));
  };

  const recipients = privateSeed.recipients.filter((recipient) => !shouldRemoveRecipient(recipient));
  const removedRecipients = privateSeed.recipients.length - recipients.length;
  const sourceComponents = privateSeed.componentsByWaId ?? {};
  const componentsByWaId: Record<string, CampaignTemplateComponents> = {};
  let removedComponents = 0;
  for (const [waId, components] of Object.entries(sourceComponents)) {
    if (shouldRemoveRecipient(waId)) {
      removedComponents += 1;
      continue;
    }
    componentsByWaId[waId] = components;
  }

  const currentLeadIds = Array.isArray(record.leadIds)
    ? record.leadIds.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];
  const leadIds = currentLeadIds.filter((leadId) => !leadIdsToRemove.has(leadId));
  const removedLeadIds = currentLeadIds.length - leadIds.length;
  const rebuiltPrivateFields =
    removedRecipients > 0 || removedComponents > 0
      ? buildPrivateCampaignSeedFields({
          clientId: params.clientId,
          waIds: recipients,
          componentsByWaId: Object.keys(componentsByWaId).length > 0 ? componentsByWaId : undefined,
        })
      : {};
  const removedRecipientRefs =
    Array.isArray(record.recipientRefs) && "recipientRefs" in rebuiltPrivateFields
      ? record.recipientRefs.length - ((rebuiltPrivateFields.recipientRefs as unknown[])?.length ?? 0)
      : removedRecipients;
  const nextPayload = {
    ...record,
    ...rebuiltPrivateFields,
    ...(currentLeadIds.length > 0 || removedLeadIds > 0 ? { leadIds } : {}),
  };
  return {
    changed: removedRecipients > 0 || removedComponents > 0 || removedLeadIds > 0,
    payload: nextPayload as Prisma.InputJsonValue,
    removedRecipients,
    removedRecipientRefs,
    removedComponents,
    removedLeadIds,
  };
}
