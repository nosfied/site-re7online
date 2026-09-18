import { PrismaClient } from "@prisma/client";
import { planCanonicalIdentityRepair, type IdentityRepairSnapshot } from "../src/crm/canonicalIdentityRepairPlan.js";

const prisma = new PrismaClient();

const TARGET = {
  tenantKey: "demo-converta",
  primaryContactId: "e96d8299-b36f-4118-a406-f2a365c5630d",
  secondaryContactId: "97244912-0a78-48a7-8371-3c07b38dbf7b",
  survivingLeadId: "cmtvhkeo902u74s38b4pf9heg",
  duplicateLeadId: "cmta6bjio00jl4s045pf4rfna",
};

function requireDryRun() {
  const hasDryRun = process.argv.includes("--dry-run");
  const hasExecute = process.argv.includes("--execute");
  if (!hasDryRun || hasExecute) {
    throw new Error("This preparation script is read-only. Run with --dry-run; --execute is intentionally unsupported.");
  }
}

function maskIdentity(value: string | null | undefined) {
  if (!value) return null;
  return value.length <= 4 ? `***${value}` : `***${value.slice(-4)}`;
}

async function main() {
  requireDryRun();

  const client = await prisma.client.findUnique({
    where: { clientKey: TARGET.tenantKey },
    select: { id: true, clientKey: true },
  });
  if (!client) throw new Error(`tenant_not_found:${TARGET.tenantKey}`);

  const contacts = await prisma.contact.findMany({
    where: { clientId: client.id, id: { in: [TARGET.primaryContactId, TARGET.secondaryContactId] } },
    select: { id: true, lifecycle: true, operationallyExcludedAt: true },
    orderBy: { createdAt: "asc" },
  });
  const leads = await prisma.lead.findMany({
    where: { tenantId: client.id, id: { in: [TARGET.survivingLeadId, TARGET.duplicateLeadId] } },
    select: { id: true, status: true, contactChannelIdentityId: true },
    orderBy: { createdAt: "asc" },
  });
  const identities = await prisma.contactChannelIdentity.findMany({
    where: { clientId: client.id, contactId: { in: [TARGET.primaryContactId, TARGET.secondaryContactId] } },
    select: { id: true, contactId: true, provider: true, channelAccountId: true },
    orderBy: { createdAt: "asc" },
  });
  const [openConversationCount, outboundCount, billingEventCount, campaignEventCount] = await Promise.all([
    prisma.conversationRuntimeState.count({
      where: { clientId: client.id, waIdCanonical: { endsWith: "6787" }, status: { not: "CLOSED" } },
    }),
    prisma.outboundMessage.count({
      where: { clientId: client.id, OR: [{ waId: { endsWith: "6787" } }, { waIdCanonical: { endsWith: "6787" } }] },
    }),
    prisma.event.count({
      where: {
        clientId: client.id,
        eventName: "billing.active_message.delivered",
        OR: [{ waId: { endsWith: "6787" } }, { waIdCanonical: { endsWith: "6787" } }],
      },
    }),
    prisma.event.count({
      where: {
        clientId: client.id,
        eventName: { startsWith: "campaign." },
        OR: [{ waId: { endsWith: "6787" } }, { waIdCanonical: { endsWith: "6787" } }],
      },
    }),
  ]);

  const snapshot: IdentityRepairSnapshot = {
    tenantKey: client.clientKey,
    primaryContactId: TARGET.primaryContactId,
    secondaryContactId: TARGET.secondaryContactId,
    survivingLeadId: TARGET.survivingLeadId,
    duplicateLeadId: TARGET.duplicateLeadId,
    contacts: contacts.map((contact) => ({
      id: contact.id,
      role: contact.id === TARGET.primaryContactId ? "survivor" : "duplicate",
      identityCount: identities.filter((identity) => identity.contactId === contact.id).length,
      operationallyExcludedAt: contact.operationallyExcludedAt,
    })),
    leads: leads.map((lead) => ({
      id: lead.id,
      role: lead.id === TARGET.survivingLeadId ? "survivor" : "duplicate",
      status: lead.status,
      contactChannelIdentityId: lead.contactChannelIdentityId,
    })),
    channelIdentities: identities.map((identity) => ({
      id: identity.id,
      contactId: identity.contactId,
      provider: identity.provider,
      channelAccountId: maskIdentity(identity.channelAccountId) ?? "unknown",
      classification: "legitimate",
    })),
    outboundCount,
    billingEventCount,
    campaignEventCount,
    openConversationCount,
  };
  const plan = planCanonicalIdentityRepair(snapshot);

  console.log(JSON.stringify({ dryRun: true, target: TARGET, snapshot, plan }, null, 2));
  if (!plan.ready) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
