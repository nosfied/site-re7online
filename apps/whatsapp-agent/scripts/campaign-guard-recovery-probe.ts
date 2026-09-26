// Local-only probe called while the candidate is drained. Does not start index.ts.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
const u = new URL(process.env.DATABASE_URL || "");
assert.equal(u.hostname, "127.0.0.1"); assert.equal(u.port, "55434"); assert.equal(u.pathname, "/re7_guard_local");
assert.equal(process.env.LOCAL_CAMPAIGN_REHEARSAL, "synthetic-only");
const recovery = process.env.CAMPAIGN_RECOVERY_WORKTREE!;
assert.ok(path.isAbsolute(recovery));
const expectedRevision = process.env.CAMPAIGN_RECOVERY_EXPECTED_SHA || "5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e";
assert.match(expectedRevision, /^[a-f0-9]{40}$/);
assert.equal(execFileSync("git", ["-C", recovery, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), expectedRevision);
execFileSync("git", ["-C", recovery, "merge-base", "--is-ancestor", "5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e", expectedRevision]);
globalThis.fetch = async () => { throw new Error("provider_forbidden_in_recovery_probe"); };
const load = (file: string) => import(pathToFileURL(path.join(recovery, "apps/whatsapp-agent/src", file)).href);
const { getPrisma } = await load("db.ts");
const { campaignOperationsStatus } = await load("campaigns/campaignOperations.ts");
const { processDueScheduledCampaigns, startCampaignRun } = await load("campaigns/campaignRunner.ts");
const db = getPrisma();
const snapshot = async () => JSON.stringify(await db.$queryRawUnsafe(`SELECT json_build_object(
 'campaigns', (SELECT json_agg(x ORDER BY id) FROM "Campaign" x),
 'jobs', (SELECT json_agg(x ORDER BY id) FROM "CampaignExecutionJob" x),
 'batches', (SELECT json_agg(x ORDER BY id) FROM "CampaignExecutionBatch" x),
 'events', (SELECT json_agg(x ORDER BY id) FROM "Event" x),
 'outbound', (SELECT json_agg(x ORDER BY id) FROM "OutboundMessage" x)) AS snapshot`));
try {
  const before = await snapshot();
  const status = campaignOperationsStatus(); assert.equal(status.open, false); assert.equal(status.drained, true);
  assert.equal((await processDueScheduledCampaigns()).claimed, 0);
  assert.equal(startCampaignRun({ campaignId: "synthetic", clientId: "synthetic", clientKey: "synthetic", name: "blocked", templateName: "fake", waIds: ["5541941000001"] }), null);
  assert.equal(await snapshot(), before);
  console.log(JSON.stringify({ recoveryClosed: true, sharedGeneration: status.generation, unchanged: true, providerCalls: 0 }));
} finally { await db.$disconnect(); }
