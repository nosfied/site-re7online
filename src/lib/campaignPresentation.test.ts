import assert from "node:assert/strict";
import test from "node:test";
import { createCampaignReadGeneration, getCampaignListStatus, getCampaignPresentationLabel, isImmediateCampaignQueued, shouldRefreshCampaign } from "./campaignPresentation";

for (const source of ["manual_campaign_send", "crm_audience_preview", "recipient_import:csv"]) {
  test(`immediate ${source} is queued in sending tab without inventing a schedule`, () => {
    const campaign = Object.freeze({ status: "scheduled", scheduledAt: null, source });
    assert.equal(isImmediateCampaignQueued(campaign), true);
    assert.equal(getCampaignPresentationLabel(campaign), "Na fila de envio");
    assert.equal(getCampaignListStatus(campaign), "sending");
    assert.equal(shouldRefreshCampaign(campaign), true);
    assert.equal(campaign.status, "scheduled");
    assert.equal(campaign.scheduledAt, null);
  });
}

test("future schedule retains date and remains observable across its deadline", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-06T12:00:00Z") });
  const campaign = Object.freeze({ status: "scheduled", scheduledAt: "2026-10-06T13:00:00Z" });
  assert.equal(getCampaignPresentationLabel(campaign), "Agendada");
  assert.equal(getCampaignListStatus(campaign), "scheduled");
  assert.equal(shouldRefreshCampaign(campaign), true);
  t.mock.timers.tick(3_600_001);
  assert.equal(campaign.scheduledAt, "2026-10-06T13:00:00Z");
  assert.equal(isImmediateCampaignQueued(campaign), false);
  assert.equal(shouldRefreshCampaign(campaign), true); // time alone cannot assert sending
});

test("queued then running then completed stops polling without rewriting result evidence", () => {
  const result = { sent: 1, failed: 1, status: "completed", scheduledAt: null };
  assert.equal(shouldRefreshCampaign({ status: "sending" }), true);
  assert.equal(getCampaignPresentationLabel({ status: "sending" }), "Enviando...");
  assert.equal(shouldRefreshCampaign(result), false);
  assert.equal(getCampaignPresentationLabel(result), "Concluída");
  assert.deepEqual(result, { sent: 1, failed: 1, status: "completed", scheduledAt: null });
});

for (const status of ["draft", "failed", "blocked", "cancelled", "paused"]) {
  test(`${status} is not polled as a queued execution`, () => {
    assert.equal(shouldRefreshCampaign({ status, scheduledAt: null }), false);
    assert.equal(isImmediateCampaignQueued({ status, scheduledAt: null }), false);
  });
}

test("selection change invalidates detail but preserves the tenant list; switching back cannot revive an old detail", async () => {
  const reads = createCampaignReadGeneration();
  const pendingA = reads.begin("detail");
  const pendingList = reads.begin("list");
  reads.invalidate("detail");
  const b = reads.begin("detail");
  assert.equal(pendingA(), false);
  assert.equal(pendingList(), true);
  assert.equal(b(), true);
  reads.invalidate("detail");
  assert.equal(pendingA(), false);
  assert.equal(b(), false);
});

test("newer detail wins without invalidating an independent list; session/unmount invalidates both", () => {
  const reads = createCampaignReadGeneration();
  const oldDetail = reads.begin("detail");
  const list = reads.begin("list");
  const newDetail = reads.begin("detail");
  assert.equal(oldDetail(), false);
  assert.equal(newDetail(), true);
  assert.equal(list(), true);
  reads.invalidate();
  assert.equal(newDetail(), false);
  assert.equal(list(), false);
});
