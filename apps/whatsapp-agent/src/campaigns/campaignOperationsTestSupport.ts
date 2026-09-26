// Test fixture: use the real operational opening API with a fresh isolated file.
// No production bypass or implicit opening exists in campaignOperations.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setCampaignOperations } from "./campaignOperations.js";
if (process.env.NODE_ENV === "production") throw new Error("test_fixture_forbidden");
process.env.CAMPAIGN_OPERATIONS_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "campaign-suite-")), "operations.json");
process.env.CAMPAIGN_OPERATIONS_TOPOLOGY = "single-host";
process.env.CAMPAIGN_OPERATIONS_HOST_ID = fs.readFileSync("/etc/machine-id", "utf8").trim();
setCampaignOperations(true, 0, "synthetic-test-fixture", "campaign suite requires explicit admission");
