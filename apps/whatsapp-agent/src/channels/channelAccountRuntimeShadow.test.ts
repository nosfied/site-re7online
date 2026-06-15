import test from "node:test";
import assert from "node:assert/strict";
import {
  compareChannelAccountRuntimeShadow,
  resolveDbChannelAccountShadow,
} from "./channelAccountRuntimeShadow.js";
import type { ResolvedTenantChannelAccount } from "./tenantChannelResolution.js";

function dbAccount(overrides: Record<string, unknown> = {}) {
  return {
    channel: "instagram",
    provider: "meta",
    channelAccountId: "ig-graph",
    displayName: "Instagram",
    externalAccountIds: ["ig-webhook"],
    externalBusinessId: null,
    metadata: { source: "instagram_business_login" },
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
    aliases: [{ alias: "ig-webhook" }],
    secrets: [
      {
        secretKind: "instagramBusinessAccessToken",
        secretHash: "930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94",
        status: "configured",
      },
    ],
    ...overrides,
  };
}

function jsonResolution(overrides: Partial<ResolvedTenantChannelAccount> = {}): ResolvedTenantChannelAccount {
  return {
    tenantKey: "re7online",
    resolution: "matched_alias",
    account: {
      id: "ig-account",
      tenantKey: "re7online",
      channel: "instagram",
      provider: "meta",
      channelAccountId: "ig-graph",
      displayName: "Instagram",
      externalAccountIds: ["ig-webhook"],
      metadata: { source: "instagram_business_login" },
      enabled: true,
      automationEnabled: false,
      runtimeEnabled: true,
      inboundPersistenceEnabled: true,
      outboundEnabled: true,
      aiEnabled: false,
      handoffEnabled: false,
      status: "connected",
      tokenStatus: "configured",
      instagramBusinessAccessToken: "secret-token",
    },
    ...overrides,
  };
}

test("resolveDbChannelAccountShadow returns matched_alias for alias match", () => {
  const result = resolveDbChannelAccountShadow({
    accounts: [dbAccount()],
    channelAccountId: "ig-webhook",
  });

  assert.equal(result.resolution, "matched_alias");
  assert.equal(result.tenantKey, "re7online");
  assert.equal(result.account?.channelAccountId, "ig-graph");
});

test("compareChannelAccountRuntimeShadow returns no mismatch for equivalent JSON and DB", () => {
  const dbResolution = resolveDbChannelAccountShadow({
    accounts: [dbAccount()],
    channelAccountId: "ig-webhook",
  });
  const result = compareChannelAccountRuntimeShadow({
    jsonResolution: jsonResolution(),
    dbResolution,
  });

  assert.deepEqual(result.mismatchFields, []);
});

test("compareChannelAccountRuntimeShadow detects tenant mismatch", () => {
  const dbResolution = resolveDbChannelAccountShadow({
    accounts: [dbAccount({ client: { clientKey: "other-tenant" } })],
    channelAccountId: "ig-webhook",
  });
  const result = compareChannelAccountRuntimeShadow({
    jsonResolution: jsonResolution(),
    dbResolution,
  });

  assert.equal(result.mismatchFields.includes("tenantKey"), true);
});

test("compareChannelAccountRuntimeShadow detects alias mismatch", () => {
  const dbResolution = resolveDbChannelAccountShadow({
    accounts: [dbAccount({ aliases: [{ alias: "ig-webhook" }, { alias: "extra-alias" }] })],
    channelAccountId: "ig-webhook",
  });
  const result = compareChannelAccountRuntimeShadow({
    jsonResolution: jsonResolution(),
    dbResolution,
  });

  assert.equal(result.mismatchFields.includes("aliases"), true);
});

test("compareChannelAccountRuntimeShadow detects missing DB account", () => {
  const result = compareChannelAccountRuntimeShadow({
    jsonResolution: jsonResolution(),
    dbResolution: { resolution: "not_found" },
  });

  assert.equal(result.mismatchFields.includes("resolution"), true);
  assert.equal(result.mismatchFields.includes("tenantKey"), true);
  assert.equal(result.mismatchFields.includes("missingDbAccount"), true);
});

test("compareChannelAccountRuntimeShadow reports token mismatch by hash only", () => {
  const dbResolution = resolveDbChannelAccountShadow({
    accounts: [
      dbAccount({
        secrets: [
          {
            secretKind: "instagramBusinessAccessToken",
            secretHash: "different-hash",
            status: "configured",
          },
        ],
      }),
    ],
    channelAccountId: "ig-webhook",
  });
  const result = compareChannelAccountRuntimeShadow({
    jsonResolution: jsonResolution(),
    dbResolution,
  });

  assert.deepEqual(result.mismatchFields, ["secretHash:instagramBusinessAccessToken"]);
  assert.equal(JSON.stringify(result).includes("secret-token"), false);
});
