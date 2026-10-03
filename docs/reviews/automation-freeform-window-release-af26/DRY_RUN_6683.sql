-- Read-only inventory. Supply psql -v client_id=<UUID> -v since=<ISO timestamp>.
-- Output is operational evidence: store privately, never commit its result.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
WITH created AS (
  SELECT e."clientId", e."conversationId", e."waId", e."waIdCanonical",
         e."messageId", e."createdAt"
  FROM "Event" e
  WHERE e."clientId" = :'client_id'::uuid
    AND e."eventName" = 'campaign.recipient.conversation_created'
    AND e."createdAt" >= :'since'::timestamptz
  ORDER BY e."createdAt" DESC
  LIMIT 500
)
SELECT c."conversationId", c."createdAt" AS materialized_at,
       count(DISTINCT r.id) AS runtime_rows,
       min(r.version) AS runtime_version_min,
       max(r."updatedAt") AS runtime_updated_at_max,
       array_agg(DISTINCT r.channel) FILTER (WHERE r.channel IS NOT NULL) AS runtime_channels,
       array_agg(DISTINCT r.provider) FILTER (WHERE r.provider IS NOT NULL) AS runtime_providers,
       bool_or(r."windowIsOpen") AS runtime_window_open,
       min(r."lastInboundAt") AS runtime_last_inbound_at,
       min(r."windowExpiresAt") AS runtime_expires_at,
       bool_or(r."lastInboundMessageId" IS NOT NULL) AS runtime_has_inbound_marker,
       count(DISTINCT i.id) AS inbound_rows,
       count(DISTINCT m.id) AS conversation_inbound_rows,
       count(DISTINCT o.id) AS matching_outbound_rows,
       count(DISTINCT h.id) AS later_human_events,
       min(v."windowIsOpen"::int) AS conversation_window_open,
       min(v."lastInboundAt") AS conversation_last_inbound_at
FROM created c
LEFT JOIN "Conversation" v
  ON v."clientId" = c."clientId" AND v.id::text = c."conversationId"
LEFT JOIN "ConversationRuntimeState" r
  ON r."clientId" = c."clientId"
 AND (r."waId" IN (c."waId", c."waIdCanonical")
      OR r."waIdCanonical" IN (c."waId", c."waIdCanonical"))
LEFT JOIN "InboundMessage" i
  ON i."clientId" = c."clientId"
 AND (i."waId" IN (c."waId", c."waIdCanonical")
      OR i."waIdCanonical" IN (c."waId", c."waIdCanonical"))
LEFT JOIN "Message" m
  ON m."conversationId" = v.id AND m.direction = 'INBOUND'
LEFT JOIN "OutboundMessage" o
  ON o."clientId" = c."clientId" AND o."messageId" = c."messageId"
LEFT JOIN "Event" h
  ON h."clientId" = c."clientId" AND h."createdAt" > c."createdAt"
 AND h."eventName" IN ('conversation.assigned', 'conversation.transferred',
                       'conversation.closed', 'conversation.reentry.reset_to_bot')
 AND (h."waId" IN (c."waId", c."waIdCanonical")
      OR h."waIdCanonical" IN (c."waId", c."waIdCanonical"))
GROUP BY c."conversationId", c."createdAt"
ORDER BY c."createdAt" DESC;
ROLLBACK;
