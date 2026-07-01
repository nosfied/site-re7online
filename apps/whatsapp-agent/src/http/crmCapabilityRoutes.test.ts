import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { APP_AUTH_SESSION_EXPIRES_AT } from "../auth/appSessionService.js";
import { issueClientAuthToken } from "../auth/clientAuth.js";
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
  await prisma.leadNote.deleteMany({
    where: {
      tenantId: {
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
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
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

test("government profile default is blocked by CRM capability on protected routes", async () => {
  const routes = [
    { method: "GET", route: "/app/crm/settings" },
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
