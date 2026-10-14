import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type SeedReadContext = { clientId: string };
type Metadata = { version: 2; clientId: string; seedId: string; epoch: string };
type Field = "recipientsCiphertext" | "componentsByWaIdCiphertext";
const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
function requireThat(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new Error(reason);
}
export function seedWriteEpoch() {
  const epoch = process.env.CAMPAIGN_SEED_WRITE_EPOCH?.trim();
  if (!epoch) return null;
  requireThat(/^[a-zA-Z0-9_-]{1,64}$/.test(epoch), "campaign_seed_epoch_invalid");
  requireThat((process.env.CAMPAIGN_SEED_SECRET?.trim().length ?? 0) >= 32, "campaign_seed_dedicated_key_missing");
  const dedicated = process.env.CAMPAIGN_SEED_SECRET!.trim();
  requireThat(![process.env.CAMPAIGN_SEED_HISTORICAL_SECRET, process.env.CHANNEL_ACCOUNT_SECRET_KEY,
    process.env.APP_AUTH_SECRET].some(v => v?.trim() && v.trim() === dedicated), "campaign_seed_dedicated_key_reused");
  return epoch;
}
function key(secret: string | undefined) {
  requireThat(secret && secret.trim().length >= 32, "campaign_seed_epoch_key_missing");
  return crypto.createHash("sha256").update(secret.trim()).digest();
}
function aad(m: Metadata, field: Field) {
  return Buffer.from(JSON.stringify([m.version, m.epoch, m.clientId, m.seedId, field]));
}
export function newSeedMetadata(clientId: string, epoch: string): Metadata {
  requireThat(clientId, "campaign_seed_context_missing");
  return { version: 2, clientId, seedId: crypto.randomUUID(), epoch };
}
export function encryptEpochSeed(value: unknown, m: Metadata, field: Field) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(process.env.CAMPAIGN_SEED_SECRET), iv);
  c.setAAD(aad(m, field));
  const bytes = Buffer.concat([c.update(JSON.stringify(value)), c.final()]);
  return "v2:" + [iv, c.getAuthTag(), bytes].map(b => b.toString("base64")).join(":");
}
function decrypt(raw: string, secret: string | undefined, authenticated?: Buffer) {
  const parts = raw.slice(3).split(":");
  requireThat(parts.length === 3, "campaign_seed_cipher_structure");
  const [iv, tag, bytes] = parts.map(p => {
    const b = Buffer.from(p, "base64");
    requireThat(b.toString("base64") === p, "campaign_seed_cipher_encoding");
    return b;
  });
  requireThat(iv.length === 12 && tag.length === 16 && bytes.length > 0, "campaign_seed_cipher_structure");
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", key(secret), iv);
    if (authenticated) d.setAAD(authenticated);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(bytes), d.final()]).toString("utf8")) as unknown;
  } catch { throw new Error("campaign_seed_cipher_authentication_denied"); }
}
function historicalPolicy() {
  const file = process.env.CAMPAIGN_SEED_HISTORICAL_POLICY_FILE;
  const expected = process.env.CAMPAIGN_SEED_HISTORICAL_POLICY_SHA256;
  requireThat(file && path.isAbsolute(file) && expected, "campaign_seed_historical_policy_missing");
  for (let p = file; ; p = path.dirname(p)) {
    requireThat(!fs.lstatSync(p).isSymbolicLink(), "campaign_seed_policy_symlink_denied");
    if (path.dirname(p) === p) break;
  }
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let bytes: Buffer;
  try {
    const st = fs.fstatSync(fd);
    requireThat(st.isFile() && st.uid === process.getuid?.() && (st.mode & 0o777) === 0o600, "campaign_seed_policy_permissions_denied");
    bytes = fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
  requireThat(hash(bytes.toString("utf8")) === expected, "campaign_seed_policy_integrity_denied");
  let policy;
  try { policy = JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error("campaign_seed_historical_policy_format_denied"); }
  requireThat(policy && policy.version === 1 && Number.isFinite(policy.expiresAt) && Date.now() < policy.expiresAt &&
    Array.isArray(policy.entries), "campaign_seed_historical_policy_expired_or_invalid");
  requireThat(policy.entries.every((e: Record<string, unknown>) => e && typeof e === "object" &&
    typeof e.clientId === "string" && e.clientId && typeof e.eventId === "string" && e.eventId &&
    (e.field === "recipientsCiphertext" || e.field === "componentsByWaIdCiphertext") &&
    typeof e.payloadSha256 === "string" && /^[a-f0-9]{64}$/.test(e.payloadSha256) &&
    typeof e.ciphertextSha256 === "string" && /^[a-f0-9]{64}$/.test(e.ciphertextSha256)), "campaign_seed_historical_entry_invalid");
  const secret = process.env.CAMPAIGN_SEED_HISTORICAL_SECRET;
  requireThat(secret && policy.keySha256 === hash(secret.trim()), "campaign_seed_historical_key_drift");
  return { policy, secret };
}
export function assertSeedEpochWriteAuthorized() {
  // The legacy population remains present. Deny new writes when its sealed
  // authorization expires; v2 reads do not depend on this authorization.
  historicalPolicy();
}
export function readEpochSeed(record: Record<string, unknown>, field: Field, context?: SeedReadContext) {
  const raw = record[field];
  requireThat(context?.clientId, "campaign_seed_context_missing");
  requireThat(typeof raw === "string", "campaign_seed_cipher_missing");
  if (raw.startsWith("v2:")) {
    const m = record.seedEncryption as Metadata | undefined;
    requireThat(m?.version === 2 && m.clientId === context.clientId &&
      typeof m.seedId === "string" && /^[a-f0-9-]{36}$/.test(m.seedId) && m.epoch === seedWriteEpoch(), "campaign_seed_epoch_binding_denied");
    return decrypt(raw, process.env.CAMPAIGN_SEED_SECRET, aad(m, field));
  }
  requireThat(raw.startsWith("v1:"), "campaign_seed_cipher_version_denied");
  const { policy, secret } = historicalPolicy();
  const matches = policy.entries.filter((e: Record<string, unknown>) => e.clientId === context.clientId &&
    e.field === field && e.payloadSha256 === hash(JSON.stringify(record)) && e.ciphertextSha256 === hash(raw));
  requireThat(matches.length === 1 && typeof matches[0].eventId === "string" && matches[0].eventId,
    "campaign_seed_historical_ciphertext_not_authorized");
  return decrypt(raw, secret);
}
