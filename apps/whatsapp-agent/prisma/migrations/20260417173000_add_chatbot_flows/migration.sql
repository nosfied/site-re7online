ALTER TABLE "ConversationRuntimeState"
ADD COLUMN "chatbotNodeId" TEXT,
ADD COLUMN "chatbotActive" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ChatbotFlow" (
    "id" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "entryPoint" BOOLEAN NOT NULL DEFAULT false,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatbotFlow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatbotFlow_clientId_createdAt_idx" ON "ChatbotFlow"("clientId", "createdAt");
CREATE INDEX "ChatbotFlow_clientId_isActive_entryPoint_idx" ON "ChatbotFlow"("clientId", "isActive", "entryPoint");

ALTER TABLE "ChatbotFlow"
ADD CONSTRAINT "ChatbotFlow_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
