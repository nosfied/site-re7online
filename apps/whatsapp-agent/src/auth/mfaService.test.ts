import test from "node:test";
import assert from "node:assert/strict";
import {
  decryptMfaSecret,
  encryptMfaSecret,
  evaluateMfaRuntimeShadow,
  generateMfaRecoveryCodes,
  getMfaRecoveryCodeStatus,
  getMfaStatus,
  startMfaEnrollment,
  verifyMfaTotpShadow,
  verifyTotpCode,
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
    $transaction: async (operations: Promise<any>[]) => Promise.all(operations),
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
        let result = state.recoveryCodes.filter((item) => item.clientId === where.clientId && item.userId === where.userId);
        if (where.usedAt === null) {
          result = result.filter((item) => item.usedAt === null);
        }
        return result;
      },
      count: async ({ where }: any) => {
        let result = state.recoveryCodes.filter((item) => item.clientId === where.clientId && item.userId === where.userId);
        if (where.usedAt === null) {
          result = result.filter((item) => item.usedAt === null);
        }
        return result.length;
      },
      deleteMany: async ({ where }: any) => {
        const before = state.recoveryCodes.length;
        state.recoveryCodes = state.recoveryCodes.filter((item) => {
          if (item.clientId !== where.clientId || item.userId !== where.userId) return true;
          if (where.usedAt === null) return item.usedAt !== null;
          return false;
        });
        return { count: before - state.recoveryCodes.length };
      },
      createMany: async ({ data }: any) => {
        state.recoveryCodes.push(
          ...data.map((item: any, index: number) => ({
            id: `recovery-${state.recoveryCodes.length + index + 1}`,
            usedAt: null,
            createdAt: new Date(),
            ...item,
          }))
        );
        return { count: data.length };
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

test("mfa recovery code status blocks disabled feature", async () => {
  const client = makeClient({ mfa: false });
  const { prisma } = makePrisma({ user: makeUser({ client }) });
  const result = await getMfaRecoveryCodeStatus({
    prisma,
    clientId: client.id,
    userId: "user-1",
    role: "ADMIN",
  });
  assert.deepEqual(result, { ok: false, error: "mfa_feature_disabled" });
});

test("mfa recovery code status is safe and never returns code hashes", async () => {
  const client = makeClient({ mfa: true });
  const { prisma } = makePrisma({
    user: makeUser({ client }),
    recoveryCodes: [
      { clientId: client.id, userId: "user-1", codeHash: "scrypt$unused", usedAt: null },
      { clientId: client.id, userId: "user-1", codeHash: "scrypt$used", usedAt: new Date("2026-06-24T12:00:00.000Z") },
      { clientId: "22222222-2222-4222-8222-222222222222", userId: "user-1", codeHash: "scrypt$other", usedAt: null },
    ],
  });
  const result = await getMfaRecoveryCodeStatus({
    prisma,
    clientId: client.id,
    userId: "user-1",
    role: "SUPERVISOR",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.status, {
    configured: true,
    total: 2,
    used: 1,
    available: 1,
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("scrypt$"), false);
});

test("mfa recovery code generation stores only hashes and returns plain codes once", async () => {
  const client = makeClient({ mfa: true });
  const { prisma, state } = makePrisma({ user: makeUser({ client }) });
  const result = await generateMfaRecoveryCodes({
    prisma,
    clientId: client.id,
    userId: "user-1",
    role: "ADMIN",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.recoveryCodes.length, 10);
  assert.equal(result.regenerated, false);
  assert.deepEqual(result.status, {
    configured: true,
    total: 10,
    used: 0,
    available: 10,
  });
  assert.equal(state.recoveryCodes.length, 10);
  for (const code of result.recoveryCodes) {
    assert.match(code, /^[A-F0-9]{8}-[A-F0-9]{8}$/);
    assert.equal(state.recoveryCodes.some((stored) => stored.codeHash === code), false);
    assert.equal(state.recoveryCodes.some((stored) => String(stored.codeHash).includes(code)), false);
  }
  assert.equal(state.recoveryCodes.every((stored) => String(stored.codeHash).startsWith("scrypt$")), true);
});

test("mfa recovery code regeneration replaces unused codes and keeps used audit rows", async () => {
  const client = makeClient({ mfa: true });
  const usedAt = new Date("2026-06-24T12:00:00.000Z");
  const { prisma, state } = makePrisma({
    user: makeUser({ client }),
    recoveryCodes: [
      { clientId: client.id, userId: "user-1", codeHash: "scrypt$old-unused", usedAt: null },
      { clientId: client.id, userId: "user-1", codeHash: "scrypt$old-used", usedAt },
    ],
  });
  const result = await generateMfaRecoveryCodes({
    prisma,
    clientId: client.id,
    userId: "user-1",
    role: "ADMIN",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.regenerated, true);
  assert.deepEqual(result.status, {
    configured: true,
    total: 11,
    used: 1,
    available: 10,
  });
  assert.equal(state.recoveryCodes.some((stored) => stored.codeHash === "scrypt$old-unused"), false);
  assert.equal(state.recoveryCodes.some((stored) => stored.codeHash === "scrypt$old-used" && stored.usedAt === usedAt), true);
  assert.equal(state.recoveryCodes.filter((stored) => stored.clientId === client.id && stored.userId === "user-1" && stored.usedAt === null).length, 10);
});

test("mfa recovery codes preserve tenant isolation and RBAC", async () => {
  const client = makeClient({ mfa: true });
  const { prisma } = makePrisma({ user: makeUser({ client }) });
  const agent = await generateMfaRecoveryCodes({
    prisma,
    clientId: client.id,
    userId: "user-1",
    role: "AGENT",
  });
  assert.deepEqual(agent, { ok: false, error: "forbidden" });

  const otherTenant = await generateMfaRecoveryCodes({
    prisma,
    clientId: "22222222-2222-4222-8222-222222222222",
    userId: "user-1",
    role: "ADMIN",
  });
  assert.deepEqual(otherTenant, { ok: false, error: "user_not_found" });
});

test("totp verifier accepts RFC-compatible six digit code inside the time window", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(verifyTotpCode({ secret, code: "287082", nowMs: 59_000 }), true);
  assert.equal(verifyTotpCode({ secret, code: "000000", nowMs: 59_000 }), false);
  assert.equal(verifyTotpCode({ secret, code: "abc123", nowMs: 59_000 }), false);
});

test("mfa shadow verification blocks disabled feature", async () => {
  const client = makeClient({ mfa: false });
  const { prisma } = makePrisma({ user: makeUser({ client }) });
  const result = await verifyMfaTotpShadow({
    prisma,
    clientId: client.id,
    userId: "user-1",
    role: "ADMIN",
    code: "123456",
  });
  assert.deepEqual(result, { ok: false, error: "mfa_feature_disabled" });
});

test("mfa shadow verification blocks missing enrollment", async () => {
  const { prisma } = makePrisma();
  const result = await verifyMfaTotpShadow({
    prisma,
    clientId: makeClient().id,
    userId: "user-1",
    role: "ADMIN",
    code: "123456",
  });
  assert.deepEqual(result, { ok: false, error: "mfa_totp_not_enrolled" });
});

test("mfa shadow verification validates decrypted TOTP secret without enabling MFA", async () => {
  const previous = process.env.MFA_SECRET_ENCRYPTION_KEY;
  process.env.MFA_SECRET_ENCRYPTION_KEY = TEST_KEY;
  try {
    const client = makeClient({ mfa: true, mfaRequired: true, mfaEnforced: true });
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const encrypted = encryptMfaSecret(secret, TEST_KEY);
    const { prisma } = makePrisma({
      user: makeUser({ client }),
      secret: {
        clientId: client.id,
        userId: "user-1",
        enabled: false,
        enrolledAt: null,
        lastUsedAt: null,
        secretCiphertext: encrypted,
      },
    });
    const valid = await verifyMfaTotpShadow({
      prisma,
      clientId: client.id,
      userId: "user-1",
      role: "ADMIN",
      code: "287082",
      nowMs: 59_000,
    });
    assert.deepEqual(valid, { ok: true, valid: true, status: "valid" });

    const invalid = await verifyMfaTotpShadow({
      prisma,
      clientId: client.id,
      userId: "user-1",
      role: "ADMIN",
      code: "000000",
      nowMs: 59_000,
    });
    assert.deepEqual(invalid, { ok: true, valid: false, status: "invalid" });
  } finally {
    if (previous === undefined) delete process.env.MFA_SECRET_ENCRYPTION_KEY;
    else process.env.MFA_SECRET_ENCRYPTION_KEY = previous;
  }
});

test("mfa shadow verification preserves tenant isolation", async () => {
  const otherClient = makeClient();
  const { prisma } = makePrisma({ user: makeUser({ client: otherClient }) });
  const result = await verifyMfaTotpShadow({
    prisma,
    clientId: "22222222-2222-4222-8222-222222222222",
    userId: "user-1",
    role: "ADMIN",
    code: "123456",
  });
  assert.deepEqual(result, { ok: false, error: "user_not_found" });
});

test("mfa runtime shadow skips disabled feature without requiring MFA", async () => {
  const client = makeClient({ mfa: false, mfaRequired: true });
  const { prisma } = makePrisma({ user: makeUser({ client }) });
  const result = await evaluateMfaRuntimeShadow({
    prisma,
    clientId: client.id,
    userId: "user-1",
    role: "ADMIN",
    client,
  });
  assert.deepEqual(result, {
    enrolled: false,
    enabled: false,
    wouldRequireMfa: false,
    mode: "shadow",
    reason: "mfa_disabled",
  });
});

test("mfa runtime shadow marks admin as required when policy is enabled without blocking login", async () => {
  const client = makeClient({ mfa: true, mfaRequired: true, mfaEnforced: true });
  const { prisma } = makePrisma({ user: makeUser({ client }) });
  const result = await evaluateMfaRuntimeShadow({
    prisma,
    clientId: client.id,
    userId: "user-1",
    role: "ADMIN",
    client,
  });
  assert.deepEqual(result, {
    enrolled: false,
    enabled: false,
    wouldRequireMfa: true,
    mode: "shadow",
    reason: "admin_required_pending_enrollment",
  });
});

test("mfa runtime shadow detects admin enrollment without enforcing login", async () => {
  const client = makeClient({ mfa: true, mfaRequired: true });
  const { prisma } = makePrisma({
    user: makeUser({ client }),
    secret: {
      clientId: client.id,
      userId: "user-1",
      enabled: false,
      enrolledAt: null,
    },
  });
  const result = await evaluateMfaRuntimeShadow({
    prisma,
    clientId: client.id,
    userId: "user-1",
    role: "ADMIN",
    client,
  });
  assert.deepEqual(result, {
    enrolled: true,
    enabled: false,
    wouldRequireMfa: true,
    mode: "shadow",
    reason: "admin_required_enrolled",
  });
});

test("mfa runtime shadow does not require supervisor in the MVP policy", async () => {
  const client = makeClient({ mfa: true, mfaRequired: true });
  const { prisma } = makePrisma({ user: makeUser({ client, role: "SUPERVISOR" }) });
  const result = await evaluateMfaRuntimeShadow({
    prisma,
    clientId: client.id,
    userId: "user-1",
    role: "SUPERVISOR",
    client,
  });
  assert.deepEqual(result, {
    enrolled: false,
    enabled: false,
    wouldRequireMfa: false,
    mode: "shadow",
    reason: "role_not_eligible",
  });
});
