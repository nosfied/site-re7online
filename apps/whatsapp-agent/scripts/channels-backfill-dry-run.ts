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
  type WhatsAppBackfillDryRunReport,
} from "../src/channels/whatsappBackfillDryRun.js";

type Options = {
  json: boolean;
  tenant?: string;
  limit: number;
  includeSamples: boolean;
  riskReport: boolean;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    json: false,
    limit: 20,
    includeSamples: false,
    riskReport: false,
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

function emptyRecords(): Record<BackfillModelName, WhatsAppBackfillRecord[]> {
  return {
    conversations: [],
    runtimeStates: [],
    inboundMessages: [],
    outboundMessages: [],
    leads: [],
    contacts: [],
  };
}

function printText(report: WhatsAppBackfillDryRunReport) {
  console.log("WhatsApp multichannel backfill dry-run");
  console.log(`generatedAt: ${report.generatedAt}`);
  console.log(`tenant: ${report.filters.tenant ?? "all"}`);
  console.log(`ok: ${report.ok}`);
  console.log("counts:");
  for (const [key, value] of Object.entries(report.counts)) {
    console.log(`  ${key}: ${value}`);
  }
  console.log("resolvable:");
  for (const [key, value] of Object.entries(report.resolvable)) {
    console.log(`  ${key}: ${value}`);
  }
  console.log("missingChannelAccountId:");
  for (const [key, value] of Object.entries(report.missingChannelAccountId)) {
    console.log(`  ${key}: ${value}`);
  }
  console.log("risks:");
  for (const [key, value] of Object.entries(report.risks)) {
    console.log(`  ${key}: ${value}`);
  }
  if (report.samples.length > 0) {
    console.log("samples:");
    for (const sample of report.samples) {
      console.log(
        `  ${sample.model}:${sample.recordId} ${sample.action} account=${sample.channelAccountId ?? "missing"} wa=${sample.waIdHash ?? "missing"}`
      );
    }
  }
  if (report.conflicts.length > 0) {
    console.log(`conflicts: ${report.conflicts.length} (use --json for details)`);
  }
  if (report.riskByTenant && report.riskByTenant.length > 0) {
    console.log("riskByTenant:");
    for (const tenant of report.riskByTenant) {
      console.log(
        `  ${tenant.tenantKey}: ${tenant.recommendation} resolution=${tenant.channelAccountResolution}`
      );
      if (tenant.warnings.length > 0) {
        console.log(`    warnings: ${tenant.warnings.join(", ")}`);
      }
      for (const [model, counts] of Object.entries(tenant.models)) {
        console.log(
          `    ${model}: missingChannelAccountId=${counts.missingChannelAccountId} multipleChannelAccounts=${counts.multipleChannelAccounts}`
        );
      }
    }
  }
}

async function main() {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const clientsWhere = options.tenant ? { clientKey: options.tenant } : {};
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

    if (options.tenant && clients.length === 0) {
      throw new Error(`tenant não encontrado: ${options.tenant}`);
    }

    const clientIds = clients.map((client) => client.id);
    const scopedWhere = options.tenant ? { clientId: { in: clientIds } } : {};
    const leadWhere = options.tenant ? { tenantId: { in: clientIds } } : {};
    const clientMap = new Map(clients.map((client) => [client.id, client.clientKey]));
    const tenants = await getTenants();
    const tenantConfigByKey = new Map(Object.entries(tenants));
    const backfillClients: WhatsAppBackfillClient[] = clients.map((client) => ({
      id: client.id,
      clientKey: client.clientKey,
      phoneNumberIds: client.phoneNumbers.map((phone) => phone.phoneNumberId),
      tenantConfigMetaPhoneNumberId: tenantConfigByKey.get(client.clientKey)?.metaPhoneNumberId ?? null,
    }));

    const [
      conversations,
      runtimeStates,
      inboundMessages,
      outboundMessages,
      leads,
      contacts,
    ] = await Promise.all([
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

    const records = emptyRecords();
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

    const report = buildWhatsAppBackfillDryRunReport({
      clients: backfillClients,
      records,
      conversationIdentityKeys: buildConversationIdentityKeys(records.conversations, backfillClients),
      tenant: options.tenant ?? null,
      limit: options.limit,
      includeSamples: options.includeSamples,
      includeRiskReport: options.riskReport,
    });

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printText(report);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
