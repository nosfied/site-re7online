import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  classifyTenantMetaParticipation,
  isActiveTenantMetaContractIncomplete,
} from "../config/tenantMetaParticipation.js";

const webhook = readFileSync(new URL("./webhook.controller.ts", import.meta.url), "utf8");
const retirementCheck = readFileSync(
  new URL("../../scripts/tenants-json-retirement-check.ts", import.meta.url),
  "utf8"
);

test("Meta webhook is DB-first, persists inbound before nominal config denial, and has no default fallback", () => {
  assert.match(webhook, /resolveWhatsappMetaTenantRuntimeConfig/);
  assert.doesNotMatch(webhook, /getDefaultTenant|getTenantByClientKeyOrPhoneNumberId/);
  assert.doesNotMatch(webhook, /reason:\s*["']tenant_config_missing["']/);
  const persistence = webhook.indexOf("await persistInboundSafe({");
  const denial = webhook.indexOf('reason: "tenant_db_config_incomplete"');
  assert(persistence >= 0 && denial > persistence, "inbound persistence must precede the config readiness denial");
});

test("new DB-first Meta gate is not imported by campaigns, Web Session, Messenger, or Instagram", () => {
  const unaffected = [
    "../campaigns/campaignExecutionQueue.ts",
    "../web-session/webSessionAuthorization.ts",
    "../channels/messengerInboundPersistence.ts",
    "../channels/instagramInboundPersistence.ts",
  ];
  for (const relative of unaffected) {
    const source = readFileSync(new URL(relative, import.meta.url), "utf8");
    assert.doesNotMatch(source, /tenantMetaRuntimeConfig|resolveWhatsappMetaTenantRuntimeConfig/, relative);
  }
});

test("tenants.json retirement checks the complete active WhatsApp Meta DB contract", () => {
  assert.match(retirementCheck, /baseConfig/);
  assert.match(retirementCheck, /aiAssistantEnabled/);
  assert.match(retirementCheck, /aiAssistantFallbackToHandoff/);
  assert.match(retirementCheck, /if \(aiEnabled && ai &&/);
  assert.match(retirementCheck, /account\.channel === "whatsapp" && account\.provider === "meta"/);
  assert.match(retirementCheck, /isActiveTenantMetaContractIncomplete/);
  assert.match(retirementCheck, /runtime_critical/);
  assert.doesNotMatch(webhook, /loadTenantsJsonFallback|getTenants\(/);
});

test("retirement scopes Meta requirements to proven Meta participation", () => {
  const webSessionOnly = classifyTenantMetaParticipation({
    metaChannelAccount: false,
    waPhoneNumber: false,
    tenantMetaConfig: false,
  });
  assert.equal(webSessionOnly.participatesInMeta, false);
  assert.equal(webSessionOnly.hasCompleteIdentity, false);
  assert.equal(isActiveTenantMetaContractIncomplete({
    status: "ACTIVE",
    participation: webSessionOnly,
    hasOperationalConfig: false,
    operationalConfigReady: false,
  }), false, "an ACTIVE Web Session-only tenant does not owe Meta artifacts");

  for (const tenant of ["tendencia", "justa", "cra"]) {
    const meta = classifyTenantMetaParticipation({
      metaChannelAccount: true,
      waPhoneNumber: true,
      tenantMetaConfig: false,
    });
    assert.equal(meta.participatesInMeta, true, tenant);
    assert.equal(meta.hasCompleteIdentity, true, tenant);
    assert.equal(isActiveTenantMetaContractIncomplete({
      status: "ACTIVE",
      participation: meta,
      hasOperationalConfig: false,
      operationalConfigReady: false,
    }), true, tenant);
  }
  assert.equal(classifyTenantMetaParticipation({
    metaChannelAccount: true,
    waPhoneNumber: false,
    tenantMetaConfig: false,
  }).hasCompleteIdentity, false);
});

test("all reactive Meta text and template paths share the complete tenant outbound gate", () => {
  assert.match(
    webhook,
    /const isTenantReactiveOutboundReady = \(\) =>\s*hasResolvedTenantConfig &&\s*tenantMetaChannelEnabled &&\s*tenantMetaRuntimeEnabled &&\s*tenantMetaAutomationEnabled &&\s*tenantMetaOutboundEnabled;/
  );
  const fallback = webhook.slice(
    webhook.indexOf("const attemptTemplateFallback"),
    webhook.indexOf("const shouldSendOutbound")
  );
  const passive = webhook.slice(
    webhook.indexOf("const sendPassiveOutboundText"),
    webhook.indexOf("const sendReactiveTemplateMessage")
  );
  const reactiveTemplate = webhook.slice(
    webhook.indexOf("const sendReactiveTemplateMessage"),
    webhook.indexOf("const typedPayload")
  );
  assert.match(fallback, /if \(!isTenantReactiveOutboundReady\(\)\)/);
  assert.match(passive, /if \(!isTenantReactiveOutboundReady\(\)\)/);
  assert.match(reactiveTemplate, /if \(!isTenantReactiveOutboundReady\(\)\)/);
  assert.equal((webhook.match(/sendTemplateMessage\(/g) ?? []).length, 2);
  assert.match(webhook, /const sendOutboundText[\s\S]*?if \(!shouldSendOutbound[\s\S]*?checkUsageGate/);
});

test("Meta inbound persistence and automatic handoff toggles stay independently scoped", () => {
  assert.match(webhook, /if \(!tenantMetaInboundPersistenceEnabled\)[\s\S]*?tenant_inbound_persistence_disabled/);
  assert.match(webhook, /const isSupervisedAiHandoffEnabled = \(\) =>\s*tenantAutomaticHandoffEnabled/);
  assert.match(webhook, /handoff\.automatic\.skipped/);
  assert.match(webhook, /if \(currentHandoffStatus === "active"\)/);
});

test("Tendencia, Justa and CRA remain isolated by tenant and transport modality", () => {
  assert.match(webhook, /resolveWhatsappMetaTenantRuntimeConfig\(\{/);
  assert.match(webhook, /resolveEffectiveWhatsappOutboundTransport\(\{/);
  assert.doesNotMatch(webhook, /getDefaultTenant|getTenantByClientKeyOrPhoneNumberId/);
  const webSession = readFileSync(new URL("../web-session/webSessionInbound.ts", import.meta.url), "utf8");
  assert.doesNotMatch(webSession, /resolveWhatsappMetaTenantRuntimeConfig|isTenantReactiveOutboundReady/);
});
