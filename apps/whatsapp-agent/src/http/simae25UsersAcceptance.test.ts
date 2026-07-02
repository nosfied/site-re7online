import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ConversationOperationalStatus, HandoffStatus } from "@prisma/client";
import { APP_AUTH_SESSION_EXPIRES_AT } from "../auth/appSessionService.js";
import { issueClientAuthToken } from "../auth/clientAuth.js";
import { getPrisma } from "../db.js";

process.env.APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "simae-25-users-acceptance-secret";

type TestUser = {
  id: string;
  clientId: string;
  name: string;
  email: string;
  role: string;
  departmentId?: string | null;
};

type TestResponse<T = unknown> = {
  status: number;
  body: T;
};

type ErrorPayload = {
  error?: string | { code?: string; message?: string };
  message?: string;
};

const prisma = getPrisma();
const originalCwd = process.cwd();
const prefix = `simae-25-users-${process.pid}-${Date.now()}`;

let tempRoot = "";
let server: Server;
let baseUrl = "";
let handleRequest: typeof import("./routes.js").handleRequest;
let runtimeStorage: typeof import("../storage/runtimeStorage.js").runtimeStorage;
let clientId = "";
let otherClientId = "";
let clientKey = "";
let adminUser: TestUser;
let agentOne: TestUser;
let agentTwo: TestUser;
let supervisorTwo: TestUser;
let otherTenantAdmin: TestUser;
let departmentOneId = "";
let departmentTwoId = "";
let conversationWaId = "";

function getErrorCode(payload: ErrorPayload) {
  return typeof payload.error === "string" ? payload.error : payload.error?.code;
}

function makeTenant(id: string, maxActiveAppUsers = 25) {
  return {
    id,
    name: id,
    metaPhoneNumberId: `phone-${id}`,
    allowlist: [],
    handoffAttendantWaid: "",
    defaultLanguage: "pt_BR",
    maxActiveAppUsers,
  };
}

async function writeTenants(clientKeys: string[]) {
  const tenantsPath = path.join(tempRoot, ".data", "tenants.json");
  await fs.mkdir(path.dirname(tenantsPath), { recursive: true });
  await fs.writeFile(
    tenantsPath,
    JSON.stringify(Object.fromEntries(clientKeys.map((key) => [key, makeTenant(key, 25)])), null, 2),
    "utf-8"
  );
}

async function createSessionUser(params: {
  clientId: string;
  role: string;
  suffix: string;
  departmentId?: string | null;
}): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      clientId: params.clientId,
      name: `SIMAE ${params.role} ${params.suffix}`,
      email: `${prefix}-${params.suffix}@example.test`,
      role: params.role,
      departmentId: params.departmentId ?? null,
      isActive: true,
    },
    select: {
      id: true,
      clientId: true,
      name: true,
      email: true,
      role: true,
      departmentId: true,
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

async function ensureAppSession(user: TestUser) {
  await prisma.appAuthSession.upsert({
    where: { id: `${user.id}-session` },
    create: {
      id: `${user.id}-session`,
      clientId: user.clientId,
      userId: user.id,
      expiresAt: APP_AUTH_SESSION_EXPIRES_AT,
    },
    update: {
      expiresAt: APP_AUTH_SESSION_EXPIRES_AT,
    },
  });
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
    where: { clientKey: { startsWith: prefix } },
    select: { id: true },
  });
  const clientIds = clients.map((client) => client.id);
  if (clientIds.length === 0) return;

  const runtimeStates = await prisma.conversationRuntimeState.findMany({
    where: { clientId: { in: clientIds } },
    select: { id: true },
  });
  await prisma.conversationAssignment.deleteMany({
    where: { conversationId: { in: runtimeStates.map((item) => item.id) } },
  });
  await prisma.conversationRuntimeState.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.conversation.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.event.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.appAuthSession.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.user.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.queue.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.department.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
}

async function createDepartmentWithQueue(name: string) {
  const department = await prisma.department.create({
    data: {
      clientId,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    },
    select: { id: true },
  });
  const queue = await prisma.queue.create({
    data: {
      clientId,
      departmentId: department.id,
      name: `Fila ${name}`,
    },
    select: { id: true },
  });
  return { departmentId: department.id, queueId: queue.id };
}

async function createConversationFixture(params: {
  waId: string;
  departmentId: string;
  queueId: string;
}) {
  const now = new Date();
  await prisma.conversation.create({
    data: {
      clientId,
      waId: params.waId,
      waIdCanonical: params.waId,
      channel: "whatsapp",
      provider: "meta",
      departmentId: params.departmentId,
      lastInboundAt: now,
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId,
      waId: params.waId,
      waIdCanonical: params.waId,
      conversationKey: `${clientKey}:${params.waId}`,
      channel: "whatsapp",
      provider: "meta",
      firstSeenAt: now,
      windowIsOpen: true,
      lastInboundAt: now,
      handoffStatus: HandoffStatus.ACTIVE,
      handoffRequestedAt: now,
      handoffActivatedAt: now,
      mode: "HUMAN",
      assignedUserId: null,
      assignedTo: null,
      assignedAt: null,
      departmentId: params.departmentId,
      queueId: params.queueId,
      status: ConversationOperationalStatus.WAITING,
    },
  });
  await runtimeStorage.upsertConversation({
    clientKey,
    waId: params.waId,
    waIdCanonical: params.waId,
    firstSeenAt: now.toISOString(),
    window: { isOpen: true },
    lastInboundAt: now.toISOString(),
    mode: "HUMAN",
    handoff: {
      status: "active",
      requestedAt: now.toISOString(),
      activatedAt: now.toISOString(),
    },
    assignedUserId: null,
    assignedTo: null,
    assignedAt: null,
    departmentId: params.departmentId,
    queueId: params.queueId,
    status: ConversationOperationalStatus.WAITING,
  });
}

test.before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "re7-simae-25-users-"));
  process.chdir(tempRoot);
  await cleanup();

  const clientKeyValue = `${prefix}-tenant`;
  const otherClientKey = `${prefix}-other`;
  const [client, otherClient] = await Promise.all([
    prisma.client.create({
      data: {
        clientKey: clientKeyValue,
        name: "SIMAE 25 Users Acceptance",
        profile: "government",
        features: {},
      },
      select: { id: true, clientKey: true },
    }),
    prisma.client.create({
      data: {
        clientKey: otherClientKey,
        name: "SIMAE Other Tenant",
        profile: "government",
        features: {},
      },
      select: { id: true, clientKey: true },
    }),
  ]);

  clientId = client.id;
  otherClientId = otherClient.id;
  clientKey = client.clientKey;
  await writeTenants([client.clientKey, otherClient.clientKey]);

  const departmentOne = await createDepartmentWithQueue("Agua e Esgoto");
  const departmentTwo = await createDepartmentWithQueue("Administrativo");
  departmentOneId = departmentOne.departmentId;
  departmentTwoId = departmentTwo.departmentId;

  const otherDepartment = await prisma.department.create({
    data: {
      clientId: otherClientId,
      name: "Outro tenant",
      slug: "outro-tenant",
    },
    select: { id: true },
  });

  adminUser = await createSessionUser({
    clientId,
    role: "ADMIN",
    suffix: "admin",
  });
  otherTenantAdmin = await createSessionUser({
    clientId: otherClientId,
    role: "ADMIN",
    suffix: "other-admin",
    departmentId: otherDepartment.id,
  });

  runtimeStorage = (await import("../storage/runtimeStorage.js")).runtimeStorage;
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

test("tenant configured with maxActiveAppUsers 25 accepts exactly 25 active app users and blocks the next one", async () => {
  const createdUsers: TestUser[] = [];
  const roleForIndex = (index: number) => (index % 5 === 0 ? "SUPERVISOR" : "AGENT");
  for (let index = 1; index <= 24; index += 1) {
    const departmentId = index % 2 === 0 ? departmentTwoId : departmentOneId;
    const response = await request<{ ok: boolean; user: TestUser }>("POST", "/app/users", adminUser, {
      name: `Atendente SIMAE ${index}`,
      email: `${prefix}-agent-${index}@example.test`,
      role: roleForIndex(index),
      departmentId,
      isActive: true,
      password: "senha123",
    });
    assert.equal(response.status, 200, `user ${index}`);
    assert.equal(response.body.ok, true);
    createdUsers.push({ ...response.body.user, clientId });
  }

  const activeCount = await prisma.user.count({ where: { clientId, isActive: true } });
  assert.equal(activeCount, 25);

  agentOne = createdUsers.find((user) => user.role === "AGENT" && user.departmentId === departmentOneId) ?? createdUsers[0];
  agentTwo = createdUsers.find((user) => user.role === "AGENT" && user.departmentId === departmentTwoId) ?? createdUsers[1];
  supervisorTwo =
    createdUsers.find((user) => user.role === "SUPERVISOR" && user.departmentId === departmentTwoId) ??
    createdUsers.find((user) => user.role === "SUPERVISOR") ??
    createdUsers[2];
  await Promise.all([agentOne, agentTwo, supervisorTwo].map((user) => ensureAppSession(user)));

  const blocked = await request<ErrorPayload>("POST", "/app/users", adminUser, {
    name: "Atendente SIMAE 26",
    email: `${prefix}-agent-26@example.test`,
    role: "AGENT",
    departmentId: departmentOneId,
    isActive: true,
    password: "senha123",
  });
  assert.equal(blocked.status, 409);
  assert.equal(getErrorCode(blocked.body), "user_limit_exceeded");
});

test("SIMAE acceptance conversation flow preserves RBAC, departments, queues and tenant isolation", async () => {
  conversationWaId = `${prefix}-waid`;
  const departmentOneQueue = await prisma.queue.findFirstOrThrow({
    where: { clientId, departmentId: departmentOneId },
    select: { id: true },
  });
  await createConversationFixture({
    waId: conversationWaId,
    departmentId: departmentOneId,
    queueId: departmentOneQueue.id,
  });

  const otherTenantClaim = await request<ErrorPayload>(
    "POST",
    `/app/conversation/${encodeURIComponent(conversationWaId)}/claim`,
    otherTenantAdmin,
    {}
  );
  assert.equal(otherTenantClaim.status, 404);
  assert.equal(getErrorCode(otherTenantClaim.body), "conversation_not_found");

  const crossDepartmentClaim = await request<ErrorPayload>(
    "POST",
    `/app/conversation/${encodeURIComponent(conversationWaId)}/claim`,
    agentTwo,
    {}
  );
  assert.equal(crossDepartmentClaim.status, 403);
  assert.equal(getErrorCode(crossDepartmentClaim.body), "forbidden");

  const claim = await request<{ ok: boolean; assignedUserId: string; departmentId: string; queueId: string }>(
    "POST",
    `/app/conversation/${encodeURIComponent(conversationWaId)}/claim`,
    agentOne,
    {}
  );
  assert.equal(claim.status, 200);
  assert.equal(claim.body.ok, true);
  assert.equal(claim.body.assignedUserId, agentOne.id);
  assert.equal(claim.body.departmentId, departmentOneId);
  assert.ok(claim.body.queueId);

  const transfer = await request<{ ok: boolean; assignedUserId: string; departmentId: string; queueId: string }>(
    "POST",
    `/app/conversation/${encodeURIComponent(conversationWaId)}/transfer`,
    agentOne,
    { userId: agentTwo.id }
  );
  assert.equal(transfer.status, 200);
  assert.equal(transfer.body.ok, true);
  assert.equal(transfer.body.assignedUserId, agentTwo.id);
  assert.equal(transfer.body.departmentId, departmentTwoId);
  assert.ok(transfer.body.queueId);

  const transferDepartment = await request<{ ok: boolean; assignedUserId: null; departmentId: string; queueId: string }>(
    "POST",
    `/app/conversation/${encodeURIComponent(conversationWaId)}/transfer-department`,
    supervisorTwo,
    { departmentId: departmentOneId }
  );
  assert.equal(transferDepartment.status, 200);
  assert.equal(transferDepartment.body.ok, true);
  assert.equal(transferDepartment.body.assignedUserId, null);
  assert.equal(transferDepartment.body.departmentId, departmentOneId);
  assert.ok(transferDepartment.body.queueId);

  const assignments = await prisma.conversationAssignment.findMany({
    where: { conversation: { clientId, waId: conversationWaId } },
    orderBy: { assignedAt: "asc" },
    select: { toUserId: true },
  });
  assert.deepEqual(assignments.map((item) => item.toUserId), [agentOne.id, agentTwo.id]);
});
