import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { issueClientAuthToken } from "../auth/clientAuth.js";
import { buildAppAuthSessionExpiresAt } from "../auth/sessionPolicy.js";
import { normalizeOptOutWaId } from "../campaigns/optOutRegistry.js";
import { getPrisma } from "../db.js";

process.env.APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "crm-start-route-test-secret";

type TestUser = {
  id: string;
  clientId: string;
  name: string;
  email: string;
  role: string;
};

type TestResponse<T = unknown> = {
  status: number;
  body: T;
};

type ErrorPayload = {
  error?: string | { code?: string; message?: string };
};

const prisma = getPrisma();
const originalCwd = process.cwd();
const prefix = `crm-start-${process.pid}-${Date.now()}`;

let tempRoot = "";
let server: Server;
let baseUrl = "";
let clientId = "";
let admin: TestUser;
let supervisor: TestUser;
let agent: TestUser;

function getErrorCode(payload: ErrorPayload) {
  return typeof payload.error === "string" ? payload.error : payload.error?.code;
}

async function writeTenants(clientKey: string) {
  const tenantsPath = path.join(tempRoot, ".data", "tenants.json");
  await fs.mkdir(path.dirname(tenantsPath), { recursive: true });
  await fs.writeFile(
    tenantsPath,
    JSON.stringify({
      [clientKey]: {
        id: clientKey,
        name: clientKey,
        metaPhoneNumberId: `phone-${clientKey}`,
        allowlist: [],
        handoffAttendantWaid: "",
        defaultLanguage: "pt_BR",
      },
    }),
    "utf-8"
  );
}

async function createUser(params: { role: string; suffix: string }): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      clientId,
      name: `CRM Start ${params.role}`,
      email: `${prefix}-${params.suffix}@example.test`,
      role: params.role,
      isActive: true,
    },
    select: { id: true, clientId: true, name: true, email: true, role: true },
  });
  await prisma.appAuthSession.create({
    data: {
      id: `${user.id}-session`,
      clientId,
      userId: user.id,
      expiresAt: buildAppAuthSessionExpiresAt(),
    },
  });
  return user;
}

function authToken(user: TestUser) {
  return issueClientAuthToken(user, `${user.id}-session`);
}

async function request<T = unknown>(method: string, route: string, user: TestUser, body?: unknown) {
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
  } satisfies TestResponse<T>;
}

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { clientKey: { startsWith: prefix } },
    select: { id: true },
  });
  const clientIds = clients.map((client) => client.id);
  if (clientIds.length === 0) return;
  await prisma.conversationAssignment.deleteMany({
    where: { conversation: { clientId: { in: clientIds } } },
  });
  await prisma.outboundMessage.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.message.deleteMany({ where: { conversation: { clientId: { in: clientIds } } } });
  await prisma.conversationRuntimeState.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.conversation.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.contactChannelIdentity.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.contact.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.lead.deleteMany({ where: { tenantId: { in: clientIds } } });
  await prisma.event.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.channelAccountSecret.deleteMany({
    where: { channelAccount: { clientId: { in: clientIds } } },
  });
  await prisma.channelAccount.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.tenantOperationalConfig.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.appAuthSession.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.user.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
}

test.before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "re7-crm-start-route-"));
  process.chdir(tempRoot);
  await cleanup();

  const clientKey = `${prefix}-tenant`;
  const client = await prisma.client.create({
    data: {
      clientKey,
      name: "CRM Start Route",
      profile: "business",
      features: { crm: true, whatsappWebSession: true },
      status: "ACTIVE",
    },
    select: { id: true },
  });
  clientId = client.id;
  await writeTenants(clientKey);
  await prisma.tenantOperationalConfig.create({
    data: {
      clientId,
      schemaVersion: 1,
      config: { whatsappPrimaryTransport: "web_session" },
    },
  });
  await prisma.channelAccount.create({
    data: {
      clientId,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: `${prefix}-web-session`,
      displayName: "CRM Start Web Session",
      enabled: true,
      runtimeEnabled: true,
      inboundPersistenceEnabled: true,
      outboundEnabled: true,
      automationEnabled: true,
      aiEnabled: false,
      handoffEnabled: true,
      status: "connected",
      tokenStatus: "not_required",
      metadata: {
        webSession: {
          desiredState: "CONNECTED",
          observedState: "CONNECTED",
        },
      },
    },
  });
  admin = await createUser({ role: "ADMIN", suffix: "admin" });
  supervisor = await createUser({ role: "SUPERVISOR", suffix: "supervisor" });
  agent = await createUser({ role: "AGENT", suffix: "agent" });

  const { handleRequest } = await import("./routes.js");
  server = createServer((req, res) => {
    void handleRequest(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
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
});

test("CRM contact start creates conversation only on first explicit Web Session send", async () => {
  const workerRequests: Array<Record<string, unknown>> = [];
  const worker = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      workerRequests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, externalMessageId: `worker-${workerRequests.length}` }));
    });
  });
  await new Promise<void>((resolve) => worker.listen(0, "127.0.0.1", resolve));
  const workerAddress = worker.address();
  assert.equal(typeof workerAddress, "object");
  const previousWorkerUrl = process.env.WHATSAPP_WEB_WORKER_CONTROL_URL;
  process.env.WHATSAPP_WEB_WORKER_CONTROL_URL = `http://127.0.0.1:${(workerAddress as AddressInfo).port}`;

  try {
    const identity = normalizeOptOutWaId("558499991234");
    assert.ok(identity);
    const lead = await prisma.lead.create({
      data: {
        tenantId: clientId,
        waId: identity.waIdCanonical,
        waIdCanonical: identity.waIdCanonical,
        phone: identity.waIdCanonical,
        name: "CRM Start Contact",
        channel: "whatsapp",
        status: "QUALIFIED",
      },
      select: { id: true },
    });
    const contact = await prisma.contact.create({
      data: {
        clientId,
        waId: identity.waIdCanonical,
        name: "CRM Start Contact",
        channel: "whatsapp",
        provider: "web_session",
        lifecycle: "ACTIVE",
      },
      select: { id: true },
    });
    await prisma.contactChannelIdentity.create({
      data: {
        clientId,
        contactId: contact.id,
        channel: "whatsapp",
        provider: "web_session",
        channelAccountId: `${prefix}-web-session`,
        externalUserHash: identity.waIdCanonical,
        legacyWaId: identity.waIdCanonical,
        displayName: "CRM Start Contact",
      },
    });

    const listing = await request<{
      ok: boolean;
      items: Array<{ leadId: string; canStartConversation?: boolean; hasConversation: boolean }>;
    }>("GET", "/app/crm/contacts?q=CRM%20Start%20Contact&limit=10", supervisor);
    assert.equal(listing.status, 200, JSON.stringify(listing.body));
    const listed = listing.body.items.find((item) => item.leadId === lead.id);
    assert.equal(listed?.hasConversation, false);
    assert.equal(listed?.canStartConversation, true);
    assert.equal(await prisma.conversation.count({ where: { clientId, waId: identity.waIdCanonical } }), 0);
    assert.equal(workerRequests.length, 0);

    const agentStart = await request<ErrorPayload>(
      "POST",
      `/app/crm/contacts/${encodeURIComponent(lead.id)}/start-conversation`,
      agent,
      { text: "Ola do CRM" }
    );
    assert.equal(agentStart.status, 403);
    assert.equal(getErrorCode(agentStart.body), "forbidden");

    const started = await request<{
      ok: boolean;
      waIdCanonical: string;
      status: string;
      mode: string;
      handoffStatus: string;
      assignedUserId: string;
      message: { status: string; protocol: string; metaMessageId: string | null; bodyText: string };
    }>(
      "POST",
      `/app/crm/contacts/${encodeURIComponent(lead.id)}/start-conversation`,
      admin,
      { text: "Ola do CRM" }
    );
    assert.equal(started.status, 200, JSON.stringify(started.body));
    assert.equal(started.body.waIdCanonical, identity.waIdCanonical);
    assert.equal(started.body.status, "IN_PROGRESS");
    assert.equal(started.body.mode, "HUMAN");
    assert.equal(started.body.handoffStatus, "active");
    assert.equal(started.body.assignedUserId, admin.id);
    assert.equal(started.body.message.status, "SENT");
    assert.equal(started.body.message.metaMessageId, null);
    assert.match(started.body.message.protocol, /^CVT-/);
    assert.equal(workerRequests.length, 1);
    assert.equal(workerRequests[0]?.recipientWaId, identity.waIdCanonical);

    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { clientId, waId: identity.waIdCanonical },
      select: { provider: true, closedAt: true, lastOutboundAt: true },
    });
    assert.equal(conversation.provider, "web_session");
    assert.equal(conversation.closedAt, null);
    assert.ok(conversation.lastOutboundAt);
    assert.equal(
      (await prisma.event.count({ where: { clientId, eventName: "conversation.protocol.started" } })) >= 1,
      true
    );
    assert.equal(await prisma.outboundMessage.count({ where: { clientId, waId: identity.waIdCanonical } }), 1);
  } finally {
    process.env.WHATSAPP_WEB_WORKER_CONTROL_URL = previousWorkerUrl;
    await new Promise<void>((resolve, reject) => {
      worker.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
