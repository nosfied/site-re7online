import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCrmBusinessStatuses } from "./tenantConfig.js";

test("CRM system NEW status is mandatory active and campaign eligible by default", () => {
  const statuses = normalizeCrmBusinessStatuses([
    { id: "NEW", label: "Novo", isActive: false, campaignEligible: true },
    { id: "QUALIFIED", label: "Qualificado", isActive: true, campaignEligible: true },
  ]);

  const systemNew = statuses.find((status) => status.id === "NEW");
  assert.ok(systemNew);
  assert.equal(systemNew.isActive, true);
  assert.equal(systemNew.campaignEligible, true);
});

test("CRM system NEW status is restored when tenant settings omit it", () => {
  const statuses = normalizeCrmBusinessStatuses([
    { id: "QUALIFIED", label: "Qualificado", isActive: true, campaignEligible: true },
  ]);

  assert.equal(statuses[0]?.id, "NEW");
  assert.equal(statuses[0]?.isActive, true);
  assert.equal(statuses[0]?.campaignEligible, true);
});

test("CRM system NEW status can only be made campaign-ineligible by explicit campaign setting", () => {
  const statuses = normalizeCrmBusinessStatuses([
    { id: "NEW", label: "Novo", isActive: false, campaignEligible: false },
  ]);

  assert.equal(statuses[0]?.id, "NEW");
  assert.equal(statuses[0]?.isActive, true);
  assert.equal(statuses[0]?.campaignEligible, false);
});
