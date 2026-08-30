import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAiIntentQualificationToTenant,
  applyAiAssistantConfigToTenant,
  resolveAiAssistantConfigSettings,
  resolveAiIntentQualificationSettings,
  resolveAutomationFlagsSettings,
  resolvePlanLimitsSettings,
  resolveRuntimeLimitsSettings,
  resolveWhatsappMediaPolicy,
  normalizeWhatsappMediaPolicy,
  isWhatsappMediaAllowed,
  resolveInteractiveContactStartPolicy,
  resolveWhatsappTransportRoutingSettings,
  resolveWhatsappTemplatePolicySettings,
  saveInteractiveContactStartPolicy,
  saveWhatsappTemplatePolicySettings,
  saveWhatsappTransportRoutingEnabled,
  isWhatsappTemplateCategoryAllowed,
  isWhatsappTransportEnabledForRouting,
} from "./tenantOperationalConfig.js";

function prismaWithConfig(config: unknown) {
  return {
    tenantOperationalConfig: {
      findUnique: async () => ({ config }),
    },
  } as never;
}

test("resolvePlanLimitsSettings prefers DB plan limits over tenants.json", async () => {
  const resolved = await resolvePlanLimitsSettings({
    prisma: prismaWithConfig({
      planLimits: {
        planName: "DB Pro",
        messagesLimit: 50,
        quotaMonthlyConversations: 25,
        quotaWarnAtPct: 0.7,
        quotaBlockedReplyText: "DB blocked",
        quotaExcludeWaIds: ["55 84 9999-0000", "558499990000"],
      },
    }),
    clientId: "client-1",
    tenant: {
      planName: "JSON Basic",
      messagesLimit: 10,
      quotaMonthlyConversations: 5,
      quotaWarnAtPct: 0.9,
      quotaBlockedReplyText: "JSON blocked",
      quotaExcludeWaIds: ["111"],
    },
  });

  assert.equal(resolved.source, "db");
  assert.deepEqual(resolved.settings, {
    planName: "DB Pro",
    messagesLimit: 50,
    quotaMonthlyConversations: 25,
    quotaWarnAtPct: 0.7,
    quotaBlockedReplyText: "DB blocked",
    quotaExcludeWaIds: ["558499990000"],
  });
});

test("resolvePlanLimitsSettings falls back to tenants.json plan limits", async () => {
  const resolved = await resolvePlanLimitsSettings({
    prisma: prismaWithConfig({}),
    clientId: "client-1",
    tenant: {
      planName: "JSON Basic",
      messagesLimit: 10,
      quotaMonthlyConversations: 5,
      quotaWarnAtPct: 0.9,
      quotaBlockedReplyText: "JSON blocked",
      quotaExcludeWaIds: ["55 84 1111-2222", "558411112222"],
    },
  });

  assert.equal(resolved.source, "json_fallback");
  assert.deepEqual(resolved.settings, {
    planName: "JSON Basic",
    messagesLimit: 10,
    quotaMonthlyConversations: 5,
    quotaWarnAtPct: 0.9,
    quotaBlockedReplyText: "JSON blocked",
    quotaExcludeWaIds: ["558411112222"],
  });
});

test("resolvePlanLimitsSettings uses safe defaults when no limit exists", async () => {
  const resolved = await resolvePlanLimitsSettings({
    prisma: prismaWithConfig(null),
    clientId: "client-1",
    tenant: null,
  });

  assert.equal(resolved.source, "json_fallback");
  assert.deepEqual(resolved.settings, {
    planName: null,
    messagesLimit: null,
    quotaMonthlyConversations: null,
    quotaWarnAtPct: 0.8,
    quotaBlockedReplyText: null,
    quotaExcludeWaIds: [],
  });
});

test("resolveRuntimeLimitsSettings prefers DB runtime limits over tenants.json", async () => {
  const resolved = await resolveRuntimeLimitsSettings({
    prisma: prismaWithConfig({
      runtimeLimits: {
        maxActiveAppUsers: 14,
      },
    }),
    clientId: "client-1",
    tenant: {
      maxActiveAppUsers: 5,
    },
  });

  assert.equal(resolved.source, "db");
  assert.deepEqual(resolved.settings, {
    maxActiveAppUsers: 14,
  });
});

test("resolveRuntimeLimitsSettings falls back to tenants.json runtime limits", async () => {
  const resolved = await resolveRuntimeLimitsSettings({
    prisma: prismaWithConfig({}),
    clientId: "client-1",
    tenant: {
      maxActiveAppUsers: 7,
    },
  });

  assert.equal(resolved.source, "json_fallback");
  assert.deepEqual(resolved.settings, {
    maxActiveAppUsers: 7,
  });
});

test("resolveInteractiveContactStartPolicy defaults Web Session contact start to disabled", async () => {
  const resolved = await resolveInteractiveContactStartPolicy({
    prisma: prismaWithConfig({}),
    clientId: "client-1",
  });

  assert.equal(resolved.source, "json_fallback");
  assert.equal(resolved.allowInteractiveContactStartViaWebSession, false);
});

test("saveInteractiveContactStartPolicy persists explicit Web Session contact start opt-in", async () => {
  let storedConfig: unknown = { whatsappPrimaryTransport: "web_session" };
  const prisma = {
    tenantOperationalConfig: {
      findUnique: async () => ({ config: storedConfig }),
      upsert: async ({ update, create }: { update: { config: unknown }; create: { config: unknown } }) => {
        storedConfig = update.config ?? create.config;
        return { config: storedConfig };
      },
    },
  } as never;

  const saved = await saveInteractiveContactStartPolicy({
    prisma,
    clientId: "client-1",
    allowInteractiveContactStartViaWebSession: true,
  });

  assert.equal(saved.source, "db");
  assert.equal(saved.allowInteractiveContactStartViaWebSession, true);
  assert.deepEqual(storedConfig, {
    whatsappPrimaryTransport: "web_session",
    allowInteractiveContactStartViaWebSession: true,
  });
});

test("resolveWhatsappTransportRoutingSettings is backward-compatible when absent", async () => {
  const resolved = await resolveWhatsappTransportRoutingSettings({
    prisma: prismaWithConfig({}),
    clientId: "client-1",
  });

  assert.equal(resolved.source, "json_fallback");
  assert.deepEqual(resolved.settings, {});
  assert.equal(isWhatsappTransportEnabledForRouting(resolved.settings, "meta", true), true);
  assert.equal(isWhatsappTransportEnabledForRouting(resolved.settings, "webSession", false), false);
});

test("saveWhatsappTransportRoutingEnabled persists one transport without touching other config", async () => {
  let storedConfig: unknown = {
    whatsappPrimaryTransport: "meta",
    allowInteractiveContactStartViaWebSession: true,
    whatsappTransports: {
      meta: { enabledForRouting: true },
    },
  };
  const prisma = {
    tenantOperationalConfig: {
      findUnique: async () => ({ config: storedConfig }),
      upsert: async ({ update, create }: { update: { config: unknown }; create: { config: unknown } }) => {
        storedConfig = update.config ?? create.config;
        return { id: "cfg-1", schemaVersion: 1, updatedAt: new Date(), config: storedConfig };
      },
    },
  } as never;

  const saved = await saveWhatsappTransportRoutingEnabled({
    prisma,
    clientId: "client-1",
    transport: "webSession",
    enabledForRouting: false,
  });

  assert.deepEqual(saved.settings, {
    meta: { enabledForRouting: true },
    webSession: { enabledForRouting: false },
  });
  assert.deepEqual(storedConfig, {
    whatsappPrimaryTransport: "meta",
    allowInteractiveContactStartViaWebSession: true,
    whatsappTransports: {
      meta: { enabledForRouting: true },
      webSession: { enabledForRouting: false },
    },
  });
});

test("resolveWhatsappTemplatePolicySettings is unrestricted when absent", async () => {
  const resolved = await resolveWhatsappTemplatePolicySettings({
    prisma: prismaWithConfig({}),
    clientId: "client-1",
  });

  assert.equal(resolved.source, "json_fallback");
  assert.equal(resolved.unrestricted, true);
  assert.deepEqual(resolved.settings, {});
  assert.equal(isWhatsappTemplateCategoryAllowed(resolved.settings, "UTILITY"), true);
  assert.equal(isWhatsappTemplateCategoryAllowed(resolved.settings, "MARKETING"), true);
});

test("resolveWhatsappTemplatePolicySettings normalizes explicit allowlist", async () => {
  const resolved = await resolveWhatsappTemplatePolicySettings({
    prisma: prismaWithConfig({
      whatsappTemplatePolicy: {
        allowedCategories: ["utility", "UTILITY", "bad", "MARKETING"],
      },
    }),
    clientId: "client-1",
  });

  assert.equal(resolved.source, "db");
  assert.equal(resolved.unrestricted, false);
  assert.deepEqual(resolved.settings, {
    allowedCategories: ["UTILITY", "MARKETING"],
  });
  assert.equal(isWhatsappTemplateCategoryAllowed(resolved.settings, "UTILITY"), true);
  assert.equal(isWhatsappTemplateCategoryAllowed(resolved.settings, "AUTHENTICATION"), false);
});

test("saveWhatsappTemplatePolicySettings persists allowlist without touching other config", async () => {
  let storedConfig: unknown = {
    whatsappPrimaryTransport: "meta",
    whatsappTransports: {
      meta: { enabledForRouting: true },
    },
  };
  const prisma = {
    tenantOperationalConfig: {
      findUnique: async () => ({ config: storedConfig }),
      upsert: async ({ update, create }: { update: { config: unknown }; create: { config: unknown } }) => {
        storedConfig = update.config ?? create.config;
        return { id: "cfg-1", schemaVersion: 1, updatedAt: new Date(), config: storedConfig };
      },
    },
  } as never;

  const saved = await saveWhatsappTemplatePolicySettings({
    prisma,
    clientId: "client-1",
    allowedCategories: ["UTILITY"],
  });

  assert.equal(saved.unrestricted, false);
  assert.deepEqual(saved.settings, { allowedCategories: ["UTILITY"] });
  assert.deepEqual(storedConfig, {
    whatsappPrimaryTransport: "meta",
    whatsappTransports: {
      meta: { enabledForRouting: true },
    },
    whatsappTemplatePolicy: {
      allowedCategories: ["UTILITY"],
    },
  });
});

test("resolveWhatsappMediaPolicy defaults all supported media to allowed", async () => {
  const resolved = await resolveWhatsappMediaPolicy({
    prisma: prismaWithConfig(null),
    clientId: "client-1",
  });

  assert.equal(resolved.source, "json_fallback");
  assert.deepEqual(resolved.policy, {
    inbound: { image: true, audio: true, video: true, document: true },
    outbound: { image: true, audio: true, video: true, document: true },
  });
});

test("normalizeWhatsappMediaPolicy preserves booleans and falls back per field", () => {
  const policy = normalizeWhatsappMediaPolicy({
    inbound: { image: true, audio: false },
    outbound: { video: false, document: true },
  });

  assert.equal(policy.inbound.image, true);
  assert.equal(policy.inbound.audio, false);
  assert.equal(policy.inbound.video, true);
  assert.equal(policy.outbound.video, false);
  assert.equal(policy.outbound.image, true);
  assert.equal(isWhatsappMediaAllowed(policy, "outbound", "video"), false);
});

test("resolveAutomationFlagsSettings prefers DB automation flags over tenants.json", async () => {
  const resolved = await resolveAutomationFlagsSettings({
    prisma: prismaWithConfig({
      automationFlags: {
        disableChatbot: false,
        disableAiFallback: true,
        disableIntentClassifier: true,
        disableLegacyFlows: false,
        disableChatbotFlowEditing: true,
      },
    }),
    clientId: "client-1",
    tenant: {
      disableChatbot: true,
      disableAiFallback: false,
      disableIntentClassifier: false,
      disableLegacyFlows: true,
      disableChatbotFlowEditing: false,
    },
  });

  assert.equal(resolved.source, "db");
  assert.deepEqual(resolved.settings, {
    disableChatbot: false,
    disableAiFallback: true,
    disableIntentClassifier: true,
    disableLegacyFlows: false,
    disableChatbotFlowEditing: true,
  });
});

test("resolveAutomationFlagsSettings falls back to tenants.json automation flags", async () => {
  const resolved = await resolveAutomationFlagsSettings({
    prisma: prismaWithConfig({}),
    clientId: "client-1",
    tenant: {
      disableChatbot: true,
      disableAiFallback: true,
      disableIntentClassifier: false,
      disableLegacyFlows: false,
      disableChatbotFlowEditing: true,
    },
  });

  assert.equal(resolved.source, "json_fallback");
  assert.deepEqual(resolved.settings, {
    disableChatbot: true,
    disableAiFallback: true,
    disableIntentClassifier: false,
    disableLegacyFlows: false,
    disableChatbotFlowEditing: true,
  });
});

test("resolveAutomationFlagsSettings keeps legacy flows disabled by default", async () => {
  const resolved = await resolveAutomationFlagsSettings({
    prisma: prismaWithConfig(null),
    clientId: "client-1",
    tenant: null,
  });

  assert.equal(resolved.source, "json_fallback");
  assert.deepEqual(resolved.settings, {
    disableChatbot: false,
    disableAiFallback: false,
    disableIntentClassifier: false,
    disableLegacyFlows: true,
    disableChatbotFlowEditing: false,
  });
});

test("resolveAiAssistantConfigSettings prefers DB assistant config over tenants.json", async () => {
  const resolved = await resolveAiAssistantConfigSettings({
    prisma: prismaWithConfig({
      aiAssistantConfig: {
        aiBusinessContext: "DB contexto",
        aiAssistantSystemPrompt: "DB prompt",
        aiAssistantGreetingMessage: "DB oi",
        aiAssistantFallbackMessage: "DB fallback",
        aiAssistantHandoffPrompt: "DB humano",
        aiAssistantAllowedTopics: ["catalogo", " catalogo ", "precos"],
        aiAssistantSecondaryTopics: ["showroom"],
        aiAssistantBlockedTerms: ["cpf"],
        aiAssistantHandoffKeywords: ["atendente"],
        aiAssistantMaxReplies: 4,
        aiAssistantProfile: "government",
      },
    }),
    clientId: "client-1",
    tenant: {
      aiBusinessContext: "JSON contexto",
      aiAssistantSystemPrompt: "JSON prompt",
      aiAssistantGreetingMessage: "JSON oi",
      aiAssistantFallbackMessage: "JSON fallback",
      aiAssistantHandoffPrompt: "JSON humano",
      aiAssistantAllowedTopics: ["json"],
      aiAssistantSecondaryTopics: [],
      aiAssistantBlockedTerms: [],
      aiAssistantHandoffKeywords: [],
      aiAssistantMaxReplies: 1,
      aiAssistantProfile: "business",
    },
  });

  assert.equal(resolved.source, "db");
  assert.deepEqual(resolved.settings, {
    aiBusinessContext: "DB contexto",
    aiAssistantSystemPrompt: "DB prompt",
    aiAssistantGreetingMessage: "DB oi",
    aiAssistantFallbackMessage: "DB fallback",
    aiAssistantHandoffPrompt: "DB humano",
    aiAssistantAllowedTopics: ["catalogo", "precos"],
    aiAssistantSecondaryTopics: ["showroom"],
    aiAssistantBlockedTerms: ["cpf"],
    aiAssistantHandoffKeywords: ["atendente"],
    aiAssistantMaxReplies: 4,
    aiAssistantProfile: "government",
  });
});

test("resolveAiAssistantConfigSettings falls back to tenants.json assistant config", async () => {
  const resolved = await resolveAiAssistantConfigSettings({
    prisma: prismaWithConfig({}),
    clientId: "client-1",
    tenant: {
      aiBusinessContext: "JSON contexto",
      aiAssistantSystemPrompt: "JSON prompt",
      aiAssistantGreetingMessage: "JSON oi",
      aiAssistantFallbackMessage: "JSON fallback",
      aiAssistantHandoffPrompt: "JSON humano",
      aiAssistantAllowedTopics: ["catalogo"],
      aiAssistantSecondaryTopics: ["showroom"],
      aiAssistantBlockedTerms: ["cpf"],
      aiAssistantHandoffKeywords: ["humano"],
      aiAssistantMaxReplies: 3,
      aiAssistantProfile: "legal_previdenciario",
    },
  });

  assert.equal(resolved.source, "json_fallback");
  assert.deepEqual(resolved.settings, {
    aiBusinessContext: "JSON contexto",
    aiAssistantSystemPrompt: "JSON prompt",
    aiAssistantGreetingMessage: "JSON oi",
    aiAssistantFallbackMessage: "JSON fallback",
    aiAssistantHandoffPrompt: "JSON humano",
    aiAssistantAllowedTopics: ["catalogo"],
    aiAssistantSecondaryTopics: ["showroom"],
    aiAssistantBlockedTerms: ["cpf"],
    aiAssistantHandoffKeywords: ["humano"],
    aiAssistantMaxReplies: 3,
    aiAssistantProfile: "legal_previdenciario",
  });
});

test("resolveAiAssistantConfigSettings uses safe assistant defaults", async () => {
  const resolved = await resolveAiAssistantConfigSettings({
    prisma: prismaWithConfig(null),
    clientId: "client-1",
    tenant: null,
  });

  assert.equal(resolved.source, "json_fallback");
  assert.deepEqual(resolved.settings, {
    aiBusinessContext: "",
    aiAssistantSystemPrompt: "",
    aiAssistantGreetingMessage: "",
    aiAssistantFallbackMessage: "",
    aiAssistantHandoffPrompt: "",
    aiAssistantAllowedTopics: [],
    aiAssistantSecondaryTopics: [],
    aiAssistantBlockedTerms: [],
    aiAssistantHandoffKeywords: [],
    aiAssistantMaxReplies: 2,
    aiAssistantProfile: "business",
  });
});

test("applyAiAssistantConfigToTenant preserves intent catalog and qualification scope", () => {
  const tenant = {
    aiAssistantIntentCatalog: [{ key: "catalogo", label: "Catalogo" }],
    aiQualification: { fields: [{ id: "name", label: "Nome" }] },
  };
  const applied = applyAiAssistantConfigToTenant(tenant as Partial<import("./tenantConfig.js").TenantConfig>, {
    aiBusinessContext: "Contexto",
    aiAssistantSystemPrompt: "Prompt",
    aiAssistantGreetingMessage: "Oi",
    aiAssistantFallbackMessage: "Fallback",
    aiAssistantHandoffPrompt: "Humano",
    aiAssistantAllowedTopics: ["catalogo"],
    aiAssistantSecondaryTopics: [],
    aiAssistantBlockedTerms: [],
    aiAssistantHandoffKeywords: ["humano"],
    aiAssistantMaxReplies: 2,
    aiAssistantProfile: "business",
  });

  assert.deepEqual(applied.aiAssistantIntentCatalog, tenant.aiAssistantIntentCatalog);
  assert.deepEqual(applied.aiQualification, tenant.aiQualification);
  assert.equal(applied.aiBusinessContext, "Contexto");
});

test("resolveAiIntentQualificationSettings prefers DB intent catalog and qualification", async () => {
  const resolved = await resolveAiIntentQualificationSettings({
    prisma: prismaWithConfig({
      aiIntentQualification: {
        aiAssistantIntentCatalog: [
          {
            key: "catalogo",
            topics: ["catalogo"],
            preQualification: true,
          },
        ],
        aiQualification: {
          enabled: true,
          slots: [
            {
              key: "email",
              question: "Qual e-mail podemos anotar?",
            },
          ],
        },
      },
    }),
    clientId: "client-1",
    tenant: {
      aiAssistantIntentCatalog: [{ key: "json", topics: ["json"] }],
      aiQualification: { enabled: false },
    },
  });

  assert.equal(resolved.source, "db");
  assert.equal(resolved.settings.aiAssistantIntentCatalog[0]?.key, "catalogo");
  assert.equal(resolved.settings.aiAssistantIntentCatalog[0]?.preQualification, true);
  assert.equal(resolved.settings.aiQualification?.enabled, true);
  assert.equal(resolved.settings.aiQualification?.slots?.[0]?.key, "email");
});

test("resolveAiIntentQualificationSettings falls back to tenants.json", async () => {
  const resolved = await resolveAiIntentQualificationSettings({
    prisma: prismaWithConfig({}),
    clientId: "client-1",
    tenant: {
      aiAssistantIntentCatalog: [{ key: "showroom", topics: ["endereco"], handoff: true }],
      aiQualification: {
        enabled: true,
        slots: [{ key: "tipo", question: "Uso próprio ou revenda?" }],
      },
    },
  });

  assert.equal(resolved.source, "json_fallback");
  assert.equal(resolved.settings.aiAssistantIntentCatalog[0]?.key, "showroom");
  assert.equal(resolved.settings.aiQualification?.slots?.[0]?.key, "tipo");
});

test("applyAiIntentQualificationToTenant disables qualification when DB has null", () => {
  const applied = applyAiIntentQualificationToTenant(
    {
      aiAssistantIntentCatalog: [{ key: "json", topics: ["json"] }],
      aiQualification: { enabled: true },
    } as Partial<import("./tenantConfig.js").TenantConfig>,
    {
      aiAssistantIntentCatalog: [{ key: "db", topics: ["db"] }],
      aiQualification: null,
    }
  );

  assert.deepEqual(applied.aiAssistantIntentCatalog, [{ key: "db", topics: ["db"] }]);
  assert.equal(applied.aiQualification, undefined);
});
