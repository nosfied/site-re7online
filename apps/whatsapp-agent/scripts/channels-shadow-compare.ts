#!/usr/bin/env tsx
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { getTenants } from "../src/config/tenantConfig.js";
import {
  buildWhatsAppShadowCompareReport,
  WHATSAPP_SHADOW_COMPARE_REQUIRED_COLUMNS,
} from "../src/channels/whatsappShadowCompare.js";
import type {
  BackfillModelName,
  WhatsAppBackfillClient,
} from "../src/channels/whatsappBackfillDryRun.js";
import type { WhatsAppBackfillExecutableRecord } from "../src/channels/whatsappBackfillExecute.js";

type Options = {
  json: boolean;
  tenant?: string;
  limit: number;
  includeSamples: boolean;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    json: false,
    limit: 20,
    includeSamples: false,
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

function emptyRecords(): Record<BackfillModelName, WhatsAppBackfillExecutableRecord[]> {
  return {
    conversations: [],
    runtimeStates: [],
    inboundMessages: [],
    outboundMessages: [],
    leads: [],
    contacts: [],
  };
}

async function assertMultichannelColumnsAvailable(prisma: PrismaClient) {
  const tableNames = Object.keys(WHATSAPP_SHADOW_COMPARE_REQUIRED_COLUMNS)
    .map((table) => `'${table}'`)
    .join(",");
  const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string; column_name: string }>>(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name IN (${tableNames})
  `);
  const available = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missing: string[] = [];

  for (const [table, columns] of Object.entries(WHATSAPP_SHADOW_COMPARE_REQUIRED_COLUMNS)) {
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

async function loadClients(prisma: PrismaClient, tenant?: string) {
  const clients = await prisma.client.findMany({
    where: tenant ? { clientKey: tenant } : {},
    select: {
      id: true,
      clientKey: true,
      phoneNumbers: {
        select: { phoneNumberId: true },
      },
    },
  });
  if (tenant && clients.length === 0) {
    throw new Error(`tenant não encontrado: ${tenant}`);
  }

  const tenants = await getTenants();
  const backfillClients: WhatsAppBackfillClient[] = clients.map((client) => ({
    id: client.id,
    clientKey: client.clientKey,
    phoneNumberIds: client.phoneNumbers.map((phone) => phone.phoneNumberId),
    tenantConfigMetaPhoneNumberId: tenants[client.clientKey]?.metaPhoneNumberId ?? null,
  }));

  return {
    clientIds: clients.map((client) => client.id),
    clientMap: new Map(clients.map((client) => [client.id, client.clientKey])),
    backfillClients,
  };
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

async function loadRecords(
  prisma: PrismaClient,
  clientIds: string[],
  clientMap: Map<string, string>,
  tenant?: string
) {
  const scopedWhere = tenant ? { clientId: { in: clientIds } } : {};
  const leadWhere = tenant ? { tenantId: { in: clientIds } } : {};
  const records = emptyRecords();
  const selectMultichannel = {
    channel: true,
    provider: true,
    channelAccountId: true,
    externalUserHash: true,
    externalUserRef: true,
    legacyWaId: true,
  };

  const [conversations, runtimeStates, inboundMessages, outboundMessages, leads] = await Promise.all([
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

  return records;
}

function printHuman(report: ReturnType<typeof buildWhatsAppShadowCompareReport>) {
  console.log(`shadow compare ok=${report.ok} checked=${report.counts.checked} matched=${report.counts.matched} missing=${report.counts.missing} mismatched=${report.counts.mismatched}`);
  for (const [model, summary] of Object.entries(report.byModel)) {
    if (summary.checked === 0) continue;
    console.log(`${model}: checked=${summary.checked} matched=${summary.matched} missing=${summary.missing} mismatched=${summary.mismatched}`);
  }
  if (report.samples.length > 0) {
    console.log(JSON.stringify({ samples: report.samples }, null, 2));
  }
}

async function main() {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    await assertMultichannelColumnsAvailable(prisma);
    const { clientIds, clientMap, backfillClients } = await loadClients(prisma, options.tenant);
    const records = await loadRecords(prisma, clientIds, clientMap, options.tenant);
    const report = buildWhatsAppShadowCompareReport({
      clients: backfillClients,
      records,
      tenant: options.tenant ?? null,
      limit: options.limit,
      includeSamples: options.includeSamples,
    });
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHuman(report);
    }
    if (report.counts.mismatched > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
