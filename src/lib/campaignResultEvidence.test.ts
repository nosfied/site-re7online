import assert from "node:assert/strict";
import test from "node:test";
import {
  getCampaignResultEvidenceLabel,
  hasCampaignResultEvidence,
} from "./campaignResultEvidence";

const missingHistoryPayload = {
  waId: "5541999994321",
  status: "failed",
  nonBillingReason: "missing_individual_history",
  pricingBillable: null,
  sentAt: null,
  deliveredAt: null,
  conversationId: null,
  pricingCategory: null,
  pricingModel: null,
  error: "Envio individual nao encontrado no historico preservado.",
};

test("campaign result visibility distinguishes draft placeholder historical inconsistency and real failure", () => {
  assert.equal(
    hasCampaignResultEvidence(missingHistoryPayload, "draft"),
    false,
    "draft without execution/result evidence must keep result section hidden"
  );
  assert.equal(
    hasCampaignResultEvidence(missingHistoryPayload, "completed"),
    true,
    "completed campaign missing individual history must remain visible as historical inconsistency"
  );
  assert.equal(
    getCampaignResultEvidenceLabel(missingHistoryPayload),
    "Inconsistência histórica",
    "missing individual history must not be presented as proven provider failure"
  );

  const realProviderFailure = {
    ...missingHistoryPayload,
    nonBillingReason: null,
    pricingBillable: undefined,
    error: "131026 Message undeliverable",
  };
  assert.equal(hasCampaignResultEvidence(realProviderFailure, "completed"), true);
  assert.equal(getCampaignResultEvidenceLabel(realProviderFailure), null);
});
