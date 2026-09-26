import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:http";
import { getPrisma } from "../db.js";
import { campaignOperationsStatus, setCampaignOperations } from "./campaignOperations.js";
import { processDueScheduledCampaigns, startCampaignRun } from "./campaignRunner.js";
import { handleRequest } from "../http/routes.js";
const u = new URL(process.env.DATABASE_URL!);
if (u.hostname !== "127.0.0.1" || u.port !== "55434" || !["/re7_guard_local", "/re7_guard_recovery_base"].includes(u.pathname)) throw new Error("isolated_DB_required");
test("recovery artifact blocks direct routes, internal runner and scheduler even with open config; preserves DB", async () => {
  process.env.CAMPAIGN_OPERATIONS_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "recovery-guard-")), "state.json");
  process.env.CAMPAIGN_RECOVERY_ONLY = "false"; // Cannot bypass the recovery build.
  fs.writeFileSync(process.env.CAMPAIGN_OPERATIONS_FILE, JSON.stringify({ version: 1, open: true, generation: 1, tasks: {}, audit: [] }));
  assert.equal(campaignOperationsStatus().open, false);
  assert.throws(() => setCampaignOperations(true, 1, "test", "cannot open recovery"));
  const prisma = getPrisma();
  const before = await prisma.campaign.findMany({ orderBy: { id: "asc" } });
  const queueTables = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='CampaignExecutionJob'`;
  assert.equal(Number(queueTables[0].count), u.pathname.endsWith("recovery_base") ? 0 : 1);
  assert.equal((await processDueScheduledCampaigns()).claimed, 0);
  assert.equal(startCampaignRun({ campaignId: "nonexistent", clientId: "nonexistent", clientKey: "synthetic", name: "no send", templateName: "fake", waIds: ["5541941000001"] }), null);
  const server = createServer((req, res) => { void handleRequest(req, res); });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const address = server.address() as { port: number };
  try {
    for (const route of ["/app/campaigns", "/app/campaigns/x/send", "/app/campaigns/x/test-send", "/admin/campaigns/run", "/public-api/v1/campaigns", "/public-api/v1/campaigns/x/recipients"]) {
      const response = await fetch(`http://127.0.0.1:${address.port}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      assert.equal(response.status, 503, route);
    }
    assert.deepEqual(await prisma.campaign.findMany({ orderBy: { id: "asc" } }), before);
  } finally { await new Promise<void>(r => server.close(() => r())); await prisma.$disconnect(); }
});


test("recovery diagnostics never report drain over the candidate shared uncertain fence", () => {
  process.env.CAMPAIGN_OPERATIONS_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "recovery-fence-")), "state.json");
  fs.writeFileSync(process.env.CAMPAIGN_OPERATIONS_FILE, JSON.stringify({ version: 1, open: false, generation: 2, tasks: {}, audit: [] }));
  fs.mkdirSync(`${process.env.CAMPAIGN_OPERATIONS_FILE}.uncertain`, { mode: 0o700 });
  assert.equal(campaignOperationsStatus().open, false);
  assert.equal(campaignOperationsStatus().drained, false);
  assert.throws(() => setCampaignOperations(true, 2, "test", "cannot bypass sticky fence"));
});
