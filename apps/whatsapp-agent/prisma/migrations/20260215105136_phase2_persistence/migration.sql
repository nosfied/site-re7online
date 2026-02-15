-- AlterTable
ALTER TABLE "Client" ADD COLUMN "adminToken" TEXT;

-- CreateTable
CREATE TABLE "InboundMessage" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "phoneNumberId" TEXT,
    "waId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "type" "MessageType" NOT NULL,
    "bodyText" TEXT,
    "allowlistHit" BOOLEAN NOT NULL,
    "requestId" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "phoneNumberId" TEXT,
    "waId" TEXT NOT NULL,
    "messageId" TEXT,
    "type" "MessageType" NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "bodyText" TEXT,
    "templateName" TEXT,
    "templateLang" TEXT,
    "requestId" TEXT,
    "metaMessageId" TEXT,
    "errorBody" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboundMessage_requestId_idx" ON "InboundMessage"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "InboundMessage_clientId_messageId_key" ON "InboundMessage"("clientId", "messageId");

-- CreateIndex
CREATE INDEX "OutboundMessage_requestId_idx" ON "OutboundMessage"("requestId");

-- CreateIndex
CREATE INDEX "OutboundMessage_messageId_idx" ON "OutboundMessage"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundMessage_clientId_messageId_key" ON "OutboundMessage"("clientId", "messageId");

-- AddForeignKey
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
