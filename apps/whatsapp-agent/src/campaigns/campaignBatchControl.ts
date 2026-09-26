import type { PrismaClient } from "@prisma/client";
import { lockCampaignExecutionBatch } from "./campaignExecutionQueue.js";

export async function applyCampaignExecutionBatchAction(prisma: PrismaClient, params: {
  clientId: string; batchId: string; action: "pause" | "resume" | "cancel"; userId: string; requestId: string;
}) {
  return prisma.$transaction(async (tx) => {
    await lockCampaignExecutionBatch(tx, params.clientId, params.batchId);
    const batch = await tx.campaignExecutionBatch.findFirst({ where: { id: params.batchId, clientId: params.clientId }, include: { campaigns: { include: { campaign: true } } } });
    const rejected = (status: number, error: string) => ({ ok: false as const, status, error, message: "Este conjunto não pode receber esta ação no estado atual." });
    if (!batch) return rejected(404, "campaign_batch_not_found");
    const jobs = await tx.campaignExecutionJob.findMany({ where: { clientId: params.clientId, batchId: batch.id } });
    const running = jobs.some((job) => job.status === "running");
    const uncertain = jobs.some((job) => job.status === "needs_review");
    const metadata = batch.metadata as Record<string, unknown> | null;
    const ids = batch.campaigns.map((link) => link.campaignId);
    if (typeof metadata?.parentCampaignId === "string") ids.push(metadata.parentCampaignId);
    const now = new Date();
    if (params.action === "resume") {
      if (batch.status !== "paused" || running || uncertain || jobs.some((job) => ["failed", "blocked"].includes(job.status)) || batch.campaigns.some((link) => ["failed", "blocked"].includes(link.campaign.status)) || !jobs.some((job) => job.status === "paused")) return rejected(409, "campaign_batch_not_resumable");
      await tx.campaign.updateMany({ where: { clientId: params.clientId, id: { in: ids }, status: "paused" }, data: { status: "scheduled" } });
      // Preserve future dates; a resume cannot silently advance a future schedule.
      await tx.campaignExecutionJob.updateMany({ where: { batchId: batch.id, status: "paused" }, data: { status: "queued", failureReason: null } });
      await tx.campaignExecutionBatchCampaign.updateMany({ where: { batchId: batch.id, status: "paused" }, data: { status: "scheduled" } });
      await tx.campaignExecutionBatch.update({ where: { id: batch.id }, data: { status: "scheduled", failureReason: null } });
    } else if (params.action === "pause") {
      if (!["scheduled", "running"].includes(batch.status) || uncertain) return rejected(409, "campaign_batch_not_pausable");
      await tx.campaign.updateMany({ where: { clientId: params.clientId, id: { in: ids }, status: { in: ["draft", "scheduled", "sending"] } }, data: { status: "paused" } });
      await tx.campaignExecutionBatchCampaign.updateMany({ where: { batchId: batch.id, status: { in: ["draft", "scheduled", "sending"] } }, data: { status: "paused" } });
      await tx.campaignExecutionJob.updateMany({ where: { batchId: batch.id, status: "queued" }, data: { status: "paused" } });
      await tx.campaignExecutionBatch.update({ where: { id: batch.id }, data: { status: "paused", failureReason: running ? "pause_requested_after_current_call" : null } });
    } else {
      if (batch.status === "cancelled") return { ok: true as const };
      if (batch.status === "completed") return rejected(409, "campaign_batch_not_cancelable");
      await tx.campaign.updateMany({ where: { clientId: params.clientId, id: { in: ids }, status: { in: ["draft", "scheduled", "sending", "paused"] } }, data: { status: "cancelled", scheduledAt: null } });
      await tx.campaignExecutionBatchCampaign.updateMany({ where: { batchId: batch.id, status: { in: ["draft", "scheduled", "sending", "paused"] } }, data: { status: "cancelled" } });
      await tx.campaignExecutionJob.updateMany({ where: { batchId: batch.id, status: { in: ["queued", "paused"] } }, data: { status: "cancelled", finishedAt: now, failureReason: "batch_cancelled" } });
      await tx.campaignExecutionBatch.update({ where: { id: batch.id }, data: { status: running || uncertain ? "needs_review" : "cancelled", completedAt: running || uncertain ? null : now, failureReason: running || uncertain ? "cancel_requested_during_execution" : null } });
    }
    await tx.event.create({ data: { clientId: params.clientId, messageId: batch.id, requestId: `campaign-batch-${params.action}:${batch.id}:${params.requestId}`, eventName: `campaign.batch.${params.action}`, payloadJson: { batchId: batch.id, action: params.action, requestedBy: params.userId, requestedAt: now.toISOString(), childCampaignIds: ids, runningJobs: jobs.filter((j) => j.status === "running").length } } });
    return { ok: true as const };
  });
}
