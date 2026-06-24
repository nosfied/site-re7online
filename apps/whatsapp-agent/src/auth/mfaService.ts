import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { hasFeature } from "../features/clientFeatures.js";
import { logger } from "../logger/logger.js";

const MFA_SECRET_KEY_REF = "MFA_SECRET_ENCRYPTION_KEY";
const MFA_SECRET_PREFIX = "v1";
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export type MfaServicePrisma = Pick<
  PrismaClient,
  "client" | "user" | "mfaTotpSecret" | "mfaRecoveryCode"
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
