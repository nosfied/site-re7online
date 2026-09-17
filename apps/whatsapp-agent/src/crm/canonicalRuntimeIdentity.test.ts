import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { ensureCampaignOutboundCrmBootstrap } from "../campaigns/campaignOutboundConversation.js";
import { hashWhatsAppExternalUser } from "../channels/whatsappBackfillDryRun.js";
import { getPrisma } from "../db.js";
import { ensureLeadForConversationWithPrisma, upsertLeadFromCapture } from "./lead.service.js";
import { upsertCrmContact } from "./crmContactUpsert.js";

const prisma = getPrisma();

const MODERN_WA_ID = "5584994786787";
const LEGACY_WA_ID = "558494786787";

async function cleanup(clientIds: string[]) {
  await prisma.event.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.lead.deleteMany({ where: { tenantId: { in: clientIds } } });
  await prisma.contactChannelIdentity.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.contact.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
}

async function createClient(clientId: string, suffix: string) {
  await prisma.client.create({
    data: {
      id: clientId,
      clientKey: `canonical-runtime-${suffix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      name: `Canonical Runtime ${suffix}`,
      profile: "business",
      features: { crm: true, campaigns: true },
    },
  });
}

test("Meta inbound and campaign bootstrap reuse one 13/12-digit CRM identity graph", async (t) => {
  const clientId = crypto.randomUUID();
  await cleanup([clientId]).catch(() => undefined);
  t.after(() => void cleanup([clientId]).catch(() => undefined));
  await createClient(clientId, "main");

  const manual = await upsertCrmContact(prisma, {
    clientId,
    input: { phone: MODERN_WA_ID, name: "Contato Canonico" },
    actorUserId: "test-owner",
    requestId: crypto.randomUUID(),
    source: "crm_manual",
  });

  const inboundLead = await ensureLeadForConversationWithPrisma(prisma, {
    tenantId: clientId,
    waId: LEGACY_WA_ID,
    name: "Contato Meta",
    phoneNumberId: "phone-test",
  });
  assert.equal(inboundLead.id, manual.leadId);
  const capturedLead = await upsertLeadFromCapture({
    tenantId: clientId,
    waId: LEGACY_WA_ID,
    service: "Atendimento",
    phoneNumberId: "phone-test",
  });
  assert.equal(capturedLead.id, manual.leadId);
  assert.equal(capturedLead.status, "QUALIFIED");

  const campaign = await ensureCampaignOutboundCrmBootstrap(prisma, {
    clientId,
    waId: LEGACY_WA_ID,
    waIdCanonical: LEGACY_WA_ID,
    phoneNumberId: "phone-test",
    conversationId: `conversation-${crypto.randomUUID()}`,
    campaignId: crypto.randomUUID(),
    campaignRunId: crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    templateName: "canonical_identity_test",
    source: "campaign",
  });

  assert.equal(campaign.contactId, manual.contactId);
  assert.equal(campaign.leadId, manual.leadId);
  assert.equal(await prisma.contact.count({ where: { clientId } }), 1);
  assert.equal(await prisma.lead.count({ where: { tenantId: clientId } }), 1);
  assert.equal(
    await prisma.contactChannelIdentity.count({
      where: { clientId, contactId: manual.contactId, channel: "whatsapp", provider: "meta" },
    }),
    1
  );
});

test("Meta inbound reuses Web Session contact and external-hash-only Lead", async (t) => {
  const clientId = crypto.randomUUID();
  await cleanup([clientId]).catch(() => undefined);
  t.after(() => void cleanup([clientId]).catch(() => undefined));
  await createClient(clientId, "web-session");

  const contact = await prisma.contact.create({
    data: {
      clientId,
      waId: `web-session-${crypto.randomUUID()}`,
      name: "Contato Web Session",
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: "web-session-test",
      lifecycle: "ACTIVE",
    },
  });
  await prisma.contactChannelIdentity.create({
    data: {
      clientId,
      contactId: contact.id,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: "web-session-test",
      externalUserHash: `web-session:${crypto.randomUUID()}`,
      externalUserRef: MODERN_WA_ID,
      legacyWaId: MODERN_WA_ID,
    },
  });
  const lead = await prisma.lead.create({
    data: {
      tenantId: clientId,
      waId: `external-hash-${crypto.randomUUID()}`,
      externalUserHash: hashWhatsAppExternalUser(MODERN_WA_ID),
      name: "Lead Web Session",
      status: "NEW",
    },
  });

  const resolved = await ensureLeadForConversationWithPrisma(prisma, {
    tenantId: clientId,
    waId: LEGACY_WA_ID,
    phoneNumberId: "phone-test",
  });

  assert.equal(resolved.id, lead.id);
  assert.equal(await prisma.contact.count({ where: { clientId } }), 1);
  assert.equal(await prisma.lead.count({ where: { tenantId: clientId } }), 1);
  assert.equal(
    await prisma.contactChannelIdentity.count({
      where: { clientId, contactId: contact.id, channel: "whatsapp", provider: "meta" },
    }),
    1
  );
});

test("canonical runtime identity resolution never crosses tenant boundaries", async (t) => {
  const firstClientId = crypto.randomUUID();
  const secondClientId = crypto.randomUUID();
  await cleanup([firstClientId, secondClientId]).catch(() => undefined);
  t.after(() => void cleanup([firstClientId, secondClientId]).catch(() => undefined));
  await createClient(firstClientId, "tenant-a");
  await createClient(secondClientId, "tenant-b");

  const first = await upsertCrmContact(prisma, {
    clientId: firstClientId,
    input: { phone: MODERN_WA_ID, name: "Tenant A" },
    actorUserId: "test-owner",
    requestId: crypto.randomUUID(),
    source: "crm_manual",
  });
  const secondLead = await ensureLeadForConversationWithPrisma(prisma, {
    tenantId: secondClientId,
    waId: LEGACY_WA_ID,
    phoneNumberId: "phone-test",
  });

  assert.notEqual(secondLead.id, first.leadId);
  assert.equal(await prisma.lead.count({ where: { tenantId: firstClientId } }), 1);
  assert.equal(await prisma.lead.count({ where: { tenantId: secondClientId } }), 1);
  assert.equal(await prisma.contact.count({ where: { clientId: secondClientId } }), 0);
});
