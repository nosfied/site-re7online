import crypto from "node:crypto";

export function validateMetaSignature(
  rawBody: Buffer,
  header: string | undefined,
  appSecret: string
) {
  if (!header) {
    return { ok: false, reason: "missing_header" as const };
  }
  if (!header.startsWith("sha256=")) {
    return { ok: false, reason: "invalid_format" as const };
  }
  const expected = header.slice("sha256=".length);
  if (!/^[a-fA-F0-9]+$/.test(expected)) {
    return { ok: false, reason: "invalid_format" as const };
  }
  const actual = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(actual, "hex");
  if (expectedBuf.length !== actualBuf.length) {
    return { ok: false, reason: "invalid_signature" as const };
  }
  const match = crypto.timingSafeEqual(expectedBuf, actualBuf);
  return match ? { ok: true } : { ok: false, reason: "invalid_signature" as const };
}
