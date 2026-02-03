import crypto from "node:crypto";

export function verifySignature(
  rawBody: Buffer,
  header: string | undefined,
  appSecret: string
) {
  if (!appSecret) {
    return { ok: true, skipped: true as const };
  }
  if (!header || !header.startsWith("sha256=")) {
    return { ok: false, reason: "missing_header" as const };
  }
  const expected = header.slice("sha256=".length);
  const actual = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(actual, "hex");
  if (expectedBuf.length !== actualBuf.length) {
    return { ok: false, reason: "length_mismatch" as const };
  }
  const match = crypto.timingSafeEqual(expectedBuf, actualBuf);
  return match ? { ok: true } : { ok: false, reason: "mismatch" as const };
}
