import test from "node:test";
import assert from "node:assert/strict";
import {
  CapabilityRequiredError,
  getFeatures,
  hasCapability,
  hasFeature,
  requireCapability,
  resolveTenantCapabilities,
} from "./clientFeatures.js";

test("knowledgeBase is disabled by default for controlled rollout", () => {
  assert.equal(getFeatures({ profile: "business" }).knowledgeBase, false);
  assert.equal(getFeatures({ profile: "government" }).knowledgeBase, false);
});

test("scheduling is disabled by default for controlled rollout", () => {
  assert.equal(getFeatures({ profile: "business" }).scheduling, false);
  assert.equal(getFeatures({ profile: "government" }).scheduling, false);
  assert.equal(getFeatures({ profile: "business" }).schedulingReminders, false);
  assert.equal(getFeatures({ profile: "government" }).schedulingReminders, false);
  assert.equal(getFeatures({ profile: "business" }).schedulingRemindersShadow, false);
  assert.equal(getFeatures({ profile: "government" }).schedulingRemindersShadow, false);
  assert.equal(getFeatures({ profile: "business" }).schedulingRemindersSend, false);
  assert.equal(getFeatures({ profile: "government" }).schedulingRemindersSend, false);
  assert.equal(getFeatures({ profile: "business" }).schedulingConfirmation, false);
  assert.equal(getFeatures({ profile: "government" }).schedulingConfirmation, false);
});

test("satisfaction is disabled by default for controlled rollout", () => {
  assert.equal(getFeatures({ profile: "business" }).satisfaction, false);
  assert.equal(getFeatures({ profile: "government" }).satisfaction, false);
});

test("audio transcription is disabled by default for controlled rollout", () => {
  assert.equal(getFeatures({ profile: "business" }).audioTranscription, false);
  assert.equal(getFeatures({ profile: "government" }).audioTranscription, false);
  assert.equal(getFeatures({ profile: "business" }).audioTranscriptionRuntime, false);
  assert.equal(getFeatures({ profile: "government" }).audioTranscriptionRuntime, false);
});

test("advanced search is disabled by default for controlled rollout", () => {
  assert.equal(getFeatures({ profile: "business" }).advancedSearch, false);
  assert.equal(getFeatures({ profile: "government" }).advancedSearch, false);
  assert.equal(getFeatures({ profile: "business" }).advancedSearchRuntime, false);
  assert.equal(getFeatures({ profile: "government" }).advancedSearchRuntime, false);
});

test("webchat is disabled by default for controlled rollout", () => {
  assert.equal(getFeatures({ profile: "business" }).webchat, false);
  assert.equal(getFeatures({ profile: "government" }).webchat, false);
  assert.equal(getFeatures({ profile: "business" }).webchatOutbound, false);
  assert.equal(getFeatures({ profile: "government" }).webchatOutbound, false);
});

test("telegram is disabled by default for controlled rollout", () => {
  assert.equal(getFeatures({ profile: "business" }).telegram, false);
  assert.equal(getFeatures({ profile: "government" }).telegram, false);
  assert.equal(getFeatures({ profile: "business" }).telegramInbound, false);
  assert.equal(getFeatures({ profile: "government" }).telegramInbound, false);
  assert.equal(getFeatures({ profile: "business" }).telegramOutbound, false);
  assert.equal(getFeatures({ profile: "government" }).telegramOutbound, false);
});

test("WhatsApp web session is disabled by default for controlled rollout", () => {
  assert.equal(getFeatures({ profile: "business" }).whatsappWebSession, false);
  assert.equal(getFeatures({ profile: "government" }).whatsappWebSession, false);
});

test("canned replies are enabled by default for existing tenants", () => {
  assert.equal(getFeatures({ profile: "business" }).cannedReplies, true);
  assert.equal(getFeatures({ profile: "government" }).cannedReplies, true);
  assert.equal(resolveTenantCapabilities({ profile: "business" }).cannedReplies, true);
  assert.equal(resolveTenantCapabilities({ profile: "government" }).cannedReplies, true);
});

test("webhooks is disabled by default for controlled rollout", () => {
  assert.equal(getFeatures({ profile: "business" }).webhooks, false);
  assert.equal(getFeatures({ profile: "government" }).webhooks, false);
  assert.equal(getFeatures({ profile: "business" }).webhookDispatch, false);
  assert.equal(getFeatures({ profile: "government" }).webhookDispatch, false);
  assert.equal(getFeatures({ profile: "business" }).webhookDispatchExecute, false);
  assert.equal(getFeatures({ profile: "government" }).webhookDispatchExecute, false);
});

test("mfa is disabled by default for controlled rollout", () => {
  assert.equal(getFeatures({ profile: "business" }).mfa, false);
  assert.equal(getFeatures({ profile: "government" }).mfa, false);
  assert.equal(getFeatures({ profile: "business" }).mfaRequired, false);
  assert.equal(getFeatures({ profile: "government" }).mfaRequired, false);
  assert.equal(getFeatures({ profile: "business" }).mfaEnforced, false);
  assert.equal(getFeatures({ profile: "government" }).mfaEnforced, false);
});

test("knowledgeBase can be enabled by tenant feature override", () => {
  const client = { profile: "business", features: { knowledgeBase: true } };
  assert.equal(getFeatures(client).knowledgeBase, true);
  assert.equal(hasFeature(client, "knowledgeBase"), true);
});

test("scheduling can be enabled by tenant feature override", () => {
  const client = {
    profile: "government",
    features: {
      scheduling: true,
      schedulingReminders: true,
      schedulingRemindersShadow: true,
      schedulingRemindersSend: true,
      schedulingConfirmation: true,
    },
  };
  assert.equal(getFeatures(client).scheduling, true);
  assert.equal(getFeatures(client).schedulingReminders, true);
  assert.equal(getFeatures(client).schedulingRemindersShadow, true);
  assert.equal(getFeatures(client).schedulingRemindersSend, true);
  assert.equal(getFeatures(client).schedulingConfirmation, true);
  assert.equal(hasFeature(client, "scheduling"), true);
  assert.equal(hasFeature(client, "schedulingReminders"), true);
  assert.equal(hasFeature(client, "schedulingRemindersShadow"), true);
  assert.equal(hasFeature(client, "schedulingRemindersSend"), true);
  assert.equal(hasFeature(client, "schedulingConfirmation"), true);
});

test("satisfaction can be enabled by tenant feature override", () => {
  const client = { profile: "government", features: { satisfaction: true } };
  assert.equal(getFeatures(client).satisfaction, true);
  assert.equal(hasFeature(client, "satisfaction"), true);
});

test("audio transcription can be enabled by tenant feature override", () => {
  const client = {
    profile: "government",
    features: { audioTranscription: true, audioTranscriptionRuntime: true },
  };
  assert.equal(getFeatures(client).audioTranscription, true);
  assert.equal(getFeatures(client).audioTranscriptionRuntime, true);
  assert.equal(hasFeature(client, "audioTranscription"), true);
  assert.equal(hasFeature(client, "audioTranscriptionRuntime"), true);
});

test("advanced search can be enabled by tenant feature override", () => {
  const client = {
    profile: "government",
    features: { advancedSearch: true, advancedSearchRuntime: true },
  };
  assert.equal(getFeatures(client).advancedSearch, true);
  assert.equal(getFeatures(client).advancedSearchRuntime, true);
  assert.equal(hasFeature(client, "advancedSearch"), true);
  assert.equal(hasFeature(client, "advancedSearchRuntime"), true);
});

test("webchat can be enabled by tenant feature override", () => {
  const client = { profile: "government", features: { webchat: true, webchatOutbound: true } };
  assert.equal(getFeatures(client).webchat, true);
  assert.equal(getFeatures(client).webchatOutbound, true);
  assert.equal(hasFeature(client, "webchat"), true);
  assert.equal(hasFeature(client, "webchatOutbound"), true);
});

test("telegram can be enabled by tenant feature override", () => {
  const client = {
    profile: "government",
    features: { telegram: true, telegramInbound: true, telegramOutbound: true },
  };
  assert.equal(getFeatures(client).telegram, true);
  assert.equal(getFeatures(client).telegramInbound, true);
  assert.equal(getFeatures(client).telegramOutbound, true);
  assert.equal(hasFeature(client, "telegram"), true);
  assert.equal(hasFeature(client, "telegramInbound"), true);
  assert.equal(hasFeature(client, "telegramOutbound"), true);
});

test("WhatsApp web session can only be exposed by tenant-generic feature override", () => {
  const client = { profile: "business", features: { whatsappWebSession: true } };
  assert.equal(getFeatures(client).whatsappWebSession, true);
  assert.equal(hasFeature(client, "whatsappWebSession"), true);
});

test("canned replies can be disabled without changing templates", () => {
  const client = {
    profile: "government",
    features: { cannedReplies: false, templates: true },
  };
  assert.equal(getFeatures(client).cannedReplies, false);
  assert.equal(getFeatures(client).templates, true);
  assert.equal(hasFeature(client, "cannedReplies"), false);
  assert.equal(hasFeature(client, "templates"), true);
});

test("webhooks can be enabled by tenant feature override", () => {
  const client = {
    profile: "government",
    features: { webhooks: true, webhookDispatch: true, webhookDispatchExecute: true },
  };
  assert.equal(getFeatures(client).webhooks, true);
  assert.equal(getFeatures(client).webhookDispatch, true);
  assert.equal(getFeatures(client).webhookDispatchExecute, true);
  assert.equal(hasFeature(client, "webhooks"), true);
  assert.equal(hasFeature(client, "webhookDispatch"), true);
  assert.equal(hasFeature(client, "webhookDispatchExecute"), true);
});

test("mfa can be enabled by tenant feature override", () => {
  const client = {
    profile: "government",
    features: { mfa: true, mfaRequired: true, mfaEnforced: true },
  };
  assert.equal(getFeatures(client).mfa, true);
  assert.equal(getFeatures(client).mfaRequired, true);
  assert.equal(getFeatures(client).mfaEnforced, true);
  assert.equal(hasFeature(client, "mfa"), true);
  assert.equal(hasFeature(client, "mfaRequired"), true);
  assert.equal(hasFeature(client, "mfaEnforced"), true);
});

test("resolveTenantCapabilities preserves current feature defaults and adds platform capabilities", () => {
  const business = resolveTenantCapabilities({ profile: "business" });
  const government = resolveTenantCapabilities({ profile: "government" });

  assert.equal(business.dashboard, false);
  assert.equal(government.dashboard, true);
  assert.equal(business.departments, true);
  assert.equal(government.departments, true);
  assert.equal(business.crm, true);
  assert.equal(government.crm, false);
  assert.equal(business.protocols, true);
  assert.equal(government.protocols, true);
  assert.equal(business.catalog, false);
  assert.equal(government.catalog, false);
  assert.equal(business.salesPipeline, false);
  assert.equal(government.governmentReports, false);
  assert.equal(business.operationsBoard, false);
  assert.equal(government.operationsBoard, false);
});

test("tenant capability overrides win without changing profile defaults", () => {
  const client = {
    profile: "business",
    features: {
      dashboard: true,
      crm: false,
      protocols: false,
      catalog: true,
      salesPipeline: true,
      governmentReports: true,
      operationsBoard: true,
    },
  };

  const capabilities = resolveTenantCapabilities(client);
  assert.equal(capabilities.dashboard, true);
  assert.equal(capabilities.crm, false);
  assert.equal(capabilities.protocols, false);
  assert.equal(capabilities.catalog, true);
  assert.equal(capabilities.salesPipeline, true);
  assert.equal(capabilities.governmentReports, true);
  assert.equal(capabilities.operationsBoard, true);
  assert.equal(hasCapability(client, "catalog"), true);
  assert.equal(hasCapability(client, "crm"), false);
  assert.equal(hasCapability(client, "protocols"), false);
  assert.equal(hasCapability(client, "operationsBoard"), true);
});

test("requireCapability throws a typed error when disabled", () => {
  const client = { profile: "business", features: { catalog: false } };
  assert.throws(() => requireCapability(client, "catalog"), CapabilityRequiredError);
  assert.equal(requireCapability({ profile: "business", features: { catalog: true } }, "catalog").catalog, true);
  assert.equal(requireCapability({ profile: "business" }, "crm").crm, true);
  assert.throws(() => requireCapability({ profile: "government" }, "crm"), CapabilityRequiredError);
});
