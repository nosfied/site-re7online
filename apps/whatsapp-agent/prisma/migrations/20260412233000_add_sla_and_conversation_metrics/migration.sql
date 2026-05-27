ALTER TABLE "Conversation"
ADD COLUMN "firstAssignedAt" TIMESTAMP(3),
ADD COLUMN "firstResponseAt" TIMESTAMP(3),
ADD COLUMN "lastResponseAt" TIMESTAMP(3),
ADD COLUMN "closedAt" TIMESTAMP(3);

CREATE TABLE "ConversationMetrics" (
    "id" TEXT NOT NULL,
    "conversationId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "firstResponseTimeSec" INTEGER,
    "totalResponseTimeSec" INTEGER,
    "responseCount" INTEGER NOT NULL DEFAULT 0,
    "avgResponseTimeSec" INTEGER,
    "resolutionTimeSec" INTEGER,
    "totalMessages" INTEGER NOT NULL DEFAULT 0,
    "totalAgentMessages" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationMetrics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SLAConfig" (
    "id" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "firstResponseLimitSec" INTEGER NOT NULL,
    "resolutionTimeLimitSec" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SLAConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationMetrics_conversationId_key" ON "ConversationMetrics"("conversationId");
CREATE INDEX "ConversationMetrics_clientId_startedAt_idx" ON "ConversationMetrics"("clientId", "startedAt");
CREATE INDEX "ConversationMetrics_clientId_closedAt_idx" ON "ConversationMetrics"("clientId", "closedAt");

CREATE UNIQUE INDEX "SLAConfig_clientId_key" ON "SLAConfig"("clientId");

CREATE INDEX "Conversation_clientId_closedAt_idx" ON "Conversation"("clientId", "closedAt");
CREATE INDEX "Conversation_clientId_firstAssignedAt_idx" ON "Conversation"("clientId", "firstAssignedAt");

ALTER TABLE "ConversationMetrics"
ADD CONSTRAINT "ConversationMetrics_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationMetrics"
ADD CONSTRAINT "ConversationMetrics_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SLAConfig"
ADD CONSTRAINT "SLAConfig_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
