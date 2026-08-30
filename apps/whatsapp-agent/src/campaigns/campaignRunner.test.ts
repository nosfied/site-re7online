import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { MessageStatus } from "@prisma/client";
import { getPrisma } from "../db.js";
import { startCampaignRun } from "./campaignRunner.js";

process.env.APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "campaign-runner-test-secret";
process.env.WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "campaign-runner-test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "campaign-runner-test-phone";

const prisma = getPrisma();

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("Timed out waiting for condition");
}

async function cleanup(clientId: string) {
  await prisma.event.deleteMany({ where: { clientId } });
  await prisma.outboundMessage.deleteMany({ where: { clientId } });
  await prisma.campaign.deleteMany({ where: { clientId } });
  await prisma.template.deleteMany({ where: { clientId } });
  await prisma.contact.deleteMany({ where: { clientId } });
  await prisma.tenantOperationalConfig.deleteMany({ where: { clientId } });
  await prisma.client.deleteMany({ where: { id: clientId } });
}

test("campaign runner skips operationally excluded recipients at send-time", async (t) => {
  const clientId = crypto.randomUUID();
  const clientKey = `campaign-runner-${process.pid}-${Date.now()}`;
  const templateName = `campaign_runner_${Date.now()}`;
  const recipients = ["5541991100101", "5541991100102", "5541991100103"];
  await cleanup(clientId).catch(() => undefined);
  t.after(() => {
    void cleanup(clientId).catch(() => undefined);
  });

  await prisma.client.create({
    data: {
      id: clientId,
      clientKey,
      name: "Campaign Runner Test",
      profile: "business",
      features: { campaigns: true },
    },
  });
  await prisma.template.create({
    data: {
      clientId,
      name: templateName,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Aviso",
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      clientId,
      name: "Send-time exclusion",
      templateName,
      status: "sending",
      totalRecipients: recipients.length,
    },
  });
  await prisma.contact.create({
    data: {
      clientId,
      waId: recipients[1],
      channel: "whatsapp",
      provider: "meta",
      lifecycle: "ACTIVE",
      operationallyExcludedAt: new Date(),
    },
  });

  const originalFetch = globalThis.fetch;
  const metaRecipients: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      const payload = JSON.parse(String(init?.body ?? "{}")) as { to?: string };
      if (payload.to) metaRecipients.push(payload.to);
      return new Response(JSON.stringify({ messages: [{ id: `wamid.${crypto.randomUUID()}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const runId = startCampaignRun({
    campaignId: campaign.id,
    clientId,
    clientKey,
    name: campaign.name,
    templateName,
    waIds: recipients,
  });
  assert.ok(runId);

  await waitFor(async () => {
    const refreshed = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    return refreshed?.status === "completed";
  });

  const completed = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
  assert.equal(completed.sentCount, 2);
  assert.equal(completed.blockedCount, 1);
  assert.deepEqual(metaRecipients, [recipients[0], recipients[2]]);
  const excludedOutbound = await prisma.outboundMessage.count({
    where: { clientId, waId: recipients[1], status: MessageStatus.SENT },
  });
  assert.equal(excludedOutbound, 0);
  const blockedEvent = await prisma.event.findFirst({
    where: {
      clientId,
      eventName: "campaign.recipient.operationally_excluded",
      messageId: `campaign.${campaign.id}.2`,
    },
    select: { payloadJson: true },
  });
  assert.ok(blockedEvent);
  assert.equal(JSON.stringify(blockedEvent.payloadJson).includes(recipients[1]), false);
});

test("campaign runner blocks send-time when template effective category is not allowed", async (t) => {
  const clientId = crypto.randomUUID();
  const clientKey = `campaign-runner-category-${process.pid}-${Date.now()}`;
  const templateName = `campaign_runner_category_${Date.now()}`;
  const recipients = ["5541991100201"];
  await cleanup(clientId).catch(() => undefined);
  t.after(() => {
    void cleanup(clientId).catch(() => undefined);
  });

  await prisma.client.create({
    data: {
      id: clientId,
      clientKey,
      name: "Campaign Runner Category Test",
      profile: "business",
      features: { campaigns: true },
    },
  });
  const template = await prisma.template.create({
    data: {
      clientId,
      name: templateName,
      category: "MARKETING",
      submittedCategory: "UTILITY",
      wasRecategorized: true,
      language: "pt_BR",
      status: "approved",
      content: "Aviso",
    },
  });
  await prisma.tenantOperationalConfig.create({
    data: {
      clientId,
      schemaVersion: 1,
      config: { whatsappTemplatePolicy: { allowedCategories: ["UTILITY"] } },
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      clientId,
      name: "Send-time category policy",
      templateName,
      templateId: template.id,
      status: "sending",
      totalRecipients: recipients.length,
    },
  });

  const originalFetch = globalThis.fetch;
  let metaCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      metaCalls += 1;
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const runId = startCampaignRun({
    campaignId: campaign.id,
    clientId,
    clientKey,
    name: campaign.name,
    templateName,
    waIds: recipients,
  });
  assert.ok(runId);

  await waitFor(async () => {
    const refreshed = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    return refreshed?.status === "blocked";
  });

  const blocked = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
  assert.equal(blocked.sentCount, 0);
  assert.equal(blocked.blockedCount, 0);
  assert.equal(metaCalls, 0);
  assert.equal(await prisma.outboundMessage.count({ where: { clientId } }), 0);
  const blockedEvent = await prisma.event.findFirst({
    where: {
      clientId,
      eventName: "campaign.template.blocked",
      messageId: campaign.id,
    },
    select: { payloadJson: true },
  });
  assert.ok(blockedEvent);
  const payload = blockedEvent.payloadJson as Record<string, unknown>;
  assert.equal(payload.templateId, template.id);
  assert.equal(payload.templateCategory, "MARKETING");
  assert.equal(payload.reason, "template_category_not_allowed");
  assert.deepEqual(payload.allowedCategories, ["UTILITY"]);
});
