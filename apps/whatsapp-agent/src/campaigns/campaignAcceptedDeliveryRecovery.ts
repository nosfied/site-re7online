import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { POSITION6_APPROVAL } from "./position6ApprovedDisposition.js";
import { deliveryEvidenceHash, inspectAcceptedDelivery, type DeliveryReviewBindings } from "./campaignAcceptedDeliveryReview.js";
import { readPrivateCampaignSeedFields } from "./campaignSeedPrivacy.js";
import { shouldApplyProviderStatus } from "./campaignDeliveryTruth.js";
import { buildMetaUsageEventPayload } from "../billing/metaUsageLedger.js";
import { recordActiveMessageDeliveryIfNeeded } from "../billing/activeMessageBilling.js";
import { buildCampaignMetaStatusItem, buildCampaignRecipientResultStatuses, summarizeCampaignMetaStatuses } from "./campaignRecipientResultTruth.js";
import { readCampaignReconciliationFence, acknowledgeAcceptedDeliveredCampaignTask } from "./campaignOperations.js";
type Tx = Prisma.TransactionClient;
type Approval = typeof POSITION6_APPROVAL;
export type Position6ProofPolicy = {
    taskHash: string;
    metaMessageIdSha256: string;
    accountSha256: string;
    recipientSha256: string;
    sources: Record<string, string>;
    crmHashes: Record<string, Record<string, string>>;
    preservedOutboundHashes: Record<string, string>;
    operationalHashes: Record<string, string>;
};
export type Position6RecoveryInput = {
    bindings: DeliveryReviewBindings & {
        seedEventId: string;
        snapshotEventId: string;
    };
    transportRecord: Record<string, any>;
    sendingLogLine: string;
    sentLogLine: string;
    // Synthetic hash policy is legal only on the specifically named local DB,
    // checked using the connected PostgreSQL server, never just an env URL.
    syntheticProofPolicy?: Position6ProofPolicy;
};
export const originalEvidenceHash = (v: unknown) => crypto.createHash("sha256").update(JSON.stringify(v, (_k, x) => x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x).replace(/[\u0080-\uffff]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"))).digest("hex");
const digest = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
const rec = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
function need(v: unknown, code: string): asserts v { if (!v)
    throw Error(`position6_${code}`); }
const JSON_VALUE = (v: unknown) => v as Prisma.InputJsonValue;
const eventKey = (acceptedId: string, suffix: string) => `position6:${acceptedId}:${suffix}`;
export function operationalProofHashes(v: {
    campaign: any;
    parent: any;
    batch: any;
    link: any;
    job: any;
}) {
    const { sentCount: _s, updatedAt: _u, ...campaign } = v.campaign;
    return Object.fromEntries(Object.entries({ ...v, campaign }).map(([k, x]) => [k, originalEvidenceHash(x)]));
}
async function policy(tx: Tx, input: Position6RecoveryInput): Promise<Position6ProofPolicy> {
    for (const [k, v] of Object.entries(POSITION6_APPROVAL.scope))
        need((input.bindings as any)[k] === v, `scope_mismatch:${k}`);
    if (input.syntheticProofPolicy) {
        const rows = await tx.$queryRaw<Array<{
            db: string;
            addr: string | null;
        }>> `SELECT current_database() AS db,host(inet_server_addr()) AS addr`;
        need(rows.length === 1 && rows[0].db === "re7_position6_recovery_20261010" && ["127.0.0.1", "::1"].includes(rows[0].addr ?? ""), "synthetic_policy_not_isolated");
        return input.syntheticProofPolicy;
    }
    return POSITION6_APPROVAL;
}
async function lockScope(tx: Tx, b: Position6RecoveryInput["bindings"]) {
    await tx.$executeRaw `SET LOCAL statement_timeout='8000ms'`;
    await tx.$executeRaw `SET LOCAL lock_timeout='1000ms'`;
    // Same client -> batch -> job ordering as existing reconciliation. No network/provider.
    await tx.$queryRaw `SELECT id FROM "Client" WHERE id=${b.clientId}::uuid FOR UPDATE`;
    await tx.$queryRaw `SELECT id FROM "CampaignExecutionBatch" WHERE id=${b.batchId} FOR UPDATE`;
    await tx.$queryRaw `SELECT id FROM "CampaignExecutionJob" WHERE id=${b.jobId} FOR UPDATE`;
}
async function crmProof(tx: Tx, clientId: string, waId: string) {
    const where = { clientId, OR: [{ waId }, { waIdCanonical: waId }] };
    const result = { contacts: await tx.contact.findMany({ where: { clientId, waId }, orderBy: { id: "asc" }, take: 21 }), leads: await tx.lead.findMany({ where: { tenantId: clientId, OR: [{ waId }, { waIdCanonical: waId }, { phone: waId }] }, orderBy: { id: "asc" }, take: 21 }), conversations: await tx.conversation.findMany({ where, orderBy: { id: "asc" }, take: 21 }), runtimes: await tx.conversationRuntimeState.findMany({ where, orderBy: { id: "asc" }, take: 21 }) };
    need(Object.values(result).every(rows => rows.length <= 20), "crm_observation_limit");
    return Object.fromEntries(Object.entries(result).map(([k, rows]) => [k, Object.fromEntries(rows.map(r => [r.id, originalEvidenceHash(r)]))]));
}
async function inspect(tx: Tx, input: Position6RecoveryInput, guard: unknown) {
    const p = await policy(tx, input), b = input.bindings;
    need(b.taskHash === p.taskHash && deliveryEvidenceHash(b.preservedOutboundHashes) === deliveryEvidenceHash(p.preservedOutboundHashes), "binding_hash_mismatch");
    const client = await tx.client.findUnique({ where: { id: b.clientId } });
    need(client?.clientKey === "demo-converta", "tenant_mismatch");
    const prior = await tx.outboundMessage.findMany({ where: { clientId: b.clientId, messageId: { in: [1, 2, 3, 4, 5].map(n => `campaign.${b.campaignId}.${n}`) } }, orderBy: { messageId: "asc" } });
    need(prior.length === 5 && prior.every(r => originalEvidenceHash(r) === p.preservedOutboundHashes[r.id]), "preserved_outbound_drift");
    // Reuse the existing exact task/provider/remaining-position/lease verifier.
    const observedGuard = rec(guard);
    let inspectionGuard = guard;
    if (observedGuard.open === false && observedGuard.generation === 38 && Object.keys(rec(observedGuard.tasks)).length === 0) {
        const archived = observedGuard.audit?.filter((x: any) => x.action === "provider_reconciled" && x.resolvedTask?.id === b.taskId);
        need(archived?.length === 1 && archived[0].reason === "durable_accepted_delivered_historical_crm_disposition_no_retry" && deliveryEvidenceHash(archived[0].resolvedTask.task) === b.taskHash, "archived_task_drift");
        // Read-only verification/replay of an explicitly archived successful result.
        // Never used to admit work or adapt a current binding to another generation.
        inspectionGuard = { open: false, generation: 37, tasks: { [b.taskId]: archived[0].resolvedTask.task } };
    }
    const reviewed = await inspectAcceptedDelivery(tx, { ...b, preservedOutboundHashes: Object.fromEntries(prior.map(r => [r.id, deliveryEvidenceHash(r)])) }, inspectionGuard);
    need(digest(reviewed.metaMessageId) === p.metaMessageIdSha256 && digest(reviewed.waId) === p.recipientSha256 && digest(b.phoneNumberId) === p.accountSha256, "identity_account_mismatch");
    const originals: Record<string, any> = {};
    for (const [k, id] of Object.entries({ seed: b.seedEventId, snapshot: b.snapshotEventId, intent: b.intentEventId, accepted: b.acceptedEventId, sent: b.sentWebhookId, delivered: b.deliveredWebhookId })) {
        const row = await tx.event.findFirst({ where: { id, clientId: b.clientId } });
        need(row && originalEvidenceHash(row) === p.sources[k], `original_source_drift:${k}`);
        originals[k] = row;
    }
    need(originals.seed.eventName === "campaign.seed.saved" && originals.seed.messageId === b.campaignId && rec(originals.seed.payloadJson).campaignId === b.campaignId, "seed_binding_mismatch");
    need(originals.snapshot.eventName === "campaign.dynamic_batch_snapshot.created" && originals.snapshot.messageId === b.parentCampaignId && rec(originals.snapshot.payloadJson).campaignId === b.parentCampaignId, "snapshot_binding_mismatch");
    const seed = rec(originals.seed.payloadJson), decoded = readPrivateCampaignSeedFields(seed, { clientId: b.clientId }), snapshot = readPrivateCampaignSeedFields(originals.snapshot.payloadJson, { clientId: b.clientId });
    need(decoded.recipients.length === 11 && snapshot.recipients.length === 11 && decoded.recipients[5] === reviewed.waId && snapshot.recipients[5] === reviewed.waId && deliveryEvidenceHash(decoded.componentsByWaId?.[reviewed.waId]) === deliveryEvidenceHash(snapshot.componentsByWaId?.[reviewed.waId]) && Array.isArray(decoded.componentsByWaId?.[reviewed.waId]), "execution_payload_mismatch");
    const transport = input.transportRecord;
    let sending: any, sent: any;
    need(originalEvidenceHash(transport) === p.sources.transport && digest(input.sendingLogLine) === p.sources.sendingLog && digest(input.sentLogLine) === p.sources.sentLog, "transport_provenance_mismatch");
    try {
        sending = JSON.parse(input.sendingLogLine);
        sent = JSON.parse(input.sentLogLine);
    }
    catch {
        throw Error("position6_log_format_invalid");
    }
    for (const log of [sending, sent])
        need(log.clientId === b.clientId && log.clientKey === "demo-converta" && log.messageId === reviewed.messageId && log.rid === b.runId && log.resolvedPhoneNumberId === b.phoneNumberId && log.template === seed.templateName && log.language === "pt_BR", "submission_log_binding_mismatch");
    need(sending.event === "outbound.template.sending" && sent.event === "outbound.template.sent" && sent.metaMessageId === reviewed.metaMessageId, "submission_log_result_mismatch");
    need(transport.clientKey === "demo-converta" && transport.direction === "outbound" && transport.type === "template" && transport.status === "sent" && transport.text === null && transport.to.replace(/^\+/, "") === reviewed.waId && transport.metaMessageId === reviewed.metaMessageId && transport.templateName === seed.templateName && transport.language === "pt_BR" && transport.raw?.rid === b.runId && transport.raw.senderPhoneNumberId === b.phoneNumberId && transport.raw.requestId === sent.requestId, "transport_record_binding_mismatch");
    const dates = [sending.timestamp, transport.timestamp, sent.timestamp, reviewed.responseAt, reviewed.acceptedAt].map(v => Date.parse(v));
    need(dates.every(Number.isFinite) && dates.every((v, i) => i === 0 || v >= dates[i - 1]), "original_timeline_mismatch");
    const current = { campaign: await tx.campaign.findUniqueOrThrow({ where: { id: b.campaignId } }), parent: await tx.campaign.findUniqueOrThrow({ where: { id: b.parentCampaignId } }), batch: await tx.campaignExecutionBatch.findUniqueOrThrow({ where: { id: b.batchId } }), link: await tx.campaignExecutionBatchCampaign.findUniqueOrThrow({ where: { id: b.linkId } }), job: await tx.campaignExecutionJob.findUniqueOrThrow({ where: { id: b.jobId } }) };
    need(deliveryEvidenceHash(operationalProofHashes(current)) === deliveryEvidenceHash(p.operationalHashes), "operational_source_drift");
    need(current.campaign.totalRecipients === 11 && [5, 6].includes(current.campaign.sentCount) && current.campaign.blockedCount === 0 && current.parent.blockedCount === 244 && current.batch.blockedCount === 244, "counters_drift");
    const crm = await crmProof(tx, b.clientId, reviewed.waId);
    need(deliveryEvidenceHash(crm) === deliveryEvidenceHash(p.crmHashes), "crm_preservation_drift");
    // Existing international Web identity is preserved; it is NOT a Meta window/account certificate.
    const statuses = await tx.event.findMany({ where: { clientId: b.clientId, eventName: { in: ["webhook.status.orphaned", "webhook.status.updated"] }, OR: [{ messageId: reviewed.metaMessageId }, { payloadJson: { path: ["metaMessageId"], equals: reviewed.metaMessageId } }] }, take: 101 });
    need(statuses.length === 2 && statuses.every(x => [b.sentWebhookId, b.deliveredWebhookId].includes(x.id)), "provider_status_inventory_drift");
    need(shouldApplyProviderStatus({ currentStatus: "sent", currentStatusAt: rec(originals.sent.payloadJson).timestamp, incomingStatus: "delivered", incomingStatusAt: rec(originals.delivered.payloadJson).timestamp }), "status_monotonicity_mismatch");
    const usage = buildMetaUsageEventPayload({ outboundMessageId: null, campaignId: b.campaignId, source: "campaign", messageKind: "template", templateName: seed.templateName, templateCategory: null, sentAt: reviewed.acceptedAt, currentDate: reviewed.acceptedAt, status: "sent", waId: reviewed.waId });
    // Provider category is known; BR rate estimates and Meta window are not. No invented international cost.
    const providerPricing = rec(rec(originals.delivered.payloadJson).pricing);
    need(providerPricing.category === "utility" && providerPricing.billable === true && providerPricing.pricing_model === "PMP", "original_pricing_mismatch");
    const plan = { version: 1, decisionId: POSITION6_APPROVAL.decisionId, bindings: b, messageId: reviewed.messageId, metaMessageId: reviewed.metaMessageId, waId: reviewed.waId, acceptedAt: reviewed.acceptedAt, responseAt: reviewed.responseAt, submitStartedAt: reviewed.submitStartedAt, transportRecordedAt: transport.timestamp, providerDeliveredAt: reviewed.providerDeliveredAt, templateName: seed.templateName, templateLang: "pt_BR", components: decoded.componentsByWaId![reviewed.waId], returnDestination: seed.returnDestination, sourceHashes: p.sources, crmHashes: crm, bodyText: null, bodyReason: "effective_rendered_body_not_preserved_in_original_sources", httpStatus: null, humanReceiptConfirmed: false, usage: { ...usage, metaCategory: "utility" as const, providerPricing }, usageDelivered: { ...usage, metaCategory: "utility" as const, deliveryStatus: "delivered" as const, deliveredAt: reviewed.providerDeliveredAt, providerPricing }, pendingPositions: [7, 8, 9, 10, 11] };
    return { ...plan, planHash: deliveryEvidenceHash(plan), current, decoded, archivedReceiptId: observedGuard.generation === 38 ? observedGuard.audit.find((x: any) => x.action === "provider_reconciled" && x.resolvedTask?.id === b.taskId)?.receiptId : null };
}
type Inspected = Awaited<ReturnType<typeof inspect>>;
function disposition(v: Inspected) { return { decisionId: v.decisionId, scope: v.bindings, crmMaterialized: false, returnApplied: false, identityExpansion: false, windowFabricated: false, reason: "historical_international_identity_outside_approved_crm_contract", bodyText: null, bodyReason: v.bodyReason, protectedRows: v.crmHashes }; }
function rawResult(v: Inspected, outboundId: string) { return { source: "campaign", campaignId: v.bindings.campaignId, campaignRunId: v.bindings.runId, reconciliation: true, acceptedEventId: v.bindings.acceptedEventId, deliveredWebhookEventId: v.bindings.deliveredWebhookId, components: v.components, returnDestination: v.returnDestination, crmHistoricalDisposition: disposition(v), bodyProvenance: { reason: v.bodyReason, renderedBodyUnknown: true }, originalTimes: { submitStartedAt: v.submitStartedAt, transportRecordedAt: v.transportRecordedAt, responseAt: v.responseAt, acceptedAt: v.acceptedAt, createdAtSemantics: "reconstructed_from_original_acceptance_event" }, sourceHashes: v.sourceHashes, httpStatus: null, humanReceiptConfirmed: false, conversationId: null, deliveryConversationPending: false, metaUsage: { ...v.usageDelivered, outboundMessageId: outboundId }, metaStatus: { lastStatus: "delivered", lastStatusAt: v.providerDeliveredAt, metaMessageId: v.metaMessageId, pricingCategory: "utility", pricingBillable: true, pricingModel: "PMP", conversationId: null } }; }
function resultData(v: Inspected, outboundId: string) { return { id: outboundId, clientId: v.bindings.clientId, phoneNumberId: v.bindings.phoneNumberId, channelAccountId: v.bindings.phoneNumberId, waId: v.waId, waIdCanonical: null, messageId: v.messageId, metaMessageId: v.metaMessageId, channel: "whatsapp", provider: "meta", type: "TEMPLATE" as const, status: "SENT" as const, bodyText: null, templateName: v.templateName, templateLang: v.templateLang, requestId: eventKey(v.bindings.acceptedEventId, "result"), errorBody: null, createdAt: new Date(v.acceptedAt), rawPayload: JSON_VALUE(rawResult(v, outboundId)) }; }
async function totals(tx: Tx, v: Inspected) {
    const rows = await tx.outboundMessage.findMany({ where: { clientId: v.bindings.clientId, messageId: { in: [1, 2, 3, 4, 5, 6].map(n => `campaign.${v.bindings.campaignId}.${n}`) } }, orderBy: { messageId: "asc" } });
    const campaign = await tx.campaign.findUniqueOrThrow({ where: { id: v.bindings.campaignId } });
    const statuses = buildCampaignRecipientResultStatuses({ campaign, seed: { recipients: v.decoded.recipients, templateName: v.templateName }, resultItems: rows.map(buildCampaignMetaStatusItem) });
    const metaSummary = summarizeCampaignMetaStatuses(statuses);
    const links = await tx.campaignExecutionBatchCampaign.findMany({ where: { clientId: v.bindings.clientId, batchId: v.bindings.batchId }, include: { campaign: true } });
    need(links.length === 1 && links[0].campaignId === v.bindings.campaignId, "batch_read_model_membership_drift");
    const progress = { totalRecipients: links.reduce((n, l) => n + l.campaign.totalRecipients, 0), sentCount: links.reduce((n, l) => n + l.campaign.sentCount, 0), blockedCount: links.reduce((n, l) => n + l.campaign.blockedCount, 0), failedCount: metaSummary.totalFailed, pendingCount: Math.max(campaign.totalRecipients - campaign.sentCount - campaign.blockedCount - metaSummary.totalFailed, 0) };
    return { metaSummary, progress, controllerUsesChildMembership: true, audienceExcluded: v.current.batch.blockedCount };
}
function expectedEvents(v: Inspected, actor: string, outboundId?: string) {
    return [
        { eventName: "campaign.crm.historical_disposition", suffix: "crm", payload: disposition(v) },
        { eventName: "campaign.message.sent", suffix: "sent", payload: { campaignId: v.bindings.campaignId, campaignRunId: v.bindings.runId, metaMessageId: v.metaMessageId, reconciledOutboundId: outboundId, providerAccepted: true, providerReportedStatus: "delivered", reconciliation: true, retryAllowed: false, crmMaterialized: false, humanReceiptConfirmed: false } },
        { eventName: "meta.usage.estimated", suffix: "usage-sent", payload: { ...v.usage, outboundMessageId: outboundId } },
        { eventName: "meta.usage.updated", suffix: "usage-delivered", payload: { ...v.usageDelivered, outboundMessageId: outboundId } },
        { eventName: "billing.active_message.recovery_disposition", suffix: "billing", payload: { reason: "unknown_window", metaWindowAtSend: "unknown", monetaryChargeCreated: false, providerPricing: v.usageDelivered.providerPricing, crmDisposition: v.decisionId, sourceHashes: v.sourceHashes } },
    ];
}
async function verify(tx: Tx, v: Inspected) {
    const b = v.bindings, receipt = await tx.event.findUnique({ where: { clientId_eventName_requestId: { clientId: b.clientId, eventName: "campaign.accepted_delivery.reconciled", requestId: eventKey(b.acceptedEventId, "receipt") } } });
    need(receipt && receipt.messageId === v.messageId && (!v.archivedReceiptId || v.archivedReceiptId === receipt.id), "receipt_missing");
    const body = rec(receipt.payloadJson);
    need(typeof body.actor === "string" && body.actor.trim(), "receipt_actor_missing");
    const results = await tx.outboundMessage.findMany({ where: { clientId: b.clientId, OR: [{ messageId: v.messageId }, { metaMessageId: v.metaMessageId }, { externalMessageId: v.metaMessageId }] }, take: 3 });
    need(results.length === 1, "result_ambiguous");
    const out = results[0], expected = resultData(v, out.id);
    need(Object.entries(expected).every(([k, val]) => deliveryEvidenceHash((out as any)[k]) === deliveryEvidenceHash(val)), "result_drift");
    const events = await tx.event.findMany({ where: { clientId: b.clientId, messageId: v.messageId, eventName: { in: ["campaign.crm.historical_disposition", "campaign.message.sent", "meta.usage.estimated", "meta.usage.updated", "billing.active_message.recovery_disposition"] } }, take: 20 });
    const obligations = expectedEvents(v, body.actor, out.id);
    need(events.length === obligations.length && obligations.every(required => events.some(row => row.eventName === required.eventName && row.requestId === eventKey(b.acceptedEventId, required.suffix) && row.waId === v.waId && row.conversationId === null && deliveryEvidenceHash(row.payloadJson) === deliveryEvidenceHash(required.payload))), "required_persistence_drift");
    need(await tx.event.count({ where: { clientId: b.clientId, messageId: v.messageId, eventName: "billing.active_message.delivered" } }) === 0, "unexpected_historical_charge");
    const resultTotals = await totals(tx, v);
    need(resultTotals.progress.totalRecipients === 11 && resultTotals.progress.sentCount === 6 && resultTotals.progress.failedCount === 0 && resultTotals.progress.blockedCount === 0 && resultTotals.progress.pendingCount === 5 && resultTotals.metaSummary.totalDelivered === 6 && resultTotals.metaSummary.totalPending === 5 && resultTotals.audienceExcluded === 244, "canonical_totals_drift");
    const expectedReceipt = { version: 2, scope: "accepted_delivered_historical_crm_disposition", decisionId: v.decisionId, planHash: v.planHash, taskHash: b.taskHash, reference: { clientId: b.clientId, campaignId: b.campaignId, messageId: v.messageId }, reconciledOutboundId: out.id, resultHash: deliveryEvidenceHash(out), metaMessageIdSha256: digest(v.metaMessageId), sourceHashes: v.sourceHashes, crmDispositionId: events.find(x => x.eventName === "campaign.crm.historical_disposition")!.id, persistenceHashes: Object.fromEntries(events.map(x => [x.id, originalEvidenceHash(x)])), totals: resultTotals, actor: body.actor, guardRemainsClosed: true, retryAllowed: false, jobContinuationAuthorized: false };
    need(deliveryEvidenceHash(body) === deliveryEvidenceHash(expectedReceipt), "receipt_drift");
    return { receiptId: receipt.id, reconciledOutboundId: out.id, planHash: v.planHash, totals: resultTotals, ackEligible: true as const, jobContinuationAuthorized: false };
}
async function transaction<T>(db: PrismaClient, readonly: boolean, fn: (tx: Tx) => Promise<T>) { return db.$transaction(async (tx) => { if (readonly)
    await tx.$executeRaw `SET TRANSACTION READ ONLY`; await tx.$executeRaw `SET LOCAL statement_timeout='8000ms'`; await tx.$executeRaw `SET LOCAL lock_timeout='1000ms'`; return fn(tx); }, { isolationLevel: readonly ? "RepeatableRead" : "Serializable", timeout: 15000, maxWait: 2000 }); }
export async function dryRunPosition6(db: PrismaClient, input: Position6RecoveryInput) {
    const fence = readCampaignReconciliationFence();
    return transaction(db, true, async (tx) => {
        const v = await inspect(tx, input, fence);
        const receipt = await tx.event.findUnique({ where: { clientId_eventName_requestId: { clientId: input.bindings.clientId, eventName: "campaign.accepted_delivery.reconciled", requestId: eventKey(input.bindings.acceptedEventId, "receipt") } } });
        if (receipt) {
            const result = await verify(tx, v);
            need(deliveryEvidenceHash(fence) === deliveryEvidenceHash(readCampaignReconciliationFence()), "fence_changed_during_read");
            return { alreadyApplied: true, ...result };
        }
        need(!v.archivedReceiptId && v.current.campaign.sentCount === 5, "unreceipted_counter_drift");
        need(await tx.outboundMessage.count({ where: { clientId: input.bindings.clientId, OR: [{ messageId: v.messageId }, { metaMessageId: v.metaMessageId }, { externalMessageId: v.metaMessageId }] } }) === 0, "unreceipted_result_conflict");
        need(await tx.event.count({ where: { clientId: input.bindings.clientId, messageId: v.messageId, eventName: { in: expectedEvents(v, "dry-run").map(x => x.eventName) } } }) === 0, "unreceipted_persistence_conflict");
        need(deliveryEvidenceHash(fence) === deliveryEvidenceHash(readCampaignReconciliationFence()), "fence_changed_during_read");
        return { alreadyApplied: false, planHash: v.planHash, decisionId: v.decisionId, submittedAfterRecovery: 6, deliveredReported: 6, pending: 5, providerCalls: 0 };
    });
}
export async function applyPosition6(db: PrismaClient, input: Position6RecoveryInput, planHash: string, actor: string) {
    need(actor.trim() && /^[a-f0-9]{64}$/.test(planHash), "actor_plan_required");
    const fence = readCampaignReconciliationFence();
    return transaction(db, false, async (tx) => {
        await lockScope(tx, input.bindings);
        const v = await inspect(tx, input, fence);
        need(v.planHash === planHash, "plan_drift");
        const prior = await tx.event.findUnique({ where: { clientId_eventName_requestId: { clientId: input.bindings.clientId, eventName: "campaign.accepted_delivery.reconciled", requestId: eventKey(input.bindings.acceptedEventId, "receipt") } } });
        if (prior) {
            const result = await verify(tx, v);
            need(deliveryEvidenceHash(fence) === deliveryEvidenceHash(readCampaignReconciliationFence()), "fence_changed_before_commit");
            return { alreadyApplied: true, ...result };
        }
        need(!v.archivedReceiptId && v.current.campaign.sentCount === 5, "unreceipted_counter_drift");
        need(await tx.outboundMessage.count({ where: { clientId: input.bindings.clientId, OR: [{ messageId: v.messageId }, { metaMessageId: v.metaMessageId }, { externalMessageId: v.metaMessageId }] } }) === 0, "unreceipted_result_conflict");
        const out = await tx.outboundMessage.create({ data: resultData(v, crypto.randomUUID()) });
        // Canonical billing predicate with real, account-scoped reads. A Web inbound is
        // not borrowed as a Meta window certificate. unknown_window does not forgive debt.
        const billing = await recordActiveMessageDeliveryIfNeeded({ prisma: { event: tx.event, conversation: { findFirst: (args: any) => tx.conversation.findFirst({ ...args, where: { AND: [args.where, { clientId: v.bindings.clientId, provider: "meta", channelAccountId: v.bindings.phoneNumberId }] } }) }, conversationRuntimeState: { findFirst: (args: any) => tx.conversationRuntimeState.findFirst({ ...args, where: { AND: [args.where, { clientId: v.bindings.clientId, provider: "meta", channelAccountId: v.bindings.phoneNumberId }] } }) } }, input: { outbound: out, deliveryStatus: "delivered", deliveredAt: new Date(v.providerDeliveredAt), pricingCategory: "utility", providerMessageId: v.metaMessageId } });
        need(billing.ok && !billing.billable && billing.reason === "unknown_window", "billing_predicate_drift");
        const events = [];
        for (const item of expectedEvents(v, actor, out.id))
            events.push(await tx.event.create({ data: { clientId: v.bindings.clientId, waId: v.waId, messageId: v.messageId, eventName: item.eventName, requestId: eventKey(v.bindings.acceptedEventId, item.suffix), payloadJson: JSON_VALUE(item.payload) } }));
        await tx.campaign.update({ where: { id: v.bindings.campaignId }, data: { sentCount: 6 } });
        const resultTotals = await totals(tx, v);
        const body = { version: 2, scope: "accepted_delivered_historical_crm_disposition", decisionId: v.decisionId, planHash: v.planHash, taskHash: v.bindings.taskHash, reference: { clientId: v.bindings.clientId, campaignId: v.bindings.campaignId, messageId: v.messageId }, reconciledOutboundId: out.id, resultHash: deliveryEvidenceHash(out), metaMessageIdSha256: digest(v.metaMessageId), sourceHashes: v.sourceHashes, crmDispositionId: events[0].id, persistenceHashes: Object.fromEntries(events.map(x => [x.id, originalEvidenceHash(x)])), totals: resultTotals, actor, guardRemainsClosed: true, retryAllowed: false, jobContinuationAuthorized: false };
        await tx.event.create({ data: { clientId: v.bindings.clientId, messageId: v.messageId, eventName: "campaign.accepted_delivery.reconciled", requestId: eventKey(v.bindings.acceptedEventId, "receipt"), payloadJson: JSON_VALUE(body) } });
        need(deliveryEvidenceHash(fence) === deliveryEvidenceHash(readCampaignReconciliationFence()), "fence_changed_before_commit");
        return { alreadyApplied: false, ...await verify(tx, v) };
    });
}
export async function verifyPosition6(db: PrismaClient, input: Position6RecoveryInput) { const fence = readCampaignReconciliationFence(); return transaction(db, true, async (tx) => { const v = await inspect(tx, input, fence), result = await verify(tx, v); need(deliveryEvidenceHash(fence) === deliveryEvidenceHash(readCampaignReconciliationFence()), "fence_changed_during_verify"); return result; }); }
export async function acknowledgePosition6(db: PrismaClient, input: Position6RecoveryInput, actor: string) {
    need(actor.trim(), "actor_required");
    const fence = readCampaignReconciliationFence();
    return transaction(db, false, async (tx) => {
        await lockScope(tx, input.bindings);
        const v = await inspect(tx, input, fence), receipt = await verify(tx, v);
        need(deliveryEvidenceHash(fence) === deliveryEvidenceHash(readCampaignReconciliationFence()), "fence_changed_before_ack");
        const status = acknowledgeAcceptedDeliveredCampaignTask({ generation: 37, taskId: input.bindings.taskId, expectedTaskHash: input.bindings.taskHash, reference: { clientId: input.bindings.clientId, campaignId: input.bindings.campaignId, messageId: v.messageId }, receiptId: receipt.receiptId, actor });
        need(status.available && status.open === false && status.generation === 38 && status.tasks.length === 0, "ack_state_uncertain_read_only_investigation_required");
        return { ...receipt, open: false, generation: 38, jobContinuationAuthorized: false };
    });
}
