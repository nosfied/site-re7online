import "./campaignOperationsTestSupport.js";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { getPrisma } from "../db.js";
import {
  acknowledgeAcceptedCrmFailure,
  applyAcceptedCrmFailure,
  dryRunAcceptedCrmFailure,
  verifyAcceptedCrmFailure,
  type AcceptedCrmFailureBindings,
} from "./campaignAcceptedCrmFailureReconciliation.js";
import {
  campaignOperationsStatus,
  campaignProviderAttempt,
  campaignTask,
  setCampaignOperations,
} from "./campaignOperations.js";
import { buildPrivateCampaignSeedFields } from "./campaignSeedPrivacy.js";
import { getRunningCampaignPromiseForTests, startCampaignRun } from "./campaignRunner.js";

process.env.APP_AUTH_SECRET = "synthetic-accepted-crm-failure";
process.env.WHATSAPP_ACCESS_TOKEN = "synthetic";
process.env.WHATSAPP_PHONE_NUMBER_ID = "synthetic";

test("accepted provider result with CRM failure is reconciled without replay and continuation skips positions 1-3", async (t) => {
  const db = getPrisma();
  const clientId = crypto.randomUUID(), otherClientId = crypto.randomUUID();
  const clientKey = `accepted-crm-${clientId}`;
  const templateName = `accepted_crm_${Date.now()}`;
  const recipients = ["5541991100601", "5541991100602", "12025550199", "5541991100604"];
  t.after(async () => {
    await db.tenantCampaignExecutionLease.deleteMany({ where: { clientId: { in: [clientId, otherClientId] } } });
    await db.event.deleteMany({ where: { clientId: { in: [clientId, otherClientId] } } });
    await db.outboundMessage.deleteMany({ where: { clientId: { in: [clientId, otherClientId] } } });
    await db.campaignExecutionJob.deleteMany({ where: { clientId: { in: [clientId, otherClientId] } } });
    await db.campaign.deleteMany({ where: { clientId: { in: [clientId, otherClientId] } } });
    await db.template.deleteMany({ where: { clientId: { in: [clientId, otherClientId] } } });
    await db.conversationRuntimeState.deleteMany({ where: { clientId: { in: [clientId, otherClientId] } } });
    await db.conversation.deleteMany({ where: { clientId: { in: [clientId, otherClientId] } } });
    await db.contactChannelIdentity.deleteMany({ where: { clientId: { in: [clientId, otherClientId] } } });
    await db.contact.deleteMany({ where: { clientId: { in: [clientId, otherClientId] } } });
    await db.lead.deleteMany({ where: { tenantId: { in: [clientId, otherClientId] } } });
    await db.client.deleteMany({ where: { id: { in: [clientId, otherClientId] } } });
    await db.$disconnect();
  });
  await db.client.createMany({ data: [
    { id: clientId, clientKey, name: "Synthetic", profile: "business", features: { campaigns: true } },
    { id: otherClientId, clientKey: `other-${otherClientId}`, name: "Other", profile: "business" },
  ] });
  await db.template.create({ data: { clientId, name: templateName, category: "UTILITY", language: "pt_BR", status: "approved", content: "Synthetic" } });
  const campaign = await db.campaign.create({ data: { clientId, name: "Accepted CRM failure", templateName,
    status: "sending", totalRecipients: recipients.length, sentCount: 2 } });
  const job = await db.campaignExecutionJob.create({ data: { clientId, campaignId: campaign.id, kind: "campaign",
    status: "queued", eligibleAt: new Date(), idempotencyKey: crypto.randomUUID(), failureReason: "operational_suspension" } });
  const seed = await db.event.create({ data: { clientId, messageId: campaign.id, eventName: "campaign.seed.saved",
    payloadJson: { templateName, ...buildPrivateCampaignSeedFields({ clientId, waIds: recipients }) } } });
  const runId = crypto.randomUUID(), metaMessageId = "wamid.synthetic.accepted.crm.failure";
  const accepted = await db.event.create({ data: { clientId, waId: recipients[2], messageId: `campaign.${campaign.id}.3`,
    eventName: "campaign.message.provider_accepted", payloadJson: { campaignId: campaign.id, campaignRunId: runId, metaMessageId } } });
  const outbounds = await Promise.all(recipients.slice(0, 3).map((waId, index) => db.outboundMessage.create({ data: {
    clientId, waId, messageId: `campaign.${campaign.id}.${index + 1}`, metaMessageId: index === 2 ? metaMessageId : `wamid.synthetic.${index + 1}`,
    channel: "whatsapp", provider: "meta", type: "TEMPLATE", status: index === 2 ? "FAILED" : "SENT",
    rawPayload: index === 2 ? { metaStatus: { lastStatus: "failed", errors: [{ code: 130497 }] } } : {},
  } })));
  await db.event.createMany({ data: recipients.slice(0, 3).map((_waId, index) => ({ clientId,
    messageId: `campaign.${campaign.id}.${index + 1}`, eventName: "campaign.message.submit_started", payloadJson: {} })) });
  await campaignTask("synthetic-crm-failure", async () => {
    await campaignProviderAttempt(async () => undefined, async () => ({ ok: true }), {
      clientId, campaignId: campaign.id, messageId: `campaign.${campaign.id}.3`,
    });
  });
  const guard = campaignOperationsStatus();
  assert.equal(guard.open, false); assert.equal(guard.tasks.length, 1);
  const bindings: AcceptedCrmFailureBindings = { clientId, campaignId: campaign.id, jobId: job.id, runId,
    seedEventId: seed.id, acceptedEventId: accepted.id, failedOutboundId: outbounds[2].id,
    taskId: guard.tasks[0].id, guardGeneration: guard.generation!, position: 3, providerErrorCode: 130497 };

  const plan = await dryRunAcceptedCrmFailure(db, bindings);
  assert.equal(plan.alreadyApplied, false);
  if (plan.alreadyApplied) throw new Error("unexpected_prior_receipt");
  assert.equal(plan.plan.providerCalls, 0);
  await assert.rejects(dryRunAcceptedCrmFailure(db, { ...bindings, clientId: otherClientId }), /task_binding_mismatch/);
  await assert.rejects(applyAcceptedCrmFailure(db, bindings, "0".repeat(64)), /plan_drift/);
  await applyAcceptedCrmFailure(db, bindings, plan.planHash);
  assert.equal((await applyAcceptedCrmFailure(db, bindings, plan.planHash)).alreadyApplied, true);
  const verified = await verifyAcceptedCrmFailure(db, bindings);
  assert.equal(verified.campaignContinuationAuthorized, false);
  assert.equal(await db.outboundMessage.count({ where: { clientId } }), 3);
  assert.equal(await db.contact.count({ where: { clientId } }), 0);
  assert.equal((await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status, "sending");
  assert.equal((await db.campaignExecutionJob.findUniqueOrThrow({ where: { id: job.id } })).status, "queued");
  assert.equal(campaignOperationsStatus().open, false);
  assert.equal(campaignOperationsStatus().tasks.length, 1);
  const acknowledged = await acknowledgeAcceptedCrmFailure(db, bindings, "synthetic-reviewer");
  assert.equal(acknowledged.status.open, false); assert.equal(acknowledged.status.tasks.length, 0);
  assert.notEqual(acknowledged.status.generation, null);

  // Reopening and continuation are deliberately separate from reconciliation.
  setCampaignOperations(true, acknowledged.status.generation!, "synthetic-reviewer", "separate authorized continuation");
  const originalFetch = globalThis.fetch; const submitted: string[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body ?? "{}")); submitted.push(payload.to);
    return new Response(JSON.stringify({ messages: [{ id: "wamid.synthetic.4" }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  startCampaignRun({ clientId, clientKey, campaignId: campaign.id, name: campaign.name, templateName, waIds: recipients });
  await getRunningCampaignPromiseForTests(campaign.id);
  assert.deepEqual(submitted, [recipients[3]], "positions 1-3 must never be submitted again");
  const completed = await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
  assert.equal(completed.status, "completed"); assert.equal(completed.sentCount, 3);
  assert.equal(await db.event.count({ where: { clientId: otherClientId } }), 0);
});
