import assert from "node:assert/strict";
import test from "node:test";
import { projectCampaignLifecyclePresentation } from "./campaignLifecyclePresentation.js";

const at = (value: string) => new Date(value);

test("discarded draft uses its persisted event and has no invented uncertainty", () => {
  assert.deepEqual(projectCampaignLifecyclePresentation({
    campaignId: "draft",
    status: "cancelled",
    providerAcceptancePersistencePending: false,
    events: [{ eventName: "campaign.draft.discarded", messageId: "draft", createdAt: at("2026-10-26T10:00:00Z") }],
  }), {
    termination: { kind: "draft_discarded", evidence: "campaign.draft.discarded" },
    operationalAlert: null,
  });
});

test("campaign cancelled after execution uses cancellation evidence", () => {
  const result = projectCampaignLifecyclePresentation({
    campaignId: "partial",
    status: "cancelled",
    providerAcceptancePersistencePending: false,
    events: [{ eventName: "campaign.cancelled", messageId: "partial", createdAt: at("2026-10-26T10:00:00Z") }],
  });
  assert.deepEqual(result.termination, { kind: "campaign_cancelled", evidence: "campaign.cancelled" });
  assert.equal(result.operationalAlert, null);
});

test("real provider persistence uncertainty is separate from terminal lifecycle", () => {
  const result = projectCampaignLifecyclePresentation({
    campaignId: "pending-provider",
    status: "cancelled",
    providerAcceptancePersistencePending: true,
    events: [{ eventName: "campaign.cancelled", messageId: "pending-provider", createdAt: at("2026-10-26T10:00:00Z") }],
  });
  assert.deepEqual(result.termination, { kind: "campaign_cancelled", evidence: "campaign.cancelled" });
  assert.deepEqual(result.operationalAlert, {
    predicate: "provider_acceptance_persistence_pending",
    evidence: "campaign.message.provider_accepted_without_matching_outbound",
  });
});

test("non-terminal states preserve lifecycle without fabricating termination", () => {
  for (const status of ["draft", "completed", "failed", "blocked"]) {
    const result = projectCampaignLifecyclePresentation({
      campaignId: status,
      status,
      providerAcceptancePersistencePending: false,
      events: [],
    });
    assert.equal(result.termination, null);
    assert.equal(result.operationalAlert, null);
  }
});

test("events remain tenant-read-model scoped by exact campaign id", () => {
  const result = projectCampaignLifecyclePresentation({
    campaignId: "target",
    status: "cancelled",
    providerAcceptancePersistencePending: false,
    events: [{ eventName: "campaign.draft.discarded", messageId: "other", createdAt: at("2026-10-26T10:00:00Z") }],
  });
  assert.deepEqual(result.termination, { kind: "campaign_cancelled", evidence: "campaign.status.cancelled" });
});
