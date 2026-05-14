import test from "node:test";
import assert from "node:assert/strict";
import type { TenantConfigMap } from "../config/tenantConfig.js";
import { resolveTenantForChannelAccount } from "./tenantChannelResolution.js";

function tenantsWith(status: "connected" | "disabled" | "pending" | "error", enabled = status === "connected") {
  return {
    "tenant-a": {
      id: "tenant-a",
      name: "Tenant A",
      metaPhoneNumberId: "phone-tenant-a",
      allowlist: [],
      handoffAttendantWaid: "",
      defaultLanguage: "pt_BR",
      channelAccounts: [
        {
          id: "account-1",
          tenantKey: "tenant-a",
          channel: "messenger",
          provider: "meta",
          channelAccountId: "page-1",
          enabled,
          status,
        },
      ],
    },
  } satisfies TenantConfigMap;
}

test("resolveTenantForChannelAccount returns matched_enabled for connected enabled account", () => {
  const result = resolveTenantForChannelAccount({
    tenants: tenantsWith("connected"),
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
  });

  assert.equal(result.resolution, "matched_enabled");
  assert.equal(result.tenantKey, "tenant-a");
  assert.equal(result.account?.channelAccountId, "page-1");
});

test("resolveTenantForChannelAccount returns matched_disabled", () => {
  const result = resolveTenantForChannelAccount({
    tenants: tenantsWith("disabled", false),
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
  });

  assert.equal(result.resolution, "matched_disabled");
});

test("resolveTenantForChannelAccount returns matched_pending", () => {
  const result = resolveTenantForChannelAccount({
    tenants: tenantsWith("pending", true),
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
  });

  assert.equal(result.resolution, "matched_pending");
});

test("resolveTenantForChannelAccount returns matched_error", () => {
  const result = resolveTenantForChannelAccount({
    tenants: tenantsWith("error", true),
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
  });

  assert.equal(result.resolution, "matched_error");
});

test("resolveTenantForChannelAccount returns not_found", () => {
  const result = resolveTenantForChannelAccount({
    tenants: tenantsWith("connected"),
    channel: "messenger",
    provider: "meta",
    channelAccountId: "missing-page",
  });

  assert.equal(result.resolution, "not_found");
});

test("resolveTenantForChannelAccount returns ambiguous for duplicate active accounts", () => {
  const tenants = {
    ...tenantsWith("connected"),
    "tenant-b": {
      id: "tenant-b",
      name: "Tenant B",
      metaPhoneNumberId: "phone-tenant-b",
      allowlist: [],
      handoffAttendantWaid: "",
      defaultLanguage: "pt_BR",
      channelAccounts: [
        {
          id: "account-2",
          tenantKey: "tenant-b",
          channel: "messenger",
          provider: "meta",
          channelAccountId: "page-1",
          enabled: true,
          status: "connected",
        },
      ],
    },
  } satisfies TenantConfigMap;

  const result = resolveTenantForChannelAccount({
    tenants,
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
  });

  assert.equal(result.resolution, "ambiguous");
  assert.equal(result.tenantKey, undefined);
  assert.equal(result.account, undefined);
});
