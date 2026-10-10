-- Sanitized outline of queries actually executed. Bindings are private.
-- No recovery function, application entrypoint or provider is invoked.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '8000ms';
SET LOCAL lock_timeout = '1000ms';
SELECT transaction_timestamp(), current_setting('transaction_read_only'),
       current_setting('transaction_isolation');
SELECT table_name, column_name, data_type FROM information_schema.columns
 WHERE table_schema='public' AND table_name IN
 ('Campaign','CampaignMessage','CampaignExecutionBatch','CampaignExecutionBatchCampaign',
  'CampaignExecutionJob','TenantCampaignExecutionLease','OutboundMessage','Event')
 ORDER BY table_name,ordinal_position;
-- Per-case Prisma SELECTs were restricted to explicit clientId/campaignId/messageId;
-- related batch/controller/job IDs were obtained from persisted links/metadata.
-- Limits: 20 links/batches, 30 related links/jobs, 5 tenant leases,
-- 50 campaign outbounds, 250 campaign events, 250 matching provider events.
SELECT c."clientKey",j.status,j.kind,count(*)::int AS count,
 count(*) FILTER(WHERE j."leaseToken" IS NOT NULL OR j."leaseOwner" IS NOT NULL
                     OR j."leaseExpiresAt" IS NOT NULL)::int AS linked_lease,
 count(*) FILTER(WHERE j."leaseExpiresAt"<=now())::int AS expired_linked,
 count(*) FILTER(WHERE j."eligibleAt"<=now())::int AS overdue,
 min(j."eligibleAt") AS earliest
 FROM "CampaignExecutionJob" j JOIN "Client" c ON c.id=j."clientId"
 WHERE j.status NOT IN ('completed','failed','blocked','cancelled')
    OR j."leaseToken" IS NOT NULL OR j."leaseOwner" IS NOT NULL OR j."leaseExpiresAt" IS NOT NULL
 GROUP BY 1,2,3 ORDER BY 1,2,3;
SELECT c."clientKey",b.status,count(*)::int AS count,
 count(*) FILTER(WHERE b."eligibleAt"<=now())::int AS overdue,min(b."eligibleAt") AS earliest
 FROM "CampaignExecutionBatch" b JOIN "Client" c ON c.id=b."clientId"
 WHERE b.status NOT IN ('completed','failed','blocked','cancelled') GROUP BY 1,2 ORDER BY 1,2;
SELECT c."clientKey",count(*)::int AS count,
 count(*) FILTER(WHERE l."expiresAt"<=now())::int AS expired,
 count(*) FILTER(WHERE l."jobId" IS NOT NULL)::int AS linked,min(l."expiresAt") AS earliest
 FROM "TenantCampaignExecutionLease" l JOIN "Client" c ON c.id=l."clientId" GROUP BY 1 ORDER BY 1;
SELECT c."clientKey",p.status,count(*)::int AS count,
 count(*) FILTER(WHERE p."scheduledAt"<=now())::int AS schedule_overdue
 FROM "Campaign" p JOIN "Client" c ON c.id=p."clientId"
 WHERE p.status NOT IN ('completed','failed','blocked','cancelled') GROUP BY 1,2 ORDER BY 1,2;
COMMIT;
-- Transaction envelopes additionally bounded to 30s and 20s, maxWait5s.
-- Terminal lease metadata is deliberately included, not erased or treated as active ownership.
