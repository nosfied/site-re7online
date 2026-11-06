import "./campaignOperationsTestSupport.js";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { getPrisma } from "../db.js";
import { buildPrivateCampaignSeedFields } from "./campaignSeedPrivacy.js";
import { createOpenCampaignOperationsTestLedger } from "./campaignOperationsTestSupport.js";
import { campaignOperationsStatus, campaignProviderAttempt, campaignTask, readCampaignReconciliationFence } from "./campaignOperations.js";
import {
  acknowledgeSubmissionUncertain,
  applySubmissionUncertain,
  dryRunSubmissionUncertain,
  verifySubmissionUncertain,
  type SubmissionUncertainBindings,
} from "./campaignSubmissionUncertainReconciliation.js";
import { suspendCampaignExecutionJob } from "./campaignExecutionQueue.js";

process.env.APP_AUTH_SECRET = "synthetic-submission-uncertain";

test("uncertain submission is preserved without provider replay, Outbound fabrication or definitive failure", async t => {
  createOpenCampaignOperationsTestLedger("campaign-submission-uncertain-reconciliation");
  const db = getPrisma();
  const clientId = crypto.randomUUID(), otherClientId = crypto.randomUUID();
  const recipients = ["5541993100101", "5541993100102", "5541993100103", "5541993100104"];
  const runId = crypto.randomUUID();
  t.after(async () => {
    await db.event.deleteMany({ where: { clientId: { in: [clientId, otherClientId] } } });
    await db.outboundMessage.deleteMany({ where: { clientId: { in: [clientId, otherClientId] } } });
    await db.campaignExecutionJob.deleteMany({ where: { clientId: { in: [clientId, otherClientId] } } });
    await db.campaign.deleteMany({ where: { clientId: { in: [clientId, otherClientId] } } });
    await db.client.deleteMany({ where: { id: { in: [clientId, otherClientId] } } });
    await db.$disconnect();
  });
  await db.client.createMany({ data: [
    { id: clientId, clientKey: `uncertain-${clientId}`, name: "Synthetic", profile: "business" },
    { id: otherClientId, clientKey: `other-${otherClientId}`, name: "Other", profile: "business" },
  ] });
  const campaign = await db.campaign.create({ data: { clientId, name: "Submission uncertain", templateName: "synthetic",
    status: "sending", totalRecipients: recipients.length, sentCount: 2 } });
  const job = await db.campaignExecutionJob.create({ data: { clientId, campaignId: campaign.id, kind: "campaign",
    status: "queued", eligibleAt: new Date(), idempotencyKey: crypto.randomUUID(), failureReason: "operational_suspension" } });
  const seed = await db.event.create({ data: { clientId, messageId: campaign.id, eventName: "campaign.seed.saved",
    payloadJson: { ...buildPrivateCampaignSeedFields({ clientId, waIds: recipients }) } } });
  await Promise.all(recipients.slice(0, 2).map((waId, index) => db.outboundMessage.create({ data: {
    clientId, waId, messageId: `campaign.${campaign.id}.${index + 1}`, metaMessageId: `wamid.prior.${index + 1}`,
    channel: "whatsapp", provider: "meta", type: "TEMPLATE", status: "SENT",
  } })));
  await db.event.createMany({ data: recipients.slice(0, 2).map((waId, index) => ({ clientId, waId,
    messageId: `campaign.${campaign.id}.${index + 1}`, eventName: "campaign.message.submit_started",
    payloadJson: { campaignId: campaign.id, campaignRunId: runId } })) });
  const submitStarted = await db.event.create({ data: { clientId, waId: recipients[2],
    messageId: `campaign.${campaign.id}.3`, eventName: "campaign.message.submit_started",
    payloadJson: { campaignId: campaign.id, campaignRunId: runId } } });
  await assert.rejects(campaignTask("synthetic-uncertain", async () => {
    await campaignProviderAttempt(async () => undefined, async () => ({ ok: false, failureDisposition: "submission_uncertain" }),
      { clientId, campaignId: campaign.id, messageId: `campaign.${campaign.id}.3` });
    throw new Error("synthetic_connection_lost_after_write");
  }), /synthetic_connection_lost_after_write/);
  const guard = campaignOperationsStatus();
  assert.equal(guard.open, false); assert.equal(guard.tasks.length, 1); assert.equal(guard.tasks[0].phase, "persisting");
  const bindings: SubmissionUncertainBindings = { clientId, campaignId: campaign.id, jobId: job.id, runId,
    seedEventId: seed.id, submitStartedEventId: submitStarted.id, taskId: guard.tasks[0].id,
    guardGeneration: guard.generation!, position: 3 };

  const dryRun = await dryRunSubmissionUncertain(db, bindings);
  assert.equal(dryRun.alreadyApplied, false);
  if (dryRun.alreadyApplied) throw new Error("unexpected_prior_receipt");
  assert.equal(dryRun.plan.providerAcceptance, "unknown");
  assert.equal(dryRun.plan.retryAllowed, false);
  assert.equal(dryRun.plan.outboundMaterialized, false);
  assert.equal("existingDispositionEventId" in dryRun.plan, false);
  assert.equal("originalProviderCalls" in dryRun.plan, false);
  assert.equal("interruptedParent" in dryRun.plan, false,
    "historical plans such as the sealed afaf9831 plan retain their original schema and hash inputs");
  assert.equal("priorUncertainPositions" in dryRun.plan, false,
    "the historical afaf9831 plan shape is unchanged when every prior effect is an Outbound");
  await assert.rejects(dryRunSubmissionUncertain(db, { ...bindings, clientId: otherClientId }), /task_binding_mismatch/);
  await assert.rejects(applySubmissionUncertain(db, bindings, "0".repeat(64)), /plan_drift/);
  const applied = await applySubmissionUncertain(db, bindings, dryRun.planHash);
  assert.equal(applied.alreadyApplied, false);
  assert.equal((await applySubmissionUncertain(db, bindings, dryRun.planHash)).alreadyApplied, true);
  const verified = await verifySubmissionUncertain(db, bindings);
  assert.equal(verified.providerAcceptance, "unknown");
  assert.equal(verified.retryAllowed, false);
  assert.equal(verified.campaignContinuationAuthorized, false);
  assert.equal(await db.outboundMessage.count({ where: { clientId } }), 2);
  assert.equal(await db.event.count({ where: { clientId, messageId: `campaign.${campaign.id}.3`,
    eventName: { in: ["campaign.message.provider_accepted", "campaign.message.sent", "campaign.message.failed"] } } }), 0);
  assert.equal((await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).sentCount, 2);
  assert.equal((await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status, "sending");
  assert.equal((await db.campaignExecutionJob.findUniqueOrThrow({ where: { id: job.id } })).status, "queued");
  assert.equal(campaignOperationsStatus().open, false); assert.equal(campaignOperationsStatus().tasks.length, 1);
  const acknowledged = await acknowledgeSubmissionUncertain(db, bindings, "synthetic-reviewer");
  assert.equal(acknowledged.status.open, false); assert.equal(acknowledged.status.tasks.length, 0);
  assert.equal(acknowledged.status.generation, bindings.guardGeneration + 1);
  assert.equal(await acknowledgeSubmissionUncertain(db, bindings, "synthetic-reviewer").then(value => value.status.generation),
    acknowledged.status.generation, "acknowledgement is idempotent");
});

test("uncertain submission reconciliation denies provider evidence, drift and changed campaign state", async t => {
  createOpenCampaignOperationsTestLedger("campaign-submission-uncertain-drift");
  const db = getPrisma();
  const clientId = crypto.randomUUID(), recipients = ["5541993200101", "5541993200102"];
  const runId = crypto.randomUUID();
  t.after(async () => {
    await db.event.deleteMany({ where: { clientId } });
    await db.outboundMessage.deleteMany({ where: { clientId } });
    await db.campaignExecutionJob.deleteMany({ where: { clientId } });
    await db.campaign.deleteMany({ where: { clientId } });
    await db.client.deleteMany({ where: { id: clientId } });
    await db.$disconnect();
  });
  await db.client.create({ data: { id: clientId, clientKey: `uncertain-drift-${clientId}`, name: "Synthetic", profile: "business" } });
  const campaign = await db.campaign.create({ data: { clientId, name: "Uncertain drift", templateName: "synthetic",
    status: "sending", totalRecipients: 2, sentCount: 1 } });
  const job = await db.campaignExecutionJob.create({ data: { clientId, campaignId: campaign.id, kind: "campaign",
    status: "queued", eligibleAt: new Date(), idempotencyKey: crypto.randomUUID(), failureReason: "operational_suspension" } });
  const seed = await db.event.create({ data: { clientId, messageId: campaign.id, eventName: "campaign.seed.saved",
    payloadJson: buildPrivateCampaignSeedFields({ clientId, waIds: recipients }) } });
  await db.outboundMessage.create({ data: { clientId, waId: recipients[0], messageId: `campaign.${campaign.id}.1`,
    type: "TEMPLATE", status: "SENT" } });
  await db.event.create({ data: { clientId, waId: recipients[0], messageId: `campaign.${campaign.id}.1`,
    eventName: "campaign.message.submit_started", payloadJson: { campaignId: campaign.id, campaignRunId: runId } } });
  const intent = await db.event.create({ data: { clientId, waId: recipients[1], messageId: `campaign.${campaign.id}.2`,
    eventName: "campaign.message.submit_started", payloadJson: { campaignId: campaign.id, campaignRunId: runId } } });
  await assert.rejects(campaignTask("synthetic-uncertain-drift", async () => {
    await campaignProviderAttempt(async () => undefined, async () => ({ ok: false, failureDisposition: "submission_uncertain" }),
      { clientId, campaignId: campaign.id, messageId: `campaign.${campaign.id}.2` });
    throw new Error("synthetic_transport_unknown");
  }), /synthetic_transport_unknown/);
  const guard = campaignOperationsStatus();
  const bindings: SubmissionUncertainBindings = { clientId, campaignId: campaign.id, jobId: job.id, runId,
    seedEventId: seed.id, submitStartedEventId: intent.id, taskId: guard.tasks[0].id,
    guardGeneration: guard.generation!, position: 2 };
  const plan = await dryRunSubmissionUncertain(db, bindings);
  assert.equal(plan.alreadyApplied, false);
  await db.event.create({ data: { clientId, waId: recipients[1], messageId: `campaign.${campaign.id}.2`,
    eventName: "campaign.message.provider_accepted", payloadJson: { campaignId: campaign.id, campaignRunId: runId, metaMessageId: "late" } } });
  await assert.rejects(dryRunSubmissionUncertain(db, bindings), /provider_result_present/);
  await db.event.deleteMany({ where: { clientId, messageId: `campaign.${campaign.id}.2`, eventName: "campaign.message.provider_accepted" } });
  await db.campaign.update({ where: { id: campaign.id }, data: { status: "failed" } });
  await assert.rejects(dryRunSubmissionUncertain(db, bindings), /campaign_state_drift/);
});

test("a new process recovers a real execution job killed after a second SQL marker without replaying either uncertainty", async t => {
  const { file } = createOpenCampaignOperationsTestLedger("campaign-submission-uncertain-real-crash");
  const db = getPrisma();
  const clientId = crypto.randomUUID(), clientKey = `uncertain-crash-${clientId}`;
  const recipients = ["5541993300101", "5541993300102"], templateName = `uncertain_crash_${Date.now()}`;
  t.after(async () => {
    await db.event.deleteMany({ where: { clientId } });
    await db.outboundMessage.deleteMany({ where: { clientId } });
    await db.campaignExecutionJob.deleteMany({ where: { clientId } });
    await db.campaign.deleteMany({ where: { clientId } });
    await db.template.deleteMany({ where: { clientId } });
    await db.client.deleteMany({ where: { id: clientId } });
    await db.$disconnect();
  });
  await db.client.create({ data: { id: clientId, clientKey, name: "Synthetic crash", profile: "business", features: { campaigns: true } } });
  await db.template.create({ data: { clientId, name: templateName, category: "UTILITY", language: "pt_BR", status: "approved", content: "Synthetic" } });
  const campaign = await db.campaign.create({ data: { clientId, name: "Crash recovery", templateName,
    status: "sending", totalRecipients: recipients.length, sentCount: 0 } });
  const job = await db.campaignExecutionJob.create({ data: { clientId, campaignId: campaign.id, kind: "campaign",
    status: "queued", eligibleAt: new Date(), idempotencyKey: crypto.randomUUID(), failureReason: "operational_suspension" } });
  const seed = await db.event.create({ data: { clientId, messageId: campaign.id, eventName: "campaign.seed.saved",
    payloadJson: buildPrivateCampaignSeedFields({ clientId, waIds: recipients }) } });
  const child = spawn(process.execPath, ["--import", import.meta.resolve("tsx"),
    fileURLToPath(new URL("./fixtures/submissionUncertainCrashRunner.ts", import.meta.url))], {
    env: { ...process.env, CAMPAIGN_OPERATIONS_FILE: file, CAMPAIGN_OPERATIONS_TOPOLOGY: "single-host",
      CAMPAIGN_OPERATIONS_HOST_ID: process.env.CAMPAIGN_OPERATIONS_HOST_ID!, APP_AUTH_SECRET: "synthetic-submission-uncertain",
      WHATSAPP_ACCESS_TOKEN: "synthetic-token", WHATSAPP_PHONE_NUMBER_ID: "synthetic-phone",
      CRASH_FIXTURE_CLIENT_ID: clientId, CRASH_FIXTURE_CLIENT_KEY: clientKey,
      CRASH_FIXTURE_CAMPAIGN_ID: campaign.id, CRASH_FIXTURE_TEMPLATE_NAME: templateName,
      CRASH_FIXTURE_RECIPIENTS: JSON.stringify(recipients), CRASH_FIXTURE_CRASH_POSITION: "2" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  assert.deepEqual(exit, { code: null, signal: "SIGKILL" });
  assert.equal(await db.event.count({ where: { clientId, eventName: "synthetic.provider.call",
    messageId: { startsWith: `campaign.${campaign.id}.` } } }), 2);
  const firstMarker = await db.event.findFirstOrThrow({ where: { clientId, messageId: `campaign.${campaign.id}.1`,
    eventName: "campaign.message.submission_uncertain_preserved" } });
  const submitStarted = await db.event.findFirstOrThrow({ where: { clientId, messageId: `campaign.${campaign.id}.2`, eventName: "campaign.message.submit_started" } });
  const marker = await db.event.findFirstOrThrow({ where: { clientId, messageId: `campaign.${campaign.id}.2`, eventName: "campaign.message.submission_uncertain_preserved" } });
  const runningJob = await db.campaignExecutionJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(runningJob.status, "running");
  assert.equal(runningJob.attempt, 1, "the normal queue claim owns the real execution job");
  assert.ok(runningJob.leaseToken);
  await suspendCampaignExecutionJob({ id: job.id, clientId, campaignId: campaign.id, batchId: null,
    chunkIndex: null, kind: "campaign", leaseToken: runningJob.leaseToken! });
  assert.deepEqual(await db.campaignExecutionJob.findUniqueOrThrow({ where: { id: job.id }, select: {
    status: true, failureReason: true, leaseToken: true,
  } }), { status: "queued", failureReason: "operational_suspension", leaseToken: null });
  const rawFence = readCampaignReconciliationFence();
  const providerEntry = Object.entries(rawFence.tasks).find(([, task]) => task.kind === "provider");
  assert.ok(providerEntry); assert.equal(rawFence.open, true); assert.equal(Object.keys(rawFence.tasks).length, 2);
  const runId = String((submitStarted.payloadJson as Record<string, unknown>).campaignRunId);
  const bindings: SubmissionUncertainBindings = { clientId, campaignId: campaign.id, jobId: job.id, runId,
    seedEventId: seed.id, submitStartedEventId: submitStarted.id, taskId: providerEntry[0],
    guardGeneration: rawFence.generation, position: 2 };
  const reconciler = spawn(process.execPath, ["--import", import.meta.resolve("tsx"),
    fileURLToPath(new URL("./fixtures/submissionUncertainCrashReconciler.ts", import.meta.url))], {
    env: { ...process.env, CAMPAIGN_OPERATIONS_FILE: file, CAMPAIGN_OPERATIONS_TOPOLOGY: "single-host",
      CAMPAIGN_OPERATIONS_HOST_ID: process.env.CAMPAIGN_OPERATIONS_HOST_ID!, APP_AUTH_SECRET: "synthetic-submission-uncertain",
      CRASH_FIXTURE_BINDINGS: JSON.stringify(bindings) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let reconcilerStdout = "", reconcilerStderr = "";
  reconciler.stdout.on("data", chunk => { reconcilerStdout += String(chunk); });
  reconciler.stderr.on("data", chunk => { reconcilerStderr += String(chunk); });
  const reconcilerExit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    reconciler.once("error", reject);
    reconciler.once("exit", (code, signal) => resolve({ code, signal }));
  });
  assert.deepEqual(reconcilerExit, { code: 0, signal: null }, reconcilerStderr);
  const resultLine = reconcilerStdout.split("\n").find(line => line.startsWith("CRASH_RECONCILIATION_RESULT="));
  assert.ok(resultLine, reconcilerStdout);
  const reconciled = JSON.parse(resultLine.slice("CRASH_RECONCILIATION_RESULT=".length)) as {
    providerCalls: number; originalProviderCalls: number; existingDispositionEventId: string;
    receiptId: string; interruptedParent: { taskId: string; taskHash: string };
  };
  assert.equal(reconciled.providerCalls, 0, "the new reconciler process performs zero provider calls");
  assert.equal(reconciled.originalProviderCalls, 1, "the original runner call remains distinct");
  assert.equal(reconciled.existingDispositionEventId, marker.id);
  assert.ok(reconciled.interruptedParent);
  const receipt = await db.event.findUniqueOrThrow({ where: { id: reconciled.receiptId } });
  assert.equal((receipt.payloadJson as Record<string, unknown>).providerCalls, 0);
  assert.equal((receipt.payloadJson as Record<string, unknown>).originalProviderCalls, 1);
  assert.equal(await db.event.count({ where: { clientId, eventName: "campaign.message.submission_uncertain_preserved",
    messageId: { startsWith: `campaign.${campaign.id}.` } } }), 2);
  assert.deepEqual(await db.event.findUniqueOrThrow({ where: { id: firstMarker.id } }), firstMarker,
    "the first preserved uncertainty remains unchanged");
  assert.equal(await db.event.count({ where: { clientId, eventName: "synthetic.provider.call",
    messageId: { startsWith: `campaign.${campaign.id}.` } } }), 2);
  const verified = await verifySubmissionUncertain(db, bindings);
  assert.ok(verified.interruptedParent);
  const acknowledged = await acknowledgeSubmissionUncertain(db, bindings, "synthetic-crash-reviewer");
  assert.equal(acknowledged.status.tasks.length, 0);
  assert.equal(acknowledged.status.open, false);
});
