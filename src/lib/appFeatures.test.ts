import test from "node:test";
import assert from "node:assert/strict";
import { getTenantCapabilities, hasAppFeature, hasCapability } from "./appFeatures";

test("tenant capabilities preserve current app defaults", () => {
  const capabilities = getTenantCapabilities({ profile: "government" });

  assert.equal(capabilities.dashboard, true);
  assert.equal(capabilities.departments, true);
  assert.equal(capabilities.templates, false);
  assert.equal(capabilities.cannedReplies, true);
  assert.equal(capabilities.crm, false);
  assert.equal(capabilities.protocols, true);
  assert.equal(capabilities.catalog, false);
  assert.equal(capabilities.operationsBoard, false);
});

test("business profile receives crm by default and government does not", () => {
  assert.equal(hasCapability({ profile: "business" }, "crm"), true);
  assert.equal(hasCapability({ profile: "government" }, "crm"), false);
});

test("tenant feature overrides win over profile defaults", () => {
  const session = {
    profile: "government",
    features: {
      dashboard: false,
      crm: true,
      webchat: true,
      catalog: true,
      operationsBoard: true,
    },
  };

  assert.equal(hasAppFeature(session, "dashboard"), false);
  assert.equal(hasCapability(session, "crm"), true);
  assert.equal(hasCapability(session, "webchat"), true);
  assert.equal(hasCapability(session, "catalog"), true);
  assert.equal(hasCapability(session, "operationsBoard"), true);
});

test("canned replies default on and remain independent from templates", () => {
  assert.equal(hasCapability({ profile: "business" }, "cannedReplies"), true);
  assert.equal(hasCapability({ profile: "government" }, "cannedReplies"), true);
  assert.equal(
    hasCapability({ profile: "government", features: { templates: false, cannedReplies: true } }, "cannedReplies"),
    true
  );
  assert.equal(
    hasCapability({ profile: "government", features: { templates: true, cannedReplies: false } }, "templates"),
    true
  );
  assert.equal(
    hasCapability({ profile: "government", features: { templates: true, cannedReplies: false } }, "cannedReplies"),
    false
  );
});

test("WhatsApp web session feature is disabled by default and tenant-generic when exposed", () => {
  assert.equal(getTenantCapabilities({ profile: "business" }).whatsappWebSession, false);
  assert.equal(getTenantCapabilities({ profile: "government" }).whatsappWebSession, false);
  assert.equal(
    getTenantCapabilities({ profile: "business", features: { whatsappWebSession: true } }).whatsappWebSession,
    true
  );
});

test("browser push notifications are disabled by default and tenant-generic when exposed", () => {
  assert.equal(getTenantCapabilities({ profile: "business" }).browserPushNotifications, false);
  assert.equal(getTenantCapabilities({ profile: "government" }).browserPushNotifications, false);
  assert.equal(
    getTenantCapabilities({ profile: "business", features: { browserPushNotifications: true } })
      .browserPushNotifications,
    true
  );
});

test("operational service messages are disabled by default and tenant-generic when exposed", () => {
  assert.equal(getTenantCapabilities({ profile: "business" }).operationalServiceMessages, false);
  assert.equal(getTenantCapabilities({ profile: "government" }).operationalServiceMessages, false);
  assert.equal(
    getTenantCapabilities({ profile: "business", features: { operationalServiceMessages: true } })
      .operationalServiceMessages,
    true
  );
});

test("invalid profile falls back to business and unknown capabilities are disabled", () => {
  const capabilities = getTenantCapabilities({ profile: "unsupported", features: { dashboard: true } });

  assert.equal(capabilities.departments, true);
  assert.equal(capabilities.dashboard, true);
  assert.equal(hasCapability({ profile: "unsupported" }, "advancedSearch"), false);
});
