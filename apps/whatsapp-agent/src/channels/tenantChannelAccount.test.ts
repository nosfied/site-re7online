import test from "node:test";
import assert from "node:assert/strict";
import {
  findTenantChannelAccount,
  isChannelAiEnabled,
  isChannelAutomationEnabled,
  isChannelHandoffEnabled,
  listEnabledTenantChannels,
  normalizeTenantChannelAccountsForTenant,
  normalizeTenantChannelAccount,
  validateTenantChannelAccount,
} from "./tenantChannelAccount.js";

test("normalizeTenantChannelAccount accepts valid account", () => {
  const account = normalizeTenantChannelAccount({
    id: " Tendência Conta! ",
    tenantKey: "tendencia-modas",
    channel: "instagram",
    provider: "meta",
    displayName: "  Instagram Principal  ",
    channelAccountId: " ig_123 ",
    externalBusinessId: " business_123 ",
    enabled: true,
    automationEnabled: true,
    aiEnabled: true,
    handoffEnabled: true,
    status: "connected",
    tokenStatus: "configured",
    token: "secret",
    accessToken: "secret",
    pageAccessToken: "secret",
    longLivedToken: "secret",
    businessToken: "secret",
  });

  assert.equal(account?.id, "TendnciaConta");
  assert.equal(account?.tenantKey, "tendencia-modas");
  assert.equal(account?.displayName, "Instagram Principal");
  assert.equal(account?.channelAccountId, "ig_123");
  assert.equal(account?.externalBusinessId, "business_123");
  assert.equal(account?.enabled, true);
  assert.equal(account?.automationEnabled, true);
  assert.equal(account?.aiEnabled, true);
  assert.equal(account?.handoffEnabled, true);
  assert.equal("token" in (account ?? {}), false);
  assert.equal("accessToken" in (account ?? {}), false);
  assert.equal("pageAccessToken" in (account ?? {}), false);
  assert.equal("longLivedToken" in (account ?? {}), false);
  assert.equal("businessToken" in (account ?? {}), false);
});

test("normalizeTenantChannelAccount rejects missing tenantKey or channelAccountId", () => {
  assert.equal(
    normalizeTenantChannelAccount({
      channel: "whatsapp",
      provider: "meta",
      channelAccountId: "phone-1",
    }),
    null
  );
  assert.equal(
    normalizeTenantChannelAccount({
      tenantKey: "tenant-a",
      channel: "whatsapp",
      provider: "meta",
    }),
    null
  );
  assert.throws(
    () =>
      validateTenantChannelAccount({
        tenantKey: "tenant-a",
        channel: "whatsapp",
        provider: "meta",
      }),
    /tenant_channel_account_invalid/
  );
});

test("normalizeTenantChannelAccount defaults disabled flags safely", () => {
  const account = validateTenantChannelAccount({
    tenantKey: "tenant-a",
    channel: "whatsapp",
    provider: "meta",
    channelAccountId: "phone-1",
  });

  assert.equal(account.enabled, false);
  assert.equal(account.automationEnabled, false);
  assert.equal(account.aiEnabled, false);
  assert.equal(account.handoffEnabled, false);
  assert.equal(account.status, "disabled");
  assert.equal(account.tokenStatus, "missing");
  assert.equal(isChannelAutomationEnabled(account), false);
  assert.equal(isChannelAiEnabled(account), false);
  assert.equal(isChannelHandoffEnabled(account), false);
});

test("enabled account gates automation, AI and handoff independently", () => {
  const disabled = validateTenantChannelAccount({
    tenantKey: "tenant-a",
    channel: "whatsapp",
    provider: "meta",
    channelAccountId: "phone-1",
    enabled: false,
    automationEnabled: true,
    aiEnabled: true,
    handoffEnabled: true,
  });
  const enabled = validateTenantChannelAccount({
    tenantKey: "tenant-a",
    channel: "whatsapp",
    provider: "meta",
    channelAccountId: "phone-1",
    enabled: true,
    automationEnabled: true,
    aiEnabled: true,
    handoffEnabled: true,
  });

  assert.equal(isChannelAutomationEnabled(disabled), false);
  assert.equal(isChannelAiEnabled(disabled), false);
  assert.equal(isChannelHandoffEnabled(disabled), false);
  assert.equal(isChannelAutomationEnabled(enabled), true);
  assert.equal(isChannelAiEnabled(enabled), true);
  assert.equal(isChannelHandoffEnabled(enabled), true);
});

test("findTenantChannelAccount scopes by tenant, channel, provider and account", () => {
  const accounts = [
    validateTenantChannelAccount({
      tenantKey: "tenant-a",
      channel: "instagram",
      provider: "meta",
      channelAccountId: "account-1",
      enabled: true,
    }),
    validateTenantChannelAccount({
      tenantKey: "tenant-b",
      channel: "instagram",
      provider: "meta",
      channelAccountId: "account-1",
      enabled: true,
    }),
  ];

  assert.equal(
    findTenantChannelAccount(accounts, {
      tenantKey: "tenant-b",
      channel: "instagram",
      provider: "meta",
      channelAccountId: "account-1",
    })?.tenantKey,
    "tenant-b"
  );
});

test("listEnabledTenantChannels returns only enabled accounts", () => {
  const accounts = [
    validateTenantChannelAccount({
      tenantKey: "tenant-a",
      channel: "whatsapp",
      provider: "meta",
      channelAccountId: "phone-1",
      enabled: true,
    }),
    validateTenantChannelAccount({
      tenantKey: "tenant-a",
      channel: "instagram",
      provider: "meta",
      channelAccountId: "ig-1",
      enabled: false,
    }),
    validateTenantChannelAccount({
      tenantKey: "tenant-b",
      channel: "messenger",
      provider: "meta",
      channelAccountId: "page-1",
      enabled: true,
    }),
  ];

  assert.deepEqual(
    listEnabledTenantChannels(accounts, "tenant-a").map((account) => account.channel),
    ["whatsapp"]
  );
  assert.equal(listEnabledTenantChannels(accounts).length, 2);
});

test("normalizeTenantChannelAccountsForTenant keeps missing config absent", () => {
  assert.equal(normalizeTenantChannelAccountsForTenant(undefined, "tenant-a"), undefined);
});

test("normalizeTenantChannelAccountsForTenant coerces divergent tenantKey and dedupes", () => {
  const accounts = normalizeTenantChannelAccountsForTenant(
    [
      {
        tenantKey: "wrong-tenant",
        channel: "instagram",
        provider: "meta",
        channelAccountId: "account-1",
        enabled: true,
        token: "secret",
      },
      {
        tenantKey: "tenant-a",
        channel: "instagram",
        provider: "meta",
        channelAccountId: "account-1",
        enabled: true,
      },
      {
        tenantKey: "tenant-a",
        channel: "instagram",
        provider: "meta",
      },
    ],
    "tenant-a"
  );

  assert.equal(accounts?.length, 1);
  assert.equal(accounts?.[0]?.tenantKey, "tenant-a");
  assert.equal(accounts?.[0]?.channelAccountId, "account-1");
  assert.equal("token" in (accounts?.[0] ?? {}), false);
});
