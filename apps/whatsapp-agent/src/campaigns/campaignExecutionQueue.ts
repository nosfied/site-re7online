import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getPrisma } from "../db.js";

export const CAMPAIGN_EXECUTION_LEASE_MS = 90_000;
export const CAMPAIGN_EXECUTION_RENEW_MS = 30_000;

export type CampaignExecutionJobKind = "campaign" | "batch_chunk";
type CampaignExecutionJobKindInternal = CampaignExecutionJobKind | "test_send";

export type ClaimedCampaignExecutionJob = {
  id: string;
  clientId: string;
  campaignId: string | null;
  batchId: string | null;
  chunkIndex: number | null;
  kind: string;
  leaseToken: string;
};

function workerId() {
  return `${process.pid}:${crypto.randomUUID()}`;
}

function leaseExpiry(now: Date, leaseMs = CAMPAIGN_EXECUTION_LEASE_MS) {
  return new Date(now.getTime() + leaseMs);
}

export async function enqueueCampaignExecutionJob(params: {
  prisma?: PrismaClient | Prisma.TransactionClient;
  clientId: string;
  campaignId?: string | null;
  eligibleAt: Date;
  kind?: CampaignExecutionJobKind;
  batchId?: string | null;
  chunkIndex?: number | null;
  idempotencyKey?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  const prisma = params.prisma ?? getPrisma();
  const idempotencyKey =
    params.idempotencyKey ??
    `${params.kind ?? "campaign"}:${params.clientId}:${params.campaignId ?? "batch"}:${params.batchId ?? "standalone"}:${params.chunkIndex ?? 0}`;
  return prisma.campaignExecutionJob.upsert({
    where: {
      clientId_idempotencyKey: {
        clientId: params.clientId,
        idempotencyKey,
      },
    },
    create: {
      clientId: params.clientId,
      campaignId: params.campaignId ?? null,
      kind: params.kind ?? "campaign",
      batchId: params.batchId ?? null,
      chunkIndex: params.chunkIndex ?? null,
      sequence: params.chunkIndex ?? 0,
      eligibleAt: params.eligibleAt,
      idempotencyKey,
      metadata: params.metadata ?? undefined,
    },
    update: {
      eligibleAt: params.eligibleAt,
      sequence: params.chunkIndex ?? 0,
      metadata: params.metadata ?? undefined,
    },
  });
}

export async function isTenantCampaignExecutionBusy(params: { clientId: string; now?: Date }) {
  const prisma = getPrisma();
  const now = params.now ?? new Date();
  const lease = await prisma.tenantCampaignExecutionLease.findFirst({
    where: {
      clientId: params.clientId,
      expiresAt: { gt: now },
    },
    select: { id: true, jobId: true },
  });
  return Boolean(lease);
}

export async function acquireTemporaryTenantCampaignExecutionLease(params: {
  clientId: string;
  purpose: string;
  now?: Date;
  leaseMs?: number;
}): Promise<{ ok: true; jobId: string; leaseToken: string } | { ok: false }> {
  const prisma = getPrisma();
  const now = params.now ?? new Date();
  const jobId = `${params.purpose}:${crypto.randomUUID()}`;
  const leaseToken = crypto.randomUUID();
  const ownerId = workerId();
  const acquired = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Client" WHERE id = ${params.clientId}::uuid FOR UPDATE`;
    const tenantHasRunningJob = await tx.campaignExecutionJob.findFirst({
      where: { clientId: params.clientId, status: { in: ["running", "needs_review"] } },
      select: { id: true },
    });
    if (tenantHasRunningJob) return false;
    if (await tx.campaignExecutionBatch.findFirst({ where: { clientId: params.clientId, status: "running" }, select: { id: true } })) return false;
    const lease = await tryAcquireTenantLease(tx, {
      clientId: params.clientId,
      jobId,
      token: leaseToken,
      ownerId,
      now,
      leaseMs: params.leaseMs ?? CAMPAIGN_EXECUTION_LEASE_MS,
    });
    if (!lease) return false;
    await tx.campaignExecutionJob.create({
      data: {
        id: jobId,
        clientId: params.clientId,
        campaignId: null,
        kind: "test_send" satisfies CampaignExecutionJobKindInternal,
        status: "running",
        eligibleAt: now,
        startedAt: now,
        attempt: 1,
        leaseToken,
        leaseOwner: ownerId,
        leaseExpiresAt: leaseExpiry(now, params.leaseMs ?? CAMPAIGN_EXECUTION_LEASE_MS),
        idempotencyKey: jobId,
        metadata: { purpose: params.purpose },
      },
    });
    return true;
  });
  return acquired ? { ok: true, jobId, leaseToken } : { ok: false };
}

async function tryAcquireTenantLease(
  tx: Prisma.TransactionClient,
  params: { clientId: string; jobId: string; token: string; ownerId: string; now: Date; leaseMs: number }
) {
  const expiresAt = leaseExpiry(params.now, params.leaseMs);
  const updated = await tx.tenantCampaignExecutionLease.updateMany({
    where: {
      clientId: params.clientId,
      OR: [{ expiresAt: { lte: params.now } }, { jobId: null }],
    },
    data: {
      jobId: params.jobId,
      leaseToken: params.token,
      ownerId: params.ownerId,
      expiresAt,
      heartbeatAt: params.now,
    },
  });
  if (updated.count === 1) return true;
  try {
    await tx.tenantCampaignExecutionLease.create({
      data: {
        clientId: params.clientId,
        jobId: params.jobId,
        leaseToken: params.token,
        ownerId: params.ownerId,
        expiresAt,
        heartbeatAt: params.now,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function claimNextCampaignExecutionJob(params: {
  now?: Date;
  limit?: number;
  leaseMs?: number;
} = {}): Promise<ClaimedCampaignExecutionJob | null> {
  const prisma = getPrisma();
  const now = params.now ?? new Date();
  // Exclude blocked tenants and preserve an active group's continuity BEFORE LIMIT.
  // The bounded result is rechecked under tenant/batch locks before claiming.
  const candidates = await prisma.$queryRaw<Array<{
    id: string; clientId: string; campaignId: string | null; batchId: string | null;
    chunkIndex: number | null; kind: string;
  }>>`
    SELECT candidates.* FROM (
    SELECT DISTINCT ON (j."clientId") j.* FROM "CampaignExecutionJob" j
    WHERE j.status = 'queued' AND j."eligibleAt" <= ${now.toISOString()}::timestamp
      AND NOT EXISTS (SELECT 1 FROM "CampaignExecutionJob" active
        WHERE active."clientId" = j."clientId" AND active.status IN ('running', 'needs_review'))
      AND NOT EXISTS (SELECT 1 FROM "TenantCampaignExecutionLease" lease
        WHERE lease."clientId" = j."clientId" AND lease."jobId" IS NOT NULL AND lease."expiresAt" > ${now.toISOString()}::timestamp)
      AND (j."batchId" IS NULL OR EXISTS (SELECT 1 FROM "CampaignExecutionBatch" b
        WHERE b.id = j."batchId" AND b.status IN ('scheduled', 'running')))
      AND NOT EXISTS (SELECT 1 FROM "CampaignExecutionBatch" active_batch
        WHERE active_batch."clientId" = j."clientId" AND active_batch.status = 'running'
          AND active_batch.id IS DISTINCT FROM j."batchId")
    ORDER BY j."clientId", j."eligibleAt", j.sequence, j.id
    ) candidates
    ORDER BY candidates."eligibleAt", candidates.sequence, candidates.id
    LIMIT ${Math.max(1, Math.min(params.limit ?? 20, 100))}
  `;
  const ownerId = workerId();
  for (const candidate of candidates) {
    const token = crypto.randomUUID();
    const claimed = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Client" WHERE id = ${candidate.clientId}::uuid FOR UPDATE`;
      if (candidate.batchId) {
        await lockCampaignExecutionBatch(tx, candidate.clientId, candidate.batchId);
        const batch = await tx.campaignExecutionBatch.findUnique({ where: { id: candidate.batchId } });
        if (!batch || !["scheduled", "running"].includes(batch.status)) return null;
      }
      const otherActiveBatch = await tx.campaignExecutionBatch.findFirst({ where: {
        clientId: candidate.clientId, status: "running",
        ...(candidate.batchId ? { id: { not: candidate.batchId } } : {}),
      } });
      if (otherActiveBatch) return null;
      const tenantHasActiveJob = await tx.campaignExecutionJob.findFirst({
        where: { clientId: candidate.clientId, status: { in: ["running", "needs_review"] } },
        select: { id: true },
      });
      if (tenantHasActiveJob) return null;
      const acquired = await tryAcquireTenantLease(tx, {
        clientId: candidate.clientId,
        jobId: candidate.id,
        token,
        ownerId,
        now,
        leaseMs: params.leaseMs ?? CAMPAIGN_EXECUTION_LEASE_MS,
      });
      if (!acquired) return null;
      const updated = await tx.campaignExecutionJob.updateMany({
        where: { id: candidate.id, clientId: candidate.clientId, status: "queued" },
        data: {
          status: "running",
          leaseToken: token,
          leaseOwner: ownerId,
          leaseExpiresAt: leaseExpiry(now, params.leaseMs ?? CAMPAIGN_EXECUTION_LEASE_MS),
          startedAt: now,
          attempt: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        await tx.tenantCampaignExecutionLease.updateMany({
          where: { clientId: candidate.clientId, jobId: candidate.id, leaseToken: token },
          data: { jobId: null, expiresAt: now },
        });
        return null;
      }
      if (candidate.batchId) {
        // The batch lock serializes the first start; later chunks/retries keep it.
        await tx.campaignExecutionBatch.updateMany({
          where: { id: candidate.batchId, effectiveStartedAt: null },
          data: { effectiveStartedAt: now },
        });
        await tx.campaignExecutionBatch.update({ where: { id: candidate.batchId }, data: {
          status: "running", currentChunkIndex: candidate.chunkIndex,
        } });
      }
      return {
        id: candidate.id,
        clientId: candidate.clientId,
        campaignId: candidate.campaignId,
        batchId: candidate.batchId,
        chunkIndex: candidate.chunkIndex,
        kind: candidate.kind,
        leaseToken: token,
      };
    });
    if (claimed) return claimed;
  }
  return null;
}

export async function renewCampaignExecutionLease(params: {
  clientId: string;
  jobId: string;
  leaseToken: string;
  now?: Date;
  leaseMs?: number;
}) {
  const prisma = getPrisma();
  const now = params.now ?? new Date();
  const renewed = await prisma.tenantCampaignExecutionLease.updateMany({
    where: {
      clientId: params.clientId,
      jobId: params.jobId,
      leaseToken: params.leaseToken,
      expiresAt: { gt: now },
    },
    data: {
      expiresAt: leaseExpiry(now, params.leaseMs ?? CAMPAIGN_EXECUTION_LEASE_MS),
      heartbeatAt: now,
    },
  });
  if (renewed.count !== 1) return false;
  await prisma.campaignExecutionJob.updateMany({
    where: { id: params.jobId, clientId: params.clientId, leaseToken: params.leaseToken, status: "running" },
    data: { leaseExpiresAt: leaseExpiry(now, params.leaseMs ?? CAMPAIGN_EXECUTION_LEASE_MS) },
  });
  return true;
}

export async function assertCampaignExecutionLease(params: {
  clientId: string;
  jobId: string;
  leaseToken: string;
}) {
  const prisma = getPrisma();
  const now = new Date();
  const [job, lease] = await prisma.$transaction([
    prisma.campaignExecutionJob.findFirst({
      where: {
        id: params.jobId,
        clientId: params.clientId,
        leaseToken: params.leaseToken,
        status: "running",
        leaseExpiresAt: { gt: now },
      },
      select: { id: true },
    }),
    prisma.tenantCampaignExecutionLease.findFirst({
      where: {
        clientId: params.clientId,
        jobId: params.jobId,
        leaseToken: params.leaseToken,
        expiresAt: { gt: now },
      },
      select: { id: true },
    }),
  ]);
  return Boolean(job && lease);
}

export async function finishCampaignExecutionJob(params: {
  clientId: string;
  jobId: string;
  leaseToken: string;
  status: "completed" | "failed" | "blocked" | "cancelled" | "paused";
  failureReason?: string | null;
  releaseTenantLease?: boolean;
}) {
  const prisma = getPrisma();
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const job = await tx.campaignExecutionJob.findFirst({ where: { id: params.jobId, clientId: params.clientId } });
    if (job?.batchId) await lockCampaignExecutionBatch(tx, params.clientId, job.batchId);
    const updated = await tx.campaignExecutionJob.updateMany({
      where: { id: params.jobId, clientId: params.clientId, leaseToken: params.leaseToken, status: "running" },
      data: {
        status: params.status,
        finishedAt: now,
        failureReason: params.failureReason ?? null,
        leaseExpiresAt: now,
      },
    });
    if (updated.count !== 1) return;
    if (job?.batchId && ["failed", "blocked"].includes(params.status)) {
      await tx.campaignExecutionBatch.updateMany({ where: { id: job.batchId, status: { in: ["scheduled", "running"] } }, data: { status: params.status, failureReason: params.failureReason ?? "batch_chunk_failed", completedAt: now } });
      await tx.campaignExecutionJob.updateMany({ where: { batchId: job.batchId, status: "queued" }, data: { status: "blocked", failureReason: "batch_execution_stopped" } });
    }
    if (params.releaseTenantLease ?? true) {
      await tx.tenantCampaignExecutionLease.updateMany({
        where: { clientId: params.clientId, jobId: params.jobId, leaseToken: params.leaseToken },
        data: { jobId: null, expiresAt: now, heartbeatAt: now },
      });
    }
  });
}

export async function releaseFinishedCampaignExecutionLease(params: {
  clientId: string;
  jobId: string;
  leaseToken: string;
}) {
  const prisma = getPrisma();
  const now = new Date();
  await prisma.tenantCampaignExecutionLease.updateMany({
    where: { clientId: params.clientId, jobId: params.jobId, leaseToken: params.leaseToken },
    data: { jobId: null, expiresAt: now, heartbeatAt: now },
  });
}

export async function markCampaignExecutionJobNeedsReview(params: {
  clientId: string;
  jobId: string;
  reason: string;
  now?: Date;
}) {
  const prisma = getPrisma();
  const now = params.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const job = await tx.campaignExecutionJob.findFirst({
      where: { id: params.jobId, clientId: params.clientId, status: "running" },
      select: { id: true, leaseToken: true, batchId: true },
    });
    if (!job) return false;
    if (job.batchId) {
      await lockCampaignExecutionBatch(tx, params.clientId, job.batchId);
      await tx.campaignExecutionBatch.update({ where: { id: job.batchId }, data: { status: "needs_review", failureReason: params.reason } });
      await tx.campaignExecutionJob.updateMany({ where: { batchId: job.batchId, status: { in: ["queued", "paused"] } }, data: { status: "blocked", failureReason: "batch_execution_stopped" } });
    }
    await tx.campaignExecutionJob.update({
      where: { id: job.id },
      data: {
        status: "needs_review",
        finishedAt: now,
        failureReason: params.reason,
        leaseExpiresAt: now,
      },
    });
    return true;
  });
}

export async function releaseCampaignExecutionLease(params: {
  clientId: string;
  jobId: string;
  leaseToken: string;
}) {
  const prisma = getPrisma();
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const updated = await tx.campaignExecutionJob.updateMany({
      where: { id: params.jobId, clientId: params.clientId, leaseToken: params.leaseToken, status: "running" },
      data: { status: "completed", finishedAt: now, leaseExpiresAt: now },
    });
    if (updated.count !== 1) return;
    await tx.tenantCampaignExecutionLease.updateMany({
      where: { clientId: params.clientId, jobId: params.jobId, leaseToken: params.leaseToken },
      data: { jobId: null, expiresAt: now, heartbeatAt: now },
    });
  });
}

/** Actions, materialization and progress serialize on the same aggregate row. */
export async function lockCampaignExecutionBatch(tx: Prisma.TransactionClient, clientId: string, batchId: string) {
  await tx.$executeRaw`SELECT id FROM "CampaignExecutionBatch" WHERE id = ${batchId} AND "clientId" = ${clientId}::uuid FOR UPDATE`;
}
