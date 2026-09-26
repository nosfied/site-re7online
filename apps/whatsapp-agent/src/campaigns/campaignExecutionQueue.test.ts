import "./campaignOperationsTestSupport.js";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  acquireTemporaryTenantCampaignExecutionLease,
  assertCampaignExecutionLease,
  claimNextCampaignExecutionJob,
  enqueueCampaignExecutionJob,
  finishCampaignExecutionJob,
  markCampaignExecutionJobNeedsReview,
  releaseCampaignExecutionLease,
} from "./campaignExecutionQueue.js";

process.env.APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "campaign-execution-queue-test-secret";

const prisma = new PrismaClient();

test.after(async () => {
  await prisma.$disconnect();
});

async function createClientAndCampaign(prefix: string) {
  const client = await prisma.client.create({
    data: {
      clientKey: `${prefix}-${crypto.randomUUID()}`,
      name: prefix,
      status: "ACTIVE",
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      clientId: client.id,
      name: `${prefix} campaign ${crypto.randomUUID()}`,
      templateName: "queue_template",
      status: "scheduled",
      totalRecipients: 1,
    },
  });
  return { client, campaign };
}

test("campaign execution queue claims only one job per tenant", async () => {
  const first = await createClientAndCampaign("tenant-queue-one-a");
  const secondCampaign = await prisma.campaign.create({
    data: {
      clientId: first.client.id,
      name: `tenant-queue-one-b ${crypto.randomUUID()}`,
      templateName: "queue_template",
      status: "scheduled",
      totalRecipients: 1,
    },
  });
  const now = new Date();
  await enqueueCampaignExecutionJob({
    prisma,
    clientId: first.client.id,
    campaignId: first.campaign.id,
    eligibleAt: now,
    idempotencyKey: `queue-test:${first.campaign.id}`,
  });
  await enqueueCampaignExecutionJob({
    prisma,
    clientId: first.client.id,
    campaignId: secondCampaign.id,
    eligibleAt: now,
    idempotencyKey: `queue-test:${secondCampaign.id}`,
  });

  const claimed = await claimNextCampaignExecutionJob({ now });
  assert.ok(claimed);
  const blockedByTenantLease = await claimNextCampaignExecutionJob({ now });
  assert.equal(blockedByTenantLease, null);

  await finishCampaignExecutionJob({
    clientId: claimed.clientId,
    jobId: claimed.id,
    leaseToken: claimed.leaseToken,
    status: "completed",
  });
  const next = await claimNextCampaignExecutionJob({ now });
  assert.ok(next);
  assert.notEqual(next.id, claimed.id);
  await finishCampaignExecutionJob({
    clientId: next.clientId,
    jobId: next.id,
    leaseToken: next.leaseToken,
    status: "completed",
  });
});

test("campaign execution queue allows different tenants independently", async () => {
  const first = await createClientAndCampaign("tenant-queue-independent-a");
  const second = await createClientAndCampaign("tenant-queue-independent-b");
  const now = new Date();
  await enqueueCampaignExecutionJob({
    prisma,
    clientId: first.client.id,
    campaignId: first.campaign.id,
    eligibleAt: now,
    idempotencyKey: `queue-test:${first.campaign.id}`,
  });
  await enqueueCampaignExecutionJob({
    prisma,
    clientId: second.client.id,
    campaignId: second.campaign.id,
    eligibleAt: now,
    idempotencyKey: `queue-test:${second.campaign.id}`,
  });

  const claimedA = await claimNextCampaignExecutionJob({ now });
  const claimedB = await claimNextCampaignExecutionJob({ now });
  assert.ok(claimedA);
  assert.ok(claimedB);
  assert.notEqual(claimedA.clientId, claimedB.clientId);
  await finishCampaignExecutionJob({
    clientId: claimedA.clientId,
    jobId: claimedA.id,
    leaseToken: claimedA.leaseToken,
    status: "completed",
  });
  await finishCampaignExecutionJob({
    clientId: claimedB.clientId,
    jobId: claimedB.id,
    leaseToken: claimedB.leaseToken,
    status: "completed",
  });
});

test("campaign test-send lease blocks campaign claims atomically", async () => {
  const fixture = await createClientAndCampaign("tenant-queue-test-send");
  const now = new Date();
  await enqueueCampaignExecutionJob({
    prisma,
    clientId: fixture.client.id,
    campaignId: fixture.campaign.id,
    eligibleAt: now,
    idempotencyKey: `queue-test:${fixture.campaign.id}`,
  });
  const lease = await acquireTemporaryTenantCampaignExecutionLease({
    clientId: fixture.client.id,
    purpose: "campaign-test-send",
    now,
  });
  assert.equal(lease.ok, true);
  const claimedWhileTestSendOwnsTenant = await claimNextCampaignExecutionJob({ now });
  assert.equal(claimedWhileTestSendOwnsTenant, null);
  if (lease.ok) {
    await releaseCampaignExecutionLease({
      clientId: fixture.client.id,
      jobId: lease.jobId,
      leaseToken: lease.leaseToken,
    });
  }
  const claimedAfterRelease = await claimNextCampaignExecutionJob({ now });
  assert.ok(claimedAfterRelease);
  await finishCampaignExecutionJob({
    clientId: claimedAfterRelease.clientId,
    jobId: claimedAfterRelease.id,
    leaseToken: claimedAfterRelease.leaseToken,
    status: "completed",
  });
});

test("expired running campaign job still blocks tenant until explicit finish", async () => {
  const first = await createClientAndCampaign("tenant-queue-expired-running-a");
  const secondCampaign = await prisma.campaign.create({
    data: {
      clientId: first.client.id,
      name: `tenant-queue-expired-running-b ${crypto.randomUUID()}`,
      templateName: "queue_template",
      status: "scheduled",
      totalRecipients: 1,
    },
  });
  const now = new Date();
  await enqueueCampaignExecutionJob({
    prisma,
    clientId: first.client.id,
    campaignId: first.campaign.id,
    eligibleAt: now,
    idempotencyKey: `queue-test:${first.campaign.id}`,
  });
  await enqueueCampaignExecutionJob({
    prisma,
    clientId: first.client.id,
    campaignId: secondCampaign.id,
    eligibleAt: now,
    idempotencyKey: `queue-test:${secondCampaign.id}`,
  });

  const claimed = await claimNextCampaignExecutionJob({ now, leaseMs: 5 });
  assert.ok(claimed);
  const afterLeaseExpiry = new Date(now.getTime() + 10_000);
  const blockedByRunningJob = await claimNextCampaignExecutionJob({ now: afterLeaseExpiry });
  assert.equal(blockedByRunningJob, null);

  await finishCampaignExecutionJob({
    clientId: claimed.clientId,
    jobId: claimed.id,
    leaseToken: claimed.leaseToken,
    status: "completed",
  });
  const next = await claimNextCampaignExecutionJob({ now: afterLeaseExpiry });
  assert.ok(next);
  await finishCampaignExecutionJob({
    clientId: next.clientId,
    jobId: next.id,
    leaseToken: next.leaseToken,
    status: "completed",
  });
});

test("expired test-send lease still blocks tenant until explicit release", async () => {
  const fixture = await createClientAndCampaign("tenant-queue-expired-test-send");
  const now = new Date();
  await enqueueCampaignExecutionJob({
    prisma,
    clientId: fixture.client.id,
    campaignId: fixture.campaign.id,
    eligibleAt: now,
    idempotencyKey: `queue-test:${fixture.campaign.id}`,
  });
  const lease = await acquireTemporaryTenantCampaignExecutionLease({
    clientId: fixture.client.id,
    purpose: "campaign-test-send",
    now,
    leaseMs: 5,
  });
  assert.equal(lease.ok, true);
  const afterLeaseExpiry = new Date(now.getTime() + 10_000);
  const blockedByRunningTestSend = await claimNextCampaignExecutionJob({ now: afterLeaseExpiry });
  assert.equal(blockedByRunningTestSend, null);

  if (lease.ok) {
    await releaseCampaignExecutionLease({
      clientId: fixture.client.id,
      jobId: lease.jobId,
      leaseToken: lease.leaseToken,
    });
  }
  const claimedAfterRelease = await claimNextCampaignExecutionJob({ now: afterLeaseExpiry });
  assert.ok(claimedAfterRelease);
  await finishCampaignExecutionJob({
    clientId: claimedAfterRelease.clientId,
    jobId: claimedAfterRelease.id,
    leaseToken: claimedAfterRelease.leaseToken,
    status: "completed",
  });
});

test("uncertain running job moved to needs-review keeps tenant blocked", async () => {
  const first = await createClientAndCampaign("tenant-queue-needs-review-a");
  const secondCampaign = await prisma.campaign.create({
    data: {
      clientId: first.client.id,
      name: `tenant-queue-needs-review-b ${crypto.randomUUID()}`,
      templateName: "queue_template",
      status: "scheduled",
      totalRecipients: 1,
    },
  });
  const now = new Date();
  await enqueueCampaignExecutionJob({
    prisma,
    clientId: first.client.id,
    campaignId: first.campaign.id,
    eligibleAt: now,
    idempotencyKey: `queue-test:${first.campaign.id}`,
  });
  await enqueueCampaignExecutionJob({
    prisma,
    clientId: first.client.id,
    campaignId: secondCampaign.id,
    eligibleAt: now,
    idempotencyKey: `queue-test:${secondCampaign.id}`,
  });

  const claimed = await claimNextCampaignExecutionJob({ now, leaseMs: 5 });
  assert.ok(claimed);
  assert.equal(await claimNextCampaignExecutionJob({ now: new Date(now.getTime() + 10_000) }), null);
  assert.equal(
    await markCampaignExecutionJobNeedsReview({
      clientId: claimed.clientId,
      jobId: claimed.id,
      reason: "provider_result_uncertain_after_restart",
    }),
    true
  );
  const reviewedJob = await prisma.campaignExecutionJob.findUnique({
    where: { id: claimed.id },
    select: { status: true, failureReason: true },
  });
  assert.equal(reviewedJob?.status, "needs_review");
  assert.equal(reviewedJob?.failureReason, "provider_result_uncertain_after_restart");
  const next = await claimNextCampaignExecutionJob({ now: new Date(now.getTime() + 10_000) });
  assert.equal(next, null);
});

test("batch chunk jobs are claimed in deterministic chunk order", async () => {
  const fixture = await createClientAndCampaign("tenant-queue-batch-order");
  const batch = await prisma.campaignExecutionBatch.create({
    data: {
      clientId: fixture.client.id,
      name: `batch order ${crypto.randomUUID()}`,
      status: "scheduled",
      sourceMode: "STATIC_SELECTION",
      totalRecipients: 3,
      chunkCount: 3,
      idempotencyKey: `batch-order:${crypto.randomUUID()}`,
    },
  });
  const now = new Date();
  for (const chunkIndex of [3, 1, 2]) {
    const campaign = await prisma.campaign.create({
      data: {
        clientId: fixture.client.id,
        name: `batch order chunk ${chunkIndex} ${crypto.randomUUID()}`,
        templateName: "queue_template",
        status: "scheduled",
        totalRecipients: 1,
      },
    });
    await enqueueCampaignExecutionJob({
      prisma,
      clientId: fixture.client.id,
      campaignId: campaign.id,
      batchId: batch.id,
      chunkIndex,
      kind: "batch_chunk",
      eligibleAt: now,
      idempotencyKey: `queue-test:${batch.id}:${chunkIndex}`,
    });
  }

  for (const expectedChunkIndex of [1, 2, 3]) {
    const claimed = await claimNextCampaignExecutionJob({ now });
    assert.ok(claimed);
    assert.equal(claimed.batchId, batch.id);
    assert.equal(claimed.chunkIndex, expectedChunkIndex);
    await finishCampaignExecutionJob({
      clientId: claimed.clientId,
      jobId: claimed.id,
      leaseToken: claimed.leaseToken,
      status: "completed",
    });
  }
});

test("old executor token cannot continue after job is moved to needs-review", async () => {
  const first = await createClientAndCampaign("tenant-queue-old-owner-a");
  const secondCampaign = await prisma.campaign.create({
    data: {
      clientId: first.client.id,
      name: `tenant-queue-old-owner-b ${crypto.randomUUID()}`,
      templateName: "queue_template",
      status: "scheduled",
      totalRecipients: 1,
    },
  });
  const now = new Date();
  await enqueueCampaignExecutionJob({
    prisma,
    clientId: first.client.id,
    campaignId: first.campaign.id,
    eligibleAt: now,
    idempotencyKey: `queue-test:${first.campaign.id}`,
  });
  await enqueueCampaignExecutionJob({
    prisma,
    clientId: first.client.id,
    campaignId: secondCampaign.id,
    eligibleAt: now,
    idempotencyKey: `queue-test:${secondCampaign.id}`,
  });

  const oldOwner = await claimNextCampaignExecutionJob({ now, leaseMs: 5 });
  assert.ok(oldOwner);
  assert.equal(
    await markCampaignExecutionJobNeedsReview({
      clientId: oldOwner.clientId,
      jobId: oldOwner.id,
      reason: "provider_result_uncertain_after_restart",
      now: new Date(now.getTime() + 10_000),
    }),
    true
  );
  assert.equal(
    await assertCampaignExecutionLease({
      clientId: oldOwner.clientId,
      jobId: oldOwner.id,
      leaseToken: oldOwner.leaseToken,
    }),
    false
  );
  const next = await claimNextCampaignExecutionJob({ now: new Date(now.getTime() + 10_002) });
  assert.equal(next, null);
});
