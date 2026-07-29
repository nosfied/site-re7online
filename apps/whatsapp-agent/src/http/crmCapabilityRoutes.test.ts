import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { APP_AUTH_SESSION_EXPIRES_AT } from "../auth/appSessionService.js";
import { issueClientAuthToken } from "../auth/clientAuth.js";
import { normalizeOptOutWaId } from "../campaigns/optOutRegistry.js";
import { getPrisma } from "../db.js";

process.env.APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "crm-capability-route-test-secret";

type TestResponse<T = unknown> = {
  status: number;
  body: T;
};

type ErrorPayload = {
  error?: string | { code?: string; message?: string };
  message?: string;
  capability?: string;
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
const prefix = `crm-capability-${process.pid}-${Date.now()}`;

let tempRoot = "";
let server: Server;
let baseUrl = "";
let handleRequest: typeof import("./routes.js").handleRequest;

let businessClientId = "";
let governmentClientId = "";
let overrideClientId = "";
let businessAdmin: TestUser;
let businessAgent: TestUser;
let governmentAdmin: TestUser;
let overrideAdmin: TestUser;
let leadId = "";
let instagramLeadId = "";
let otherTenantLeadId = "";
let leadConversationId = "";

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
      name: `CRM ${params.role} ${params.suffix}`,
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
  await prisma.conversationAssignment.deleteMany({
    where: {
      conversation: {
        clientId: {
          in: clientIds,
        },
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
  await prisma.message.deleteMany({
    where: {
      conversation: {
        clientId: {
          in: clientIds,
        },
      },
    },
  });
  await prisma.conversationMetrics.deleteMany({
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
  await prisma.leadNote.deleteMany({
    where: {
      tenantId: {
        in: clientIds,
      },
    },
  });
  await prisma.contactChannelIdentity.deleteMany({
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
  await prisma.lead.deleteMany({
    where: {
      tenantId: {
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
  await prisma.appAuthSession.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.tenantOperationalConfig.deleteMany({
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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "re7-crm-capability-routes-"));
  process.chdir(tempRoot);
  await cleanup();

  const businessClient = await prisma.client.create({
    data: {
      clientKey: `${prefix}-business`,
      name: "CRM Capability Business",
      profile: "business",
      features: {},
    },
    select: { id: true, clientKey: true },
  });
  const governmentClient = await prisma.client.create({
    data: {
      clientKey: `${prefix}-government`,
      name: "CRM Capability Government",
      profile: "government",
      features: {},
    },
    select: { id: true, clientKey: true },
  });
  const overrideClient = await prisma.client.create({
    data: {
      clientKey: `${prefix}-override`,
      name: "CRM Capability Override",
      profile: "government",
      features: { crm: true },
    },
    select: { id: true, clientKey: true },
  });

  businessClientId = businessClient.id;
  governmentClientId = governmentClient.id;
  overrideClientId = overrideClient.id;
  await writeTenants([businessClient.clientKey, governmentClient.clientKey, overrideClient.clientKey]);

  businessAdmin = await createUser({
    clientId: businessClientId,
    role: "ADMIN",
    suffix: "business-admin",
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

  const lead = await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId: `${prefix}-lead-waid`,
      waIdCanonical: `${prefix}-lead-waid`,
      phone: "5511999999999",
      name: "Lead CRM Capability",
      status: "QUALIFIED",
    },
    select: { id: true },
  });
  leadId = lead.id;

  await prisma.contact.create({
    data: {
      clientId: businessClientId,
      waId: "5511999999999",
      name: "Lead CRM Capability",
      channel: "whatsapp",
      provider: "meta",
    },
    select: { id: true },
  });
  leadConversationId = crypto.randomUUID();
  await prisma.conversation.create({
    data: {
      id: leadConversationId,
      clientId: businessClientId,
      waId: `${prefix}-lead-waid`,
      waIdCanonical: `${prefix}-lead-waid`,
      channel: "whatsapp",
      provider: "meta",
      windowIsOpen: true,
      updatedAt: new Date("2026-07-28T10:00:00.000Z"),
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId: `${prefix}-lead-waid`,
      waIdCanonical: `${prefix}-lead-waid`,
      conversationKey: `${businessClient.clientKey}:${prefix}-lead-waid`,
      channel: "whatsapp",
      provider: "meta",
      status: "WAITING",
      answers: {},
      updatedAt: new Date("2026-07-28T10:01:00.000Z"),
    },
  });
  const optOutIdentity = normalizeOptOutWaId("5511999999999");
  assert.ok(optOutIdentity);
  await prisma.event.create({
    data: {
      clientId: businessClientId,
      waId: optOutIdentity.waId,
      waIdCanonical: optOutIdentity.waIdCanonical,
      requestId: `${prefix}-opt-out-recorded`,
      eventName: "contact.opt_out.recorded",
      payloadJson: { source: "manual", channel: "whatsapp" },
    },
  });
  await prisma.event.create({
    data: {
      clientId: businessClientId,
      waId: `${prefix}-lead-waid`,
      waIdCanonical: `${prefix}-lead-waid`,
      requestId: `${prefix}-import-source`,
      eventName: "contact.imported_for_campaign",
      payloadJson: { source: "pdf_inativos", classification: "RETORNO_FUTURO" },
    },
  });

  const instagramContact = await prisma.contact.create({
    data: {
      clientId: businessClientId,
      waId: `instagram:${prefix}:sender`,
      channel: "instagram",
      provider: "meta",
      channelAccountId: "ig-account-business",
      externalUserHash: `hash:${prefix}:instagram`,
    },
    select: { id: true },
  });
  const instagramIdentity = await prisma.contactChannelIdentity.create({
    data: {
      clientId: businessClientId,
      contactId: instagramContact.id,
      channel: "instagram",
      provider: "meta",
      channelAccountId: "ig-account-business",
      externalUserHash: `hash:${prefix}:instagram`,
      displayName: "Cliente Instagram",
    },
    select: { id: true },
  });
  const instagramLead = await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId: `instagram:${prefix}:sender`,
      waIdCanonical: `instagram:${prefix}:sender`,
      channel: "instagram",
      provider: "meta",
      channelAccountId: "ig-account-business",
      externalUserHash: `hash:${prefix}:instagram`,
      contactChannelIdentityId: instagramIdentity.id,
      company: "Empresa Instagram",
      status: "RETORNO_FUTURO",
    },
    select: { id: true },
  });
  instagramLeadId = instagramLead.id;

  await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId: `${prefix}-partial-webchat`,
      waIdCanonical: `${prefix}-partial-webchat`,
      channel: "webchat",
      provider: "converta",
      status: "OPEN",
    },
  });
  const otherTenantLead = await prisma.lead.create({
    data: {
      tenantId: governmentClientId,
      waId: `${prefix}-other-tenant`,
      waIdCanonical: `${prefix}-other-tenant`,
      name: "Lead Outro Tenant",
      phone: "5541999900000",
      status: "QUALIFIED",
    },
    select: { id: true },
  });
  otherTenantLeadId = otherTenantLead.id;

  await prisma.tenantOperationalConfig.create({
    data: {
      clientId: businessClientId,
      schemaVersion: 1,
      config: {
        crmBusinessStatuses: [
          {
            id: "QUALIFIED",
            label: "Qualificado",
            isActive: true,
            campaignEligible: true,
          },
          {
            id: "OPEN",
            label: "Em aberto",
            isActive: true,
            campaignEligible: true,
          },
          {
            id: "RETORNO_FUTURO",
            label: "Retorno futuro",
            isActive: true,
            campaignEligible: true,
          },
        ],
      },
    },
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
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await cleanup();
  await prisma.$disconnect();
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("business profile default can access CRM app routes without capability denial", async () => {
  const settings = await request<{ ok: boolean }>("GET", "/app/crm/settings", businessAdmin);
  assert.equal(settings.status, 200);
  assert.equal(settings.body.ok, true);

  const recipients = await request<{ ok: boolean; count: number }>(
    "GET",
    "/app/crm/campaign-recipients?statuses=QUALIFIED&limit=10",
    businessAdmin
  );
  assert.equal(recipients.status, 200);
  assert.equal(recipients.body.ok, true);
  assert.equal(recipients.body.count, 1);

  const update = await request<{ ok: boolean; lead: { name: string | null } }>(
    "PATCH",
    `/app/lead/${encodeURIComponent(leadId)}`,
    businessAdmin,
    { name: "Lead atualizado" }
  );
  assert.equal(update.status, 200);
  assert.equal(update.body.ok, true);
  assert.equal(update.body.lead.name, "Lead atualizado");

  const status = await request<{ ok: boolean; lead: { status: string } }>(
    "PATCH",
    `/app/lead/${encodeURIComponent(leadId)}/status`,
    businessAdmin,
    { status: "OPEN" }
  );
  assert.equal(status.status, 200);
  assert.equal(status.body.ok, true);
  assert.equal(status.body.lead.status, "OPEN");

  const createNote = await request<{ ok: boolean; note: { body: string } }>(
    "POST",
    `/app/lead/${encodeURIComponent(leadId)}/notes`,
    businessAdmin,
    { body: "Nota criada pelo teste de capability CRM" }
  );
  assert.equal(createNote.status, 200);
  assert.equal(createNote.body.ok, true);
  assert.equal(createNote.body.note.body, "Nota criada pelo teste de capability CRM");

  const listNotes = await request<{ ok: boolean; count: number }>(
    "GET",
    `/app/lead/${encodeURIComponent(leadId)}/notes`,
    businessAdmin
  );
  assert.equal(listNotes.status, 200);
  assert.equal(listNotes.body.ok, true);
  assert.equal(listNotes.body.count, 1);
});

test("CRM operational statuses are tenant-scoped and allow custom lead statuses", async () => {
  const statuses = await request<{
    ok: boolean;
    settings: { crmBusinessStatuses: Array<{ id: string; label: string }> };
  }>("GET", "/app/crm/statuses", businessAgent);
  assert.equal(statuses.status, 200);
  assert.equal(statuses.body.ok, true);
  assert.deepEqual(
    statuses.body.settings.crmBusinessStatuses.map((item) => item.id),
    ["QUALIFIED", "OPEN", "RETORNO_FUTURO"]
  );

  const update = await request<{ ok: boolean; lead: { status: string } }>(
    "PATCH",
    `/app/lead/${encodeURIComponent(leadId)}/status`,
    businessAdmin,
    { status: "RETORNO_FUTURO" }
  );
  assert.equal(update.status, 200);
  assert.equal(update.body.ok, true);
  assert.equal(update.body.lead.status, "RETORNO_FUTURO");
});

test("CRM contacts read model lists tenant-scoped leads with safe identifiers", async () => {
  const response = await request<{
    ok: boolean;
    items: Array<{
      leadId: string;
      contactId: string | null;
      displayName: string | null;
      phoneDisplay: string | null;
      identifierDisplay: string;
      channel: string | null;
      crmStatus: string;
      crmStatusLabel: string;
      lastConversationId: string | null;
      lastConversationIdentity: string | null;
      lastProtocol: string | null;
      lastConversationStatus: string | null;
      conversationsCount: number;
      hasConversation: boolean;
      activeOptOut: boolean;
      importedSource: string | null;
      hasValidWhatsappIdentity: boolean;
      canStartWhatsappTemplateCandidate: boolean;
      templateSendBlockedReason: string | null;
    }>;
  }>("GET", "/app/crm/contacts?limit=20", businessAgent);

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  const whatsapp = response.body.items.find((item) => item.leadId === leadId);
  assert.ok(whatsapp);
  assert.equal(whatsapp.displayName, "Lead atualizado");
  assert.equal(whatsapp.channel, null);
  assert.equal(whatsapp.crmStatus, "RETORNO_FUTURO");
  assert.equal(whatsapp.crmStatusLabel, "Retorno futuro");
  assert.equal(whatsapp.hasConversation, true);
  assert.equal(whatsapp.conversationsCount, 1);
  assert.equal(whatsapp.lastConversationId, leadConversationId);
  assert.equal(whatsapp.lastConversationIdentity, `${prefix}-lead-waid`);
  assert.match(whatsapp.lastProtocol ?? "", /^CVT-[0-9A-F]{12}$/);
  assert.equal(whatsapp.lastConversationStatus, "WAITING");
  assert.equal(whatsapp.activeOptOut, true);
  assert.equal(whatsapp.canStartWhatsappTemplateCandidate, false);
  assert.equal(whatsapp.templateSendBlockedReason, "opt_out");
  assert.match(whatsapp.phoneDisplay ?? "", /^\d{4}\*{5}\d{4}$/);
  assert.doesNotMatch(JSON.stringify(response.body), /rawPayload|hash:/);

  const instagram = response.body.items.find((item) => item.leadId === instagramLeadId);
  assert.ok(instagram);
  assert.equal(instagram.displayName, "Cliente Instagram");
  assert.equal(instagram.identifierDisplay, "Cliente Instagram");
  assert.equal(instagram.phoneDisplay, null);
  assert.equal(instagram.channel, "instagram");
  assert.equal(instagram.hasConversation, false);
  assert.equal(instagram.hasValidWhatsappIdentity, false);
  assert.equal(instagram.canStartWhatsappTemplateCandidate, false);
  assert.equal(instagram.templateSendBlockedReason, "not_whatsapp");
});

test("CRM contacts read model supports filters and partial records", async () => {
  const byStatus = await request<{ ok: boolean; items: Array<{ crmStatus: string }> }>(
    "GET",
    "/app/crm/contacts?status=RETORNO_FUTURO",
    businessAgent
  );
  assert.equal(byStatus.status, 200);
  assert.ok(byStatus.body.items.length >= 1);
  assert.ok(byStatus.body.items.every((item) => item.crmStatus === "RETORNO_FUTURO"));

  const byChannel = await request<{ ok: boolean; items: Array<{ channel: string | null }> }>(
    "GET",
    "/app/crm/contacts?channel=instagram",
    businessAgent
  );
  assert.equal(byChannel.status, 200);
  assert.deepEqual(byChannel.body.items.map((item) => item.channel), ["instagram"]);

  const bySearch = await request<{ ok: boolean; items: Array<{ companyName: string | null }> }>(
    "GET",
    "/app/crm/contacts?q=Empresa%20Instagram",
    businessAgent
  );
  assert.equal(bySearch.status, 200);
  assert.equal(bySearch.body.items.length, 1);
  assert.equal(bySearch.body.items[0]?.companyName, "Empresa Instagram");

  const withConversation = await request<{ ok: boolean; items: Array<{ hasConversation: boolean }> }>(
    "GET",
    "/app/crm/contacts?hasConversation=true",
    businessAgent
  );
  assert.equal(withConversation.status, 200);
  assert.ok(withConversation.body.items.length >= 1);
  assert.ok(withConversation.body.items.every((item) => item.hasConversation));

  const noConversation = await request<{
    ok: boolean;
    items: Array<{ hasConversation: boolean; identifierDisplay: string; channel: string | null }>;
  }>("GET", "/app/crm/contacts?hasConversation=false&channel=webchat", businessAgent);
  assert.equal(noConversation.status, 200);
  assert.equal(noConversation.body.items.length, 1);
  assert.equal(noConversation.body.items[0]?.hasConversation, false);
  assert.equal(noConversation.body.items[0]?.identifierDisplay, "Visitante Webchat");

  const optOut = await request<{ ok: boolean; items: Array<{ activeOptOut: boolean }> }>(
    "GET",
    "/app/crm/contacts?optOut=true",
    businessAgent
  );
  assert.equal(optOut.status, 200);
  assert.ok(optOut.body.items.length >= 1);
  assert.ok(optOut.body.items.every((item) => item.activeOptOut));
});

test("CRM contact detail is tenant-scoped and returns safe related conversations", async () => {
  const response = await request<{
    ok: boolean;
    item: {
      leadId: string;
      contactId: string | null;
      phoneDisplay: string | null;
      identifierDisplay: string;
      activeOptOut: boolean;
      notesCount: number;
    };
    conversations: Array<{
      conversationId: string;
      conversationIdentity: string;
      protocol: string;
      status: string | null;
      channel: string | null;
      departmentName: string | null;
      queueName: string | null;
      assignedUserName: string | null;
    }>;
  }>("GET", `/app/crm/contacts/${encodeURIComponent(leadId)}`, businessAgent);

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.item.leadId, leadId);
  assert.equal(response.body.item.activeOptOut, true);
  assert.match(response.body.item.phoneDisplay ?? "", /^\d{4}\*{5}\d{4}$/);
  assert.equal(response.body.conversations.length, 1);
  assert.equal(response.body.conversations[0]?.conversationId, leadConversationId);
  assert.equal(response.body.conversations[0]?.conversationIdentity, `${prefix}-lead-waid`);
  assert.match(response.body.conversations[0]?.protocol ?? "", /^CVT-[0-9A-F]{12}$/);
  assert.equal(response.body.conversations[0]?.status, "WAITING");
  assert.doesNotMatch(JSON.stringify(response.body), /rawPayload|hash:|externalUserHash|externalUserRef/);

  const foreign = await request<ErrorPayload>(
    "GET",
    `/app/crm/contacts/${encodeURIComponent(otherTenantLeadId)}`,
    businessAgent
  );
  assert.equal(foreign.status, 404);
  assert.equal(getErrorCode(foreign.body), "contact_not_found");
});

test("CRM contacts endpoint requires authentication", async () => {
  const response = await fetch(`${baseUrl}/app/crm/contacts`);
  assert.equal(response.status, 401);
});

test("government profile default is blocked by CRM capability on protected routes", async () => {
  const routes = [
    { method: "GET", route: "/app/crm/settings" },
    { method: "GET", route: "/app/crm/statuses" },
    { method: "GET", route: "/app/crm/contacts" },
    { method: "GET", route: "/app/crm/contacts/missing" },
    { method: "GET", route: "/app/crm/campaign-recipients?statuses=QUALIFIED" },
    { method: "PATCH", route: "/app/lead/missing", body: { name: "x" } },
    { method: "PATCH", route: "/app/lead/missing/status", body: { status: "OPEN" } },
    { method: "POST", route: "/app/lead/missing/notes", body: { body: "x" } },
    { method: "GET", route: "/app/lead/missing/notes" },
  ];

  for (const item of routes) {
    const response = await request<ErrorPayload>(
      item.method,
      item.route,
      governmentAdmin,
      item.body
    );
    assert.equal(response.status, 403, `${item.method} ${item.route}`);
    assert.equal(getErrorCode(response.body), "capability_not_enabled");
    assert.equal(response.body.capability, "crm");
  }
});

test("tenant override can enable CRM for a non-business profile", async () => {
  const response = await request<{ ok: boolean }>("GET", "/app/crm/settings", overrideAdmin);
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
});

test("RBAC remains enforced separately from CRM capability", async () => {
  const response = await request<ErrorPayload>("GET", "/app/crm/settings", businessAgent);
  assert.equal(response.status, 403);
  assert.equal(getErrorCode(response.body), "forbidden");
});
