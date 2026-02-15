-- Enable UUID generator
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop FKs to allow type changes
ALTER TABLE "WaPhoneNumber" DROP CONSTRAINT IF EXISTS "WaPhoneNumber_clientId_fkey";
ALTER TABLE "Contact" DROP CONSTRAINT IF EXISTS "Contact_clientId_fkey";
ALTER TABLE "Conversation" DROP CONSTRAINT IF EXISTS "Conversation_clientId_fkey";
ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_conversationId_fkey";
ALTER TABLE "Event" DROP CONSTRAINT IF EXISTS "Event_clientId_fkey";
ALTER TABLE "InboundMessage" DROP CONSTRAINT IF EXISTS "InboundMessage_clientId_fkey";
ALTER TABLE "OutboundMessage" DROP CONSTRAINT IF EXISTS "OutboundMessage_clientId_fkey";

-- Convert primary key ids to UUID + defaults
ALTER TABLE "Client" ALTER COLUMN "id" TYPE uuid USING "id"::uuid;
ALTER TABLE "Client" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "WaPhoneNumber" ALTER COLUMN "id" TYPE uuid USING "id"::uuid;
ALTER TABLE "WaPhoneNumber" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "Contact" ALTER COLUMN "id" TYPE uuid USING "id"::uuid;
ALTER TABLE "Contact" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "Conversation" ALTER COLUMN "id" TYPE uuid USING "id"::uuid;
ALTER TABLE "Conversation" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "Message" ALTER COLUMN "id" TYPE uuid USING "id"::uuid;
ALTER TABLE "Message" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "Event" ALTER COLUMN "id" TYPE uuid USING "id"::uuid;
ALTER TABLE "Event" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "InboundMessage" ALTER COLUMN "id" TYPE uuid USING "id"::uuid;
ALTER TABLE "InboundMessage" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "OutboundMessage" ALTER COLUMN "id" TYPE uuid USING "id"::uuid;
ALTER TABLE "OutboundMessage" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- Convert FK columns to UUID
ALTER TABLE "WaPhoneNumber" ALTER COLUMN "clientId" TYPE uuid USING "clientId"::uuid;
ALTER TABLE "Contact" ALTER COLUMN "clientId" TYPE uuid USING "clientId"::uuid;
ALTER TABLE "Conversation" ALTER COLUMN "clientId" TYPE uuid USING "clientId"::uuid;
ALTER TABLE "Message" ALTER COLUMN "conversationId" TYPE uuid USING "conversationId"::uuid;
ALTER TABLE "Event" ALTER COLUMN "clientId" TYPE uuid USING "clientId"::uuid;
ALTER TABLE "InboundMessage" ALTER COLUMN "clientId" TYPE uuid USING "clientId"::uuid;
ALTER TABLE "OutboundMessage" ALTER COLUMN "clientId" TYPE uuid USING "clientId"::uuid;

-- Recreate FKs
ALTER TABLE "WaPhoneNumber" ADD CONSTRAINT "WaPhoneNumber_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
