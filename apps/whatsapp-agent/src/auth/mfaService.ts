import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { hasFeature } from "../features/clientFeatures.js";
import { logger } from "../logger/logger.js";

const MFA_SECRET_KEY_REF = "MFA_SECRET_ENCRYPTION_KEY";
const MFA_SECRET_PREFIX = "v1";
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export type MfaServicePrisma = Pick<
  PrismaClient,
  "$transaction" | "client" | "user" | "mfaTotpSecret" | "mfaRecoveryCode" | "mfaChallenge"
>;

type ClientWithFeatures = {
  id: string;
  clientKey: string;
  name?: string | null;
  status: string;
  features: Prisma.JsonValue | null;
  profile?: string | null;
};

type UserWithClient = {
  id: string;
  clientId: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  client: ClientWithFeatures;
};

export type MfaStatus = {
  featureEnabled: boolean;
  required: boolean;
  enforced: boolean;
  enrolled: boolean;
  enabled: boolean;
  enrolledAt: string | null;
  lastUsedAt: string | null;
  recoveryCodes: {
    configured: boolean;
    total: number;
    unused: number;
  };
};

export type StartMfaEnrollmentResult =
  | {
      ok: true;
      status: MfaStatus;
      provisioning: {
        type: "totp";
        issuer: string;
        accountName: string;
        otpauthUrl: string;
        secret: string;
      };
    }
  | { ok: false; error: "mfa_feature_disabled" | "forbidden" | "user_not_found" | "client_inactive" | "mfa_secret_encryption_key_missing_or_weak" };

export type VerifyMfaTotpShadowResult =
  | {
      ok: true;
      valid: boolean;
      status: "valid" | "invalid";
    }
  | {
      ok: false;
      error:
        | "mfa_feature_disabled"
        | "forbidden"
        | "user_not_found"
        | "client_inactive"
        | "mfa_totp_not_enrolled"
        | "mfa_secret_unavailable"
        | "rate_limited";
    };

export type MfaRuntimeShadowStatus = {
  enrolled: boolean;
  enabled: boolean;
  wouldRequireMfa: boolean;
  mode: "shadow";
  reason:
    | "mfa_disabled"
    | "mfa_not_required"
    | "role_not_eligible"
    | "admin_required_enrolled"
    | "admin_required_pending_enrollment";
};

export type MfaLoginChallengeResult =
  | {
      required: true;
      challengeToken: string;
      expiresAt: string;
    }
  | {
      required: false;
      reason:
        | "mfa_disabled"
        | "mfa_not_required"
        | "mfa_not_enforced"
        | "role_not_eligible"
        | "not_enrolled";
    };

export type VerifyMfaChallengeResult =
  | {
      ok: true;
      user: {
        id: string;
        clientId: string;
        name: string;
        email: string;
        role: string;
        departmentId: string | null;
        department: { name: string | null } | null;
        client: ClientWithFeatures;
      };
    }
  | {
      ok: false;
      error:
        | "bad_request"
        | "invalid_challenge"
        | "challenge_expired"
        | "challenge_locked"
        | "invalid_code"
        | "mfa_secret_unavailable"
        | "client_inactive"
        | "user_inactive";
    };

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;
const RECOVERY_CODE_COUNT = 10;
const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MFA_CHALLENGE_MAX_ATTEMPTS = 5;
const SHADOW_RATE_LIMIT_WINDOW_MS = 60_000;
const SHADOW_RATE_LIMIT_MAX = 10;
const shadowVerifyAttempts = new Map<string, { count: number; resetAt: number }>();

function normalizeRole(role: string | null | undefined) {
  return String(role || "").trim().toUpperCase();
}

export function canManageOwnMfa(role: string | null | undefined) {
  const normalized = normalizeRole(role);
  return normalized === "ADMIN" || normalized === "SUPERVISOR";
}

function getEncryptionKey(secret = process.env.MFA_SECRET_ENCRYPTION_KEY ?? "") {
  const trimmed = secret.trim();
  if (!trimmed) return null;
  const decoded = Buffer.from(trimmed, "base64");
  if (decoded.length === 32) return decoded;
  return crypto.createHash("sha256").update(trimmed).digest();
}

export function isMfaSecretEncryptionConfigured(secret = process.env.MFA_SECRET_ENCRYPTION_KEY ?? "") {
  return Boolean(getEncryptionKey(secret));
}

export function encryptMfaSecret(value: string, secret = process.env.MFA_SECRET_ENCRYPTION_KEY ?? "") {
  const key = getEncryptionKey(secret);
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${MFA_SECRET_PREFIX}:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptMfaSecret(ciphertext: string | null | undefined, secret = process.env.MFA_SECRET_ENCRYPTION_KEY ?? "") {
  const key = getEncryptionKey(secret);
  const raw = String(ciphertext ?? "").trim();
  if (!key || !raw.startsWith(`${MFA_SECRET_PREFIX}:`)) return null;
  const parts = raw.split(":");
  if (parts.length !== 4) return null;
  try {
    const [, ivRaw, tagRaw, encryptedRaw] = parts;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8").trim() || null;
  } catch {
    return null;
  }
}

function generateBase32Secret(byteLength = 20) {
  const bytes = crypto.randomBytes(byteLength);
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");
    output += BASE32_ALPHABET[Number.parseInt(chunk, 2)] ?? "";
  }
  return output;
}

function generateRecoveryCode() {
  return `${crypto.randomBytes(4).toString("hex")}-${crypto.randomBytes(4).toString("hex")}`.toUpperCase();
}

function hashRecoveryCode(code: string) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(code, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function generateChallengeToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashChallengeToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function decodeBase32(value: string) {
  const normalized = value.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = "";
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) return null;
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret: string, counter: number) {
  const key = decodeBase32(secret);
  if (!key) return null;
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export function verifyTotpCode(params: {
  secret: string;
  code: string;
  nowMs?: number;
  window?: number;
}) {
  const code = String(params.code ?? "").trim().replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return false;
  const nowMs = params.nowMs ?? Date.now();
  const counter = Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
  const window = params.window ?? TOTP_WINDOW;
  const submitted = Buffer.from(code);
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = hotp(params.secret, counter + offset);
    if (!expected) continue;
    const expectedBuffer = Buffer.from(expected);
    if (expectedBuffer.length === submitted.length && crypto.timingSafeEqual(expectedBuffer, submitted)) {
      return true;
    }
  }
  return false;
}

function buildOtpAuthUrl(params: { issuer: string; accountName: string; secret: string }) {
  const label = `${params.issuer}:${params.accountName}`;
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`;
}

function formatStatus(params: {
  client: ClientWithFeatures;
  secret: {
    enabled: boolean;
    enrolledAt: Date | null;
    lastUsedAt: Date | null;
  } | null;
  recoveryCodes: Array<{ usedAt: Date | null }>;
}): MfaStatus {
  const total = params.recoveryCodes.length;
  const unused = params.recoveryCodes.filter((code) => !code.usedAt).length;
  return {
    featureEnabled: hasFeature(params.client, "mfa"),
    required: hasFeature(params.client, "mfaRequired"),
    enforced: hasFeature(params.client, "mfaEnforced"),
    enrolled: Boolean(params.secret?.enrolledAt),
    enabled: Boolean(params.secret?.enabled),
    enrolledAt: params.secret?.enrolledAt?.toISOString() ?? null,
    lastUsedAt: params.secret?.lastUsedAt?.toISOString() ?? null,
    recoveryCodes: {
      configured: total > 0,
      total,
      unused,
    },
  };
}

async function getScopedUser(params: {
  prisma: MfaServicePrisma;
  clientId: string;
  userId: string;
}) {
  return params.prisma.user.findFirst({
    where: {
      id: params.userId,
      clientId: params.clientId,
    },
    select: {
      id: true,
      clientId: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      client: {
        select: {
          id: true,
          clientKey: true,
          name: true,
          status: true,
          features: true,
          profile: true,
        },
      },
    },
  }) as Promise<UserWithClient | null>;
}

function checkShadowRateLimit(clientId: string, userId: string) {
  const key = `${clientId}:${userId}`;
  const now = Date.now();
  const current = shadowVerifyAttempts.get(key);
  if (!current || current.resetAt <= now) {
    shadowVerifyAttempts.set(key, { count: 1, resetAt: now + SHADOW_RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (current.count >= SHADOW_RATE_LIMIT_MAX) return false;
  current.count += 1;
  return true;
}

export async function getMfaStatus(params: {
  prisma: MfaServicePrisma;
  clientId: string;
  userId: string;
  role: string;
}) {
  if (!canManageOwnMfa(params.role)) {
    return { ok: false as const, error: "forbidden" as const };
  }
  const user = await getScopedUser(params);
  if (!user) return { ok: false as const, error: "user_not_found" as const };
  if (user.client.status !== "ACTIVE" || !user.isActive) {
    return { ok: false as const, error: "client_inactive" as const };
  }
  if (!hasFeature(user.client, "mfa")) {
    return { ok: false as const, error: "mfa_feature_disabled" as const };
  }
  const [secret, recoveryCodes] = await Promise.all([
    params.prisma.mfaTotpSecret.findUnique({
      where: {
        clientId_userId: {
          clientId: params.clientId,
          userId: params.userId,
        },
      },
      select: {
        enabled: true,
        enrolledAt: true,
        lastUsedAt: true,
      },
    }),
    params.prisma.mfaRecoveryCode.findMany({
      where: {
        clientId: params.clientId,
        userId: params.userId,
      },
      select: { usedAt: true },
    }),
  ]);
  return {
    ok: true as const,
    status: formatStatus({ client: user.client, secret, recoveryCodes }),
  };
}

export async function getMfaRecoveryCodeStatus(params: {
  prisma: MfaServicePrisma;
  clientId: string;
  userId: string;
  role: string;
  requestId?: string | null;
}) {
  if (!canManageOwnMfa(params.role)) {
    return { ok: false as const, error: "forbidden" as const };
  }
  const user = await getScopedUser(params);
  if (!user) return { ok: false as const, error: "user_not_found" as const };
  if (user.client.status !== "ACTIVE" || !user.isActive) {
    return { ok: false as const, error: "client_inactive" as const };
  }
  if (!hasFeature(user.client, "mfa")) {
    return { ok: false as const, error: "mfa_feature_disabled" as const };
  }
  const recoveryCodes = await params.prisma.mfaRecoveryCode.findMany({
    where: {
      clientId: params.clientId,
      userId: params.userId,
    },
    select: { usedAt: true },
  });
  const total = recoveryCodes.length;
  const used = recoveryCodes.filter((code) => code.usedAt).length;
  const available = total - used;
  logger.info({
    event: "mfa.recovery.status_viewed",
    clientId: params.clientId,
    userId: params.userId,
    role: normalizeRole(params.role),
    total,
    available,
    requestId: params.requestId,
  });
  return {
    ok: true as const,
    status: {
      configured: total > 0,
      total,
      used,
      available,
    },
  };
}

export async function generateMfaRecoveryCodes(params: {
  prisma: MfaServicePrisma;
  clientId: string;
  userId: string;
  role: string;
  requestId?: string | null;
}) {
  if (!canManageOwnMfa(params.role)) {
    return { ok: false as const, error: "forbidden" as const };
  }
  const user = await getScopedUser(params);
  if (!user) return { ok: false as const, error: "user_not_found" as const };
  if (user.client.status !== "ACTIVE" || !user.isActive) {
    return { ok: false as const, error: "client_inactive" as const };
  }
  if (!hasFeature(user.client, "mfa")) {
    return { ok: false as const, error: "mfa_feature_disabled" as const };
  }

  const existingCodes = await params.prisma.mfaRecoveryCode.findMany({
    where: {
      clientId: params.clientId,
      userId: params.userId,
    },
    select: { usedAt: true },
  });
  const usedExistingCount = existingCodes.filter((code) => code.usedAt).length;
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());
  await params.prisma.$transaction([
    params.prisma.mfaRecoveryCode.deleteMany({
      where: {
        clientId: params.clientId,
        userId: params.userId,
        usedAt: null,
      },
    }),
    params.prisma.mfaRecoveryCode.createMany({
      data: codes.map((code) => ({
        clientId: params.clientId,
        userId: params.userId,
        codeHash: hashRecoveryCode(code),
      })),
    }),
  ]);
  const total = usedExistingCount + codes.length;
  logger.info({
    event: existingCodes.length > 0 ? "mfa.recovery.regenerated" : "mfa.recovery.generated",
    clientId: params.clientId,
    userId: params.userId,
    role: normalizeRole(params.role),
    count: codes.length,
    requestId: params.requestId,
  });
  return {
    ok: true as const,
    recoveryCodes: codes,
    status: {
      configured: true,
      total,
      used: usedExistingCount,
      available: codes.length,
    },
    regenerated: existingCodes.length > 0,
  };
}

export async function evaluateMfaRuntimeShadow(params: {
  prisma: MfaServicePrisma;
  clientId: string;
  userId: string;
  role: string;
  client: ClientWithFeatures;
  requestId?: string | null;
  emitAudit?: boolean;
}): Promise<MfaRuntimeShadowStatus> {
  const mfaEnabled = hasFeature(params.client, "mfa");
  if (!mfaEnabled) {
    const status: MfaRuntimeShadowStatus = {
      enrolled: false,
      enabled: false,
      wouldRequireMfa: false,
      mode: "shadow",
      reason: "mfa_disabled",
    };
    if (params.emitAudit) {
      logger.info({
        event: "login.mfa_shadow_skipped",
        reason: status.reason,
        clientId: params.clientId,
        userId: params.userId,
        role: normalizeRole(params.role),
        requestId: params.requestId,
      });
    }
    return status;
  }

  const secret = await params.prisma.mfaTotpSecret.findUnique({
    where: {
      clientId_userId: {
        clientId: params.clientId,
        userId: params.userId,
      },
    },
    select: {
      enabled: true,
      enrolledAt: true,
    },
  });
  const enrolled = Boolean(secret);
  const enabled = Boolean(secret?.enabled || secret?.enrolledAt);

  const required = hasFeature(params.client, "mfaRequired");
  if (!required) {
    const status: MfaRuntimeShadowStatus = {
      enrolled,
      enabled,
      wouldRequireMfa: false,
      mode: "shadow",
      reason: "mfa_not_required",
    };
    if (params.emitAudit) {
      logger.info({
        event: "login.mfa_shadow_not_required",
        reason: status.reason,
        clientId: params.clientId,
        userId: params.userId,
        role: normalizeRole(params.role),
        requestId: params.requestId,
      });
    }
    return status;
  }

  const role = normalizeRole(params.role);
  if (role !== "ADMIN") {
    const status: MfaRuntimeShadowStatus = {
      enrolled,
      enabled,
      wouldRequireMfa: false,
      mode: "shadow",
      reason: "role_not_eligible",
    };
    if (params.emitAudit) {
      logger.info({
        event: "login.mfa_shadow_not_required",
        reason: status.reason,
        clientId: params.clientId,
        userId: params.userId,
        role,
        requestId: params.requestId,
      });
    }
    return status;
  }

  const status: MfaRuntimeShadowStatus = {
    enrolled,
    enabled,
    wouldRequireMfa: true,
    mode: "shadow",
    reason: enrolled ? "admin_required_enrolled" : "admin_required_pending_enrollment",
  };
  if (params.emitAudit) {
    logger.info({
      event: "login.mfa_shadow_required",
      reason: status.reason,
      clientId: params.clientId,
      userId: params.userId,
      role,
      enrolled,
      requestId: params.requestId,
    });
  }
  return status;
}

export async function createMfaLoginChallengeIfRequired(params: {
  prisma: MfaServicePrisma;
  clientId: string;
  userId: string;
  role: string;
  client: ClientWithFeatures;
  ipHash?: string | null;
  userAgentHash?: string | null;
  requestId?: string | null;
}): Promise<MfaLoginChallengeResult> {
  if (!hasFeature(params.client, "mfa")) {
    return { required: false, reason: "mfa_disabled" };
  }
  if (!hasFeature(params.client, "mfaRequired")) {
    return { required: false, reason: "mfa_not_required" };
  }
  if (!hasFeature(params.client, "mfaEnforced")) {
    return { required: false, reason: "mfa_not_enforced" };
  }
  const role = normalizeRole(params.role);
  if (role !== "ADMIN") {
    return { required: false, reason: "role_not_eligible" };
  }

  const secret = await params.prisma.mfaTotpSecret.findUnique({
    where: {
      clientId_userId: {
        clientId: params.clientId,
        userId: params.userId,
      },
    },
    select: {
      enabled: true,
      enrolledAt: true,
    },
  });
  if (!secret || (!secret.enabled && !secret.enrolledAt)) {
    return { required: false, reason: "not_enrolled" };
  }

  const challengeToken = generateChallengeToken();
  const challengeTokenHash = hashChallengeToken(challengeToken);
  const expiresAt = new Date(Date.now() + MFA_CHALLENGE_TTL_MS);
  await params.prisma.mfaChallenge.create({
    data: {
      clientId: params.clientId,
      userId: params.userId,
      challengeTokenHash,
      expiresAt,
      attempts: 0,
      status: "pending",
      ipHash: params.ipHash ?? null,
      userAgentHash: params.userAgentHash ?? null,
    },
  });
  logger.info({
    event: "login.mfa_challenge_created",
    clientId: params.clientId,
    userId: params.userId,
    role,
    expiresAt: expiresAt.toISOString(),
    requestId: params.requestId,
  });
  return {
    required: true,
    challengeToken,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function verifyMfaLoginChallenge(params: {
  prisma: MfaServicePrisma;
  challengeToken: string;
  code: string;
  requestId?: string | null;
  now?: Date;
}): Promise<VerifyMfaChallengeResult> {
  const challengeToken = String(params.challengeToken ?? "").trim();
  const code = String(params.code ?? "").trim();
  if (!challengeToken || !/^\d{6}$/.test(code.replace(/\s+/g, ""))) {
    return { ok: false, error: "bad_request" };
  }
  const now = params.now ?? new Date();
  const challenge = await params.prisma.mfaChallenge.findUnique({
    where: { challengeTokenHash: hashChallengeToken(challengeToken) },
    select: {
      id: true,
      clientId: true,
      userId: true,
      expiresAt: true,
      attempts: true,
      status: true,
      user: {
        select: {
          id: true,
          clientId: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          departmentId: true,
          department: { select: { name: true } },
          client: {
            select: {
              id: true,
              clientKey: true,
              name: true,
              status: true,
              features: true,
              profile: true,
            },
          },
        },
      },
    },
  });
  if (!challenge) {
    logger.warn({ event: "login.mfa_challenge_failed", reason: "invalid_challenge", requestId: params.requestId });
    return { ok: false, error: "invalid_challenge" };
  }
  if (challenge.status !== "pending") {
    logger.warn({
      event: "login.mfa_challenge_failed",
      reason: challenge.status,
      clientId: challenge.clientId,
      userId: challenge.userId,
      requestId: params.requestId,
    });
    return { ok: false, error: challenge.status === "expired" ? "challenge_expired" : "challenge_locked" };
  }
  if (challenge.expiresAt <= now) {
    await params.prisma.mfaChallenge.update({
      where: { id: challenge.id },
      data: { status: "expired" },
    });
    logger.warn({
      event: "login.mfa_challenge_expired",
      clientId: challenge.clientId,
      userId: challenge.userId,
      requestId: params.requestId,
    });
    return { ok: false, error: "challenge_expired" };
  }
  if (challenge.attempts >= MFA_CHALLENGE_MAX_ATTEMPTS) {
    await params.prisma.mfaChallenge.update({
      where: { id: challenge.id },
      data: { status: "failed" },
    });
    return { ok: false, error: "challenge_locked" };
  }
  if (challenge.user.client.status !== "ACTIVE") {
    return { ok: false, error: "client_inactive" };
  }
  if (!challenge.user.isActive) {
    return { ok: false, error: "user_inactive" };
  }

  const secret = await params.prisma.mfaTotpSecret.findUnique({
    where: {
      clientId_userId: {
        clientId: challenge.clientId,
        userId: challenge.userId,
      },
    },
    select: {
      enabled: true,
      enrolledAt: true,
      secretCiphertext: true,
    },
  });
  const decrypted = decryptMfaSecret(secret?.secretCiphertext);
  if (!secret || (!secret.enabled && !secret.enrolledAt) || !decrypted) {
    return { ok: false, error: "mfa_secret_unavailable" };
  }

  const valid = verifyTotpCode({ secret: decrypted, code, nowMs: now.getTime() });
  if (!valid) {
    const nextAttempts = challenge.attempts + 1;
    const locked = nextAttempts >= MFA_CHALLENGE_MAX_ATTEMPTS;
    await params.prisma.mfaChallenge.update({
      where: { id: challenge.id },
      data: {
        attempts: nextAttempts,
        status: locked ? "failed" : "pending",
      },
    });
    logger.warn({
      event: "login.mfa_challenge_failed",
      reason: locked ? "attempts_exceeded" : "invalid_code",
      clientId: challenge.clientId,
      userId: challenge.userId,
      attempts: nextAttempts,
      requestId: params.requestId,
    });
    return { ok: false, error: locked ? "challenge_locked" : "invalid_code" };
  }

  await params.prisma.$transaction([
    params.prisma.mfaChallenge.update({
      where: { id: challenge.id },
      data: {
        status: "verified",
        verifiedAt: now,
      },
    }),
    params.prisma.mfaTotpSecret.update({
      where: {
        clientId_userId: {
          clientId: challenge.clientId,
          userId: challenge.userId,
        },
      },
      data: {
        lastUsedAt: now,
        enabled: true,
        enrolledAt: secret.enrolledAt ?? now,
      },
    }),
  ]);
  logger.info({
    event: "login.mfa_challenge_verified",
    clientId: challenge.clientId,
    userId: challenge.userId,
    requestId: params.requestId,
  });
  return {
    ok: true,
    user: {
      id: challenge.user.id,
      clientId: challenge.user.clientId,
      name: challenge.user.name,
      email: challenge.user.email,
      role: challenge.user.role,
      departmentId: challenge.user.departmentId,
      department: challenge.user.department,
      client: challenge.user.client,
    },
  };
}

export async function startMfaEnrollment(params: {
  prisma: MfaServicePrisma;
  clientId: string;
  userId: string;
  role: string;
  requestId?: string | null;
}): Promise<StartMfaEnrollmentResult> {
  if (!canManageOwnMfa(params.role)) {
    return { ok: false, error: "forbidden" };
  }
  const user = await getScopedUser(params);
  if (!user) return { ok: false, error: "user_not_found" };
  if (user.client.status !== "ACTIVE" || !user.isActive) {
    return { ok: false, error: "client_inactive" };
  }
  if (!hasFeature(user.client, "mfa")) {
    return { ok: false, error: "mfa_feature_disabled" };
  }
  const secret = generateBase32Secret();
  const encrypted = encryptMfaSecret(secret);
  if (!encrypted) {
    return { ok: false, error: "mfa_secret_encryption_key_missing_or_weak" };
  }
  await params.prisma.mfaTotpSecret.upsert({
    where: {
      clientId_userId: {
        clientId: params.clientId,
        userId: params.userId,
      },
    },
    create: {
      clientId: params.clientId,
      userId: params.userId,
      secretCiphertext: encrypted,
      keyVersion: MFA_SECRET_KEY_REF,
      enabled: false,
      enrolledAt: null,
      lastUsedAt: null,
    },
    update: {
      secretCiphertext: encrypted,
      keyVersion: MFA_SECRET_KEY_REF,
      enabled: false,
      enrolledAt: null,
      lastUsedAt: null,
    },
  });
  const statusResult = await getMfaStatus({
    prisma: params.prisma,
    clientId: params.clientId,
    userId: params.userId,
    role: params.role,
  });
  if (!statusResult.ok) return statusResult;

  logger.info({
    event: "mfa.enrollment.started",
    clientId: params.clientId,
    userId: params.userId,
    role: normalizeRole(params.role),
    requestId: params.requestId,
  });

  const issuer = "Converta";
  return {
    ok: true,
    status: statusResult.status,
    provisioning: {
      type: "totp",
      issuer,
      accountName: user.email,
      otpauthUrl: buildOtpAuthUrl({ issuer, accountName: user.email, secret }),
      secret,
    },
  };
}

export async function verifyMfaTotpShadow(params: {
  prisma: MfaServicePrisma;
  clientId: string;
  userId: string;
  role: string;
  code: string;
  requestId?: string | null;
  nowMs?: number;
}): Promise<VerifyMfaTotpShadowResult> {
  if (!canManageOwnMfa(params.role)) {
    return { ok: false, error: "forbidden" };
  }
  const user = await getScopedUser(params);
  if (!user) return { ok: false, error: "user_not_found" };
  if (user.client.status !== "ACTIVE" || !user.isActive) {
    return { ok: false, error: "client_inactive" };
  }
  if (!hasFeature(user.client, "mfa")) {
    logger.info({
      event: "mfa.shadow.verify_denied",
      reason: "feature_disabled",
      clientId: params.clientId,
      userId: params.userId,
      requestId: params.requestId,
    });
    return { ok: false, error: "mfa_feature_disabled" };
  }
  if (!checkShadowRateLimit(params.clientId, params.userId)) {
    logger.info({
      event: "mfa.shadow.verify_denied",
      reason: "rate_limited",
      clientId: params.clientId,
      userId: params.userId,
      requestId: params.requestId,
    });
    return { ok: false, error: "rate_limited" };
  }
  const secret = await params.prisma.mfaTotpSecret.findUnique({
    where: {
      clientId_userId: {
        clientId: params.clientId,
        userId: params.userId,
      },
    },
    select: {
      secretCiphertext: true,
    },
  });
  if (!secret) {
    logger.info({
      event: "mfa.shadow.verify_denied",
      reason: "not_enrolled",
      clientId: params.clientId,
      userId: params.userId,
      requestId: params.requestId,
    });
    return { ok: false, error: "mfa_totp_not_enrolled" };
  }
  const plainSecret = decryptMfaSecret(secret.secretCiphertext);
  if (!plainSecret) {
    logger.warn({
      event: "mfa.shadow.verify_denied",
      reason: "secret_unavailable",
      clientId: params.clientId,
      userId: params.userId,
      requestId: params.requestId,
    });
    return { ok: false, error: "mfa_secret_unavailable" };
  }
  const valid = verifyTotpCode({ secret: plainSecret, code: params.code, nowMs: params.nowMs });
  logger.info({
    event: valid ? "mfa.shadow.verify_success" : "mfa.shadow.verify_failed",
    clientId: params.clientId,
    userId: params.userId,
    role: normalizeRole(params.role),
    requestId: params.requestId,
  });
  return {
    ok: true,
    valid,
    status: valid ? "valid" : "invalid",
  };
}
