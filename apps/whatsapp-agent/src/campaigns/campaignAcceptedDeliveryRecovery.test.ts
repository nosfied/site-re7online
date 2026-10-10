import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { POSITION6_APPROVAL } from "./position6ApprovedDisposition.js";
import { originalEvidenceHash as h, operationalProofHashes, dryRunPosition6, applyPosition6, verifyPosition6, acknowledgePosition6, type Position6RecoveryInput } from "./campaignAcceptedDeliveryRecovery.js";
import { deliveryEvidenceHash } from "./campaignAcceptedDeliveryReview.js";
import { campaignOperationsStatus, readCampaignReconciliationFence, acknowledgeReconciledCampaignTask } from "./campaignOperations.js";
import { buildPrivateCampaignSeedFields } from "./campaignSeedPrivacy.js";
const url = new URL(process.env.DATABASE_URL || "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/re7_position6_recovery_20261010");
assert.equal(process.version, "v20.20.0");
const db = new PrismaClient({ log: [] });
test.after(() => db.$disconnect());
process.env.CAMPAIGN_OPERATIONS_TOPOLOGY = "single-host";
process.env.CAMPAIGN_OPERATIONS_HOST_ID = fs.readFileSync("/etc/machine-id", "utf8").trim();
process.env.CAMPAIGN_SEED_SECRET = "position6-synthetic-seed-only";
let providerCalls = 0;
globalThis.fetch = async () => { providerCalls++; throw Error("provider_forbidden_in_offline_recovery"); };
const digest = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
async function fixture() {
    // Entire database is a freshly created synthetic schema; exact case IDs are
    // reused solely to exercise the production scope check, never real content.
    await db.event.deleteMany();
    await db.outboundMessage.deleteMany();
    await db.tenantCampaignExecutionLease.deleteMany();
    await db.campaignExecutionJob.deleteMany();
    await db.campaignExecutionBatchCampaign.deleteMany();
    await db.campaignExecutionBatch.deleteMany();
    await db.campaign.deleteMany();
    await db.conversationRuntimeState.deleteMany();
    await db.conversation.deleteMany();
    await db.lead.deleteMany();
    await db.contact.deleteMany();
    await db.client.deleteMany();
    const b = { ...POSITION6_APPROVAL.scope, phoneNumberId: "synthetic-original-account", taskHash: "", preservedOutboundHashes: {} as Record<string, string> };
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "re7-position6-local-"));
    process.env.CAMPAIGN_OPERATIONS_FILE = path.join(root, "state.json");
    const instance = campaignOperationsStatus().instance;
    const messageId = `campaign.${b.campaignId}.6`, metaMessageId = "synthetic-accepted-delivered-only", waId = "447700900123";
    const task = { parent: "synthetic-parent", instance, build: "synthetic-build", generation: 36, kind: "provider", phase: "persisting", startedAt: "2026-10-10T15:40:34.940Z", reference: { clientId: b.clientId, campaignId: b.campaignId, messageId } };
    b.taskHash = deliveryEvidenceHash(task);
    const fence = { version: 1, hostId: process.env.CAMPAIGN_OPERATIONS_HOST_ID, open: false, generation: 37, tasks: { [b.taskId]: task }, audit: [] };
    fs.writeFileSync(process.env.CAMPAIGN_OPERATIONS_FILE!, JSON.stringify(fence), { mode: 0o600 });
    await db.client.create({ data: { id: b.clientId, clientKey: "demo-converta", name: "SYNTHETIC ONLY", profile: "business" } });
    const campaign = await db.campaign.create({ data: { id: b.campaignId, clientId: b.clientId, name: "Synthetic child", templateName: "data_exame", status: "sending", totalRecipients: 11, sentCount: 5, createdAt: new Date("2026-10-10T15:40:24Z") } });
    const parent = await db.campaign.create({ data: { id: b.parentCampaignId, clientId: b.clientId, name: "Synthetic parent", templateName: "data_exame", status: "sending", totalRecipients: 11, blockedCount: 244 } });
    const batch = await db.campaignExecutionBatch.create({ data: { id: b.batchId, clientId: b.clientId, name: "Synthetic batch", sourceMode: "DYNAMIC_CRM_FILTER", status: "running", totalRecipients: 11, blockedCount: 244, chunkCount: 1, eligibleAt: new Date("2026-10-10T15:40:00Z"), idempotencyKey: `dynamic:${parent.id}`, metadata: { parentCampaignId: parent.id } } });
    const link = await db.campaignExecutionBatchCampaign.create({ data: { id: b.linkId, clientId: b.clientId, campaignId: campaign.id, batchId: batch.id, chunkIndex: 1, recipientCount: 11, status: "scheduled" } });
    const job = await db.campaignExecutionJob.create({ data: { id: b.jobId, clientId: b.clientId, campaignId: campaign.id, batchId: batch.id, kind: "batch_chunk", status: "queued", attempt: 1, eligibleAt: new Date("2026-10-10T15:40:24.152Z"), idempotencyKey: "synthetic", failureReason: "operational_suspension" } });
    const crm = { contacts: [await db.contact.create({ data: { clientId: b.clientId, waId, provider: "web_session", channel: "whatsapp", channelAccountId: "synthetic-web", name: "synthetic" } })], leads: [await db.lead.create({ data: { tenantId: b.clientId, waId, provider: "web_session", channelAccountId: "synthetic-web" } })], conversations: [await db.conversation.create({ data: { clientId: b.clientId, waId, provider: "web_session", channelAccountId: "synthetic-web", lastInboundAt: new Date("2026-08-29T10:49:52Z"), windowExpiresAt: new Date("2026-08-30T10:49:52Z"), windowIsOpen: true } })], runtimes: [await db.conversationRuntimeState.create({ data: { clientId: b.clientId, waId, provider: "web_session", channelAccountId: "synthetic-web", mode: "HUMAN", assignedUserId: "synthetic-human", lastInboundAt: new Date("2026-08-29T10:49:52Z"), windowExpiresAt: new Date("2026-08-30T10:49:52Z"), windowIsOpen: true, version: 17 } })] };
    const recipients = Array.from({ length: 11 }, (_, i) => i === 5 ? waId : `55419911000${String(i + 1).padStart(2, "0")}`), components = [{ type: "body" as const, parameters: [{ type: "text" as const, text: "SYNTHETIC VALUE" }] }];
    const originalTimes = { intent: "2026-10-10T15:40:34.964Z", accepted: "2026-10-10T15:40:35.501Z", sent: "2026-10-10T15:40:44.443Z", delivered: "2026-10-10T15:40:44.528Z" };
    const ev = (id: string, eventName: string, msg: string, payloadJson: any, time: string, wa: string | null = null) => db.event.create({ data: { id, clientId: b.clientId, eventName, messageId: msg, waId: wa, requestId: `synthetic:${id}`, payloadJson, createdAt: new Date(time) } });
    const seed = await ev(b.seedEventId, "campaign.seed.saved", b.campaignId, { campaignId: b.campaignId, name: "Synthetic child", templateName: "data_exame", templateId: "synthetic-template", returnDestination: { type: "human_department", departmentId: "synthetic-general", queueId: "synthetic-queue" }, ...buildPrivateCampaignSeedFields({ clientId: b.clientId, waIds: recipients, componentsByWaId: { [waId]: components } }) }, "2026-10-10T15:40:24.831Z");
    const snapshot = await ev(b.snapshotEventId, "campaign.dynamic_batch_snapshot.created", b.parentCampaignId, { campaignId: b.parentCampaignId, ...buildPrivateCampaignSeedFields({ clientId: b.clientId, waIds: recipients, componentsByWaId: { [waId]: components } }) }, "2026-10-10T15:40:24.733Z");
    const intent = await ev(b.intentEventId, "campaign.message.submit_started", messageId, { campaignId: b.campaignId, campaignRunId: b.runId }, originalTimes.intent, waId);
    const accepted = await ev(b.acceptedEventId, "campaign.message.provider_accepted", messageId, { campaignId: b.campaignId, campaignRunId: b.runId, acceptedAt: "2026-10-10T15:40:35.500Z", metaMessageId }, originalTimes.accepted, waId);
    const sent = await ev(b.sentWebhookId, "webhook.status.orphaned", metaMessageId, { metaMessageId, status: "sent", timestamp: "1791646843", reason: "outbound_message_not_found", pricing: { category: "utility", billable: true, pricing_model: "PMP" } }, originalTimes.sent);
    const delivered = await ev(b.deliveredWebhookId, "webhook.status.orphaned", metaMessageId, { metaMessageId, status: "delivered", timestamp: "1791646843", reason: "outbound_message_not_found", pricing: { category: "utility", billable: true, pricing_model: "PMP" } }, originalTimes.delivered);
    const prior = [];
    for (let n = 1; n <= 5; n++)
        prior.push(await db.outboundMessage.create({ data: { clientId: b.clientId, messageId: `campaign.${b.campaignId}.${n}`, phoneNumberId: b.phoneNumberId, waId: recipients[n - 1], provider: "meta", channel: "whatsapp", type: "TEMPLATE", status: "SENT", bodyText: "Histórico sintético preservado", createdAt: new Date("2026-10-10T15:40:30Z"), rawPayload: { campaignId: b.campaignId, metaStatus: { lastStatus: "delivered", lastStatusAt: "2026-10-10T15:40:43.000Z" } } } }));
    b.preservedOutboundHashes = Object.fromEntries(prior.map(x => [x.id, h(x)]));
    const transportRecord = { direction: "outbound", messageId: metaMessageId, metaMessageId, to: waId, from: waId, timestamp: "2026-10-10T15:40:35.454Z", type: "template", text: null, templateName: "data_exame", language: "pt_BR", clientKey: "demo-converta", status: "sent", raw: { senderPhoneNumberId: b.phoneNumberId, requestId: "synthetic-request", rid: b.runId, metaMessageId } };
    const log = { clientId: b.clientId, clientKey: "demo-converta", messageId, rid: b.runId, requestId: "synthetic-request", template: "data_exame", language: "pt_BR", resolvedPhoneNumberId: b.phoneNumberId };
    const sendingLogLine = JSON.stringify({ ...log, event: "outbound.template.sending", timestamp: "2026-10-10T15:40:34.994Z" }), sentLogLine = JSON.stringify({ ...log, event: "outbound.template.sent", timestamp: "2026-10-10T15:40:35.479Z", metaMessageId });
    const input: Position6RecoveryInput = { bindings: b, transportRecord, sendingLogLine, sentLogLine, syntheticProofPolicy: { taskHash: b.taskHash, metaMessageIdSha256: digest(metaMessageId), recipientSha256: digest(waId), accountSha256: digest(b.phoneNumberId), preservedOutboundHashes: b.preservedOutboundHashes, sources: { ...Object.fromEntries(Object.entries({ seed, snapshot, intent, accepted, sent, delivered }).map(([k, x]) => [k, h(x)])), transport: h(transportRecord), sendingLog: digest(sendingLogLine), sentLog: digest(sentLogLine) }, crmHashes: Object.fromEntries(Object.entries(crm).map(([k, rows]) => [k, Object.fromEntries(rows.map(x => [x.id, h(x)]))])), operationalHashes: operationalProofHashes({ campaign, parent, batch, link, job }) } };
    return { input, prior, crm, root, messageId, metaMessageId, fence };
}
async function assertPreserved(f: Awaited<ReturnType<typeof fixture>>) { for (const row of f.prior)
    assert.equal(h(await db.outboundMessage.findUniqueOrThrow({ where: { id: row.id } })), h(row)); for (const [k, rows] of Object.entries(f.crm))
    for (const row of rows) {
        const model = k === "contacts" ? db.contact : k === "leads" ? db.lead : k === "conversations" ? db.conversation : db.conversationRuntimeState;
        assert.equal(h(await (model as any).findUniqueOrThrow({ where: { id: row.id } })), h(row));
    } assert.equal(await db.outboundMessage.count({ where: { messageId: { in: [7, 8, 9, 10, 11].map(n => `campaign.${f.input.bindings.campaignId}.${n}`) } } }), 0); assert.equal(providerCalls, 0); }
async function apply(f: Awaited<ReturnType<typeof fixture>>) { const dry = await dryRunPosition6(db, f.input); return applyPosition6(db, f.input, dry.planHash, "synthetic-owner"); }
test("A/B/C: exact disposition, real SQL totals and closed ledger archive; replay before and after ack", async () => {
    const f = await fixture(), before = fs.readFileSync(process.env.CAMPAIGN_OPERATIONS_FILE!);
    const d = await dryRunPosition6(db, f.input);
    assert.equal(d.alreadyApplied, false);
    assert.equal(await db.outboundMessage.count(), 5);
    assert.deepEqual(fs.readFileSync(process.env.CAMPAIGN_OPERATIONS_FILE!), before);
    const applied = await applyPosition6(db, f.input, d.planHash, "synthetic-owner");
    assert.equal(applied.alreadyApplied, false);
    const verified = await verifyPosition6(db, f.input);
    assert.equal(verified.totals.metaSummary.totalDelivered, 6);
    assert.equal(verified.totals.metaSummary.totalPending, 5);
    assert.deepEqual(verified.totals.progress, { totalRecipients: 11, sentCount: 6, blockedCount: 0, failedCount: 0, pendingCount: 5 });
    const out = await db.outboundMessage.findFirstOrThrow({ where: { messageId: f.messageId } });
    assert.equal(out.bodyText, null);
    assert.equal((out.rawPayload as any).metaUsage.outboundMessageId,out.id);
    for (const event of await db.event.findMany({where:{messageId:f.messageId,eventName:{in:["meta.usage.estimated","meta.usage.updated"]}}})) assert.equal((event.payloadJson as any).outboundMessageId,out.id);
    assert.equal(out.status, "SENT");
    assert.equal((out.rawPayload as any).metaStatus.lastStatus, "delivered");
    assert.equal((out.rawPayload as any).httpStatus, null);
    assert.equal((out.rawPayload as any).humanReceiptConfirmed, false);
    const eventsBefore = await db.event.count();
    for (let n = 0; n < 2; n++) {
        assert.equal((await applyPosition6(db, f.input, d.planHash, "another-actor")).alreadyApplied, true);
        assert.equal((await dryRunPosition6(db, f.input)).alreadyApplied, true);
    }
    assert.equal(await db.event.count(), eventsBefore);
    assert.equal(await db.outboundMessage.count(), 6);
    await assertPreserved(f);
    const { buildCampaignDetailPayload, buildCampaignListPayload } = await import("../http/routes.js");
    const childDetail = await buildCampaignDetailPayload(db, { clientId: f.input.bindings.clientId, campaignId: f.input.bindings.campaignId });
    const parentDetail = await buildCampaignDetailPayload(db, { clientId: f.input.bindings.clientId, campaignId: f.input.bindings.parentCampaignId });
    assert.equal((childDetail as any).campaign.metaSummary.totalDelivered, 6);
    assert.equal((childDetail as any).campaign.metaSummary.totalPending, 5);
    assert.equal((parentDetail as any).campaign.executionBatch.progress.sentCount, 6);
    assert.equal((parentDetail as any).campaign.executionBatch.progress.pendingCount, 5);
    const list = await buildCampaignListPayload(db, { clientId: f.input.bindings.clientId, limit: 100 });
    assert.ok(list);
    assert.equal(readCampaignReconciliationFence().generation, 37);
    const ack = await acknowledgePosition6(db, f.input, "synthetic-owner");
    assert.equal(ack.open, false);
    assert.equal(ack.generation, 38);
    const fence = readCampaignReconciliationFence();
    assert.equal(Object.keys(fence.tasks).length, 0);
    assert.equal(fence.audit[0].reason, "durable_accepted_delivered_historical_crm_disposition_no_retry");
    assert.deepEqual(fence.audit[0].resolvedTask?.task, Object.values(f.fence.tasks)[0]);
    assert.equal((await acknowledgePosition6(db, f.input, "synthetic-owner")).generation, 38);
    assert.equal(readCampaignReconciliationFence().audit.length, 1);
    assert.equal((await applyPosition6(db, f.input, d.planHash, "synthetic-owner")).alreadyApplied, true);
    await assertPreserved(f);
    assert.equal((await db.campaignExecutionJob.findUniqueOrThrow({ where: { id: f.input.bindings.jobId } })).status, "queued");
    assert.equal((await db.campaignExecutionBatch.findUniqueOrThrow({ where: { id: f.input.bindings.batchId } })).status, "running");
});
test("unreceipted unique Outbound, pre-existing persistence and incompatible receipt deny; no extra writes", async () => {
    const f = await fixture(), d = await dryRunPosition6(db, f.input);
    await db.outboundMessage.create({ data: { clientId: f.input.bindings.clientId, messageId: f.messageId, waId: "other", type: "TEMPLATE", status: "FAILED" } });
    await assert.rejects(applyPosition6(db, f.input, d.planHash, "owner"), /unreceipted_result_conflict/);
    assert.equal(await db.event.count({ where: { eventName: "campaign.accepted_delivery.reconciled" } }), 0);
    await db.outboundMessage.deleteMany({ where: { messageId: f.messageId } });
    await db.event.create({ data: { clientId: f.input.bindings.clientId, messageId: f.messageId, eventName: "meta.usage.estimated", requestId: `position6:${f.input.bindings.acceptedEventId}:usage-sent`, payloadJson: { wrong: true } } });
    await assert.rejects(applyPosition6(db, f.input, d.planHash, "owner"));
    assert.equal(await db.outboundMessage.count(), 5);
    await assertPreserved(f);
});
test("real SQL error at receipt insert rolls back Outbound, counters and every obligation", async () => {
    const f = await fixture(), d = await dryRunPosition6(db, f.input);
    await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION position6_test_fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventName"='campaign.accepted_delivery.reconciled' THEN RAISE EXCEPTION 'synthetic_receipt_sql_failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER position6_fail_receipt BEFORE INSERT ON "Event" FOR EACH ROW EXECUTE FUNCTION position6_test_fail_receipt()`);
    try {
        await assert.rejects(applyPosition6(db, f.input, d.planHash, "owner"), /synthetic_receipt_sql_failure/);
    }
    finally {
        await db.$executeRawUnsafe(`DROP TRIGGER position6_fail_receipt ON "Event"`);
        await db.$executeRawUnsafe(`DROP FUNCTION position6_test_fail_receipt()`);
    }
    assert.equal(await db.outboundMessage.count(), 5);
    assert.equal((await db.campaign.findUniqueOrThrow({ where: { id: f.input.bindings.campaignId } })).sentCount, 5);
    assert.equal(readCampaignReconciliationFence().generation, 37);
    await assertPreserved(f);
});
test("failure after durable SQL before ledger archival keeps task; verify then ack without apply/resend", async () => {
    const f = await fixture();
    await apply(f);
    const rename = fs.renameSync;
    fs.renameSync = () => { throw Object.assign(Error("synthetic ledger EIO"), { code: "EIO" }); };
    try {
        await assert.rejects(acknowledgePosition6(db, f.input, "owner"), /synthetic ledger EIO/);
    }
    finally {
        fs.renameSync = rename;
    }
    assert.equal(await db.outboundMessage.count(), 6);
    assert.equal(readCampaignReconciliationFence().generation, 37);
    assert.equal(Object.keys(readCampaignReconciliationFence().tasks).length, 1);
    await verifyPosition6(db, f.input);
    assert.equal((await acknowledgePosition6(db, f.input, "owner")).generation, 38);
    await assertPreserved(f);
});
for (const scenario of ["tenant", "account", "task", "seed", "transport", "operational", "remaining", "contradictory_status", "crm"] as const)
    test(`negative ${scenario} denies before SQL recovery and ledger mutation`, async () => {
        const f = await fixture();
        let input = structuredClone(f.input);
        if (scenario === "tenant")
            input.bindings.clientId = crypto.randomUUID();
        if (scenario === "account")
            input.bindings.phoneNumberId = "wrong-account";
        if (scenario === "task")
            input.bindings.taskHash = "0".repeat(64);
        if (scenario === "seed")
            await db.event.update({ where: { id: input.bindings.seedEventId }, data: { payloadJson: { wrong: true } } });
        if (scenario === "transport")
            input.transportRecord.raw.senderPhoneNumberId = "wrong-account";
        if (scenario === "operational")
            await db.campaignExecutionJob.update({ where: { id: input.bindings.jobId }, data: { leaseOwner: "unexpected-executor" } });
        if (scenario === "remaining")
            await db.event.create({ data: { clientId: input.bindings.clientId, eventName: "campaign.message.submit_started", messageId: `campaign.${input.bindings.campaignId}.7`, payloadJson: {} } });
        if (scenario === "contradictory_status")
            await db.event.create({ data: { clientId: input.bindings.clientId, eventName: "webhook.status.orphaned", messageId: f.metaMessageId, payloadJson: { metaMessageId: f.metaMessageId, status: "failed" } } });
        if (scenario === "crm")
            await db.conversationRuntimeState.update({ where: { id: f.crm.runtimes[0].id }, data: { version: 18, assignedUserId: "new-human" } });
        await assert.rejects(dryRunPosition6(db, input));
        assert.equal(await db.outboundMessage.count(), 5);
        assert.equal(readCampaignReconciliationFence().generation, 37);
        assert.equal(providerCalls, 0);
    });
for (const obligation of ["crm", "usage-sent", "usage-delivered", "sent", "billing", "receipt"] as const)
    test(`ack denies missing or tampered ${obligation} obligation`, async () => {
        const f = await fixture();
        await apply(f);
        await db.event.updateMany({ where: { requestId: `position6:${f.input.bindings.acceptedEventId}:${obligation}` }, data: { payloadJson: { tampered: true } } });
        await assert.rejects(acknowledgePosition6(db, f.input, "owner"));
        assert.equal(readCampaignReconciliationFence().generation, 37);
        await assertPreserved(f);
    });
test("guard faults and archived task drift deny; existing FAILED131026 reason remains intact", async () => {
    const f = await fixture();
    fs.mkdirSync(process.env.CAMPAIGN_OPERATIONS_FILE! + ".uncertain");
    await assert.rejects(dryRunPosition6(db, f.input), /fence_busy_or_uncertain/);
    fs.rmdirSync(process.env.CAMPAIGN_OPERATIONS_FILE! + ".uncertain");
    await apply(f);
    await acknowledgePosition6(db, f.input, "owner");
    const state = readCampaignReconciliationFence();
    state.audit[0].reason = "durable_failed_result_no_retry";
    fs.writeFileSync(process.env.CAMPAIGN_OPERATIONS_FILE!, JSON.stringify(state));
    await assert.rejects(acknowledgePosition6(db, f.input, "owner"), /archived_task_drift/);
    const failed = await fixture();
    acknowledgeReconciledCampaignTask({ generation: 37, taskId: failed.input.bindings.taskId, expectedTaskHash: failed.input.bindings.taskHash, reference: { clientId: failed.input.bindings.clientId, campaignId: failed.input.bindings.campaignId, messageId: failed.messageId }, receiptId: "synthetic-failed-receipt", actor: "synthetic-old-contract" });
    assert.equal(readCampaignReconciliationFence().audit[0].reason, "durable_failed_result_no_retry");
});
test("production approval refuses synthetic hashes when synthetic policy omitted", async () => { const f = await fixture(); const input = { ...f.input, syntheticProofPolicy: undefined }; await assert.rejects(dryRunPosition6(db, input), /binding_hash_mismatch/); assert.equal(await db.outboundMessage.count(), 5); });
test("plan drift and open/generation/lock fences deny before apply or ack", async () => {
    const f = await fixture(), dry = await dryRunPosition6(db, f.input);
    await assert.rejects(applyPosition6(db, f.input, "0".repeat(64), "owner"), /plan_drift/);
    assert.equal(await db.outboundMessage.count(), 5);
    const file = process.env.CAMPAIGN_OPERATIONS_FILE!;
    fs.mkdirSync(file + ".lock");
    await assert.rejects(dryRunPosition6(db, f.input), /fence_busy_or_uncertain/);
    fs.rmdirSync(file + ".lock");
    await applyPosition6(db, f.input, dry.planHash, "owner");
    fs.writeFileSync(file, JSON.stringify({ ...f.fence, open: true }));
    await assert.rejects(acknowledgePosition6(db, f.input, "owner"), /guard_task_mismatch/);
    fs.writeFileSync(file, JSON.stringify({ ...f.fence, generation: 39 }));
    await assert.rejects(acknowledgePosition6(db, f.input, "owner"), /guard_task_mismatch/);
    fs.writeFileSync(file, JSON.stringify(f.fence));
    await verifyPosition6(db, f.input);
    await assertPreserved(f);
});
test("tampered result, real totals and receipt Outbound link deny success acknowledgement", async () => {
    const f = await fixture();
    await apply(f);
    const out = await db.outboundMessage.findFirstOrThrow({ where: { messageId: f.messageId } });
    await db.outboundMessage.update({ where: { id: out.id }, data: { metaMessageId: "other-provider-id" } });
    await assert.rejects(acknowledgePosition6(db, f.input, "owner"), /result_drift/);
    await db.outboundMessage.update({ where: { id: out.id }, data: { metaMessageId: out.metaMessageId } });
    await db.campaign.update({ where: { id: f.input.bindings.campaignId }, data: { sentCount: 5 } });
    await assert.rejects(acknowledgePosition6(db, f.input, "owner"), /canonical_totals_drift/);
    await db.campaign.update({ where: { id: f.input.bindings.campaignId }, data: { sentCount: 6 } });
    const receipt = await db.event.findFirstOrThrow({ where: { eventName: "campaign.accepted_delivery.reconciled" } });
    await db.event.update({ where: { id: receipt.id }, data: { payloadJson: { ...(receipt.payloadJson as any), reconciledOutboundId: crypto.randomUUID() } } });
    await assert.rejects(acknowledgePosition6(db, f.input, "owner"), /receipt_drift/);
    assert.equal(readCampaignReconciliationFence().generation, 37);
    await assertPreserved(f);
});
test("offline CLI exact dry-run/apply/verify/ack subprocesses enforce authorization and private diagnostics", async () => {
    const f = await fixture(), file = path.join(f.root, "input.private.json");
    fs.writeFileSync(file, JSON.stringify(f.input), { mode: 0o600 });
    const hash = digest(fs.readFileSync(file, "utf8"));
    const script = new URL("../../scripts/reconcile-position6-accepted-delivery.ts", import.meta.url).pathname, loader = new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url).pathname;
    const run = (mode: string, extra: string[] = []) => { const output = path.join(f.root, `cli-${mode}-${crypto.randomUUID()}.json`); const result = spawnSync(process.execPath, ["--import", loader, script, `--mode=${mode}`, `--input=${file}`, `--input-sha256=${hash}`, `--output=${output}`, ...extra], { env: { ...process.env }, encoding: "utf8", timeout: 20000 }); return { ...result, output }; };
    const denied = run("apply-sql");
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /execution_not_authorized/);
    assert.equal(await db.outboundMessage.count(), 5);
    const dry = run("dry-run");
    assert.equal(dry.status, 0, dry.stderr);
    const plan = JSON.parse(fs.readFileSync(dry.output, "utf8")).result.planHash;
    const applied = run("apply-sql", ["--execute-authorized", `--plan-hash=${plan}`, "--actor=synthetic-owner"]);
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(run("verify-receipt").status, 0);
    const ack = run("ack-task", ["--execute-authorized", "--actor=synthetic-owner"]);
    assert.equal(ack.status, 0, ack.stderr);
    assert.equal(readCampaignReconciliationFence().generation, 38);
    assert.equal(fs.statSync(ack.output).mode & 0o777, 0o600);
    const replay = run("ack-task", ["--execute-authorized", "--actor=synthetic-owner"]);
    assert.equal(replay.status, 0, replay.stderr);
    assert.equal(readCampaignReconciliationFence().audit.length, 1);
    await assertPreserved(f);
    const bad = run("apply-sql", ["--execute-authorized", `--plan-hash=${"0".repeat(64)}`, "--actor=synthetic-owner"]);
    assert.notEqual(bad.status, 0);
    assert.equal(JSON.parse(fs.readFileSync(bad.output, "utf8")).error.reason, "position6_plan_drift");
});

test("synthetic approval denies another actual PostgreSQL database", async () => {
 const f=await fixture();const otherUrl=new URL(process.env.DATABASE_URL!);otherUrl.pathname="/postgres";const other=new PrismaClient({datasources:{db:{url:otherUrl.toString()}}});
 try {await assert.rejects(dryRunPosition6(other,f.input),/synthetic_policy_not_isolated/);} finally {await other.$disconnect();}
 await assertPreserved(f);
});

test("concurrent SQL applies serialize or deny uniqueness; one durable result and receipt", async () => {
    const f=await fixture(), dry=await dryRunPosition6(db,f.input);
    const outcomes=await Promise.allSettled([applyPosition6(db,f.input,dry.planHash,"owner-A"),applyPosition6(db,f.input,dry.planHash,"owner-B")]);
    assert.ok(outcomes.some(x=>x.status==="fulfilled"));
    for(const x of outcomes) if(x.status==="rejected") assert.ok(["P2034","P2002"].includes(x.reason?.code),String(x.reason?.code));
    assert.equal(await db.outboundMessage.count(),6);
    assert.equal(await db.event.count({where:{eventName:"campaign.accepted_delivery.reconciled"}}),1);
    await verifyPosition6(db,f.input);await assertPreserved(f);
});
