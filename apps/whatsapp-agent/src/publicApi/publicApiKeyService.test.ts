import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  checkPublicApiRateLimit,
  generatePublicApiKeySecret,
  getPublicApiKeyPrefix,
  hashPublicApiKey,
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
