import crypto from "node:crypto";
import type { Prisma, OutboundMessage } from "@prisma/client";
import { parseProviderStatusTimestamp } from "./campaignDeliveryTruth.js";
export const deliveryEvidenceHash = (v: unknown): string => crypto.createHash("sha256").update(JSON.stringify(v, (_k, x) => x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x)).digest("hex");
const rec = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
function need(v: unknown, code: string): asserts v { if (!v) throw new Error(code); }
export type DeliveryReviewBindings = { clientId:string; campaignId:string; parentCampaignId:string; batchId:string; linkId:string; jobId:string; runId:string; taskId:string; taskHash:string; intentEventId:string; acceptedEventId:string; sentWebhookId:string; deliveredWebhookId:string; phoneNumberId:string; preservedOutboundHashes:Record<string,string> };
// Read-only offline review. Caller supplies a consistent ledger capture; this is
// NOT a ledger certificate, SQL recovery writer or acknowledgement capability.
export async function inspectAcceptedDelivery(db: Prisma.TransactionClient, b: DeliveryReviewBindings, guard: unknown) {
 const g=rec(guard),tasks=rec(g.tasks),task=rec(tasks[b.taskId]), messageId=`campaign.${b.campaignId}.6`;
 need(g.open===false && g.generation===37 && Object.keys(tasks).length===1 && task.kind==="provider" && task.phase==="persisting" && deliveryEvidenceHash(task)===b.taskHash && task.reference?.clientId===b.clientId && task.reference?.campaignId===b.campaignId && task.reference?.messageId===messageId,"accepted_delivery_guard_task_mismatch");
 const [campaign,parent,batch,link,job]=await Promise.all([
  db.campaign.findFirst({where:{id:b.campaignId,clientId:b.clientId}}),db.campaign.findFirst({where:{id:b.parentCampaignId,clientId:b.clientId}}),db.campaignExecutionBatch.findFirst({where:{id:b.batchId,clientId:b.clientId}}),db.campaignExecutionBatchCampaign.findFirst({where:{id:b.linkId,clientId:b.clientId,batchId:b.batchId,campaignId:b.campaignId}}),db.campaignExecutionJob.findFirst({where:{id:b.jobId,clientId:b.clientId,batchId:b.batchId,campaignId:b.campaignId}})]);
 const [intent,accepted,sent,delivered]=await Promise.all([b.intentEventId,b.acceptedEventId,b.sentWebhookId,b.deliveredWebhookId].map(id=>db.event.findFirst({where:{id,clientId:b.clientId}})));
 need(campaign && parent && batch && link && job && intent && accepted && sent && delivered,"accepted_delivery_binding_missing");
 need(campaign.status==="sending" && parent.status==="sending" && batch.status==="running" && rec(batch.metadata).parentCampaignId===b.parentCampaignId && link.chunkIndex===1 && link.recipientCount===11 && job.status==="queued" && job.attempt===1 && job.failureReason==="operational_suspension" && !job.leaseToken && !job.leaseOwner && !job.leaseExpiresAt,"accepted_delivery_operational_drift");
 const lease=await db.tenantCampaignExecutionLease.findUnique({where:{clientId:b.clientId}});
 need(!lease?.jobId && (!lease || lease.expiresAt<=new Date()),"accepted_delivery_lease_present");
 const a=rec(accepted.payloadJson),i=rec(intent.payloadJson),s=rec(sent.payloadJson),d=rec(delivered.payloadJson);
 need(intent.eventName==="campaign.message.submit_started" && accepted.eventName==="campaign.message.provider_accepted" && intent.messageId===messageId && accepted.messageId===messageId && i.campaignId===b.campaignId && i.campaignRunId===b.runId && a.campaignId===b.campaignId && a.campaignRunId===b.runId && typeof a.metaMessageId==="string" && !!a.metaMessageId && !!accepted.waId && intent.waId===accepted.waId && sent.eventName==="webhook.status.orphaned" && delivered.eventName==="webhook.status.orphaned" && s.metaMessageId===a.metaMessageId && d.metaMessageId===a.metaMessageId && s.status==="sent" && d.status==="delivered" && s.reason==="outbound_message_not_found" && d.reason==="outbound_message_not_found" && accepted.createdAt>=intent.createdAt && sent.createdAt>=accepted.createdAt && delivered.createdAt>=accepted.createdAt,"accepted_delivery_provider_mismatch");
 const providerAt=parseProviderStatusTimestamp(d.timestamp);need(providerAt,"accepted_delivery_timestamp_invalid");
 const prior=await db.outboundMessage.findMany({where:{clientId:b.clientId,messageId:{in:[1,2,3,4,5].map(n=>`campaign.${b.campaignId}.${n}`)}},orderBy:{messageId:"asc"}});
 need(Object.keys(b.preservedOutboundHashes).length===5 && prior.length===5 && prior.every(r=>deliveryEvidenceHash(r)===b.preservedOutboundHashes[r.id] && r.status==="SENT" && r.phoneNumberId===b.phoneNumberId),"accepted_delivery_prior_drift");
 const remaining=[7,8,9,10,11].map(n=>`campaign.${b.campaignId}.${n}`);
 need(await db.event.count({where:{clientId:b.clientId,eventName:{in:["campaign.message.submit_started","campaign.message.provider_accepted"]},messageId:{in:remaining}}})===0 && await db.outboundMessage.count({where:{clientId:b.clientId,messageId:{in:remaining}}})===0,"accepted_delivery_remaining_submitted");
 need(await db.event.count({where:{clientId:b.clientId,eventName:"campaign.message.submit_started",messageId}})===1 && await db.event.count({where:{clientId:b.clientId,eventName:"campaign.message.provider_accepted",messageId}})===1,"accepted_delivery_duplicate_submission");
 const plan={bindings:b,messageId,metaMessageId:a.metaMessageId as string,waId:accepted.waId!,acceptedAt:accepted.createdAt.toISOString(),responseAt:a.acceptedAt,submitStartedAt:intent.createdAt.toISOString(),providerDeliveredAt:providerAt.toISOString(),evidenceHash:deliveryEvidenceHash([campaign,parent,batch,link,job,intent,accepted,sent,delivered,prior]),pendingPositions:[7,8,9,10,11],ackEligible:false as const,requiredBeforeAck:["original_account_and_execution_payload_provenance","crm_materialization_or_separately_reviewed_disposition","usage_persistence","campaign_result_event","success_ack_contract_review"]};
 return {...plan,planHash:deliveryEvidenceHash(plan)};
}
type Plan=Awaited<ReturnType<typeof inspectAcceptedDelivery>>;
export function buildAcceptedDeliveryReceipt(plan:Plan, outbound:OutboundMessage, actor:string) {
 const raw=rec(outbound.rawPayload),meta=rec(raw.metaStatus);
 need(actor.trim() && outbound.clientId===plan.bindings.clientId && outbound.messageId===plan.messageId && outbound.metaMessageId===plan.metaMessageId && outbound.waId===plan.waId && outbound.phoneNumberId===plan.bindings.phoneNumberId && outbound.provider==="meta" && outbound.channel==="whatsapp" && outbound.status==="SENT" && outbound.type==="TEMPLATE" && outbound.createdAt.toISOString()===plan.acceptedAt && meta.lastStatus==="delivered" && meta.metaMessageId===plan.metaMessageId && meta.lastStatusAt===plan.providerDeliveredAt && raw.reconciliation===true && raw.acceptedEventId===plan.bindings.acceptedEventId && raw.deliveredWebhookEventId===plan.bindings.deliveredWebhookId,"accepted_delivery_result_mismatch");
 return {version:1,scope:"transport_result_only",bindings:plan.bindings,planHash:plan.planHash,evidenceHash:plan.evidenceHash,reconciledOutboundId:outbound.id,resultHash:deliveryEvidenceHash(outbound),metaMessageIdSha256:crypto.createHash("sha256").update(plan.metaMessageId).digest("hex"),ackEligible:false,requiredBeforeAck:plan.requiredBeforeAck,actor};
}
export async function verifyAcceptedDeliveryReceipt(db:Prisma.TransactionClient,plan:Plan) {
 const receipt=await db.event.findUnique({where:{clientId_eventName_requestId:{clientId:plan.bindings.clientId,eventName:"campaign.accepted_delivery.reconciled",requestId:`accepted-delivery:${plan.bindings.acceptedEventId}`}}});
 if(!receipt)return {alreadyApplied:false,ackEligible:false};
 const payload=rec(receipt.payloadJson),outbound=await db.outboundMessage.findFirst({where:{clientId:plan.bindings.clientId,messageId:plan.messageId}});
 need(outbound,"accepted_delivery_receipt_result_missing");
 const expected=buildAcceptedDeliveryReceipt(plan,outbound,String(payload.actor??""));
 need(receipt.messageId===plan.messageId && deliveryEvidenceHash(payload)===deliveryEvidenceHash(expected),"accepted_delivery_receipt_drift");
 return {alreadyApplied:true,receiptId:receipt.id,reconciledOutboundId:outbound.id,ackEligible:false};
}
