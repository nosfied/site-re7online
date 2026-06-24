import test from "node:test";
import assert from "node:assert/strict";
import {
  decryptMfaSecret,
  encryptMfaSecret,
  getMfaStatus,
  startMfaEnrollment,
} from "./mfaService.js";

const TEST_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

function makeClient(features: Record<string, boolean> = { mfa: true }) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    clientKey: "demo-prefeitura",
    name: "Demo Prefeitura",
    status: "ACTIVE",
    profile: "government",
    features,
  };
}

function makeUser(params: { client?: ReturnType<typeof makeClient>; role?: string; active?: boolean } = {}) {
  const client = params.client ?? makeClient();
  return {
    id: "user-1",
    clientId: client.id,
    name: "Admin",
    email: "admin@example.com",
    role: params.role ?? "ADMIN",
    isActive: params.active ?? true,
    client,
  };
}

function makePrisma(params: { user?: ReturnType<typeof makeUser> | null; secret?: any; recoveryCodes?: any[] } = {}) {
  const state = {
    user: params.user === undefined ? makeUser() : params.user,
    secret: params.secret ?? null,
    recoveryCodes: params.recoveryCodes ?? [],
    upserts: [] as any[],
  };
  const prisma = {
    user: {
      findFirst: async ({ where }: any) => {
        if (!state.user) return null;
        if (where.clientId !== state.user.clientId) return null;
        if (where.id !== state.user.id) return null;
        return state.user;
      },
    },
    mfaTotpSecret: {
      findUnique: async ({ where }: any) => {
        if (!state.secret) return null;
        if (where.clientId_userId.clientId !== state.secret.clientId) return null;
        if (where.clientId_userId.userId !== state.secret.userId) return null;
        return state.secret;
      },
      upsert: async (args: any) => {
        state.upserts.push(args);
        state.secret = {
          id: "mfa-1",
          clientId: args.where.clientId_userId.clientId,
          userId: args.where.clientId_userId.userId,
          enabled: args.update.enabled,
          enrolledAt: args.update.enrolledAt,
          lastUsedAt: args.update.lastUsedAt,
          secretCiphertext: args.update.secretCiphertext,
          keyVersion: args.update.keyVersion,
        };
        return state.secret;
      },
    },
    mfaRecoveryCode: {
      findMany: async ({ where }: any) => {
        return state.recoveryCodes.filter((item) => item.clientId === where.clientId && item.userId === where.userId);
      },
    },
  };
  return { prisma: prisma as any, state };
}

test("mfa encryption round trips without storing plain secret", () => {
  const encrypted = encryptMfaSecret("JBSWY3DPEHPK3PXP", TEST_KEY);
  assert.match(encrypted ?? "", /^v1:/);
  assert.equal(encrypted?.includes("JBSWY3DPEHPK3PXP"), false);
  assert.equal(decryptMfaSecret(encrypted, TEST_KEY), "JBSWY3DPEHPK3PXP");
});

test("mfa status blocks agent role", async () => {
  const { prisma } = makePrisma();
  const result = await getMfaStatus({
    prisma,
    clientId: makeClient().id,
    userId: "user-1",
    role: "AGENT",
  });
  assert.deepEqual(result, { ok: false, error: "forbidden" });
});

test("mfa status blocks disabled feature", async () => {
  const client = makeClient({ mfa: false });
  const { prisma } = makePrisma({ user: makeUser({ client }) });
  const result = await getMfaStatus({
    prisma,
    clientId: client.id,
    userId: "user-1",
    role: "ADMIN",
  });
  assert.deepEqual(result, { ok: false, error: "mfa_feature_disabled" });
});

test("mfa status returns tenant-scoped enrollment summary", async () => {
  const client = makeClient({ mfa: true, mfaRequired: true, mfaEnforced: false });
  const enrolledAt = new Date("2026-06-24T12:00:00.000Z");
  const { prisma } = makePrisma({
    user: makeUser({ client }),
    secret: {
      clientId: client.id,
      userId: "user-1",
      enabled: true,
      enrolledAt,
      lastUsedAt: null,
    },
    recoveryCodes: [
      { clientId: client.id, userId: "user-1", usedAt: null },
      { clientId: client.id, userId: "user-1", usedAt: new Date() },
    ],
  });
  const result = await getMfaStatus({
    prisma,
    clientId: client.id,
    userId: "user-1",
    role: "SUPERVISOR",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.status.featureEnabled, true);
  assert.equal(result.status.required, true);
  assert.equal(result.status.enforced, false);
  assert.equal(result.status.enrolled, true);
  assert.equal(result.status.enabled, true);
  assert.equal(result.status.recoveryCodes.total, 2);
  assert.equal(result.status.recoveryCodes.unused, 1);
});

test("mfa enrollment creates encrypted pending TOTP secret and provisioning payload", async () => {
  const previous = process.env.MFA_SECRET_ENCRYPTION_KEY;
  process.env.MFA_SECRET_ENCRYPTION_KEY = TEST_KEY;
  try {
    const client = makeClient({ mfa: true });
    const { prisma, state } = makePrisma({ user: makeUser({ client }) });
    const result = await startMfaEnrollment({
      prisma,
      clientId: client.id,
      userId: "user-1",
      role: "ADMIN",
      requestId: "test",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.status.enabled, false);
    assert.equal(result.status.enrolled, false);
    assert.match(result.provisioning.otpauthUrl, /^otpauth:\/\/totp\//);
    assert.match(result.provisioning.secret, /^[A-Z2-7]+$/);
    assert.equal(state.upserts.length, 1);
    const ciphertext = state.upserts[0].update.secretCiphertext;
    assert.match(ciphertext, /^v1:/);
    assert.equal(ciphertext.includes(result.provisioning.secret), false);
    assert.equal(decryptMfaSecret(ciphertext, TEST_KEY), result.provisioning.secret);
  } finally {
    if (previous === undefined) delete process.env.MFA_SECRET_ENCRYPTION_KEY;
    else process.env.MFA_SECRET_ENCRYPTION_KEY = previous;
  }
});

test("mfa enrollment blocks missing encryption key", async () => {
  const previous = process.env.MFA_SECRET_ENCRYPTION_KEY;
  delete process.env.MFA_SECRET_ENCRYPTION_KEY;
  try {
    const { prisma } = makePrisma();
    const result = await startMfaEnrollment({
      prisma,
      clientId: makeClient().id,
      userId: "user-1",
      role: "ADMIN",
    });
    assert.deepEqual(result, { ok: false, error: "mfa_secret_encryption_key_missing_or_weak" });
  } finally {
    if (previous === undefined) delete process.env.MFA_SECRET_ENCRYPTION_KEY;
    else process.env.MFA_SECRET_ENCRYPTION_KEY = previous;
  }
});
