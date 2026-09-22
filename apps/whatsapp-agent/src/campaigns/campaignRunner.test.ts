import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { MessageStatus } from "@prisma/client";
import { getPrisma } from "../db.js";
import { startCampaignRun } from "./campaignRunner.js";
import { recordContactOptOut } from "./optOutRegistry.js";

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
  await prisma.conversationRuntimeState.deleteMany({ where: { clientId } });
  await prisma.conversation.deleteMany({ where: { clientId } });
  await prisma.queue.deleteMany({ where: { clientId } });
  await prisma.department.deleteMany({ where: { clientId } });
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
  assert.equal(await prisma.contact.count({ where: { clientId } }), 3);
  const excludedContact = await prisma.contact.findFirst({
    where: { clientId, waId: recipients[1] },
    select: { id: true },
  });
  assert.ok(excludedContact);
  assert.equal(await prisma.contactChannelIdentity.count({ where: { clientId, contactId: excludedContact.id } }), 0);
  assert.equal(await prisma.lead.count({ where: { tenantId: clientId, waId: recipients[1] } }), 0);
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
  assert.equal(await prisma.contact.count({ where: { clientId } }), 0);
  assert.equal(await prisma.contactChannelIdentity.count({ where: { clientId } }), 0);
  assert.equal(await prisma.lead.count({ where: { tenantId: clientId } }), 0);
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

test("campaign runner fails local operational preflight before Meta send", async (t) => {
  const clientId = crypto.randomUUID();
  const clientKey = `campaign-runner-preflight-${process.pid}-${Date.now()}`;
  const templateName = `campaign_runner_preflight_${Date.now()}`;
  const recipient = "5541991100301";
  await cleanup(clientId).catch(() => undefined);
  t.after(() => {
    void cleanup(clientId).catch(() => undefined);
  });

  await prisma.client.create({
    data: {
      id: clientId,
      clientKey,
      name: "Campaign Runner Preflight Test",
      profile: "business",
      features: { campaigns: true },
    },
  });
  await prisma.department.create({
    data: {
      clientId,
      name: "Atendimento Geral",
      slug: "atendimento-geral",
      isActive: false,
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
      name: "Preflight default failure",
      templateName,
      status: "sending",
      totalRecipients: 1,
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
    waIds: [recipient],
  });
  assert.ok(runId);

  await waitFor(async () => {
    const refreshed = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    return refreshed?.status === "failed";
  });

  assert.equal(metaCalls, 0);
  assert.equal(await prisma.outboundMessage.count({ where: { clientId } }), 0);
  assert.equal(await prisma.contact.count({ where: { clientId, waId: recipient } }), 0);
  assert.equal(await prisma.contactChannelIdentity.count({ where: { clientId } }), 0);
  assert.equal(await prisma.lead.count({ where: { tenantId: clientId } }), 0);
  const preflightFailure = await prisma.event.findFirst({
    where: {
      clientId,
      eventName: "campaign.preflight.failed",
      messageId: campaign.id,
    },
    select: { payloadJson: true },
  });
  assert.ok(preflightFailure);
  const payload = preflightFailure.payloadJson as Record<string, unknown>;
  assert.equal(payload.reason, "default_operational_department_missing");
});

test("campaign runner persists provider acceptance and local outbound for successful preflight", async (t) => {
  const clientId = crypto.randomUUID();
  const clientKey = `campaign-runner-provider-${process.pid}-${Date.now()}`;
  const templateName = `campaign_runner_provider_${Date.now()}`;
  const recipient = "5541991100401";
  const metaMessageId = `wamid.${crypto.randomUUID()}`;
  await cleanup(clientId).catch(() => undefined);
  t.after(() => {
    void cleanup(clientId).catch(() => undefined);
  });

  await prisma.client.create({
    data: {
      id: clientId,
      clientKey,
      name: "Campaign Runner Provider Test",
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
      name: "Provider acceptance",
      templateName,
      status: "sending",
      totalRecipients: 1,
    },
  });

  const originalFetch = globalThis.fetch;
  const metaRecipients: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      const request = JSON.parse(String(init?.body ?? "{}")) as { to?: string };
      if (request.to) metaRecipients.push(request.to);
      return new Response(JSON.stringify({ messages: [{ id: metaMessageId }] }), {
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
    waIds: [recipient],
  });
  assert.ok(runId);

  await waitFor(async () => {
    const refreshed = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    return refreshed?.status === "completed";
  });

  assert.deepEqual(metaRecipients, [recipient]);
  const outbound = await prisma.outboundMessage.findUnique({
    where: { clientId_messageId: { clientId, messageId: `campaign.${campaign.id}.1` } },
  });
  assert.equal(outbound?.metaMessageId, metaMessageId);
  assert.equal(outbound?.status, MessageStatus.SENT);
  const contact = await prisma.contact.findFirst({
    where: { clientId, waId: recipient },
    select: { id: true, lifecycle: true },
  });
  assert.ok(contact);
  assert.equal(contact.lifecycle, "ACTIVE");
  assert.equal(
    await prisma.contactChannelIdentity.count({
      where: {
        clientId,
        contactId: contact.id,
      },
    }),
    1
  );
  assert.equal(await prisma.lead.count({ where: { tenantId: clientId, waId: recipient } }), 1);
  assert.equal(await prisma.conversation.count({ where: { clientId, waId: recipient } }), 1);
  assert.equal(await prisma.conversationRuntimeState.count({ where: { clientId, waId: recipient } }), 1);
  assert.equal(
    await prisma.event.count({
      where: {
        clientId,
        eventName: "campaign.message.submit_started",
        messageId: `campaign.${campaign.id}.1`,
      },
    }),
    1
  );
  assert.equal(
    await prisma.event.count({
      where: {
        clientId,
        eventName: "campaign.message.provider_accepted",
        messageId: `campaign.${campaign.id}.1`,
      },
    }),
    1
  );
});

test("campaign runner materializes CRM identity for provider failure without creating conversation runtime", async (t) => {
  const clientId = crypto.randomUUID();
  const clientKey = `campaign-runner-provider-fail-${process.pid}-${Date.now()}`;
  const templateName = `campaign_runner_provider_fail_${Date.now()}`;
  const recipient = "5541991100451";
  await cleanup(clientId).catch(() => undefined);
  t.after(() => {
    void cleanup(clientId).catch(() => undefined);
  });

  await prisma.client.create({
    data: {
      id: clientId,
      clientKey,
      name: "Campaign Runner Provider Failure Test",
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
      name: "Provider failure",
      templateName,
      status: "sending",
      totalRecipients: 1,
    },
  });

  const originalFetch = globalThis.fetch;
  const metaRecipients: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      const request = JSON.parse(String(init?.body ?? "{}")) as { to?: string };
      if (request.to) metaRecipients.push(request.to);
      return new Response(JSON.stringify({ error: { message: "Provider rejected", code: 131000 } }), {
        status: 500,
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
    waIds: [recipient],
  });
  assert.ok(runId);

  await waitFor(async () => {
    const refreshed = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    return refreshed?.status === "failed";
  });

  assert.deepEqual(metaRecipients, [recipient]);
  const outbound = await prisma.outboundMessage.findUnique({
    where: { clientId_messageId: { clientId, messageId: `campaign.${campaign.id}.1` } },
  });
  assert.equal(outbound?.status, MessageStatus.FAILED);
  assert.match(outbound?.errorBody ?? "", /Provider rejected|131000/);
  assert.equal(await prisma.event.count({ where: { clientId, eventName: "campaign.message.failed" } }), 1);

  const contact = await prisma.contact.findFirst({
    where: { clientId, waId: recipient },
    select: { id: true, lifecycle: true },
  });
  assert.ok(contact);
  assert.equal(contact.lifecycle, "ACTIVE");
  assert.equal(await prisma.contact.count({ where: { clientId, waId: recipient } }), 1);
  assert.equal(await prisma.contactChannelIdentity.count({ where: { clientId, contactId: contact.id } }), 1);
  assert.equal(await prisma.lead.count({ where: { tenantId: clientId, waId: recipient } }), 1);
  assert.equal(await prisma.conversation.count({ where: { clientId, waId: recipient } }), 0);
  assert.equal(await prisma.conversationRuntimeState.count({ where: { clientId, waId: recipient } }), 0);
  const bootstrapEvent = await prisma.event.findFirst({
    where: {
      clientId,
      eventName: "campaign.recipient.contact_bootstrap_ready",
      messageId: `campaign.${campaign.id}.1`,
    },
    select: { conversationId: true, payloadJson: true },
  });
  assert.ok(bootstrapEvent);
  assert.equal(bootstrapEvent.conversationId, null);
  assert.equal((bootstrapEvent.payloadJson as Record<string, unknown>).conversationId, null);
});

test("campaign runner opt-out block does not materialize CRM or call provider", async (t) => {
  const clientId = crypto.randomUUID();
  const clientKey = `campaign-runner-optout-${process.pid}-${Date.now()}`;
  const templateName = `campaign_runner_optout_${Date.now()}`;
  const recipient = "5541991100461";
  await cleanup(clientId).catch(() => undefined);
  t.after(() => {
    void cleanup(clientId).catch(() => undefined);
  });

  await prisma.client.create({
    data: {
      id: clientId,
      clientKey,
      name: "Campaign Runner Opt-out Test",
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
  await recordContactOptOut({
    clientId,
    waId: recipient,
    source: "test",
    requestId: `test-opt-out:${recipient}`,
  });
  const campaign = await prisma.campaign.create({
    data: {
      clientId,
      name: "Opt-out block",
      templateName,
      status: "sending",
      totalRecipients: 1,
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
    waIds: [recipient],
  });
  assert.ok(runId);

  await waitFor(async () => {
    const refreshed = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    return refreshed?.status === "completed";
  });

  assert.equal(metaCalls, 0);
  assert.equal(await prisma.contact.count({ where: { clientId } }), 0);
  assert.equal(await prisma.contactChannelIdentity.count({ where: { clientId } }), 0);
  assert.equal(await prisma.lead.count({ where: { tenantId: clientId } }), 0);
  assert.equal(await prisma.outboundMessage.count({ where: { clientId } }), 0);
  assert.equal(
    await prisma.event.count({
      where: { clientId, eventName: "campaign.recipient.opt_out_blocked", messageId: campaign.id },
    }),
    1
  );
});

test("campaign runner does not resend a recipient with provider acceptance but missing local outbound", async (t) => {
  const clientId = crypto.randomUUID();
  const clientKey = `campaign-runner-reconcile-${process.pid}-${Date.now()}`;
  const templateName = `campaign_runner_reconcile_${Date.now()}`;
  const recipients = ["5541991100501", "5541991100502"];
  await cleanup(clientId).catch(() => undefined);
  t.after(() => {
    void cleanup(clientId).catch(() => undefined);
  });

  await prisma.client.create({
    data: {
      id: clientId,
      clientKey,
      name: "Campaign Runner Reconcile Test",
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
      name: "Provider acceptance retry guard",
      templateName,
      status: "sending",
      totalRecipients: recipients.length,
    },
  });
  await prisma.event.create({
    data: {
      clientId,
      waId: recipients[0],
      waIdCanonical: recipients[0],
      messageId: `campaign.${campaign.id}.1`,
      requestId: `campaign-message-provider-accepted:${campaign.id}:1`,
      eventName: "campaign.message.provider_accepted",
      payloadJson: {
        campaignId: campaign.id,
        campaignRunId: "previous-run",
        templateName,
        metaMessageId: `wamid.${crypto.randomUUID()}`,
      },
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
    return refreshed?.status === "failed";
  });

  assert.equal(metaCalls, 0);
  assert.equal(await prisma.outboundMessage.count({ where: { clientId } }), 0);
  assert.equal(
    await prisma.event.count({
      where: {
        clientId,
        eventName: "campaign.message.reconciliation_required",
        messageId: `campaign.${campaign.id}.1`,
      },
    }),
    1
  );
  assert.equal(
    await prisma.event.count({
      where: {
        clientId,
        eventName: "campaign.message.submit_started",
        messageId: `campaign.${campaign.id}.2`,
      },
    }),
    0
  );
});
