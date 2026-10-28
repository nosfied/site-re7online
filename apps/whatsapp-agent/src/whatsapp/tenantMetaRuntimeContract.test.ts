import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
  assert.match(retirementCheck, /account\.channel === "whatsapp" && account\.provider === "meta"/);
  assert.match(retirementCheck, /!tenant\.waPhoneNumber && !tenant\.tenantMetaConfig/);
  assert.match(retirementCheck, /runtime_critical/);
  assert.doesNotMatch(webhook, /loadTenantsJsonFallback|getTenants\(/);
});
