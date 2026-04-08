-- Add nullable waIdCanonical columns first so rollout can happen without downtime.
ALTER TABLE "Conversation"
ADD COLUMN "waIdCanonical" TEXT;

ALTER TABLE "ConversationRuntimeState"
ADD COLUMN "waIdCanonical" TEXT;

ALTER TABLE "InboundMessage"
ADD COLUMN "waIdCanonical" TEXT;

ALTER TABLE "OutboundMessage"
ADD COLUMN "waIdCanonical" TEXT;

ALTER TABLE "Event"
ADD COLUMN "waIdCanonical" TEXT;

ALTER TABLE "Lead"
ADD COLUMN "waIdCanonical" TEXT;

CREATE INDEX "Conversation_clientId_waIdCanonical_idx"
ON "Conversation"("clientId", "waIdCanonical");

CREATE INDEX "ConversationRuntimeState_clientId_waIdCanonical_idx"
ON "ConversationRuntimeState"("clientId", "waIdCanonical");

CREATE INDEX "InboundMessage_clientId_waIdCanonical_createdAt_idx"
ON "InboundMessage"("clientId", "waIdCanonical", "createdAt");

CREATE INDEX "OutboundMessage_clientId_waIdCanonical_createdAt_idx"
ON "OutboundMessage"("clientId", "waIdCanonical", "createdAt");

CREATE INDEX "Event_clientId_waIdCanonical_createdAt_idx"
ON "Event"("clientId", "waIdCanonical", "createdAt");

CREATE INDEX "Lead_tenantId_waIdCanonical_idx"
ON "Lead"("tenantId", "waIdCanonical");
