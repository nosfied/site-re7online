BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '1s';
WITH policy AS (
 SELECT c.id,c."clientKey",c.status,
        r.id IS NOT NULL AS "configStored",coalesce(r."retentionDays",90) AS days,
        transaction_timestamp() - make_interval(days=>coalesce(r."retentionDays",90)) AS cutoff
 FROM "Client" c LEFT JOIN "RetentionConfig" r ON r."clientId"=c.id
), counts AS (
 SELECT p.id,p."clientKey",p.status,p."configStored",p.days,p.cutoff,
        count(v.id) AS total,
        count(v.id) FILTER(WHERE v."deletedAt" IS NOT NULL) AS "alreadySoftDeleted",
        count(v.id) FILTER(WHERE v."anonymizedAt" IS NOT NULL) AS "alreadyAnonymized",
        count(v.id) FILTER(WHERE v."deletedAt" IS NULL AND v."createdAt"<p.cutoff
          AND v."updatedAt"<p.cutoff AND(v."lastInboundAt" IS NULL OR v."lastInboundAt"<p.cutoff)
          AND(v."lastOutboundAt" IS NULL OR v."lastOutboundAt"<p.cutoff)) AS eligible,
        count(v.id) FILTER(WHERE v."deletedAt" IS NULL AND v."createdAt"<p.cutoff
          AND v."updatedAt"<p.cutoff AND(v."lastInboundAt" IS NULL OR v."lastInboundAt"<p.cutoff)
          AND(v."lastOutboundAt" IS NULL OR v."lastOutboundAt"<p.cutoff)
          AND v."closedAt" IS NULL) AS "eligibleNotClosed"
 FROM policy p LEFT JOIN "Conversation" v ON v."clientId"=p.id
 GROUP BY p.id,p."clientKey",p.status,p."configStored",p.days,p.cutoff
)
SELECT json_build_object(
 'readOnly',current_setting('transaction_read_only'),
 'capturedUtc',transaction_timestamp(),
 'tenants',(SELECT coalesce(json_agg(to_jsonb(c) || jsonb_build_object(
    'lastRetentionEventUtc',(SELECT max(e."createdAt") FROM "Event" e WHERE e."clientId"=c.id AND e."eventName"='retention.executed')
  ) ORDER BY c."clientKey"),'[]'::json) FROM counts c)
);
ROLLBACK;
