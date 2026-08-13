import crypto from "node:crypto";
import { env } from "../config/env.js";
import { APP_AUTH_SESSION_TTL_SECONDS, buildAppAuthSessionExpiresAt } from "./sessionPolicy.js";

const TOKEN_VERSION = 1;
export { APP_AUTH_SESSION_TTL_SECONDS };

type ClientAuthTokenPayload = {
  sub: string;
  clientId: string;
  email: string;
  name: string;
  role: string;
  sid: string;
  iat: number;
  exp: number;
  typ: "client-auth";
  ver: number;
  supportAccess?: ClientAuthSupportAccess;
};

export type ClientAuthUser = {
  id: string;
  clientId: string;
  name: string;
  email: string;
  role: string;
  supportAccess?: ClientAuthSupportAccess;
};

export type ClientAuthSupportAccess = {
  accessType: "platform_support";
  grantId: string;
  supportClientId: string;
  supportUserId: string;
  sourceAppSessionId?: string | null;
};

function getClientAuthSecret() {
  return process.env.APP_AUTH_SECRET || process.env.ADMIN_TOKEN || env.APP_AUTH_SECRET || env.ADMIN_TOKEN;
}

function toBase64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4 || 4)) % 4;
  return Buffer.from(`${normalized}${"=".repeat(padding)}`, "base64");
}

function signTokenPart(unsignedToken: string) {
  const secret = getClientAuthSecret();
  if (!secret) {
    throw new Error("client_auth_secret_missing");
  }
  return toBase64Url(crypto.createHmac("sha256", secret).update(unsignedToken).digest());
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password: string, passwordHash: string | null | undefined) {
  if (!passwordHash) return false;
  const [algorithm, saltHex, hashHex] = passwordHash.split("$");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) return false;
  try {
    const actual = Buffer.from(hashHex, "hex");
    const expected = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), actual.length);
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function issueClientAuthToken(user: ClientAuthUser, sessionId: string, expiresAt?: Date) {
  const now = Math.floor(Date.now() / 1000);
  const tokenExpiresAt = expiresAt ?? buildAppAuthSessionExpiresAt(new Date(now * 1000));
  const payload: ClientAuthTokenPayload = {
    sub: user.id,
    clientId: user.clientId,
    email: user.email,
    name: user.name,
    role: user.role,
    sid: sessionId,
    iat: now,
    exp: Math.floor(tokenExpiresAt.getTime() / 1000),
    typ: "client-auth",
    ver: TOKEN_VERSION,
    ...(user.supportAccess ? { supportAccess: user.supportAccess } : {}),
  };
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  return `${unsignedToken}.${signTokenPart(unsignedToken)}`;
}

export type ClientAuthTokenVerification =
  | { ok: true; payload: ClientAuthTokenPayload }
  | {
      ok: false;
      reason:
        | "malformed"
        | "invalid_signature"
        | "invalid_payload"
        | "token_expired";
    };

export function verifyClientAuthTokenDetailed(token: string, now = new Date()): ClientAuthTokenVerification {
  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) return { ok: false, reason: "malformed" };
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = signTokenPart(unsignedToken);
  const actualSignature = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);
  if (actualSignature.length !== expectedSignatureBuffer.length) {
    return { ok: false, reason: "invalid_signature" };
  }
  if (!crypto.timingSafeEqual(actualSignature, expectedSignatureBuffer)) {
    return { ok: false, reason: "invalid_signature" };
  }
  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8")) as ClientAuthTokenPayload;
    if (
      payload.typ !== "client-auth" ||
      payload.ver !== TOKEN_VERSION ||
      !payload.sub ||
      !payload.clientId ||
      !payload.email ||
      !payload.name ||
      !payload.role ||
      !payload.sid ||
      (payload.supportAccess !== undefined &&
        (!payload.supportAccess ||
          payload.supportAccess.accessType !== "platform_support" ||
          !payload.supportAccess.grantId ||
          !payload.supportAccess.supportClientId ||
          !payload.supportAccess.supportUserId))
    ) {
      return { ok: false, reason: "invalid_payload" };
    }
    if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(now.getTime() / 1000)) {
      return { ok: false, reason: "token_expired" };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "invalid_payload" };
  }
}

export function verifyClientAuthToken(token: string) {
  const result = verifyClientAuthTokenDetailed(token);
  return result.ok ? result.payload : null;
}
