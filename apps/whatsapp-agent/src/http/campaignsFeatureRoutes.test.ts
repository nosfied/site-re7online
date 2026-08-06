import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { APP_AUTH_SESSION_EXPIRES_AT } from "../auth/appSessionService.js";
import { issueClientAuthToken } from "../auth/clientAuth.js";
import {
  filterOptedOutCampaignRecipients,
  recordContactOptOut,
  revokeContactOptOut,
} from "../campaigns/optOutRegistry.js";
import { getPrisma } from "../db.js";
import { setTemplateReviewNotificationSenderForTests } from "../templates/templateReviewNotification.js";

process.env.APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "campaigns-feature-route-test-secret";
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || "campaigns-feature-route-test-admin-token";
process.env.WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "campaigns-feature-route-test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "campaigns-feature-route-test-phone";

type TestResponse<T = unknown> = {
  status: number;
  body: T;
};

type ErrorPayload = {
  error?: string | { code?: string; message?: string };
  message?: string;
  feature?: string;
};

type TestUser = {
  id: string;
  clientId: string;
  name: string;
  email: string;
  role: string;
};

const prisma = getPrisma();
const originalCwd = process.cwd();
const prefix = `campaigns-feature-${process.pid}-${Date.now()}`;
const safeTemplatePrefix = prefix.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
const businessAdminToken = `${prefix}-business-admin-token`;

let tempRoot = "";
let server: Server;
let baseUrl = "";
let handleRequest: typeof import("./routes.js").handleRequest;

let businessClientId = "";
let governmentClientId = "";
let overrideClientId = "";
let killSwitchClientId = "";
let businessAdmin: TestUser;
let businessSupervisor: TestUser;
let businessAgent: TestUser;
let governmentAdmin: TestUser;
let overrideAdmin: TestUser;
let killSwitchAdmin: TestUser;

function getErrorCode(payload: ErrorPayload) {
  return typeof payload.error === "string" ? payload.error : payload.error?.code;
}

function makeTenant(id: string) {
  return {
    id,
    name: id,
    metaPhoneNumberId: `phone-${id}`,
    allowlist: [],
    handoffAttendantWaid: "",
    defaultLanguage: "pt_BR",
  };
}

async function writeTenants(clientKeys: string[]) {
  const tenantsPath = path.join(tempRoot, ".data", "tenants.json");
  await fs.mkdir(path.dirname(tenantsPath), { recursive: true });
  await fs.writeFile(
    tenantsPath,
    JSON.stringify(
      Object.fromEntries(clientKeys.map((clientKey) => [clientKey, makeTenant(clientKey)])),
      null,
      2
    ),
    "utf-8"
  );
}

async function createUser(params: {
  clientId: string;
  role: string;
  suffix: string;
}): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      clientId: params.clientId,
      name: `Campaigns ${params.role} ${params.suffix}`,
      email: `${prefix}-${params.suffix}@example.test`,
      role: params.role,
      isActive: true,
    },
    select: {
      id: true,
      clientId: true,
      name: true,
      email: true,
      role: true,
    },
  });
  await prisma.appAuthSession.create({
    data: {
      id: `${user.id}-session`,
      clientId: user.clientId,
      userId: user.id,
      expiresAt: APP_AUTH_SESSION_EXPIRES_AT,
    },
  });
  return user;
}

function authToken(user: TestUser) {
  return issueClientAuthToken(user, `${user.id}-session`);
}

async function request<T = unknown>(
  method: string,
  route: string,
  user: TestUser,
  body?: unknown
): Promise<TestResponse<T>> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      authorization: `Bearer ${authToken(user)}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    body: (await response.json()) as T,
  };
}

async function requestText(
  method: string,
  route: string,
  user: TestUser
): Promise<{ status: number; text: string; contentType: string | null }> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      authorization: `Bearer ${authToken(user)}`,
    },
  });
  return {
    status: response.status,
    text: await response.text(),
    contentType: response.headers.get("content-type"),
  };
}

async function requestUnauth<T = unknown>(
  method: string,
  route: string,
  body?: unknown
): Promise<TestResponse<T>> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    body: (await response.json()) as T,
  };
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 3000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("Timed out waiting for async condition");
}

async function requestAdmin<T = unknown>(
  method: string,
  route: string,
  body?: unknown
): Promise<TestResponse<T>> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      "x-admin-token": businessAdminToken,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    body: (await response.json()) as T,
  };
}

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: {
      clientKey: {
        startsWith: prefix,
      },
    },
    select: { id: true },
  });
  const clientIds = clients.map((client) => client.id);
  if (clientIds.length === 0) return;
  await prisma.outboundMessage.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.event.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.campaign.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.lead.deleteMany({
    where: {
      tenantId: {
        in: clientIds,
      },
    },
  });
  await prisma.conversationRuntimeState.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.conversation.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.contact.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.appAuthSession.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.waPhoneNumber.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.user.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.client.deleteMany({
    where: {
      id: {
        in: clientIds,
      },
    },
  });
}

test.before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "re7-campaigns-feature-routes-"));
  process.chdir(tempRoot);
  await cleanup();

  const businessClient = await prisma.client.create({
    data: {
      clientKey: `${prefix}-business`,
      name: "Campaigns Feature Business",
      profile: "business",
      features: {},
      adminToken: businessAdminToken,
    },
    select: { id: true, clientKey: true },
  });
  const governmentClient = await prisma.client.create({
    data: {
      clientKey: `${prefix}-government`,
      name: "Campaigns Feature Government",
      profile: "government",
      features: {},
    },
    select: { id: true, clientKey: true },
  });
  const overrideClient = await prisma.client.create({
    data: {
      clientKey: `${prefix}-override`,
      name: "Campaigns Feature Override",
      profile: "government",
      features: { campaigns: true, templates: true },
    },
    select: { id: true, clientKey: true },
  });
  const killSwitchClient = await prisma.client.create({
    data: {
      clientKey: `${prefix}-kill-switch`,
      name: "Campaigns Feature Kill Switch",
      profile: "business",
      features: { campaigns: false },
    },
    select: { id: true, clientKey: true },
  });

  businessClientId = businessClient.id;
  governmentClientId = governmentClient.id;
  overrideClientId = overrideClient.id;
  killSwitchClientId = killSwitchClient.id;
  await writeTenants([
    businessClient.clientKey,
    governmentClient.clientKey,
    overrideClient.clientKey,
    killSwitchClient.clientKey,
  ]);

  businessAdmin = await createUser({
    clientId: businessClientId,
    role: "ADMIN",
    suffix: "business-admin",
  });
  businessSupervisor = await createUser({
    clientId: businessClientId,
    role: "SUPERVISOR",
    suffix: "business-supervisor",
  });
  businessAgent = await createUser({
    clientId: businessClientId,
    role: "AGENT",
    suffix: "business-agent",
  });
  governmentAdmin = await createUser({
    clientId: governmentClientId,
    role: "ADMIN",
    suffix: "government-admin",
  });
  overrideAdmin = await createUser({
    clientId: overrideClientId,
    role: "ADMIN",
    suffix: "override-admin",
  });
  killSwitchAdmin = await createUser({
    clientId: killSwitchClientId,
    role: "ADMIN",
    suffix: "kill-switch-admin",
  });

  handleRequest = (await import("./routes.js")).handleRequest;
  server = createServer((req, res) => {
    void handleRequest(req, res);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
});

test.after(async () => {
  setTemplateReviewNotificationSenderForTests(null);
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await cleanup();
  await prisma.$disconnect();
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("business profile default can access campaigns route", async () => {
  const response = await request<{ ok: boolean; count: number }>(
    "GET",
    "/app/campaigns",
    businessAdmin
  );

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.ok, true);
  assert.equal(response.body.count, 0);
});

test("government profile default is blocked from campaigns routes", async () => {
  const routes = [
    { method: "GET", route: "/app/campaigns" },
    { method: "GET", route: "/app/campaigns/audience-preview" },
    { method: "POST", route: "/app/campaigns/drafts", body: { name: "Draft", templateId: "missing", selectedLeadIds: ["lead"] } },
    { method: "POST", route: "/app/campaigns/missing/send" },
    { method: "POST", route: "/app/campaigns/missing/discard" },
    { method: "GET", route: "/app/campaigns/missing" },
    { method: "POST", route: "/app/campaigns/missing/cancel" },
    {
      method: "POST",
      route: "/app/campaigns",
      body: {
        name: "Campanha bloqueada",
        templateName: "template_teste",
        recipients: ["5511999999999"],
      },
    },
  ];

  for (const item of routes) {
    const response = await request<ErrorPayload>(
      item.method,
      item.route,
      governmentAdmin,
      item.body
    );
    assert.equal(response.status, 403, `${item.method} ${item.route}`);
    assert.equal(getErrorCode(response.body), "feature_not_enabled");
    assert.equal(response.body.feature, "campaigns");
  }
});

test("campaign draft routes require authentication", async () => {
  const draft = await requestUnauth<ErrorPayload>("POST", "/app/campaigns/drafts", {
    name: "Sem sessao",
    templateId: "template",
    selectedLeadIds: ["lead"],
  });
  assert.equal(draft.status, 401);
  assert.equal(getErrorCode(draft.body), "missing_token");

  const send = await requestUnauth<ErrorPayload>("POST", "/app/campaigns/example/send");
  assert.equal(send.status, 401);
  assert.equal(getErrorCode(send.body), "missing_token");

  const discard = await requestUnauth<ErrorPayload>("POST", "/app/campaigns/example/discard");
  assert.equal(discard.status, 401);
  assert.equal(getErrorCode(discard.body), "missing_token");
});

test("template catalog is tenant scoped and exposes campaign usage safely", async () => {
  await prisma.template.createMany({
    data: [
      {
        clientId: businessClientId,
        name: `approved_template_${prefix}`,
        category: "UTILITY",
        language: "pt_BR",
        status: "approved",
        content: "Ola {{1}}, seu atendimento foi registrado.",
        variables: ["nome"],
        metaTemplateId: `meta-approved-${prefix}`,
      },
      {
        clientId: businessClientId,
        name: `pending_template_${prefix}`,
        category: "UTILITY",
        language: "pt_BR",
        status: "pending",
        content: "Aviso pendente",
      },
      {
        clientId: businessClientId,
        name: `rejected_template_${prefix}`,
        category: "MARKETING",
        language: "pt_BR",
        status: "rejected",
        content: "Aviso rejeitado",
        rejectionReason: "policy",
      },
      {
        clientId: businessClientId,
        name: `recategorized_template_${prefix}`,
        category: "MARKETING",
        submittedCategory: "UTILITY",
        wasRecategorized: true,
        language: "pt_BR",
        status: "approved",
        content: "Aviso institucional aprovado pela Meta",
      },
      {
        clientId: overrideClientId,
        name: `other_tenant_template_${prefix}`,
        category: "UTILITY",
        language: "pt_BR",
        status: "approved",
        content: "Outro tenant",
      },
    ],
  });

  const response = await request<{
    ok: true;
    count: number;
    items: Array<{
      id: string;
      name: string;
      status: string;
      metaTemplateId: string | null;
      canUseInCampaign: boolean;
      canUseInInbox: boolean;
      locallyDisabled: boolean;
      blockedReason: string | null;
      blockedReasonLabel: string | null;
      variablesDetected: string[];
      componentsSummary: Array<{ type: string; text: string }>;
      requestedCategory: string | null;
      metaCategory: string | null;
      effectiveCategory: string | null;
      categoryChanged: boolean;
      categoryChangeLabel: string | null;
    }>;
  }>("GET", "/app/templates?clientId=malicious", businessAdmin);

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.ok, true);
  assert.equal(response.body.items.some((item) => item.name.includes("other_tenant")), false);

  const approved = response.body.items.find((item) => item.name === `approved_template_${prefix}`);
  assert.ok(approved);
  assert.equal(approved.canUseInCampaign, true);
  assert.equal(approved.canUseInInbox, true);
  assert.equal(approved.locallyDisabled, false);
  assert.equal(approved.blockedReason, null);
  assert.deepEqual(approved.variablesDetected, ["1", "nome"]);
  assert.deepEqual(approved.componentsSummary, [
    { type: "BODY", text: "Ola {{1}}, seu atendimento foi registrado." },
  ]);
  assert.equal(JSON.stringify(approved).includes("businessToken"), false);

  const pending = response.body.items.find((item) => item.name === `pending_template_${prefix}`);
  assert.ok(pending);
  assert.equal(pending.canUseInCampaign, false);
  assert.equal(pending.blockedReason, "pending_review");
  assert.equal(pending.blockedReasonLabel, "Em analise");

  const rejected = response.body.items.find((item) => item.name === `rejected_template_${prefix}`);
  assert.ok(rejected);
  assert.equal(rejected.canUseInCampaign, false);
  assert.equal(rejected.blockedReason, "rejected");
  assert.equal(rejected.blockedReasonLabel, "Rejeitado");

  const recategorized = response.body.items.find((item) => item.name === `recategorized_template_${prefix}`);
  assert.ok(recategorized);
  assert.equal(recategorized.canUseInCampaign, true);
  assert.equal(recategorized.requestedCategory, "UTILITY");
  assert.equal(recategorized.metaCategory, "MARKETING");
  assert.equal(recategorized.effectiveCategory, "MARKETING");
  assert.equal(recategorized.categoryChanged, true);
  assert.match(recategorized.categoryChangeLabel ?? "", /MARKETING/);
  assert.match(recategorized.categoryChangeLabel ?? "", /UTILITY/);
});

test("template local availability blocks campaign usage and preserves tenant isolation", async () => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `local_disabled_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Ola {{1}}, aviso operacional.",
    },
  });

  const disabledByOtherTenant = await request<ErrorPayload>(
    "POST",
    `/app/templates/${template.id}/disable`,
    overrideAdmin
  );
  assert.equal(disabledByOtherTenant.status, 404);
  assert.equal(getErrorCode(disabledByOtherTenant.body), "template_not_found");

  const disabled = await request<{
    ok: true;
    template: {
      id: string;
      locallyDisabled: boolean;
      canUseInCampaign: boolean;
      canUseInInbox: boolean;
      blockedReason: string | null;
      blockedReasonLabel: string | null;
    };
  }>("POST", `/app/templates/${template.id}/disable`, businessAdmin);
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.template.locallyDisabled, true);
  assert.equal(disabled.body.template.canUseInCampaign, false);
  assert.equal(disabled.body.template.canUseInInbox, false);
  assert.equal(disabled.body.template.blockedReason, "locally_disabled");
  assert.equal(disabled.body.template.blockedReasonLabel, "Inativo no Converta");

  const listed = await request<{
    ok: true;
    items: Array<{
      id: string;
      locallyDisabled: boolean;
      canUseInCampaign: boolean;
      blockedReason: string | null;
    }>;
  }>("GET", "/app/templates", businessAdmin);
  const listedTemplate = listed.body.items.find((item) => item.id === template.id);
  assert.ok(listedTemplate);
  assert.equal(listedTemplate.locallyDisabled, true);
  assert.equal(listedTemplate.canUseInCampaign, false);
  assert.equal(listedTemplate.blockedReason, "locally_disabled");

  const disabledEvents = await prisma.event.count({
    where: {
      clientId: businessClientId,
      messageId: template.id,
      eventName: "template.local_disabled",
    },
  });
  assert.equal(disabledEvents, 1);

  const adminEnabled = await requestAdmin<{
    ok: true;
    template: { id: string; locallyDisabled: boolean };
  }>("POST", `/admin/templates/${template.id}/enable`);
  assert.equal(adminEnabled.status, 200);
  assert.equal(adminEnabled.body.template.locallyDisabled, false);

  const relisted = await request<{
    ok: true;
    items: Array<{ id: string; locallyDisabled: boolean; canUseInCampaign: boolean }>;
  }>("GET", "/app/templates", businessAdmin);
  const reactivated = relisted.body.items.find((item) => item.id === template.id);
  assert.ok(reactivated);
  assert.equal(reactivated.locallyDisabled, false);
  assert.equal(reactivated.canUseInCampaign, true);

  const adminDisabled = await requestAdmin<{
    ok: true;
    template: { id: string; locallyDisabled: boolean };
  }>("POST", `/admin/templates/${template.id}/disable`);
  assert.equal(adminDisabled.status, 200);
  assert.equal(adminDisabled.body.template.locallyDisabled, true);
});

test("inbox template send uses approved active template and updates timeline safely", async (t) => {
  const waId = "5541991177801";
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `inbox_template_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Ola {{1}}, continuamos seu atendimento.",
    },
  });
  const conversation = await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      windowIsOpen: false,
      windowExpiresAt: new Date("2026-01-01T10:00:00.000Z"),
      lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      conversationKey: `${prefix}-business:${waId}`,
      channel: "whatsapp",
      provider: "meta",
      windowIsOpen: false,
      mode: "HUMAN",
      status: "IN_PROGRESS",
      assignedUserId: businessAdmin.id,
      assignedTo: businessAdmin.name,
      lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
    },
  });

  const freeText = await request<ErrorPayload>("POST", `/app/conversation/${waId}/send`, businessAdmin, {
    text: "Mensagem livre fora da janela",
  });
  assert.equal(freeText.status, 409);
  assert.equal(getErrorCode(freeText.body), "window_closed");

  const originalFetch = globalThis.fetch;
  const metaPayloads: unknown[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      metaPayloads.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ messages: [{ id: `wamid.inbox.${safeTemplatePrefix}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await request<{
    ok: true;
    message: { type: string; status: string; bodyText: string; templateName: string; metaMessageId: string | null };
  }>("POST", `/app/conversation/${waId}/send-template?clientId=malicious`, businessAdmin, {
    templateId: template.id,
    variables: { "1": "Maria" },
  });

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.ok, true);
  assert.equal(response.body.message.type, "TEMPLATE");
  assert.equal(response.body.message.status, "SENT");
  assert.equal(response.body.message.bodyText, "Ola Maria, continuamos seu atendimento.");
  assert.equal(response.body.message.templateName, template.name);
  assert.equal(response.body.message.metaMessageId, `wamid.inbox.${safeTemplatePrefix}`);
  assert.equal(metaPayloads.length, 1);
  assert.equal((metaPayloads[0] as { to?: string }).to, waId);

  const outbound = await prisma.outboundMessage.findFirstOrThrow({
    where: { clientId: businessClientId, waId, messageId: { startsWith: "inbox.template." } },
  });
  assert.equal(outbound.type, "TEMPLATE");
  assert.equal(outbound.bodyText, "Ola Maria, continuamos seu atendimento.");
  assert.equal(outbound.templateName, template.name);
  assert.equal((outbound.rawPayload as Record<string, unknown>).source, "inbox_template");
  assert.equal(JSON.stringify(outbound.rawPayload).includes(waId), false);
  const outboundUsage = (outbound.rawPayload as Record<string, unknown>).metaUsage as Record<string, unknown>;
  assert.equal(outboundUsage.source, "inbox_template");
  assert.equal(outboundUsage.messageKind, "template");
  assert.equal(outboundUsage.metaCategory, "utility");
  assert.equal(outboundUsage.windowOpenAtSend, false);
  assert.equal(outboundUsage.estimatedBillable, true);
  assert.equal(outboundUsage.waIdLast4, waId.slice(-4));
  assert.equal(JSON.stringify(outboundUsage).includes(waId), false);

  const updatedConversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
  assert.ok(updatedConversation.lastOutboundAt);
  const runtime = await prisma.conversationRuntimeState.findUniqueOrThrow({
    where: { clientId_waId: { clientId: businessClientId, waId } },
  });
  assert.equal(runtime.mode, "HUMAN");
  assert.equal(runtime.status, "IN_PROGRESS");
  assert.equal(runtime.assignedUserId, businessAdmin.id);
  assert.equal(runtime.lastOutboundMessageId, outbound.messageId);

  const event = await prisma.event.findFirstOrThrow({
    where: { clientId: businessClientId, conversationId: conversation.id, eventName: "inbox.template.sent" },
  });
  assert.equal((event.payloadJson as Record<string, unknown>).templateName, template.name);
  const usageEvent = await prisma.event.findFirstOrThrow({
    where: { clientId: businessClientId, conversationId: conversation.id, eventName: "meta.usage.estimated" },
  });
  const usagePayload = usageEvent.payloadJson as Record<string, unknown>;
  assert.equal(usagePayload.source, "inbox_template");
  assert.equal(usagePayload.metaCategory, "utility");
  assert.equal(usagePayload.billingRule, "utility_billable");
  assert.equal(usagePayload.estimatedMetaUnitCostUsd, 0.008);
  assert.equal(JSON.stringify(usagePayload).includes(waId), false);
});

test("inbox template send blocks opt-out, inactive templates, missing variables and cross tenant template", async (t) => {
  const waId = "5541991177802";
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `inbox_block_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Ola {{1}}, mensagem de atendimento.",
    },
  });
  const otherTemplate = await prisma.template.create({
    data: {
      clientId: overrideClientId,
      name: `inbox_cross_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Outro tenant",
    },
  });
  await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      conversationKey: `${prefix}-business:${waId}`,
      channel: "whatsapp",
      provider: "meta",
      mode: "HUMAN",
      status: "IN_PROGRESS",
      assignedUserId: businessAdmin.id,
      assignedTo: businessAdmin.name,
      lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
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

  const missing = await request<ErrorPayload>("POST", `/app/conversation/${waId}/send-template`, businessAdmin, {
    templateId: template.id,
    variables: {},
  });
  assert.equal(missing.status, 400, JSON.stringify(missing.body));
  assert.equal(getErrorCode(missing.body), "template_variables_required");

  const crossTenant = await request<ErrorPayload>("POST", `/app/conversation/${waId}/send-template`, businessAdmin, {
    templateId: otherTemplate.id,
  });
  assert.equal(crossTenant.status, 404);
  assert.equal(getErrorCode(crossTenant.body), "template_not_found");

  await request("POST", `/app/templates/${template.id}/disable`, businessAdmin);
  const disabled = await request<ErrorPayload>("POST", `/app/conversation/${waId}/send-template`, businessAdmin, {
    templateId: template.id,
    variables: { "1": "Maria" },
  });
  assert.equal(disabled.status, 409);
  assert.equal(getErrorCode(disabled.body), "template_locally_disabled");
  await request("POST", `/app/templates/${template.id}/enable`, businessAdmin);

  await recordContactOptOut({
    clientId: businessClientId,
    waId,
    source: "test",
    reason: "inbox template block",
  });
  const optOut = await request<ErrorPayload>("POST", `/app/conversation/${waId}/send-template`, businessAdmin, {
    templateId: template.id,
    variables: { "1": "Maria" },
  });
  assert.equal(optOut.status, 409, JSON.stringify(optOut.body));
  assert.equal(getErrorCode(optOut.body), "active_send_blocked");

  assert.equal(metaCalls, 0);
  const outboundCount = await prisma.outboundMessage.count({
    where: { clientId: businessClientId, waId, messageId: { startsWith: "inbox.template." } },
  });
  assert.equal(outboundCount, 0);
});

test("inbox template send blocks unsafe conversations and records Meta failure without SENT success", async (t) => {
  const activeWaId = "5541991177803";
  const deletedWaId = "5541991177804";
  const anonymizedWaId = "5541991177805";
  const markedWaId = "5541991177806";
  const approved = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `inbox_failure_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Aviso operacional.",
    },
  });
  const pending = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `inbox_pending_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "pending",
      content: "Aviso pendente.",
    },
  });
  for (const [waId, extra] of [
    [activeWaId, {}],
    [deletedWaId, { deletedAt: new Date("2026-01-02T10:00:00.000Z") }],
    [anonymizedWaId, { anonymizedAt: new Date("2026-01-02T10:00:00.000Z") }],
    [markedWaId, {}],
  ] as Array<[string, Record<string, Date>]>) {
    await prisma.conversation.create({
      data: {
        clientId: businessClientId,
        waId,
        waIdCanonical: waId,
        channel: "whatsapp",
        provider: "meta",
        lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
        ...extra,
      },
    });
    await prisma.conversationRuntimeState.create({
      data: {
        clientId: businessClientId,
        waId,
        waIdCanonical: waId,
        conversationKey: `${prefix}-business:${waId}`,
        channel: "whatsapp",
        provider: "meta",
        mode: "HUMAN",
        status: "IN_PROGRESS",
        assignedUserId: businessAdmin.id,
        assignedTo: businessAdmin.name,
        lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
      },
    });
  }
  await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId: markedWaId,
      waIdCanonical: markedWaId,
      channel: "whatsapp",
      provider: "meta",
      name: "Usuario Anonimizado",
      phone: markedWaId,
      status: "INBOX_TEMPLATE_TEST",
    },
  });

  const deleted = await request<ErrorPayload>("POST", `/app/conversation/${deletedWaId}/send-template`, businessAdmin, {
    templateId: approved.id,
  });
  assert.equal(deleted.status, 404);
  assert.equal(getErrorCode(deleted.body), "conversation_not_found");

  const anonymized = await request<ErrorPayload>("POST", `/app/conversation/${anonymizedWaId}/send-template`, businessAdmin, {
    templateId: approved.id,
  });
  assert.equal(anonymized.status, 404);
  assert.equal(getErrorCode(anonymized.body), "conversation_not_found");

  const marked = await request<ErrorPayload>("POST", `/app/conversation/${markedWaId}/send-template`, businessAdmin, {
    templateId: approved.id,
  });
  assert.equal(marked.status, 409);
  assert.equal(getErrorCode(marked.body), "anonymized_contact");

  const pendingResponse = await request<ErrorPayload>("POST", `/app/conversation/${activeWaId}/send-template`, businessAdmin, {
    templateId: pending.id,
  });
  assert.equal(pendingResponse.status, 409);
  assert.equal(getErrorCode(pendingResponse.body), "pending_review");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      return new Response(JSON.stringify({ error: { message: "Meta unavailable" } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const failed = await request<ErrorPayload>("POST", `/app/conversation/${activeWaId}/send-template`, businessAdmin, {
    templateId: approved.id,
  });
  assert.equal(failed.status, 502, JSON.stringify(failed.body));
  assert.equal(getErrorCode(failed.body), "template_send_failed");

  const sentCount = await prisma.outboundMessage.count({
    where: { clientId: businessClientId, waId: activeWaId, messageId: { startsWith: "inbox.template." }, status: "SENT" },
  });
  assert.equal(sentCount, 0);
  const failedOutbound = await prisma.outboundMessage.findFirstOrThrow({
    where: { clientId: businessClientId, waId: activeWaId, messageId: { startsWith: "inbox.template." } },
  });
  assert.equal(failedOutbound.status, "FAILED");
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { clientId_waId: { clientId: businessClientId, waId: activeWaId } },
  });
  assert.equal(conversation.lastOutboundAt, null);
  const failedEvent = await prisma.event.findFirstOrThrow({
    where: { clientId: businessClientId, waId: activeWaId, eventName: "inbox.template.failed" },
  });
  assert.equal(JSON.stringify(failedEvent.payloadJson).includes(activeWaId), false);
});

test("canned replies are tenant scoped and managed by admin or supervisor", async () => {
  const agentCreate = await request<ErrorPayload>("POST", "/app/canned-replies", businessAgent, {
    title: "Saudacao",
    body: "Ola, tudo bem?",
  });
  assert.equal(agentCreate.status, 403);
  assert.equal(getErrorCode(agentCreate.body), "forbidden");

  const created = await request<{ ok: true; item: { id: string; title: string; active: boolean } }>(
    "POST",
    "/app/canned-replies?clientId=malicious",
    businessAdmin,
    {
      title: "Saudacao",
      category: "Atendimento",
      body: "Ola, tudo bem?",
    }
  );
  assert.equal(created.status, 201);
  assert.equal(created.body.item.title, "Saudacao");
  assert.equal(created.body.item.active, true);

  const supervisorUpdate = await request<{ ok: true; item: { title: string } }>(
    "PATCH",
    `/app/canned-replies/${created.body.item.id}`,
    businessSupervisor,
    {
      title: "Saudacao revisada",
      category: "Atendimento",
      body: "Ola, tudo bem? Como posso ajudar?",
    }
  );
  assert.equal(supervisorUpdate.status, 200);
  assert.equal(supervisorUpdate.body.item.title, "Saudacao revisada");

  const agentList = await request<{ ok: true; items: Array<{ id: string }>; permissions: { canManage: boolean } }>(
    "GET",
    "/app/canned-replies?includeInactive=true",
    businessAgent
  );
  assert.equal(agentList.status, 200);
  assert.equal(agentList.body.permissions.canManage, false);
  assert.ok(agentList.body.items.some((item) => item.id === created.body.item.id));

  const crossTenant = await request<ErrorPayload>("PATCH", `/app/canned-replies/${created.body.item.id}`, overrideAdmin, {
    title: "Nao deve alterar",
    body: "Tenant errado",
  });
  assert.equal(crossTenant.status, 404);
  assert.equal(getErrorCode(crossTenant.body), "canned_reply_not_found");

  const disabled = await request<{ ok: true; item: { active: boolean } }>(
    "POST",
    `/app/canned-replies/${created.body.item.id}/disable`,
    businessAdmin
  );
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.item.active, false);

  const agentAfterDisable = await request<{ ok: true; items: Array<{ id: string }> }>(
    "GET",
    "/app/canned-replies?includeInactive=true",
    businessAgent
  );
  assert.equal(agentAfterDisable.status, 200);
  assert.equal(agentAfterDisable.body.items.some((item) => item.id === created.body.item.id), false);

  const adminWithInactive = await request<{ ok: true; items: Array<{ id: string }> }>(
    "GET",
    "/app/canned-replies?includeInactive=true",
    businessAdmin
  );
  assert.equal(adminWithInactive.status, 200);
  assert.equal(adminWithInactive.body.items.some((item) => item.id === created.body.item.id), true);
});

test("inbox canned reply sends only in open owned WhatsApp conversations", async (t) => {
  const waId = "5541991177811";
  const created = await request<{ ok: true; item: { id: string; title: string; body: string } }>(
    "POST",
    "/app/canned-replies",
    businessAdmin,
    {
      title: "Resposta rapida",
      category: "Suporte",
      body: "Obrigado pelo contato. Vou verificar.",
    }
  );
  assert.equal(created.status, 201);
  await prisma.tenantMetaConfig.upsert({
    where: { clientId: businessClientId },
    create: {
      clientId: businessClientId,
      businessToken: "test-canned-token",
      phoneNumberId: `phone-canned-${safeTemplatePrefix}`,
      rawPayload: {},
    },
    update: {
      businessToken: "test-canned-token",
      phoneNumberId: `phone-canned-${safeTemplatePrefix}`,
      rawPayload: {},
    },
  });
  const conversation = await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      windowIsOpen: true,
      windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      conversationKey: `${prefix}-business:${waId}`,
      channel: "whatsapp",
      provider: "meta",
      windowIsOpen: true,
      windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      mode: "HUMAN",
      status: "IN_PROGRESS",
      assignedUserId: businessAdmin.id,
      assignedTo: businessAdmin.name,
      lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
    },
  });

  const originalFetch = globalThis.fetch;
  const metaPayloads: unknown[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      metaPayloads.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ messages: [{ id: `wamid.canned.${safeTemplatePrefix}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await request<{
    ok: true;
    message: {
      type: string;
      status: string;
      bodyText: string;
      source: string;
      cannedReplyId: string;
      metaMessageId: string | null;
    };
  }>("POST", `/app/conversation/${waId}/send-canned-reply?clientId=malicious`, businessAdmin, {
    cannedReplyId: created.body.item.id,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.message.type, "TEXT");
  assert.equal(response.body.message.status, "SENT");
  assert.equal(response.body.message.bodyText, created.body.item.body);
  assert.equal(response.body.message.source, "canned_reply");
  assert.equal(response.body.message.cannedReplyId, created.body.item.id);
  assert.equal(response.body.message.metaMessageId, `wamid.canned.${safeTemplatePrefix}`);
  assert.equal(metaPayloads.length, 1);
  assert.equal((metaPayloads[0] as { to?: string; text?: { body?: string } }).to, waId);
  assert.equal((metaPayloads[0] as { text?: { body?: string } }).text?.body, created.body.item.body);

  const outbound = await prisma.outboundMessage.findFirstOrThrow({
    where: { clientId: businessClientId, waId, messageId: { startsWith: "admin.send." } },
    orderBy: { createdAt: "desc" },
  });
  assert.equal(outbound.type, "TEXT");
  assert.equal(outbound.status, "SENT");
  assert.equal(outbound.bodyText, created.body.item.body);
  assert.equal((outbound.rawPayload as Record<string, unknown>).source, "canned_reply");
  assert.equal((outbound.rawPayload as Record<string, unknown>).cannedReplyId, created.body.item.id);
  assert.equal(JSON.stringify(outbound.rawPayload).includes(waId), false);
  const outboundUsage = (outbound.rawPayload as Record<string, unknown>).metaUsage as Record<string, unknown>;
  assert.equal(outboundUsage.source, "canned_reply");
  assert.equal(outboundUsage.messageKind, "canned_reply");
  assert.equal(outboundUsage.metaCategory, "service");
  assert.equal(outboundUsage.billingRule, "current_service_free");
  assert.equal(outboundUsage.estimatedBillable, false);
  assert.equal(JSON.stringify(outboundUsage).includes(waId), false);

  const runtime = await prisma.conversationRuntimeState.findUniqueOrThrow({
    where: { clientId_waId: { clientId: businessClientId, waId } },
  });
  assert.equal(runtime.mode, "HUMAN");
  assert.equal(runtime.status, "IN_PROGRESS");
  assert.equal(runtime.assignedUserId, businessAdmin.id);
  assert.equal(runtime.lastOutboundMessageId, outbound.messageId);

  const event = await prisma.event.findFirstOrThrow({
    where: { clientId: businessClientId, conversationId: conversation.id, eventName: "inbox.canned_reply.sent" },
  });
  assert.equal((event.payloadJson as Record<string, unknown>).source, "canned_reply");
  assert.equal(JSON.stringify(event.payloadJson).includes(waId), false);
  const usageEvent = await prisma.event.findFirstOrThrow({
    where: { clientId: businessClientId, eventName: "meta.usage.estimated", messageId: outbound.messageId },
  });
  const usagePayload = usageEvent.payloadJson as Record<string, unknown>;
  assert.equal(usagePayload.source, "canned_reply");
  assert.equal(usagePayload.metaCategory, "service");
  assert.equal(usagePayload.billingRule, "current_service_free");
  assert.equal(JSON.stringify(usagePayload).includes(waId), false);
});

test("inbox canned reply blocks closed, inactive, opt-out and anonymized conversations", async () => {
  const closedWaId = "5541991177812";
  const inactiveWaId = "5541991177813";
  const optOutWaId = "5541991177814";
  const markedWaId = "5541991177815";
  const deletedWaId = "5541991177816";
  const created = await request<{ ok: true; item: { id: string } }>("POST", "/app/canned-replies", businessAdmin, {
    title: "Operacional",
    body: "Mensagem operacional.",
  });
  assert.equal(created.status, 201);
  const inactive = await request<{ ok: true; item: { id: string } }>("POST", "/app/canned-replies", businessAdmin, {
    title: "Inativa",
    body: "Mensagem inativa.",
  });
  assert.equal(inactive.status, 201);
  await request("POST", `/app/canned-replies/${inactive.body.item.id}/disable`, businessAdmin);

  for (const [waId, windowIsOpen, extra] of [
    [closedWaId, false, {}],
    [inactiveWaId, true, {}],
    [optOutWaId, true, {}],
    [markedWaId, true, {}],
    [deletedWaId, true, { deletedAt: new Date("2026-01-02T10:00:00.000Z") }],
  ] as Array<[string, boolean, Record<string, Date>]>) {
    await prisma.conversation.create({
      data: {
        clientId: businessClientId,
        waId,
        waIdCanonical: waId,
        channel: "whatsapp",
        provider: "meta",
        windowIsOpen,
        windowExpiresAt: new Date("2026-01-01T10:00:00.000Z"),
        lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
        ...extra,
      },
    });
    await prisma.conversationRuntimeState.create({
      data: {
        clientId: businessClientId,
        waId,
        waIdCanonical: waId,
        conversationKey: `${prefix}-business:${waId}`,
        channel: "whatsapp",
        provider: "meta",
        windowIsOpen,
        windowExpiresAt: windowIsOpen ? new Date(Date.now() + 60 * 60 * 1000) : new Date("2026-01-01T10:00:00.000Z"),
        mode: "HUMAN",
        status: "IN_PROGRESS",
        assignedUserId: businessAdmin.id,
        assignedTo: businessAdmin.name,
        lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
      },
    });
  }
  await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId: markedWaId,
      waIdCanonical: markedWaId,
      channel: "whatsapp",
      provider: "meta",
      name: "Usuario Anonimizado",
      phone: markedWaId,
      status: "CANNED_REPLY_TEST",
    },
  });
  await recordContactOptOut({
    clientId: businessClientId,
    waId: optOutWaId,
    channel: "whatsapp",
    source: "test",
    reason: "test",
    requestedAt: new Date("2026-01-02T10:00:00.000Z"),
  });
  await prisma.tenantMetaConfig.upsert({
    where: { clientId: businessClientId },
    create: {
      clientId: businessClientId,
      businessToken: "test-canned-token",
      phoneNumberId: `phone-canned-${safeTemplatePrefix}`,
      rawPayload: {},
    },
    update: {
      businessToken: "test-canned-token",
      phoneNumberId: `phone-canned-${safeTemplatePrefix}`,
      rawPayload: {},
    },
  });

  const closed = await request<ErrorPayload>("POST", `/app/conversation/${closedWaId}/send-canned-reply`, businessAdmin, {
    cannedReplyId: created.body.item.id,
  });
  assert.equal(closed.status, 409);
  assert.equal(getErrorCode(closed.body), "window_closed");

  const disabled = await request<ErrorPayload>("POST", `/app/conversation/${inactiveWaId}/send-canned-reply`, businessAdmin, {
    cannedReplyId: inactive.body.item.id,
  });
  assert.equal(disabled.status, 409);
  assert.equal(getErrorCode(disabled.body), "canned_reply_inactive");

  const optOut = await request<ErrorPayload>("POST", `/app/conversation/${optOutWaId}/send-canned-reply`, businessAdmin, {
    cannedReplyId: created.body.item.id,
  });
  assert.equal(optOut.status, 409);
  assert.equal(getErrorCode(optOut.body), "active_send_blocked");

  const marked = await request<ErrorPayload>("POST", `/app/conversation/${markedWaId}/send-canned-reply`, businessAdmin, {
    cannedReplyId: created.body.item.id,
  });
  assert.equal(marked.status, 409);
  assert.equal(getErrorCode(marked.body), "anonymized_contact");

  const deleted = await request<ErrorPayload>("POST", `/app/conversation/${deletedWaId}/send-canned-reply`, businessAdmin, {
    cannedReplyId: created.body.item.id,
  });
  assert.equal(deleted.status, 404);
  assert.equal(getErrorCode(deleted.body), "conversation_not_found");
});

test("inbox canned reply records safe failure without sent event", async (t) => {
  const waId = "5541991177817";
  const created = await request<{ ok: true; item: { id: string } }>("POST", "/app/canned-replies", businessAdmin, {
    title: "Falha Meta",
    body: "Teste de falha.",
  });
  assert.equal(created.status, 201);
  await prisma.tenantMetaConfig.upsert({
    where: { clientId: businessClientId },
    create: {
      clientId: businessClientId,
      businessToken: "test-canned-token",
      phoneNumberId: `phone-canned-${safeTemplatePrefix}`,
      rawPayload: {},
    },
    update: {
      businessToken: "test-canned-token",
      phoneNumberId: `phone-canned-${safeTemplatePrefix}`,
      rawPayload: {},
    },
  });
  await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      windowIsOpen: true,
      windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      conversationKey: `${prefix}-business:${waId}`,
      channel: "whatsapp",
      provider: "meta",
      windowIsOpen: true,
      windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      mode: "HUMAN",
      status: "IN_PROGRESS",
      assignedUserId: businessAdmin.id,
      assignedTo: businessAdmin.name,
      lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      return new Response(JSON.stringify({ error: { message: "Meta unavailable" } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const failed = await request<ErrorPayload>("POST", `/app/conversation/${waId}/send-canned-reply`, businessAdmin, {
    cannedReplyId: created.body.item.id,
  });
  assert.equal(failed.status, 502);
  assert.equal(getErrorCode(failed.body), "message_send_failed");

  const outbound = await prisma.outboundMessage.findFirstOrThrow({
    where: { clientId: businessClientId, waId, messageId: { startsWith: "admin.send." } },
  });
  assert.equal(outbound.status, "FAILED");
  assert.equal((outbound.rawPayload as Record<string, unknown>).source, "canned_reply");

  const sentCount = await prisma.event.count({
    where: { clientId: businessClientId, waId, eventName: "inbox.canned_reply.sent" },
  });
  assert.equal(sentCount, 0);
  const failedEvent = await prisma.event.findFirstOrThrow({
    where: { clientId: businessClientId, waId, eventName: "inbox.canned_reply.failed" },
  });
  assert.equal(JSON.stringify(failedEvent.payloadJson).includes(waId), false);
});

test("template routes require auth and bulk sync fails safely without Meta config", async () => {
  const list = await requestUnauth<ErrorPayload>("GET", "/app/templates");
  assert.equal(list.status, 401);
  assert.equal(getErrorCode(list.body), "missing_token");

  const sync = await requestUnauth<ErrorPayload>("POST", "/app/templates/sync");
  assert.equal(sync.status, 401);
  assert.equal(getErrorCode(sync.body), "missing_token");

  const response = await request<{
    error: string;
    message: string;
    summary: {
      checked: number;
      updated: number;
      approved: number;
      pending: number;
      rejected: number;
      failed: number;
      lastSyncedAt: string | null;
    };
  }>("POST", "/app/templates/sync?clientId=malicious", businessAdmin);

  assert.equal(response.status, 400);
  assert.equal(getErrorCode(response.body), "meta_config_missing");
  assert.equal(JSON.stringify(response.body).includes("token"), false);
});

test("bulk template sync can use env WABA only when env phone belongs to tenant", async (t) => {
  const originalAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const originalWabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const originalPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_ACCESS_TOKEN = "test-env-business-token";
  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "test-env-waba";
  process.env.WHATSAPP_PHONE_NUMBER_ID = `env-phone-${safeTemplatePrefix}`;
  const envPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  t.after(() => {
    if (originalAccessToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
    else process.env.WHATSAPP_ACCESS_TOKEN = originalAccessToken;
    if (originalWabaId === undefined) delete process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    else process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = originalWabaId;
    if (originalPhoneNumberId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneNumberId;
  });

  await prisma.tenantMetaConfig.deleteMany({ where: { clientId: businessClientId } });
  await prisma.waPhoneNumber.create({
    data: {
      clientId: businessClientId,
      phoneNumberId: envPhoneNumberId,
      display: "Env matched phone",
    },
  });
  const templateName = `env_sync_${safeTemplatePrefix}`;
  await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: templateName,
      category: "UTILITY",
      language: "pt_BR",
      content: "Aviso institucional de teste",
      status: "pending",
    },
  });

  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  const authHeaders: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      urls.push(url);
      authHeaders.push(String((init?.headers as Record<string, string> | undefined)?.Authorization ?? ""));
      return new Response(
        JSON.stringify({
          data: [
            {
              id: `meta-${templateName}`,
              name: templateName,
              language: "pt_BR",
              category: "UTILITY",
              status: "APPROVED",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await request<{
    ok: boolean;
    summary: { checked: number; approved: number; failed: number };
  }>("POST", "/app/templates/sync", businessAdmin);

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.summary.checked > 0, true);
  assert.equal(response.body.summary.approved > 0, true);
  assert.equal(response.body.summary.failed, 0);
  assert.equal(urls.some((url) => url.includes("/test-env-waba/message_templates")), true);
  assert.equal(authHeaders.every((value) => value === "Bearer test-env-business-token"), true);
});

test("tenant template request stays in internal review and ignores auto submit", async (t) => {
  const originalNotifyEmail = process.env.TEMPLATE_REVIEW_NOTIFY_EMAIL;
  const originalFallbackEmail = process.env.TEMPLATE_REVIEW_FALLBACK_EMAIL;
  delete process.env.TEMPLATE_REVIEW_NOTIFY_EMAIL;
  delete process.env.TEMPLATE_REVIEW_FALLBACK_EMAIL;
  t.after(() => {
    if (originalNotifyEmail === undefined) {
      delete process.env.TEMPLATE_REVIEW_NOTIFY_EMAIL;
    } else {
      process.env.TEMPLATE_REVIEW_NOTIFY_EMAIL = originalNotifyEmail;
    }
    if (originalFallbackEmail === undefined) {
      delete process.env.TEMPLATE_REVIEW_FALLBACK_EMAIL;
    } else {
      process.env.TEMPLATE_REVIEW_FALLBACK_EMAIL = originalFallbackEmail;
    }
    setTemplateReviewNotificationSenderForTests(null);
  });

  const sentEmails: Array<{ to: string; subject: string; text: string }> = [];
  setTemplateReviewNotificationSenderForTests(async (message) => {
    sentEmails.push({ to: message.to, subject: message.subject, text: message.text });
  });
  const templatesBefore = await prisma.template.count({ where: { clientId: businessClientId } });
  const response = await request<{
    ok: true;
    request: {
      id: string;
      name: string;
      category: string;
      language: string;
      status: string;
      statusLabel: string;
      variableDetails: Array<{ key: string; description: string; example: string }>;
    };
    notification: { attempted: boolean; delivered: boolean };
    warnings: string[];
  }>("POST", "/app/templates/request?clientId=malicious", businessAdmin, {
    name: `utility_request_${safeTemplatePrefix}`,
    category: "UTILITY",
    language: "pt_BR",
    content: "Ola {{1}}, seu atendimento foi atualizado.",
    variableDetails: [{ key: "1", description: "Nome do contato", example: "Maria" }],
    autoSubmit: true,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.request.status, "requested");
  assert.equal(response.body.request.statusLabel, "Em análise pela Re7online");
  assert.equal(response.body.request.language, "pt_BR");
  assert.deepEqual(response.body.request.variableDetails, [
    { key: "1", description: "Nome do contato", example: "Maria" },
  ]);
  assert.equal(response.body.notification.delivered, true);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, "re7online@gmail.com");
  assert.match(sentEmails[0].subject, /Nova solicitação de template/);
  assert.match(sentEmails[0].text, /Campaigns Feature Business|campaigns-feature/);

  const templatesAfter = await prisma.template.count({ where: { clientId: businessClientId } });
  assert.equal(templatesAfter, templatesBefore);
  const createdEvent = await prisma.event.findFirst({
    where: {
      clientId: businessClientId,
      eventName: "template.request.created",
    },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });
  assert.ok(createdEvent);
  assert.equal((createdEvent.payloadJson as Record<string, unknown>).templateName, `utility_request_${safeTemplatePrefix}`);
});

test("template request validation blocks unsafe variables and missing fields", async () => {
  const missing = await request<ErrorPayload>("POST", "/app/templates/request", businessAdmin, {
    name: "",
    category: "UTILITY",
    language: "pt_BR",
    content: "Ola",
  });
  assert.equal(missing.status, 400);
  assert.equal(getErrorCode(missing.body), "validation_error");

  const skipped = await request<ErrorPayload>("POST", "/app/templates/request", businessAdmin, {
    name: `bad_vars_${safeTemplatePrefix}`,
    category: "UTILITY",
    language: "pt_BR",
    content: "Ola {{2}}",
    variableDetails: [{ key: "2", description: "Nome", example: "Maria" }],
  });
  assert.equal(skipped.status, 400);
  assert.equal(getErrorCode(skipped.body), "validation_error");

  const atEdge = await request<ErrorPayload>("POST", "/app/templates/request", businessAdmin, {
    name: `edge_vars_${safeTemplatePrefix}`,
    category: "UTILITY",
    language: "pt_BR",
    content: "{{1}} recebeu atualizacao",
    variableDetails: [{ key: "1", description: "Nome", example: "Maria" }],
  });
  assert.equal(atEdge.status, 400);
  assert.equal(getErrorCode(atEdge.body), "validation_error");

  const missingExample = await request<ErrorPayload>("POST", "/app/templates/request", businessAdmin, {
    name: `missing_example_${safeTemplatePrefix}`,
    category: "UTILITY",
    language: "pt_BR",
    content: "Ola {{1}}, sua solicitacao foi atualizada.",
    variableDetails: [{ key: "1", description: "Nome", example: "" }],
  });
  assert.equal(missingExample.status, 400);
  assert.equal(getErrorCode(missingExample.body), "validation_error");
});

test("template request email failure is audited without failing creation", async (t) => {
  const originalNotifyEmail = process.env.TEMPLATE_REVIEW_NOTIFY_EMAIL;
  const originalFallbackEmail = process.env.TEMPLATE_REVIEW_FALLBACK_EMAIL;
  delete process.env.TEMPLATE_REVIEW_NOTIFY_EMAIL;
  delete process.env.TEMPLATE_REVIEW_FALLBACK_EMAIL;
  t.after(() => {
    if (originalNotifyEmail === undefined) {
      delete process.env.TEMPLATE_REVIEW_NOTIFY_EMAIL;
    } else {
      process.env.TEMPLATE_REVIEW_NOTIFY_EMAIL = originalNotifyEmail;
    }
    if (originalFallbackEmail === undefined) {
      delete process.env.TEMPLATE_REVIEW_FALLBACK_EMAIL;
    } else {
      process.env.TEMPLATE_REVIEW_FALLBACK_EMAIL = originalFallbackEmail;
    }
    setTemplateReviewNotificationSenderForTests(null);
  });

  setTemplateReviewNotificationSenderForTests(async () => {
    throw new Error("smtp_test_failure token=supersecret Bearer abc123");
  });
  const response = await request<{
    ok: true;
    request: { id: string; status: string };
    notification: { attempted: boolean; delivered: boolean; reason: string };
  }>("POST", "/app/templates/request", businessAdmin, {
    name: `notification_failure_${safeTemplatePrefix}`,
    category: "UTILITY",
    language: "pt_BR",
    content: "Aviso institucional",
    variableDetails: [],
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.request.status, "requested");
  assert.equal(response.body.notification.delivered, false);
  assert.equal(response.body.notification.reason.includes("supersecret"), false);
  assert.equal(response.body.notification.reason.includes("abc123"), false);

  const event = await prisma.event.findFirst({
    where: {
      clientId: businessClientId,
      eventName: "template.request.notification_failed",
    },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });
  assert.ok(event);
  const payload = event.payloadJson as Record<string, unknown>;
  assert.equal(payload.recipient, "re7online@gmail.com");
  assert.equal(JSON.stringify(payload).includes("supersecret"), false);
  assert.equal(JSON.stringify(payload).includes("abc123"), false);
});

test("tenant template request listing is scoped to tenant", async () => {
  const ownRequestName = `tenant_visible_${safeTemplatePrefix}`;
  await prisma.templateRequest.createMany({
    data: [
      {
        clientId: businessClientId,
        name: ownRequestName,
        category: "UTILITY",
        content: "Visivel",
        status: "requested",
      },
      {
        clientId: overrideClientId,
        name: `tenant_hidden_${safeTemplatePrefix}`,
        category: "UTILITY",
        content: "Oculto",
        status: "requested",
      },
    ],
  });
  const response = await request<{ ok: true; items: Array<{ name: string }> }>(
    "GET",
    "/app/templates/requests?clientId=malicious",
    businessAdmin
  );
  assert.equal(response.status, 200);
  assert.equal(response.body.items.some((item) => item.name === ownRequestName), true);
  assert.equal(response.body.items.some((item) => item.name === `tenant_hidden_${safeTemplatePrefix}`), false);

  const ownRequest = await prisma.templateRequest.findFirstOrThrow({
    where: { clientId: businessClientId, name: ownRequestName },
    select: { id: true },
  });
  const cancelled = await request<{
    ok: true;
    request: { id: string; status: string; statusLabel: string };
  }>("POST", `/app/templates/requests/${ownRequest.id}/cancel?clientId=malicious`, businessAdmin);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.request.status, "cancelled");
  assert.equal(cancelled.body.request.statusLabel, "Cancelada");

  const cancelEvent = await prisma.event.findFirst({
    where: {
      clientId: businessClientId,
      eventName: "template.request.cancelled",
      payloadJson: { path: ["templateRequestId"], equals: ownRequest.id },
    },
    select: { payloadJson: true },
  });
  assert.ok(cancelEvent);
  assert.equal((cancelEvent.payloadJson as Record<string, unknown>).source, "app");

  const otherRequest = await prisma.templateRequest.findFirstOrThrow({
    where: { clientId: overrideClientId, name: `tenant_hidden_${safeTemplatePrefix}` },
    select: { id: true },
  });
  const crossTenantCancel = await request<ErrorPayload>(
    "POST",
    `/app/templates/requests/${otherRequest.id}/cancel`,
    businessAdmin
  );
  assert.equal(crossTenantCancel.status, 404);
});

test("admin can list and edit template requests without exposing tokens", async () => {
  const created = await prisma.templateRequest.create({
    data: {
      clientId: businessClientId,
      name: `admin_review_${safeTemplatePrefix}`,
      category: "UTILITY",
      content: "Ola {{1}}",
      variables: {
        language: "pt_BR",
        variableDetails: [{ key: "1", description: "Nome", example: "Maria" }],
        variables: [{ key: "1", description: "Nome", example: "Maria" }],
      },
      status: "requested",
    },
  });
  const list = await requestAdmin<{
    ok: true;
    items: Array<{ id: string; clientKey: string; language: string; variableDetails: unknown[] }>;
  }>("GET", `/admin/templates/requests?clientKey=${encodeURIComponent(`${prefix}-business`)}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.items.some((item) => item.id === created.id), true);
  assert.equal(JSON.stringify(list.body).includes("businessToken"), false);

  const updated = await requestAdmin<{
    ok: true;
    request: { id: string; status: string; name: string; language: string };
  }>("PATCH", `/admin/templates/requests/${created.id}`, {
    name: `admin_review_updated_${safeTemplatePrefix}`,
    category: "UTILITY",
    language: "pt_BR",
    content: "Ola {{1}}, tudo bem?",
    variableDetails: [{ key: "1", description: "Nome", example: "Maria" }],
    notes: "Revisado internamente",
    status: "review_started",
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.request.status, "review_started");
  assert.equal(updated.body.request.name, `admin_review_updated_${safeTemplatePrefix}`);
  assert.equal(updated.body.request.language, "pt_BR");

  const cancel = await requestAdmin<{
    ok: true;
    request: { id: string; status: string; statusLabel: string };
  }>("POST", `/admin/templates/requests/${created.id}/cancel`);
  assert.equal(cancel.status, 200);
  assert.equal(cancel.body.request.status, "cancelled");
  assert.equal(cancel.body.request.statusLabel, "Cancelada");

  const cancelEvent = await prisma.event.findFirst({
    where: {
      clientId: businessClientId,
      eventName: "template.request.cancelled",
      payloadJson: { path: ["templateRequestId"], equals: created.id },
    },
    select: { payloadJson: true },
  });
  assert.ok(cancelEvent);
  assert.equal((cancelEvent.payloadJson as Record<string, unknown>).source, "admin");
});

test("submitted and closed template requests are locked for review actions", async () => {
  const submitted = await prisma.templateRequest.create({
    data: {
      clientId: businessClientId,
      name: `submitted_locked_${safeTemplatePrefix}`,
      category: "UTILITY",
      content: "Aviso ja submetido",
      variables: { language: "pt_BR", variableDetails: [], variables: [] },
      status: "submitted_to_meta",
    },
  });
  const cancelled = await prisma.templateRequest.create({
    data: {
      clientId: businessClientId,
      name: `cancelled_locked_${safeTemplatePrefix}`,
      category: "UTILITY",
      content: "Aviso cancelado",
      variables: { language: "pt_BR", variableDetails: [], variables: [] },
      status: "cancelled",
    },
  });
  const metaApproved = await prisma.templateRequest.create({
    data: {
      clientId: businessClientId,
      name: `meta_approved_locked_${safeTemplatePrefix}`,
      category: "UTILITY",
      content: "Aviso aprovado",
      variables: { language: "pt_BR", variableDetails: [], variables: [] },
      status: "meta_approved",
    },
  });

  const editSubmitted = await requestAdmin<ErrorPayload>("PATCH", `/admin/templates/requests/${submitted.id}`, {
    name: `submitted_locked_updated_${safeTemplatePrefix}`,
    category: "UTILITY",
    language: "pt_BR",
    content: "Conteudo alterado indevidamente",
    variableDetails: [],
  });
  assert.equal(editSubmitted.status, 409);
  assert.equal(getErrorCode(editSubmitted.body), "template_request_locked");

  const resubmit = await requestAdmin<ErrorPayload>("POST", `/admin/templates/requests/${submitted.id}/submit`);
  assert.equal(resubmit.status, 409);
  assert.equal(getErrorCode(resubmit.body), "template_already_submitted");

  const submitCancelled = await requestAdmin<ErrorPayload>("POST", `/admin/templates/requests/${cancelled.id}/submit`);
  assert.equal(submitCancelled.status, 409);
  assert.equal(getErrorCode(submitCancelled.body), "template_request_locked");

  const cancelMetaApproved = await requestAdmin<ErrorPayload>("POST", `/admin/templates/requests/${metaApproved.id}/cancel`);
  assert.equal(cancelMetaApproved.status, 409);
  assert.equal(getErrorCode(cancelMetaApproved.body), "template_request_not_cancellable");
});

test("admin submit requires tenant Meta config and does not expose tokens", async () => {
  const created = await prisma.templateRequest.create({
    data: {
      clientId: businessClientId,
      name: `submit_without_meta_${safeTemplatePrefix}`,
      category: "UTILITY",
      content: "Aviso institucional",
      variables: { language: "pt_BR", variableDetails: [], variables: [] },
      status: "internal_approved",
    },
  });
  const response = await requestAdmin<ErrorPayload>(
    "POST",
    `/admin/templates/requests/${created.id}/submit`
  );
  assert.equal(response.status, 400);
  assert.equal(getErrorCode(response.body), "meta_config_missing");
  assert.equal(JSON.stringify(response.body).includes("businessToken"), false);
  assert.equal(JSON.stringify(response.body).includes("token"), false);
});

test("admin submit uses saved variable examples in Meta payload", async (t) => {
  const created = await prisma.templateRequest.create({
    data: {
      clientId: businessClientId,
      name: `submit_with_example_${safeTemplatePrefix}`,
      category: "UTILITY",
      content:
        "Olá {{1}}, tudo bem? Estamos retornando sobre sua solicitação. Responda esta mensagem para continuar o atendimento com nossa equipe.",
      variables: {
        language: "pt_BR",
        variableDetails: [{ key: "1", description: "nome do contato", example: "Maria" }],
        variables: [{ key: "1", description: "nome do contato", example: "Maria" }],
      },
      status: "internal_approved",
    },
  });
  await prisma.tenantMetaConfig.upsert({
    where: { clientId: businessClientId },
    create: {
      clientId: businessClientId,
      businessToken: "test-business-token",
      wabaId: "test-waba-id",
      rawPayload: {},
    },
    update: {
      businessToken: "test-business-token",
      wabaId: "test-waba-id",
      rawPayload: {},
    },
  });

  const originalFetch = globalThis.fetch;
  const metaPayloads: unknown[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      metaPayloads.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ id: `meta-${safeTemplatePrefix}`, status: "PENDING" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await requestAdmin<{
    ok: boolean;
    request: { status: string };
    submission: { submitted: boolean; status: string; templateId: string; errorMessage: string | null };
  }>("POST", `/admin/templates/requests/${created.id}/submit`);
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.request.status, "submitted_to_meta");
  assert.equal(response.body.submission.submitted, true);
  assert.equal(metaPayloads.length, 1);
  assert.deepEqual(metaPayloads[0], {
    name: `submit_with_example_${safeTemplatePrefix}`,
    category: "UTILITY",
    language: "pt_BR",
    components: [
      {
        type: "BODY",
        text:
          "Olá {{1}}, tudo bem? Estamos retornando sobre sua solicitação. Responda esta mensagem para continuar o atendimento com nossa equipe.",
        example: {
          body_text: [["Maria"]],
        },
      },
    ],
  });
});

test("campaign audience preview is tenant scoped and does not create operational records", async () => {
  const eligibleWaId = "5541991177001";
  const blockedWaId = "5541991177002";
  const otherTenantWaId = "5541991177003";
  const anonymizedWaId = "5541******7004:anon001";

  await prisma.lead.createMany({
    data: [
      {
        tenantId: businessClientId,
        waId: eligibleWaId,
        waIdCanonical: eligibleWaId,
        channel: "whatsapp",
        provider: "meta",
        name: "Cliente Elegivel",
        phone: eligibleWaId,
        company: "Empresa Elegivel",
        city: "Curitiba",
        status: "RETORNO_FUTURO",
      },
      {
        tenantId: businessClientId,
        waId: blockedWaId,
        waIdCanonical: blockedWaId,
        channel: "whatsapp",
        provider: "meta",
        name: "Cliente Bloqueado",
        phone: blockedWaId,
        status: "RETORNO_FUTURO",
      },
      {
        tenantId: businessClientId,
        waId: `${prefix}-instagram-audience`,
        channel: "instagram",
        provider: "meta",
        name: "Contato Instagram",
        status: "RETORNO_FUTURO",
      },
      {
        tenantId: businessClientId,
        waId: anonymizedWaId,
        waIdCanonical: anonymizedWaId,
        channel: "whatsapp",
        provider: "meta",
        name: "Usuario Anonimizado",
        phone: "5541991177004",
        status: "RETORNO_FUTURO",
      },
      {
        tenantId: overrideClientId,
        waId: otherTenantWaId,
        waIdCanonical: otherTenantWaId,
        channel: "whatsapp",
        provider: "meta",
        name: "Outro Tenant",
        phone: otherTenantWaId,
        status: "RETORNO_FUTURO",
      },
    ],
  });
  await recordContactOptOut({
    clientId: businessClientId,
    waId: blockedWaId,
    source: "test",
    reason: "preview block",
  });

  const campaignsBefore = await prisma.campaign.count({ where: { clientId: businessClientId } });
  const eventsBefore = await prisma.event.count({ where: { clientId: businessClientId } });
  const response = await request<{
    ok: boolean;
    summary: {
      total: number;
      eligible: number;
      blocked: number;
      blockedByReason: Array<{ reason: string; label: string; count: number }>;
    };
    items: Array<{
      leadId: string;
      displayName: string | null;
      phoneDisplay: string | null;
      identifierDisplay: string;
      channel: string | null;
      eligible: boolean;
      blockedReason: string | null;
      activeOptOut: boolean;
      isAnonymized: boolean;
    }>;
    pagination: { total: number; page: number; limit: number };
  }>(
    "GET",
    "/app/campaigns/audience-preview?status=RETORNO_FUTURO&limit=20&clientId=malicious",
    businessAdmin
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.summary.total, 4);
  assert.equal(response.body.summary.eligible, 1);
  assert.equal(response.body.summary.blocked, 3);
  assert.equal(response.body.items.some((item) => item.displayName === "Outro Tenant"), false);

  const eligible = response.body.items.find((item) => item.displayName === "Cliente Elegivel");
  assert.ok(eligible);
  assert.equal(eligible.eligible, true);
  assert.notEqual(eligible.phoneDisplay, eligibleWaId);
  assert.equal(JSON.stringify(eligible).includes(eligibleWaId), false);

  const blocked = response.body.items.find((item) => item.displayName === "Cliente Bloqueado");
  assert.ok(blocked);
  assert.equal(blocked.eligible, false);
  assert.equal(blocked.activeOptOut, true);
  assert.equal(blocked.blockedReason, "active_send_blocked");

  const anonymized = response.body.items.find((item) => item.displayName === "Usuario Anonimizado");
  assert.ok(anonymized);
  assert.equal(anonymized.eligible, false);
  assert.equal(anonymized.isAnonymized, true);
  assert.equal(anonymized.blockedReason, "anonymized_contact");
  assert.equal(JSON.stringify(anonymized).includes("5541991177004"), false);

  const instagram = response.body.items.find((item) => item.displayName === "Contato Instagram");
  assert.ok(instagram);
  assert.equal(instagram.eligible, false);
  assert.equal(instagram.blockedReason, "non_whatsapp_channel");

  const anonymizedSummary = response.body.summary.blockedByReason.find(
    (item) => item.reason === "anonymized_contact"
  );
  assert.ok(anonymizedSummary);
  assert.equal(anonymizedSummary.label, "Contato anonimizado");
  assert.equal(anonymizedSummary.count, 1);

  const campaignsAfter = await prisma.campaign.count({ where: { clientId: businessClientId } });
  const eventsAfter = await prisma.event.count({ where: { clientId: businessClientId } });
  assert.equal(campaignsAfter, campaignsBefore);
  assert.equal(eventsAfter, eventsBefore);
});

test("campaign draft uses approved template and stores safe seed without sending", async () => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `draft_template_${prefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Aviso institucional",
    },
  });
  const eligibleWaId = "5541991188001";
  const duplicateWaId = "5541991188002";
  const optOutWaId = "5541991188003";
  const [eligible, duplicateA, duplicateB, optOut, anonymized, instagram] =
    await Promise.all([
      prisma.lead.create({
        data: {
          tenantId: businessClientId,
          waId: eligibleWaId,
          waIdCanonical: eligibleWaId,
          channel: "whatsapp",
          provider: "meta",
          name: "Draft Elegivel",
          phone: eligibleWaId,
          status: "RETORNO_FUTURO",
        },
      }),
      prisma.lead.create({
        data: {
          tenantId: businessClientId,
          waId: duplicateWaId,
          waIdCanonical: duplicateWaId,
          channel: "whatsapp",
          provider: "meta",
          name: "Draft Duplicado A",
          phone: duplicateWaId,
          status: "RETORNO_FUTURO",
        },
      }),
      prisma.lead.create({
        data: {
          tenantId: businessClientId,
          waId: `${duplicateWaId}9`,
          waIdCanonical: `${duplicateWaId}9`,
          channel: "whatsapp",
          provider: "meta",
          name: "Draft Duplicado B",
          phone: duplicateWaId,
          status: "RETORNO_FUTURO",
        },
      }),
      prisma.lead.create({
        data: {
          tenantId: businessClientId,
          waId: optOutWaId,
          waIdCanonical: optOutWaId,
          channel: "whatsapp",
          provider: "meta",
          name: "Draft Opt Out",
          phone: optOutWaId,
          status: "RETORNO_FUTURO",
        },
      }),
      prisma.lead.create({
        data: {
          tenantId: businessClientId,
          waId: "5541******8804:anon001",
          waIdCanonical: "5541******8804:anon001",
          channel: "whatsapp",
          provider: "meta",
          name: "Usuario Anonimizado",
          phone: "5541991188004",
          status: "RETORNO_FUTURO",
        },
      }),
      prisma.lead.create({
        data: {
          tenantId: businessClientId,
          waId: `${prefix}-draft-instagram`,
          channel: "instagram",
          provider: "meta",
          name: "Draft Instagram",
          status: "RETORNO_FUTURO",
        },
      }),
    ]);
  await recordContactOptOut({
    clientId: businessClientId,
    waId: optOutWaId,
    source: "test",
    reason: "draft block",
  });

  const outboundBefore = await prisma.outboundMessage.count({ where: { clientId: businessClientId } });
  const response = await request<{
    ok: boolean;
    campaign: { id: string; status: string; totalRecipients: number; sentCount: number; blockedCount: number };
    draft: {
      summary: {
        requested: number;
        accepted: number;
        blocked: number;
        duplicatesRemoved: number;
        blockedByReason: Array<{ reason: string; label: string; count: number }>;
      };
      recipients: Array<{ leadId: string; phoneDisplay: string | null; identifierDisplay: string }>;
    };
  }>("POST", "/app/campaigns/drafts?clientId=malicious", businessAdmin, {
    name: "Rascunho CRM",
    templateId: template.id,
    selectedLeadIds: [
      eligible.id,
      duplicateA.id,
      duplicateB.id,
      optOut.id,
      anonymized.id,
      instagram.id,
    ],
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.campaign.status, "draft");
  assert.equal(response.body.campaign.totalRecipients, 2);
  assert.equal(response.body.campaign.sentCount, 0);
  assert.equal(response.body.campaign.blockedCount, 0);
  assert.equal(response.body.draft.summary.requested, 6);
  assert.equal(response.body.draft.summary.accepted, 2);
  assert.equal(response.body.draft.summary.blocked, 4);
  assert.equal(response.body.draft.summary.duplicatesRemoved, 1);
  assert.ok(
    response.body.draft.summary.blockedByReason.some(
      (item) => item.reason === "anonymized_contact" && item.label === "Contato anonimizado"
    )
  );
  assert.ok(
    response.body.draft.summary.blockedByReason.some(
      (item) => item.reason === "active_send_blocked"
    )
  );
  assert.ok(
    response.body.draft.summary.blockedByReason.some(
      (item) => item.reason === "non_whatsapp_channel"
    )
  );
  assert.equal(JSON.stringify(response.body).includes(eligibleWaId), false);

  const seed = await prisma.event.findFirst({
    where: {
      clientId: businessClientId,
      eventName: "campaign.seed.saved",
      messageId: response.body.campaign.id,
    },
    select: { payloadJson: true },
  });
  assert.ok(seed);
  const seedPayload = seed.payloadJson as Record<string, unknown>;
  assert.equal(seedPayload.templateId, template.id);
  assert.equal(seedPayload.source, "crm_audience_preview");
  assert.deepEqual(seedPayload.leadIds, [
    eligible.id,
    duplicateA.id,
    duplicateB.id,
    optOut.id,
    anonymized.id,
    instagram.id,
  ]);

  const outboundAfter = await prisma.outboundMessage.count({ where: { clientId: businessClientId } });
  const sendEvents = await prisma.event.count({
    where: {
      clientId: businessClientId,
      eventName: { in: ["campaign.draft.sent", "campaign.message.sent", "campaign.message.failed"] },
      messageId: response.body.campaign.id,
    },
  });
  assert.equal(outboundAfter, outboundBefore);
  assert.equal(sendEvents, 0);

  const detail = await request<{
    campaign: {
      status: string;
      metaSummary: { totalSent: number; totalDelivered: number; totalRead: number; totalFailed: number };
      messagesMetaStatus: Array<{ status: string }>;
      draftReview: { recipients: Array<{ phoneDisplay: string | null; identifierDisplay: string }> };
    };
  }>("GET", `/app/campaigns/${response.body.campaign.id}`, businessAdmin);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.campaign.status, "draft");
  assert.equal(detail.body.campaign.metaSummary.totalSent, 0);
  assert.equal(detail.body.campaign.metaSummary.totalDelivered, 0);
  assert.equal(detail.body.campaign.metaSummary.totalRead, 0);
  assert.equal(detail.body.campaign.metaSummary.totalFailed, 0);
  assert.equal(detail.body.campaign.messagesMetaStatus.length, 0);
  assert.equal(detail.body.campaign.draftReview.recipients.length, 2);
  assert.equal(JSON.stringify(detail.body).includes(eligibleWaId), false);

  const crossTenantDiscard = await request<ErrorPayload>(
    "POST",
    `/app/campaigns/${response.body.campaign.id}/discard`,
    overrideAdmin
  );
  assert.equal(crossTenantDiscard.status, 404);
  assert.equal(getErrorCode(crossTenantDiscard.body), "campaign_not_found");

  const discarded = await request<{
    ok: boolean;
    campaign: { id: string; status: string; sentCount: number; blockedCount: number };
  }>("POST", `/app/campaigns/${response.body.campaign.id}/discard`, businessAdmin);
  assert.equal(discarded.status, 200);
  assert.equal(discarded.body.ok, true);
  assert.equal(discarded.body.campaign.status, "cancelled");
  assert.equal(discarded.body.campaign.sentCount, 0);
  assert.equal(discarded.body.campaign.blockedCount, 0);

  const discardEvent = await prisma.event.count({
    where: {
      clientId: businessClientId,
      eventName: "campaign.draft.discarded",
      messageId: response.body.campaign.id,
    },
  });
  assert.equal(discardEvent, 1);

  const sendDiscarded = await request<ErrorPayload>(
    "POST",
    `/app/campaigns/${response.body.campaign.id}/send`,
    businessAdmin
  );
  assert.equal(sendDiscarded.status, 409);
  assert.equal(getErrorCode(sendDiscarded.body), "campaign_not_draft");

  const discardAgain = await request<ErrorPayload>(
    "POST",
    `/app/campaigns/${response.body.campaign.id}/discard`,
    businessAdmin
  );
  assert.equal(discardAgain.status, 409);
  assert.equal(getErrorCode(discardAgain.body), "campaign_not_draft");

  const sendingCampaign = await prisma.campaign.create({
    data: {
      clientId: businessClientId,
      name: "Campanha em envio",
      templateName: template.name,
      status: "sending",
      totalRecipients: 1,
      sentCount: 0,
      blockedCount: 0,
    },
  });
  const discardSending = await request<ErrorPayload>(
    "POST",
    `/app/campaigns/${sendingCampaign.id}/discard`,
    businessAdmin
  );
  assert.equal(discardSending.status, 409);
  assert.equal(getErrorCode(discardSending.body), "campaign_not_draft");
});

test("campaign draft send revalidates recipients before starting", async () => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `draft_send_template_${prefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Ola",
    },
  });
  const waId = "5541991189001";
  const lead = await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      name: "Enviar Draft",
      phone: waId,
      status: "RETORNO_FUTURO",
    },
  });

  const created = await request<{
    ok: boolean;
    campaign: { id: string; status: string; totalRecipients: number };
  }>("POST", "/app/campaigns/drafts", businessAdmin, {
    name: "Rascunho para envio",
    templateId: template.id,
    selectedLeadIds: [lead.id],
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.campaign.status, "draft");
  assert.equal(created.body.campaign.totalRecipients, 1);

  await recordContactOptOut({
    clientId: businessClientId,
    waId,
    source: "test",
    reason: "blocked before explicit send",
  });

  const send = await request<ErrorPayload>(
    "POST",
    `/app/campaigns/${created.body.campaign.id}/send`,
    businessAdmin
  );
  assert.equal(send.status, 400);
  assert.equal(getErrorCode(send.body), "no_eligible_recipients");

  const campaign = await prisma.campaign.findUnique({
    where: { id: created.body.campaign.id },
    select: { status: true },
  });
  assert.equal(campaign?.status, "draft");
  const outboundCount = await prisma.outboundMessage.count({
    where: { clientId: businessClientId, waId },
  });
  const sentEventCount = await prisma.event.count({
    where: {
      clientId: businessClientId,
      messageId: created.body.campaign.id,
      eventName: "campaign.draft.sent",
    },
  });
  assert.equal(outboundCount, 0);
  assert.equal(sentEventCount, 0);
});

test("campaign draft requires mappings for approved template variables", async () => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `draft_variable_required_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Ola {{1}}, sua solicitacao foi atualizada.",
    },
  });
  const waId = "5541991189101";
  const lead = await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      name: "Sem Mapeamento",
      phone: waId,
      status: "RETORNO_FUTURO",
    },
  });

  const response = await request<ErrorPayload>("POST", "/app/campaigns/drafts", businessAdmin, {
    name: "Rascunho sem variavel",
    templateId: template.id,
    selectedLeadIds: [lead.id],
  });

  assert.equal(response.status, 400);
  assert.equal(getErrorCode(response.body), "template_variables_required");
  const campaigns = await prisma.campaign.count({
    where: { clientId: businessClientId, name: "Rascunho sem variavel" },
  });
  assert.equal(campaigns, 0);
});

test("campaign draft explicit send blocks locally disabled template without sending", async () => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `draft_local_disabled_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Aviso sem variaveis.",
    },
  });
  const waId = "5541991189105";
  const lead = await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      name: "Template Inativo",
      phone: waId,
      status: "RETORNO_FUTURO",
    },
  });

  const created = await request<{
    ok: boolean;
    campaign: { id: string; status: string; totalRecipients: number };
  }>("POST", "/app/campaigns/drafts", businessAdmin, {
    name: "Rascunho com template inativado",
    templateId: template.id,
    selectedLeadIds: [lead.id],
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.campaign.status, "draft");

  const disabled = await request("POST", `/app/templates/${template.id}/disable`, businessAdmin);
  assert.equal(disabled.status, 200);

  const originalFetch = globalThis.fetch;
  let metaCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      metaCalls += 1;
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    const send = await request<ErrorPayload>(
      "POST",
      `/app/campaigns/${created.body.campaign.id}/send`,
      businessAdmin
    );
    assert.equal(send.status, 400);
    assert.equal(getErrorCode(send.body), "template_locally_disabled");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: created.body.campaign.id },
    select: { status: true },
  });
  const outboundCount = await prisma.outboundMessage.count({
    where: { clientId: businessClientId, messageId: { startsWith: `campaign.${created.body.campaign.id}.` } },
  });
  const sentEventCount = await prisma.event.count({
    where: {
      clientId: businessClientId,
      messageId: created.body.campaign.id,
      eventName: "campaign.draft.sent",
    },
  });
  assert.equal(campaign?.status, "draft");
  assert.equal(outboundCount, 0);
  assert.equal(sentEventCount, 0);
  assert.equal(metaCalls, 0);
});

test("campaign draft rejects invalid fixed variable mapping", async () => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `draft_variable_invalid_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Ola {{1}}, sua solicitacao foi atualizada.",
    },
  });
  const waId = "5541991189102";
  const lead = await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      name: "Fixo Vazio",
      phone: waId,
      status: "RETORNO_FUTURO",
    },
  });

  const response = await request<ErrorPayload>("POST", "/app/campaigns/drafts", businessAdmin, {
    name: "Rascunho fixo vazio",
    templateId: template.id,
    selectedLeadIds: [lead.id],
    templateVariableMappings: [{ position: "1", source: "fixed", value: "" }],
  });

  assert.equal(response.status, 400);
  assert.equal(getErrorCode(response.body), "invalid_template_variable_mapping");
});

test("campaign draft explicit send renders mapped variables per contact", async (t) => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `draft_variable_send_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Ola {{1}}, sua empresa {{2}} em {{3}} recebeu {{4}}.",
      variables: ["nome", "empresa", "cidade", "aviso"],
    },
  });
  const waId = "5541991189103";
  const normalizedWaId = "55419991189103";
  const lead = await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      name: "Cliente Variavel",
      phone: waId,
      company: "Empresa Variavel",
      city: "Curitiba",
      status: "RETORNO_FUTURO",
    },
  });

  const created = await request<{
    ok: boolean;
    campaign: { id: string; status: string; totalRecipients: number };
  }>("POST", "/app/campaigns/drafts", businessAdmin, {
    name: "Rascunho variavel",
    templateId: template.id,
    selectedLeadIds: [lead.id],
    templateVariableMappings: [
      { position: "1", source: "contact.displayName" },
      { position: "2", source: "lead.companyName" },
      { position: "3", source: "lead.city" },
      { position: "4", source: "fixed", value: "atualizacao" },
    ],
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.campaign.status, "draft");

  const seed = await prisma.event.findFirst({
    where: {
      clientId: businessClientId,
      eventName: "campaign.seed.saved",
      messageId: created.body.campaign.id,
    },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });
  assert.ok(seed);
  const seedPayload = seed.payloadJson as Record<string, unknown>;
  assert.deepEqual(seedPayload.templateVariableMappings, [
    { position: "1", source: "contact.displayName" },
    { position: "2", source: "lead.companyName" },
    { position: "3", source: "lead.city" },
    { position: "4", source: "fixed", value: "atualizacao" },
  ]);
  assert.equal(JSON.stringify(seedPayload).includes(waId), false);

  const originalFetch = globalThis.fetch;
  const metaPayloads: unknown[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      metaPayloads.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ messages: [{ id: `wamid.${safeTemplatePrefix}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const sent = await request<{
    ok: true;
    campaign: { id: string; status: string };
    send: {
      summary: {
        accepted: number;
        blocked: number;
      };
    };
  }>("POST", `/app/campaigns/${created.body.campaign.id}/send`, businessAdmin);
  assert.equal(sent.status, 200);
  assert.equal(sent.body.send.summary.accepted, 1);
  assert.equal(sent.body.send.summary.blocked, 0);

  await waitFor(async () => {
    const count = await prisma.outboundMessage.count({
      where: { clientId: businessClientId, messageId: { startsWith: `campaign.${created.body.campaign.id}.` } },
    });
    return count === 1;
  });
  assert.equal(metaPayloads.length, 1);
  assert.deepEqual(metaPayloads[0], {
    messaging_product: "whatsapp",
    to: normalizedWaId,
    type: "template",
    template: {
      name: template.name,
      language: { code: "pt_BR" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "Cliente Variavel" },
            { type: "text", text: "Empresa Variavel" },
            { type: "text", text: "Curitiba" },
            { type: "text", text: "atualizacao" },
          ],
        },
      ],
    },
  });

  const outbound = await prisma.outboundMessage.findFirst({
    where: { clientId: businessClientId, messageId: { startsWith: `campaign.${created.body.campaign.id}.` } },
    select: { rawPayload: true },
  });
  assert.ok(outbound);
  assert.deepEqual((outbound.rawPayload as Record<string, unknown>).components, [
    {
      type: "body",
      parameters: [
        { type: "text", text: "Cliente Variavel" },
        { type: "text", text: "Empresa Variavel" },
        { type: "text", text: "Curitiba" },
        { type: "text", text: "atualizacao" },
      ],
    },
  ]);
});

test("campaign send resolves safe ninth digit variant to existing conversation", async (t) => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `campaign_bridge_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Aviso de atendimento",
    },
  });
  const conversationWaId = "554112349614";
  const inputWaId = "5541912349614";
  const previousOutboundAt = new Date("2026-01-01T10:00:00.000Z");
  const conversation = await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId: conversationWaId,
      waIdCanonical: conversationWaId,
      channel: "whatsapp",
      provider: "meta",
      lastInboundAt: new Date("2026-01-01T09:00:00.000Z"),
      lastOutboundAt: previousOutboundAt,
    },
    select: { id: true },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId: conversationWaId,
      waIdCanonical: conversationWaId,
      conversationKey: `${prefix}-business:${conversationWaId}`,
      channel: "whatsapp",
      provider: "meta",
      mode: "HUMAN",
      status: "IN_PROGRESS",
      assignedUserId: businessAdmin.id,
      assignedTo: businessAdmin.name,
      lastInboundAt: new Date("2026-01-01T09:00:00.000Z"),
      lastOutboundAt: previousOutboundAt,
    },
  });

  const originalFetch = globalThis.fetch;
  const metaPayloads: unknown[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      metaPayloads.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ messages: [{ id: `wamid.bridge.${safeTemplatePrefix}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await request<{ ok: boolean; campaign: { id: string; status: string } }>(
    "POST",
    "/app/campaigns",
    businessAdmin,
    {
      name: "Envio com variacao segura",
      templateId: template.id,
      recipients: [inputWaId],
    }
  );
  assert.equal(response.status, 200);

  await waitFor(async () => {
    const count = await prisma.outboundMessage.count({
      where: { clientId: businessClientId, messageId: { startsWith: `campaign.${response.body.campaign.id}.` } },
    });
    return count === 1;
  });

  assert.equal(metaPayloads.length, 1);
  assert.equal((metaPayloads[0] as { to?: string }).to, conversationWaId);

  const outbound = await prisma.outboundMessage.findFirstOrThrow({
    where: { clientId: businessClientId, messageId: { startsWith: `campaign.${response.body.campaign.id}.` } },
    select: { waId: true, waIdCanonical: true, rawPayload: true },
  });
  assert.equal(outbound.waId, conversationWaId);
  assert.equal(outbound.waIdCanonical, conversationWaId);
  const resolution = (outbound.rawPayload as { recipientResolution?: { matchedBy?: string; inputLast4?: string } })
    .recipientResolution;
  assert.equal(resolution?.matchedBy, "brazil_ninth_digit_safe");
  assert.equal(resolution?.inputLast4, "9614");
  assert.equal(JSON.stringify(resolution).includes(inputWaId), false);

  const updatedConversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversation.id },
    select: { lastOutboundAt: true },
  });
  if ((updatedConversation.lastOutboundAt?.getTime() ?? 0) <= previousOutboundAt.getTime()) {
    await waitFor(async () => {
      const refreshed = await prisma.conversation.findUnique({
        where: { id: conversation.id },
        select: { lastOutboundAt: true },
      });
      return (refreshed?.lastOutboundAt?.getTime() ?? 0) > previousOutboundAt.getTime();
    });
  }

  const runtimeStates = await prisma.conversationRuntimeState.findMany({
    where: {
      clientId: businessClientId,
      OR: [{ waId: conversationWaId }, { waId: inputWaId }],
    },
    select: { waId: true, mode: true, status: true, assignedUserId: true, lastOutboundMessageId: true },
  });
  assert.equal(runtimeStates.length, 1);
  assert.equal(runtimeStates[0].waId, conversationWaId);
  assert.equal(runtimeStates[0].mode, "HUMAN");
  assert.equal(runtimeStates[0].status, "IN_PROGRESS");
  assert.equal(runtimeStates[0].assignedUserId, businessAdmin.id);
  assert.ok(runtimeStates[0].lastOutboundMessageId);

  const resolutionEvent = await prisma.event.findFirst({
    where: {
      clientId: businessClientId,
      eventName: "campaign.recipient.conversation_resolved",
      conversationId: conversation.id,
    },
    select: { payloadJson: true },
  });
  assert.ok(resolutionEvent);
  assert.equal(JSON.stringify(resolutionEvent.payloadJson).includes(inputWaId), false);
});

test("campaign send reactivates soft-deleted non-anonymized conversation", async (t) => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `campaign_reactivate_deleted_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Retorno de atendimento",
    },
  });
  const waId = "558494786787";
  const deletedAt = new Date("2026-01-03T10:00:00.000Z");
  const previousOutboundAt = new Date("2026-01-02T10:00:00.000Z");
  const conversation = await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      deletedAt,
      lastOutboundAt: previousOutboundAt,
    },
    select: { id: true },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      conversationKey: `${prefix}-business:${waId}`,
      channel: "whatsapp",
      provider: "meta",
      mode: "HUMAN",
      status: "WAITING",
      closedAt: deletedAt,
      lastOutboundAt: previousOutboundAt,
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      return new Response(JSON.stringify({ messages: [{ id: `wamid.reactivated.${safeTemplatePrefix}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await request<{ ok: boolean; campaign: { id: string } }>(
    "POST",
    "/app/campaigns",
    businessAdmin,
    {
      name: "Envio reativa conversa excluida",
      templateId: template.id,
      recipients: [waId],
    }
  );
  assert.equal(response.status, 200);

  await waitFor(async () => {
    const event = await prisma.event.findFirst({
      where: {
        clientId: businessClientId,
        eventName: "campaign.recipient.conversation_reactivated",
        conversationId: conversation.id,
      },
      select: { id: true },
    });
    return Boolean(event);
  });

  const updated = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversation.id },
    select: { deletedAt: true, anonymizedAt: true, lastOutboundAt: true },
  });
  assert.equal(updated.deletedAt, null);
  assert.equal(updated.anonymizedAt, null);
  assert.ok((updated.lastOutboundAt?.getTime() ?? 0) > previousOutboundAt.getTime());
  assert.equal(await prisma.conversation.count({ where: { clientId: businessClientId, waId } }), 1);
  const runtime = await prisma.conversationRuntimeState.findUniqueOrThrow({
    where: { clientId_waId: { clientId: businessClientId, waId } },
    select: { status: true, mode: true, closedAt: true, lastOutboundMessageId: true },
  });
  assert.equal(runtime.status, "WAITING");
  assert.equal(runtime.mode, "HUMAN");
  assert.equal(runtime.closedAt, null);
  assert.equal(runtime.lastOutboundMessageId, `campaign.${response.body.campaign.id}.1`);

  const reactivatedEvent = await prisma.event.findFirstOrThrow({
    where: {
      clientId: businessClientId,
      eventName: "campaign.recipient.conversation_reactivated",
      conversationId: conversation.id,
    },
    select: { payloadJson: true },
  });
  assert.equal((reactivatedEvent.payloadJson as { reason?: string }).reason, "outbound_template_sent");
  assert.equal(JSON.stringify(reactivatedEvent.payloadJson).includes(waId), false);

  const list = await request<{
    ok: boolean;
    conversations: Array<{ waId: string; lastMessage: { direction: string; type: string } | null }>;
  }>("GET", `/app/conversations?search=${encodeURIComponent(waId)}&limit=10`, businessAdmin);
  assert.equal(list.status, 200);
  const listItem = list.body.conversations.find((item) => item.waId === waId);
  assert.ok(listItem);
  assert.equal(listItem.lastMessage?.direction, "OUTBOUND");
  assert.equal(listItem.lastMessage?.type, "TEMPLATE");
});

test("campaign send does not reactivate anonymized soft-deleted conversation", async (t) => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `campaign_skip_anonymized_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Retorno bloqueado",
    },
  });
  const waId = "558494817470";
  const deletedAt = new Date("2026-01-04T10:00:00.000Z");
  const anonymizedAt = new Date("2026-01-04T10:01:00.000Z");
  const conversation = await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      deletedAt,
      anonymizedAt,
      lastOutboundAt: new Date("2026-01-01T10:00:00.000Z"),
    },
    select: { id: true },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      return new Response(JSON.stringify({ messages: [{ id: `wamid.anonymized.${safeTemplatePrefix}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await request<{ ok: boolean; campaign: { id: string } }>(
    "POST",
    "/app/campaigns",
    businessAdmin,
    {
      name: "Envio nao reativa anonimizada",
      templateId: template.id,
      recipients: [waId],
    }
  );
  assert.equal(response.status, 200);

  await waitFor(async () => {
    const count = await prisma.outboundMessage.count({
      where: { clientId: businessClientId, messageId: { startsWith: `campaign.${response.body.campaign.id}.` } },
    });
    return count === 1;
  });

  const preserved = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversation.id },
    select: { deletedAt: true, anonymizedAt: true, lastOutboundAt: true },
  });
  assert.deepEqual(preserved.deletedAt, deletedAt);
  assert.deepEqual(preserved.anonymizedAt, anonymizedAt);
  assert.equal(await prisma.conversation.count({ where: { clientId: businessClientId, waId } }), 1);
  assert.equal(await prisma.contact.count({ where: { clientId: businessClientId, waId } }), 0);
  assert.equal(await prisma.lead.count({ where: { tenantId: businessClientId, waId } }), 0);
  assert.equal(
    await prisma.event.count({
      where: { clientId: businessClientId, eventName: "campaign.recipient.conversation_reactivated", conversationId: conversation.id },
    }),
    0
  );

  const outbound = await prisma.outboundMessage.findFirstOrThrow({
    where: { clientId: businessClientId, messageId: { startsWith: `campaign.${response.body.campaign.id}.` } },
    select: { rawPayload: true },
  });
  assert.equal((outbound.rawPayload as { conversationId?: string | null }).conversationId, null);
});

test("campaign send creates inbox conversation and timeline for new recipient", async (t) => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `campaign_new_conversation_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Ola {{1}}, aviso inicial",
    },
  });
  const waId = "5584951957784";
  const anonymizedWaId = "5584******7784:anon001";
  const anonymizedLead = await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId: anonymizedWaId,
      waIdCanonical: anonymizedWaId,
      name: "Usuario Anonimizado",
      phone: anonymizedWaId,
      status: "NEW",
    },
    select: { id: true },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      const payload = JSON.parse(String(init?.body ?? "{}")) as { to?: string };
      assert.equal(payload.to, waId);
      return new Response(JSON.stringify({ messages: [{ id: `wamid.new.${safeTemplatePrefix}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await request<{ ok: boolean; campaign: { id: string } }>(
    "POST",
    "/app/campaigns",
    businessAdmin,
    {
      name: "Envio cria conversa",
      templateId: template.id,
      recipients: [waId],
      templateParams: ["Cliente Novo"],
    }
  );
  assert.equal(response.status, 200);

  await waitFor(async () => {
    const event = await prisma.event.findFirst({
      where: {
        clientId: businessClientId,
        eventName: "campaign.message.sent",
        messageId: `campaign.${response.body.campaign.id}.1`,
        conversationId: { not: null },
      },
      select: { id: true },
    });
    return Boolean(event);
  });

  const conversation = await prisma.conversation.findFirstOrThrow({
    where: { clientId: businessClientId, waId },
    select: {
      id: true,
      channel: true,
      provider: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      departmentId: true,
      anonymizedAt: true,
      deletedAt: true,
    },
  });
  assert.equal(conversation.channel, "whatsapp");
  assert.equal(conversation.provider, "meta");
  assert.equal(conversation.lastInboundAt, null);
  assert.ok(conversation.lastOutboundAt);
  assert.ok(conversation.departmentId);
  assert.equal(conversation.anonymizedAt, null);
  assert.equal(conversation.deletedAt, null);

  const contact = await prisma.contact.findUniqueOrThrow({
    where: { clientId_waId: { clientId: businessClientId, waId } },
    select: { id: true, name: true, channel: true, provider: true, externalUserHash: true },
  });
  assert.equal(contact.name, null);
  assert.equal(contact.channel, "whatsapp");
  assert.equal(contact.provider, "meta");
  assert.ok(contact.externalUserHash?.startsWith("whatsapp:"));

  const lead = await prisma.lead.findUniqueOrThrow({
    where: { tenantId_waId: { tenantId: businessClientId, waId } },
    select: { id: true, name: true, phone: true, channel: true, provider: true, contactChannelIdentityId: true },
  });
  assert.equal(lead.name, null);
  assert.equal(lead.phone, waId);
  assert.equal(lead.channel, "whatsapp");
  assert.equal(lead.provider, "meta");
  assert.ok(lead.contactChannelIdentityId);
  const identity = await prisma.contactChannelIdentity.findUniqueOrThrow({
    where: { id: lead.contactChannelIdentityId },
    select: { displayName: true, legacyWaId: true },
  });
  assert.equal(identity.displayName, null);
  assert.equal(identity.legacyWaId, waId);

  const preservedAnonymizedLead = await prisma.lead.findUniqueOrThrow({
    where: { id: anonymizedLead.id },
    select: { waId: true, waIdCanonical: true, name: true, phone: true },
  });
  assert.equal(preservedAnonymizedLead.waId, anonymizedWaId);
  assert.equal(preservedAnonymizedLead.waIdCanonical, anonymizedWaId);
  assert.equal(preservedAnonymizedLead.name, "Usuario Anonimizado");
  assert.equal(preservedAnonymizedLead.phone, anonymizedWaId);

  const runtime = await prisma.conversationRuntimeState.findUniqueOrThrow({
    where: { clientId_waId: { clientId: businessClientId, waId } },
    select: {
      mode: true,
      status: true,
      queueId: true,
      departmentId: true,
      lastOutboundMessageId: true,
      assignedUserId: true,
    },
  });
  assert.equal(runtime.mode, "HUMAN");
  assert.equal(runtime.status, "WAITING");
  assert.equal(runtime.assignedUserId, null);
  assert.ok(runtime.departmentId);
  assert.ok(runtime.queueId);
  assert.equal(runtime.lastOutboundMessageId, `campaign.${response.body.campaign.id}.1`);

  const creationEvent = await prisma.event.findFirstOrThrow({
    where: {
      clientId: businessClientId,
      eventName: "campaign.recipient.conversation_created",
      conversationId: conversation.id,
    },
    select: { payloadJson: true },
  });
  assert.equal((creationEvent.payloadJson as { matchedBy?: string }).matchedBy, "new_recipient");
  assert.equal(JSON.stringify(creationEvent.payloadJson).includes(waId), false);

  const list = await request<{
    ok: boolean;
    conversations: Array<{
      waId: string;
      leadId: string | null;
      leadName: string | null;
      leadPhone: string | null;
      status: string | null;
      mode: string | null;
      lastMessage: { direction: string; type: string; templateName: string | null; bodyText: string | null } | null;
    }>;
  }>("GET", `/app/conversations?search=${encodeURIComponent(waId)}&limit=10`, businessAdmin);
  assert.equal(list.status, 200);
  const listItem = list.body.conversations.find((item) => item.waId === waId);
  assert.ok(listItem);
  assert.equal(listItem.leadId, lead.id);
  assert.equal(listItem.leadName, null);
  assert.equal(listItem.leadPhone, waId);
  assert.equal(listItem.status, "WAITING");
  assert.equal(listItem.mode, "HUMAN");
  assert.equal(listItem.lastMessage?.direction, "OUTBOUND");
  assert.equal(listItem.lastMessage?.type, "TEMPLATE");
  assert.equal(listItem.lastMessage?.templateName, template.name);
  assert.equal(listItem.lastMessage?.bodyText, "Ola Cliente Novo, aviso inicial");

  const detail = await request<{
    ok: boolean;
    items: Array<{
      direction: string;
      type: string;
      bodyText: string | null;
      templateName: string | null;
      messageId: string | null;
    }>;
  }>("GET", `/app/conversation/${encodeURIComponent(waId)}?order=asc`, businessAdmin);
  assert.equal(detail.status, 200);
  assert.ok(
    detail.body.items.some(
      (item) =>
        item.direction === "OUTBOUND" &&
        item.type === "TEMPLATE" &&
        item.bodyText === "Ola Cliente Novo, aviso inicial" &&
        item.templateName === template.name &&
        item.messageId === `campaign.${response.body.campaign.id}.1`
    )
  );
});

test("campaign send failure does not reactivate soft-deleted conversation or CRM bootstrap", async (t) => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `campaign_failure_no_conversation_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Aviso nao entregue",
    },
  });
  const waId = "5584951957799";
  const deletedAt = new Date("2026-01-05T10:00:00.000Z");
  const conversation = await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      deletedAt,
      lastOutboundAt: new Date("2026-01-01T10:00:00.000Z"),
    },
    select: { id: true },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      return new Response(JSON.stringify({ error: { message: "Meta unavailable" } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await request<{ ok: boolean; campaign: { id: string } }>(
    "POST",
    "/app/campaigns",
    businessAdmin,
    {
      name: "Envio falha sem reativar conversa",
      templateId: template.id,
      recipients: [waId],
    }
  );
  assert.equal(response.status, 200);

  await waitFor(async () => {
    const campaign = await prisma.campaign.findUnique({
      where: { id: response.body.campaign.id },
      select: { status: true },
    });
    return campaign?.status === "failed";
  });

  const preserved = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversation.id },
    select: { deletedAt: true, anonymizedAt: true },
  });
  assert.deepEqual(preserved.deletedAt, deletedAt);
  assert.equal(preserved.anonymizedAt, null);
  assert.equal(await prisma.conversation.count({ where: { clientId: businessClientId, waId } }), 1);
  assert.equal(await prisma.conversationRuntimeState.count({ where: { clientId: businessClientId, waId } }), 0);
  assert.equal(await prisma.contact.count({ where: { clientId: businessClientId, waId } }), 0);
  assert.equal(await prisma.lead.count({ where: { tenantId: businessClientId, waId } }), 0);
  assert.equal(
    await prisma.event.count({
      where: { clientId: businessClientId, eventName: "campaign.recipient.conversation_reactivated", conversationId: conversation.id },
    }),
    0
  );
});

test("campaign recipient bridge does not cross tenants and skips ambiguous matches", async (t) => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `campaign_bridge_isolation_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Aviso de isolamento",
    },
  });
  const otherTenantWaId = "554198889614";
  await prisma.conversation.create({
    data: {
      clientId: governmentClientId,
      waId: otherTenantWaId,
      waIdCanonical: otherTenantWaId,
      channel: "whatsapp",
      provider: "meta",
      lastInboundAt: new Date("2026-01-01T09:00:00.000Z"),
    },
  });
  await prisma.conversation.createMany({
    data: [
      {
        clientId: businessClientId,
        waId: "554176549614",
        waIdCanonical: "554176549614",
        channel: "whatsapp",
        provider: "meta",
        lastInboundAt: new Date("2026-01-01T09:00:00.000Z"),
      },
      {
        clientId: businessClientId,
        waId: "alt-554176549614",
        waIdCanonical: null,
        channel: "whatsapp",
        provider: "meta",
        lastInboundAt: new Date("2026-01-01T09:05:00.000Z"),
      },
    ],
  });

  const originalFetch = globalThis.fetch;
  const metaPayloads: unknown[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      metaPayloads.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ messages: [{ id: `wamid.isolation.${metaPayloads.length}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const crossTenant = await request<{ ok: boolean; campaign: { id: string } }>(
    "POST",
    "/app/campaigns",
    businessAdmin,
    {
      name: "Envio sem cruzar tenant",
      templateId: template.id,
      recipients: [otherTenantWaId],
    }
  );
  assert.equal(crossTenant.status, 200);
  const ambiguousInput = "5541976549614";
  const ambiguous = await request<{ ok: boolean; campaign: { id: string } }>(
    "POST",
    "/app/campaigns",
    businessAdmin,
    {
      name: "Envio ambiguo",
      templateId: template.id,
      recipients: [ambiguousInput],
    }
  );
  assert.equal(ambiguous.status, 200);

  await waitFor(async () => {
    const count = await prisma.outboundMessage.count({
      where: {
        clientId: businessClientId,
        messageId: {
          in: [`campaign.${crossTenant.body.campaign.id}.1`, `campaign.${ambiguous.body.campaign.id}.1`],
        },
      },
    });
    return count === 2;
  });

  const metaRecipients = metaPayloads.map((payload) => (payload as { to?: string }).to);
  assert.equal(metaRecipients.includes(otherTenantWaId), true);
  assert.equal(metaRecipients.includes(ambiguousInput), true);

  const crossTenantEvent = await prisma.event.findFirst({
    where: {
      clientId: businessClientId,
      eventName: "campaign.recipient.conversation_resolved",
      messageId: `campaign.${crossTenant.body.campaign.id}.1`,
    },
  });
  assert.equal(crossTenantEvent, null);
  const governmentConversation = await prisma.conversation.findFirstOrThrow({
    where: { clientId: governmentClientId, waId: otherTenantWaId },
    select: { lastOutboundAt: true },
  });
  assert.equal(governmentConversation.lastOutboundAt, null);

  const ambiguousEvent = await prisma.event.findFirst({
    where: {
      clientId: businessClientId,
      eventName: "campaign.recipient.conversation_resolution_ambiguous",
    },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });
  assert.ok(ambiguousEvent);
  assert.equal((ambiguousEvent.payloadJson as { reason?: string }).reason, "ambiguous");
  assert.equal(JSON.stringify(ambiguousEvent.payloadJson).includes(ambiguousInput), false);
  const usageEvents = await prisma.event.findMany({
    where: {
      clientId: businessClientId,
      eventName: "meta.usage.estimated",
      messageId: {
        in: [`campaign.${crossTenant.body.campaign.id}.1`, `campaign.${ambiguous.body.campaign.id}.1`],
      },
    },
    orderBy: { messageId: "asc" },
  });
  assert.equal(usageEvents.length, 2);
  for (const event of usageEvents) {
    const payload = event.payloadJson as Record<string, unknown>;
    assert.equal(payload.source, "manual_campaign_send");
    assert.equal(payload.messageKind, "template");
    assert.equal(payload.metaCategory, "utility");
    assert.equal(payload.campaignId === crossTenant.body.campaign.id || payload.campaignId === ambiguous.body.campaign.id, true);
    assert.equal(JSON.stringify(payload).includes(otherTenantWaId), false);
    assert.equal(JSON.stringify(payload).includes(ambiguousInput), false);
  }
});

test("campaign draft send blocks mapped recipients without value or fallback", async () => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `draft_variable_block_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Ola {{1}}, sua cidade e {{2}}.",
    },
  });
  const waId = "5541991189104";
  const lead = await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      name: "Sem Cidade",
      phone: waId,
      city: "",
      status: "RETORNO_FUTURO",
    },
  });

  const created = await request<{
    ok: boolean;
    campaign: { id: string; status: string; totalRecipients: number };
  }>("POST", "/app/campaigns/drafts", businessAdmin, {
    name: "Rascunho variavel bloqueada",
    templateId: template.id,
    selectedLeadIds: [lead.id],
    templateVariableMappings: [
      { position: "1", source: "contact.displayName" },
      { position: "2", source: "lead.city" },
    ],
  });
  assert.equal(created.status, 200);

  const send = await request<ErrorPayload>(
    "POST",
    `/app/campaigns/${created.body.campaign.id}/send`,
    businessAdmin
  );
  assert.equal(send.status, 400);
  assert.equal(getErrorCode(send.body), "no_eligible_recipients");

  const campaign = await prisma.campaign.findUnique({
    where: { id: created.body.campaign.id },
    select: { status: true },
  });
  assert.equal(campaign?.status, "draft");
  const seed = await prisma.event.findFirst({
    where: {
      clientId: businessClientId,
      eventName: "campaign.seed.saved",
      messageId: created.body.campaign.id,
    },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });
  assert.ok(seed);
  const summary = (seed.payloadJson as { summary?: { blockedByReason?: Array<{ reason: string; count: number }> } })
    .summary;
  assert.ok(summary?.blockedByReason?.some((item) => item.reason === "variable_missing_value" && item.count === 1));
  const outboundCount = await prisma.outboundMessage.count({ where: { clientId: businessClientId, waId } });
  assert.equal(outboundCount, 0);
});

test("tenant override can enable campaigns for a non-business profile", async () => {
  const response = await request<{ ok: boolean; count: number }>(
    "GET",
    "/app/campaigns",
    overrideAdmin
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.count, 0);
});

test("tenant kill switch can disable campaigns for business profile", async () => {
  const response = await request<ErrorPayload>("GET", "/app/campaigns", killSwitchAdmin);

  assert.equal(response.status, 403);
  assert.equal(getErrorCode(response.body), "feature_not_enabled");
  assert.equal(response.body.feature, "campaigns");
});

test("campaign export reports delivered utility messages as billable", async () => {
  const campaign = await prisma.campaign.create({
    data: {
      clientId: businessClientId,
      name: "CRA-PR consumo",
      templateName: "cra_pr_utility",
      status: "completed",
      totalRecipients: 3,
      sentCount: 3,
      blockedCount: 0,
    },
  });
  await prisma.outboundMessage.createMany({
    data: [
      {
        clientId: businessClientId,
        waId: "5541999990001",
        waIdCanonical: "5541999990001",
        messageId: `campaign.${campaign.id}.1`,
        type: "TEMPLATE",
        status: "SENT",
        templateName: "cra_pr_utility",
        rawPayload: {
          campaignId: campaign.id,
          metaStatus: {
            lastStatus: "delivered",
            lastStatusAt: "2026-07-13T10:00:00.000Z",
            pricingCategory: "utility",
            pricingBillable: true,
            pricingModel: "PMP",
          },
        },
      },
      {
        clientId: businessClientId,
        waId: "5541999990002",
        waIdCanonical: "5541999990002",
        messageId: `campaign.${campaign.id}.2`,
        type: "TEMPLATE",
        status: "SENT",
        templateName: "cra_pr_utility",
        rawPayload: {
          campaignId: campaign.id,
          metaStatus: {
            lastStatus: "sent",
            lastStatusAt: "2026-07-13T10:01:00.000Z",
            pricingCategory: "utility",
            pricingBillable: true,
            pricingModel: "PMP",
          },
        },
      },
      {
        clientId: businessClientId,
        waId: "5541999990003",
        waIdCanonical: "5541999990003",
        messageId: `campaign.${campaign.id}.3`,
        type: "TEMPLATE",
        status: "FAILED",
        templateName: "cra_pr_utility",
        errorBody: "blocked by opt-out",
        rawPayload: {
          campaignId: campaign.id,
          metaStatus: {
            lastStatus: "failed",
            pricingCategory: "utility",
            pricingBillable: false,
            pricingModel: "PMP",
          },
        },
      },
    ],
  });

  const response = await requestText("GET", `/app/campaigns/${campaign.id}/export`, businessAdmin);

  assert.equal(response.status, 200);
  assert.match(response.contentType ?? "", /text\/csv/);
  assert.match(response.text, /campaign_id,campaign_name,template,category,contact,status,sent_at,delivered_at,billable,non_billing_reason/);
  assert.match(response.text, /5541999990001,delivered,/);
  assert.match(response.text, /5541999990001,delivered,[^\n]*,sim,/);
  assert.match(response.text, /5541999990002,sent,[^\n]*,nao,nao_entregue/);
  assert.match(response.text, /5541999990003,failed,[^\n]*,nao,falha/);
});

test("event-based opt-out blocks recipient in app campaign and export", async () => {
  const waId = "5541999981001";
  const optOut = await request<{ ok: boolean; status: string; waIdCanonical: string }>(
    "POST",
    "/app/campaigns/opt-out",
    businessAdmin,
    {
      waId,
      channel: "whatsapp",
      source: "manual",
      reason: "descadastro solicitado",
      note: "Pedido registrado em atendimento",
    }
  );

  assert.equal(optOut.status, 200);
  assert.equal(optOut.body.ok, true);
  assert.equal(optOut.body.status, "recorded");

  const created = await request<{
    ok: boolean;
    campaign: {
      id: string;
      campaignId: string;
      totalRecipients: number;
      sentCount: number;
      blockedCount: number;
    };
  }>("POST", "/app/campaigns", businessAdmin, {
    name: "Campanha com opt-out",
    templateName: "cra_pr_utility",
    recipients: [waId],
  });

  assert.equal(created.status, 200);
  assert.equal(created.body.ok, true);
  assert.equal(created.body.campaign.totalRecipients, 1);
  assert.equal(created.body.campaign.blockedCount, 1);
  assert.equal(created.body.campaign.sentCount, 0);

  const outboundCount = await prisma.outboundMessage.count({
    where: {
      clientId: businessClientId,
      waId,
    },
  });
  assert.equal(outboundCount, 0);

  const response = await requestText(
    "GET",
    `/app/campaigns/${created.body.campaign.id}/export`,
    businessAdmin
  );
  assert.equal(response.status, 200);
  assert.match(response.text, /5541999981001,opt_out,[^\n]*,nao,opt_out/);
});

test("event-based opt-out revoke allows recipient and tenant isolation is preserved", async () => {
  const waId = "5541999981002";
  await recordContactOptOut({
    clientId: businessClientId,
    waId,
    source: "test",
    reason: "tenant business block",
  });

  const otherTenantFilter = await filterOptedOutCampaignRecipients(prisma, {
    clientId: overrideClientId,
    waIds: [waId],
  });
  assert.deepEqual(otherTenantFilter.allowed, [waId]);
  assert.deepEqual(otherTenantFilter.blocked, []);

  const blocked = await filterOptedOutCampaignRecipients(prisma, {
    clientId: businessClientId,
    waIds: [waId],
  });
  assert.deepEqual(blocked.allowed, []);
  assert.equal(blocked.blocked.length, 1);

  await revokeContactOptOut({
    clientId: businessClientId,
    waId,
    source: "test",
    reason: "consent restored",
  });

  const revoked = await filterOptedOutCampaignRecipients(prisma, {
    clientId: businessClientId,
    waIds: [waId],
  });
  assert.deepEqual(revoked.allowed, [waId]);
  assert.deepEqual(revoked.blocked, []);
});

test("campaign export remains capability protected", async () => {
  const response = await request<ErrorPayload>("GET", "/app/campaigns/missing/export", governmentAdmin);

  assert.equal(response.status, 403);
  assert.equal(getErrorCode(response.body), "feature_not_enabled");
  assert.equal(response.body.feature, "campaigns");
});
