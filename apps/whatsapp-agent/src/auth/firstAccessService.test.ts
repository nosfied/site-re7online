import assert from "node:assert/strict";
import test from "node:test";
import {
  FIRST_ACCESS_TOKEN_TTL_MS,
  buildFirstAccessStatus,
  prepareFirstAccessForUsers,
} from "./firstAccessService.js";

function makePrisma() {
  const state = {
    users: [
      {
        id: "user-1",
        clientId: "11111111-1111-4111-8111-111111111111",
        name: "Pessoa Um",
        email: "pessoa.um@example.com",
        passwordHash: null as string | null,
        isActive: true,
        createdAt: new Date("2026-08-14T10:00:00.000Z"),
      },
      {
        id: "user-2",
        clientId: "11111111-1111-4111-8111-111111111111",
        name: "Pessoa Dois",
        email: "pessoa.dois@example.com",
        passwordHash: "hash",
        isActive: true,
        createdAt: new Date("2026-08-14T10:01:00.000Z"),
      },
      {
        id: "other-tenant",
        clientId: "22222222-2222-4222-8222-222222222222",
        name: "Outro Tenant",
        email: "outro@example.com",
        passwordHash: null,
        isActive: true,
        createdAt: new Date("2026-08-14T10:02:00.000Z"),
      },
    ],
    tokens: [
      {
        id: "token-old",
        clientId: "11111111-1111-4111-8111-111111111111",
        userId: "user-1",
        tokenHash: "old-hash",
        usedAt: null as Date | null,
        expiresAt: new Date("2026-08-15T10:00:00.000Z"),
      },
    ],
    events: [] as any[],
  };
  const prisma = {
    $transaction: async (fn: any) => fn(prisma),
    user: {
      findMany: async ({ where }: any) =>
        state.users
          .filter((user) => user.clientId === where.clientId)
          .filter((user) => (where.isActive === undefined ? true : user.isActive === where.isActive))
          .filter((user) => (!where.id?.in ? true : where.id.in.includes(user.id)))
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      findFirst: async ({ where, select }: any) => {
        const user = state.users.find((item) => item.id === where.id && item.clientId === where.clientId);
        if (!user) return null;
        const activeTokens = state.tokens
          .filter((token) => token.clientId === user.clientId && token.userId === user.id && token.usedAt === null)
          .sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime());
        if (select?.passwordResetTokens) {
          return { id: user.id, passwordHash: user.passwordHash, passwordResetTokens: activeTokens.slice(0, 1) };
        }
        return user;
      },
    },
    passwordResetToken: {
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const token of state.tokens) {
          if (token.clientId !== where.clientId || token.userId !== where.userId) continue;
          if (where.usedAt === null && token.usedAt !== null) continue;
          token.usedAt = data.usedAt;
          count += 1;
        }
        return { count };
      },
      create: async ({ data }: any) => {
        const token = { id: `token-${state.tokens.length + 1}`, usedAt: null, ...data };
        state.tokens.push(token);
        return token;
      },
    },
    event: {
      create: async ({ data }: any) => {
        state.events.push(data);
        return data;
      },
    },
  };
  return { prisma: prisma as any, state };
}

test("first access status distinguishes configured, active, expired and missing states", () => {
  const now = new Date("2026-08-14T10:00:00.000Z");
  assert.equal(buildFirstAccessStatus({ passwordHash: "hash", now }), "password_configured");
  assert.equal(
    buildFirstAccessStatus({ token: { expiresAt: new Date("2026-08-14T10:01:00.000Z") }, now }),
    "token_active"
  );
  assert.equal(
    buildFirstAccessStatus({ token: { expiresAt: new Date("2026-08-14T09:59:00.000Z") }, now }),
    "token_expired"
  );
  assert.equal(buildFirstAccessStatus({ now }), "not_ready");
});

test("prepare first access issues one-time hashed token and invalidates previous unused tokens", async () => {
  const { prisma, state } = makePrisma();
  const result = await prepareFirstAccessForUsers({
    prisma,
    clientId: "11111111-1111-4111-8111-111111111111",
    userIds: ["user-1"],
    requestId: "test-first-access",
    passwordResetBaseUrl: "https://converta.example",
  });

  assert.equal(result.ok, true);
  assert.equal(result.issuedCount, 1);
  assert.equal(result.deliveredCount, 0);
  assert.equal(result.expiresAt.getTime() - Date.now() <= FIRST_ACCESS_TOKEN_TTL_MS, true);
  assert.equal(state.tokens[0].usedAt instanceof Date, true);
  assert.equal(state.tokens.length, 2);
  assert.notEqual(state.tokens[1].tokenHash, "old-hash");
  assert.equal(JSON.stringify(result).includes("token"), false);
  assert.equal(JSON.stringify(state.events).includes(state.tokens[1].tokenHash), false);
});

test("prepare first access preserves tenant isolation and skips users with existing password", async () => {
  const { prisma } = makePrisma();
  const missing = await prepareFirstAccessForUsers({
    prisma,
    clientId: "11111111-1111-4111-8111-111111111111",
    userIds: ["other-tenant"],
    requestId: "test-missing",
  });
  assert.deepEqual(missing, {
    ok: false,
    reason: "user_not_found",
    requestedCount: 1,
    missingCount: 1,
  });

  const result = await prepareFirstAccessForUsers({
    prisma,
    clientId: "11111111-1111-4111-8111-111111111111",
    userIds: ["user-2"],
    requestId: "test-skip",
  });
  assert.equal(result.ok, true);
  assert.equal(result.issuedCount, 0);
  assert.equal(result.skippedPasswordConfiguredCount, 1);
});
