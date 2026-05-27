#!/usr/bin/env tsx
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { getTenants } from "../src/config/tenantConfig.js";
import {
  buildConversationIdentityKeys,
  buildWhatsAppBackfillDryRunReport,
  type BackfillModelName,
  type WhatsAppBackfillClient,
  type WhatsAppBackfillRecord,
} from "../src/channels/whatsappBackfillDryRun.js";
import {
  WHATSAPP_BACKFILL_CONFIRMATION,
  assertWhatsAppBackfillConfirmation,
  assertWhatsAppBackfillDryRunSafe,
  assertWhatsAppBackfillExecuteAllowed,
  buildWhatsAppBackfillExecuteReport,
  flattenWhatsAppBackfillRecords,
  planWhatsAppBackfillRecordUpdate,
  type WhatsAppBackfillExecutableRecord,
  type WhatsAppBackfillUpdatePlan,
} from "../src/channels/whatsappBackfillExecute.js";

type Options = {
  json: boolean;
  tenant?: string;
  limit: number;
  includeSamples: boolean;
  riskReport: boolean;
  execute: boolean;
  confirm?: string;
};

const REQUIRED_COLUMNS: Record<string, string[]> = {
  Contact: ["channel", "provider", "channelAccountId", "externalUserHash", "externalUserRef", "legacyWaId"],
  Conversation: ["channel", "provider", "channelAccountId", "externalUserHash", "externalUserRef", "legacyWaId"],
  ConversationRuntimeState: ["channel", "provider", "channelAccountId", "externalUserHash", "externalUserRef", "legacyWaId"],
  InboundMessage: ["channel", "provider", "channelAccountId", "externalUserHash", "externalUserRef", "legacyWaId"],
  OutboundMessage: ["channel", "provider", "channelAccountId", "externalUserHash", "externalUserRef", "legacyWaId"],
  Lead: ["channel", "provider", "channelAccountId", "externalUserHash", "externalUserRef", "legacyWaId"],
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    json: false,
    limit: 20,
    includeSamples: false,
    riskReport: false,
    execute: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    switch (current) {
      case "--json":
        options.json = true;
        break;
      case "--tenant":
      case "--client-key":
        if (!next || next.startsWith("--")) throw new Error(`${current} exige um valor`);
        options.tenant = next;
        index += 1;
        break;
      case "--limit": {
        if (!next || next.startsWith("--")) throw new Error("--limit exige um valor");
        const parsed = Number(next);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
          throw new Error(`--limit inválido: ${next}`);
        }
        options.limit = parsed;
        index += 1;
        break;
      }
      case "--include-samples":
        options.includeSamples = true;
        break;
      case "--risk-report":
        options.riskReport = true;
        break;
      case "--execute":
        options.execute = true;
        break;
      case "--confirm":
        if (!next || next.startsWith("--")) throw new Error("--confirm exige um valor");
        options.confirm = next;
        index += 1;
        break;
      default:
        throw new Error(`flag não reconhecida: ${current}`);
    }
  }

  return options;
}

function loadEnv() {
  const appDir = path.resolve(process.cwd(), "apps/whatsapp-agent");
  const envPath = process.cwd().endsWith("apps/whatsapp-agent")
    ? path.join(process.cwd(), ".env")
    : path.join(appDir, ".env");
  dotenv.config({ path: envPath });
}

function emptyRecords<T extends WhatsAppBackfillRecord>(): Record<BackfillModelName, T[]> {
  return {
    conversations: [],
    runtimeStates: [],
    inboundMessages: [],
    outboundMessages: [],
    leads: [],
    contacts: [],
  };
}

function printDryRun(report: ReturnType<typeof buildWhatsAppBackfillDryRunReport>) {
  console.log(JSON.stringify(report, null, 2));
}

function printExecute(report: ReturnType<typeof buildWhatsAppBackfillExecuteReport>) {
  console.log(JSON.stringify(report, null, 2));
}

async function loadBackfillClients(prisma: PrismaClient, tenant?: string) {
  const clientsWhere = tenant ? { clientKey: tenant } : {};
  const clients = await prisma.client.findMany({
    where: clientsWhere,
    select: {
      id: true,
      clientKey: true,
      phoneNumbers: {
        select: {
          phoneNumberId: true,
        },
      },
    },
  });

  if (tenant && clients.length === 0) {
    throw new Error(`tenant não encontrado: ${tenant}`);
  }

  const tenants = await getTenants();
  const tenantConfigByKey = new Map(Object.entries(tenants));
  const backfillClients: WhatsAppBackfillClient[] = clients.map((client) => ({
    id: client.id,
    clientKey: client.clientKey,
    phoneNumberIds: client.phoneNumbers.map((phone) => phone.phoneNumberId),
    tenantConfigMetaPhoneNumberId: tenantConfigByKey.get(client.clientKey)?.metaPhoneNumberId ?? null,
  }));

  return {
    clients,
    backfillClients,
    clientIds: clients.map((client) => client.id),
    clientMap: new Map(clients.map((client) => [client.id, client.clientKey])),
  };
}

async function loadDryRunRecords(
  prisma: PrismaClient,
  clientIds: string[],
  clientMap: Map<string, string>,
  tenant?: string
) {
  const scopedWhere = tenant ? { clientId: { in: clientIds } } : {};
  const leadWhere = tenant ? { tenantId: { in: clientIds } } : {};
  const records = emptyRecords<WhatsAppBackfillRecord>();

  const [conversations, runtimeStates, inboundMessages, outboundMessages, leads, contacts] = await Promise.all([
    prisma.conversation.findMany({
      where: scopedWhere,
      select: { id: true, clientId: true, waId: true, phoneNumberId: true },
    }),
    prisma.conversationRuntimeState.findMany({
      where: scopedWhere,
      select: { id: true, clientId: true, waId: true },
    }),
    prisma.inboundMessage.findMany({
      where: scopedWhere,
      select: { id: true, clientId: true, waId: true, phoneNumberId: true },
    }),
    prisma.outboundMessage.findMany({
      where: scopedWhere,
      select: { id: true, clientId: true, waId: true, phoneNumberId: true },
    }),
    prisma.lead.findMany({
      where: leadWhere,
      select: { id: true, tenantId: true, waId: true },
    }),
    prisma.contact.findMany({
      where: scopedWhere,
      select: { id: true, clientId: true, waId: true },
    }),
  ]);

  records.conversations = conversations.map((record) => ({
    model: "conversations",
    id: record.id,
    clientId: record.clientId,
    clientKey: clientMap.get(record.clientId),
    waId: record.waId,
    phoneNumberId: record.phoneNumberId,
  }));
  records.runtimeStates = runtimeStates.map((record) => ({
    model: "runtimeStates",
    id: record.id,
    clientId: record.clientId,
    clientKey: clientMap.get(record.clientId),
    waId: record.waId,
  }));
  records.inboundMessages = inboundMessages.map((record) => ({
    model: "inboundMessages",
    id: record.id,
    clientId: record.clientId,
    clientKey: clientMap.get(record.clientId),
    waId: record.waId,
    phoneNumberId: record.phoneNumberId,
  }));
  records.outboundMessages = outboundMessages.map((record) => ({
    model: "outboundMessages",
    id: record.id,
    clientId: record.clientId,
    clientKey: clientMap.get(record.clientId),
    waId: record.waId,
    phoneNumberId: record.phoneNumberId,
  }));
  records.leads = leads.map((record) => ({
    model: "leads",
    id: record.id,
    clientId: record.tenantId,
    clientKey: clientMap.get(record.tenantId),
    waId: record.waId,
  }));
  records.contacts = contacts.map((record) => ({
    model: "contacts",
    id: record.id,
    clientId: record.clientId,
    clientKey: clientMap.get(record.clientId),
    waId: record.waId,
  }));

  return records;
}

async function assertMultichannelColumnsAvailable(prisma: PrismaClient) {
  const tableNames = Object.keys(REQUIRED_COLUMNS).map((table) => `'${table}'`).join(",");
  const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string; column_name: string }>>(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name IN (${tableNames})
  `);
  const available = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missing: string[] = [];

  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    for (const column of columns) {
      if (!available.has(`${table}.${column}`)) {
        missing.push(`${table}.${column}`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `multichannel columns not available; apply staging migration first. missing=${missing.join(",")}`
    );
  }
}

async function loadExecutableRecords(
  prisma: PrismaClient,
  clientIds: string[],
  clientMap: Map<string, string>,
  tenant?: string
) {
  const scopedWhere = tenant ? { clientId: { in: clientIds } } : {};
  const leadWhere = tenant ? { tenantId: { in: clientIds } } : {};
  const records = emptyRecords<WhatsAppBackfillExecutableRecord>();
  const selectMultichannel = {
    channel: true,
    provider: true,
    channelAccountId: true,
    externalUserHash: true,
    externalUserRef: true,
    legacyWaId: true,
  };

  const [conversations, runtimeStates, inboundMessages, outboundMessages, leads, contacts] = await Promise.all([
    prisma.conversation.findMany({
      where: scopedWhere,
      select: { id: true, clientId: true, waId: true, phoneNumberId: true, ...selectMultichannel },
    }),
    prisma.conversationRuntimeState.findMany({
      where: scopedWhere,
      select: { id: true, clientId: true, waId: true, ...selectMultichannel },
    }),
    prisma.inboundMessage.findMany({
      where: scopedWhere,
      select: { id: true, clientId: true, waId: true, phoneNumberId: true, ...selectMultichannel },
    }),
    prisma.outboundMessage.findMany({
      where: scopedWhere,
      select: { id: true, clientId: true, waId: true, phoneNumberId: true, ...selectMultichannel },
    }),
    prisma.lead.findMany({
      where: leadWhere,
      select: { id: true, tenantId: true, waId: true, ...selectMultichannel },
    }),
    prisma.contact.findMany({
      where: scopedWhere,
      select: { id: true, clientId: true, waId: true, ...selectMultichannel },
    }),
  ]);

  records.conversations = conversations.map((record) => ({
    model: "conversations",
    id: record.id,
    clientId: record.clientId,
    clientKey: clientMap.get(record.clientId),
    waId: record.waId,
    phoneNumberId: record.phoneNumberId,
    ...selectExisting(record),
  }));
  records.runtimeStates = runtimeStates.map((record) => ({
    model: "runtimeStates",
    id: record.id,
    clientId: record.clientId,
    clientKey: clientMap.get(record.clientId),
    waId: record.waId,
    ...selectExisting(record),
  }));
  records.inboundMessages = inboundMessages.map((record) => ({
    model: "inboundMessages",
    id: record.id,
    clientId: record.clientId,
    clientKey: clientMap.get(record.clientId),
    waId: record.waId,
    phoneNumberId: record.phoneNumberId,
    ...selectExisting(record),
  }));
  records.outboundMessages = outboundMessages.map((record) => ({
    model: "outboundMessages",
    id: record.id,
    clientId: record.clientId,
    clientKey: clientMap.get(record.clientId),
    waId: record.waId,
    phoneNumberId: record.phoneNumberId,
    ...selectExisting(record),
  }));
  records.leads = leads.map((record) => ({
    model: "leads",
    id: record.id,
    clientId: record.tenantId,
    clientKey: clientMap.get(record.tenantId),
    waId: record.waId,
    ...selectExisting(record),
  }));
  records.contacts = contacts.map((record) => ({
    model: "contacts",
    id: record.id,
    clientId: record.clientId,
    clientKey: clientMap.get(record.clientId),
    waId: record.waId,
    ...selectExisting(record),
  }));

  return records;
}

function selectExisting(record: {
  channel?: string | null;
  provider?: string | null;
  channelAccountId?: string | null;
  externalUserHash?: string | null;
  externalUserRef?: string | null;
  legacyWaId?: string | null;
}) {
  return {
    channel: record.channel,
    provider: record.provider,
    channelAccountId: record.channelAccountId,
    externalUserHash: record.externalUserHash,
    externalUserRef: record.externalUserRef,
    legacyWaId: record.legacyWaId,
  };
}

async function applyPlans(prisma: PrismaClient, plans: WhatsAppBackfillUpdatePlan[]) {
  const updates = plans.filter((plan) => plan.action === "update" && plan.updateData);
  const tableByModel: Record<BackfillModelName, string> = {
    conversations: "Conversation",
    runtimeStates: "ConversationRuntimeState",
    inboundMessages: "InboundMessage",
    outboundMessages: "OutboundMessage",
    leads: "Lead",
    contacts: "Contact",
  };
  const uuidIdModels = new Set<BackfillModelName>([
    "conversations",
    "inboundMessages",
    "outboundMessages",
    "contacts",
  ]);
  const allowedFields = new Set([
    "channel",
    "provider",
    "channelAccountId",
    "externalUserHash",
    "externalUserRef",
    "legacyWaId",
  ]);

  await prisma.$transaction(async (tx) => {
    for (const plan of updates) {
      const entries = Object.entries(plan.updateData ?? {}).filter(([field]) => allowedFields.has(field));
      if (entries.length === 0) continue;
      const setClause = entries.map(([field], index) => `"${field}" = $${index + 1}`).join(", ");
      const values = entries.map(([, value]) => value);
      const idParamIndex = values.length + 1;
      const idPredicate = uuidIdModels.has(plan.model)
        ? `"id" = $${idParamIndex}::uuid`
        : `"id" = $${idParamIndex}`;
      await tx.$executeRawUnsafe(
        `UPDATE "${tableByModel[plan.model]}" SET ${setClause} WHERE ${idPredicate}`,
        ...values,
        plan.recordId
      );
    }
  });
}

async function main() {
  loadEnv();
  const startedAtMs = Date.now();
  const options = parseArgs(process.argv.slice(2));
  assertWhatsAppBackfillExecuteAllowed(process.env, options.execute);
  assertWhatsAppBackfillConfirmation(options.confirm, options.execute);

  const prisma = new PrismaClient();

  try {
    const { backfillClients, clientIds, clientMap } = await loadBackfillClients(prisma, options.tenant);
    const dryRunRecords = await loadDryRunRecords(prisma, clientIds, clientMap, options.tenant);
    const dryRunReport = buildWhatsAppBackfillDryRunReport({
      clients: backfillClients,
      records: dryRunRecords,
      conversationIdentityKeys: buildConversationIdentityKeys(dryRunRecords.conversations, backfillClients),
      tenant: options.tenant ?? null,
      limit: options.limit,
      includeSamples: options.includeSamples,
      includeRiskReport: options.riskReport,
    });

    if (!options.execute) {
      printDryRun(dryRunReport);
      return;
    }

    assertWhatsAppBackfillDryRunSafe(dryRunReport);
    await assertMultichannelColumnsAvailable(prisma);

    const executableRecords = await loadExecutableRecords(prisma, clientIds, clientMap, options.tenant);
    const clientsById = new Map(backfillClients.map((client) => [client.id, client]));
    const plans = flattenWhatsAppBackfillRecords(executableRecords).map((record) =>
      planWhatsAppBackfillRecordUpdate(record, clientsById.get(record.clientId))
    );
    const preflightReport = buildWhatsAppBackfillExecuteReport({
      plans,
      execute: true,
      tenant: options.tenant ?? null,
      startedAtMs,
      sampleLimit: options.limit,
    });

    if (!preflightReport.ok) {
      printExecute(preflightReport);
      throw new Error(
        `backfill abortado: conflicts=${preflightReport.totals.conflicts} missing=${preflightReport.totals.missing}`
      );
    }

    await applyPlans(prisma, plans);
    const report = buildWhatsAppBackfillExecuteReport({
      plans,
      execute: true,
      tenant: options.tenant ?? null,
      startedAtMs,
      sampleLimit: options.limit,
    });
    printExecute(report);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
