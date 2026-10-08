-- Read-only incident binding verification; NEVER authorizes reconciliation/open.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '1s';
WITH a AS (
 SELECT * FROM "Event" WHERE id='4b61e65c-e9e6-4ac8-9f8c-99fa4995086a' AND "clientId"='10a98bf4-1587-43e8-83d4-e3a48c5d79d9'
), w AS (
 SELECT * FROM "Event" WHERE id='ec58e561-111a-41dc-9805-5830ffbba2bc' AND "clientId"='10a98bf4-1587-43e8-83d4-e3a48c5d79d9'
), checks AS (
 SELECT 'tenant' AS check_name, EXISTS(SELECT 1 FROM "Client" WHERE id='10a98bf4-1587-43e8-83d4-e3a48c5d79d9' AND "clientKey"='demo-converta') AS pass
 UNION ALL SELECT 'accepted_submission', EXISTS(SELECT 1 FROM a WHERE "eventName"='campaign.message.provider_accepted' AND "messageId"='campaign.09f1a742-d42d-4325-9b36-cf8e57650e9a.2' AND "payloadJson"->>'campaignRunId'='f28106be-0e56-49e4-928e-0ea527b2a22a')
 UNION ALL SELECT 'failed_131026_correlated', EXISTS(SELECT 1 FROM a,w WHERE w."eventName"='webhook.status.orphaned' AND w."payloadJson"->>'metaMessageId'=a."payloadJson"->>'metaMessageId' AND w."payloadJson"->>'status'='failed' AND w."payloadJson"->'errors' @> '[{"code":131026}]'::jsonb AND w."createdAt">=a."createdAt")
 UNION ALL SELECT 'valid_send_preserved', EXISTS(SELECT 1 FROM "OutboundMessage" WHERE id='cfe85d33-24c8-4ba1-9288-bc9b93fca89e' AND "clientId"='10a98bf4-1587-43e8-83d4-e3a48c5d79d9' AND "messageId"='campaign.09f1a742-d42d-4325-9b36-cf8e57650e9a.1' AND status='SENT')
 UNION ALL SELECT 'missing_second_outbound', NOT EXISTS(SELECT 1 FROM "OutboundMessage" WHERE "clientId"='10a98bf4-1587-43e8-83d4-e3a48c5d79d9' AND "messageId"='campaign.09f1a742-d42d-4325-9b36-cf8e57650e9a.2')
 UNION ALL SELECT 'exactly_two_submission_intents', (SELECT count(*) FROM "Event" WHERE "clientId"='10a98bf4-1587-43e8-83d4-e3a48c5d79d9' AND "eventName"='campaign.message.submit_started' AND "messageId" LIKE 'campaign.09f1a742-d42d-4325-9b36-cf8e57650e9a.%')=2
 UNION ALL SELECT 'immutable_snapshot_six', EXISTS(SELECT 1 FROM "Event" WHERE id='45c465c9-e44b-4a48-9447-6170e01ba8d5' AND "clientId"='10a98bf4-1587-43e8-83d4-e3a48c5d79d9' AND "messageId"='1d7be01c-7545-493d-9be2-e14de005ac5c' AND "payloadJson"->>'eligibleCount'='6')
 UNION ALL SELECT 'suspended_exact_job', EXISTS(SELECT 1 FROM "CampaignExecutionJob" WHERE id='e271fb78-976c-4a85-a554-dbb98a93a24e' AND "clientId"='10a98bf4-1587-43e8-83d4-e3a48c5d79d9' AND "campaignId"='09f1a742-d42d-4325-9b36-cf8e57650e9a' AND "batchId"='5a92945c-d235-47bd-b9c7-eb00f6a7d98a' AND status='queued' AND "leaseToken" IS NULL AND "leaseExpiresAt" IS NULL)
) SELECT json_agg(checks ORDER BY check_name) FROM checks;
SELECT json_agg(x) FROM (
 SELECT cl."clientKey",j.id,j."campaignId",j."batchId",j.status,j.attempt,j."eligibleAt"
 FROM "CampaignExecutionJob" j JOIN "Client" cl ON cl.id=j."clientId"
 WHERE j.status IN ('queued','running','paused') ORDER BY j."eligibleAt",j.sequence,j.id LIMIT 201
) x;
ROLLBACK;
