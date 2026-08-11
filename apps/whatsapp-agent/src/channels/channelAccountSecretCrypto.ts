import crypto from "node:crypto";

export const CHANNEL_ACCOUNT_SECRET_KEY_REF = "CHANNEL_ACCOUNT_SECRET_KEY";
const SECRET_PREFIX = "v1:";

export function hashChannelAccountSecret(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function getChannelAccountSecretKey(secret = process.env.CHANNEL_ACCOUNT_SECRET_KEY ?? "") {
  const normalized = secret.trim();
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized, "utf8").digest();
}

export function encryptChannelAccountSecret(value: string, secret?: string) {
  const key = getChannelAccountSecretKey(secret);
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SECRET_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptChannelAccountSecret(ciphertext: string | null | undefined, secret?: string) {
  const raw = ciphertext?.trim();
  const key = getChannelAccountSecretKey(secret);
  if (!raw || !raw.startsWith(SECRET_PREFIX) || !key) return null;
  const parts = raw.slice(SECRET_PREFIX.length).split(":");
  if (parts.length !== 3) return null;
  try {
    const [ivRaw, tagRaw, encryptedRaw] = parts;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64")),
      decipher.final(),
    ]).toString("utf8").trim() || null;
  } catch {
    return null;
  }
}
