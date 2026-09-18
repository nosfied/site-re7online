#!/usr/bin/env tsx
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  buildDemo9614RepairPlan,
  DEMO_9614_TARGETS,
  stableHash,
  type Demo9614Graph,
} from "../src/identity/demo9614RepairPlanner.js";

type Options = {
  dryRun: boolean;
  json: boolean;
  snapshotDir: string | null;
};

function parseArgs(argv: string[]): Options {
  const options: Options = { dryRun: false, json: false, snapshotDir: null };
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    switch (current) {
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--snapshot-dir":
        if (!next || next.startsWith("--")) throw new Error("--snapshot-dir exige um valor");
        options.snapshotDir = next;
        index += 1;
        break;
      default:
        throw new Error(`flag nao reconhecida: ${current}`);
    }
  }
  if (!options.dryRun) {
    throw new Error("Este utilitario aceita somente --dry-run. Repair real nao esta implementado aqui.");
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

function databaseTarget() {
  const value = process.env.DATABASE_URL;
  if (!value) return null;
  const url = new URL(value);
  return {
    host: url.hostname,
    port: url.port || "5432",
    database: url.pathname.replace(/^\//, ""),
    user: decodeURIComponent(url.username),
  };
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function payloadHas9614(value: unknown) {
  return JSON.stringify(value ?? {}).includes("9614");
}

async function loadGraph(prisma: PrismaClient): Promise<Demo9614Graph & { snapshots: Record<string, unknown> }> {
  const t = DEMO_9614_TARGETS;
  const client = await prisma.client.findUniqueOrThrow({
    where: { clientKey: t.tenantKey },
    select: { id: true, clientKey: true, status: true },
  });
  const clientId = client.id;

  const contacts = await prisma.contact.findMany({
    where: { clientId, id: { in: [t.primaryContactId, t.secondaryContactId] } },
    select: {
      id: true,
      clientId: true,
      waId: true,
      channel: true,
      provider: true,
      channelAccountId: true,
      externalUserHash: true,
      externalUserRef: true,
      legacyWaId: true,
      lifecycle: true,
      operationallyExcludedAt: true,
    },
    orderBy: { id: "asc" },
  });

  const leads = await prisma.lead.findMany({
    where: {
      tenantId: clientId,
      OR: [{ id: t.primaryLeadId }, { contactChannelIdentityId: t.metaIdentityId }],
    },
    select: {
      id: true,
      tenantId: true,
      waId: true,
      waIdCanonical: true,
      phone: true,
      channel: true,
      provider: true,
      channelAccountId: true,
      externalUserHash: true,
      externalUserRef: true,
      legacyWaId: true,
      contactChannelIdentityId: true,
    },
    orderBy: { id: "asc" },
  });

  const identities = await prisma.contactChannelIdentity.findMany({
    where: {
      clientId,
      OR: [
        { id: t.metaIdentityId },
        { contactId: { in: [t.primaryContactId, t.secondaryContactId] } },
      ],
    },
    select: {
      id: true,
      clientId: true,
      contactId: true,
      channel: true,
      provider: true,
      channelAccountId: true,
      externalUserHash: true,
      externalUserRef: true,
      legacyWaId: true,
    },
    orderBy: { id: "asc" },
  });

  const relatedHashes = identities.map((identity) => identity.externalUserHash).filter(Boolean);
  const relatedRefs = Array.from(
    new Set(
      [
        t.webSessionIdentityWaId,
        t.webSessionModernWaId,
        ...contacts.flatMap((contact) => [contact.waId, contact.externalUserRef, contact.legacyWaId]),
        ...leads.flatMap((lead) => [lead.waId, lead.waIdCanonical, lead.phone, lead.externalUserRef, lead.legacyWaId]),
      ].filter(Boolean) as string[]
    )
  );
  const conversationWhere = {
    clientId,
    OR: [
      { waId: { in: relatedRefs } },
      { waIdCanonical: { in: relatedRefs } },
      { legacyWaId: { in: relatedRefs } },
      { externalUserRef: { in: relatedRefs } },
      { externalUserHash: { in: relatedHashes } },
    ],
  };

  const conversations = await prisma.conversation.findMany({
    where: conversationWhere,
    select: {
      id: true,
      waId: true,
      waIdCanonical: true,
      channel: true,
      provider: true,
      channelAccountId: true,
      externalUserHash: true,
      externalUserRef: true,
      legacyWaId: true,
      closedAt: true,
      deletedAt: true,
      anonymizedAt: true,
      departmentId: true,
    },
    orderBy: { updatedAt: "desc" },
  });
  const openConversations = conversations
    .filter((conversation) => !conversation.closedAt && !conversation.deletedAt && !conversation.anonymizedAt)
    .map((conversation) => ({ id: conversation.id }));

  const runtimeStates = await prisma.conversationRuntimeState.findMany({
    where: conversationWhere,
    select: {
      id: true,
      waId: true,
      waIdCanonical: true,
      channel: true,
      provider: true,
      channelAccountId: true,
      externalUserHash: true,
      externalUserRef: true,
      legacyWaId: true,
      status: true,
      mode: true,
      closedAt: true,
      departmentId: true,
      queueId: true,
      assignedUserId: true,
    },
    orderBy: { updatedAt: "desc" },
  });
  const openRuntimeStates = runtimeStates.filter((state) => !state.closedAt && state.status !== "CLOSED");

  const campaign = await prisma.campaign.findUnique({
    where: { id: t.historicalCampaignId },
    select: {
      id: true,
      clientId: true,
      status: true,
      totalRecipients: true,
      sentCount: true,
      blockedCount: true,
    },
  });

  const campaignEvents = await prisma.event.findMany({
    where: {
      clientId,
      OR: [
        { messageId: { contains: t.historicalCampaignId } },
        { requestId: { contains: t.historicalCampaignId } },
      ],
    },
    select: {
      id: true,
      waId: true,
      waIdCanonical: true,
      messageId: true,
      requestId: true,
      eventName: true,
      payloadJson: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const campaign9614Events = campaignEvents.filter(
    (event) =>
      event.waId?.endsWith("9614") ||
      event.waIdCanonical?.endsWith("9614") ||
      payloadHas9614(event.payloadJson)
  );
  const campaign9614OutboundCount = await prisma.outboundMessage.count({
    where: {
      clientId,
      waIdCanonical: { contains: "9614" },
      OR: [
        { messageId: { contains: t.historicalCampaignId } },
        { requestId: { contains: t.historicalCampaignId } },
      ],
    },
  });

  const campaign9614ProviderCallCount = campaign9614Events.filter((event) =>
    ["campaign.message.provider_accepted", "campaign.message.sent", "meta.usage.estimated", "meta.usage.updated"].includes(
      event.eventName
    )
  ).length;
  const campaign9614BillingCount = campaign9614Events.filter((event) =>
    event.eventName.startsWith("billing.")
  ).length;
  const campaign9614ImportBlockedCount = campaign9614Events.filter(
    (event) =>
      event.eventName === "campaign.recipient.import_blocked" &&
      JSON.stringify(event.payloadJson ?? {}).includes("identity_conflict")
  ).length;

  const optOutEvents = await prisma.event.findMany({
    where: {
      clientId,
      waIdCanonical: { contains: "9614" },
      eventName: { in: ["contact.opt_out.recorded", "contact.opt_out.revoked"] },
    },
    select: { id: true, eventName: true, waId: true, waIdCanonical: true, payloadJson: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const latestOptOutEvent = optOutEvents.at(-1);
  const effectiveOptOut = latestOptOutEvent?.eventName === "contact.opt_out.recorded";

  const consentRecords = await prisma.contactConsent.count({
    where: { clientId, OR: [{ contactId: { in: [t.primaryContactId, t.secondaryContactId] } }, { leadId: t.primaryLeadId }] },
  });
  const consents = await prisma.contactConsent.findMany({
    where: { clientId, OR: [{ contactId: { in: [t.primaryContactId, t.secondaryContactId] } }, { leadId: t.primaryLeadId }] },
    select: {
      id: true,
      contactId: true,
      leadId: true,
      purpose: true,
      status: true,
      acceptedAt: true,
      revokedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const graph: Demo9614Graph = {
    client,
    contacts,
    leads,
    identities,
    openConversations,
    openRuntimeStates,
    campaign,
    campaign9614OutboundCount,
    campaign9614ProviderCallCount,
    campaign9614BillingCount,
    campaign9614ImportBlockedCount,
    consentRecords,
    effectiveOptOut,
  };

  return {
    ...graph,
    snapshots: {
      contacts,
      leads,
      identities,
      conversations,
      runtimeStates,
      campaign,
      campaignEvents,
      optOutEvents,
      consents,
    },
  };
}

function printText(report: Record<string, unknown>) {
  console.log("DEMO 9614 identity repair dry-run");
  console.log(`dryRun: ${String(report.dryRun)}`);
  console.log(`ok: ${String(report.ok)}`);
  console.log(`blockers: ${(report.blockers as string[]).length}`);
  for (const blocker of report.blockers as string[]) console.log(`  - ${blocker}`);
  console.log(`runtimeImpact: ${String(report.runtimeImpact)}`);
  console.log(`canonicalContact: ${DEMO_9614_TARGETS.primaryContactId}`);
  console.log(`canonicalLead: ${DEMO_9614_TARGETS.primaryLeadId}`);
  console.log(`outboundDelta: 0`);
  console.log(`billingDelta: 0`);
  console.log(`campaignHistoryDelta: 0`);
  console.log(`optOutHistoryDelta: 0`);
}

async function writeSnapshotPackage(snapshotDir: string, report: Record<string, unknown>) {
  await fs.mkdir(snapshotDir, { recursive: true });
  const reportPath = path.join(snapshotDir, "demo-9614-dry-run-report.json");
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const manifest = {
    generatedAt: report.generatedAt,
    reportPath,
    reportSha256: stableHash(report),
  };
  await fs.writeFile(path.join(snapshotDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  loadEnv();
  const prisma = new PrismaClient();
  try {
    const graph = await loadGraph(prisma);
    const plan = buildDemo9614RepairPlan(graph);
    const preHashes = {
      graph: stableHash({
        client: graph.client,
        contacts: graph.contacts,
        leads: graph.leads,
        identities: graph.identities,
        openConversations: graph.openConversations,
        openRuntimeStates: graph.openRuntimeStates,
        campaign: graph.campaign,
        campaign9614OutboundCount: graph.campaign9614OutboundCount,
        campaign9614ProviderCallCount: graph.campaign9614ProviderCallCount,
        campaign9614BillingCount: graph.campaign9614BillingCount,
        campaign9614ImportBlockedCount: graph.campaign9614ImportBlockedCount,
        consentRecords: graph.consentRecords,
        effectiveOptOut: graph.effectiveOptOut,
      }),
      snapshots: stableHash(graph.snapshots),
    };
    const report = jsonClone({
      generatedAt: new Date().toISOString(),
      dryRun: true,
      databaseTarget: databaseTarget(),
      targets: DEMO_9614_TARGETS,
      graphCounts: {
        contacts: graph.contacts.length,
        leads: graph.leads.length,
        channelIdentities: graph.identities.length,
        openConversations: graph.openConversations.length,
        openRuntimeStates: graph.openRuntimeStates.length,
        consentRecords: graph.consentRecords,
      },
      campaignChecks: {
        campaign9614OutboundCount: graph.campaign9614OutboundCount,
        campaign9614ProviderCallCount: graph.campaign9614ProviderCallCount,
        campaign9614BillingCount: graph.campaign9614BillingCount,
        campaign9614ImportBlockedCount: graph.campaign9614ImportBlockedCount,
      },
      ok: plan.ok,
      blockers: plan.blockers,
      runtimeImpact: plan.runtimeImpact,
      liveSelectors: plan.liveSelectors,
      liveReferencesToRelink: plan.liveReferencesToRelink,
      plannedActions: plan.plannedActions,
      expectedFinal: plan.expectedFinal,
      eligibility: plan.eligibility,
      entities: {
        primaryContact: plan.primaryContact,
        primaryLead: plan.primaryLead,
        secondaryContact: plan.secondaryContact,
        secondaryLead: plan.secondaryLead,
        metaIdentity: plan.metaIdentity,
      },
      snapshots: graph.snapshots,
      hashes: preHashes,
    });

    if (options.snapshotDir && plan.ok) {
      await writeSnapshotPackage(options.snapshotDir, report);
    }

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printText(report);
    }
    if (!plan.ok) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
