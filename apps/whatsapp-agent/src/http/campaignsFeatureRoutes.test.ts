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
  await prisma.appAuthSession.deleteMany({
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
      features: { campaigns: true },
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

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.count, 0);
});

test("government profile default is blocked from campaigns routes", async () => {
  const routes = [
    { method: "GET", route: "/app/campaigns" },
    { method: "GET", route: "/app/campaigns/audience-preview" },
    { method: "POST", route: "/app/campaigns/drafts", body: { name: "Draft", templateId: "missing", selectedLeadIds: ["lead"] } },
    { method: "POST", route: "/app/campaigns/missing/send" },
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
      name: string;
      status: string;
      metaTemplateId: string | null;
      canUseInCampaign: boolean;
      canUseInInbox: boolean;
      blockedReason: string | null;
      blockedReasonLabel: string | null;
      variablesDetected: string[];
      componentsSummary: Array<{ type: string; text: string }>;
    }>;
  }>("GET", "/app/templates?clientId=malicious", businessAdmin);

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.items.some((item) => item.name.includes("other_tenant")), false);

  const approved = response.body.items.find((item) => item.name === `approved_template_${prefix}`);
  assert.ok(approved);
  assert.equal(approved.canUseInCampaign, true);
  assert.equal(approved.canUseInInbox, true);
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
  await prisma.templateRequest.createMany({
    data: [
      {
        clientId: businessClientId,
        name: `tenant_visible_${safeTemplatePrefix}`,
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
  assert.equal(response.body.items.some((item) => item.name === `tenant_visible_${safeTemplatePrefix}`), true);
  assert.equal(response.body.items.some((item) => item.name === `tenant_hidden_${safeTemplatePrefix}`), false);
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
      content: "Ola {{1}}",
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
    templateParams: ["Cliente"],
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
