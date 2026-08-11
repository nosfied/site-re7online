import test from "node:test";
import assert from "node:assert/strict";
import {
  findTenantChannelAccount,
  isChannelAiEnabled,
  isChannelAutomationEnabled,
  isChannelHandoffEnabled,
  listEnabledTenantChannels,
  canRunChannelRuntime,
  canSendChannelOutbound,
  canPersistChannelInbound,
  canSendMessengerOutbound,
  canUseChannelAi,
  canUseChannelHandoff,
  normalizeTenantChannelAccountsForTenant,
  normalizeTenantChannelAccount,
  redactTenantChannelAccount,
  resolveChannelRuntimeGate,
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
    runtimeEnabled: true,
    inboundPersistenceEnabled: true,
    outboundEnabled: true,
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
  assert.deepEqual(account?.externalAccountIds, undefined);
  assert.equal(account?.externalBusinessId, "business_123");
  assert.equal(account?.enabled, true);
  assert.equal(account?.automationEnabled, true);
  assert.equal(account?.runtimeEnabled, true);
  assert.equal(account?.inboundPersistenceEnabled, true);
  assert.equal(account?.outboundEnabled, true);
  assert.equal(account?.aiEnabled, true);
  assert.equal(account?.handoffEnabled, true);
  assert.equal(account?.pageAccessToken, "secret");
  assert.equal(account?.tokenStatus, "configured");
  assert.equal("token" in (account ?? {}), false);
  assert.equal("accessToken" in (account ?? {}), false);
  assert.equal("longLivedToken" in (account ?? {}), false);
  assert.equal("businessToken" in (account ?? {}), false);
  assert.equal("pageAccessToken" in redactTenantChannelAccount(account!), false);
});

test("normalizeTenantChannelAccount accepts safe aliases and metadata", () => {
  const account = normalizeTenantChannelAccount({
    tenantKey: "tenant-a",
    channel: "instagram",
    provider: "meta",
    channelAccountId: "graph-account-1",
    externalAccountIds: [" webhook-account-1 ", "webhook-account-1", "bad id!"],
    metadata: {
      graphAccountId: " graph-account-1 ",
      webhookAccountId: " webhook-account-1 ",
      unsafe: { nested: true },
    },
    enabled: true,
  });

  assert.deepEqual(account?.externalAccountIds, ["webhook-account-1", "badid"]);
  assert.deepEqual(account?.metadata, {
    graphAccountId: "graph-account-1",
    webhookAccountId: "webhook-account-1",
  });
  assert.equal("pageAccessToken" in redactTenantChannelAccount(account!), false);
  assert.deepEqual(redactTenantChannelAccount(account!).externalAccountIds, ["webhook-account-1", "badid"]);
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
  assert.equal(account.runtimeEnabled, false);
  assert.equal(account.inboundPersistenceEnabled, false);
  assert.equal(account.outboundEnabled, false);
  assert.equal(account.aiEnabled, false);
  assert.equal(account.handoffEnabled, false);
  assert.equal(account.status, "disabled");
  assert.equal(account.tokenStatus, "missing");
  assert.equal(isChannelAutomationEnabled(account), false);
  assert.equal(canRunChannelRuntime(account), false);
  assert.equal(canPersistChannelInbound(account), false);
  assert.equal(canSendChannelOutbound(account), false);
  assert.equal(isChannelAiEnabled(account), false);
  assert.equal(isChannelHandoffEnabled(account), false);
});

test("normalizeTenantChannelAccount allows only WhatsApp web_session as disabled future transport", () => {
  const account = validateTenantChannelAccount({
    tenantKey: "tenant-a",
    channel: "whatsapp",
    provider: "web_session",
    channelAccountId: "session-1",
  });

  assert.equal(account.provider, "web_session");
  assert.equal(account.channel, "whatsapp");
  assert.equal(account.enabled, false);
  assert.equal(account.runtimeEnabled, false);
  assert.equal(account.outboundEnabled, false);
  assert.equal(canRunChannelRuntime(account), false);
  assert.equal(canSendChannelOutbound(account), false);
  assert.equal(
    normalizeTenantChannelAccount({
      tenantKey: "tenant-a",
      channel: "instagram",
      provider: "web_session",
      channelAccountId: "session-1",
    }),
    null
  );
});

test("enabled account gates automation, AI and handoff independently", () => {
  const disabled = validateTenantChannelAccount({
    tenantKey: "tenant-a",
    channel: "whatsapp",
    provider: "meta",
    channelAccountId: "phone-1",
    enabled: false,
    automationEnabled: true,
    runtimeEnabled: true,
    inboundPersistenceEnabled: true,
    outboundEnabled: true,
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
    runtimeEnabled: true,
    inboundPersistenceEnabled: true,
    outboundEnabled: true,
    aiEnabled: true,
    handoffEnabled: true,
  });

  assert.equal(isChannelAutomationEnabled(disabled), false);
  assert.equal(isChannelAiEnabled(disabled), false);
  assert.equal(isChannelHandoffEnabled(disabled), false);
  assert.equal(isChannelAutomationEnabled(enabled), true);
  assert.equal(canRunChannelRuntime(enabled), true);
  assert.equal(canPersistChannelInbound(enabled), true);
  assert.equal(canSendChannelOutbound(enabled), true);
  assert.equal(canUseChannelAi(enabled), true);
  assert.equal(canUseChannelHandoff(enabled), true);
  assert.equal(isChannelAiEnabled(enabled), true);
  assert.equal(isChannelHandoffEnabled(enabled), true);
});

test("resolveChannelRuntimeGate blocks safely by default and reports flag permissions", () => {
  assert.deepEqual(resolveChannelRuntimeGate(null), {
    allowed: false,
    reason: "account_missing",
    outboundAllowed: false,
    aiAllowed: false,
    handoffAllowed: false,
  });

  const disabled = validateTenantChannelAccount({
    tenantKey: "tenant-a",
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
    enabled: false,
    automationEnabled: true,
    runtimeEnabled: true,
    outboundEnabled: true,
    aiEnabled: true,
    handoffEnabled: true,
  });
  assert.equal(resolveChannelRuntimeGate(disabled).reason, "channel_disabled");
  assert.equal(resolveChannelRuntimeGate(disabled).allowed, false);
  assert.equal(resolveChannelRuntimeGate(disabled).outboundAllowed, false);

  const automationDisabled = validateTenantChannelAccount({
    tenantKey: "tenant-a",
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
    enabled: true,
    automationEnabled: false,
    runtimeEnabled: true,
  });
  assert.equal(resolveChannelRuntimeGate(automationDisabled).reason, "automation_disabled");

  const runtimeDisabled = validateTenantChannelAccount({
    tenantKey: "tenant-a",
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
    enabled: true,
    automationEnabled: true,
    runtimeEnabled: false,
  });
  assert.equal(resolveChannelRuntimeGate(runtimeDisabled).reason, "runtime_disabled");
});

test("resolveChannelRuntimeGate allows runtime only with explicit runtime flag", () => {
  const account = validateTenantChannelAccount({
    tenantKey: "tenant-a",
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
    enabled: true,
    automationEnabled: true,
    runtimeEnabled: true,
    outboundEnabled: false,
    aiEnabled: true,
    handoffEnabled: false,
  });
  const gate = resolveChannelRuntimeGate(account);

  assert.deepEqual(gate, {
    allowed: true,
    reason: "runtime_allowed",
    outboundAllowed: false,
    aiAllowed: true,
    handoffAllowed: false,
  });
  assert.equal(canRunChannelRuntime(account), true);
  assert.equal(canSendChannelOutbound(account), false);
});

test("canSendMessengerOutbound requires runtime, inbound, outbound and configured token", () => {
  const blocked = validateTenantChannelAccount({
    tenantKey: "tenant-a",
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
    enabled: true,
    runtimeEnabled: true,
    inboundPersistenceEnabled: true,
    outboundEnabled: true,
    status: "connected",
    tokenStatus: "missing",
  });
  const allowed = validateTenantChannelAccount({
    ...blocked,
    tokenStatus: "configured",
    pageAccessToken: "page-token",
  });

  assert.equal(canSendMessengerOutbound(blocked), false);
  assert.equal(canSendMessengerOutbound(allowed), true);
});

test("normalizeTenantChannelAccountsForTenant preserves existing page token when omitted", () => {
  const existing = validateTenantChannelAccount({
    tenantKey: "tenant-a",
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
    pageAccessToken: "existing-token",
    tokenStatus: "configured",
  });
  const [updated] =
    normalizeTenantChannelAccountsForTenant(
      [
        {
          tenantKey: "tenant-a",
          channel: "messenger",
          provider: "meta",
          channelAccountId: "page-1",
          enabled: true,
          runtimeEnabled: true,
          inboundPersistenceEnabled: true,
          outboundEnabled: true,
          status: "connected",
        },
      ],
      "tenant-a",
      [existing]
    ) ?? [];

  assert.equal(updated?.pageAccessToken, "existing-token");
  assert.equal(updated?.tokenStatus, "configured");
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

test("findTenantChannelAccount resolves aliases within the same tenant only", () => {
  const accounts = [
    validateTenantChannelAccount({
      tenantKey: "tenant-a",
      channel: "instagram",
      provider: "meta",
      channelAccountId: "graph-a",
      externalAccountIds: ["webhook-a"],
      enabled: true,
    }),
    validateTenantChannelAccount({
      tenantKey: "tenant-b",
      channel: "instagram",
      provider: "meta",
      channelAccountId: "graph-b",
      externalAccountIds: ["webhook-a"],
      enabled: true,
    }),
  ];

  assert.equal(
    findTenantChannelAccount(accounts, {
      tenantKey: "tenant-a",
      channel: "instagram",
      provider: "meta",
      channelAccountId: "webhook-a",
    })?.channelAccountId,
    "graph-a"
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
