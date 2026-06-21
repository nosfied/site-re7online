import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  checkPublicApiRateLimit,
  generatePublicApiKeySecret,
  getPublicApiKeyPrefix,
  hashPublicApiKey,
  authenticatePublicApiRequest,
  normalizePublicApiScopes,
  type PublicApiAuth,
} from "./publicApiKeyService.js";

function auth(overrides: Partial<PublicApiAuth> = {}): PublicApiAuth {
  return {
    apiKeyId: `key_${crypto.randomUUID()}`,
    clientId: "client_a",
    clientKey: "tenant-a",
    tenantName: "Tenant A",
    keyPrefix: "cvt_live_abcd1234",
    scopes: ["read"],
    rateLimitPerMinute: 2,
    ...overrides,
  };
}

test("normalizePublicApiScopes keeps only known unique scopes", () => {
  assert.deepEqual(
    normalizePublicApiScopes(["read", "READ", "messages", "unknown", "", "contacts"]),
    ["read", "messages", "contacts"]
  );
});

test("generated public API key has stable prefix and hash does not expose the secret", () => {
  const secret = generatePublicApiKeySecret();
  const prefix = getPublicApiKeyPrefix(secret);
  const hash = hashPublicApiKey(secret);

  assert.equal(secret.startsWith("cvt_live_"), true);
  assert.equal(prefix.startsWith("cvt_live_"), true);
  assert.equal(prefix.length < secret.length, true);
  assert.equal(hash.includes(secret), false);
  assert.equal(hash.length, 64);
});

test("checkPublicApiRateLimit limits by API key bucket", () => {
  const activeAuth = auth({ apiKeyId: "key_rate_limit_test" });

  const first = checkPublicApiRateLimit(activeAuth);
  const second = checkPublicApiRateLimit(activeAuth);
  const third = checkPublicApiRateLimit(activeAuth);

  assert.equal(first.limited, false);
  assert.equal(second.limited, false);
  assert.equal(third.limited, true);
  assert.equal(third.retryAfterSec >= 1, true);
});

function reqWithToken(token?: string) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as never;
}

function publicApiPrismaMock(key: Record<string, unknown> | null) {
  const calls: string[] = [];
  return {
    calls,
    publicApiKey: {
      findUnique: async () => key,
      update: async () => {
        calls.push("publicApiKey.update");
        return key;
      },
    },
    event: {
      create: async () => {
        calls.push("event.create");
      },
    },
  };
}

function publicApiKey(overrides: Record<string, unknown> = {}) {
  return {
    id: "api_key_1",
    clientId: "client_a",
    keyPrefix: "cvt_live_abcd1234",
    scopes: ["read", "contacts"],
    status: "active",
    expiresAt: null,
    rateLimitPerMinute: 120,
    client: {
      id: "client_a",
      clientKey: "tenant-a",
      name: "Tenant A",
      status: "ACTIVE",
    },
    ...overrides,
  };
}

test("authenticatePublicApiRequest rejects missing token", async () => {
  const prisma = publicApiPrismaMock(null);
  const result = await authenticatePublicApiRequest({
    prisma: prisma as never,
    req: reqWithToken(),
    requestId: "req_missing",
    requiredScopes: ["read", "contacts"],
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.reason, "missing_key");
});

test("authenticatePublicApiRequest rejects revoked keys", async () => {
  const prisma = publicApiPrismaMock(publicApiKey({ status: "revoked" }));
  const result = await authenticatePublicApiRequest({
    prisma: prisma as never,
    req: reqWithToken(generatePublicApiKeySecret()),
    requestId: "req_revoked",
    requiredScopes: ["read", "contacts"],
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.reason, "key_revoked");
  assert.equal(prisma.calls.includes("event.create"), true);
});

test("authenticatePublicApiRequest rejects keys without required scopes", async () => {
  const prisma = publicApiPrismaMock(publicApiKey({ scopes: ["read"] }));
  const result = await authenticatePublicApiRequest({
    prisma: prisma as never,
    req: reqWithToken(generatePublicApiKeySecret()),
    requestId: "req_scope",
    requiredScopes: ["read", "contacts"],
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.reason, "insufficient_scope");
  assert.equal(prisma.calls.includes("event.create"), true);
});

test("authenticatePublicApiRequest accepts scoped active key and updates lastUsedAt", async () => {
  const prisma = publicApiPrismaMock(publicApiKey());
  const result = await authenticatePublicApiRequest({
    prisma: prisma as never,
    req: reqWithToken(generatePublicApiKeySecret()),
    requestId: "req_ok",
    requiredScopes: ["read", "contacts"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.auth.clientId, "client_a");
  assert.deepEqual(result.auth.scopes, ["read", "contacts"]);
  assert.equal(prisma.calls.includes("publicApiKey.update"), true);
});
