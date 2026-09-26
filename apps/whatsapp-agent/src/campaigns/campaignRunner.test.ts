import "./campaignOperationsTestSupport.js";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { MessageStatus } from "@prisma/client";
import { getPrisma } from "../db.js";
import { buildPrivateCampaignSeedFields, readPrivateCampaignSeedFields } from "./campaignSeedPrivacy.js";
import {
  getRunningCampaignPromiseForTests,
  processDueScheduledCampaigns,
  setCampaignRunnerSleepForTests,
  startCampaignRun,
} from "./campaignRunner.js";
import {
  claimNextCampaignExecutionJob,
  enqueueCampaignExecutionJob,
  markCampaignExecutionJobNeedsReview,
} from "./campaignExecutionQueue.js";
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
  await prisma.tenantCampaignExecutionLease.deleteMany({ where: { clientId } });
  await prisma.campaignExecutionJob.deleteMany({ where: { clientId } });
  await prisma.campaignExecutionBatchCampaign.deleteMany({ where: { clientId } });
  await prisma.campaignExecutionBatch.deleteMany({ where: { clientId } });
  await prisma.conversationRuntimeState.deleteMany({ where: { clientId } });
  await prisma.conversation.deleteMany({ where: { clientId } });
  await prisma.queue.deleteMany({ where: { clientId } });
  await prisma.department.deleteMany({ where: { clientId } });
  await prisma.event.deleteMany({ where: { clientId } });
  await prisma.outboundMessage.deleteMany({ where: { clientId } });
  await prisma.campaign.deleteMany({ where: { clientId } });
  await prisma.template.deleteMany({ where: { clientId } });
  await prisma.lead.deleteMany({ where: { tenantId: clientId } });
  await prisma.contact.deleteMany({ where: { clientId } });
  await prisma.contactChannelIdentity.deleteMany({ where: { clientId } });
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

test("campaign runner persists provider acceptance without opening operational conversation", async (t) => {
  const clientId = crypto.randomUUID();
  const clientKey = `campaign-runner-provider-${process.pid}-${Date.now()}`;
  const templateName = `campaign_runner_provider_${Date.now()}`;
  const recipient = "5541991100401";
  const ddd55NationalRecipient = "55991400002";
  const ddd55CanonicalRecipient = "5555991400002";
  const ddd55NationalComponents = [{ type: "body" as const, parameters: [{ type: "text" as const, text: "DDD55 Nacional" }] }];
  const ddd55CanonicalComponents = [{ type: "body" as const, parameters: [{ type: "text" as const, text: "DDD55 Completo" }] }];
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
      totalRecipients: 2,
    },
  });

  const originalFetch = globalThis.fetch;
  const metaRecipients: string[] = [];
  const metaComponentsByRecipient = new Map<string, unknown>();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      const request = JSON.parse(String(init?.body ?? "{}")) as {
        to?: string;
        template?: { components?: unknown };
      };
      if (request.to) metaRecipients.push(request.to);
      if (request.to) metaComponentsByRecipient.set(request.to, request.template?.components);
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
    waIds: [recipient, ddd55NationalRecipient, ddd55CanonicalRecipient],
    componentsByWaId: {
      [ddd55NationalRecipient]: ddd55NationalComponents,
      [ddd55CanonicalRecipient]: ddd55CanonicalComponents,
    },
  });
  assert.ok(runId);

  await waitFor(async () => {
    const refreshed = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    return refreshed?.status === "completed";
  });

  assert.deepEqual(metaRecipients, [recipient, ddd55CanonicalRecipient]);
  assert.deepEqual(metaComponentsByRecipient.get(ddd55CanonicalRecipient), ddd55NationalComponents);
  const outbound = await prisma.outboundMessage.findUnique({
    where: { clientId_messageId: { clientId, messageId: `campaign.${campaign.id}.1` } },
  });
  assert.equal(outbound?.metaMessageId, metaMessageId);
  assert.equal(outbound?.status, MessageStatus.SENT);
  const outboundRaw = outbound?.rawPayload as Record<string, unknown> | undefined;
  assert.equal(outboundRaw?.conversationId, null);
  assert.equal(outboundRaw?.deliveryConversationPending, true);
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
  assert.equal(await prisma.outboundMessage.count({ where: { clientId, waId: ddd55CanonicalRecipient } }), 1);
  assert.equal(await prisma.contact.count({ where: { clientId, waId: ddd55CanonicalRecipient } }), 1);
  assert.equal(await prisma.lead.count({ where: { tenantId: clientId, waId: ddd55CanonicalRecipient } }), 1);
  assert.equal(await prisma.conversation.count({ where: { clientId, waId: recipient } }), 0);
  assert.equal(await prisma.conversationRuntimeState.count({ where: { clientId, waId: recipient } }), 0);
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
  const recipient = "55991400004";
  const recipientCanonical = "5555991400004";
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
    waId: recipientCanonical,
    source: "test",
    requestId: `test-opt-out:${recipientCanonical}`,
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
  assert.equal(
    await prisma.event.count({
      where: { clientId, eventName: "campaign.recipient.opt_out_blocked", waIdCanonical: recipientCanonical },
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

test("campaign runner preserves accepted provider result after losing queue ownership", async (t) => {
  const clientId = crypto.randomUUID();
  const clientKey = `campaign-runner-lease-loss-${process.pid}-${Date.now()}`;
  const templateName = `campaign_runner_lease_loss_${Date.now()}`;
  const recipients = ["5541991100601", "5541991100602"];
  await cleanup(clientId).catch(() => undefined);
  t.after(() => {
    void cleanup(clientId).catch(() => undefined);
  });

  await prisma.client.create({
    data: {
      id: clientId,
      clientKey,
      name: "Campaign Runner Lease Loss Test",
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
      name: "Provider accepted during lease loss",
      templateName,
      status: "scheduled",
      totalRecipients: recipients.length,
      scheduledAt: new Date(Date.now() - 1000),
    },
  });
  await enqueueCampaignExecutionJob({
    prisma,
    clientId,
    campaignId: campaign.id,
    eligibleAt: new Date(Date.now() - 1000),
    idempotencyKey: `lease-loss:${campaign.id}`,
  });
  const claimed = await claimNextCampaignExecutionJob({ now: new Date(), leaseMs: 90_000 });
  assert.ok(claimed);
  assert.equal(claimed.campaignId, campaign.id);
  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "sending", scheduledAt: null } });

  let releaseProvider!: () => void;
  const providerReturned = new Promise<void>((resolve) => {
    releaseProvider = resolve;
  });
  const originalFetch = globalThis.fetch;
  const metaRecipients: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      const request = JSON.parse(String(init?.body ?? "{}")) as { to?: string };
      if (request.to) metaRecipients.push(request.to);
      await providerReturned;
      return new Response(JSON.stringify({ messages: [{ id: "wamid.lease-loss.accepted" }] }), {
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
    executionJob: claimed,
  });
  assert.ok(runId);
  const runningPromise = getRunningCampaignPromiseForTests(campaign.id);
  assert.ok(runningPromise);

  await waitFor(async () => metaRecipients.length === 1);
  assert.equal(
    await markCampaignExecutionJobNeedsReview({
      clientId,
      jobId: claimed.id,
      reason: "provider_result_uncertain_after_restart",
    }),
    true
  );
  releaseProvider();
  await runningPromise;

  await waitFor(async () => {
    const accepted = await prisma.event.count({
      where: {
        clientId,
        eventName: "campaign.message.provider_accepted",
        messageId: `campaign.${campaign.id}.1`,
      },
    });
    const outbound = await prisma.outboundMessage.count({
      where: { clientId, messageId: `campaign.${campaign.id}.1`, status: MessageStatus.SENT },
    });
    return accepted === 1 && outbound === 1;
  });

  assert.deepEqual(metaRecipients, [recipients[0]]);
  assert.equal(
    await prisma.outboundMessage.count({ where: { clientId, messageId: `campaign.${campaign.id}.2` } }),
    0
  );
  assert.equal(
    await prisma.event.count({ where: { clientId, eventName: "campaign.message.submit_started", messageId: `campaign.${campaign.id}.2` } }),
    0
  );
  const reviewedJob = await prisma.campaignExecutionJob.findUniqueOrThrow({
    where: { id: claimed.id },
    select: { status: true, failureReason: true },
  });
  assert.equal(reviewedJob.status, "needs_review");
  assert.equal(reviewedJob.failureReason, "provider_result_uncertain_after_restart");
  const campaignAfterLoss = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaign.id },
    select: { status: true, sentCount: true },
  });
  assert.equal(campaignAfterLoss.status, "sending");
  assert.equal(campaignAfterLoss.sentCount, 1);
});

function buildBrazilMobileWaIdRange(areaCode: string, start: number, count: number) {
  return Array.from({ length: count }, (_, index) => `55${areaCode}9${String(start + index).padStart(8, "0")}`);
}

async function runQueueUntilBatchCompleted(params: { batchId: string; now: Date; timeoutMs?: number }) {
  const deadline = Date.now() + (params.timeoutMs ?? 30_000);
  while (Date.now() < deadline) {
    // Long batches must issue fresh leases; the scheduling cutoff is not a frozen wall clock.
    await processDueScheduledCampaigns({ now: new Date(Math.max(params.now.getTime(), Date.now())), limit: 10 });
    const batch = await prisma.campaignExecutionBatch.findUnique({
      where: { id: params.batchId },
      select: { status: true },
    });
    if (batch?.status === "completed" || batch?.status === "failed" || batch?.status === "blocked") {
      if (batch.status !== "completed") {
        const links = await prisma.campaignExecutionBatchCampaign.findMany({
          where: { batchId: params.batchId },
          orderBy: { chunkIndex: "asc" },
          include: { campaign: { select: { status: true, sentCount: true, blockedCount: true } } },
        });
        const jobs = await prisma.campaignExecutionJob.findMany({
          where: { batchId: params.batchId },
          orderBy: [{ createdAt: "asc" }, { chunkIndex: "asc" }],
          select: { kind: true, status: true, campaignId: true, chunkIndex: true, failureReason: true },
        });
        assert.fail(
          `Batch ${params.batchId} ended as ${batch.status}; links=${JSON.stringify(
            links.map((link) => ({
              chunkIndex: link.chunkIndex,
              linkStatus: link.status,
              campaignStatus: link.campaign.status,
              sentCount: link.campaign.sentCount,
              blockedCount: link.campaign.blockedCount,
            }))
          )}; jobs=${JSON.stringify(jobs)}`
        );
      }
      return batch.status;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("Timed out waiting for batch completion");
}

test("dynamic CRM batch execution snapshots 3001 recipients into sequential chunks", async (t) => {
  const restoreSleep = setCampaignRunnerSleepForTests(async () => undefined);
  t.after(restoreSleep);
  const clientId = crypto.randomUUID();
  const clientKey = `campaign-runner-dynamic-batch-${process.pid}-${Date.now()}`;
  const templateName = `campaign_runner_dynamic_batch_${Date.now()}`;
  const now = new Date();
  await cleanup(clientId).catch(() => undefined);
  t.after(() => {
    void cleanup(clientId).catch(() => undefined);
  });

  await prisma.client.create({
    data: {
      id: clientId,
      clientKey,
      name: "Campaign Runner Dynamic Batch Test",
      profile: "business",
      features: { campaigns: true },
    },
  });
  const template = await prisma.template.create({
    data: {
      clientId,
      name: templateName,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Aviso {{1}}",
      variables: ["1"],
    },
  });
  const waIds = buildBrazilMobileWaIdRange("41", 10000000, 3001);
  await prisma.lead.createMany({
    data: waIds.map((waId, index) => ({
      tenantId: clientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      name: `Dynamic ${String(index + 1).padStart(4, "0")}`,
      phone: waId,
      status: "QUALIFIED",
    })),
  });
  const parent = await prisma.campaign.create({
    data: {
      clientId,
      templateId: template.id,
      name: "Dynamic grouped batch",
      templateName,
      status: "scheduled",
      scheduledAt: now,
      totalRecipients: 0,
    },
  });
  await prisma.event.create({
    data: {
      clientId,
      messageId: parent.id,
      requestId: `campaign-seed:${parent.id}:dynamic`,
      eventName: "campaign.seed.saved",
      payloadJson: {
        campaignId: parent.id,
        templateId: template.id,
        name: parent.name,
        templateName,
        templateParams: [],
        templateVariableMappings: [{ position: "1", source: "contact.displayName" }],
        returnDestination: null,
        source: "dynamic_crm_filter",
        selectionMode: "DYNAMIC_CRM_FILTER",
        dynamicFilter: { version: 1, crmBusinessStatusId: "QUALIFIED" },
        summary: { requested: 0, accepted: 0, blocked: 0, duplicatesRemoved: 0, blockedByReason: [] },
        ...buildPrivateCampaignSeedFields({ clientId, waIds: [] }),
      },
    },
  });
  const batch = await prisma.campaignExecutionBatch.create({
    data: {
      clientId,
      name: parent.name,
      sourceMode: "DYNAMIC_CRM_FILTER",
      status: "scheduled",
      requestedAt: now,
      eligibleAt: now,
      chunkCount: 0,
      idempotencyKey: `dynamic:${parent.id}`,
      metadata: { parentCampaignId: parent.id, clientKey, createdFrom: "test_dynamic_batch" },
    },
  });
  await prisma.event.create({
    data: {
      clientId,
      messageId: parent.id,
      requestId: `campaign-batch-controller:${parent.id}`,
      eventName: "campaign.batch.controller.created",
      payloadJson: { campaignId: parent.id, batchId: batch.id, sourceMode: "DYNAMIC_CRM_FILTER" },
    },
  });
  await enqueueCampaignExecutionJob({
    prisma,
    clientId,
    campaignId: null,
    batchId: batch.id,
    eligibleAt: now,
    kind: "batch_chunk",
    idempotencyKey: `dynamic-batch:${batch.id}:materialize`,
    metadata: { source: "dynamic_batch_materialize", parentCampaignId: parent.id },
  });

  const originalFetch = globalThis.fetch;
  const metaRecipients: string[] = [];
  const renderedNames = new Map<string, string>();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      const payload = JSON.parse(String(init?.body ?? "{}")) as {
        to?: string;
        template?: { components?: Array<{ parameters?: Array<{ text?: string }> }> };
      };
      if (payload.to) {
        metaRecipients.push(payload.to);
        renderedNames.set(payload.to, payload.template?.components?.[0]?.parameters?.[0]?.text ?? "");
      }
      return new Response(JSON.stringify({ messages: [{ id: `wamid.dynamic.${metaRecipients.length}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  assert.equal(await runQueueUntilBatchCompleted({ batchId: batch.id, now, timeoutMs: 600_000 }), "completed");
  const snapshotCount = await prisma.event.count({
    where: { clientId, messageId: parent.id, eventName: "campaign.dynamic_batch_snapshot.created" },
  });
  assert.equal(snapshotCount, 1);
  const links = await prisma.campaignExecutionBatchCampaign.findMany({
    where: { clientId, batchId: batch.id },
    orderBy: { chunkIndex: "asc" },
    select: { chunkIndex: true, recipientCount: true, status: true, campaignId: true },
  });
  assert.deepEqual(links.map((link) => link.recipientCount), [1000, 1000, 1000, 1]);
  assert.ok(links.every((link) => link.status === "completed"));
  assert.equal(metaRecipients.length, 3001);
  assert.equal(new Set(metaRecipients).size, 3001);
  assert.deepEqual(new Set(metaRecipients), new Set(waIds));
  assert.equal(renderedNames.get(waIds[0]), "Dynamic 0001");
  assert.equal(renderedNames.get(waIds[3000]), "Dynamic 3001");
  const completedParent = await prisma.campaign.findUniqueOrThrow({
    where: { id: parent.id },
    select: { status: true, sentCount: true, blockedCount: true },
  });
  assert.equal(completedParent.status, "completed");
  assert.equal(completedParent.sentCount, 3001);
  assert.equal(completedParent.blockedCount, 0);
});

test("CSV grouped batch execution preserves chunk variables and excludes post-blocked recipients", async (t) => {
  const restoreSleep = setCampaignRunnerSleepForTests(async () => undefined);
  t.after(restoreSleep);
  const clientId = crypto.randomUUID();
  const clientKey = `campaign-runner-csv-batch-${process.pid}-${Date.now()}`;
  const templateName = `campaign_runner_csv_batch_${Date.now()}`;
  const now = new Date();
  await cleanup(clientId).catch(() => undefined);
  t.after(() => {
    void cleanup(clientId).catch(() => undefined);
  });

  await prisma.client.create({
    data: {
      id: clientId,
      clientKey,
      name: "Campaign Runner CSV Batch Test",
      profile: "business",
      features: { campaigns: true },
    },
  });
  const template = await prisma.template.create({
    data: {
      clientId,
      name: templateName,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "CSV {{1}}",
      variables: ["1"],
    },
  });
  const waIds = buildBrazilMobileWaIdRange("42", 10000000, 3001);
  const blockedWaId = waIds[1500];
  await recordContactOptOut({ clientId, waId: blockedWaId, source: "test", reason: "csv batch post-block" });
  const batch = await prisma.campaignExecutionBatch.create({
    data: {
      clientId,
      name: "CSV grouped batch",
      sourceMode: "CSV_IMPORT",
      status: "running",
      requestedAt: now,
      eligibleAt: now,
      effectiveStartedAt: now,
      totalRecipients: waIds.length,
      chunkCount: 4,
      currentChunkIndex: 1,
      idempotencyKey: `csv:${crypto.randomUUID()}`,
      metadata: { createdFrom: "test_csv_grouped_batch" },
    },
  });
  const chunks = [waIds.slice(0, 1000), waIds.slice(1000, 2000), waIds.slice(2000, 3000), waIds.slice(3000)];
  for (const [index, recipients] of chunks.entries()) {
    const chunkIndex = index + 1;
    const campaign = await prisma.campaign.create({
      data: {
        clientId,
        templateId: template.id,
        name: `CSV grouped batch — ${String(chunkIndex).padStart(2, "0")}/04`,
        templateName,
        status: "scheduled",
        scheduledAt: null,
        totalRecipients: recipients.length,
      },
    });
    await prisma.campaignExecutionBatchCampaign.create({
      data: {
        clientId,
        batchId: batch.id,
        campaignId: campaign.id,
        chunkIndex,
        recipientCount: recipients.length,
        status: "scheduled",
      },
    });
    const componentsByWaId = Object.fromEntries(
      recipients.map((waId, recipientIndex) => [
        waId,
        [{ type: "body" as const, parameters: [{ type: "text" as const, text: `CSV ${chunkIndex}-${recipientIndex + 1}` }] }],
      ])
    );
    await prisma.event.create({
      data: {
        clientId,
        messageId: campaign.id,
        requestId: `campaign-csv-batch-seed:${batch.id}:${chunkIndex}`,
        eventName: "campaign.seed.saved",
        payloadJson: {
          campaignId: campaign.id,
          templateId: template.id,
          name: campaign.name,
          templateName,
          templateParams: [],
          templateVariableMappings: [],
          returnDestination: null,
          source: `csv_group:${batch.id}`,
          selectionMode: "STATIC_RECIPIENTS",
          dynamicFilter: null,
          summary: { requested: recipients.length, accepted: recipients.length, blocked: 0, duplicatesRemoved: 0, blockedByReason: [] },
          ...buildPrivateCampaignSeedFields({ clientId, waIds: recipients, componentsByWaId }),
        },
      },
    });
    await enqueueCampaignExecutionJob({
      prisma,
      clientId,
      campaignId: campaign.id,
      batchId: batch.id,
      chunkIndex,
      kind: "batch_chunk",
      eligibleAt: now,
      idempotencyKey: `batch:${batch.id}:chunk:${chunkIndex}`,
      metadata: { source: "test_csv_grouped_batch", recipientCount: recipients.length },
    });
  }

  const originalFetch = globalThis.fetch;
  const metaRecipients: string[] = [];
  const renderedValues = new Map<string, string>();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      const payload = JSON.parse(String(init?.body ?? "{}")) as {
        to?: string;
        template?: { components?: Array<{ parameters?: Array<{ text?: string }> }> };
      };
      if (payload.to) {
        metaRecipients.push(payload.to);
        renderedValues.set(payload.to, payload.template?.components?.[0]?.parameters?.[0]?.text ?? "");
      }
      return new Response(JSON.stringify({ messages: [{ id: `wamid.csv.${metaRecipients.length}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  assert.equal(await runQueueUntilBatchCompleted({ batchId: batch.id, now, timeoutMs: 600_000 }), "completed");
  assert.equal(metaRecipients.length, 3000);
  assert.equal(metaRecipients.includes(blockedWaId), false);
  assert.equal(new Set(metaRecipients).size, 3000);
  assert.equal(renderedValues.get(waIds[0]), "CSV 1-1");
  assert.equal(renderedValues.get(waIds[999]), "CSV 1-1000");
  assert.equal(renderedValues.get(waIds[1000]), "CSV 2-1");
  assert.equal(renderedValues.get(waIds[3000]), "CSV 4-1");
  const links = await prisma.campaignExecutionBatchCampaign.findMany({
    where: { clientId, batchId: batch.id },
    orderBy: { chunkIndex: "asc" },
    include: { campaign: { select: { status: true, sentCount: true, blockedCount: true } } },
  });
  assert.deepEqual(links.map((link) => link.recipientCount), [1000, 1000, 1000, 1]);
  assert.ok(links.every((link) => link.status === "completed"));
  assert.deepEqual(links.map((link) => link.campaign.sentCount), [1000, 999, 1000, 1]);
  assert.deepEqual(links.map((link) => link.campaign.blockedCount), [0, 1, 0, 0]);
  const blockedOutbound = await prisma.outboundMessage.count({
    where: { clientId, waId: blockedWaId },
  });
  assert.equal(blockedOutbound, 0);
});
