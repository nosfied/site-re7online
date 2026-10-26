import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { withCampaignMediaAdmission } from "./campaignMediaAdmission.js";
import { campaignOperationsStatus, setCampaignOperations, CampaignOperationsClosed } from "../campaigns/campaignOperations.js";

function setup(open = false) {
  process.env.CAMPAIGN_OPERATIONS_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "media-admission-")), "state.json");
  process.env.CAMPAIGN_OPERATIONS_TOPOLOGY = "single-host";
  process.env.CAMPAIGN_OPERATIONS_HOST_ID = fs.readFileSync("/etc/machine-id", "utf8").trim();
  delete process.env.CAMPAIGN_RECOVERY_ONLY;
  if (open) setCampaignOperations(true, 0, "synthetic-test", "isolated upload test");
}

test("closed or unavailable ledger rejects campaign media before any persistence", () => {
  setup();
  let writes = 0;
  const persist = async () => { writes++; };
  assert.throws(() => withCampaignMediaAdmission("CAMPAIGN", persist), CampaignOperationsClosed);
  fs.writeFileSync(process.env.CAMPAIGN_OPERATIONS_FILE!, "corrupt");
  assert.throws(() => withCampaignMediaAdmission("CAMPAIGN", persist), CampaignOperationsClosed);
  assert.equal(writes, 0);
});

test("an earlier open preflight grants no authority after closure", () => {
  setup(true);
  assert.equal(campaignOperationsStatus().open, true);
  setCampaignOperations(false, campaignOperationsStatus().generation!, "synthetic-test", "close after preflight");
  assert.throws(() => withCampaignMediaAdmission("CAMPAIGN", async () => assert.fail("no file or SQL write")), CampaignOperationsClosed);
});

test("admitted persistence remains tracked until the file and asset operation settles", async () => {
  setup(true);
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const upload = withCampaignMediaAdmission("CAMPAIGN", () => pending);
  assert.equal(campaignOperationsStatus().tasks[0]?.kind, "campaign-media-upload");
  setCampaignOperations(false, campaignOperationsStatus().generation!, "synthetic-test", "drain upload");
  assert.equal(campaignOperationsStatus().drained, false);
  finish();
  await upload;
  assert.equal(campaignOperationsStatus().drained, true);
  assert.equal(campaignOperationsStatus().open, false);
});

test("template examples remain available while campaigns are suspended", async () => {
  setup();
  assert.equal(await withCampaignMediaAdmission("TEMPLATE_EXAMPLE", async () => "example"), "example");
  assert.equal(campaignOperationsStatus().tasks.length, 0);
});

test("failed persistence releases its own admission and preserves closure", async () => {
  setup(true);
  await assert.rejects(withCampaignMediaAdmission("CAMPAIGN", async () => { throw new Error("storage failure"); }), /storage failure/);
  assert.equal(campaignOperationsStatus().tasks.length, 0);
});
