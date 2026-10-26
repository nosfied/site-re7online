import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCampaignReuseState,
  getCampaignUserFacingError,
  isCampaignOperationsClosedError,
  getFriendlyCampaignError,
} from "./campaignDrafts";
import type { CampaignItem } from "./whatsappAdminApi";

function campaign(overrides: Partial<CampaignItem> = {}): CampaignItem {
  return {
    id: "campaign-1",
    campaignId: "campaign-1",
    name: "Campanha original",
    templateName: "modelo_teste",
    templateId: "template-1",
    status: "completed",
    createdAt: "2026-09-23T10:00:00.000Z",
    updatedAt: "2026-09-23T10:00:00.000Z",
    totalRecipients: 1,
    sentCount: 1,
    blockedCount: 0,
    progress: {
      totalRecipients: 1,
      sentCount: 1,
      blockedCount: 0,
      pendingCount: 0,
    },
    ...overrides,
  } as CampaignItem;
}

test("campaign reuse preserves original manual composer state", () => {
  const reused = buildCampaignReuseState(campaign({
    draftSeed: {
      name: "Campanha teste set.18",
      templateId: "template-1",
      templateName: "modelo_teste",
      recipients: ["5584999999999"],
      manualRecipientInput: ["5584999999999"],
      templateParams: ["Teste A"],
      templateVariableMappings: [{ position: "1", source: "fixed", value: "Teste A" }],
      returnDestination: { type: "human_department", departmentId: "dept-1" },
      source: "manual_campaign_send",
    },
  }));

  assert.equal(reused.mode, "manual");
  assert.equal(reused.originalMode, "manual");
  assert.equal(reused.form.templateName, "modelo_teste");
  assert.equal(reused.form.templateParamsInput, "Teste A");
  assert.equal(reused.form.recipientsInput, "5584999999999");
  assert.deepEqual(reused.warnings, []);
});

test("filtered result reuse preserves manual method and only overrides recipients", () => {
  const reused = buildCampaignReuseState(
    campaign({
      draftSeed: {
        name: "Manual original",
        templateId: "template-1",
        templateName: "modelo_teste",
        recipients: ["5584111111111", "5584222222222"],
        manualRecipientInput: ["5584111111111", "5584222222222"],
        templateParams: ["Teste A"],
        returnDestination: { type: "human_department", departmentId: "dept-1" },
        source: "manual_campaign_send",
      },
    }),
    {
      recipientOverride: {
        mode: "filtered_results",
        recipients: [{ waId: "5584222222222", phoneDisplay: "5584222222222" }],
      },
    }
  );

  assert.equal(reused.mode, "manual");
  assert.equal(reused.form.recipientsInput, "5584222222222");
  assert.equal(reused.form.templateParamsInput, "Teste A");
});

test("filtered dynamic CRM reuse freezes the result subset explicitly", () => {
  const reused = buildCampaignReuseState(
    campaign({
      draftSeed: {
        name: "Dinamica original",
        templateId: "template-1",
        templateName: "modelo_teste",
        recipients: [],
        templateParams: [],
        selectionMode: "DYNAMIC_CRM_FILTER",
        dynamicFilter: { version: 1, crmBusinessStatusId: "status-1" },
        returnDestination: { type: "human_department", departmentId: "dept-1" },
        source: "dynamic_crm_filter",
      },
    }),
    {
      recipientOverride: {
        mode: "filtered_results",
        recipients: [{ leadId: "lead-1", waId: "5584333333333", phoneDisplay: "5584333333333" }],
      },
    }
  );

  assert.equal(reused.originalMode, "crm_dynamic");
  assert.equal(reused.mode, "crm_static");
  assert.deepEqual(reused.filteredLeadIds, ["lead-1"]);
  assert.match(reused.warnings[0] ?? "", /congelados/);
});

test("campaign user-facing errors prefer code mappings and PT-BR blocked reasons", () => {
  const message = getCampaignUserFacingError({
    errorCode: "no_eligible_recipients",
    message: "No eligible recipients for this campaign",
    payload: {
      error: {
        code: "no_eligible_recipients",
        details: {
          summary: {
            blockedByReason: [{ reason: "active_send_blocked", count: 1 }],
          },
        },
      },
    },
  }, "fallback");

  assert.match(message, /Nenhum destinatário está elegível/);
  assert.match(message, /Contato bloqueado para envios ativos/);
  assert.equal(
    getCampaignUserFacingError({ errorCode: "template_variables_required", message: "No eligible recipients for this campaign" }, "fallback"),
    "Preencha todas as variáveis obrigatórias do modelo antes de enviar."
  );
  assert.equal(getFriendlyCampaignError("blocked_identity")?.summary, "Número/identidade inválida para envio");
});



test("campaign suspension is translated for flat, nested and client error envelopes", () => {
  for (const error of [
    { errorCode: "campaign_operations_closed", message: "Internal server error." },
    { payload: { error: "campaign_operations_closed" }, message: "Internal server error." },
    { payload: { error: { code: "campaign_operations_closed" } } },
  ]) {
    assert.equal(isCampaignOperationsClosedError(error), true);
    assert.match(getCampaignUserFacingError(error, "fallback"), /temporariamente suspensas/);
  }
  assert.equal(isCampaignOperationsClosedError({ status: 503, message: "timeout" }), false);
  assert.equal(isCampaignOperationsClosedError({ payload: { error: "server_error" } }), false);
});
