/** Local-only operational rehearsal. See RUNBOOK_WHATSAPP_AGENT.md. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const evidence = path.join(root, "local-evidence/recovery/rollout-local");
const phase = process.argv[2];
const url = new URL(process.env.DATABASE_URL ?? "");
assert.equal(process.env.LOCAL_CAMPAIGN_REHEARSAL, "synthetic-only");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55434");
assert.equal(url.pathname, "/re7_rollout_local");
assert.equal(url.search, "");
assert.ok(["rollout_owner", "rollout_runtime"].includes(url.username));
assert.equal(process.cwd(), path.join(evidence, "runtime"));
process.env.NODE_ENV = "test";
process.env.APP_AUTH_SECRET = "local-rollout-only-secret";
process.env.WHATSAPP_ACCESS_TOKEN = "LOCAL_SIMULATED_ONLY";
process.env.WHATSAPP_PHONE_NUMBER_ID = "local-simulated-phone";
process.env.CAMPAIGN_SCHEDULE_PROCESSOR_DISABLED = "true";
process.env.CHATBOT_INACTIVITY_PROCESSOR_DISABLED = "true";
const nativeFetch = globalThis.fetch;
let simulate: ((input: string, init?: RequestInit) => Promise<Response>) | null = null;
globalThis.fetch = async (input, init) => {
  const target = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (target.hostname === "127.0.0.1") return nativeFetch(input, init);
  if (simulate && target.hostname === "graph.facebook.com") return simulate(target.href, init);
  throw new Error("LOCAL_REHEARSAL_EXTERNAL_NETWORK_DENIED");
};
// Also fence HTTP clients that do not use fetch. All provider responses are in-memory.
for (const transport of [http, https]) {
  const request = transport.request;
  transport.request = function (...args: any[]) {
    const first = args[0];
    const host = typeof first === "string" || first instanceof URL ? new URL(first).hostname : first?.hostname ?? first?.host;
    assert.ok(host === "127.0.0.1" || host === "localhost", "external HTTP denied");
    return (request as any).apply(this, args);
  } as typeof request;
}
const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();
const { getPrisma } = await import("../src/db.js");
const runner = await import("../src/campaigns/campaignRunner.js");
const queue = await import("../src/campaigns/campaignExecutionQueue.js");
const { applyCampaignExecutionBatchAction: action } = await import("../src/campaigns/campaignBatchControl.js");
const { buildPrivateCampaignSeedFields: privateSeed } = await import("../src/campaigns/campaignSeedPrivacy.js");
runner.setCampaignRunnerSleepForTests(async () => undefined);
const read = (name: string) => JSON.parse(fs.readFileSync(path.join(evidence, name), "utf8"));
const write = (name: string, value: unknown) => fs.writeFileSync(path.join(evidence, name), JSON.stringify(value, null, 2));
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const waitFor = async (predicate: () => Promise<boolean>) => {
  const end = Date.now() + 20000;
  while (Date.now() < end) { if (await predicate()) return; await new Promise(r => setTimeout(r, 25)); }
  assert.fail("rehearsal condition timed out");
};
const ledger = (to: string, uncertain = false) => {
  const entries = fs.existsSync(path.join(evidence, "provider-ledger.json")) ? read("provider-ledger.json") : [];
  assert.ok(!entries.some((x: any) => x.to === to), "duplicate simulated provider submission");
  const entry = { to, id: `wamid.local.${crypto.randomUUID()}`, uncertain };
  entries.push(entry); write("provider-ledger.json", entries); return entry;
};
const all = async () => ({
  campaigns: await p.campaign.findMany({ orderBy: { id: "asc" } }),
  batches: await p.campaignExecutionBatch.findMany({ orderBy: { id: "asc" } }),
  jobs: await p.campaignExecutionJob.findMany({ orderBy: { id: "asc" } }),
  leases: await p.tenantCampaignExecutionLease.findMany({ orderBy: { clientId: "asc" } }),
  events: await p.event.findMany({ orderBy: { id: "asc" } }),
  outbound: await p.outboundMessage.findMany({ orderBy: { id: "asc" } }),
});
async function batch(label: string, dynamic = false) {
  const c = await p.client.create({ data: { clientKey: `rollout-${label}`, name: `Synthetic ${label}`, profile: "business", features: { campaigns: true } } });
  const template = await p.template.create({ data: { clientId: c.id, name: `rollout_${label}`, category: "UTILITY", language: "pt_BR", status: "approved", content: "Aviso {{1}}", variables: ["1"] } });
  const b = await p.campaignExecutionBatch.create({ data: { clientId: c.id, name: label, sourceMode: dynamic ? "DYNAMIC_CRM_FILTER" : "STATIC_SELECTION", status: "scheduled", eligibleAt: new Date(), chunkCount: dynamic ? 0 : 2, idempotencyKey: label } });
  return { c, template, b };
}
async function child(f: any, index: number, ids: string[]) {
  const c = await p.campaign.create({ data: { clientId: f.c.id, templateId: f.template.id, templateName: f.template.name, name: `Chunk ${index}`, status: "scheduled", totalRecipients: ids.length } });
  await p.campaignExecutionBatchCampaign.create({ data: { clientId: f.c.id, batchId: f.b.id, campaignId: c.id, chunkIndex: index, recipientCount: ids.length, status: "scheduled" } });
  await p.event.create({ data: { clientId: f.c.id, messageId: c.id, requestId: crypto.randomUUID(), eventName: "campaign.seed.saved", payloadJson: { campaignId: c.id, templateId: f.template.id, templateName: f.template.name, name: c.name, templateParams: [], templateVariableMappings: [], returnDestination: null, ...privateSeed({ clientId: f.c.id, waIds: ids }) } } });
  await queue.enqueueCampaignExecutionJob({ prisma: p, clientId: f.c.id, batchId: f.b.id, campaignId: c.id, chunkIndex: index, eligibleAt: new Date(), kind: "batch_chunk", idempotencyKey: `batch:${f.b.id}:${index}` });
  return c;
}
const act = (f: any, verb: "pause" | "resume") => action(p, { clientId: f.c.id, batchId: f.b.id, action: verb, userId: "local-operator", requestId: crypto.randomUUID() });
try {
  if (phase === "seed-base") {
    assert.equal(url.username, "rollout_owner");
    const c = await p.client.create({ data: { clientKey: "rollout-legacy", name: "Legacy synthetic", profile: "business" } });
    for (const status of ["draft", "completed", "paused"]) await p.campaign.create({ data: { clientId: c.id, name: `Legacy ${status}`, templateName: "legacy", status, totalRecipients: 2, sentCount: status === "completed" ? 2 : 0 } });
    write("legacy-before.json", await p.campaign.findMany({ where: { clientId: c.id }, orderBy: { id: "asc" } }));
    await p.$executeRawUnsafe('CREATE ROLE rollout_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT');
    await p.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO rollout_runtime');
    write("base-seeded.json", { campaigns: 3, migrationCount: Number((await p.$queryRaw<any[]>`SELECT count(*) AS n FROM "_prisma_migrations"`)[0].n) });
  } else if (phase === "after-migration") {
    const old = read("legacy-before.json");
    assert.equal(hash(await p.campaign.findMany({ where: { clientId: old[0].clientId }, orderBy: { id: "asc" } })), hash(old));
    assert.equal(await p.campaignExecutionJob.count(), 0);
    write("after-migration.json", { legacyPreserved: true, jobs: 0, migrationCount: Number((await p.$queryRaw<any[]>`SELECT count(*) AS n FROM "_prisma_migrations"`)[0].n) });
  } else if (phase === "startup-fault") {
    assert.equal(url.username, "rollout_runtime");
    await assert.rejects(p.campaign.findMany(), /denied|permission/i);
    write("startup-fault.json", { admission: "closed", runtimeDbFence: true, injectedFailure: "after migration before activation" });
    process.exitCode = 72;
  } else if (phase === "grant") {
    assert.equal(url.username, "rollout_owner");
    await p.$executeRawUnsafe('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rollout_runtime');
    await p.$executeRawUnsafe('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rollout_runtime');
  } else if (phase === "drain") {
    assert.equal(url.username, "rollout_runtime");
    const f = await batch("drain"); const first = await child(f, 1, ["5541950000001", "5541950000002"]); await child(f, 2, ["5541950000003"]);
    let release!: () => void; const gate = new Promise<void>(r => { release = r; }); let calls = 0;
    simulate = async (_url, init) => { calls++; const entry = ledger(JSON.parse(String(init?.body)).to); await gate; return new Response(JSON.stringify({ messages: [{ id: entry.id }] }), { status: 200 }); };
    const { createServer } = await import("../src/http/server.js");
    const server = createServer(); const handlers = server.listeners("request"); server.removeAllListeners("request"); let admission = true;
    server.on("request", (req, res) => { if (!admission && req.url !== "/health") { res.writeHead(503); res.end("campaign admission suspended"); return; } for (const h of handlers) (h as any).call(server, req, res); });
    await new Promise<void>(r => server.listen(3088, "127.0.0.1", r));
    await runner.processDueScheduledCampaigns({ limit: 1 }); await waitFor(async () => calls === 1);
    admission = false; assert.equal((await nativeFetch("http://127.0.0.1:3088/app/campaigns/drafts/csv", { method: "POST", body: "{}" })).status, 503);
    assert.equal((await act(f, "pause")).ok, true); release(); await runner.getRunningCampaignPromiseForTests(first.id);
    assert.equal(await p.event.count({ where: { clientId: f.c.id, eventName: "campaign.message.provider_accepted" } }), 1);
    assert.equal((await p.campaignExecutionBatch.findUniqueOrThrow({ where: { id: f.b.id } })).status, "paused");
    assert.equal(calls, 1); await new Promise<void>(r => server.close(() => r()));
    write("drained.json", { f, knownAcceptance: 1, admissionStatus: 503 });
    const d = await batch("snapshot", true);
    await p.lead.create({ data: { tenantId: d.c.id, waId: "5541950000011", waIdCanonical: "5541950000011", name: "Original snapshot", status: "QUALIFIED" } });
    const parent = await p.campaign.create({ data: { clientId: d.c.id, templateId: d.template.id, templateName: d.template.name, name: "Dynamic parent", status: "scheduled" } });
    await p.campaignExecutionBatch.update({ where: { id: d.b.id }, data: { metadata: { parentCampaignId: parent.id, clientKey: d.c.clientKey } } });
    await p.event.create({ data: { clientId: d.c.id, messageId: parent.id, requestId: crypto.randomUUID(), eventName: "campaign.seed.saved", payloadJson: { campaignId: parent.id, templateId: d.template.id, templateName: d.template.name, templateParams: [], templateVariableMappings: [{ position: "1", source: "contact.displayName" }], returnDestination: null, selectionMode: "DYNAMIC_CRM_FILTER", dynamicFilter: { version: 1, crmBusinessStatusId: "QUALIFIED" }, ...privateSeed({ clientId: d.c.id, waIds: [] }) } } });
    await queue.enqueueCampaignExecutionJob({ prisma: p, clientId: d.c.id, batchId: d.b.id, kind: "batch_chunk", campaignId: null, eligibleAt: new Date(), idempotencyKey: "snapshot-controller" });
    runner.setCampaignBatchMaterializationHookForTests(() => { throw new Error("rehearsal_snapshot_interruption"); });
    await assert.rejects(runner.processDueScheduledCampaigns({ limit: 1 }), /rehearsal_snapshot_interruption/); runner.setCampaignBatchMaterializationHookForTests(null);
    assert.equal((await act(d, "pause")).ok, true);
    const snapshot = await p.event.findFirstOrThrow({ where: { clientId: d.c.id, eventName: "campaign.dynamic_batch_snapshot.created" } });
    await p.lead.updateMany({ where: { tenantId: d.c.id }, data: { name: "Changed CRM", status: "NURTURE" } });
    write("snapshot-suspended.json", { f: d, eventId: snapshot.id, payloadHash: hash(snapshot.payloadJson) });
    const uncertain = await batch("uncertain"); await child(uncertain, 1, ["5541950000021", "5541950000022"]); write("uncertain-fixture.json", uncertain);
  } else if (phase === "uncertain-crash") {
    simulate = async (_url, init) => { ledger(JSON.parse(String(init?.body)).to, true); write("uncertain-crash.json", { simulatedProviderAccepted: true, localResponseReceived: false, exit: 73 }); process.exit(73); };
    await runner.processDueScheduledCampaigns({ limit: 1 }); await new Promise(r => setTimeout(r, 10000)); assert.fail("expected crash boundary");
  } else if (phase === "fence") {
    assert.equal(url.username, "rollout_owner");
    const f = read("uncertain-fixture.json"); const j = await p.campaignExecutionJob.findFirstOrThrow({ where: { batchId: f.b.id, status: "running" } });
    await queue.markCampaignExecutionJobNeedsReview({ clientId: f.c.id, jobId: j.id, reason: "rehearsal_process_died_after_provider_submission" });
    assert.equal(await p.event.count({ where: { clientId: f.c.id, eventName: "campaign.message.provider_accepted" } }), 0);
    await p.$executeRawUnsafe('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM rollout_runtime');
    await p.$executeRawUnsafe('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM rollout_runtime');
    write("rollback-preserved.json", await all());
  } else if (phase === "old-probe") {
    assert.equal(url.username, "rollout_runtime"); let attempted = 0; simulate = async () => { attempted++; throw new Error("old provider forbidden"); };
    await assert.rejects(p.campaign.findMany(), /denied|permission/i);
    const old = await import(pathToFileURL(path.join(evidence, "old-source/apps/whatsapp-agent/src/campaigns/campaignRunner.ts")).href);
    await assert.rejects(old.processDueScheduledCampaigns({ limit: 1 }), /denied|permission/i);
    await (await import(pathToFileURL(path.join(evidence, "old-source/apps/whatsapp-agent/src/db.ts")).href)).getPrisma().$disconnect();
    assert.equal(attempted, 0); write("old-probe.json", { revision: "6d664d0b", actualOldRunnerInvoked: true, dbPermissionDenied: true, providerCalls: 0, functionalRollback: false, campaignProcessing: "SUSPENDED" });
  } else if (phase === "verify-fence") {
    assert.equal(hash(await all()), hash(read("rollback-preserved.json")));
    write("rollback-unchanged.json", { campaignsJobsLeasesSnapshotsResultsByteEquivalent: true });
  } else if (phase === "resume-new") {
    assert.equal(url.username, "rollout_runtime"); const f = read("drained.json").f; const d = read("snapshot-suspended.json"); const u = read("uncertain-fixture.json");
    simulate = async (_url, init) => { const payload = JSON.parse(String(init?.body)); const entry = ledger(payload.to); if (payload.to === "5541950000011") assert.equal(payload.template.components[0].parameters[0].text, "Original snapshot"); return new Response(JSON.stringify({ messages: [{ id: entry.id }] }), { status: 200 }); };
    // Wait for the real controller lease to expire; never rewrite/delete its history.
    const controller = await p.campaignExecutionJob.findFirstOrThrow({ where: { batchId: d.f.b.id, campaignId: null } });
    while (controller.leaseExpiresAt && Date.now() <= controller.leaseExpiresAt.getTime()) await new Promise(r => setTimeout(r, 500));
    await runner.processDueScheduledCampaigns({ limit: 1 });
    assert.equal((await act(f, "resume")).ok, true); assert.equal((await act(d.f, "resume")).ok, true);
    await runner.processDueScheduledCampaigns({ limit: 10 });
    await waitFor(async () => (await p.campaignExecutionBatch.count({ where: { id: { in: [f.b.id, d.f.b.id] }, status: "completed" } })) === 2);
    const snapshot = await p.event.findUniqueOrThrow({ where: { id: d.eventId } }); assert.equal(hash(snapshot.payloadJson), d.payloadHash);
    assert.equal((await p.campaignExecutionBatch.findUniqueOrThrow({ where: { id: u.b.id } })).status, "needs_review");
    const before = read("rollback-preserved.json"); const after = await all();
    assert.ok(before.jobs.every((job: any) => after.jobs.some(j => j.id === job.id)));
    assert.ok(before.events.every((event: any) => after.events.some(e => e.id === event.id && hash(e.payloadJson) === hash(event.payloadJson))));
    const entries = read("provider-ledger.json"); assert.equal(entries.length, 5); assert.equal(new Set(entries.map((x: any) => x.to)).size, 5);
    const old = read("legacy-before.json"); assert.equal(hash(await p.campaign.findMany({ where: { clientId: old[0].clientId }, orderBy: { id: "asc" } })), hash(old));
    write("resume-result.json", { completeBatches: 2, simulatedSubmissions: 5, duplicateSubmissions: 0, knownAcceptedResults: 4, unresolvedSubmissions: 1, originalSnapshotPreserved: true, allPriorJobsEventsPreserved: true, legacyCampaignsUnchanged: true, admission: "still closed", uncertainBatch: "needs_review" });
  } else if (phase === "verify-final") {
    const before = read("rollback-preserved.json"); const after = await all();
    for (const batch of before.batches) {
      assert.equal(after.batches.find(b => b.id === batch.id)?.effectiveStartedAt?.toISOString(), batch.effectiveStartedAt);
    }
    assert.equal(await p.event.count({ where: { eventName: "campaign.message.provider_accepted" } }), 4);
    assert.equal(await p.campaignExecutionJob.count({ where: { status: "needs_review" } }), 1);
    const { createServer } = await import("../src/http/server.js");
    const server = createServer(); const handlers = server.listeners("request"); server.removeAllListeners("request");
    server.on("request", (req, res) => { if (req.url !== "/health") { res.writeHead(503); res.end("maintenance"); return; } for (const h of handlers) (h as any).call(server, req, res); });
    await new Promise<void>(r => server.listen(3088, "127.0.0.1", r));
    const blockedRoutes = ["/app/campaigns/drafts/csv", "/app/campaign-batches/example/send", "/campaigns/send", "/admin/campaigns/send", "/app/campaigns"];
    for (const route of blockedRoutes) assert.equal((await nativeFetch(`http://127.0.0.1:3088${route}`, { method: "POST", body: "{}" })).status, 503);
    await new Promise<void>(r => server.close(() => r()));
    assert.equal(hash(await all()), hash(after));
    write("final-verification.json", { originalBatchStartPreserved: true, knownAcceptances: 4, uncertainJobs: 1, blockedRoutes, admissionStatus: 503, noStateChangesFromAdmissionProbe: true });
  } else throw new Error("unknown rehearsal phase");
  console.log(`REHEARSAL ${phase} PASS`);
} finally { await p.$disconnect(); await getPrisma().$disconnect(); }
