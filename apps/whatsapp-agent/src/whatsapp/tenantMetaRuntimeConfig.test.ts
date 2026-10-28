import assert from "node:assert/strict";
import test from "node:test";
import { resolveWhatsappMetaTenantRuntimeConfig } from "./tenantMetaRuntimeConfig.js";

function runtimePrisma(params: {
  clientId: string;
  clientKey: string;
  phoneNumberId: string;
  config: Record<string, unknown>;
  channel?: Partial<{
    enabled: boolean;
    automationEnabled: boolean;
    runtimeEnabled: boolean;
    inboundPersistenceEnabled: boolean;
    outboundEnabled: boolean;
    aiEnabled: boolean;
    handoffEnabled: boolean;
    status: string;
  }> | null;
}) {
  return {
    client: {
      findUnique: async () => ({ id: params.clientId, clientKey: params.clientKey, name: params.clientKey, status: "ACTIVE" }),
    },
    waPhoneNumber: {
      findUnique: async () => ({ clientId: params.clientId, phoneNumberId: params.phoneNumberId }),
    },
    tenantMetaConfig: {
      findFirst: async () => null,
    },
    channelAccount: {
      findFirst: async () => params.channel === null ? null : ({
        enabled: true,
        automationEnabled: true,
        runtimeEnabled: true,
        inboundPersistenceEnabled: true,
        outboundEnabled: true,
        aiEnabled: true,
        handoffEnabled: true,
        status: "connected",
        ...params.channel,
      }),
    },
    tenantOperationalConfig: {
      findUnique: async () => ({ config: params.config }),
    },
  } as never;
}

function completeConfig(allowlist: string, prompt: string, enabled = true) {
  return {
    baseConfig: {
      allowlist: [allowlist],
      handoffAttendantWaid: allowlist,
      defaultLanguage: "pt_BR",
      disableAutoReply: false,
    },
    aiAssistantConfig: {
      aiAssistantEnabled: enabled,
      aiAssistantFallbackToHandoff: enabled,
      aiAssistantSystemPrompt: prompt,
      aiBusinessContext: "",
      aiAssistantGreetingMessage: "",
      aiAssistantFallbackMessage: "",
      aiAssistantHandoffPrompt: "",
      aiAssistantAllowedTopics: [],
      aiAssistantSecondaryTopics: [],
      aiAssistantBlockedTerms: [],
      aiAssistantHandoffKeywords: [],
      aiAssistantMaxReplies: 2,
      aiAssistantProfile: "business",
    },
  };
}

test("WhatsApp Meta runtime remains tenant-scoped without tenants.json", async () => {
  const tendencia = await resolveWhatsappMetaTenantRuntimeConfig({
    prisma: runtimePrisma({
      clientId: "tenant-a",
      clientKey: "tendencia",
      phoneNumberId: "phone-a",
      config: completeConfig("558499049614", "prompt tendencia"),
    }),
    clientId: "tenant-a",
    clientKey: "tendencia",
    phoneNumberId: "phone-a",
  });
  const justa = await resolveWhatsappMetaTenantRuntimeConfig({
    prisma: runtimePrisma({
      clientId: "tenant-b",
      clientKey: "justa",
      phoneNumberId: "phone-b",
      config: completeConfig("558477777784", "prompt justa", false),
      channel: { outboundEnabled: false, aiEnabled: false },
    }),
    clientId: "tenant-b",
    clientKey: "justa",
    phoneNumberId: "phone-b",
  });

  assert.equal(tendencia.readiness.ready, true);
  assert.equal(justa.readiness.ready, true);
  assert.deepEqual(tendencia.tenant.allowlist, ["558499049614"]);
  assert.deepEqual(justa.tenant.allowlist, ["558477777784"]);
  assert.equal(tendencia.tenant.aiAssistantSystemPrompt, "prompt tendencia");
  assert.equal(justa.tenant.aiAssistantSystemPrompt, "prompt justa");
  assert.equal(tendencia.channel.outboundEnabled, true);
  assert.equal(justa.channel.outboundEnabled, false);
  assert.equal(justa.channel.aiEnabled, false);
});

test("incomplete DB config is nominally denied while channel flags remain independent", async () => {
  const result = await resolveWhatsappMetaTenantRuntimeConfig({
    prisma: runtimePrisma({
      clientId: "tenant-a",
      clientKey: "tendencia",
      phoneNumberId: "phone-a",
      config: {},
      channel: {
        automationEnabled: false,
        outboundEnabled: false,
        aiEnabled: false,
        inboundPersistenceEnabled: true,
      },
    }),
    clientId: "tenant-a",
    clientKey: "tendencia",
    phoneNumberId: "phone-a",
  });

  assert.equal(result.readiness.ready, false);
  assert.deepEqual(result.readiness.reasons.sort(), ["tenant_ai_config_missing", "tenant_base_config_missing"]);
  assert.equal(result.channel.automationEnabled, false);
  assert.equal(result.channel.outboundEnabled, false);
  assert.equal(result.channel.aiEnabled, false);
  assert.equal(result.channel.inboundPersistenceEnabled, true);
});
