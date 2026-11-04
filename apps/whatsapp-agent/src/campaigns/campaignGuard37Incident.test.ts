// Regression for the prevention that superseded the historical incident proof.
import "./campaignOperationsTestSupport.js";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";
import { campaignRecipientEligibility, normalizeCampaignRecipientIdentity } from "./campaignEligibility.js";
import { normalizeCrmWhatsappIdentity } from "../crm/crmWhatsappIdentity.js";
import { startCampaignRun, getRunningCampaignPromiseForTests } from "./campaignRunner.js";
import { enqueueCampaignExecutionJob, claimNextCampaignExecutionJob } from "./campaignExecutionQueue.js";

// Refuse any URL except the dedicated empty synthetic laboratory database.
const url = new URL(process.env.DATABASE_URL || "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55432");
assert.equal(url.pathname, "/re7_guard37_synthetic_20261010");
assert.equal(process.env.NODE_ENV, "test");
assert.ok(process.cwd().startsWith("/tmp/re7-guard37-"));
const db = getPrisma();

test("guard37: international identity is blocked before provider and does not close the global guard", async t => {
  const clientId = crypto.randomUUID(), clientKey = `guard37-synthetic-${clientId}`;
  const waId = "447700900123"; // Synthetic UK example, never sent to a real network.
  const metaId = "synthetic-meta-guard37-accepted-once";
  const templateName = "synthetic_guard37";
  t.after(async () => { await db.$disconnect(); });
  await db.client.create({ data: { id: clientId, clientKey, name: "Synthetic incident proof", profile: "business", features: { campaigns: true } } });
  await db.template.create({ data: { clientId, name: templateName, category: "UTILITY", language: "pt_BR", status: "approved", content: "Synthetic" } });
  const campaign = await db.campaign.create({ data: { clientId, name: "Synthetic incident", templateName, status: "sending", totalRecipients: 2 } });
  assert.equal(normalizeCampaignRecipientIdentity(waId), "");
  assert.equal(normalizeCrmWhatsappIdentity(waId), null);
  assert.equal(await campaignRecipientEligibility(db, clientId, [waId]), "unsupported_international_identity");
  const job = await enqueueCampaignExecutionJob({ clientId, campaignId: campaign.id, eligibleAt: new Date(0), kind: "campaign" });
  const claimed = await claimNextCampaignExecutionJob();
  assert.ok(claimed); assert.equal(claimed.id, job.id);
  const originalFetch = globalThis.fetch, originalError = logger.error;
  const errors: Array<Record<string, unknown>> = [];
  let submissions = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = String(input);
    assert.ok(target.startsWith("https://graph.facebook.com/"), "unexpected network attempt forbidden");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.to, "5541991100990");
    submissions++;
    const ledger = JSON.parse(fs.readFileSync(process.env.CAMPAIGN_OPERATIONS_FILE!, "utf8"));
    const child = Object.values(ledger.tasks).find((task: any) => task.kind === "provider") as any;
    assert.equal(child.phase, "provider_or_uncertain");
    assert.equal(await db.event.count({ where: { clientId, eventName: "campaign.message.submit_started" } }), 1);
    return new Response(JSON.stringify({ messages: [{ id: metaId }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  logger.error = ((value: any) => { errors.push(value); }) as typeof originalError;
  t.after(() => { globalThis.fetch = originalFetch; logger.error = originalError; });
  const id = startCampaignRun({ clientId, clientKey, campaignId: campaign.id, name: campaign.name, templateName,
    waIds: [waId, "5541991100990"], executionJob: claimed });
  assert.ok(id);
  const promise = getRunningCampaignPromiseForTests(campaign.id);
  assert.ok(promise); await promise;
  assert.equal(submissions, 1);
  const accepted = await db.event.findMany({ where: { clientId, eventName: "campaign.message.provider_accepted" } });
  assert.equal(accepted.length, 1);
  assert.equal((accepted[0].payloadJson as any).metaMessageId, metaId);
  assert.equal(await db.outboundMessage.count({ where: { clientId } }), 1);
  assert.equal(await db.event.count({ where: { clientId, eventName: "campaign.message.submit_started", messageId: `campaign.${campaign.id}.1` } }), 0);
  assert.equal(await db.event.count({ where: { clientId, eventName: "campaign.recipient.import_blocked", messageId: campaign.id } }), 1);
  assert.equal(errors.some(e => e.event === "campaign.result.persistence_pending"), false);
  let ledger: { open: boolean; tasks: Record<string, unknown> } = { open: false, tasks: {} };
  for (let attempt = 0; attempt < 40; attempt += 1) {
    ledger = JSON.parse(fs.readFileSync(process.env.CAMPAIGN_OPERATIONS_FILE!, "utf8"));
    if (Object.keys(ledger.tasks).length === 0) break;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.equal(ledger.open, true);
  const tasks = Object.values(ledger.tasks);
  assert.equal(tasks.length, 0);
  const completed = await db.campaignExecutionJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(completed.status, "completed");
  const finalCampaign = await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
  assert.equal(finalCampaign.status, "completed"); assert.equal(finalCampaign.sentCount, 1); assert.equal(finalCampaign.blockedCount, 1);
});
