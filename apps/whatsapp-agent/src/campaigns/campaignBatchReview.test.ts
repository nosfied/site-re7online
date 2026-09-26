import { spawnSync } from "node:child_process";
import "./campaignOperationsTestSupport.js";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { getPrisma } from "../db.js";
import { createCsvCampaignBatch, CampaignBatchIdempotencyConflict } from "./campaignCsvBatch.js";
import { resolveCampaignRecipientImportPlan } from "./campaignRecipientImport.js";
import { readPrivateCampaignSeedFields } from "./campaignSeedPrivacy.js";
import { claimNextCampaignExecutionJob, finishCampaignExecutionJob } from "./campaignExecutionQueue.js";

process.env.APP_AUTH_SECRET ||= "batch-review-local-test-secret";
const prisma = getPrisma();
test.after(() => prisma.$disconnect());
async function tenant(t: { after: (fn: () => Promise<void>) => void }) {
  const client = await prisma.client.create({ data: { clientKey: `batch-review-${crypto.randomUUID()}`, name: "Batch review", profile: "business", features: { campaigns: true } } });
  t.after(async () => {
    await prisma.tenantCampaignExecutionLease.deleteMany({ where: { clientId: client.id } });
    await prisma.campaignExecutionJob.deleteMany({ where: { clientId: client.id } });
    await prisma.campaignExecutionBatchCampaign.deleteMany({ where: { clientId: client.id } });
    await prisma.campaignExecutionBatch.deleteMany({ where: { clientId: client.id } });
    await prisma.event.deleteMany({ where: { clientId: client.id } });
    await prisma.message.deleteMany({ where: { conversation: { clientId: client.id } } });
    await prisma.conversationRuntimeState.deleteMany({ where: { clientId: client.id } });
    await prisma.conversation.deleteMany({ where: { clientId: client.id } });
    await prisma.outboundMessage.deleteMany({ where: { clientId: client.id } });
    await prisma.lead.deleteMany({ where: { tenantId: client.id } });
    await prisma.contact.deleteMany({ where: { clientId: client.id } });
    await prisma.department.updateMany({ where: { clientId: client.id }, data: { operationalQueueId: null } });
    await prisma.queue.deleteMany({ where: { clientId: client.id } });
    await prisma.department.deleteMany({ where: { clientId: client.id } });
    await prisma.campaign.deleteMany({ where: { clientId: client.id } });
    await prisma.template.deleteMany({ where: { clientId: client.id } });
    await prisma.client.delete({ where: { id: client.id } });
  });
  return client;
}

test("review CSV rolls back second child failure; concurrent retries persist one complete batch and bind content", async (t) => {
  const c = await tenant(t);
  const template = await prisma.template.create({ data: { clientId: c.id, name: `csv-${crypto.randomUUID()}`, category: "UTILITY", language: "pt_BR", status: "approved", content: "Ola {{1}}", variables: ["1"] } });
  const recipients = Array.from({ length: 3001 }, (_, i) => ({ phone: `5541940${String(i).padStart(6, "0")}`, variables: { "1": `Name ${i}` } }));
  const plan = await resolveCampaignRecipientImportPlan(prisma, { clientId: c.id, template: { templateId: template.id, templateName: template.name, category: template.category, templateContent: template.content }, recipients });
  const params = { clientId: c.id, actorId: "local-test", requestId: "same-operation", name: "CSV transactional", templateId: template.id, templateName: template.name, payload: { csv: recipients, name: "CSV transactional" }, returnDestination: {}, plan };
  await assert.rejects(createCsvCampaignBatch(prisma, { ...params, beforeChild: (index) => { if (index === 2) throw new Error("second_child_interruption"); } }), /second_child_interruption/);
  for (const count of await Promise.all([prisma.campaign.count({ where: { clientId: c.id } }), prisma.campaignExecutionBatch.count({ where: { clientId: c.id } }), prisma.event.count({ where: { clientId: c.id } })])) assert.equal(count, 0);
  const [a, b] = await Promise.all([createCsvCampaignBatch(prisma, params), createCsvCampaignBatch(prisma, params)]);
  assert.equal(a.batchId, b.batchId);
  assert.deepEqual([a.idempotent, b.idempotent].sort(), [false, true]);
  assert.deepEqual(a.campaigns.map((child) => child.totalRecipients), [1000, 1000, 1000, 1]);
  assert.equal(await prisma.campaign.count({ where: { clientId: c.id } }), 4);
  assert.equal(await prisma.event.count({ where: { clientId: c.id, eventName: "campaign.csv_group.created" } }), 1);
  const seeds = await prisma.event.findMany({ where: { clientId: c.id, eventName: "campaign.seed.saved" } });
  assert.equal(seeds.flatMap((seed) => readPrivateCampaignSeedFields(seed.payloadJson).recipients).length, 3001);
  await assert.rejects(createCsvCampaignBatch(prisma, { ...params, payload: { different: true } }), CampaignBatchIdempotencyConflict);
  assert.equal(await prisma.campaign.count({ where: { clientId: c.id } }), 4);
});

test("review claim skips more than twenty old jobs of a blocked tenant without starving a free tenant", async (t) => {
  const a = await tenant(t), b = await tenant(t);
  const now = new Date("2002-01-01T00:00:00Z");
  await prisma.campaignExecutionJob.create({ data: { clientId: a.id, kind: "test_send", status: "needs_review", eligibleAt: new Date("2000-01-01"), idempotencyKey: "block" } });
  await prisma.campaignExecutionJob.createMany({ data: Array.from({ length: 25 }, (_, i) => ({ clientId: a.id, kind: "campaign", status: "queued", eligibleAt: new Date("2000-01-01"), idempotencyKey: `old:${i}` })) });
  const free = await prisma.campaignExecutionJob.create({ data: { clientId: b.id, kind: "campaign", status: "queued", eligibleAt: new Date("2001-01-01"), idempotencyKey: "free" } });
  const claimed = await claimNextCampaignExecutionJob({ now });
  assert.equal(claimed?.id, free.id);
  assert.equal(await prisma.campaignExecutionJob.count({ where: { clientId: a.id, status: "running" } }), 0);
  await finishCampaignExecutionJob({ clientId: b.id, jobId: claimed!.id, leaseToken: claimed!.leaseToken, status: "completed" });
});

// Real DB and real queue/runner, with a controllable simulated provider boundary.
import { processDueScheduledCampaigns, getRunningCampaignPromiseForTests, setCampaignRunnerSleepForTests, setCampaignBatchMaterializationHookForTests, updateBatchProgressAfterChunk } from "./campaignRunner.js";
import { applyCampaignExecutionBatchAction } from "./campaignBatchControl.js";
import { buildPrivateCampaignSeedFields } from "./campaignSeedPrivacy.js";
import { markCampaignExecutionJobNeedsReview, acquireTemporaryTenantCampaignExecutionLease } from "./campaignExecutionQueue.js";
process.env.WHATSAPP_ACCESS_TOKEN ||= "review-fake-token";
process.env.WHATSAPP_PHONE_NUMBER_ID ||= "review-fake-phone";

async function waitUntil(check: () => Promise<boolean>, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check()) return; await new Promise((r) => setTimeout(r, 20)); }
  assert.fail("review condition timed out");
}
async function fixture(t: Parameters<typeof tenant>[0], dynamic = false) {
  const c = await tenant(t);
  const template = await prisma.template.create({ data: { clientId: c.id, name: `review-${crypto.randomUUID()}`, language: "pt_BR", category: "UTILITY", status: "approved", content: "Aviso {{1}}", variables: ["1"] } });
  const now = new Date();
  const batch = await prisma.campaignExecutionBatch.create({ data: { clientId: c.id, name: "Review batch", sourceMode: dynamic ? "DYNAMIC_CRM_FILTER" : "STATIC_SELECTION", status: "scheduled", eligibleAt: now, chunkCount: dynamic ? 0 : 2, idempotencyKey: crypto.randomUUID() } });
  async function child(index: number, recipients: string[], standalone = false) {
    const campaign = await prisma.campaign.create({ data: { clientId: c.id, templateId: template.id, templateName: template.name, name: `Review child ${index}`, status: "scheduled", scheduledAt: null, totalRecipients: recipients.length } });
    if (!standalone) await prisma.campaignExecutionBatchCampaign.create({ data: { clientId: c.id, batchId: batch.id, campaignId: campaign.id, chunkIndex: index, status: "scheduled", recipientCount: recipients.length } });
    await prisma.event.create({ data: { clientId: c.id, messageId: campaign.id, requestId: crypto.randomUUID(), eventName: "campaign.seed.saved", payloadJson: {
      campaignId: campaign.id, templateId: template.id, name: campaign.name, templateName: template.name, templateParams: [], templateVariableMappings: [], returnDestination: null, source: "review",
      ...buildPrivateCampaignSeedFields({ clientId: c.id, waIds: recipients, componentsByWaId: Object.fromEntries(recipients.map((id) => [id, [{ type: "body", parameters: [{ type: "text", text: id }] }]])) }),
    } } });
    await prisma.campaignExecutionJob.create({ data: { clientId: c.id, campaignId: campaign.id, batchId: standalone ? null : batch.id, chunkIndex: standalone ? null : index, sequence: index, kind: standalone ? "campaign" : "batch_chunk", status: "queued", eligibleAt: standalone ? new Date(now.getTime() - 10000) : now, idempotencyKey: crypto.randomUUID() } });
    return campaign;
  }
  const action = (action: "pause" | "resume" | "cancel") => applyCampaignExecutionBatchAction(prisma, { clientId: c.id, batchId: batch.id, action, userId: "test-owner", requestId: crypto.randomUUID() });
  return { c, template, batch, now, child, action };
}

for (const action of ["pause", "cancel", "failure", "pause_failure", "needs_review"] as const) {
  test(`review ${action} during provider call preserves group stop and accepted result`, async (t) => {
    const f = await fixture(t);
    const first = await f.child(1, ["5541941000001", "5541941000002"]);
    await f.child(2, ["5541941000003"]);
    t.after(setCampaignRunnerSleepForTests(async () => undefined));
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let calls = 0;
    const failure = action === "failure" || action === "pause_failure";
    const original = globalThis.fetch;
    globalThis.fetch = async () => { calls++; await gate; return new Response(JSON.stringify(failure ? { error: { message: "simulated permanent rejection", code: 100 } } : { messages: [{ id: `wamid.review.${crypto.randomUUID()}` }] }), { status: failure ? 400 : 200, headers: { "content-type": "application/json" } }); };
    t.after(() => { globalThis.fetch = original; release(); });
    const processed = await processDueScheduledCampaigns({ now: f.now, limit: 1 });
    const task = getRunningCampaignPromiseForTests(first.id);
    assert.ok(task, `Expected running first child: ${JSON.stringify(processed)}`);
    try {
      await waitUntil(async () => calls === 1);
      if (action === "pause_failure") assert.equal((await f.action("pause")).ok, true);
      if (action === "pause" || action === "cancel") assert.equal((await f.action(action)).ok, true);
      if (action === "needs_review") {
        const job = await prisma.campaignExecutionJob.findFirstOrThrow({ where: { batchId: f.batch.id, status: "running" } });
        await markCampaignExecutionJobNeedsReview({ clientId: f.c.id, jobId: job.id, reason: "review_interruption" });
      }
    } finally { release(); await task; }
    assert.equal(calls, 1);
    const batch = await prisma.campaignExecutionBatch.findUniqueOrThrow({ where: { id: f.batch.id } });
    assert.equal(batch.status, action === "pause" ? "paused" : failure ? "failed" : "needs_review");
    const next = await prisma.campaignExecutionJob.findFirstOrThrow({ where: { batchId: f.batch.id, chunkIndex: 2 } });
    assert.notEqual(next.status, "queued");
    assert.equal(await prisma.event.count({ where: { clientId: f.c.id, eventName: "campaign.message.provider_accepted" } }), failure ? 0 : 1);
    if (action === "pause") {
      assert.equal((await f.action("resume")).ok, true);
      await processDueScheduledCampaigns({ limit: 1 });
      await waitUntil(async () => (await prisma.campaignExecutionBatch.findUnique({ where: { id: f.batch.id } }))?.status === "completed");
      assert.equal(calls, 3, "resume must not resend the accepted first recipient");
    } else {
      assert.equal((await f.action("resume")).ok, false);
      await processDueScheduledCampaigns({ limit: 1 });
      assert.equal(calls, 1);
    }
  });
}

test("review cancelled children cannot become a completed group", async (t) => {
  const f = await fixture(t); const first = await f.child(1, ["5541941000101"]); await f.child(2, ["5541941000102"]);
  assert.equal((await f.action("cancel")).ok, true);
  await updateBatchProgressAfterChunk({ clientId: f.c.id, batchId: f.batch.id, campaignId: first.id, chunkIndex: 1 });
  assert.equal((await prisma.campaignExecutionBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).status, "cancelled");
});

test("review active group keeps continuity ahead of concurrently due standalone work", async (t) => {
  const f = await fixture(t);
  const first = await f.child(1, ["5541941000201"]);
  const second = await f.child(2, ["5541941000202"]);
  t.after(setCampaignRunnerSleepForTests(async () => undefined));
  let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
  const sent: string[] = []; const original = globalThis.fetch;
  globalThis.fetch = async (_input, init) => { const body = JSON.parse(String(init?.body)); sent.push(body.to); if (sent.length === 1) await gate; return new Response(JSON.stringify({ messages: [{ id: `wamid.continuity.${sent.length}` }] }), { status: 200, headers: { "content-type": "application/json" } }); };
  t.after(() => { globalThis.fetch = original; release(); });
  await processDueScheduledCampaigns({ now: f.now, limit: 1 });
  const task = getRunningCampaignPromiseForTests(first.id);
  let standalone;
  try { await waitUntil(async () => sent.length === 1); standalone = await f.child(9, ["5541941000203"], true); assert.equal((await processDueScheduledCampaigns({ limit: 2 })).claimed, 0); }
  finally { release(); await task; }
  await waitUntil(async () => sent.length === 3);
  await waitUntil(async () => (await prisma.campaign.findUnique({ where: { id: standalone!.id } }))?.status === "completed");
  await getRunningCampaignPromiseForTests(second.id); await getRunningCampaignPromiseForTests(standalone!.id);
  assert.deepEqual(sent, ["5541941000201", "5541941000202", "5541941000203"]);
});

test("review dynamic controller resumes without children and reuses snapshot across both interruption boundaries", async (t) => {
  const f = await fixture(t, true);
  const ids = ["5541941000301", "5541941000302", "5541941000303"];
  await prisma.lead.createMany({ data: ids.map((id, i) => ({ tenantId: f.c.id, waId: id, waIdCanonical: id, name: `Original ${i}`, status: "QUALIFIED" })) });
  const parent = await prisma.campaign.create({ data: { clientId: f.c.id, templateId: f.template.id, templateName: f.template.name, name: "Dynamic controller", status: "scheduled", scheduledAt: null } });
  await prisma.campaignExecutionBatch.update({ where: { id: f.batch.id }, data: { metadata: { parentCampaignId: parent.id, clientKey: f.c.clientKey } } });
  await prisma.event.create({ data: { clientId: f.c.id, messageId: parent.id, requestId: crypto.randomUUID(), eventName: "campaign.seed.saved", payloadJson: { campaignId: parent.id, templateId: f.template.id, name: parent.name, templateName: f.template.name, templateParams: [], templateVariableMappings: [{ position: "1", source: "contact.displayName" }], returnDestination: null, source: "dynamic_crm_filter", selectionMode: "DYNAMIC_CRM_FILTER", dynamicFilter: { version: 1, crmBusinessStatusId: "QUALIFIED" }, ...buildPrivateCampaignSeedFields({ clientId: f.c.id, waIds: [] }) } } });
  await prisma.campaignExecutionJob.create({ data: { clientId: f.c.id, batchId: f.batch.id, campaignId: null, kind: "batch_chunk", status: "queued", eligibleAt: f.now, idempotencyKey: `dynamic-batch:${f.batch.id}:materialize` } });
  assert.equal((await f.action("pause")).ok, true); assert.equal((await f.action("resume")).ok, true);
  let providerCalls = 0; const original = globalThis.fetch;
  globalThis.fetch = async () => { providerCalls++; throw new Error("unexpected_provider"); };
  t.after(() => { globalThis.fetch = original; setCampaignBatchMaterializationHookForTests(null); });
  setCampaignBatchMaterializationHookForTests((phase) => { if (phase === "after_snapshot") throw new Error("snapshot_interruption"); });
  await assert.rejects(processDueScheduledCampaigns({ now: f.now, limit: 1 }), /snapshot_interruption/);
  assert.equal(await prisma.campaignExecutionBatchCampaign.count({ where: { batchId: f.batch.id } }), 0);
  await prisma.lead.updateMany({ where: { tenantId: f.c.id }, data: { name: "Changed", status: "NURTURE" } });
  await prisma.lead.create({ data: { tenantId: f.c.id, waId: "5541941000399", name: "New", status: "QUALIFIED" } });
  setCampaignBatchMaterializationHookForTests((phase) => { if (phase === "before_enqueue") throw new Error("enqueue_interruption"); });
  await assert.rejects(processDueScheduledCampaigns({ now: new Date(f.now.getTime() + 100000), limit: 1 }), /enqueue_interruption/);
  assert.equal(await prisma.campaignExecutionBatchCampaign.count({ where: { batchId: f.batch.id } }), 0, "children roll back with missing enqueue");
  assert.equal(await prisma.campaignExecutionJob.count({ where: { batchId: f.batch.id } }), 1);
  setCampaignBatchMaterializationHookForTests(null);
  await processDueScheduledCampaigns({ now: new Date(f.now.getTime() + 200000), limit: 1 });
  const children = await prisma.campaignExecutionBatchCampaign.findMany({ where: { batchId: f.batch.id } });
  assert.equal(children.length, 1);
  const event = await prisma.event.findFirstOrThrow({ where: { clientId: f.c.id, messageId: children[0].campaignId, eventName: "campaign.seed.saved" } });
  const seed = readPrivateCampaignSeedFields(event.payloadJson);
  assert.deepEqual(new Set(seed.recipients), new Set(ids));
  assert.equal(seed.componentsByWaId?.[ids[0]]?.[0].parameters[0].text, "Original 0");
  assert.equal(await prisma.event.count({ where: { clientId: f.c.id, eventName: "campaign.dynamic_batch_snapshot.created" } }), 1);
  assert.equal(await prisma.campaignExecutionJob.count({ where: { batchId: f.batch.id, campaignId: { not: null }, status: "queued" } }), 1);
  // Recover the legacy gap where children were committed before their jobs.
  await prisma.campaignExecutionJob.deleteMany({ where: { batchId: f.batch.id, campaignId: { not: null } } });
  await prisma.campaignExecutionJob.updateMany({ where: { batchId: f.batch.id, campaignId: null }, data: { status: "running", leaseExpiresAt: f.now } });
  await processDueScheduledCampaigns({ now: new Date(f.now.getTime() + 300000), limit: 1 });
  assert.deepEqual((await prisma.campaignExecutionBatchCampaign.findMany({ where: { batchId: f.batch.id } })).map((link) => link.campaignId), children.map((link) => link.campaignId));
  assert.equal(await prisma.campaignExecutionJob.count({ where: { batchId: f.batch.id, campaignId: { not: null } } }), 1);
  assert.equal(await prisma.event.count({ where: { clientId: f.c.id, eventName: "campaign.dynamic_batch_snapshot.created" } }), 1);
  assert.equal((await prisma.campaignExecutionBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).effectiveStartedAt?.toISOString(), f.now.toISOString(), "materialization/recovery must preserve the first controller claim");
  assert.equal(providerCalls, 0);
});


test("review concurrent claims have one tenant winner and test-send cannot take the gap between chunks", async (t) => {
  const f = await fixture(t);
  await f.child(1, ["5541941000401"]); await f.child(2, ["5541941000402"]);
  const results = await Promise.all([claimNextCampaignExecutionJob({ now: f.now }), claimNextCampaignExecutionJob({ now: f.now })]);
  const winners = results.filter((job) => job?.batchId === f.batch.id);
  assert.equal(winners.length, 1);
  const first = winners[0]!;
  await finishCampaignExecutionJob({ clientId: f.c.id, jobId: first.id, leaseToken: first.leaseToken, status: "completed" });
  assert.equal((await acquireTemporaryTenantCampaignExecutionLease({ clientId: f.c.id, purpose: "review-test-send" })).ok, false);
  const second = await claimNextCampaignExecutionJob({ now: f.now });
  assert.equal(second?.batchId, f.batch.id);
  assert.equal(second?.chunkIndex, 2);
  await finishCampaignExecutionJob({ clientId: f.c.id, jobId: second!.id, leaseToken: second!.leaseToken, status: "completed" });
});


test("group first effective start survives chunk claims and pause/resume; job starts remain individual", async (t) => {
  const f = await fixture(t);
  const first = await f.child(1, ["5541941000501"]);
  await f.child(2, ["5541941000502"]);
  const one = await claimNextCampaignExecutionJob({ now: f.now });
  assert.equal(one?.batchId, f.batch.id);
  await prisma.campaign.update({ where: { id: first.id }, data: { status: "completed" } });
  await finishCampaignExecutionJob({ clientId: f.c.id, jobId: one!.id, leaseToken: one!.leaseToken, status: "completed" });
  assert.equal((await f.action("pause")).ok, true);
  assert.equal((await f.action("resume")).ok, true);
  const secondStart = new Date(f.now.getTime() + 20000);
  const two = await claimNextCampaignExecutionJob({ now: secondStart });
  assert.equal(two?.chunkIndex, 2);
  const batch = await prisma.campaignExecutionBatch.findUniqueOrThrow({ where: { id: f.batch.id } });
  assert.equal(batch.effectiveStartedAt?.toISOString(), f.now.toISOString());
  const jobs = await prisma.campaignExecutionJob.findMany({ where: { batchId: f.batch.id }, orderBy: { chunkIndex: "asc" } });
  assert.deepEqual(jobs.map((job) => job.startedAt?.toISOString()), [f.now.toISOString(), secondStart.toISOString()]);
  await finishCampaignExecutionJob({ clientId: f.c.id, jobId: two!.id, leaseToken: two!.leaseToken, status: "completed" });
});

import { campaignOperationsStatus, setCampaignOperations } from "./campaignOperations.js";
test("operational close drains accepted call, preserves intent/snapshot and returns through existing queue without duplicate", async t => {
  const f = await fixture(t);
  const first = await f.child(1, ["5541941000801", "5541941000802"]);
  await f.child(2, ["5541941000803"]);
  t.after(setCampaignRunnerSleepForTests(async () => undefined));
  let release!: () => void; const gate = new Promise<void>(r => { release = r; });
  const sent: string[] = []; const original = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    sent.push(JSON.parse(String(init?.body)).to);
    if (sent.length === 1) await gate;
    return new Response(JSON.stringify({ messages: [{ id: `wamid.operational.${sent.length}` }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  t.after(() => { globalThis.fetch = original; release(); });
  const seedsBefore = await prisma.event.findMany({ where: { clientId: f.c.id, eventName: "campaign.seed.saved" }, orderBy: { id: "asc" } });
  await processDueScheduledCampaigns({ now: f.now, limit: 1 });
  const task = getRunningCampaignPromiseForTests(first.id); assert.ok(task);
  await waitUntil(async () => sent.length === 1);
  setCampaignOperations(false, campaignOperationsStatus().generation!, "local-operator", "drain active group");
  assert.equal(campaignOperationsStatus().drained, false);
  release(); await task;
  assert.equal(campaignOperationsStatus().drained, true);
  assert.equal((await prisma.campaign.findUniqueOrThrow({ where: { id: first.id } })).status, "sending", "admin suspension must not change user intention");
  assert.equal((await prisma.campaignExecutionBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).status, "running");
  assert.equal(await prisma.campaignExecutionJob.count({ where: { batchId: f.batch.id, status: "queued" } }), 2);
  assert.equal((await processDueScheduledCampaigns()).claimed, 0); assert.equal(sent.length, 1);
  if (process.env.CAMPAIGN_RECOVERY_WORKTREE) {
    const probe = spawnSync(process.execPath, ["--import", new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url).href,
      new URL("../../scripts/campaign-guard-recovery-probe.ts", import.meta.url).pathname], {
      env: { ...process.env, LOCAL_CAMPAIGN_REHEARSAL: "synthetic-only" }, encoding: "utf8",
    });
    assert.equal(probe.status, 0, probe.stderr);
    assert.match(probe.stdout, /"unchanged":true/);
  }
  setCampaignOperations(true, campaignOperationsStatus().generation!, "local-operator", "resume validated candidate");
  await processDueScheduledCampaigns({ limit: 1 });
  await waitUntil(async () => (await prisma.campaignExecutionBatch.findUnique({ where: { id: f.batch.id } }))?.status === "completed");
  assert.deepEqual(sent, ["5541941000801", "5541941000802", "5541941000803"]);
  assert.deepEqual(await prisma.event.findMany({ where: { clientId: f.c.id, eventName: "campaign.seed.saved" }, orderBy: { id: "asc" } }), seedsBefore);
});

for (const stop of ["paused", "cancelled"] as const) {
  test(`standalone user ${stop} during provider preserves acceptance and prevents remaining attempts`, async t => {
    const f = await fixture(t); const first = await f.child(1, ["5541941000901", "5541941000902"], true);
    t.after(setCampaignRunnerSleepForTests(async () => undefined));
    let release!: () => void; const gate = new Promise<void>(r => { release = r; }); let calls = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async () => { calls++; await gate; return new Response(JSON.stringify({ messages: [{ id: `wamid.standalone.${calls}` }] }), { status: 200, headers: { "content-type": "application/json" } }); };
    t.after(() => { globalThis.fetch = original; release(); });
    await processDueScheduledCampaigns({ limit: 1 }); const work = getRunningCampaignPromiseForTests(first.id); assert.ok(work);
    await waitUntil(async () => calls === 1);
    await prisma.campaign.update({ where: { id: first.id }, data: { status: stop } });
    release(); await work;
    assert.equal(calls, 1); assert.equal(await prisma.event.count({ where: { clientId: f.c.id, eventName: "campaign.message.provider_accepted" } }), 1);
    assert.equal((await prisma.campaign.findUniqueOrThrow({ where: { id: first.id } })).status, stop);
    assert.equal((await prisma.campaignExecutionJob.findFirstOrThrow({ where: { campaignId: first.id } })).status, stop);
    await processDueScheduledCampaigns({ limit: 1 }); assert.equal(calls, 1);
  });
}


import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { holdCampaignLedgerLock } from "./campaignOperationsContentionTestSupport.js";
for (const fault of ["writer-contention", "ledger-write", "ledger-and-sql"] as const) {
  test(`known acceptance persists in SQL despite ${fault}, with no next recipient or blind retry`, async t => {
    const f = await fixture(t);
    const first = await f.child(1, ["5541941000701", "5541941000702"]);
    const originalFile = process.env.CAMPAIGN_OPERATIONS_FILE;
    process.env.CAMPAIGN_OPERATIONS_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "receipt-sql-")), "state.json");
    setCampaignOperations(true, 0, "synthetic-operator", "receipt persistence test");
    t.after(() => { process.env.CAMPAIGN_OPERATIONS_FILE = originalFile; });
    t.after(setCampaignRunnerSleepForTests(async () => undefined));
    const originalFetch = globalThis.fetch, rename = fs.renameSync;
    let writer: Awaited<ReturnType<typeof holdCampaignLedgerLock>> | undefined;
    let calls = 0;
    const originalCreate = prisma.event.create;
    t.after(() => { prisma.event.create = originalCreate; });
    t.after(async () => { globalThis.fetch = originalFetch; fs.renameSync = rename; if (writer) await writer.release(); });
    globalThis.fetch = async () => {
      calls++;
      if (fault === "writer-contention") writer = await holdCampaignLedgerLock();
      else fs.renameSync = ((from: fs.PathLike, to: fs.PathLike) => {
        if (String(to) === process.env.CAMPAIGN_OPERATIONS_FILE) throw Object.assign(new Error("simulated ledger EIO"), { code: "EIO" });
        return rename(from, to);
      }) as typeof fs.renameSync;
      if (fault === "ledger-and-sql") prisma.event.create = (async (args: any) => {
        if (args.data.eventName === "campaign.message.provider_accepted") throw new Error("synthetic SQL receipt unavailable");
        return originalCreate.call(prisma.event, args);
      }) as typeof prisma.event.create;
      return new Response(JSON.stringify({ messages: [{ id: `wamid.receipt.${fault}` }] }), { status: 200 });
    };
    await processDueScheduledCampaigns({ now: f.now, limit: 1 });
    const task = getRunningCampaignPromiseForTests(first.id); assert.ok(task); await task;
    assert.equal(calls, 1);
    if (fault === "ledger-and-sql") {
      assert.equal((await prisma.campaign.findUniqueOrThrow({ where: { id: first.id } })).status, "sending");
      assert.equal(await prisma.event.count({ where: { clientId: f.c.id, eventName: "campaign.message.failed" } }), 0);
      assert.equal(await prisma.event.count({ where: { clientId: f.c.id, eventName: "campaign.message.submit_started" } }), 1);
      assert.equal(campaignOperationsStatus().drained, false);
      fs.renameSync = rename; prisma.event.create = originalCreate;
      assert.equal((await processDueScheduledCampaigns()).claimed, 0); assert.equal(calls, 1);
      return;
    }
    assert.equal(await prisma.event.count({ where: { clientId: f.c.id, eventName: "campaign.message.provider_accepted" } }), 1);
    const accepted = await prisma.outboundMessage.findMany({ where: { clientId: f.c.id, metaMessageId: `wamid.receipt.${fault}` } });
    assert.equal(accepted.length, 1); assert.equal(accepted[0].status, "SENT");
    assert.equal(await prisma.event.count({ where: { clientId: f.c.id, eventName: "campaign.message.sent" } }), 1);
    assert.equal(await prisma.event.count({ where: { clientId: f.c.id, eventName: "campaign.message.failed" } }), 0);
    fs.renameSync = rename; if (writer) await writer.release();
    assert.equal(campaignOperationsStatus().open, false); assert.equal(campaignOperationsStatus().drained, false);
    assert.throws(() => setCampaignOperations(true, campaignOperationsStatus().generation!, "operator", "blind retry forbidden"));
    assert.equal((await processDueScheduledCampaigns()).claimed, 0); assert.equal(calls, 1);
    assert.equal((await prisma.campaign.findUniqueOrThrow({ where: { id: first.id } })).sentCount, 1);
  });
}
