import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { issueClientAuthToken } from "../auth/clientAuth.js";
import { buildAppAuthSessionExpiresAt } from "../auth/sessionPolicy.js";
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
let businessSupervisor: TestUser;
let businessAgent: TestUser;
let governmentAdmin: TestUser;
let overrideAdmin: TestUser;
let leadId = "";
let instagramLeadId = "";
let otherTenantLeadId = "";
let anonymizedLeadId = "";
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
      expiresAt: buildAppAuthSessionExpiresAt(),
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
  await prisma.outboundMessage.deleteMany({
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
  const provisionalIdentity = normalizeOptOutWaId("5511999999988");
  assert.ok(provisionalIdentity);
  await prisma.contact.create({
    data: {
      clientId: businessClientId,
      waId: provisionalIdentity.waIdCanonical,
      name: "Lead Provisorio",
      lifecycle: "PROVISIONAL",
    },
  });
  await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId: provisionalIdentity.waIdCanonical,
      waIdCanonical: provisionalIdentity.waIdCanonical,
      phone: provisionalIdentity.waIdCanonical,
      name: "Lead Provisorio",
      status: "QUALIFIED",
    },
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
  const anonymizedLead = await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId: `anon:${prefix}:waid`,
      waIdCanonical: `anon:${prefix}:waid`,
      channel: "whatsapp",
      provider: "meta",
      name: "Usuario Anonimizado",
      phone: "551188887777",
      company: "Empresa Anonimizada",
      email: "anonimizado@example.test",
      city: "Curitiba",
      status: "QUALIFIED",
    },
    select: { id: true },
  });
  anonymizedLeadId = anonymizedLead.id;
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
          {
            id: "INATIVO",
            label: "Inativo",
            isActive: true,
            campaignEligible: false,
          },
          {
            id: "ARQUIVADO",
            label: "Arquivado",
            isActive: false,
            campaignEligible: false,
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
  const eligibleSettingsWaId = "5511999999998";
  await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId: eligibleSettingsWaId,
      waIdCanonical: eligibleSettingsWaId,
      phone: eligibleSettingsWaId,
      name: "Lead Elegivel Settings",
      channel: "whatsapp",
      provider: "meta",
      status: "QUALIFIED",
    },
  });
  const settings = await request<{ ok: boolean; leadCountsByStatus: Record<string, number | undefined> }>(
    "GET",
    "/app/crm/settings",
    businessAdmin
  );
  assert.equal(settings.status, 200);
  assert.equal(settings.body.ok, true);
  assert.equal(settings.body.leadCountsByStatus.QUALIFIED, 1);
  assert.equal(settings.body.leadCountsByStatus.INATIVO ?? 0, 0);

  const recipients = await request<{ ok: boolean; count: number; numbers: string[] }>(
    "GET",
    "/app/crm/campaign-recipients?statuses=QUALIFIED&limit=10",
    businessAdmin
  );
  assert.equal(recipients.status, 200);
  assert.equal(recipients.body.ok, true);
  assert.equal(recipients.body.count, 1);
  assert.deepEqual(recipients.body.numbers, [eligibleSettingsWaId]);

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

test("CRM contact create allows admin and supervisor, blocks agent, dedupes, and creates no conversation or outbound", async () => {
  const conversationsBefore = await prisma.conversation.count({ where: { clientId: businessClientId } });
  const messagesBefore = await prisma.message.count({
    where: { conversation: { clientId: businessClientId } },
  });

  const adminCreate = await request<{
    ok: boolean;
    item: {
      leadId: string;
      contactId: string | null;
      displayName: string | null;
      phoneDisplay: string | null;
      hasConversation: boolean;
    };
  }>("POST", "/app/crm/contacts", businessAdmin, {
    name: "Contato Individual",
    phone: "+55 (41) 99999-9999",
  });
  assert.equal(adminCreate.status, 201);
  assert.equal(adminCreate.body.ok, true);
  assert.equal(adminCreate.body.item.displayName, "Contato Individual");
  assert.equal(adminCreate.body.item.hasConversation, false);

  const duplicate = await request<{ ok: boolean; item: { leadId: string; contactId: string | null } }>(
    "POST",
    "/app/crm/contacts",
    businessSupervisor,
    {
      name: "Nome que não deve sobrescrever",
      phone: "+55 41 99999 9999",
    }
  );
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.ok, true);
  assert.equal(duplicate.body.item.leadId, adminCreate.body.item.leadId);
  assert.equal(duplicate.body.item.contactId, adminCreate.body.item.contactId);

  const phoneOnly = await request<{ ok: boolean; item: { displayName: string | null; identifierDisplay: string } }>(
    "POST",
    "/app/crm/contacts",
    businessSupervisor,
    { phone: "5541999999988" }
  );
  assert.equal(phoneOnly.status, 201);
  assert.equal(phoneOnly.body.ok, true);
  assert.equal(phoneOnly.body.item.displayName, null);
  assert.equal(phoneOnly.body.item.identifierDisplay, "5541999999988");

  const agent = await request<ErrorPayload>("POST", "/app/crm/contacts", businessAgent, {
    name: "Bloqueado",
    phone: "5541999999977",
  });
  assert.equal(agent.status, 403);
  assert.equal(getErrorCode(agent.body), "forbidden");

  const invalid = await request<ErrorPayload>("POST", "/app/crm/contacts", businessAdmin, {
    phone: "abc",
  });
  assert.equal(invalid.status, 400);
  assert.equal(getErrorCode(invalid.body), "invalid_phone");

  assert.equal(await prisma.conversation.count({ where: { clientId: businessClientId } }), conversationsBefore);
  assert.equal(await prisma.message.count({ where: { conversation: { clientId: businessClientId } } }), messagesBefore);

  const individualIdentity = normalizeOptOutWaId("+55 (41) 99999-9999");
  assert.ok(individualIdentity);
  const stored = await prisma.contact.findFirstOrThrow({
    where: { clientId: businessClientId, waId: individualIdentity.waIdCanonical },
    select: { lifecycle: true, name: true },
  });
  assert.equal(stored.lifecycle, "ACTIVE");
  assert.equal(stored.name, "Contato Individual");

  const crmEvent = await prisma.event.findFirstOrThrow({
    where: { clientId: businessClientId, eventName: "crm.contact.created" },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });
  assert.doesNotMatch(JSON.stringify(crmEvent.payloadJson), /9999999999|Contato Individual/);

  const cleanupWaIds = ["+55 (41) 99999-9999", "5541999999988"]
    .map((value) => normalizeOptOutWaId(value)?.waIdCanonical)
    .filter((value): value is string => Boolean(value));
  await prisma.lead.deleteMany({ where: { tenantId: businessClientId, waId: { in: cleanupWaIds } } });
  await prisma.contactChannelIdentity.deleteMany({
    where: { clientId: businessClientId, legacyWaId: { in: cleanupWaIds } },
  });
  await prisma.contact.deleteMany({ where: { clientId: businessClientId, waId: { in: cleanupWaIds } } });
});

test("CRM contact create preserves existing provisional contact without changing consent records", async () => {
  const beforeConsents = await prisma.contactConsent.count({ where: { clientId: businessClientId } });
  const response = await request<ErrorPayload & {
    existingContact?: { state: string; leadId: string | null; contactId: string | null };
  }>(
    "POST",
    "/app/crm/contacts",
    businessSupervisor,
    { name: "Lead Provisorio Importado", phone: "5511999999988" }
  );
  assert.equal(response.status, 409);
  assert.equal(getErrorCode(response.body), "contact_already_provisional");
  assert.equal(response.body.existingContact?.state, "provisional");

  const provisionalIdentity = normalizeOptOutWaId("5511999999988");
  assert.ok(provisionalIdentity);
  const contact = await prisma.contact.findFirstOrThrow({
    where: { clientId: businessClientId, waId: provisionalIdentity.waIdCanonical },
    select: { lifecycle: true, name: true },
  });
  assert.equal(contact.lifecycle, "PROVISIONAL");
  assert.equal(contact.name, "Lead Provisorio");
  assert.equal(await prisma.contactConsent.count({ where: { clientId: businessClientId } }), beforeConsents);
});

test("CRM CSV import previews without mutation and confirms idempotently", async () => {
  const manual = await request<{ ok: boolean; item: { leadId: string } }>(
    "POST",
    "/app/crm/contacts",
    businessSupervisor,
    { name: "Contato Manual Antes CSV", phone: "5541998877799" }
  );
  assert.equal(manual.status, 201);
  assert.equal(manual.body.ok, true);

  const csvText = "\uFEFFnome;numero\nContato CSV;5541998877777\nSem Nome;5541998877778\nDuplicado;5541998877777\nManual Atualizado CSV;5541998877799\nInválido;abc\n";
  const conversationsBefore = await prisma.conversation.count({ where: { clientId: businessClientId } });
  const messagesBefore = await prisma.message.count({
    where: { conversation: { clientId: businessClientId } },
  });
  const contactsBefore = await prisma.contact.count({ where: { clientId: businessClientId } });
  const leadsBefore = await prisma.lead.count({ where: { tenantId: businessClientId } });

  const inspect = await request<{
    ok: boolean;
    headers: string[];
    totalRows: number;
    mapping: { phoneColumn: string | null };
  }>("POST", "/app/crm/contacts/import/inspect", businessSupervisor, {
    csvText: "Nome completo,Celular principal,Situação\nFulano,5541998877777,Ativo\n",
  });
  assert.equal(inspect.status, 200);
  assert.equal(inspect.body.ok, true);
  assert.deepEqual(inspect.body.headers, ["Nome completo", "Celular principal", "Situação"]);
  assert.equal(inspect.body.totalRows, 1);
  assert.equal(inspect.body.mapping.phoneColumn, null);
  assert.equal(await prisma.contact.count({ where: { clientId: businessClientId } }), contactsBefore);
  assert.equal(await prisma.lead.count({ where: { tenantId: businessClientId } }), leadsBefore);

  const preview = await request<{
    ok: boolean;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    duplicatesInFile: number;
    existingContacts: number;
    readyToImport: number;
    sampleErrors: Array<{ reason: string }>;
  }>("POST", "/app/crm/contacts/import/preview", businessSupervisor, {
    csvText,
    mapping: { phoneColumn: "numero", nameColumn: "nome" },
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.ok, true);
  assert.equal(preview.body.totalRows, 5);
  assert.equal(preview.body.validRows, 3);
  assert.equal(preview.body.invalidRows, 1);
  assert.equal(preview.body.duplicatesInFile, 1);
  assert.equal(preview.body.readyToImport, 3);
  assert.equal(preview.body.sampleErrors.length, 2);
  assert.equal(await prisma.contact.count({ where: { clientId: businessClientId } }), contactsBefore);
  assert.equal(await prisma.lead.count({ where: { tenantId: businessClientId } }), leadsBefore);

  const autoMappedPreview = await request<{
    ok: boolean;
    readyToImport: number;
    rows: Array<{ operation: string; fieldsToUpdate: string[] }>;
  }>("POST", "/app/crm/contacts/import/preview", businessSupervisor, {
    csvText: "Telefone,Nome,Situação no CRM\n5541998877788,Auto Match,\n",
    mapping: {},
  });
  assert.equal(autoMappedPreview.status, 200);
  assert.equal(autoMappedPreview.body.ok, true);
  assert.equal(autoMappedPreview.body.readyToImport, 1);
  assert.equal(autoMappedPreview.body.rows[0]?.operation, "CREATE");

  const unmappedOptionalPreview = await request<{
    ok: boolean;
    readyToImport: number;
    rows: Array<{ operation: string; fieldsToUpdate: string[] }>;
  }>("POST", "/app/crm/contacts/import/preview", businessSupervisor, {
    csvText: "Telefone,Nome\n5541998877799,Nome Ignorado\n",
    mapping: { phoneColumn: "Telefone", nameColumn: null },
  });
  assert.equal(unmappedOptionalPreview.status, 200);
  assert.equal(unmappedOptionalPreview.body.ok, true);
  assert.equal(unmappedOptionalPreview.body.readyToImport, 1);
  assert.equal(unmappedOptionalPreview.body.rows[0]?.fieldsToUpdate.includes("Nome"), false);

  const confirm = await request<{
    ok: boolean;
    received: number;
    created: number;
    reused: number;
    updated: number;
    invalid: number;
    duplicates: number;
  }>("POST", "/app/crm/contacts/import/confirm", businessSupervisor, {
    operationId: crypto.randomUUID(),
    csvText,
    mapping: { phoneColumn: "numero", nameColumn: "nome" },
  });
  assert.equal(confirm.status, 200);
  assert.equal(confirm.body.ok, true);
  assert.equal(confirm.body.received, 5);
  assert.equal(confirm.body.created, 2);
  assert.equal(confirm.body.reused, 1);
  assert.equal(confirm.body.updated, 1);
  assert.equal(confirm.body.invalid, 1);
  assert.equal(confirm.body.duplicates, 1);

  const repeat = await request<{ ok: boolean; created: number; reused: number }>(
    "POST",
    "/app/crm/contacts/import/confirm",
    businessSupervisor,
    { operationId: crypto.randomUUID(), csvText, mapping: { phoneColumn: "numero", nameColumn: "nome" } }
  );
  assert.equal(repeat.status, 200);
  assert.equal(repeat.body.ok, true);
  assert.equal(repeat.body.created, 0);
  assert.equal(repeat.body.reused, 3);

  const importedList = await request<{
    ok: boolean;
    items: Array<{ phoneDisplay: string | null; importedSource: string | null }>;
  }>("GET", "/app/crm/contacts?limit=100", businessSupervisor);
  assert.equal(importedList.status, 200);
  const csvCreated = importedList.body.items.find((item) => item.phoneDisplay === "5541998877777");
  assert.ok(csvCreated);
  assert.equal(csvCreated.importedSource, "Importação CSV");
  const manualThenCsv = importedList.body.items.find((item) => item.phoneDisplay === "5541998877799");
  assert.ok(manualThenCsv);
  assert.equal(manualThenCsv.importedSource, "Cadastro manual");

  assert.equal(await prisma.conversation.count({ where: { clientId: businessClientId } }), conversationsBefore);
  assert.equal(await prisma.message.count({ where: { conversation: { clientId: businessClientId } } }), messagesBefore);

  const summaryEvent = await prisma.event.findFirstOrThrow({
    where: { clientId: businessClientId, eventName: "crm.contact.import.summary" },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });
  assert.doesNotMatch(JSON.stringify(summaryEvent.payloadJson), /888877777|888877778|Contato CSV/);

  const csvProvenanceEvent = await prisma.event.findFirstOrThrow({
    where: {
      clientId: businessClientId,
      eventName: "crm.contact.created",
      payloadJson: { path: ["source"], equals: "crm_import" },
    },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true, requestId: true },
  });
  assert.equal((csvProvenanceEvent.payloadJson as { source?: string }).source, "crm_import");
  assert.match(csvProvenanceEvent.requestId ?? "", /^crm\.contact\.created:/);
  assert.doesNotMatch(JSON.stringify(csvProvenanceEvent.payloadJson), /888877777|888877778|Contato CSV/);

  const agentPreview = await request<ErrorPayload>(
    "POST",
    "/app/crm/contacts/import/preview",
    businessAgent,
    { csvText, mapping: { phoneColumn: "numero" } }
  );
  assert.equal(agentPreview.status, 403);
  assert.equal(getErrorCode(agentPreview.body), "forbidden");

  const cleanupWaIds = ["5541998877777", "5541998877778", "5541998877799"]
    .map((value) => normalizeOptOutWaId(value)?.waIdCanonical)
    .filter((value): value is string => Boolean(value));
  await prisma.lead.deleteMany({ where: { tenantId: businessClientId, waId: { in: cleanupWaIds } } });
  await prisma.contactChannelIdentity.deleteMany({
    where: { clientId: businessClientId, legacyWaId: { in: cleanupWaIds } },
  });
  await prisma.contact.deleteMany({ where: { clientId: businessClientId, waId: { in: cleanupWaIds } } });
});

test("CRM operational statuses are tenant-scoped and allow custom lead statuses", async () => {
  const statuses = await request<{
    ok: boolean;
    settings: { crmBusinessStatuses: Array<{ id: string; label: string; isActive: boolean; campaignEligible: boolean }> };
  }>("GET", "/app/crm/statuses", businessAgent);
  assert.equal(statuses.status, 200);
  assert.equal(statuses.body.ok, true);
  assert.deepEqual(
    statuses.body.settings.crmBusinessStatuses.map((item) => item.id),
    ["NEW", "QUALIFIED", "OPEN", "RETORNO_FUTURO", "INATIVO", "ARQUIVADO"]
  );
  const systemNew = statuses.body.settings.crmBusinessStatuses.find((item) => item.id === "NEW");
  assert.ok(systemNew);
  assert.equal(systemNew.isActive, true);
  assert.equal(systemNew.campaignEligible, true);

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
  const projectableLead = await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId: `${prefix}-projectable-waid`,
      waIdCanonical: `${prefix}-projectable-waid`,
      phone: "5511988887777",
      name: "Lead com atendimento humano",
      status: "QUALIFIED",
    },
    select: { id: true },
  });
  const projectableDepartment = await prisma.department.create({
    data: {
      clientId: businessClientId,
      name: `${prefix} Atendimento Humano`,
      slug: `${prefix}-atendimento-humano`,
      isActive: true,
    },
    select: { id: true },
  });
  const projectableQueue = await prisma.queue.create({
    data: {
      clientId: businessClientId,
      departmentId: projectableDepartment.id,
      name: `${prefix} Fila Humana`,
    },
    select: { id: true },
  });
  const projectableConversationId = crypto.randomUUID();
  await prisma.conversation.create({
    data: {
      id: projectableConversationId,
      clientId: businessClientId,
      waId: `${prefix}-projectable-waid`,
      waIdCanonical: `${prefix}-projectable-waid`,
      channel: "whatsapp",
      provider: "meta",
      departmentId: projectableDepartment.id,
      windowIsOpen: true,
      updatedAt: new Date("2026-07-28T11:00:00.000Z"),
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId: `${prefix}-projectable-waid`,
      waIdCanonical: `${prefix}-projectable-waid`,
      conversationKey: `${prefix}-business:${prefix}-projectable-waid`,
      channel: "whatsapp",
      provider: "meta",
      status: "WAITING",
      mode: "HUMAN",
      handoffStatus: "ACTIVE",
      departmentId: projectableDepartment.id,
      queueId: projectableQueue.id,
      answers: {},
      updatedAt: new Date("2026-07-28T11:01:00.000Z"),
    },
  });

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
      isAnonymized: boolean;
    }>;
  }>("GET", "/app/crm/contacts?limit=20", businessAdmin);

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
  assert.equal(whatsapp.lastConversationId, null);
  assert.equal(whatsapp.lastConversationIdentity, null);
  assert.equal(whatsapp.lastProtocol, null);
  assert.equal(whatsapp.lastConversationStatus, null);
  assert.equal(whatsapp.activeOptOut, true);
  assert.equal(whatsapp.importedSource, "Campanha / audiência");
  assert.equal(whatsapp.isAnonymized, false);
  assert.equal(whatsapp.canStartWhatsappTemplateCandidate, false);
  assert.equal(whatsapp.templateSendBlockedReason, "opt_out");
  assert.match(whatsapp.phoneDisplay ?? "", /^\d+$/);
  assert.doesNotMatch(whatsapp.phoneDisplay ?? "", /\*/);
  assert.equal(response.body.items.some((item) => item.leadId === anonymizedLeadId), false);
  assert.doesNotMatch(
    JSON.stringify(response.body),
    /rawPayload|hash:|Usuario Anonimizado|Empresa Anonimizada|anonimizado@example\.test|551188887777/
  );
  assert.equal(
    await prisma.conversation.count({ where: { id: leadConversationId, clientId: businessClientId } }),
    1
  );
  assert.equal(
    await prisma.conversationRuntimeState.count({
      where: {
        clientId: businessClientId,
        waId: `${prefix}-lead-waid`,
        status: "WAITING",
      },
    }),
    1
  );

  const projectable = response.body.items.find((item) => item.leadId === projectableLead.id);
  assert.ok(projectable);
  assert.equal(projectable.hasConversation, true);
  assert.equal(projectable.conversationsCount, 1);
  assert.equal(projectable.lastConversationId, projectableConversationId);
  assert.equal(projectable.lastConversationIdentity, `${prefix}-projectable-waid`);
  assert.match(projectable.lastProtocol ?? "", /^CVT-[0-9A-F]{12}$/);
  assert.equal(projectable.lastConversationStatus, "WAITING");

  const historicalDetail = await request<{
    ok: boolean;
    item: { conversationsCount: number; lastConversationId: string | null };
    conversations: Array<{ conversationId: string; conversationIdentity: string; canOpenInInbox: boolean }>;
  }>("GET", `/app/crm/contacts/${encodeURIComponent(leadId)}`, businessAdmin);
  assert.equal(historicalDetail.status, 200);
  assert.equal(historicalDetail.body.item.conversationsCount, 1);
  assert.equal(historicalDetail.body.item.lastConversationId, null);
  assert.equal(historicalDetail.body.conversations[0]?.conversationId, leadConversationId);
  assert.equal(historicalDetail.body.conversations[0]?.canOpenInInbox, false);

  const projectableDetail = await request<{
    ok: boolean;
    item: { conversationsCount: number; lastConversationId: string | null };
    conversations: Array<{ conversationId: string; conversationIdentity: string; canOpenInInbox: boolean }>;
  }>("GET", `/app/crm/contacts/${encodeURIComponent(projectableLead.id)}`, businessAdmin);
  assert.equal(projectableDetail.status, 200);
  assert.equal(projectableDetail.body.item.conversationsCount, 1);
  assert.equal(projectableDetail.body.item.lastConversationId, projectableConversationId);
  assert.equal(projectableDetail.body.conversations[0]?.conversationId, projectableConversationId);
  assert.equal(projectableDetail.body.conversations[0]?.canOpenInInbox, true);

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

test("CRM contact campaign relationship uses canonical campaign evidence without cross-tenant leakage", async () => {
  const deliveredCampaign = await prisma.campaign.create({
    data: {
      clientId: businessClientId,
      name: "Campanha CRM Entregue",
      templateName: "data_exame",
      status: "completed",
      totalRecipients: 1,
      sentCount: 1,
      createdAt: new Date("2026-09-01T10:00:00.000Z"),
      updatedAt: new Date("2026-09-01T10:05:00.000Z"),
    },
  });
  await prisma.event.create({
    data: {
      clientId: businessClientId,
      waId: `${prefix}-lead-waid`,
      waIdCanonical: `${prefix}-lead-waid`,
      eventName: "campaign.seed.saved",
      messageId: deliveredCampaign.id,
      requestId: `${prefix}-campaign-seed`,
      payloadJson: {
        leadIds: [leadId],
        recipients: [`${prefix}-lead-waid`],
      },
      createdAt: new Date("2026-09-01T10:00:00.000Z"),
    },
  });
  await prisma.outboundMessage.create({
    data: {
      clientId: businessClientId,
      waId: `${prefix}-lead-waid`,
      waIdCanonical: `${prefix}-lead-waid`,
      messageId: `campaign.${deliveredCampaign.id}.1`,
      type: "TEMPLATE",
      status: "SENT",
      templateName: "data_exame",
      rawPayload: {
        campaignId: deliveredCampaign.id,
        metaStatus: {
          lastStatus: "delivered",
          lastStatusAt: "2026-09-01T10:06:00.000Z",
        },
      },
      createdAt: new Date("2026-09-01T10:01:00.000Z"),
    },
  });
  const optOutCampaign = await prisma.campaign.create({
    data: {
      clientId: businessClientId,
      name: "Campanha CRM Opt-out",
      templateName: "data_exame",
      status: "completed",
      totalRecipients: 1,
      blockedCount: 1,
      createdAt: new Date("2026-09-02T10:00:00.000Z"),
      updatedAt: new Date("2026-09-02T10:00:00.000Z"),
    },
  });
  await prisma.event.create({
    data: {
      clientId: businessClientId,
      waId: `${prefix}-lead-waid`,
      waIdCanonical: `${prefix}-lead-waid`,
      eventName: "campaign.recipient.opt_out_blocked",
      messageId: optOutCampaign.id,
      requestId: `${prefix}-campaign-optout`,
      payloadJson: { reason: "opt_out" },
      createdAt: new Date("2026-09-02T10:00:00.000Z"),
    },
  });
  const conflictCampaign = await prisma.campaign.create({
    data: {
      clientId: businessClientId,
      name: "Campanha CRM Conflito",
      templateName: "data_exame",
      status: "blocked",
      totalRecipients: 1,
      blockedCount: 1,
      createdAt: new Date("2026-09-03T10:00:00.000Z"),
      updatedAt: new Date("2026-09-03T10:00:00.000Z"),
    },
  });
  await prisma.outboundMessage.create({
    data: {
      clientId: businessClientId,
      waId: `${prefix}-lead-waid`,
      waIdCanonical: `${prefix}-lead-waid`,
      messageId: `campaign.${conflictCampaign.id}.1`,
      type: "TEMPLATE",
      status: "FAILED",
      templateName: "data_exame",
      errorBody: "identity_conflict",
      rawPayload: {
        campaignId: conflictCampaign.id,
        metaStatus: {
          lastStatus: "failed",
          statusDetail: "identity_conflict",
        },
      },
      createdAt: new Date("2026-09-03T10:00:00.000Z"),
    },
  });
  await prisma.campaign.create({
    data: {
      clientId: governmentClientId,
      name: "Campanha Outro Tenant",
      templateName: "data_exame",
      status: "completed",
      totalRecipients: 1,
      sentCount: 1,
      createdAt: new Date("2026-09-04T10:00:00.000Z"),
      updatedAt: new Date("2026-09-04T10:00:00.000Z"),
    },
  });

  const list = await request<{
    ok: boolean;
    items: Array<{
      leadId: string;
      crmStatusLabel: string;
      campaignRelationship: {
        campaignCount: number;
        latestCampaignId: string | null;
        latestCampaignName: string | null;
        latestRecipientStatus: string | null;
        latestResultReason: string | null;
        hasOptOutBlock: boolean;
      };
    }>;
  }>("GET", "/app/crm/contacts?limit=20", businessAdmin);

  assert.equal(list.status, 200);
  const contact = list.body.items.find((item) => item.leadId === leadId);
  assert.ok(contact);
  assert.equal(contact.crmStatusLabel, "Retorno futuro");
  assert.equal(contact.campaignRelationship.campaignCount, 2);
  assert.equal(contact.campaignRelationship.latestCampaignId, conflictCampaign.id);
  assert.equal(contact.campaignRelationship.latestCampaignName, "Campanha CRM Conflito");
  assert.equal(contact.campaignRelationship.latestRecipientStatus, "FAILED");
  assert.equal(contact.campaignRelationship.latestResultReason, "identity_conflict");
  assert.equal(contact.campaignRelationship.hasOptOutBlock, false);
  assert.doesNotMatch(JSON.stringify(list.body), /Campanha Outro Tenant|R\$|USD|billing|contractPrice/i);

  const detail = await request<{
    ok: boolean;
    item: {
      campaignRelationship: { campaignCount: number; latestCampaignId: string | null };
    };
    campaignRelationshipHistory: {
      items: Array<{
        campaignId: string;
        campaignName: string;
        recipientStatus: string;
        resultReason: string | null;
        deliveredAt: string | null;
        campaignHref: string;
      }>;
      pagination: { total: number; hasMore: boolean };
    };
  }>("GET", `/app/crm/contacts/${encodeURIComponent(leadId)}`, businessAdmin);

  assert.equal(detail.status, 200);
  assert.equal(detail.body.item.campaignRelationship.campaignCount, 2);
  assert.equal(detail.body.campaignRelationshipHistory.pagination.total, 2);
  assert.equal(detail.body.campaignRelationshipHistory.pagination.hasMore, false);
  assert.equal(detail.body.campaignRelationshipHistory.items[0]?.campaignId, conflictCampaign.id);
  assert.equal(detail.body.campaignRelationshipHistory.items[0]?.campaignHref, `/app/campaigns?campaignId=${encodeURIComponent(conflictCampaign.id)}`);
  assert.equal(
    detail.body.campaignRelationshipHistory.items.find((item) => item.campaignId === deliveredCampaign.id)?.recipientStatus,
    "DELIVERED"
  );
  assert.ok(detail.body.campaignRelationshipHistory.items.find((item) => item.campaignId === deliveredCampaign.id)?.deliveredAt);
  assert.equal(detail.body.campaignRelationshipHistory.items.some((item) => item.campaignId === optOutCampaign.id), false);
  assert.doesNotMatch(JSON.stringify(detail.body), /Campanha Outro Tenant|R\$|USD|billing|contractPrice/i);
});

test("CRM contact campaign relationship follows provider chronology without requiring conversations", async () => {
  const createLead = async (suffix: string, waId: string) => {
    const lead = await prisma.lead.create({
      data: {
        tenantId: businessClientId,
        waId,
        waIdCanonical: waId,
        phone: waId,
        name: `Lead Relacionamento ${suffix}`,
        status: "QUALIFIED",
      },
      select: { id: true },
    });
    return lead.id;
  };
  const createCampaign = async (suffix: string, at: string) =>
    prisma.campaign.create({
      data: {
        clientId: businessClientId,
        name: `Campanha Relacionamento ${suffix}`,
        templateName: "data_exame",
        status: "completed",
        totalRecipients: 1,
        sentCount: 1,
        createdAt: new Date(at),
        updatedAt: new Date(at),
      },
    });
  const createOutbound = async (params: {
    campaignId: string;
    waId: string;
    messageIndex: number;
    status: "SENT" | "FAILED";
    metaStatus: "sent" | "delivered" | "read" | "failed";
    statusAt: string;
    createdAt: string;
    errorBody?: string;
  }) =>
    prisma.outboundMessage.create({
      data: {
        clientId: businessClientId,
        waId: params.waId,
        waIdCanonical: params.waId,
        messageId: `campaign.${params.campaignId}.${params.messageIndex}`,
        type: "TEMPLATE",
        status: params.status,
        templateName: "data_exame",
        errorBody: params.errorBody,
        rawPayload: {
          campaignId: params.campaignId,
          metaStatus: {
            lastStatus: params.metaStatus,
            lastStatusAt: params.statusAt,
            statusDetail: params.errorBody,
          },
        },
        createdAt: new Date(params.createdAt),
      },
    });
  const detailFor = async (lead: string) =>
    request<{
      campaignRelationshipHistory: {
        items: Array<{ campaignId: string; recipientStatus: string; resultReason: string | null }>;
        pagination: { total: number };
      };
    }>("GET", `/app/crm/contacts/${encodeURIComponent(lead)}`, businessAdmin);

  const failedWaId = `${prefix}-relationship-failed`;
  const failedLeadId = await createLead("Falha", failedWaId);
  const failedCampaign = await createCampaign("Falha", "2026-09-10T10:00:00.000Z");
  await createOutbound({
    campaignId: failedCampaign.id,
    waId: failedWaId,
    messageIndex: 1,
    status: "SENT",
    metaStatus: "sent",
    statusAt: "2026-09-10T10:00:00.000Z",
    createdAt: "2026-09-10T10:00:01.000Z",
  });
  await createOutbound({
    campaignId: failedCampaign.id,
    waId: failedWaId,
    messageIndex: 2,
    status: "FAILED",
    metaStatus: "failed",
    statusAt: "2026-09-10T10:01:00.000Z",
    createdAt: "2026-09-10T10:01:01.000Z",
    errorBody: "Message undeliverable",
  });
  const failedDetail = await detailFor(failedLeadId);
  assert.equal(failedDetail.status, 200);
  assert.equal(failedDetail.body.campaignRelationshipHistory.pagination.total, 1);
  assert.equal(failedDetail.body.campaignRelationshipHistory.items[0]?.campaignId, failedCampaign.id);
  assert.equal(failedDetail.body.campaignRelationshipHistory.items[0]?.recipientStatus, "FAILED");
  assert.match(failedDetail.body.campaignRelationshipHistory.items[0]?.resultReason ?? "", /Message undeliverable/);
  assert.equal(await prisma.conversation.count({ where: { clientId: businessClientId, waId: failedWaId } }), 0);

  const readWaId = `${prefix}-relationship-read`;
  const readLeadId = await createLead("Lido", readWaId);
  const readCampaign = await createCampaign("Lido", "2026-09-11T10:00:00.000Z");
  await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId: readWaId,
      waIdCanonical: readWaId,
      channel: "whatsapp",
      provider: "meta",
      updatedAt: new Date("2026-09-11T10:02:00.000Z"),
    },
  });
  await createOutbound({
    campaignId: readCampaign.id,
    waId: readWaId,
    messageIndex: 1,
    status: "SENT",
    metaStatus: "sent",
    statusAt: "2026-09-11T10:00:00.000Z",
    createdAt: "2026-09-11T10:00:01.000Z",
  });
  await createOutbound({
    campaignId: readCampaign.id,
    waId: readWaId,
    messageIndex: 2,
    status: "SENT",
    metaStatus: "delivered",
    statusAt: "2026-09-11T10:01:00.000Z",
    createdAt: "2026-09-11T10:01:01.000Z",
  });
  await createOutbound({
    campaignId: readCampaign.id,
    waId: readWaId,
    messageIndex: 3,
    status: "SENT",
    metaStatus: "read",
    statusAt: "2026-09-11T10:02:00.000Z",
    createdAt: "2026-09-11T10:02:01.000Z",
  });
  const readDetail = await detailFor(readLeadId);
  assert.equal(readDetail.status, 200);
  assert.equal(readDetail.body.campaignRelationshipHistory.items[0]?.recipientStatus, "READ");
  assert.equal(await prisma.conversation.count({ where: { clientId: businessClientId, waId: readWaId } }), 1);

  const replayWaId = `${prefix}-relationship-replay`;
  const replayLeadId = await createLead("Replay", replayWaId);
  const replayCampaign = await createCampaign("Replay", "2026-09-12T10:00:00.000Z");
  await createOutbound({
    campaignId: replayCampaign.id,
    waId: replayWaId,
    messageIndex: 1,
    status: "SENT",
    metaStatus: "delivered",
    statusAt: "2026-09-12T10:01:00.000Z",
    createdAt: "2026-09-12T10:01:01.000Z",
  });
  await createOutbound({
    campaignId: replayCampaign.id,
    waId: replayWaId,
    messageIndex: 2,
    status: "SENT",
    metaStatus: "sent",
    statusAt: "2026-09-12T10:00:00.000Z",
    createdAt: "2026-09-12T10:02:00.000Z",
  });
  const replayDetail = await detailFor(replayLeadId);
  assert.equal(replayDetail.status, 200);
  assert.equal(replayDetail.body.campaignRelationshipHistory.items[0]?.recipientStatus, "DELIVERED");

  const blockedWaId = `${prefix}-relationship-blocked`;
  const blockedLeadId = await createLead("Bloqueado", blockedWaId);
  const blockedCampaign = await createCampaign("Bloqueado", "2026-09-13T10:00:00.000Z");
  await prisma.event.create({
    data: {
      clientId: businessClientId,
      waId: blockedWaId,
      waIdCanonical: blockedWaId,
      eventName: "campaign.recipient.opt_out_blocked",
      messageId: blockedCampaign.id,
      requestId: `${prefix}-relationship-blocked`,
      payloadJson: { reason: "opt_out" },
      createdAt: new Date("2026-09-13T10:00:00.000Z"),
    },
  });
  const blockedDetail = await detailFor(blockedLeadId);
  assert.equal(blockedDetail.status, 200);
  assert.equal(blockedDetail.body.campaignRelationshipHistory.pagination.total, 0);
  assert.equal(blockedDetail.body.campaignRelationshipHistory.items.length, 0);
  assert.equal(await prisma.conversation.count({ where: { clientId: businessClientId, waId: blockedWaId } }), 0);

  const existingWaId = `${prefix}-relationship-existing`;
  const existingLeadId = await createLead("Existente", existingWaId);
  const existingCampaign = await createCampaign("Existente", "2026-09-14T10:00:00.000Z");
  const existingConversation = await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId: existingWaId,
      waIdCanonical: existingWaId,
      channel: "whatsapp",
      provider: "meta",
      updatedAt: new Date("2026-09-14T09:00:00.000Z"),
    },
    select: { id: true },
  });
  await createOutbound({
    campaignId: existingCampaign.id,
    waId: existingWaId,
    messageIndex: 1,
    status: "FAILED",
    metaStatus: "failed",
    statusAt: "2026-09-14T10:01:00.000Z",
    createdAt: "2026-09-14T10:01:01.000Z",
    errorBody: "Message undeliverable",
  });
  const existingDetail = await detailFor(existingLeadId);
  assert.equal(existingDetail.status, 200);
  assert.equal(existingDetail.body.campaignRelationshipHistory.items[0]?.recipientStatus, "FAILED");
  assert.equal(await prisma.conversation.count({ where: { id: existingConversation.id } }), 1);

  const aliasLeadId = await createLead("Alias", "5511949806683");
  const aliasCampaign = await createCampaign("Alias", "2026-09-15T10:00:00.000Z");
  await createOutbound({
    campaignId: aliasCampaign.id,
    waId: "551149806683",
    messageIndex: 1,
    status: "FAILED",
    metaStatus: "failed",
    statusAt: "2026-09-15T10:01:00.000Z",
    createdAt: "2026-09-15T10:01:01.000Z",
    errorBody: "Message undeliverable",
  });
  const aliasDetail = await detailFor(aliasLeadId);
  assert.equal(aliasDetail.status, 200);
  assert.equal(aliasDetail.body.campaignRelationshipHistory.pagination.total, 1);
  assert.equal(aliasDetail.body.campaignRelationshipHistory.items[0]?.campaignId, aliasCampaign.id);
  assert.equal(aliasDetail.body.campaignRelationshipHistory.items[0]?.recipientStatus, "FAILED");
});

test("CRM contact list remains complete and bounded with more than 500 contacts", async () => {
  const createdAt = new Date("2026-09-05T10:00:00.000Z");
  await prisma.lead.createMany({
    data: Array.from({ length: 501 }, (_, index) => ({
      tenantId: businessClientId,
      waId: `${prefix}-perf-${index}`,
      waIdCanonical: `${prefix}-perf-${index}`,
      phone: `5511888${String(index).padStart(6, "0")}`,
      name: `Contato Performance ${index}`,
      status: "QUALIFIED",
      createdAt,
      updatedAt: createdAt,
    })),
  });

  const page20StartedAt = Date.now();
  const page20 = await request<{ ok: boolean; items: Array<{ campaignRelationship: { campaignCount: number } }>; pagination: { total: number } }>(
    "GET",
    "/app/crm/contacts?limit=20",
    businessAdmin
  );
  const page20DurationMs = Date.now() - page20StartedAt;
  assert.equal(page20.status, 200);
  assert.equal(page20.body.ok, true);
  assert.ok(page20.body.items.length <= 20);
  assert.ok(page20.body.pagination.total > 500);
  assert.ok(page20DurationMs < 2_500);

  const page100StartedAt = Date.now();
  const page100 = await request<{ ok: boolean; items: Array<{ campaignRelationship: { campaignCount: number } }> }>(
    "GET",
    "/app/crm/contacts?limit=100",
    businessAdmin
  );
  const page100DurationMs = Date.now() - page100StartedAt;
  assert.equal(page100.status, 200);
  assert.equal(page100.body.ok, true);
  assert.ok(page100.body.items.length <= 100);
  assert.ok(page100DurationMs < 2_500);

  const page3StartedAt = Date.now();
  const page3 = await request<{ ok: boolean; items: Array<{ campaignRelationship: { campaignCount: number } }> }>(
    "GET",
    "/app/crm/contacts?limit=200&page=3",
    businessAdmin
  );
  const page3DurationMs = Date.now() - page3StartedAt;
  assert.equal(page3.status, 200);
  assert.equal(page3.body.ok, true);
  assert.ok(page3.body.items.length >= 100);
  assert.ok(page3DurationMs < 2_500);
});

test("CRM contacts read model supports filters and partial records", async () => {
  const byStatus = await request<{ ok: boolean; items: Array<{ crmStatus: string }> }>(
    "GET",
    "/app/crm/contacts?status=RETORNO_FUTURO",
    businessAdmin
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
    businessAdmin
  );
  assert.equal(withConversation.status, 200);
  assert.ok(withConversation.body.items.length >= 1);
  assert.ok(withConversation.body.items.every((item) => item.hasConversation));

  const noConversation = await request<{
    ok: boolean;
    items: Array<{ hasConversation: boolean; identifierDisplay: string; channel: string | null }>;
  }>("GET", "/app/crm/contacts?hasConversation=false&channel=webchat", businessAdmin);
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
    blockingConversation: {
      conversationIdentity: string;
      visibility: "visible" | "hidden";
      status: string | null;
      mode: string | null;
    } | null;
  }>("GET", `/app/crm/contacts/${encodeURIComponent(leadId)}`, businessAdmin);

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.item.leadId, leadId);
  assert.equal(response.body.item.activeOptOut, true);
  assert.match(response.body.item.phoneDisplay ?? "", /^\d+$/);
  assert.doesNotMatch(response.body.item.phoneDisplay ?? "", /\*/);
  assert.equal(response.body.conversations.length, 1);
  assert.equal(response.body.conversations[0]?.conversationId, leadConversationId);
  assert.equal(response.body.conversations[0]?.conversationIdentity, `${prefix}-lead-waid`);
  assert.match(response.body.conversations[0]?.protocol ?? "", /^CVT-[0-9A-F]{12}$/);
  assert.equal(response.body.conversations[0]?.status, "WAITING");
  assert.equal(response.body.blockingConversation?.conversationIdentity, `${prefix}-lead-waid`);
  assert.equal(response.body.blockingConversation?.visibility, "hidden");
  assert.equal(response.body.blockingConversation?.status, "WAITING");
  assert.equal(response.body.blockingConversation?.mode, null);
  assert.doesNotMatch(JSON.stringify(response.body), /rawPayload|hash:|externalUserHash|externalUserRef/);

  const foreign = await request<ErrorPayload>(
    "GET",
    `/app/crm/contacts/${encodeURIComponent(otherTenantLeadId)}`,
    businessAgent
  );
  assert.equal(foreign.status, 404);
  assert.equal(getErrorCode(foreign.body), "contact_not_found");

  const anonymized = await request<ErrorPayload>(
    "GET",
    `/app/crm/contacts/${encodeURIComponent(anonymizedLeadId)}`,
    businessAgent
  );
  assert.equal(anonymized.status, 404);
  assert.equal(getErrorCode(anonymized.body), "contact_not_found");
});

test("CRM and inbox resolve related conversations through confirmed WhatsApp legacy aliases", async () => {
  const department = await prisma.department.create({
    data: {
      clientId: businessClientId,
      name: `${prefix} Alias Department`,
      slug: `${prefix}-alias-department`,
    },
  });
  const queue = await prisma.queue.create({
    data: {
      clientId: businessClientId,
      departmentId: department.id,
      name: `${prefix} Alias Queue`,
    },
  });
  const contact = await prisma.contact.create({
    data: {
      clientId: businessClientId,
      waId: "5584994786787",
      name: "deifson setic",
      channel: "whatsapp",
      provider: "whatsapp",
      channelAccountId: "crm",
      externalUserRef: "558494786787",
      legacyWaId: "558494786787",
    },
  });
  const identity = await prisma.contactChannelIdentity.create({
    data: {
      clientId: businessClientId,
      contactId: contact.id,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: "web-session-alias",
      externalUserHash: `${prefix}-alias-hash`,
      externalUserRef: "558494786787",
      legacyWaId: "558494786787",
      displayName: "Provider Name",
    },
  });
  const lead = await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId: "5584994786787",
      waIdCanonical: "5584994786787",
      phone: "5584994786787",
      name: "deifson setic",
      channel: "whatsapp",
      provider: "whatsapp",
      channelAccountId: "crm",
      externalUserRef: "558494786787",
      legacyWaId: "558494786787",
      contactChannelIdentityId: identity.id,
      status: "NEW",
    },
  });
  const conversation = await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId: "558494786787",
      waIdCanonical: "558494786787",
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: "web-session-alias",
      departmentId: department.id,
      firstAssignedAt: new Date("2026-08-26T14:13:55.219Z"),
      lastOutboundAt: new Date("2026-08-26T14:13:57.594Z"),
      updatedAt: new Date("2026-08-26T14:13:57.594Z"),
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId: "558494786787",
      waIdCanonical: "558494786787",
      conversationKey: `${prefix}-business:558494786787`,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: "web-session-alias",
      status: "IN_PROGRESS",
      mode: "HUMAN",
      handoffStatus: "ACTIVE",
      assignedUserId: businessAdmin.id,
      assignedAt: new Date("2026-08-26T14:13:55.219Z"),
      departmentId: department.id,
      queueId: queue.id,
      answers: {},
      updatedAt: new Date("2026-08-26T14:13:58.061Z"),
    },
  });
  await prisma.outboundMessage.create({
    data: {
      clientId: businessClientId,
      waId: "558494786787",
      waIdCanonical: "558494786787",
      messageId: `${prefix}-alias-outbound`,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: "web-session-alias",
      type: "TEXT",
      status: "SENT",
      bodyText: "Mensagem enviada pelo CRM",
      rawPayload: { inboxVisibility: "human_timeline" },
      createdAt: new Date("2026-08-26T14:13:57.594Z"),
    },
  });
  const otherDddLead = await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId: "5511994786787",
      waIdCanonical: "5511994786787",
      phone: "5511994786787",
      name: "same suffix other ddd",
      status: "NEW",
    },
  });

  const detail = await request<{
    ok: boolean;
    item: { displayName: string | null; conversationsCount: number; lastConversationId: string | null };
    conversations: Array<{ conversationId: string; conversationIdentity: string; canOpenInInbox: boolean; assignedUserName: string | null }>;
    blockingConversation: {
      conversationId: string;
      conversationIdentity: string;
      visibility: "visible" | "hidden";
      assignedUserName: string | null;
    } | null;
  }>("GET", `/app/crm/contacts/${encodeURIComponent(lead.id)}`, businessAdmin);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.item.displayName, "deifson setic");
  assert.equal(detail.body.item.conversationsCount, 1);
  assert.equal(detail.body.item.lastConversationId, conversation.id);
  assert.equal(detail.body.conversations[0]?.conversationIdentity, "558494786787");
  assert.equal(detail.body.conversations[0]?.canOpenInInbox, true);
  assert.equal(detail.body.conversations[0]?.assignedUserName, businessAdmin.name);
  assert.equal(detail.body.blockingConversation?.conversationId, conversation.id);
  assert.equal(detail.body.blockingConversation?.conversationIdentity, "558494786787");
  assert.equal(detail.body.blockingConversation?.visibility, "visible");
  assert.equal(detail.body.blockingConversation?.assignedUserName, businessAdmin.name);

  const blockedExclude = await request<
    ErrorPayload & {
      blockingConversation?: {
        conversationId: string;
        conversationIdentity: string;
        visibility?: "visible" | "hidden";
      };
    }
  >("POST", `/app/crm/contacts/${encodeURIComponent(lead.id)}/exclude`, businessAdmin, {
    reason: "test active blocker",
  });
  assert.equal(blockedExclude.status, 409);
  assert.equal(getErrorCode(blockedExclude.body), "active_conversation_exists");
  assert.equal(blockedExclude.body.blockingConversation?.conversationId, "558494786787");
  assert.equal(blockedExclude.body.blockingConversation?.conversationIdentity, "558494786787");
  assert.equal(blockedExclude.body.blockingConversation?.visibility, "visible");

  const inbox = await request<{ ok: boolean; items: Array<{ waIdCanonical: string; leadId: string | null; leadName: string | null }> }>(
    "GET",
    "/app/conversations?limit=100",
    businessAdmin
  );
  assert.equal(inbox.status, 200);
  const inboxConversation = inbox.body.items.find((item) => item.waIdCanonical === "558494786787");
  assert.ok(inboxConversation);
  assert.equal(inboxConversation.leadId, lead.id);
  assert.equal(inboxConversation.leadName, "deifson setic");

  const otherDddDetail = await request<{
    ok: boolean;
    item: { conversationsCount: number; lastConversationId: string | null; hasConversation: boolean };
    conversations: unknown[];
  }>("GET", `/app/crm/contacts/${encodeURIComponent(otherDddLead.id)}`, businessAdmin);
  assert.equal(otherDddDetail.status, 200);
  assert.equal(otherDddDetail.body.item.conversationsCount, 0);
  assert.equal(otherDddDetail.body.item.lastConversationId, null);
  assert.equal(otherDddDetail.body.item.hasConversation, false);
});

test("CRM contact mutation routes update safe fields and audit without exposing forbidden payloads", async () => {
  const response = await request<{
    ok: boolean;
    item: {
      leadId: string;
      displayName: string | null;
      companyName: string | null;
      email: string | null;
      city: string | null;
      phoneDisplay: string | null;
      identifierDisplay: string;
    };
  }>("PATCH", `/app/crm/contacts/${encodeURIComponent(instagramLeadId)}`, businessAdmin, {
    displayName: "Cliente Instagram Atualizado",
    companyName: "Empresa Atualizada",
    email: "contato@example.test",
    city: "Curitiba/PR",
    phone: "551188887777",
    waId: "551188887777",
    externalUserHash: "hash:should-not-persist",
    rawPayload: { token: "secret" },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.item.displayName, "Cliente Instagram Atualizado");
  assert.equal(response.body.item.companyName, "Empresa Atualizada");
  assert.equal(response.body.item.email, "contato@example.test");
  assert.equal(response.body.item.city, "Curitiba/PR");
  assert.equal(response.body.item.phoneDisplay, null);
  assert.equal(response.body.item.identifierDisplay, "Cliente Instagram Atualizado");

  const stored = await prisma.lead.findUniqueOrThrow({
    where: { id: instagramLeadId },
    select: { waId: true, name: true, company: true, email: true, city: true, externalUserHash: true },
  });
  assert.equal(stored.waId, `instagram:${prefix}:sender`);
  assert.equal(stored.externalUserHash, `hash:${prefix}:instagram`);
  assert.equal(stored.name, "Cliente Instagram Atualizado");
  assert.equal(stored.company, "Empresa Atualizada");
  assert.equal(stored.email, "contato@example.test");
  assert.equal(stored.city, "Curitiba/PR");

  const event = await prisma.event.findFirstOrThrow({
    where: { clientId: businessClientId, eventName: "crm.contact.updated" },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });
  const serialized = JSON.stringify(event.payloadJson);
  assert.match(serialized, /fieldsChanged/);
  assert.doesNotMatch(serialized, /contato@example.test|Cliente Instagram Atualizado|secret|rawPayload|hash:should-not-persist/);

  const foreign = await request<ErrorPayload>(
    "PATCH",
    `/app/crm/contacts/${encodeURIComponent(otherTenantLeadId)}`,
    businessAdmin,
    { displayName: "Cross tenant" }
  );
  assert.equal(foreign.status, 404);
  assert.equal(getErrorCode(foreign.body), "contact_not_found");
});

test("CRM status mutation accepts only active tenant statuses", async () => {
  const valid = await request<{ ok: boolean; item: { crmStatus: string; crmStatusLabel: string } }>(
    "PATCH",
    `/app/crm/contacts/${encodeURIComponent(instagramLeadId)}/status`,
    businessAdmin,
    { status: "OPEN" }
  );
  assert.equal(valid.status, 200);
  assert.equal(valid.body.ok, true);
  assert.equal(valid.body.item.crmStatus, "OPEN");
  assert.equal(valid.body.item.crmStatusLabel, "Em aberto");

  const invalid = await request<ErrorPayload>(
    "PATCH",
    `/app/crm/contacts/${encodeURIComponent(instagramLeadId)}/status`,
    businessAdmin,
    { status: "ARQUIVADO" }
  );
  assert.equal(invalid.status, 400);
  assert.equal(getErrorCode(invalid.body), "status_not_configured");
});

test("CRM opt-out lifecycle records events and updates read model", async () => {
  const revoke = await request<{ ok: boolean; item: { activeOptOut: boolean } }>(
    "DELETE",
    `/app/crm/contacts/${encodeURIComponent(leadId)}/opt-out`,
    businessAdmin
  );
  assert.equal(revoke.status, 200);
  assert.equal(revoke.body.ok, true);
  assert.equal(revoke.body.item.activeOptOut, false);

  const record = await request<{ ok: boolean; item: { activeOptOut: boolean } }>(
    "POST",
    `/app/crm/contacts/${encodeURIComponent(leadId)}/opt-out`,
    businessAdmin,
    { reason: "manual_test" }
  );
  assert.equal(record.status, 200);
  assert.equal(record.body.ok, true);
  assert.equal(record.body.item.activeOptOut, true);

  const events = await prisma.event.findMany({
    where: {
      clientId: businessClientId,
      eventName: { in: ["contact.opt_out.recorded", "contact.opt_out.revoked"] },
    },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: { eventName: true, payloadJson: true },
  });
  assert.deepEqual(events.map((event) => event.eventName), [
    "contact.opt_out.recorded",
    "contact.opt_out.revoked",
  ]);
  assert.doesNotMatch(JSON.stringify(events), /9999999999|secret|rawPayload/);

  const unavailable = await request<ErrorPayload>(
    "POST",
    `/app/crm/contacts/${encodeURIComponent(instagramLeadId)}/opt-out`,
    businessAdmin,
    { reason: "not_whatsapp" }
  );
  assert.equal(unavailable.status, 400);
  assert.equal(getErrorCode(unavailable.body), "opt_out_identity_unavailable");
});

test("CRM contacts endpoint requires authentication", async () => {
  const response = await fetch(`${baseUrl}/app/crm/contacts`);
  assert.equal(response.status, 401);

  const patch = await fetch(`${baseUrl}/app/crm/contacts/${encodeURIComponent(leadId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Sem token" }),
  });
  assert.equal(patch.status, 401);
});

test("CRM contact destructive or inactive lifecycle routes are not exposed", async () => {
  const inactive = await request<ErrorPayload>(
    "POST",
    `/app/crm/contacts/${encodeURIComponent(instagramLeadId)}/inactivate`,
    businessAdmin,
    {}
  );
  assert.equal(inactive.status, 404);
  assert.equal(getErrorCode(inactive.body), "not_found");

  const remove = await request<ErrorPayload>(
    "DELETE",
    `/app/crm/contacts/${encodeURIComponent(instagramLeadId)}`,
    businessAdmin
  );
  assert.equal(remove.status, 404);
  assert.equal(getErrorCode(remove.body), "not_found");
});

test("government profile default is blocked by CRM capability on protected routes", async () => {
  const routes = [
    { method: "GET", route: "/app/crm/settings" },
    { method: "GET", route: "/app/crm/statuses" },
    { method: "GET", route: "/app/crm/contacts" },
    { method: "POST", route: "/app/crm/contacts", body: { phone: "5541999999999" } },
    { method: "POST", route: "/app/crm/contacts/import/preview", body: { csvText: "numero\n5541999999999\n" } },
    { method: "POST", route: "/app/crm/contacts/import/confirm", body: { csvText: "numero\n5541999999999\n" } },
    { method: "GET", route: "/app/crm/contacts/missing" },
    { method: "PATCH", route: "/app/crm/contacts/missing", body: { displayName: "x" } },
    { method: "PATCH", route: "/app/crm/contacts/missing/status", body: { status: "OPEN" } },
    { method: "POST", route: "/app/crm/contacts/missing/opt-out", body: {} },
    { method: "DELETE", route: "/app/crm/contacts/missing/opt-out" },
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


test("CSV operation recovery enforces tenant, role, payload binding and no replay", async () => {
  const operationId = crypto.randomUUID();
  const payload = { operationId, csvText: "phone,name\n5584912349999,Synthetic recovery", mapping: { phoneColumn: "phone", nameColumn: "name" } };
  const unauth = await fetch(`${baseUrl}/app/crm/contacts/import/operations/${operationId}`);
  assert.equal(unauth.status,401);
  assert.equal((await request("GET",`/app/crm/contacts/import/operations/${operationId}`,businessAgent)).status,403);
  const started = await request<{ status: string; summary: unknown }>("POST","/app/crm/contacts/import/confirm",businessSupervisor,payload);
  assert.equal(started.status,200);assert.equal(started.body.status,"COMPLETED");
  const before = await prisma.event.count({where:{clientId:businessClientId}});
  const recovered = await request<{ status: string; summary: unknown }>("GET",`/app/crm/contacts/import/operations/${operationId}`,businessSupervisor);
  assert.equal(recovered.body.status,"COMPLETED");assert.deepEqual(recovered.body.summary,started.body.summary);
  const replay = await request<{ summary: unknown }>("POST","/app/crm/contacts/import/confirm",businessSupervisor,payload);
  assert.deepEqual(replay.body.summary,started.body.summary);assert.equal(await prisma.event.count({where:{clientId:businessClientId}}),before);
  const foreign = await request<{status:string;summary:unknown}>("GET",`/app/crm/contacts/import/operations/${operationId}`,overrideAdmin);
  assert.equal(foreign.status,200);assert.equal(foreign.body.status,"UNKNOWN");assert.equal(foreign.body.summary,null);
  assert.equal((await request("POST","/app/crm/contacts/import/confirm",businessSupervisor,{...payload,csvText:payload.csvText+"\n5584912348888,Other"})).status,409);
});


test("permitted CRM total is independent of operationalStatus; excluded scope stays ADMIN-only", async () => {
  type Page = { items: Array<{leadId:string}>; pagination: {total:number}; totals: {tenantVisible:number;filtered:number;pageCount:number} };
  const active = await request<Page>("GET", "/app/crm/contacts?operationalStatus=active", businessAdmin);
  const beforeExcluded = await request<Page>("GET", "/app/crm/contacts?operationalStatus=excluded", businessAdmin);
  const waId = "5584912347771";
  const contact = await prisma.contact.create({data:{clientId:businessClientId,waId,name:"Synthetic excluded count",operationallyExcludedAt:new Date()}});
  const lead = await prisma.lead.create({data:{tenantId:businessClientId,waId,waIdCanonical:waId,name:"Synthetic excluded count",status:"NEW"}});
  try {
    const a = await request<Page>("GET", "/app/crm/contacts?operationalStatus=active", businessAdmin);
    const e = await request<Page>("GET", "/app/crm/contacts?operationalStatus=excluded", businessAdmin);
    assert.equal(a.status,200);assert.equal(e.status,200);
    assert.equal(a.body.totals.tenantVisible,active.body.totals.tenantVisible+1);
    assert.equal(a.body.totals.tenantVisible,e.body.totals.tenantVisible);
    assert.equal(a.body.totals.filtered,active.body.totals.filtered);
    assert.equal(e.body.totals.filtered,beforeExcluded.body.totals.filtered+1);
    assert.ok(!a.body.items.some(x=>x.leadId===lead.id));assert.ok(e.body.items.some(x=>x.leadId===lead.id));
    assert.equal(a.body.totals.tenantVisible,a.body.pagination.total+e.body.pagination.total);
    for (const user of [businessAgent,businessSupervisor]) {
      const allowed=await request<Page>("GET","/app/crm/contacts?operationalStatus=active",user);
      assert.equal(allowed.body.totals.tenantVisible,a.body.pagination.total);
      assert.equal((await request("GET","/app/crm/contacts?operationalStatus=excluded",user)).status,403);
    }
  } finally {await prisma.lead.delete({where:{id:lead.id}});await prisma.contact.delete({where:{id:contact.id}});}
});
