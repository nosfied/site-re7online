import assert from "node:assert/strict";
import test from "node:test";
import type { AppApiError, AppCampaignAudiencePreviewItem, AppCrmContactItem } from "@/lib/appClientApi";
import {
  buildHydratedCampaignReusePreview,
  getAudienceCrmStatusDisplay,
  mapWithConcurrency,
} from "./campaignReusePreview";

const baseContact = (leadId: string, overrides: Partial<AppCrmContactItem> = {}): AppCrmContactItem => ({
  leadId,
  contactId: `contact-${leadId}`,
  displayName: `Contato ${leadId}`,
  companyName: null,
  email: null,
  city: null,
  phoneDisplay: `55${leadId}`,
  identifierDisplay: `55${leadId}`,
  channel: "whatsapp",
  provider: "whatsapp",
  crmStatus: "",
  crmStatusLabel: "",
  leadStatus: "NEW",
  lastConversationId: null,
  lastConversationIdentity: null,
  lastProtocol: null,
  lastConversationStatus: null,
  lastConversationUpdatedAt: null,
  conversationsCount: 0,
  hasConversation: false,
  activeOptOut: false,
  isAnonymized: false,
  isOperationallyExcluded: false,
  importedSource: "test",
  hasValidWhatsappIdentity: true,
  canStartWhatsappTemplateCandidate: true,
  hasOpenConversationWindow: null,
  campaignRelationship: {
    campaignCount: 0,
    latestCampaignId: null,
    latestCampaignName: null,
    latestCampaignAt: null,
    latestTemplate: null,
    latestRecipientStatus: null,
    latestResultReason: null,
    hasOptOutBlock: false,
    latestDeliveredAt: null,
  },
  templateSendBlockedReason: null,
  createdAt: "2026-09-24T00:00:00.000Z",
  updatedAt: "2026-09-24T00:00:00.000Z",
  ...overrides,
});

const campaign = (leadIds: string[]) => ({
  id: "campaign-1",
  name: "Campanha original",
  updatedAt: "2026-09-24T00:00:00.000Z",
  draftSeed: {
    leadIds,
    recipients: leadIds.map((leadId) => `phone-${leadId}`),
  },
});

const errorWithStatus = (status: number, errorCode?: string) => {
  const error = new Error(`status ${status}`) as AppApiError;
  error.status = status;
  error.errorCode = errorCode;
  return error;
};

async function hydrate(options: {
  leadIds: string[];
  generation?: number;
  currentGeneration?: () => number;
  fetchContactDetail: (leadId: string) => Promise<AppCrmContactItem>;
  blocked?: (item: AppCrmContactItem) => AppCampaignAudiencePreviewItem["blockedReason"];
}) {
  const generation = options.generation ?? 1;
  const currentGeneration = options.currentGeneration ?? (() => generation);
  return buildHydratedCampaignReusePreview({
    campaign: campaign(options.leadIds),
    generation,
    isCurrentGeneration: (candidate) => currentGeneration() === candidate,
    fetchContactDetail: options.fetchContactDetail,
    resolveBlockedReason: (item) => {
      if (options.blocked) return options.blocked(item);
      if (item.activeOptOut) return "active_send_blocked";
      if (!item.hasValidWhatsappIdentity) return "invalid_whatsapp_identity";
      return null;
    },
    getBlockedReasonLabel: (reason) => (reason ? `Bloqueio ${reason}` : null),
  });
}

test("campaign reuse hydration shows Sem situação only after successful CRM detail without status", async () => {
  const result = await hydrate({
    leadIds: ["1"],
    fetchContactDetail: async (leadId) => baseContact(leadId),
  });
  assert.equal(result?.state, "ready");
  assert.equal(result?.preview.summary.eligible, 1);
  assert.equal(getAudienceCrmStatusDisplay(result!.preview.items[0]), "Sem situação");
});

test("campaign reuse hydration differentiates 404 auth and network failures without eligible fallback", async () => {
  const errors: Record<string, AppApiError> = {
    missing: errorWithStatus(404),
    auth: errorWithStatus(403),
    network: Object.assign(new Error("network") as AppApiError, { status: 0, errorCode: "network_error" }),
  };
  const result = await hydrate({
    leadIds: ["missing", "auth", "network"],
    fetchContactDetail: async (leadId) => {
      throw errors[leadId];
    },
  });
  assert.equal(result?.state, "partial");
  assert.equal(result?.preview.summary.eligible, 0);
  assert.equal(result?.preview.summary.blocked, 3);
  const labels = result!.preview.items.map((item) => getAudienceCrmStatusDisplay(item));
  assert.deepEqual(labels, ["Contato atual não localizado", "Consulta sem permissão", "Falha de conexão na consulta"]);
  assert.ok(!labels.includes("Sem situação"));
});

test("campaign reuse hydration ignores late result when another reuse generation starts", async () => {
  let currentGeneration = 1;
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = hydrate({
    leadIds: ["a"],
    generation: 1,
    currentGeneration: () => currentGeneration,
    fetchContactDetail: async (leadId) => {
      await delayed;
      return baseContact(leadId, { crmStatusLabel: "Qualificado" });
    },
  });
  currentGeneration = 2;
  const second = await hydrate({
    leadIds: ["b"],
    generation: 2,
    currentGeneration: () => currentGeneration,
    fetchContactDetail: async (leadId) => baseContact(leadId, { crmStatusLabel: "Novo" }),
  });
  release();
  assert.equal(await first, null);
  assert.equal(getAudienceCrmStatusDisplay(second!.preview.items[0]), "Novo");
});

test("campaign reuse hydration ignores late result after cancel/reset", async () => {
  let currentGeneration = 1;
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = hydrate({
    leadIds: ["a"],
    generation: 1,
    currentGeneration: () => currentGeneration,
    fetchContactDetail: async (leadId) => {
      await delayed;
      return baseContact(leadId);
    },
  });
  currentGeneration = 2;
  release();
  assert.equal(await pending, null);
});

test("campaign reuse hydration preserves selected order and current block state", async () => {
  const result = await hydrate({
    leadIds: ["1", "2"],
    fetchContactDetail: async (leadId) =>
      leadId === "1"
        ? baseContact(leadId, { activeOptOut: true })
        : baseContact(leadId, { crmStatusLabel: "Qualificado" }),
  });
  assert.deepEqual(result?.preview.items.map((item) => item.leadId), ["1", "2"]);
  assert.equal(result?.preview.items[0].eligible, false);
  assert.equal(result?.preview.items[0].blockedReason, "active_send_blocked");
  assert.equal(result?.preview.items[1].eligible, true);
});

test("campaign reuse hydration limits concurrent CRM detail reads", async () => {
  let active = 0;
  let maxActive = 0;
  await mapWithConcurrency(Array.from({ length: 12 }, (_, index) => index), 4, async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
  });
  assert.equal(maxActive, 4);
});
