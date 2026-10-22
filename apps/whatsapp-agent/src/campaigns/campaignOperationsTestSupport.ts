// Test fixture: use the real operational opening API with a fresh isolated file.
// No production bypass or implicit opening exists in campaignOperations.
import "./campaignProviderTestGuard.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { campaignOperationsStatus, setCampaignOperations } from "./campaignOperations.js";
if (process.env.NODE_ENV === "production") throw new Error("test_fixture_forbidden");
process.env.CAMPAIGN_OPERATIONS_TOPOLOGY = "single-host";
process.env.CAMPAIGN_OPERATIONS_HOST_ID = fs.readFileSync("/etc/machine-id", "utf8").trim();

export function useCampaignOperationsTestLedger(file: string) {
  process.env.CAMPAIGN_OPERATIONS_FILE = file;
  return campaignOperationsStatus();
}

export function createOpenCampaignOperationsTestLedger(label = "campaign-suite") {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`)), "operations.json");
  process.env.CAMPAIGN_OPERATIONS_FILE = file;
  const status = setCampaignOperations(true, 0, "synthetic-test-fixture", "campaign suite requires explicit admission");
  if (!status.available || !status.open || status.tasks.length !== 0) throw new Error("campaign_test_ledger_not_open");
  return { file, status };
}

createOpenCampaignOperationsTestLedger();
