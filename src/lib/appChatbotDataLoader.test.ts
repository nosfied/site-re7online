import assert from "node:assert/strict";
import test from "node:test";
import { loadAppChatbotData } from "./appChatbotDataLoader";
import type { AppAutomationSettings, AppSession } from "./appClientApi";
import type { TenantCapabilities } from "./appFeatures";

const session: AppSession = {
  baseUrl: "/agent-api",
  token: "token",
  user: {
    id: "user",
    name: "User",
    email: "user@example.test",
    clientId: "client",
    role: "ADMIN",
  },
  features: {} as TenantCapabilities,
  profile: "business",
};

const craFlow = {
  id: "cmtkhhxtq002p4spns3fp0yux",
  clientId: "client",
  name: "CRA-PR - Atendimento Institucional",
  isActive: true,
  entryPoint: true,
  definition: { start: "consent", nodes: { consent: { type: "text", text: "ok" } } },
  createdAt: "2026-09-02T19:23:31.838Z",
  updatedAt: "2026-09-02T19:23:31.838Z",
};

const settings: AppAutomationSettings = {
  disableAutoReply: false,
  disableChatbot: false,
  disableAiFallback: true,
  disableIntentClassifier: true,
  disableLegacyFlows: false,
  handoffLeadNotificationEnabled: false,
  handoffLeadNotificationRecipients: [],
  aiConfigured: false,
  chatbotLocked: false,
  flowEditingLocked: false,
  aiLocked: true,
  aiAssistantLocked: true,
  intentClassifierLocked: true,
};

const resources = {
  departments: [{ id: "department", name: "Departamento", slug: "departamento", isActive: true }],
  queues: [{ id: "queue", name: "Fila Geral", departmentId: "department" }],
};

test("loads flows, settings and resources when all chatbot requests succeed", async () => {
  const result = await loadAppChatbotData(session, {
    fetchFlows: async () => ({ ok: true, count: 1, items: [craFlow] }),
    fetchSettings: async () => ({ ok: true, tenantId: "cra-pr", settings }),
    fetchResources: async () => ({ ok: true, ...resources }),
  });

  assert.deepEqual(result.flows, [craFlow]);
  assert.equal(result.settings, settings);
  assert.deepEqual(result.resources, resources);
  assert.deepEqual(result.errors, {
    flows: undefined,
    settings: undefined,
    resources: undefined,
  });
});

test("keeps CRA active flow and resources when chatbot settings fails", async () => {
  const settingsError = Object.assign(new Error("Tenant not found"), {
    status: 404,
    errorCode: "tenant_not_found",
  });

  const result = await loadAppChatbotData(session, {
    fetchFlows: async () => ({ ok: true, count: 1, items: [craFlow] }),
    fetchSettings: async () => {
      throw settingsError;
    },
    fetchResources: async () => ({ ok: true, ...resources }),
  });

  assert.deepEqual(result.flows, [craFlow]);
  assert.deepEqual(result.resources, resources);
  assert.equal(result.settings, null);
  assert.equal(result.errors.settings, settingsError);
});

test("reports flow-list failure without discarding successful settings and resources", async () => {
  const flowError = Object.assign(new Error("Server error"), { status: 500 });

  const result = await loadAppChatbotData(session, {
    fetchFlows: async () => {
      throw flowError;
    },
    fetchSettings: async () => ({ ok: true, tenantId: "cra-pr", settings }),
    fetchResources: async () => ({ ok: true, ...resources }),
  });

  assert.equal(result.flows, null);
  assert.equal(result.settings, settings);
  assert.deepEqual(result.resources, resources);
  assert.equal(result.errors.flows, flowError);
});

test("keeps returned flows when chatbot resources fails", async () => {
  const resourcesError = Object.assign(new Error("resources failed"), { status: 500 });

  const result = await loadAppChatbotData(session, {
    fetchFlows: async () => ({ ok: true, count: 1, items: [craFlow] }),
    fetchSettings: async () => ({ ok: true, tenantId: "cra-pr", settings }),
    fetchResources: async () => {
      throw resourcesError;
    },
  });

  assert.deepEqual(result.flows, [craFlow]);
  assert.equal(result.settings, settings);
  assert.equal(result.resources, null);
  assert.equal(result.errors.resources, resourcesError);
});
