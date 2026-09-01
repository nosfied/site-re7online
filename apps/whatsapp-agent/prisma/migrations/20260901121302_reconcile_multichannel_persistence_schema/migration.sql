-- Reconcile multichannel persistence schema that was historically applied
-- outside the versioned Prisma migration chain.

CREATE OR REPLACE FUNCTION pg_temp.re7_assert_column(
  table_name text,
  column_name text,
  expected_type text,
  expected_nullable text
) RETURNS void AS $$
DECLARE
  actual record;
BEGIN
  SELECT c.data_type, c.is_nullable
  INTO actual
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = re7_assert_column.table_name
    AND c.column_name = re7_assert_column.column_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missing expected column %.%', table_name, column_name;
  END IF;

  IF actual.data_type <> expected_type OR actual.is_nullable <> expected_nullable THEN
    RAISE EXCEPTION 'Incompatible column %.%: expected type %, nullable %, got type %, nullable %',
      table_name,
      column_name,
      expected_type,
      expected_nullable,
      actual.data_type,
      actual.is_nullable;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.re7_assert_column_default_present(
  table_name text,
  column_name text
) RETURNS void AS $$
DECLARE
  actual text;
BEGIN
  SELECT c.column_default
  INTO actual
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = re7_assert_column_default_present.table_name
    AND c.column_name = re7_assert_column_default_present.column_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missing expected column %.%', table_name, column_name;
  END IF;

  IF actual IS NULL THEN
    RAISE EXCEPTION 'Missing expected default on %.%', table_name, column_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.re7_assert_index(
  index_name text,
  table_name text,
  expected_unique boolean,
  expected_columns text[],
  required_predicate_columns text[] DEFAULT ARRAY[]::text[]
) RETURNS void AS $$
DECLARE
  actual record;
  actual_columns text[];
  required_column text;
BEGIN
  SELECT
    i.indisunique,
    pg_get_expr(i.indpred, i.indrelid) AS predicate,
    ARRAY(
      SELECT a.attname::text
      FROM unnest(i.indkey) WITH ORDINALITY AS key(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = key.attnum
      WHERE key.attnum > 0
      ORDER BY key.ord
    ) AS columns
  INTO actual
  FROM pg_class idx
  JOIN pg_index i ON i.indexrelid = idx.oid
  JOIN pg_class tbl ON tbl.oid = i.indrelid
  JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
  WHERE ns.nspname = 'public'
    AND idx.relname = re7_assert_index.index_name
    AND tbl.relname = re7_assert_index.table_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missing expected index % on %', index_name, table_name;
  END IF;

  actual_columns := actual.columns;
  IF actual.indisunique <> expected_unique OR actual_columns <> expected_columns THEN
    RAISE EXCEPTION 'Incompatible index %: expected unique %, columns %, got unique %, columns %',
      index_name,
      expected_unique,
      expected_columns,
      actual.indisunique,
      actual_columns;
  END IF;

  IF cardinality(required_predicate_columns) = 0 THEN
    IF actual.predicate IS NOT NULL THEN
      RAISE EXCEPTION 'Incompatible index %: expected no predicate, got %', index_name, actual.predicate;
    END IF;
  ELSE
    IF actual.predicate IS NULL THEN
      RAISE EXCEPTION 'Incompatible index %: expected partial predicate', index_name;
    END IF;
    FOREACH required_column IN ARRAY required_predicate_columns LOOP
      IF actual.predicate NOT LIKE '%' || quote_ident(required_column) || ' IS NOT NULL%' THEN
        RAISE EXCEPTION 'Incompatible index % predicate: missing % IS NOT NULL in %',
          index_name,
          required_column,
          actual.predicate;
      END IF;
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.re7_assert_fk(
  constraint_name text,
  table_name text,
  expected_columns text[],
  referenced_table text,
  referenced_columns text[],
  expected_delete_action "char"
) RETURNS void AS $$
DECLARE
  actual record;
BEGIN
  SELECT
    c.confdeltype,
    ARRAY(
      SELECT a.attname::text
      FROM unnest(c.conkey) WITH ORDINALITY AS key(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
      ORDER BY key.ord
    ) AS columns,
    ref_tbl.relname AS ref_table,
    ARRAY(
      SELECT a.attname::text
      FROM unnest(c.confkey) WITH ORDINALITY AS key(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = key.attnum
      ORDER BY key.ord
    ) AS ref_columns
  INTO actual
  FROM pg_constraint c
  JOIN pg_class tbl ON tbl.oid = c.conrelid
  JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
  JOIN pg_class ref_tbl ON ref_tbl.oid = c.confrelid
  WHERE ns.nspname = 'public'
    AND c.conname = re7_assert_fk.constraint_name
    AND tbl.relname = re7_assert_fk.table_name
    AND c.contype = 'f';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missing expected foreign key % on %', constraint_name, table_name;
  END IF;

  IF actual.columns <> expected_columns
    OR actual.ref_table <> referenced_table
    OR actual.ref_columns <> referenced_columns
    OR actual.confdeltype <> expected_delete_action THEN
    RAISE EXCEPTION 'Incompatible foreign key % on %', constraint_name, table_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "channel" TEXT,
  ADD COLUMN IF NOT EXISTS "channelAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "externalUserHash" TEXT,
  ADD COLUMN IF NOT EXISTS "externalUserRef" TEXT,
  ADD COLUMN IF NOT EXISTS "legacyWaId" TEXT,
  ADD COLUMN IF NOT EXISTS "provider" TEXT;

ALTER TABLE "Conversation"
  ADD COLUMN IF NOT EXISTS "channel" TEXT,
  ADD COLUMN IF NOT EXISTS "channelAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "externalUserHash" TEXT,
  ADD COLUMN IF NOT EXISTS "externalUserRef" TEXT,
  ADD COLUMN IF NOT EXISTS "legacyWaId" TEXT,
  ADD COLUMN IF NOT EXISTS "provider" TEXT;

ALTER TABLE "ConversationRuntimeState"
  ADD COLUMN IF NOT EXISTS "channel" TEXT,
  ADD COLUMN IF NOT EXISTS "channelAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "externalUserHash" TEXT,
  ADD COLUMN IF NOT EXISTS "externalUserRef" TEXT,
  ADD COLUMN IF NOT EXISTS "legacyWaId" TEXT,
  ADD COLUMN IF NOT EXISTS "provider" TEXT;

ALTER TABLE "InboundMessage"
  ADD COLUMN IF NOT EXISTS "channel" TEXT,
  ADD COLUMN IF NOT EXISTS "channelAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "externalMessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "externalUserHash" TEXT,
  ADD COLUMN IF NOT EXISTS "externalUserRef" TEXT,
  ADD COLUMN IF NOT EXISTS "legacyWaId" TEXT,
  ADD COLUMN IF NOT EXISTS "provider" TEXT;

ALTER TABLE "OutboundMessage"
  ADD COLUMN IF NOT EXISTS "channel" TEXT,
  ADD COLUMN IF NOT EXISTS "channelAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "externalMessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "externalUserHash" TEXT,
  ADD COLUMN IF NOT EXISTS "externalUserRef" TEXT,
  ADD COLUMN IF NOT EXISTS "legacyWaId" TEXT,
  ADD COLUMN IF NOT EXISTS "provider" TEXT;

ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "channel" TEXT,
  ADD COLUMN IF NOT EXISTS "channelAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "contactChannelIdentityId" TEXT,
  ADD COLUMN IF NOT EXISTS "externalUserHash" TEXT,
  ADD COLUMN IF NOT EXISTS "externalUserRef" TEXT,
  ADD COLUMN IF NOT EXISTS "legacyWaId" TEXT,
  ADD COLUMN IF NOT EXISTS "provider" TEXT;

CREATE TABLE IF NOT EXISTS "ContactChannelIdentity" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "contactId" UUID,
  "channel" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "channelAccountId" TEXT NOT NULL,
  "externalUserHash" TEXT NOT NULL,
  "externalUserRef" TEXT,
  "legacyWaId" TEXT,
  "displayName" TEXT,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContactChannelIdentity_pkey" PRIMARY KEY ("id")
);

SELECT pg_temp.re7_assert_column('Contact', 'channel', 'text', 'YES');
SELECT pg_temp.re7_assert_column('Contact', 'channelAccountId', 'text', 'YES');
SELECT pg_temp.re7_assert_column('Contact', 'externalUserHash', 'text', 'YES');
SELECT pg_temp.re7_assert_column('Contact', 'externalUserRef', 'text', 'YES');
SELECT pg_temp.re7_assert_column('Contact', 'legacyWaId', 'text', 'YES');
SELECT pg_temp.re7_assert_column('Contact', 'provider', 'text', 'YES');

SELECT pg_temp.re7_assert_column('Conversation', 'channel', 'text', 'YES');
SELECT pg_temp.re7_assert_column('Conversation', 'channelAccountId', 'text', 'YES');
SELECT pg_temp.re7_assert_column('Conversation', 'externalUserHash', 'text', 'YES');
SELECT pg_temp.re7_assert_column('Conversation', 'externalUserRef', 'text', 'YES');
SELECT pg_temp.re7_assert_column('Conversation', 'legacyWaId', 'text', 'YES');
SELECT pg_temp.re7_assert_column('Conversation', 'provider', 'text', 'YES');

SELECT pg_temp.re7_assert_column('ConversationRuntimeState', 'channel', 'text', 'YES');
SELECT pg_temp.re7_assert_column('ConversationRuntimeState', 'channelAccountId', 'text', 'YES');
SELECT pg_temp.re7_assert_column('ConversationRuntimeState', 'externalUserHash', 'text', 'YES');
SELECT pg_temp.re7_assert_column('ConversationRuntimeState', 'externalUserRef', 'text', 'YES');
SELECT pg_temp.re7_assert_column('ConversationRuntimeState', 'legacyWaId', 'text', 'YES');
SELECT pg_temp.re7_assert_column('ConversationRuntimeState', 'provider', 'text', 'YES');

SELECT pg_temp.re7_assert_column('InboundMessage', 'channel', 'text', 'YES');
SELECT pg_temp.re7_assert_column('InboundMessage', 'channelAccountId', 'text', 'YES');
SELECT pg_temp.re7_assert_column('InboundMessage', 'externalMessageId', 'text', 'YES');
SELECT pg_temp.re7_assert_column('InboundMessage', 'externalUserHash', 'text', 'YES');
SELECT pg_temp.re7_assert_column('InboundMessage', 'externalUserRef', 'text', 'YES');
SELECT pg_temp.re7_assert_column('InboundMessage', 'legacyWaId', 'text', 'YES');
SELECT pg_temp.re7_assert_column('InboundMessage', 'provider', 'text', 'YES');

SELECT pg_temp.re7_assert_column('OutboundMessage', 'channel', 'text', 'YES');
SELECT pg_temp.re7_assert_column('OutboundMessage', 'channelAccountId', 'text', 'YES');
SELECT pg_temp.re7_assert_column('OutboundMessage', 'externalMessageId', 'text', 'YES');
SELECT pg_temp.re7_assert_column('OutboundMessage', 'externalUserHash', 'text', 'YES');
SELECT pg_temp.re7_assert_column('OutboundMessage', 'externalUserRef', 'text', 'YES');
SELECT pg_temp.re7_assert_column('OutboundMessage', 'legacyWaId', 'text', 'YES');
SELECT pg_temp.re7_assert_column('OutboundMessage', 'provider', 'text', 'YES');

SELECT pg_temp.re7_assert_column('Lead', 'channel', 'text', 'YES');
SELECT pg_temp.re7_assert_column('Lead', 'channelAccountId', 'text', 'YES');
SELECT pg_temp.re7_assert_column('Lead', 'contactChannelIdentityId', 'text', 'YES');
SELECT pg_temp.re7_assert_column('Lead', 'externalUserHash', 'text', 'YES');
SELECT pg_temp.re7_assert_column('Lead', 'externalUserRef', 'text', 'YES');
SELECT pg_temp.re7_assert_column('Lead', 'legacyWaId', 'text', 'YES');
SELECT pg_temp.re7_assert_column('Lead', 'provider', 'text', 'YES');

SELECT pg_temp.re7_assert_column('ContactChannelIdentity', 'id', 'text', 'NO');
SELECT pg_temp.re7_assert_column('ContactChannelIdentity', 'clientId', 'uuid', 'NO');
SELECT pg_temp.re7_assert_column('ContactChannelIdentity', 'contactId', 'uuid', 'YES');
SELECT pg_temp.re7_assert_column('ContactChannelIdentity', 'channel', 'text', 'NO');
SELECT pg_temp.re7_assert_column('ContactChannelIdentity', 'provider', 'text', 'NO');
SELECT pg_temp.re7_assert_column('ContactChannelIdentity', 'channelAccountId', 'text', 'NO');
SELECT pg_temp.re7_assert_column('ContactChannelIdentity', 'externalUserHash', 'text', 'NO');
SELECT pg_temp.re7_assert_column('ContactChannelIdentity', 'externalUserRef', 'text', 'YES');
SELECT pg_temp.re7_assert_column('ContactChannelIdentity', 'legacyWaId', 'text', 'YES');
SELECT pg_temp.re7_assert_column('ContactChannelIdentity', 'displayName', 'text', 'YES');
SELECT pg_temp.re7_assert_column('ContactChannelIdentity', 'firstSeenAt', 'timestamp without time zone', 'NO');
SELECT pg_temp.re7_assert_column('ContactChannelIdentity', 'lastSeenAt', 'timestamp without time zone', 'YES');
SELECT pg_temp.re7_assert_column('ContactChannelIdentity', 'createdAt', 'timestamp without time zone', 'NO');
SELECT pg_temp.re7_assert_column('ContactChannelIdentity', 'updatedAt', 'timestamp without time zone', 'NO');
SELECT pg_temp.re7_assert_column_default_present('ContactChannelIdentity', 'firstSeenAt');
SELECT pg_temp.re7_assert_column_default_present('ContactChannelIdentity', 'createdAt');

CREATE INDEX IF NOT EXISTS "Contact_clientId_channel_provider_channelAccountId_idx"
  ON "Contact"("clientId", "channel", "provider", "channelAccountId");
CREATE INDEX IF NOT EXISTS "Conversation_clientId_channel_provider_channelAccountId_ext_idx"
  ON "Conversation"("clientId", "channel", "provider", "channelAccountId", "externalUserHash");
CREATE INDEX IF NOT EXISTS "Conversation_clientId_channel_updatedAt_idx"
  ON "Conversation"("clientId", "channel", "updatedAt");
CREATE INDEX IF NOT EXISTS "Conversation_clientId_channel_closedAt_idx"
  ON "Conversation"("clientId", "channel", "closedAt");
CREATE INDEX IF NOT EXISTS "Conversation_clientId_channel_deletedAt_idx"
  ON "Conversation"("clientId", "channel", "deletedAt");
CREATE INDEX IF NOT EXISTS "ConversationRuntimeState_clientId_channel_provider_channelA_idx"
  ON "ConversationRuntimeState"("clientId", "channel", "provider", "channelAccountId", "externalUserHash");
CREATE INDEX IF NOT EXISTS "ConversationRuntimeState_clientId_channel_status_idx"
  ON "ConversationRuntimeState"("clientId", "channel", "status");
CREATE INDEX IF NOT EXISTS "ConversationRuntimeState_clientId_channel_assignedUserId_st_idx"
  ON "ConversationRuntimeState"("clientId", "channel", "assignedUserId", "status");
CREATE INDEX IF NOT EXISTS "ConversationRuntimeState_clientId_channel_queueId_status_idx"
  ON "ConversationRuntimeState"("clientId", "channel", "queueId", "status");
CREATE INDEX IF NOT EXISTS "InboundMessage_clientId_channel_provider_channelAccountId_e_idx"
  ON "InboundMessage"("clientId", "channel", "provider", "channelAccountId", "externalUserHash", "createdAt");
CREATE INDEX IF NOT EXISTS "InboundMessage_clientId_channel_externalMessageId_idx"
  ON "InboundMessage"("clientId", "channel", "externalMessageId");
CREATE INDEX IF NOT EXISTS "OutboundMessage_clientId_channel_provider_channelAccountId__idx"
  ON "OutboundMessage"("clientId", "channel", "provider", "channelAccountId", "externalUserHash", "createdAt");
CREATE INDEX IF NOT EXISTS "OutboundMessage_clientId_channel_externalMessageId_idx"
  ON "OutboundMessage"("clientId", "channel", "externalMessageId");
CREATE INDEX IF NOT EXISTS "OutboundMessage_clientId_channel_status_createdAt_idx"
  ON "OutboundMessage"("clientId", "channel", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Lead_tenantId_channel_provider_channelAccountId_externalUse_idx"
  ON "Lead"("tenantId", "channel", "provider", "channelAccountId", "externalUserHash");
CREATE INDEX IF NOT EXISTS "Lead_tenantId_channel_createdAt_idx"
  ON "Lead"("tenantId", "channel", "createdAt");
CREATE INDEX IF NOT EXISTS "Lead_tenantId_contactChannelIdentityId_idx"
  ON "Lead"("tenantId", "contactChannelIdentityId");
CREATE INDEX IF NOT EXISTS "ContactChannelIdentity_clientId_contactId_idx"
  ON "ContactChannelIdentity"("clientId", "contactId");
CREATE INDEX IF NOT EXISTS "ContactChannelIdentity_clientId_channel_provider_channelAcc_idx"
  ON "ContactChannelIdentity"("clientId", "channel", "provider", "channelAccountId");
CREATE INDEX IF NOT EXISTS "ContactChannelIdentity_clientId_lastSeenAt_idx"
  ON "ContactChannelIdentity"("clientId", "lastSeenAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ContactChannelIdentity_clientId_channel_provider_channelAcc_key"
  ON "ContactChannelIdentity"("clientId", "channel", "provider", "channelAccountId", "externalUserHash");

CREATE UNIQUE INDEX IF NOT EXISTS "Contact_multichannel_identity_uniq"
  ON "Contact"("clientId", "channel", "provider", "channelAccountId", "externalUserHash")
  WHERE "channel" IS NOT NULL
    AND "provider" IS NOT NULL
    AND "channelAccountId" IS NOT NULL
    AND "externalUserHash" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_multichannel_identity_uniq"
  ON "Conversation"("clientId", "channel", "provider", "channelAccountId", "externalUserHash")
  WHERE "channel" IS NOT NULL
    AND "provider" IS NOT NULL
    AND "channelAccountId" IS NOT NULL
    AND "externalUserHash" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "ConversationRuntimeState_multichannel_identity_uniq"
  ON "ConversationRuntimeState"("clientId", "channel", "provider", "channelAccountId", "externalUserHash")
  WHERE "channel" IS NOT NULL
    AND "provider" IS NOT NULL
    AND "channelAccountId" IS NOT NULL
    AND "externalUserHash" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "InboundMessage_multichannel_message_uniq"
  ON "InboundMessage"("clientId", "provider", "channel", "channelAccountId", "externalMessageId")
  WHERE "provider" IS NOT NULL
    AND "channel" IS NOT NULL
    AND "channelAccountId" IS NOT NULL
    AND "externalMessageId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "OutboundMessage_multichannel_message_uniq"
  ON "OutboundMessage"("clientId", "provider", "channel", "channelAccountId", "externalMessageId")
  WHERE "provider" IS NOT NULL
    AND "channel" IS NOT NULL
    AND "channelAccountId" IS NOT NULL
    AND "externalMessageId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Lead_multichannel_identity_uniq"
  ON "Lead"("tenantId", "channel", "provider", "channelAccountId", "externalUserHash")
  WHERE "channel" IS NOT NULL
    AND "provider" IS NOT NULL
    AND "channelAccountId" IS NOT NULL
    AND "externalUserHash" IS NOT NULL;

SELECT pg_temp.re7_assert_index(
  'Contact_clientId_channel_provider_channelAccountId_idx',
  'Contact',
  false,
  ARRAY['clientId', 'channel', 'provider', 'channelAccountId']
);
SELECT pg_temp.re7_assert_index(
  'Conversation_clientId_channel_provider_channelAccountId_ext_idx',
  'Conversation',
  false,
  ARRAY['clientId', 'channel', 'provider', 'channelAccountId', 'externalUserHash']
);
SELECT pg_temp.re7_assert_index('Conversation_clientId_channel_updatedAt_idx', 'Conversation', false, ARRAY['clientId', 'channel', 'updatedAt']);
SELECT pg_temp.re7_assert_index('Conversation_clientId_channel_closedAt_idx', 'Conversation', false, ARRAY['clientId', 'channel', 'closedAt']);
SELECT pg_temp.re7_assert_index('Conversation_clientId_channel_deletedAt_idx', 'Conversation', false, ARRAY['clientId', 'channel', 'deletedAt']);
SELECT pg_temp.re7_assert_index(
  'ConversationRuntimeState_clientId_channel_provider_channelA_idx',
  'ConversationRuntimeState',
  false,
  ARRAY['clientId', 'channel', 'provider', 'channelAccountId', 'externalUserHash']
);
SELECT pg_temp.re7_assert_index('ConversationRuntimeState_clientId_channel_status_idx', 'ConversationRuntimeState', false, ARRAY['clientId', 'channel', 'status']);
SELECT pg_temp.re7_assert_index(
  'ConversationRuntimeState_clientId_channel_assignedUserId_st_idx',
  'ConversationRuntimeState',
  false,
  ARRAY['clientId', 'channel', 'assignedUserId', 'status']
);
SELECT pg_temp.re7_assert_index(
  'ConversationRuntimeState_clientId_channel_queueId_status_idx',
  'ConversationRuntimeState',
  false,
  ARRAY['clientId', 'channel', 'queueId', 'status']
);
SELECT pg_temp.re7_assert_index(
  'InboundMessage_clientId_channel_provider_channelAccountId_e_idx',
  'InboundMessage',
  false,
  ARRAY['clientId', 'channel', 'provider', 'channelAccountId', 'externalUserHash', 'createdAt']
);
SELECT pg_temp.re7_assert_index('InboundMessage_clientId_channel_externalMessageId_idx', 'InboundMessage', false, ARRAY['clientId', 'channel', 'externalMessageId']);
SELECT pg_temp.re7_assert_index(
  'OutboundMessage_clientId_channel_provider_channelAccountId__idx',
  'OutboundMessage',
  false,
  ARRAY['clientId', 'channel', 'provider', 'channelAccountId', 'externalUserHash', 'createdAt']
);
SELECT pg_temp.re7_assert_index('OutboundMessage_clientId_channel_externalMessageId_idx', 'OutboundMessage', false, ARRAY['clientId', 'channel', 'externalMessageId']);
SELECT pg_temp.re7_assert_index('OutboundMessage_clientId_channel_status_createdAt_idx', 'OutboundMessage', false, ARRAY['clientId', 'channel', 'status', 'createdAt']);
SELECT pg_temp.re7_assert_index(
  'Lead_tenantId_channel_provider_channelAccountId_externalUse_idx',
  'Lead',
  false,
  ARRAY['tenantId', 'channel', 'provider', 'channelAccountId', 'externalUserHash']
);
SELECT pg_temp.re7_assert_index('Lead_tenantId_channel_createdAt_idx', 'Lead', false, ARRAY['tenantId', 'channel', 'createdAt']);
SELECT pg_temp.re7_assert_index('Lead_tenantId_contactChannelIdentityId_idx', 'Lead', false, ARRAY['tenantId', 'contactChannelIdentityId']);
SELECT pg_temp.re7_assert_index('ContactChannelIdentity_clientId_contactId_idx', 'ContactChannelIdentity', false, ARRAY['clientId', 'contactId']);
SELECT pg_temp.re7_assert_index(
  'ContactChannelIdentity_clientId_channel_provider_channelAcc_idx',
  'ContactChannelIdentity',
  false,
  ARRAY['clientId', 'channel', 'provider', 'channelAccountId']
);
SELECT pg_temp.re7_assert_index('ContactChannelIdentity_clientId_lastSeenAt_idx', 'ContactChannelIdentity', false, ARRAY['clientId', 'lastSeenAt']);
SELECT pg_temp.re7_assert_index(
  'ContactChannelIdentity_clientId_channel_provider_channelAcc_key',
  'ContactChannelIdentity',
  true,
  ARRAY['clientId', 'channel', 'provider', 'channelAccountId', 'externalUserHash']
);
SELECT pg_temp.re7_assert_index('ContactChannelIdentity_pkey', 'ContactChannelIdentity', true, ARRAY['id']);
SELECT pg_temp.re7_assert_index(
  'Contact_multichannel_identity_uniq',
  'Contact',
  true,
  ARRAY['clientId', 'channel', 'provider', 'channelAccountId', 'externalUserHash'],
  ARRAY['channel', 'provider', 'channelAccountId', 'externalUserHash']
);
SELECT pg_temp.re7_assert_index(
  'Conversation_multichannel_identity_uniq',
  'Conversation',
  true,
  ARRAY['clientId', 'channel', 'provider', 'channelAccountId', 'externalUserHash'],
  ARRAY['channel', 'provider', 'channelAccountId', 'externalUserHash']
);
SELECT pg_temp.re7_assert_index(
  'ConversationRuntimeState_multichannel_identity_uniq',
  'ConversationRuntimeState',
  true,
  ARRAY['clientId', 'channel', 'provider', 'channelAccountId', 'externalUserHash'],
  ARRAY['channel', 'provider', 'channelAccountId', 'externalUserHash']
);
SELECT pg_temp.re7_assert_index(
  'InboundMessage_multichannel_message_uniq',
  'InboundMessage',
  true,
  ARRAY['clientId', 'provider', 'channel', 'channelAccountId', 'externalMessageId'],
  ARRAY['provider', 'channel', 'channelAccountId', 'externalMessageId']
);
SELECT pg_temp.re7_assert_index(
  'OutboundMessage_multichannel_message_uniq',
  'OutboundMessage',
  true,
  ARRAY['clientId', 'provider', 'channel', 'channelAccountId', 'externalMessageId'],
  ARRAY['provider', 'channel', 'channelAccountId', 'externalMessageId']
);
SELECT pg_temp.re7_assert_index(
  'Lead_multichannel_identity_uniq',
  'Lead',
  true,
  ARRAY['tenantId', 'channel', 'provider', 'channelAccountId', 'externalUserHash'],
  ARRAY['channel', 'provider', 'channelAccountId', 'externalUserHash']
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ContactChannelIdentity_clientId_fkey'
      AND conrelid = '"ContactChannelIdentity"'::regclass
  ) THEN
    ALTER TABLE "ContactChannelIdentity"
      ADD CONSTRAINT "ContactChannelIdentity_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ContactChannelIdentity_contactId_fkey'
      AND conrelid = '"ContactChannelIdentity"'::regclass
  ) THEN
    ALTER TABLE "ContactChannelIdentity"
      ADD CONSTRAINT "ContactChannelIdentity_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Lead_contactChannelIdentityId_fkey'
      AND conrelid = '"Lead"'::regclass
  ) THEN
    ALTER TABLE "Lead"
      ADD CONSTRAINT "Lead_contactChannelIdentityId_fkey"
      FOREIGN KEY ("contactChannelIdentityId") REFERENCES "ContactChannelIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END;
$$;

SELECT pg_temp.re7_assert_fk(
  'ContactChannelIdentity_clientId_fkey',
  'ContactChannelIdentity',
  ARRAY['clientId'],
  'Client',
  ARRAY['id'],
  'c'
);
SELECT pg_temp.re7_assert_fk(
  'ContactChannelIdentity_contactId_fkey',
  'ContactChannelIdentity',
  ARRAY['contactId'],
  'Contact',
  ARRAY['id'],
  'n'
);
SELECT pg_temp.re7_assert_fk(
  'Lead_contactChannelIdentityId_fkey',
  'Lead',
  ARRAY['contactChannelIdentityId'],
  'ContactChannelIdentity',
  ARRAY['id'],
  'n'
);
