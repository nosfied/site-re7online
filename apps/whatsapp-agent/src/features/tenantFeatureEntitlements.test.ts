import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTenantFeatureEntitlements,
  updateTenantFeatureOverrides,
} from "./tenantFeatureEntitlements.js";

const runtimeUnavailable = {
  metaCloudConfigured: false,
  whatsappWebSessionChannelPresent: false,
};

test("buildTenantFeatureEntitlements separates enabled state from runtime availability", () => {
  const items = buildTenantFeatureEntitlements({
    client: { id: "tenant-1", profile: "business", features: { campaigns: true } },
    runtime: runtimeUnavailable,
  });
  const campaigns = items.find((item) => item.key === "campaigns");
  assert.ok(campaigns);
  assert.equal(campaigns.enabled, true);
  assert.equal(campaigns.status, "unavailable");
  assert.deepEqual(campaigns.unavailableReasons, ["Meta Cloud nao configurado"]);
  const cannedReplies = items.find((item) => item.key === "cannedReplies");
  assert.ok(cannedReplies);
  assert.equal(cannedReplies.label, "Mensagens prontas");
  assert.equal(cannedReplies.enabled, true);
  assert.equal(cannedReplies.status, "enabled");
  assert.deepEqual(cannedReplies.dependencies ?? [], []);
  const browserPush = items.find((item) => item.key === "browserPushNotifications");
  assert.ok(browserPush);
  assert.equal(browserPush.label, "Notificações do navegador");
  assert.equal(browserPush.enabled, false);
  assert.equal(browserPush.status, "disabled");
  assert.deepEqual(browserPush.dependencies ?? [], []);
});

test("updateTenantFeatureOverrides preserves unknown legacy keys", () => {
  const result = updateTenantFeatureOverrides({
    currentFeatures: { legacyExperimentalFlag: true, reports: true },
    updates: { reports: false },
    client: { id: "tenant-1", profile: "business", features: { reports: true } },
    runtime: runtimeUnavailable,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.features.legacyExperimentalFlag, true);
  assert.equal(result.features.reports, false);
  assert.deepEqual(result.changed, [{ key: "reports", oldState: true, newState: false }]);
});

test("updateTenantFeatureOverrides rejects unknown features and unavailable dependencies", () => {
  const unknown = updateTenantFeatureOverrides({
    currentFeatures: {},
    updates: { tenantHardcode: true },
    client: { id: "tenant-1", profile: "business", features: {} },
    runtime: runtimeUnavailable,
  });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.ok ? "" : unknown.error, "unknown_feature");

  const dependency = updateTenantFeatureOverrides({
    currentFeatures: { campaigns: false },
    updates: { campaigns: true },
    client: { id: "tenant-1", profile: "business", features: { campaigns: false } },
    runtime: runtimeUnavailable,
  });
  assert.equal(dependency.ok, false);
  assert.equal(dependency.ok ? "" : dependency.error, "feature_dependency_unavailable");
  assert.equal(dependency.ok ? "" : dependency.feature, "campaigns");
});

test("canned replies entitlement is independent from Meta templates", () => {
  const result = updateTenantFeatureOverrides({
    currentFeatures: { templates: false, cannedReplies: true },
    updates: { cannedReplies: false, templates: true },
    client: {
      id: "tenant-1",
      profile: "government",
      features: { templates: false, cannedReplies: true },
    },
    runtime: { ...runtimeUnavailable, metaCloudConfigured: true },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.features.cannedReplies, false);
  assert.equal(result.features.templates, true);
});
