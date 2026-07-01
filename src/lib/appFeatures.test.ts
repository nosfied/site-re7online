import test from "node:test";
import assert from "node:assert/strict";
import { getTenantCapabilities, hasAppFeature, hasCapability } from "./appFeatures";

test("tenant capabilities preserve current app defaults", () => {
  const capabilities = getTenantCapabilities({ profile: "government" });

  assert.equal(capabilities.dashboard, true);
  assert.equal(capabilities.departments, true);
  assert.equal(capabilities.templates, false);
  assert.equal(capabilities.protocols, true);
  assert.equal(capabilities.catalog, false);
});

test("tenant feature overrides win over profile defaults", () => {
  const session = {
    profile: "government",
    features: {
      dashboard: false,
      webchat: true,
      catalog: true,
    },
  };

  assert.equal(hasAppFeature(session, "dashboard"), false);
  assert.equal(hasCapability(session, "webchat"), true);
  assert.equal(hasCapability(session, "catalog"), true);
});

test("invalid profile falls back to business and unknown capabilities are disabled", () => {
  const capabilities = getTenantCapabilities({ profile: "unsupported", features: { dashboard: true } });

  assert.equal(capabilities.departments, true);
  assert.equal(capabilities.dashboard, true);
  assert.equal(hasCapability({ profile: "unsupported" }, "advancedSearch"), false);
});
