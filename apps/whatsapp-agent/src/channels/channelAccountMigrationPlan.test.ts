import assert from "node:assert/strict";
import test from "node:test";
import type { TenantConfig } from "../config/tenantConfig.js";
import { buildChannelAccountMigrationPlan, sanitizedMigrationItem } from "./channelAccountMigrationPlan.js";

const flags = { enabled: true, automationEnabled: true, runtimeEnabled: true, inboundPersistenceEnabled: true, outboundEnabled: true, aiEnabled: false, handoffEnabled: true };
function tenant(key: string, phone = "", withPlan = false): TenantConfig {
  return { id: key, name: key, metaPhoneNumberId: phone, allowlist: [], handoffAttendantWaid: "", defaultLanguage: "pt_BR", ...(withPlan ? { channelAccounts: [{ id: `account-${key}`, tenantKey: key, channel: "whatsapp", provider: "meta", channelAccountId: phone, ...flags, status: "connected", tokenStatus: "configured" }] } : {}) };
}
function input(tenants: Record<string, TenantConfig>) {
  const clients = Object.keys(tenants).map((clientKey, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, clientKey }));
  return { tenants, clients, phoneNumbers: clients.map((client, index) => ({ clientId: client.id, phoneNumberId: tenants[client.clientKey].metaPhoneNumberId || `unused-${index}` })).filter((row) => !row.phoneNumberId.startsWith("unused")), metaConfigs: [] };
}

test("mixed Meta and Web Session creates only authenticated Meta plan", () => {
  const params = input({ meta: tenant("meta", "phone-meta", true), web: tenant("web") });
  const plan = buildChannelAccountMigrationPlan(params);
  assert.equal(plan.metaTenantCount, 1); assert.deepEqual(plan.webSessionOnlyTenants, ["web"]); assert.equal(plan.items[0].tenantKey, "meta");
});

test("seven Meta tenants without ChannelAccount contract are denied", () => {
  const tenants = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`meta-${i}`, tenant(`meta-${i}`, `phone-${i}`)]));
  assert.throws(() => buildChannelAccountMigrationPlan(input(tenants)), (error) => {
    const message = (error as Error).message;
    assert.equal((message.match(/CHANNEL_ACCOUNT_PLAN_INCOMPLETE/g) ?? []).length, 7);
    return true;
  });
});

test("Web Session-only tenant receives no Meta account", () => {
  const plan = buildChannelAccountMigrationPlan(input({ web: tenant("web") }));
  assert.equal(plan.items.length, 0); assert.equal(plan.webSessionOnlyCount, 1);
});

test("missing Client denies whole plan", () => {
  const params = input({ one: tenant("one", "p1", true), two: tenant("two", "p2", true) }); params.clients.pop(); params.phoneNumbers.pop();
  assert.throws(() => buildChannelAccountMigrationPlan(params), /CHANNEL_ACCOUNT_CLIENT_MISSING:two/);
});

test("divergent phone identity denies whole plan", () => {
  const params = input({ meta: tenant("meta", "expected", true) }); params.phoneNumbers[0].phoneNumberId = "different";
  assert.throws(() => buildChannelAccountMigrationPlan(params), /CHANNEL_ACCOUNT_PHONE_IDENTITY_MISMATCH/);
});

test("incomplete flags never receive silent defaults", () => {
  const value = tenant("meta", "phone", true); delete (value.channelAccounts![0] as unknown as Record<string, unknown>).outboundEnabled;
  assert.throws(() => buildChannelAccountMigrationPlan(input({ meta: value })), /CHANNEL_ACCOUNT_PLAN_INCOMPLETE/);
});

test("CRA without authenticated source is denied separately", () => {
  assert.throws(() => buildChannelAccountMigrationPlan({ ...input({ web: tenant("web") }), selectedTenant: "cra-pr" }), /CRA_CHANNEL_ACCOUNT_SOURCE_UNRESOLVED/);
});

test("sanitized report contains neither complete identity nor secrets", () => {
  const value = tenant("meta", "phone-secret", true); value.channelAccounts![0].pageAccessToken = "top-secret-token";
  const plan = buildChannelAccountMigrationPlan(input({ meta: value })); const serialized = JSON.stringify(sanitizedMigrationItem(plan.items[0], "would_create"));
  assert.equal(serialized.includes("phone-secret"), false); assert.equal(serialized.includes("top-secret-token"), false); assert.match(serialized, /identitySha256/);
});

test("unrelated Messenger and Instagram source accounts do not enter Meta plan", () => {
  const value = tenant("meta", "phone", true); value.channelAccounts!.push({ id: "messenger", tenantKey: "meta", channel: "messenger", provider: "meta", channelAccountId: "page", enabled: true });
  const plan = buildChannelAccountMigrationPlan(input({ meta: value })); assert.equal(plan.items.length, 1); assert.equal(plan.items[0].account.channel, "whatsapp");
});
