import { Prisma, PrismaClient } from "@prisma/client";
import { planCanonicalIdentityRepair, type IdentityRepairSnapshot } from "../src/crm/canonicalIdentityRepairPlan.js";
import { resolveCrmContactIdentity } from "../src/crm/crmContactUpsert.js";

const prisma = new PrismaClient();

const TARGET = {
  tenantKey: "demo-converta",
  primaryContactId: "e96d8299-b36f-4118-a406-f2a365c5630d",
  secondaryContactId: "97244912-0a78-48a7-8371-3c07b38dbf7b",
  survivingLeadId: "cmtvhkeo902u74s38b4pf9heg",
  duplicateLeadId: "cmta6bjio00jl4s045pf4rfna",
  metaIdentityId: "cmu44rnp700014s4qch0qm6lx",
};

const CANONICAL_PHONE_VARIANTS = ["558494786787", "5584994786787", "+55 84 9478-6787", "+55 84 99478-6787"];

function getMode() {
  const hasDryRun = process.argv.includes("--dry-run");
  const hasExecute = process.argv.includes("--execute");
  if (hasDryRun === hasExecute) {
    throw new Error("Run exactly one mode: --dry-run or --execute --confirm-demo-6787-repair.");
  }
  if (hasExecute && !process.argv.includes("--confirm-demo-6787-repair")) {
    throw new Error("Refusing mutation without --confirm-demo-6787-repair.");
  }
  return hasExecute ? "execute" : "dry-run";
}

function maskIdentity(value: string | null | undefined) {
  if (!value) return null;
  return value.length <= 4 ? `***${value}` : `***${value.slice(-4)}`;
}

function anonymizedIdentity(id: string) {
  return `anon:${id.slice(0, 12)}`;
}

type RepairDbClient = PrismaClient | Prisma.TransactionClient;

async function buildSnapshot(db: RepairDbClient) {
  const client = await db.client.findUnique({
    where: { clientKey: TARGET.tenantKey },
    select: { id: true, clientKey: true },
  });
  if (!client) throw new Error(`tenant_not_found:${TARGET.tenantKey}`);

  const contacts = await db.contact.findMany({
    where: { clientId: client.id, id: { in: [TARGET.primaryContactId, TARGET.secondaryContactId] } },
    select: { id: true, lifecycle: true, operationallyExcludedAt: true, waId: true },
    orderBy: { createdAt: "asc" },
  });
  const leads = await db.lead.findMany({
    where: { tenantId: client.id, id: { in: [TARGET.survivingLeadId, TARGET.duplicateLeadId] } },
    select: { id: true, status: true, contactChannelIdentityId: true },
    orderBy: { createdAt: "asc" },
  });
  const identities = await db.contactChannelIdentity.findMany({
    where: { clientId: client.id, contactId: { in: [TARGET.primaryContactId, TARGET.secondaryContactId] } },
    select: { id: true, contactId: true, provider: true, channelAccountId: true },
    orderBy: { createdAt: "asc" },
  });
  const [openConversationCount, outboundCount, billingEventCount, campaignEventCount] = await Promise.all([
    db.conversationRuntimeState.count({
      where: { clientId: client.id, waIdCanonical: { endsWith: "6787" }, status: { not: "CLOSED" } },
    }),
    db.outboundMessage.count({
      where: { clientId: client.id, OR: [{ waId: { endsWith: "6787" } }, { waIdCanonical: { endsWith: "6787" } }] },
    }),
    db.event.count({
      where: {
        clientId: client.id,
        eventName: "billing.active_message.delivered",
        OR: [{ waId: { endsWith: "6787" } }, { waIdCanonical: { endsWith: "6787" } }],
      },
    }),
    db.event.count({
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

  return { client, snapshot };
}

async function assertCanonicalResolution(db: RepairDbClient, clientId: string) {
  const results = [];
  for (const phone of CANONICAL_PHONE_VARIANTS) {
    const resolved = await resolveCrmContactIdentity(db, { clientId, phone });
    if (resolved.contact?.id !== TARGET.primaryContactId) {
      throw new Error(`post_repair_contact_resolution_failed:${phone}:${resolved.contact?.id ?? "null"}`);
    }
    if (resolved.lead?.id !== TARGET.survivingLeadId) {
      throw new Error(`post_repair_lead_resolution_failed:${phone}:${resolved.lead?.id ?? "null"}`);
    }
    results.push({
      phone: maskIdentity(String(phone)),
      waIdCanonical: maskIdentity(resolved.waIdCanonical),
      contactId: resolved.contact.id,
      leadId: resolved.lead.id,
    });
  }
  return results;
}

async function executeRepair() {
  return prisma.$transaction(
    async (tx) => {
      const { client, snapshot: beforeSnapshot } = await buildSnapshot(tx);
      const beforePlan = planCanonicalIdentityRepair(beforeSnapshot);
      if (!beforePlan.ready) {
        throw new Error(`repair_not_ready:${beforePlan.blockers.join(",")}`);
      }

      const metaIdentity = await tx.contactChannelIdentity.findFirst({
        where: {
          id: TARGET.metaIdentityId,
          clientId: client.id,
          provider: "meta",
          contactId: { in: [TARGET.primaryContactId, TARGET.secondaryContactId] },
        },
        select: { id: true, contactId: true },
      });
      if (!metaIdentity) throw new Error("target_meta_identity_not_found");

      const duplicateContact = await tx.contact.findFirst({
        where: { id: TARGET.secondaryContactId, clientId: client.id },
        select: { id: true, operationallyExcludedAt: true, waId: true },
      });
      if (!duplicateContact) throw new Error("secondary_contact_missing");

      const duplicateLead = await tx.lead.findFirst({
        where: { id: TARGET.duplicateLeadId, tenantId: client.id },
        select: { id: true, contactChannelIdentityId: true, waId: true },
      });
      if (!duplicateLead) throw new Error("duplicate_lead_missing");

      const survivorLead = await tx.lead.findFirst({
        where: { id: TARGET.survivingLeadId, tenantId: client.id },
        select: { id: true, contactChannelIdentityId: true },
      });
      if (!survivorLead) throw new Error("surviving_lead_missing");

      const contactAnon = anonymizedIdentity(TARGET.secondaryContactId);
      const leadAnon = anonymizedIdentity(TARGET.duplicateLeadId);
      const [contactAnonCollision, leadAnonCollision] = await Promise.all([
        tx.contact.count({ where: { clientId: client.id, waId: contactAnon, id: { not: TARGET.secondaryContactId } } }),
        tx.lead.count({ where: { tenantId: client.id, waId: leadAnon, id: { not: TARGET.duplicateLeadId } } }),
      ]);
      if (contactAnonCollision > 0) throw new Error("secondary_contact_anonymized_identity_collision");
      if (leadAnonCollision > 0) throw new Error("duplicate_lead_anonymized_identity_collision");

      const now = new Date();
      const movedIdentity =
        metaIdentity.contactId === TARGET.primaryContactId
          ? { count: 0 }
          : await tx.contactChannelIdentity.updateMany({
              where: { id: TARGET.metaIdentityId, clientId: client.id, contactId: TARGET.secondaryContactId },
              data: { contactId: TARGET.primaryContactId },
            });

      const neutralizedContact = await tx.contact.updateMany({
        where: { id: TARGET.secondaryContactId, clientId: client.id },
        data: {
          waId: contactAnon,
          channel: null,
          provider: null,
          channelAccountId: null,
          externalUserHash: null,
          externalUserRef: null,
          legacyWaId: null,
          operationallyExcludedAt: duplicateContact.operationallyExcludedAt ?? now,
        },
      });

      const neutralizedLead = await tx.lead.updateMany({
        where: { id: TARGET.duplicateLeadId, tenantId: client.id },
        data: {
          waId: leadAnon,
          waIdCanonical: leadAnon,
          phone: leadAnon,
          channel: null,
          provider: null,
          channelAccountId: null,
          externalUserHash: null,
          externalUserRef: null,
          legacyWaId: null,
          contactChannelIdentityId: null,
        },
      });

      const refreshedSurvivorLead = await tx.lead.updateMany({
        where: { id: TARGET.survivingLeadId, tenantId: client.id },
        data: { contactChannelIdentityId: TARGET.metaIdentityId },
      });

      const { snapshot: afterSnapshot } = await buildSnapshot(tx);
      const afterPlan = planCanonicalIdentityRepair(afterSnapshot);
      if (!afterPlan.ready || !afterPlan.noop) {
        throw new Error(`post_repair_plan_not_noop:${JSON.stringify(afterPlan)}`);
      }

      const canonicalResolution = await assertCanonicalResolution(tx, client.id);
      const [secondaryIdentityCount, openConversationCount, outboundCount, activeBillingCount, receptiveBillingCount] =
        await Promise.all([
          tx.contactChannelIdentity.count({ where: { clientId: client.id, contactId: TARGET.secondaryContactId } }),
          tx.conversationRuntimeState.count({
            where: {
              clientId: client.id,
              waIdCanonical: { endsWith: "6787" },
              status: { not: "CLOSED" },
              mode: "HUMAN",
              handoffStatus: "ACTIVE",
            },
          }),
          tx.outboundMessage.count({
            where: { clientId: client.id, OR: [{ waId: { endsWith: "6787" } }, { waIdCanonical: { endsWith: "6787" } }] },
          }),
          tx.event.count({
            where: {
              clientId: client.id,
              eventName: "billing.active_message.delivered",
              OR: [{ waId: { endsWith: "6787" } }, { waIdCanonical: { endsWith: "6787" } }],
            },
          }),
          tx.event.count({
            where: {
              clientId: client.id,
              eventName: "billing.receptive_session.created",
              OR: [{ waId: { endsWith: "6787" } }, { waIdCanonical: { endsWith: "6787" } }],
            },
          }),
        ]);

      if (secondaryIdentityCount !== 0) throw new Error(`secondary_identity_not_empty:${secondaryIdentityCount}`);
      if (openConversationCount !== 1) throw new Error(`open_conversation_not_preserved:${openConversationCount}`);
      if (outboundCount !== beforeSnapshot.outboundCount) throw new Error("outbound_count_changed");
      if (activeBillingCount !== 1) throw new Error(`active_billing_count_unexpected:${activeBillingCount}`);
      if (receptiveBillingCount !== 1) throw new Error(`receptive_billing_count_unexpected:${receptiveBillingCount}`);

      return {
        committed: true,
        beforePlan,
        afterPlan,
        updates: {
          movedIdentity: movedIdentity.count,
          neutralizedContact: neutralizedContact.count,
          neutralizedLead: neutralizedLead.count,
          refreshedSurvivorLead: refreshedSurvivorLead.count,
        },
        checks: {
          canonicalResolution,
          secondaryIdentityCount,
          openConversationCount,
          outboundCount,
          activeBillingCount,
          receptiveBillingCount,
        },
      };
    },
    { timeout: 20_000, maxWait: 10_000 }
  );
}

async function main() {
  const mode = getMode();
  const { snapshot } = await buildSnapshot(prisma);
  const plan = planCanonicalIdentityRepair(snapshot);

  if (mode === "dry-run") {
    console.log(JSON.stringify({ dryRun: true, target: TARGET, snapshot, plan }, null, 2));
    if (!plan.ready) process.exitCode = 2;
    return;
  }

  if (!plan.ready) {
    process.exitCode = 2;
    return;
  }
  const result = await executeRepair();
  console.log(JSON.stringify({ execute: true, target: TARGET, snapshot, plan, result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
