import assert from "node:assert/strict";
import test from "node:test";
import type { TenantConfig } from "../config/tenantConfig.js";
import { buildChannelAccountMigrationPlan, normalizeChannelAccountTenantSelection, sanitizedMigrationItem, type ChannelAccountPlanDocument, type ExistingMetaAccount } from "./channelAccountMigrationPlan.js";

const sourceSha = "a".repeat(64);
const flags = { enabled: true, automationEnabled: true, runtimeEnabled: true, inboundPersistenceEnabled: true, outboundEnabled: true, aiEnabled: false, handoffEnabled: true, status: "connected" as const, tokenStatus: "configured" as const };
function tenant(key: string, phone = ""): TenantConfig { return { id: key, name: key, metaPhoneNumberId: phone, allowlist: [], handoffAttendantWaid: "", defaultLanguage: "pt_BR" }; }
function account(key: string, phone: string) { return { id: `account-${key}`, tenantKey: key, channel: "whatsapp" as const, provider: "meta" as const, channelAccountId: phone, ...flags }; }
function setup(tenants: Record<string, TenantConfig>, planned = Object.keys(tenants).filter((key) => tenants[key].metaPhoneNumberId)) {
  const clients = [...new Set([...Object.keys(tenants), ...planned])].map((clientKey, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, clientKey }));
  const planDocument: ChannelAccountPlanDocument = { schemaVersion: 1, sourceSha256: sourceSha, tenants: Object.fromEntries(planned.map((key) => [key, { provenance: "HISTORICAL_SOURCE", channelAccounts: [account(key, tenants[key]?.metaPhoneNumberId || `phone-${key}`)] }])) };
  const existingMetaAccounts: ExistingMetaAccount[] = [];
  return { tenants, planDocument, expectedSourceSha256: sourceSha, clients, phoneNumbers: clients.filter((client) => planDocument.tenants[client.clientKey]).map((client) => ({ clientId: client.id, phoneNumberId: planDocument.tenants[client.clientKey].channelAccounts[0].channelAccountId })), metaConfigs: [], existingMetaAccounts };
}

test("mixed Meta and Web Session creates only explicit Meta plan", () => { const plan = buildChannelAccountMigrationPlan(setup({ meta: tenant("meta", "phone-meta"), web: tenant("web") })); assert.equal(plan.metaTenantCount, 1); assert.deepEqual(plan.webSessionOnlyTenants, ["web"]); });
test("seven Meta tenants without plan are all denied", () => { const tenants = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`meta-${i}`, tenant(`meta-${i}`, `phone-${i}`)])); assert.throws(() => buildChannelAccountMigrationPlan(setup(tenants, [])), (error) => ((error as Error).message.match(/CHANNEL_ACCOUNT_PLAN_INCOMPLETE/g) ?? []).length === 7); });
test("plan bound to wrong source SHA is denied", () => { const value = setup({ meta: tenant("meta", "phone") }); value.planDocument.sourceSha256 = "b".repeat(64); assert.throws(() => buildChannelAccountMigrationPlan(value), /CHANNEL_ACCOUNT_PLAN_SOURCE_SHA256_MISMATCH/); });
test("plan exchanged between sources is denied", () => { const value = setup({ meta: tenant("meta", "phone") }); value.expectedSourceSha256 = "c".repeat(64); assert.throws(() => buildChannelAccountMigrationPlan(value), /CHANNEL_ACCOUNT_PLAN_SOURCE_SHA256_MISMATCH/); });
test("CRA requires explicit owner-authorized DB provenance", () => { const value = setup({}, ["cra-pr"]); assert.throws(() => buildChannelAccountMigrationPlan(value), /CRA_CHANNEL_ACCOUNT_PROVENANCE_DENY/); value.planDocument.tenants["cra-pr"].provenance = "OWNER_AUTHORIZED_DB_IDENTITY"; assert.equal(buildChannelAccountMigrationPlan(value).items[0].tenantKey, "cra-pr"); });
test("duplicate channelAccountId between tenants is denied", () => { const value = setup({ one: tenant("one", "shared"), two: tenant("two", "shared") }); value.planDocument.tenants.two.channelAccounts[0].channelAccountId = "shared"; assert.throws(() => buildChannelAccountMigrationPlan(value), /CHANNEL_ACCOUNT_GLOBAL_IDENTITY_COLLISION/); });
test("alias colliding with another tenant is denied", () => { const value = setup({ one: tenant("one", "p1"), two: tenant("two", "p2") }); value.planDocument.tenants.one.channelAccounts[0].externalAccountIds = ["p2"]; assert.throws(() => buildChannelAccountMigrationPlan(value), /CHANNEL_ACCOUNT_GLOBAL_IDENTITY_COLLISION/); });
test("global collision with account outside batch is denied", () => { const value = setup({ one: tenant("one", "p1") }); value.existingMetaAccounts.push({ clientId: "outside", clientKey: "outside", channelAccountId: "outside-primary", aliases: ["p1"] }); assert.throws(() => buildChannelAccountMigrationPlan(value), /CHANNEL_ACCOUNT_GLOBAL_IDENTITY_COLLISION/); });
test("invalid status and tokenStatus are denied", () => { const status = setup({ meta: tenant("meta", "phone") }); (status.planDocument.tenants.meta.channelAccounts[0] as unknown as { status: string }).status = "raw"; assert.throws(() => buildChannelAccountMigrationPlan(status), /CHANNEL_ACCOUNT_STATUS_INVALID/); const token = setup({ meta: tenant("meta", "phone") }); (token.planDocument.tenants.meta.channelAccounts[0] as unknown as { tokenStatus: string }).tokenStatus = "raw"; assert.throws(() => buildChannelAccountMigrationPlan(token), /CHANNEL_ACCOUNT_TOKEN_STATUS_INVALID/); });
test("sanitized report contains no full identity or secret", () => { const value = setup({ meta: tenant("meta", "phone-secret") }); value.planDocument.tenants.meta.channelAccounts[0].pageAccessToken = "top-secret"; const serialized = JSON.stringify(sanitizedMigrationItem(buildChannelAccountMigrationPlan(value).items[0], "would_create")); assert.equal(serialized.includes("phone-secret"), false); assert.equal(serialized.includes("top-secret"), false); });

test("repeated tenant selection is sorted and selected Meta tenants do not require plans for omitted tenants", () => {
  const value = setup({
    "tendencia-modas": tenant("tendencia-modas", "phone-tendencia"),
    "justa-advocacia": tenant("justa-advocacia", "phone-justa"),
    "omitted-meta": tenant("omitted-meta", "phone-omitted"),
  }, ["tendencia-modas", "justa-advocacia", "cra-pr"]);
  value.planDocument.tenants["cra-pr"].provenance = "OWNER_AUTHORIZED_DB_IDENTITY";
  const plan = buildChannelAccountMigrationPlan({
    ...value,
    selectedTenants: normalizeChannelAccountTenantSelection(["tendencia-modas", "cra-pr", "justa-advocacia"]),
  });
  assert.deepEqual(plan.items.map((item) => item.tenantKey), ["cra-pr", "justa-advocacia", "tendencia-modas"]);
  assert.equal(plan.metaTenantCount, 3);
  assert.equal(plan.items.some((item) => item.tenantKey === "omitted-meta"), false);
  assert.throws(() => buildChannelAccountMigrationPlan(value), /CHANNEL_ACCOUNT_PLAN_INCOMPLETE:omitted-meta/);
});

test("tenant selection denies empty, duplicate, unknown and unauthorized CRA selectors", () => {
  assert.throws(() => normalizeChannelAccountTenantSelection([]), /CHANNEL_ACCOUNT_TENANT_SELECTOR_EMPTY/);
  assert.throws(() => normalizeChannelAccountTenantSelection(["justa-advocacia", "justa-advocacia"]), /CHANNEL_ACCOUNT_TENANT_SELECTOR_DUPLICATE:justa-advocacia/);
  const value = setup({ "justa-advocacia": tenant("justa-advocacia", "phone-justa") });
  assert.throws(() => buildChannelAccountMigrationPlan({ ...value, selectedTenants: ["unknown"] }), /CHANNEL_ACCOUNT_SOURCE_TENANT_MISSING:unknown/);
  value.planDocument.tenants["cra-pr"] = { provenance: "HISTORICAL_SOURCE", channelAccounts: [account("cra-pr", "phone-cra")] };
  assert.throws(() => buildChannelAccountMigrationPlan({ ...value, selectedTenants: ["cra-pr"] }), /CRA_CHANNEL_ACCOUNT_PROVENANCE_DENY:cra-pr/);
});
