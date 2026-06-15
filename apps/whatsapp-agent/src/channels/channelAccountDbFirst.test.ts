import crypto from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  decryptChannelAccountSecret,
  findMessengerChannelAccountForConversationDbFirst,
  mapDbChannelAccountToTenantAccount,
  resolveDbTenantChannelAccount,
} from "./channelAccountDbFirst.js";

function encryptForTest(value: string, secret: string) {
  const key = crypto.createHash("sha256").update(secret, "utf8").digest();
  const iv = Buffer.alloc(12, 1);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

function dbAccount(overrides: Record<string, unknown> = {}) {
  return {
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
    displayName: "Facebook Page",
    externalAccountIds: [],
    externalBusinessId: null,
    metadata: { facebookPageId: "page-1" },
    enabled: true,
    automationEnabled: false,
    runtimeEnabled: true,
    inboundPersistenceEnabled: true,
    outboundEnabled: true,
    aiEnabled: false,
    handoffEnabled: false,
    status: "connected",
    tokenStatus: "configured",
    client: { clientKey: "re7online" },
    aliases: [],
    secrets: [],
    ...overrides,
  };
}

test("decryptChannelAccountSecret decrypts v1 ciphertext with stable env key", () => {
  const ciphertext = encryptForTest("page-token", "stable-secret-key");

  assert.equal(decryptChannelAccountSecret(ciphertext, "stable-secret-key"), "page-token");
  assert.equal(decryptChannelAccountSecret(ciphertext, "wrong-key"), null);
  assert.equal(ciphertext.includes("page-token"), false);
});

test("resolveDbTenantChannelAccount returns DB account for Messenger primary id", () => {
  const result = resolveDbTenantChannelAccount({
    accounts: [dbAccount()],
    channelAccountId: "page-1",
  });

  assert.equal(result.resolution, "matched_enabled");
  assert.equal(result.tenantKey, "re7online");
  assert.equal(result.account?.channel, "messenger");
  assert.equal(result.account?.channelAccountId, "page-1");
});

test("mapDbChannelAccountToTenantAccount includes decrypted page token only when requested", () => {
  const previous = process.env.CHANNEL_ACCOUNT_SECRET_KEY;
  process.env.CHANNEL_ACCOUNT_SECRET_KEY = "stable-secret-key";
  try {
    const account = dbAccount({
      secrets: [
        {
          secretKind: "pageAccessToken",
          secretCiphertext: encryptForTest("page-token", "stable-secret-key"),
          status: "configured",
        },
      ],
    });

    const withoutSecret = mapDbChannelAccountToTenantAccount({
      account,
      tenantKey: "re7online",
      includeSecrets: false,
    });
    const withSecret = mapDbChannelAccountToTenantAccount({
      account,
      tenantKey: "re7online",
      includeSecrets: true,
    });

    assert.equal(withoutSecret.pageAccessToken, undefined);
    assert.equal(withSecret.pageAccessToken, "page-token");
    assert.equal(JSON.stringify(withSecret).includes("secretCiphertext"), false);
  } finally {
    if (previous === undefined) delete process.env.CHANNEL_ACCOUNT_SECRET_KEY;
    else process.env.CHANNEL_ACCOUNT_SECRET_KEY = previous;
  }
});

test("findMessengerChannelAccountForConversationDbFirst maps first DB result and token", async () => {
  const previous = process.env.CHANNEL_ACCOUNT_SECRET_KEY;
  process.env.CHANNEL_ACCOUNT_SECRET_KEY = "stable-secret-key";
  try {
    const prisma = {
      channelAccount: {
        findFirst: async () =>
          dbAccount({
            secrets: [
              {
                secretKind: "pageAccessToken",
                secretCiphertext: encryptForTest("page-token", "stable-secret-key"),
                status: "configured",
              },
            ],
          }),
      },
    };

    const result = await findMessengerChannelAccountForConversationDbFirst({
      prisma: prisma as never,
      clientKey: "re7online",
      channelAccountId: "page-1",
      includeSecrets: true,
    });

    assert.equal(result?.tenantKey, "re7online");
    assert.equal(result?.pageAccessToken, "page-token");
  } finally {
    if (previous === undefined) delete process.env.CHANNEL_ACCOUNT_SECRET_KEY;
    else process.env.CHANNEL_ACCOUNT_SECRET_KEY = previous;
  }
});
