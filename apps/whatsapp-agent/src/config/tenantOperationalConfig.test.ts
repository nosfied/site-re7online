import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAiIntentQualificationToTenant,
  applyAiAssistantConfigToTenant,
  resolveAiAssistantConfigSettings,
  saveAiAssistantConfigSettings,
  resolveTenantBaseConfigSettings,
  saveTenantBaseConfigSettings,
  resolveAiIntentQualificationSettings,
  resolveAutomationFlagsSettings,
  resolvePlanLimitsSettings,
  resolveRuntimeLimitsSettings,
  resolveSatisfactionPolicySettings,
  resolveServiceMessagePolicySettings,
  resolveWhatsappMediaPolicy,
  normalizeWhatsappMediaPolicy,
  normalizeSatisfactionPolicySettings,
  normalizeServiceMessagePolicySettings,
  isWhatsappMediaAllowed,
  resolveInteractiveContactStartPolicy,
  resolveWhatsappTransportRoutingSettings,
  resolveWhatsappTemplatePolicySettings,
  saveSatisfactionPolicySettings,
  saveServiceMessagePolicySettings,
  saveInteractiveContactStartPolicy,
  saveWhatsappTemplatePolicySettings,
  saveWhatsappTransportRoutingEnabled,
  isWhatsappTemplateCategoryAllowed,
  isWhatsappTransportEnabledForRouting,
} from "./tenantOperationalConfig.js";

test("tenant base config is DB-first and preserves unrelated config on partial writes", async () => {
  const prisma = prismaWithMutableConfig({
    independent: { keep: [false, null, "value"] },
    baseConfig: {
      allowlist: ["558499049614"],
      handoffAttendantWaid: "558477777784",
      defaultLanguage: "pt_BR",
      disableAutoReply: false,
    },
  });
  const resolved = await resolveTenantBaseConfigSettings({ prisma, clientId: "client-1" });
  assert.equal(resolved.source, "db");
  assert.deepEqual(resolved.settings.allowlist, ["558499049614"]);

  await saveTenantBaseConfigSettings({
    prisma,
    clientId: "client-1",
    settings: { disableAutoReply: true },
  });
  const after = await resolveTenantBaseConfigSettings({ prisma, clientId: "client-1" });
  assert.equal(after.settings.disableAutoReply, true);
  assert.deepEqual(after.settings.allowlist, ["558499049614"]);
  const raw = await (prisma as any).tenantOperationalConfig.findUnique();
  assert.deepEqual(raw.config.independent, { keep: [false, null, "value"] });
});

test("AI toggle partial writes preserve prompts and unrelated operational config", async () => {
  const prisma = prismaWithMutableConfig({
    independent: { keep: true },
    aiAssistantConfig: {
      aiAssistantEnabled: false,
      aiAssistantFallbackToHandoff: true,
      aiAssistantSystemPrompt: "prompt preservado",
      aiBusinessContext: "contexto preservado",
    },
  });
  await saveAiAssistantConfigSettings({
    prisma,
    clientId: "client-1",
    settings: { aiAssistantEnabled: true },
  });
  const after = await resolveAiAssistantConfigSettings({ prisma, clientId: "client-1" });
  assert.equal(after.settings.aiAssistantEnabled, true);
  assert.equal(after.settings.aiAssistantFallbackToHandoff, true);
  assert.equal(after.settings.aiAssistantSystemPrompt, "prompt preservado");
  assert.equal(after.settings.aiBusinessContext, "contexto preservado");
  const raw = await (prisma as any).tenantOperationalConfig.findUnique();
  assert.deepEqual(raw.config.independent, { keep: true });
});

function prismaWithConfig(config: unknown) {
  return {
    // Unit-only SQL adapter; lock behavior is tested against PostgreSQL separately.
    $queryRaw: async () => [{ id: "unit-mock-existing-row" }],
    tenantOperationalConfig: {
      createMany: async () => ({ count: 0 }),
      findUnique: async () => ({ config }),
    },
  } as never;
}

function prismaWithMutableConfig(initialConfig: unknown) {
  let config = initialConfig;
  return {
    // Unit-only SQL adapter; lock behavior is tested against PostgreSQL separately.
    $queryRaw: async () => [{ id: "unit-mock-existing-row" }],
    tenantOperationalConfig: {
      createMany: async () => ({ count: 0 }),
      findUnique: async () => ({ config }),
      upsert: async ({ update, create }: { update: { config: unknown }; create: { config: unknown } }) => {
        config = update.config ?? create.config;
        return {
          id: "tenant-config-1",
          schemaVersion: 1,
          updatedAt: new Date("2026-09-06T12:00:00.000Z"),
          config,
        };
      },
    },
  } as never;
}

test("service message policy defaults preserve existing runtime notices", async () => {
  const resolved = await resolveServiceMessagePolicySettings({
    prisma: prismaWithConfig({}),
    clientId: "client-1",
  });

  assert.equal(resolved.source, "json_fallback");
  assert.equal(resolved.settings.protocolNotice.enabled, true);
  assert.equal(resolved.settings.queuePositionNotice.enabled, true);
  assert.equal(resolved.settings.closeNotice.enabled, true);
});

test("service message policy keeps legacy protocol notification separate when canonical config is absent", async () => {
  const resolved = await resolveServiceMessagePolicySettings({
    prisma: prismaWithConfig({
      protocolNotification: {
        enabled: false,
        messageTemplate: "Protocolo {{protocol}}",
      },
    }),
    clientId: "client-1",
  });

  assert.equal(resolved.source, "json_fallback");
  assert.equal(resolved.settings.protocolNotice.enabled, true);
  assert.equal(resolved.settings.protocolNotice.text, null);
  assert.equal(resolved.settings.queuePositionNotice.enabled, true);
  assert.equal(resolved.settings.closeNotice.enabled, true);
});

test("saveServiceMessagePolicySettings persists canonical serviceMessages and preserves nested values", async () => {
  const prisma = prismaWithMutableConfig({
    serviceMessages: {
      protocolNotice: {
        enabled: true,
        text: "Protocolo {{protocol}}",
      },
      queuePositionNotice: {
        enabled: true,
        text: "Fila {position}",
      },
      closeNotice: {
        enabled: true,
      },
    },
  });

  const saved = await saveServiceMessagePolicySettings({
    prisma,
    clientId: "client-1",
    settings: {
      protocolNotice: {
        enabled: false,
      },
    },
  });

  assert.equal(saved.settings.protocolNotice.enabled, false);
  assert.equal(saved.settings.protocolNotice.text, "Protocolo {{protocol}}");
  assert.equal(saved.settings.queuePositionNotice.text, "Fila {position}");
  assert.equal(saved.settings.closeNotice.enabled, true);
});

test("normalizeServiceMessagePolicySettings treats absent fields as enabled", () => {
  const settings = normalizeServiceMessagePolicySettings({
    protocolNotice: { text: "Protocolo {{protocol}}" },
    queuePositionNotice: { text: "Fila {position}" },
    closeNotice: {},
  });

  assert.equal(settings.protocolNotice.enabled, true);
  assert.equal(settings.protocolNotice.text, "Protocolo {{protocol}}");
  assert.equal(settings.queuePositionNotice.enabled, true);
  assert.equal(settings.queuePositionNotice.text, "Fila {position}");
  assert.equal(settings.closeNotice.enabled, true);
});

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
    // Unit-only SQL adapter; lock behavior is tested against PostgreSQL separately.
    $queryRaw: async () => [{ id: "unit-mock-existing-row" }],
    tenantOperationalConfig: {
      createMany: async () => ({ count: 0 }),
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

test("resolveSatisfactionPolicySettings returns disabled defaults when absent", async () => {
  const resolved = await resolveSatisfactionPolicySettings({
    prisma: prismaWithConfig({}),
    clientId: "client-1",
  });

  assert.equal(resolved.source, "json_fallback");
  assert.equal(resolved.settings.enabled, false);
  assert.equal(resolved.settings.commentEnabled, false);
  assert.equal(resolved.settings.ttlMinutes, 15);
  assert.equal(resolved.settings.eligibility, "HUMAN_ONLY");
  assert.match(resolved.settings.questionText, /Pesquisa de Satisfação/);
});

test("normalizeSatisfactionPolicySettings reads legacy comment settings into canonical view", () => {
  const policy = normalizeSatisfactionPolicySettings({
    enabled: true,
    expiresAfterMinutes: 30,
    questionText: "Nota?",
    comment: {
      enabled: true,
      offerText: "Quer comentar?",
      promptText: "Digite o comentario",
      thankYouText: "Obrigado",
    },
    eligibility: "DIRECTED_SERVICE",
  });

  assert.equal(policy.enabled, true);
  assert.equal(policy.commentEnabled, true);
  assert.equal(policy.ttlMinutes, 30);
  assert.equal(policy.questionText, "Nota?");
  assert.equal(policy.commentOfferText, "Quer comentar?");
  assert.equal(policy.commentPromptText, "Digite o comentario");
  assert.equal(policy.thankYouText, "Obrigado");
  assert.equal(policy.eligibility, "DIRECTED_SERVICE");
});

test("saveSatisfactionPolicySettings writes canonical satisfaction policy only", async () => {
  let savedConfig: Record<string, unknown> | null = null;
  const prisma = {
    // Unit-only SQL adapter; lock behavior is tested against PostgreSQL separately.
    $queryRaw: async () => [{ id: "unit-mock-existing-row" }],
    tenantOperationalConfig: {
      createMany: async () => ({ count: 0 }),
      findUnique: async () => ({
        config: {
          satisfactionPolicy: {
            enabled: false,
            comment: { enabled: true },
            questionText: "Old?",
          },
          runtimeLimits: { maxActiveAppUsers: 10 },
        },
      }),
      upsert: async (args: { create: { config: unknown }; update: { config: unknown } }) => {
        savedConfig = args.update.config as Record<string, unknown>;
        return { id: "config-1", schemaVersion: 1, updatedAt: new Date(), config: savedConfig };
      },
    },
  };

  const saved = await saveSatisfactionPolicySettings({
    prisma: prisma as never,
    clientId: "client-1",
    settings: {
      enabled: true,
      commentEnabled: false,
      questionText: "Como voce avalia?",
      ttlMinutes: 20,
    },
  });

  assert.equal(saved.settings.enabled, true);
  assert.equal(saved.settings.commentEnabled, false);
  assert.equal(saved.settings.ttlMinutes, 20);
  const storedConfig = savedConfig as unknown as Record<string, unknown>;
  assert.equal((storedConfig.runtimeLimits as { maxActiveAppUsers?: number }).maxActiveAppUsers, 10);
  assert.equal(
    Object.prototype.hasOwnProperty.call(storedConfig.satisfactionPolicy as Record<string, unknown>, "comment"),
    false
  );
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
    // Unit-only SQL adapter; lock behavior is tested against PostgreSQL separately.
    $queryRaw: async () => [{ id: "unit-mock-existing-row" }],
    tenantOperationalConfig: {
      createMany: async () => ({ count: 0 }),
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
    // Unit-only SQL adapter; lock behavior is tested against PostgreSQL separately.
    $queryRaw: async () => [{ id: "unit-mock-existing-row" }],
    tenantOperationalConfig: {
      createMany: async () => ({ count: 0 }),
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
        aiAssistantEnabled: true,
        aiAssistantFallbackToHandoff: true,
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
    aiAssistantEnabled: true,
    aiAssistantFallbackToHandoff: true,
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
      aiAssistantEnabled: true,
      aiAssistantFallbackToHandoff: false,
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
    aiAssistantEnabled: true,
    aiAssistantFallbackToHandoff: false,
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
    aiAssistantEnabled: false,
    aiAssistantFallbackToHandoff: false,
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
    aiAssistantEnabled: true,
    aiAssistantFallbackToHandoff: true,
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
