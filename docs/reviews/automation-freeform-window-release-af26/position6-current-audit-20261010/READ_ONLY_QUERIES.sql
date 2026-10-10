-- Equivalents of the audited Prisma SELECTs; all results must remain private.
-- Not an apply/ack/recovery script. Parameters are explicit internal scope IDs.
-- The readers also reject take+1 overflow, audit information_schema, and disconnect.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '8s';
SET LOCAL lock_timeout = '1s';
SELECT transaction_timestamp(), current_setting('transaction_read_only');
SELECT table_name,column_name,data_type FROM information_schema.columns
 WHERE table_schema='public' AND table_name IN ('Client','Campaign','CampaignExecutionBatch',
 'CampaignExecutionBatchCampaign','CampaignExecutionJob','TenantCampaignExecutionLease',
 'OutboundMessage','Message','Event','TemplateRequest','Contact','Lead','Conversation','ConversationRuntimeState')
 ORDER BY table_name,ordinal_position;
SELECT id,"clientKey",status FROM "Client" WHERE id=:'tenant_id';
SELECT * FROM "Campaign" WHERE "clientId"=:'tenant_id' AND id IN (:'child_id',:'controller_id');
SELECT * FROM "CampaignExecutionBatchCampaign" WHERE "clientId"=:'tenant_id' AND "campaignId"=:'child_id'
 ORDER BY "chunkIndex" LIMIT 21;
SELECT * FROM "CampaignExecutionBatch" WHERE "clientId"=:'tenant_id' AND id=:'batch_id' LIMIT 21;
SELECT * FROM "CampaignExecutionJob" WHERE "clientId"=:'tenant_id'
 AND ("campaignId"=:'child_id' OR "batchId"=:'batch_id') ORDER BY "createdAt" LIMIT 31;
SELECT * FROM "TenantCampaignExecutionLease" WHERE "clientId"=:'tenant_id' ORDER BY "expiresAt" LIMIT 6;
SELECT * FROM "OutboundMessage" WHERE "clientId"=:'tenant_id' AND "messageId" LIKE :'child_message_prefix'
 ORDER BY "createdAt" LIMIT 31;
SELECT * FROM "Event" WHERE "clientId"=:'tenant_id'
 AND ("messageId" IN (:'child_id',:'controller_id',:'message_id') OR "payloadJson"->>'campaignId'=:'child_id')
 ORDER BY "createdAt" LIMIT 251;
-- meta_id is taken from the original accepted Event, never a current config or neighbour.
SELECT * FROM "Event" WHERE "clientId"=:'tenant_id'
 AND ("messageId"=:'meta_id' OR "payloadJson"->>'metaMessageId'=:'meta_id') ORDER BY "createdAt" LIMIT 101;
SELECT * FROM "Event" WHERE "clientId"=:'tenant_id' AND "eventName" LIKE 'meta.usage.%'
 AND ("messageId"=:'message_id' OR "payloadJson"->>'outboundMessageId'=:'message_id') ORDER BY "createdAt" LIMIT 51;
SELECT * FROM "OutboundMessage" WHERE "clientId"=:'tenant_id'
 AND ("messageId"=:'message_id' OR "metaMessageId"=:'meta_id' OR "externalMessageId"=:'meta_id') ORDER BY "createdAt" LIMIT 21;
SELECT m.* FROM "Message" m JOIN "Conversation" c ON c.id=m."conversationId"
 WHERE c."clientId"=:'tenant_id' AND (m."messageId" IN (:'message_id',:'meta_id') OR m."metaMessageId"=:'meta_id')
 ORDER BY m."createdAt" LIMIT 21;
SELECT * FROM "Event" WHERE "clientId"=:'tenant_id' AND id IN (:'seed_event_id',:'snapshot_event_id');
SELECT * FROM "TemplateRequest" WHERE "clientId"=:'tenant_id' AND name=:'original_template_name'
 AND "createdAt"<=:'accepted_at' ORDER BY "createdAt" LIMIT 31;
SELECT * FROM "Event" WHERE "clientId"=:'tenant_id' AND "createdAt"<=:'accepted_at' AND "eventName" LIKE '%template%'
 AND ("payloadJson"->>'templateId'=:'original_template_id' OR "payloadJson"->>'templateName'=:'original_template_name'
 OR "payloadJson"->>'name'=:'original_template_name') ORDER BY "createdAt" LIMIT 101;
SELECT * FROM "Contact" WHERE "clientId"=:'tenant_id' AND "waId"=:'original_wa_id' ORDER BY "createdAt" LIMIT 21;
SELECT * FROM "Lead" WHERE "tenantId"=:'tenant_id' AND
 ("waId"=:'original_wa_id' OR "waIdCanonical"=:'original_wa_id' OR phone=:'original_wa_id') ORDER BY "createdAt" LIMIT 21;
SELECT * FROM "Conversation" WHERE "clientId"=:'tenant_id' AND
 ("waId"=:'original_wa_id' OR "waIdCanonical"=:'original_wa_id') ORDER BY "createdAt" LIMIT 21;
SELECT * FROM "ConversationRuntimeState" WHERE "clientId"=:'tenant_id' AND
 ("waId"=:'original_wa_id' OR "waIdCanonical"=:'original_wa_id') ORDER BY "createdAt" LIMIT 21;
-- Global aggregated inventory; includes terminal jobs retaining expired lease metadata.
SELECT c."clientKey",j.status,j.kind,count(*)::int AS count,
 count(*) FILTER(WHERE j."leaseToken" IS NOT NULL OR j."leaseOwner" IS NOT NULL OR j."leaseExpiresAt" IS NOT NULL)::int AS linked_lease,
 count(*) FILTER(WHERE j."leaseExpiresAt"<=now())::int AS expired_linked,
 count(*) FILTER(WHERE j."eligibleAt"<=now())::int AS overdue,min(j."eligibleAt") AS earliest
 FROM "CampaignExecutionJob" j JOIN "Client" c ON c.id=j."clientId"
 WHERE j.status NOT IN ('completed','failed','blocked','cancelled') OR j."leaseToken" IS NOT NULL OR j."leaseOwner" IS NOT NULL OR j."leaseExpiresAt" IS NOT NULL
 GROUP BY 1,2,3 ORDER BY 1,2,3;
SELECT c."clientKey",b.status,count(*)::int AS count,count(*) FILTER(WHERE b."eligibleAt"<=now())::int AS overdue,min(b."eligibleAt") AS earliest
 FROM "CampaignExecutionBatch" b JOIN "Client" c ON c.id=b."clientId"
 WHERE b.status NOT IN ('completed','failed','blocked','cancelled') GROUP BY 1,2 ORDER BY 1,2;
SELECT c."clientKey",count(*)::int AS count,count(*) FILTER(WHERE l."expiresAt"<=now())::int AS expired,
 count(*) FILTER(WHERE l."jobId" IS NOT NULL)::int AS linked,min(l."expiresAt") AS earliest
 FROM "TenantCampaignExecutionLease" l JOIN "Client" c ON c.id=l."clientId" GROUP BY 1 ORDER BY 1;
SELECT c."clientKey",p.status,count(*)::int AS count,count(*) FILTER(WHERE p."scheduledAt"<=now())::int AS overdue
 FROM "Campaign" p JOIN "Client" c ON c.id=p."clientId" WHERE p.status NOT IN ('completed','failed','blocked','cancelled') GROUP BY 1,2 ORDER BY 1,2;
COMMIT;
