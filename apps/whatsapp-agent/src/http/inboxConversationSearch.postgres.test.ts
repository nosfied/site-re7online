import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getPrisma } from "../db.js";
import { issueClientAuthToken } from "../auth/clientAuth.js";
import { buildAppAuthSessionExpiresAt } from "../auth/sessionPolicy.js";
import { syncUserDepartmentMemberships } from "../users/departmentMemberships.js";

const databaseUrl = new URL(process.env.DATABASE_URL ?? "http://missing");
assert(databaseUrl.protocol === "postgresql:");
assert(["127.0.0.1", "localhost"].includes(databaseUrl.hostname), "synthetic local DB required");
assert(databaseUrl.pathname.startsWith("/re7_"), "isolated re7 test database required");

const prisma = getPrisma();
const prefix = `inbox-search-${crypto.randomUUID()}`;
const originalCwd = process.cwd();
let tempRoot = "";
let server: Server;
let baseUrl = "";
let tenantA: Awaited<ReturnType<typeof prisma.client.create>>;
let tenantB: Awaited<ReturnType<typeof prisma.client.create>>;
let departmentA: Awaited<ReturnType<typeof prisma.department.create>>;
let departmentB: Awaited<ReturnType<typeof prisma.department.create>>;
let queueA: Awaited<ReturnType<typeof prisma.queue.create>>;
let queueB: Awaited<ReturnType<typeof prisma.queue.create>>;
let departmentTenantB: Awaited<ReturnType<typeof prisma.department.create>>;
let queueTenantB: Awaited<ReturnType<typeof prisma.queue.create>>;
let adminA: Awaited<ReturnType<typeof prisma.user.create>>;
let agentA: Awaited<ReturnType<typeof prisma.user.create>>;
let adminB: Awaited<ReturnType<typeof prisma.user.create>>;

async function createUser(clientId: string, role: string, name: string, departmentId: string | null) {
  const user = await prisma.user.create({
    data: { clientId, role, name, email: `${prefix}-${name}@example.test`, isActive: true, departmentId },
  });
  await prisma.appAuthSession.create({
    data: { id: `${user.id}-session`, userId: user.id, clientId, expiresAt: buildAppAuthSessionExpiresAt() },
  });
  return user;
}

async function request(route: string, actor = adminA) {
  const response = await fetch(`${baseUrl}${route}`, {
    headers: { authorization: `Bearer ${issueClientAuthToken(actor, `${actor.id}-session`)}` },
  });
  return { status: response.status, body: await response.json() as any };
}

async function createConversation(params: {
  tenantId?: string;
  departmentId?: string;
  queueId?: string;
  waId: string;
  name: string;
  phone?: string;
  protocol: string;
  status?: "WAITING" | "CLOSED";
  updatedAt: Date;
}) {
  const tenantId = params.tenantId ?? tenantA.id;
  const departmentId = params.departmentId ?? departmentA.id;
  const queueId = params.queueId ?? queueA.id;
  const status = params.status ?? "WAITING";
  const conversation = await prisma.conversation.create({
    data: {
      clientId: tenantId, departmentId, waId: params.waId, waIdCanonical: params.waId,
      channel: "whatsapp", provider: "meta", lastInboundAt: params.updatedAt, updatedAt: params.updatedAt,
    },
  });
  const cycle = {
    protocol: params.protocol,
    cycleId: crypto.randomUUID(),
    issuedAt: params.updatedAt.toISOString(),
    source: "synthetic",
  };
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: tenantId, waId: params.waId, waIdCanonical: params.waId,
      conversationKey: `${tenantId}:${params.waId}`, channel: "whatsapp", provider: "meta",
      status, mode: "HUMAN", handoffStatus: "ACTIVE", handoffActivatedAt: params.updatedAt,
      departmentId, queueId,
      ...(status === "CLOSED"
        ? { closedAt: params.updatedAt, answers: { lastClosedServiceCycle: { ...cycle, closedAt: params.updatedAt.toISOString() } } }
        : { answers: { operationalProtocol: cycle } }),
      updatedAt: params.updatedAt,
    },
  });
  await prisma.lead.create({
    data: {
      tenantId, waId: params.waId, waIdCanonical: params.waId,
      name: params.name, phone: params.phone ?? params.waId,
      channel: "whatsapp", provider: "meta",
    },
  });
  await prisma.inboundMessage.create({
    data: {
      clientId: tenantId, waId: params.waId, waIdCanonical: params.waId,
      messageId: `${prefix}-${params.waId}`, type: "TEXT", bodyText: "mensagem sintética",
      allowlistHit: true, rawPayload: { serviceCycle: cycle }, createdAt: params.updatedAt,
    },
  });
  if (status === "CLOSED") {
    await prisma.completedServiceSnapshot.create({
      data: {
        clientId: tenantId, conversationId: conversation.id, cycleId: cycle.cycleId,
        protocol: cycle.protocol, closedAt: params.updatedAt, departmentId, queueId,
      },
    });
  }
  return conversation;
}

test.before(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "re7-inbox-search-"));
  process.chdir(tempRoot);
  tenantA = await prisma.client.create({ data: { clientKey: `${prefix}-a`, name: "Inbox search A" } });
  tenantB = await prisma.client.create({ data: { clientKey: `${prefix}-b`, name: "Inbox search B" } });
  departmentA = await prisma.department.create({ data: { clientId: tenantA.id, name: "Atendimento A", slug: `${prefix}-a` } });
  departmentB = await prisma.department.create({ data: { clientId: tenantA.id, name: "Atendimento B", slug: `${prefix}-b` } });
  queueA = await prisma.queue.create({ data: { clientId: tenantA.id, departmentId: departmentA.id, name: "Fila A" } });
  queueB = await prisma.queue.create({ data: { clientId: tenantA.id, departmentId: departmentB.id, name: "Fila B" } });
  departmentTenantB = await prisma.department.create({ data: { clientId: tenantB.id, name: "Atendimento tenant B", slug: `${prefix}-tenant-b` } });
  queueTenantB = await prisma.queue.create({ data: { clientId: tenantB.id, departmentId: departmentTenantB.id, name: "Fila tenant B" } });
  await prisma.department.update({ where: { id: departmentA.id }, data: { operationalQueueId: queueA.id } });
  await prisma.department.update({ where: { id: departmentB.id }, data: { operationalQueueId: queueB.id } });
  await prisma.department.update({ where: { id: departmentTenantB.id }, data: { operationalQueueId: queueTenantB.id } });
  adminA = await createUser(tenantA.id, "ADMIN", "admin-a", departmentA.id);
  agentA = await createUser(tenantA.id, "AGENT", "agent-a", departmentA.id);
  adminB = await createUser(tenantB.id, "ADMIN", "admin-b", null);
  await syncUserDepartmentMemberships(prisma, {
    clientId: tenantA.id, userId: agentA.id, departmentIds: [departmentA.id], primaryDepartmentId: departmentA.id,
  });
  await mkdir(path.join(tempRoot, ".data"));
  await writeFile(path.join(tempRoot, ".data/tenants.json"), JSON.stringify({
    [tenantA.clientKey]: { id: tenantA.clientKey, name: tenantA.name, metaPhoneNumberId: "phone-a", allowlist: [], handoffAttendantWaid: "", defaultLanguage: "pt_BR" },
    [tenantB.clientKey]: { id: tenantB.clientKey, name: tenantB.name, metaPhoneNumberId: "phone-b", allowlist: [], handoffAttendantWaid: "", defaultLanguage: "pt_BR" },
  }));
  const { handleRequest } = await import("./routes.js");
  server = createServer((req, res) => { void handleRequest(req, res); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

test.after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
  process.chdir(originalCwd);
});

test("remote inbox search finds name, phone and active protocol with normalization", async () => {
  await createConversation({
    waId: "5581999993209", name: "Mária Júlia", phone: "+55 (81) 99999-3209",
    protocol: "CVT-A1B2C3D4E5F6", updatedAt: new Date("2026-11-12T12:00:00Z"),
  });
  for (const [search, expected] of [
    ["maria julia", "5581999993209"],
    ["(81) 99999-3209", "5581999993209"],
    ["c3d4e5", "5581999993209"],
    ["Protocolo CVT-A1B2-C3D4-E5F6", "5581999993209"],
  ]) {
    const response = await request(`/app/conversations?search=${encodeURIComponent(search)}&limit=10`);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.items.map((item: any) => item.waId), [expected]);
  }
});

test("search pagination remains bound to the query and closed filter", async () => {
  await createConversation({
    waId: "558188880001", name: "Cliente Busca Alpha", protocol: "CVT-111111111111",
    status: "CLOSED", updatedAt: new Date("2026-11-12T11:00:00Z"),
  });
  await createConversation({
    waId: "558188880002", name: "Cliente Busca Beta", protocol: "CVT-222222222222",
    status: "CLOSED", updatedAt: new Date("2026-11-12T10:00:00Z"),
  });
  const first = await request("/app/conversations?search=cliente%20busca&status=CLOSED&limit=1");
  assert.equal(first.body.items.length, 1);
  assert(first.body.nextCursor);
  const second = await request(`/app/conversations?search=cliente%20busca&status=CLOSED&limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`);
  assert.equal(second.body.items.length, 1);
  assert.notEqual(second.body.items[0].waId, first.body.items[0].waId);
  const closedProtocol = await request("/app/conversations?search=222222&status=CLOSED&limit=10");
  assert.deepEqual(closedProtocol.body.items.map((item: any) => item.waId), ["558188880002"]);
});

test("search preserves department RBAC and tenant isolation", async () => {
  await createConversation({
    departmentId: departmentB.id, queueId: queueB.id, waId: "558177770001",
    name: "Segredo Compartilhado", protocol: "CVT-DEPTB0000001", updatedAt: new Date("2026-11-12T09:00:00Z"),
  });
  await createConversation({
    tenantId: tenantB.id, departmentId: departmentTenantB.id, queueId: queueTenantB.id, waId: "558166660001",
    name: "Segredo Compartilhado", protocol: "CVT-TENANTB00001", updatedAt: new Date("2026-11-12T08:00:00Z"),
  });
  const agent = await request("/app/conversations?search=segredo%20compartilhado", agentA);
  assert.equal(agent.status, 200);
  assert.equal(agent.body.items.length, 0);
  const admin = await request("/app/conversations?search=segredo%20compartilhado", adminA);
  assert.deepEqual(admin.body.items.map((item: any) => item.waId), ["558177770001"]);
  const other = await request("/app/conversations?search=segredo%20compartilhado", adminB);
  assert.deepEqual(other.body.items.map((item: any) => item.waId), ["558166660001"]);
});

