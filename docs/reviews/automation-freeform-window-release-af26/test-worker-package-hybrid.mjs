// Run with Node 20 and a synthetic, isolated PostgreSQL DATABASE_URL only.
// The package path is an extracted archive; this harness lives outside it.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = resolve(process.argv[2]);
const requirePackage = createRequire(pathToFileURL(root + "/apps/whatsapp-web-worker/package.json"));
const { PrismaClient, MessageStatus, MessageType } = requirePackage("@prisma/client");
const { prepareAcceptedCampaignReturnConversation } = await import(pathToFileURL(
  root + "/apps/whatsapp-web-worker/dist/whatsapp-agent/src/channels/inboundConversationIdentity.js"
));
const { ingestBaileysWebSessionMessage } = await import(pathToFileURL(
  root + "/apps/whatsapp-web-worker/dist/whatsapp-agent/src/web-session/webSessionInbound.js"
));

assert.match(process.env.DATABASE_URL ?? "", /re7_b9_synthetic/);
const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
const clientKey = `package-hybrid-${stamp}`;
const modern = "5541923456718";
const legacy = "554123456718";
const metaAccount = `meta-${stamp}`;
const webAccount = `web-${stamp}`;
try {
  const client = await prisma.client.create({ data: { clientKey, name: "Synthetic package test" } });
  const department = await prisma.department.create({ data: {
    clientId: client.id, name: "Synthetic service", slug: `synthetic-${stamp}`,
  } });
  const queue = await prisma.queue.create({ data: {
    clientId: client.id, departmentId: department.id, name: "Synthetic queue",
  } });
  await prisma.tenantMetaConfig.create({ data: {
    clientId: client.id, phoneNumberId: metaAccount, businessToken: "synthetic-only",
    wabaId: "synthetic-waba", rawPayload: { source: "fixture" },
  } });
  await prisma.waPhoneNumber.create({ data: {
    clientId: client.id, phoneNumberId: metaAccount, display: "554199995328",
  } });
  await prisma.tenantOperationalConfig.create({ data: {
    clientId: client.id,
    config: { webSessionAuthorization: {
      status: "AUTHORIZED", authorizedNumberCanonical: "554199995328",
    } },
  } });
  await prisma.channelAccount.create({ data: {
    clientId: client.id, channel: "whatsapp", provider: "web_session",
    channelAccountId: webAccount, enabled: true, runtimeEnabled: true,
    inboundPersistenceEnabled: true, status: "connected",
  } });
  const outbound = await prisma.outboundMessage.create({ data: {
    clientId: client.id, phoneNumberId: metaAccount, waId: modern,
    waIdCanonical: modern, channel: "whatsapp", provider: "meta",
    channelAccountId: metaAccount, type: MessageType.TEMPLATE,
    status: MessageStatus.SENT, messageId: `campaign.synthetic.${stamp}.1`,
    templateName: "synthetic_approved", metaMessageId: `wamid.synthetic.${stamp}`,
    rawPayload: {
      deliveryConversationPending: true, campaignId: `synthetic-${stamp}`,
      returnDestination: { type: "human_department", departmentId: department.id, queueId: queue.id },
    },
  } });
  const selected = await prepareAcceptedCampaignReturnConversation(prisma, {
    clientId: client.id, clientKey, waId: legacy, provider: "web_session",
    channelAccountId: webAccount, inboundAt: new Date(outbound.createdAt.getTime() + 2000),
  });
  assert.equal(selected.waId, modern);
  assert.equal(selected.reason, "resolved");
  const pre = await prisma.conversation.findUniqueOrThrow({
    where: { clientId_waId: { clientId: client.id, waId: modern } },
  });
  const preRuntime = await prisma.conversationRuntimeState.findUniqueOrThrow({
    where: { clientId_waId: { clientId: client.id, waId: modern } },
  });
  assert.equal(pre.windowIsOpen, false);
  assert.equal(pre.lastInboundAt, null);
  assert.equal(preRuntime.mode, "HUMAN");
  assert.equal(preRuntime.status, "WAITING");
  assert.equal(preRuntime.departmentId, department.id);
  assert.equal(preRuntime.queueId, queue.id);
  const ingested = await ingestBaileysWebSessionMessage({
    clientId: client.id, tenantKey: clientKey,
    channelAccountDbId: webAccount, channelAccountId: webAccount,
    message: {
      key: { id: `package-inbound-${stamp}`, remoteJid: `${legacy}@s.whatsapp.net`, fromMe: false },
      messageTimestamp: Math.floor(Date.now() / 1000) + 2,
      message: { conversation: "synthetic response" },
    },
  });
  assert.equal(ingested.action, "persisted", JSON.stringify(ingested));
  const after = await prisma.conversation.findUniqueOrThrow({
    where: { clientId_waId: { clientId: client.id, waId: modern } },
  });
  const runtime = await prisma.conversationRuntimeState.findUniqueOrThrow({
    where: { clientId_waId: { clientId: client.id, waId: modern } },
  });
  assert.equal(after.windowIsOpen, true);
  assert.ok(after.lastInboundAt);
  assert.equal(runtime.mode, "HUMAN");
  assert.equal(runtime.departmentId, department.id);
  assert.equal(runtime.queueId, queue.id);
  assert.equal(await prisma.conversation.count({ where: { clientId: client.id } }), 1);
  assert.equal(await prisma.conversationRuntimeState.count({ where: { clientId: client.id } }), 1);
  assert.equal(await prisma.inboundMessage.count({ where: { clientId: client.id, waId: modern } }), 1);
  assert.equal(await prisma.contact.count({ where: { clientId: client.id } }), 1);
  assert.equal(await prisma.lead.count({ where: { tenantId: client.id } }), 1);
  console.log("PACKAGE_HYBRID_RETURN_PASS");
} finally {
  await prisma.$disconnect();
}
