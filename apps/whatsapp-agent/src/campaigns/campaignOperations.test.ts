import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { campaignTask, campaignProviderAttempt, campaignOperationsStatus, setCampaignOperations, CampaignOperationsClosed, isCampaignMutation } from "./campaignOperations.js";
function setup() {
  process.env.CAMPAIGN_OPERATIONS_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "campaign-guard-test-")), "state.json");
  delete process.env.CAMPAIGN_RECOVERY_ONLY;
  process.env.CAMPAIGN_OPERATIONS_TOPOLOGY = "single-host";
  process.env.CAMPAIGN_OPERATIONS_HOST_ID = fs.readFileSync("/etc/machine-id", "utf8").trim();
}
function change(open: boolean) { const s = campaignOperationsStatus(); return setCampaignOperations(open, s.generation!, "local-test-operator", "synthetic validation"); }
function barrier() { let release!: () => void; const promise = new Promise<void>(r => { release = r; }); return { promise, release }; }
test("closed default, explicit audited open, corrupt reads fail closed", () => {
  setup(); assert.equal(campaignOperationsStatus().drained, true);
  assert.throws(() => campaignTask("manual", async () => {}), CampaignOperationsClosed);
  change(true); assert.equal(campaignOperationsStatus().audit[0].action, "open");
  fs.writeFileSync(process.env.CAMPAIGN_OPERATIONS_FILE!, "corrupt");
  assert.equal(campaignOperationsStatus().available, false);
  assert.equal(campaignOperationsStatus().drained, false);
  assert.throws(() => campaignTask("manual", async () => {}));
});
test("close during prevalidation tracks task and blocks provider and concurrent admissions", async () => {
  setup(); change(true); const gate = barrier(); let calls = 0;
  const work = campaignTask("http-prevalidation", async () => { await gate.promise; await campaignProviderAttempt(async () => {}, async () => { calls++; }); });
  change(false); assert.equal(campaignOperationsStatus().drained, false);
  for (const kind of ["scheduler", "manual", "test-send", "claim"]) assert.throws(() => campaignTask(kind, async () => {}), CampaignOperationsClosed);
  gate.release(); await assert.rejects(work, CampaignOperationsClosed);
  assert.equal(calls, 0); assert.equal(campaignOperationsStatus().drained, true);
});
test("in-flight provider and slow persistence prevent drain; completion preserves acceptance", async () => {
  setup(); change(true); const provider = barrier(), persist = barrier(); let accepted = 0;
  const work = campaignTask("runner", async () => {
    const attempt = await campaignProviderAttempt(async () => {}, async () => { await provider.promise; return "simulated-accepted"; });
    assert.equal(attempt.result, "simulated-accepted"); await persist.promise; accepted++; attempt.persisted();
  });
  await new Promise(r => setImmediate(r)); change(false);
  assert.equal(campaignOperationsStatus().drained, false); provider.release();
  await new Promise(r => setImmediate(r)); assert.ok(campaignOperationsStatus().tasks.some(t => t.phase === "persisting"));
  assert.throws(() => change(true), /not_drained/);
  persist.release(); await work; assert.equal(accepted, 1); assert.equal(campaignOperationsStatus().drained, true);
});
test("close during intent persistence never invokes provider; intent stays reviewable", async () => {
  setup(); change(true); const gate = barrier(); let calls = 0;
  const work = campaignTask("runner", async () => campaignProviderAttempt(() => gate.promise, async () => { calls++; }));
  change(false); gate.release(); await assert.rejects(work, CampaignOperationsClosed);
  assert.equal(calls, 0); assert.equal(campaignOperationsStatus().drained, false); assert.throws(() => change(true), /not_drained/);
});
test("persistence failure cannot be erased by task completion or reopen", async () => {
  setup(); change(true);
  await assert.rejects(campaignTask("test-send", async () => { await campaignProviderAttempt(async () => {}, async () => "accepted"); throw new Error("disk_or_db_failed"); }), /disk_or_db_failed/);
  assert.equal(campaignOperationsStatus().open, false);
  assert.equal(campaignOperationsStatus().tasks.length, 1);
  assert.throws(() => change(true), /not_drained/);
});
test("crashed executor survives restart; no timeout clears uncertainty", () => {
  setup(); change(true);
  const file = process.env.CAMPAIGN_OPERATIONS_FILE!;
  const moduleUrl = new URL("./campaignOperations.ts", import.meta.url).href;
  const loader = new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url).href;
  const child = spawnSync(process.execPath, ["--import", loader, "--input-type=module", "-e", `
    import { campaignTask, campaignProviderAttempt } from ${JSON.stringify(moduleUrl)};
    void campaignTask("runner", async () => campaignProviderAttempt(async () => {}, async () => new Promise(() => {})));
    setTimeout(() => process.exit(73), 100);
  `], { encoding: "utf8", env: { ...process.env, CAMPAIGN_OPERATIONS_FILE: file } });
  assert.equal(child.status, 73, child.stderr);
  assert.equal(campaignOperationsStatus().open, false); assert.equal(campaignOperationsStatus().drained, false);
  assert.throws(() => campaignTask("scheduler", async () => {}), CampaignOperationsClosed);
  assert.throws(() => change(true), /not_drained/);
});
test("recovery-only refuses opening, mutations cover public/direct routes and preserve user stop paths", () => {
  setup(); process.env.CAMPAIGN_RECOVERY_ONLY = "true";
  assert.throws(() => change(true), /not_drained/);
  for (const route of ["/app/campaigns", "/app/campaigns/x/test-send", "/app/campaign-batches/x/send", "/admin/campaigns/run", "/public-api/v1/campaigns/x/recipients"]) assert.equal(isCampaignMutation("POST", route), true);
  for (const route of ["/app/campaigns/x/pause", "/app/campaign-batches/x/cancel", "/app/conversations/x/messages", "/webhook"]) assert.equal(isCampaignMutation("POST", route), false);
  delete process.env.CAMPAIGN_RECOVERY_ONLY;
});


test("another instance sees the same close generation before provider admission", { timeout: 15000 }, async t => {
  setup(); change(true);
  const moduleUrl = new URL("./campaignOperations.ts", import.meta.url).href;
  const loader = new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url).href;
  const child = spawn(process.execPath, ["--import", loader, "--input-type=module", "-e", `
    import { campaignTask, campaignProviderAttempt, campaignOperationsStatus, CampaignOperationsClosed } from ${JSON.stringify(moduleUrl)};
    let release; const gate = new Promise(r => { release = r; });
    process.on('message', () => release());
    let calls = 0;
    const work = campaignTask('test-send-prevalidation', async () => {
      process.send({ ready: true }); await gate;
      await campaignProviderAttempt(async () => {}, async () => { calls++; });
    });
    try { await work; process.exitCode = 1; }
    catch(e) { if (!(e instanceof CampaignOperationsClosed)) throw e; }
    process.send({ calls, generation: campaignOperationsStatus().generation });
    process.disconnect();
  `], { env: { ...process.env }, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  t.after(() => { child.kill(); });
  const messages: Array<{ ready?: boolean; calls?: number; generation?: number }> = [];
  let ready!: () => void; const pending = new Promise<void>(r => { ready = r; });
  child.on("message", message => { const m = message as typeof messages[number]; messages.push(m); if (m.ready) ready(); });
  await pending;
  const closed = change(false); assert.equal(closed.drained, false);
  const exited = new Promise<number | null>(r => child.once("exit", r));
  child.send("continue"); assert.equal(await exited, 0);
  assert.deepEqual(messages[messages.length - 1], { calls: 0, generation: closed.generation });
  assert.equal(campaignOperationsStatus().drained, true);
});


test("unknown or multi-host topology and wrong host identity cannot open or admit", () => {
  for (const topology of [undefined, "multi-host", ""]) {
    setup();
    if (topology === undefined) delete process.env.CAMPAIGN_OPERATIONS_TOPOLOGY;
    else process.env.CAMPAIGN_OPERATIONS_TOPOLOGY = topology;
    assert.throws(() => change(true), /topology_unvalidated/);
    assert.throws(() => campaignTask("claim", async () => {}), CampaignOperationsClosed);
  }
  setup(); change(true);
  process.env.CAMPAIGN_OPERATIONS_HOST_ID = "wrong-host";
  assert.equal(campaignOperationsStatus().open, false);
  assert.throws(() => change(true), /topology_unvalidated/);
  assert.throws(() => campaignTask("test-send", async () => {}), CampaignOperationsClosed);
  change(false); // Closing and diagnostics remain available.
});
test("a foreign or unbound open ledger requires explicit reopening on the validated host", () => {
  for (const hostId of [undefined, "different-host"]) {
    setup(); change(true);
    const file = process.env.CAMPAIGN_OPERATIONS_FILE!;
    const state = JSON.parse(fs.readFileSync(file, "utf8")); state.hostId = hostId;
    fs.writeFileSync(file, JSON.stringify(state));
    assert.equal(campaignOperationsStatus().open, false);
    assert.throws(() => campaignTask("scheduler", async () => {}), CampaignOperationsClosed);
    change(true); assert.equal(campaignOperationsStatus().open, true);
  }
});
test("topology invalidated during intent blocks provider and retains uncertain work", async () => {
  setup(); change(true); const gate = barrier(); let calls = 0;
  const work = campaignTask("runner", async () => campaignProviderAttempt(() => gate.promise, async () => { calls++; }));
  process.env.CAMPAIGN_OPERATIONS_TOPOLOGY = "multi-host";
  gate.release(); await assert.rejects(work, CampaignOperationsClosed);
  assert.equal(calls, 0); assert.equal(campaignOperationsStatus().drained, false);
  assert.throws(() => change(true), /not_drained/);
});
