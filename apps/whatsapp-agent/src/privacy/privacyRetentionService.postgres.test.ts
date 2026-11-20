import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { buildPrivateCampaignSeedFields } from "../campaigns/campaignSeedPrivacy.js";
import { runtimeStorage } from "../storage/runtimeStorage.js";
import { withHybridConversationIdentityLock } from "../channels/hybridConversationIdentityLock.js";
import {
  anonymizeDataSubject,
  previewDataSubjectAnonymization,
  DATA_SUBJECT_RUNTIME_CLEANUP_EVENT,
} from "./privacyRetentionService.js";

const url = new URL(process.env.DATABASE_URL || "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55781");
assert.equal(url.pathname, "/retention_lab");
assert.equal(env.STORAGE_MODE, "postgres");
assert.equal(env.CONV_STATE_READ_SOURCE, "postgres");
assert.ok(process.env.CHANNEL_ACCOUNT_SECRET_KEY);

const db = new PrismaClient();
const clientIds: string[] = [];
const modern = "5584999990001";
const legacy = "558499990001";

async function fixture(label: string) {
  const clientId = randomUUID();
  clientIds.push(clientId);
  const clientKey = `privacy-${label}-${clientId}`;
  await db.client.create({ data: { id: clientId, clientKey, name: `Privacy ${label}` } });
  const channelAccount = await db.channelAccount.create({ data: {
    clientId, channel: "whatsapp", provider: "meta", channelAccountId: `phone-${label}`,
    status: "pending", tokenStatus: "configured", enabled: false, automationEnabled: false,
    runtimeEnabled: false, inboundPersistenceEnabled: false, outboundEnabled: false,
    aiEnabled: false, handoffEnabled: false,
  } });
  const contact = await db.contact.create({ data: {
    clientId, waId: modern, name: "Titular Sintetico", channel: "whatsapp", provider: "meta",
    channelAccountId: channelAccount.channelAccountId, legacyWaId: legacy,
  } });
  const identities = await Promise.all([modern, legacy, "5584999990002"].map((waId, index) =>
    db.contactChannelIdentity.create({ data: {
      clientId, contactId: contact.id, channel: "whatsapp", provider: "meta",
      channelAccountId: channelAccount.channelAccountId, externalUserHash: `synthetic-hash-${label}-${index}`,
      externalUserRef: `encrypted-synthetic-${index}`, legacyWaId: waId, displayName: "Titular Sintetico",
    } })));
  const lead = await db.lead.create({ data: {
    tenantId: clientId, waId: modern, waIdCanonical: modern, phone: modern,
    name: "Titular Sintetico", email: "subject@example.invalid", company: "Synthetic",
    contactChannelIdentityId: identities[0].id,
  } });
  await db.leadNote.create({ data: { tenantId: clientId, leadId: lead.id, body: "nota pessoal sintetica" } });
  const conversations = await Promise.all([modern, legacy].map((waId) => db.conversation.create({ data: {
    clientId, waId, waIdCanonical: waId, channel: "whatsapp", provider: "meta",
    channelAccountId: channelAccount.channelAccountId,
  } })));
  await db.conversationRuntimeState.createMany({ data: [
    { id: randomUUID(), clientId, waId: modern, waIdCanonical: modern, conversationKey: `${clientKey}:${modern}`,
      mode: "HUMAN", status: "WAITING", channel: "whatsapp", provider: "meta", channelAccountId: channelAccount.channelAccountId },
    { id: randomUUID(), clientId, waId: legacy, waIdCanonical: legacy, conversationKey: `${clientKey}:${legacy}`,
      mode: "BOT", status: "WAITING", channel: "whatsapp", provider: "meta", channelAccountId: channelAccount.channelAccountId },
  ] });
  await Promise.all(conversations.map((conversation, index) => db.message.create({ data: {
    conversationId: conversation.id, waId: index ? legacy : modern, direction: index ? "OUTBOUND" : "INBOUND",
    type: "TEXT", status: "SENT", bodyText: "mensagem pessoal sintetica", messageId: randomUUID(),
  } })));
  await db.inboundMessage.create({ data: { clientId, waId: modern, waIdCanonical: modern,
    messageId: randomUUID(), type: "TEXT", allowlistHit: true, bodyText: "inbound pessoal" } });
  await db.outboundMessage.createMany({ data: [modern, legacy].map((waId) => ({ clientId, waId,
    waIdCanonical: waId, messageId: randomUUID(), type: "TEXT" as const, status: "SENT" as const,
    bodyText: "outbound pessoal" })) });
  const campaign = await db.campaign.create({ data: { clientId, name: "Synthetic", templateName: "synthetic",
    status: "draft", totalRecipients: 1 } });
  await db.event.createMany({ data: [
    { clientId, waId: modern, waIdCanonical: modern, eventName: "synthetic.subject.history",
      requestId: randomUUID(), payloadJson: { personal: true } },
    { clientId, eventName: "campaign.seed.saved", messageId: campaign.id, requestId: randomUUID(),
      payloadJson: { campaignId: campaign.id, leadIds: [lead.id], ...buildPrivateCampaignSeedFields({ clientId, waIds: [modern] }) } },
  ] });
  const protocol = await db.completedServiceSnapshot.create({ data: {
    clientId, conversationId: conversations[0].id, cycleId: randomUUID(), protocol: `PROTO-${label}`,
    closedAt: new Date(),
  } });
  return { clientId, clientKey, contact, lead, identities, conversations, channelAccount, protocol };
}

test.after(async () => {
  for (const clientId of clientIds) {
    await db.message.deleteMany({ where: { conversation: { clientId } } });
    await db.event.deleteMany({ where: { clientId } });
    await db.completedServiceSnapshot.deleteMany({ where: { clientId } });
    await db.inboundMessage.deleteMany({ where: { clientId } });
    await db.outboundMessage.deleteMany({ where: { clientId } });
    await db.leadNote.deleteMany({ where: { tenantId: clientId } });
    await db.lead.deleteMany({ where: { tenantId: clientId } });
    await db.contactChannelIdentity.deleteMany({ where: { clientId } });
    await db.contact.deleteMany({ where: { clientId } });
    await db.conversationRuntimeState.deleteMany({ where: { clientId } });
    await db.conversation.deleteMany({ where: { clientId } });
    await db.campaign.deleteMany({ where: { clientId } });
    await db.channelAccount.deleteMany({ where: { clientId } });
    await db.client.delete({ where: { id: clientId } });
  }
  await db.$disconnect();
});

test("subject graph covers both WhatsApp variants atomically, preserves tenant/gates/protocol and emits PII-free verified cleanup", async () => {
  const f = await fixture("integrated");
  const other = await fixture("other-tenant");
  const byContact = await previewDataSubjectAnonymization(db, { clientId: f.clientId, contactId: f.contact.id });
  const byLead = await previewDataSubjectAnonymization(db, { clientId: f.clientId, leadId: f.lead.id });
  assert.equal(byContact.ok, true); assert.equal(byLead.ok, true);
  assert.deepEqual(byContact.counts, byLead.counts);
  assert.equal(byContact.counts.conversations, 2);
  assert.equal(byContact.counts.runtimeStates, 2);
  assert.equal(byContact.counts.contactChannelIdentities, 3);

  const result = await anonymizeDataSubject(db, { clientId: f.clientId, clientKey: f.clientKey,
    contactId: f.contact.id, actorId: "synthetic-admin", requestId: randomUUID(),
    confirmation: "ANONIMIZAR TITULAR" });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal("cleanup" in result && result.cleanup?.state, "verified");
  assert.equal(await db.conversation.count({ where: { clientId: f.clientId, deletedAt: null, anonymizedAt: null } }), 0);
  assert.equal(await db.conversationRuntimeState.count({ where: { clientId: f.clientId } }), 0);
  assert.equal(await db.conversation.count({ where: { clientId: other.clientId, deletedAt: null, anonymizedAt: null } }), 2);
  assert.equal((await db.completedServiceSnapshot.findUniqueOrThrow({ where: { clientId_cycleId: {
    clientId: f.clientId, cycleId: f.protocol.cycleId } } })).protocol, f.protocol.protocol);
  const account = await db.channelAccount.findUniqueOrThrow({ where: { id: f.channelAccount.id } });
  assert.deepEqual([account.enabled, account.automationEnabled, account.runtimeEnabled,
    account.inboundPersistenceEnabled, account.outboundEnabled, account.aiEnabled, account.handoffEnabled],
  [false, false, false, false, false, false, false]);
  const receipt = await db.event.findFirstOrThrow({ where: { clientId: f.clientId,
    eventName: DATA_SUBJECT_RUNTIME_CLEANUP_EVENT } });
  assert.equal((receipt.payloadJson as { state: string }).state, "verified");
  const privacyEvents = await db.event.findMany({ where: { clientId: f.clientId,
    eventName: { in: [DATA_SUBJECT_RUNTIME_CLEANUP_EVENT, "privacy.subject.anonymized"] } } });
  const serialized = JSON.stringify(privacyEvents);
  for (const pii of [modern, legacy, "5584999990002", "Titular Sintetico", "subject@example.invalid"]) {
    assert.equal(serialized.includes(pii), false);
  }
});

test("real hybrid lock makes concurrent activity a clean denial without mutation", async () => {
  const f = await fixture("concurrent");
  let entered!: () => void; let release!: () => void;
  const ready = new Promise<void>((resolve) => { entered = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  const blocker = withHybridConversationIdentityLock(db, { clientId: f.clientId, waId: modern }, async (tx) => {
    await tx.conversation.update({ where: { id: f.conversations[0].id }, data: { lastInboundAt: new Date() } });
    await tx.inboundMessage.create({ data: { clientId: f.clientId, waId: modern, waIdCanonical: modern,
      messageId: randomUUID(), type: "TEXT", allowlistHit: true, bodyText: "inbound concorrente" } });
    await tx.outboundMessage.create({ data: { clientId: f.clientId, waId: modern, waIdCanonical: modern,
      messageId: randomUUID(), type: "TEXT", status: "SENT", bodyText: "outbound concorrente" } });
    entered(); await held;
  });
  await ready;
  const pending = anonymizeDataSubject(db, { clientId: f.clientId, clientKey: f.clientKey,
    contactId: f.contact.id, actorId: "synthetic-admin", requestId: randomUUID(),
    confirmation: "ANONIMIZAR TITULAR" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  release(); await blocker;
  assert.deepEqual(await pending, { ok: false, error: "concurrent_subject_change" });
  assert.equal(await db.conversation.count({ where: { clientId: f.clientId, anonymizedAt: null } }), 2);
  assert.equal(await db.event.count({ where: { clientId: f.clientId, eventName: DATA_SUBJECT_RUNTIME_CLEANUP_EVENT } }), 0);
});

test("ambiguous cross-contact identity is denied before mutation", async () => {
  const f = await fixture("ambiguous");
  const otherContact = await db.contact.create({ data: {
    clientId: f.clientId, waId: "5584999990099", name: "Outro titular",
  } });
  await db.contactChannelIdentity.create({ data: {
    clientId: f.clientId, contactId: otherContact.id, channel: "whatsapp", provider: "meta",
    channelAccountId: f.channelAccount.channelAccountId,
    externalUserHash: "synthetic-ambiguous-hash", legacyWaId: modern,
  } });

  await assert.rejects(
    anonymizeDataSubject(db, { clientId: f.clientId, clientKey: f.clientKey,
      contactId: f.contact.id, actorId: "synthetic-admin", requestId: randomUUID(),
      confirmation: "ANONIMIZAR TITULAR" }),
    /ambiguous_subject_identity/,
  );
  assert.equal(await db.conversation.count({ where: { clientId: f.clientId, anonymizedAt: null } }), 2);
  assert.equal(await db.event.count({ where: { clientId: f.clientId, eventName: DATA_SUBJECT_RUNTIME_CLEANUP_EVENT } }), 0);
});
