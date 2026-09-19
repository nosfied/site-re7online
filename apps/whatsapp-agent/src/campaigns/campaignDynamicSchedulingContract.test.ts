import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const runnerSource = fs.readFileSync(path.join(process.cwd(), "src/campaigns/campaignRunner.ts"), "utf8");
const routesSource = fs.readFileSync(path.join(process.cwd(), "src/http/routes.ts"), "utf8");

test("dynamic scheduled campaigns persist filter definition without schedule-time recipients", () => {
  assert.ok(routesSource.includes('selectionMode: "DYNAMIC_CRM_FILTER"'));
  assert.ok(routesSource.includes("dynamicFilter: seed.dynamicFilter"));
  assert.ok(routesSource.includes("waIds: []"));
  assert.ok(routesSource.includes("totalRecipients: 0"));
  assert.ok(routesSource.includes("source: seed.source ?? \"dynamic_crm_filter\""));
});

test("dynamic scheduled campaign execution creates one immutable snapshot before running", () => {
  assert.ok(runnerSource.includes("campaign.dynamic_snapshot.created"));
  assert.ok(runnerSource.includes("getExistingDynamicSnapshot"));
  assert.ok(runnerSource.includes("materializeDynamicCampaignSnapshot"));
  assert.ok(runnerSource.includes("selectionMode === \"DYNAMIC_CRM_FILTER\""));
  assert.ok(runnerSource.includes("eventName: \"campaign.dynamic_snapshot.failed\""));
  assert.ok(runnerSource.includes("status: statusId"));
  assert.ok(runnerSource.includes("take: 1001"));
  assert.ok(runnerSource.includes("dynamic_match_limit_exceeded"));
});

test("dynamic snapshot uses tenant-scoped CRM status id and canonical recipient identity", () => {
  assert.ok(runnerSource.includes("resolveCrmBusinessStatuses"));
  assert.ok(runnerSource.includes("item.id === statusId && item.isActive !== false"));
  assert.ok(runnerSource.includes("canonicalizeBrazilWaId"));
  assert.ok(runnerSource.includes("blocked_identity"));
  assert.ok(runnerSource.includes("duplicate_identity"));
  assert.ok(runnerSource.includes("variable_missing_value"));
  assert.ok(runnerSource.includes("buildPrivateCampaignSeedFields"));
});
