#!/usr/bin/env tsx
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { getTenants } from "../src/config/tenantConfig.js";
import type { WhatsAppBackfillClient } from "../src/channels/whatsappBackfillDryRun.js";
import type { WhatsAppBackfillExecutableRecord } from "../src/channels/whatsappBackfillExecute.js";
import {
  WHATSAPP_SHADOW_REPAIR_CONFIRMATION,
  assertWhatsAppShadowRepairConfirmation,
  assertWhatsAppShadowRepairReportSafe,
  buildWhatsAppShadowRepairReport,
  planWhatsAppShadowRepairCandidate,
  shouldLoadWhatsAppShadowRepairCandidate,
  type WhatsAppShadowRepairPlan,
} from "../src/channels/whatsappShadowRepairMissing.js";

type Options = {
  json: boolean;
  tenant?: string;
  execute: boolean;
  confirm?: string;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    json: false,
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
    clientsById: new Map(backfillClients.map((client) => [client.id, client])),
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

async function loadCandidates(prisma: PrismaClient, clientIds: string[], clientMap: Map<string, string>) {
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
        OR: [
          { channel: null },
          { channel: "whatsapp" },
        ],
      },
      select: { id: true, clientId: true, waId: true, phoneNumberId: true, ...selectMultichannel },
    }),
    prisma.lead.findMany({
      where: {
        tenantId: { in: clientIds },
        OR: [
          { channel: null },
          { channel: "whatsapp" },
        ],
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

function printHuman(report: ReturnType<typeof buildWhatsAppShadowRepairReport>) {
  console.log(
    `shadow repair ok=${report.ok} execute=${report.execute} checked=${report.totals.checked} updated=${report.totals.updated} alreadyFilled=${report.totals.alreadyFilled} conflicts=${report.totals.conflicts} missingExpectedFields=${report.totals.missingExpectedFields} skippedAnonymized=${report.totals.skippedAnonymized}`
  );
  if (report.plans.length > 0) {
    console.log(JSON.stringify({ plans: report.plans }, null, 2));
  }
}

async function applyPlans(prisma: PrismaClient, plans: WhatsAppShadowRepairPlan[]) {
  const updates = plans.filter((plan) => plan.action === "update" && plan.updateData);
  await prisma.$transaction(async (tx) => {
    for (const plan of updates) {
      const entries = Object.entries(plan.updateData ?? {});
      if (entries.length === 0) continue;
      const setClause = entries.map(([field], index) => `"${field}" = $${index + 1}`).join(", ");
      const values = entries.map(([, value]) => value);
      const table = plan.model === "conversations" ? "Conversation" : "Lead";
      const idPredicate = plan.model === "conversations"
        ? `"id" = $${values.length + 1}::uuid`
        : `"id" = $${values.length + 1}`;
      await tx.$executeRawUnsafe(
        `UPDATE "${table}" SET ${setClause} WHERE ${idPredicate}`,
        ...values,
        plan.recordId
      );
    }
  });
}

async function markIdentityConflicts(
  prisma: PrismaClient,
  plans: WhatsAppShadowRepairPlan[],
  candidates: WhatsAppBackfillExecutableRecord[]
) {
  const candidateByKey = new Map(candidates.map((candidate) => [`${candidate.model}:${candidate.id}`, candidate]));
  const checkedPlans: WhatsAppShadowRepairPlan[] = [];

  for (const plan of plans) {
    if (plan.action !== "update" || !plan.updateData) {
      checkedPlans.push(plan);
      continue;
    }
    const candidate = candidateByKey.get(`${plan.model}:${plan.recordId}`);
    const channelAccountId = plan.updateData.channelAccountId;
    const externalUserHash = plan.updateData.externalUserHash;
    if (!candidate || !channelAccountId || !externalUserHash) {
      checkedPlans.push(plan);
      continue;
    }

    const conflictRows = plan.model === "conversations"
      ? await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT "id"::text AS id
             FROM "Conversation"
            WHERE "clientId" = $1::uuid
              AND "channel" = 'whatsapp'
              AND "provider" = 'meta'
              AND "channelAccountId" = $2
              AND "externalUserHash" = $3
              AND "id" <> $4::uuid
            LIMIT 1`,
          candidate.clientId,
          channelAccountId,
          externalUserHash,
          plan.recordId
        )
      : await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT "id"::text AS id
             FROM "Lead"
            WHERE "tenantId" = $1::uuid
              AND "channel" = 'whatsapp'
              AND "provider" = 'meta'
              AND "channelAccountId" = $2
              AND "externalUserHash" = $3
              AND "id" <> $4
            LIMIT 1`,
          candidate.clientId,
          channelAccountId,
          externalUserHash,
          plan.recordId
        );

    if (conflictRows.length > 0) {
      checkedPlans.push({
        ...plan,
        action: "conflict",
        updateData: undefined,
        divergentFields: ["channelAccountId", "externalUserHash"],
        reason: "multichannel_identity_already_exists",
      });
      continue;
    }

    checkedPlans.push(plan);
  }

  return checkedPlans;
}

async function main() {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));
  assertWhatsAppShadowRepairConfirmation(options.confirm, options.execute);

  if (!options.tenant) {
    throw new Error("--tenant é obrigatório para repair direcionado");
  }

  const prisma = new PrismaClient();
  try {
    const { clientIds, clientMap, clientsById } = await loadClients(prisma, options.tenant);
    const candidates = await loadCandidates(prisma, clientIds, clientMap);
    const initialPlans = candidates.map((record) =>
      planWhatsAppShadowRepairCandidate(record, clientsById.get(record.clientId))
    );
    const plans = await markIdentityConflicts(prisma, initialPlans, candidates);
    const preflightReport = buildWhatsAppShadowRepairReport({
      plans,
      tenant: options.tenant,
      execute: options.execute,
    });

    if (!preflightReport.ok) {
      if (options.json) {
        console.log(JSON.stringify(preflightReport, null, 2));
      } else {
        printHuman(preflightReport);
      }
      throw new Error("repair bloqueado por plano inseguro");
    }

    if (options.execute) {
      assertWhatsAppShadowRepairReportSafe(preflightReport);
      await applyPlans(prisma, plans);
      if (options.json) {
        console.log(JSON.stringify(preflightReport, null, 2));
      } else {
        printHuman(preflightReport);
      }
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(preflightReport, null, 2));
    } else {
      printHuman(preflightReport);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
