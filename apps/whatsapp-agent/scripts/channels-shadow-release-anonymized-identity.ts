#!/usr/bin/env tsx
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { getTenants } from "../src/config/tenantConfig.js";
import type { WhatsAppBackfillClient } from "../src/channels/whatsappBackfillDryRun.js";
import type { WhatsAppBackfillExecutableRecord } from "../src/channels/whatsappBackfillExecute.js";
import {
  planWhatsAppShadowRepairCandidate,
  shouldLoadWhatsAppShadowRepairCandidate,
} from "../src/channels/whatsappShadowRepairMissing.js";
import {
  WHATSAPP_SHADOW_RELEASE_CONFIRMATION,
  assertWhatsAppShadowReleaseConfirmation,
  assertWhatsAppShadowReleaseReportSafe,
  buildWhatsAppShadowReleaseReport,
  planWhatsAppShadowReleaseRecord,
  type WhatsAppShadowReleaseCollisionRecord,
  type WhatsAppShadowReleasePlan,
} from "../src/channels/whatsappShadowReleaseAnonymizedIdentity.js";

type Options = {
  json: boolean;
  tenant?: string;
  execute: boolean;
  confirm?: string;
};

function parseArgs(argv: string[]): Options {
  const options: Options = { json: false, execute: false };

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
      case "--dry-run":
        options.execute = false;
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
  if (tenant && clients.length === 0) throw new Error(`tenant não encontrado: ${tenant}`);

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
    clientsById: new Map(backfillClients.map((client) => [client.id, client])),
  };
}

async function loadActiveMissingCandidates(
  prisma: PrismaClient,
  clientIds: string[],
  clientMap: Map<string, string>
) {
  const selectMultichannel = {
    channel: true,
    provider: true,
    channelAccountId: true,
    externalUserHash: true,
    externalUserRef: true,
    legacyWaId: true,
  };
  const [conversations, leads] = await Promise.all([
    prisma.conversation.findMany({
      where: {
        clientId: { in: clientIds },
        OR: [{ channel: null }, { channel: "whatsapp" }],
      },
      select: { id: true, clientId: true, waId: true, phoneNumberId: true, ...selectMultichannel },
    }),
    prisma.lead.findMany({
      where: {
        tenantId: { in: clientIds },
        OR: [{ channel: null }, { channel: "whatsapp" }],
      },
      select: { id: true, tenantId: true, waId: true, ...selectMultichannel },
    }),
  ]);

  const records: WhatsAppBackfillExecutableRecord[] = [
    ...conversations.map((record) => ({
      model: "conversations" as const,
      id: record.id,
      clientId: record.clientId,
      clientKey: clientMap.get(record.clientId),
      waId: record.waId,
      phoneNumberId: record.phoneNumberId,
      ...selectExisting(record),
    })),
    ...leads.map((record) => ({
      model: "leads" as const,
      id: record.id,
      clientId: record.tenantId,
      clientKey: clientMap.get(record.tenantId),
      waId: record.waId,
      ...selectExisting(record),
    })),
  ];

  return records.filter(shouldLoadWhatsAppShadowRepairCandidate);
}

async function findReleasePlans(
  prisma: PrismaClient,
  candidates: WhatsAppBackfillExecutableRecord[],
  clientsById: Map<string, WhatsAppBackfillClient>
) {
  const plans: WhatsAppShadowReleasePlan[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const repairPlan = planWhatsAppShadowRepairCandidate(candidate, clientsById.get(candidate.clientId));
    if (repairPlan.action !== "update" || !repairPlan.updateData?.channelAccountId || !repairPlan.updateData.externalUserHash) {
      continue;
    }

    const rows: WhatsAppShadowReleaseCollisionRecord[] = candidate.model === "conversations"
      ? (await prisma.conversation.findMany({
          where: {
            clientId: candidate.clientId,
            channel: "whatsapp",
            provider: "meta",
            channelAccountId: repairPlan.updateData.channelAccountId,
            externalUserHash: repairPlan.updateData.externalUserHash,
            NOT: { id: candidate.id },
          },
          select: {
            id: true,
            waId: true,
            channel: true,
            provider: true,
            channelAccountId: true,
            externalUserHash: true,
            externalUserRef: true,
            legacyWaId: true,
            deletedAt: true,
            anonymizedAt: true,
          },
        })).map((record) => ({
          model: "conversations" as const,
          recordId: record.id,
          tenantKey: candidate.clientKey,
          ...record,
        }))
      : (await prisma.lead.findMany({
          where: {
            tenantId: candidate.clientId,
            channel: "whatsapp",
            provider: "meta",
            channelAccountId: repairPlan.updateData.channelAccountId,
            externalUserHash: repairPlan.updateData.externalUserHash,
            NOT: { id: candidate.id },
          },
          select: {
            id: true,
            waId: true,
            channel: true,
            provider: true,
            channelAccountId: true,
            externalUserHash: true,
            externalUserRef: true,
            legacyWaId: true,
          },
        })).map((record) => ({
          model: "leads" as const,
          recordId: record.id,
          tenantKey: candidate.clientKey,
          ...record,
        }));

    for (const row of rows) {
      const key = `${row.model}:${row.recordId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      plans.push(planWhatsAppShadowReleaseRecord(row, {
        model: candidate.model as "conversations" | "leads",
        recordId: candidate.id,
      }));
    }
  }

  return plans;
}

function printHuman(report: ReturnType<typeof buildWhatsAppShadowReleaseReport>) {
  console.log(
    `shadow release ok=${report.ok} execute=${report.execute} checked=${report.totals.checked} released=${report.totals.released} alreadyReleased=${report.totals.alreadyReleased} skipped=${report.totals.skipped} conflicts=${report.totals.conflicts}`
  );
  if (report.plans.length > 0) console.log(JSON.stringify({ plans: report.plans }, null, 2));
}

async function applyPlans(prisma: PrismaClient, plans: WhatsAppShadowReleasePlan[]) {
  const releases = plans.filter((plan) => plan.action === "release");
  await prisma.$transaction(async (tx) => {
    for (const plan of releases) {
      if (plan.model === "conversations") {
        await tx.conversation.update({
          where: { id: plan.recordId },
          data: {
            channelAccountId: null,
            externalUserHash: null,
            externalUserRef: null,
            legacyWaId: null,
          },
        });
      } else {
        await tx.lead.update({
          where: { id: plan.recordId },
          data: {
            channelAccountId: null,
            externalUserHash: null,
            externalUserRef: null,
            legacyWaId: null,
          },
        });
      }
    }
  });
}

async function main() {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));
  assertWhatsAppShadowReleaseConfirmation(options.confirm, options.execute);
  if (!options.tenant) throw new Error("--tenant é obrigatório para release direcionado");

  const prisma = new PrismaClient();
  try {
    const { clientIds, clientMap, clientsById } = await loadClients(prisma, options.tenant);
    const candidates = await loadActiveMissingCandidates(prisma, clientIds, clientMap);
    const plans = await findReleasePlans(prisma, candidates, clientsById);
    const report = buildWhatsAppShadowReleaseReport({
      plans,
      tenant: options.tenant,
      execute: options.execute,
    });

    if (!report.ok) {
      if (options.json) console.log(JSON.stringify(report, null, 2));
      else printHuman(report);
      throw new Error("release bloqueado por plano inseguro");
    }

    if (options.execute) {
      assertWhatsAppShadowReleaseReportSafe(report);
      await applyPlans(prisma, plans);
    }

    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
