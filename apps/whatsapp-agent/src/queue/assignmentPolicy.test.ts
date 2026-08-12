import assert from "node:assert/strict";
import test from "node:test";
import { ConversationOperationalStatus, Prisma } from "@prisma/client";
import { getPrisma } from "../db.js";
import { syncUserDepartmentMemberships } from "../users/departmentMemberships.js";
import { applyBalancedQueueAssignment } from "./assignmentPolicy.js";

const prisma = getPrisma();
const prefix = `queue-assignment-${process.pid}-${Date.now()}`;

type ClientFixture = {
  id: string;
  clientKey: string;
  departmentId: string;
  queueId: string;
};

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
  await prisma.event.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.tenantOperationalConfig.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.userDepartmentMembership.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.user.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.queue.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.department.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.conversation.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
}

async function createClient(suffix: string): Promise<ClientFixture> {
  const client = await prisma.client.create({
    data: {
      clientKey: `${prefix}-${suffix}`,
      name: `Queue Assignment ${suffix}`,
      profile: "business",
      features: {},
    },
    select: { id: true, clientKey: true },
  });
  const department = await prisma.department.create({
    data: {
      clientId: client.id,
      name: `Atendimento ${suffix}`,
      slug: `atendimento-${suffix}`,
      isActive: true,
    },
    select: { id: true },
  });
  const queue = await prisma.queue.create({
    data: {
      clientId: client.id,
      departmentId: department.id,
      name: `Fila ${suffix}`,
    },
    select: { id: true },
  });
  return { id: client.id, clientKey: client.clientKey, departmentId: department.id, queueId: queue.id };
}

async function createUser(params: {
  clientId: string;
  departmentId?: string | null;
  suffix: string;
  role?: string;
  isActive?: boolean;
}) {
  return prisma.user.create({
    data: {
      clientId: params.clientId,
      departmentId: params.departmentId ?? null,
      name: `Queue User ${params.suffix}`,
      email: `${prefix}-${params.suffix}@example.test`,
      role: params.role ?? "AGENT",
      isActive: params.isActive ?? true,
    },
    select: { id: true },
  });
}

async function createRuntime(params: {
  clientId: string;
  departmentId: string;
  queueId: string;
  suffix: string;
  assignedUserId?: string | null;
  status?: ConversationOperationalStatus;
}) {
  const waId = `queue:${params.suffix}`;
  const conversation = await prisma.conversation.create({
    data: {
      clientId: params.clientId,
      waId,
      waIdCanonical: waId,
      channel: "webchat",
      provider: "converta",
      departmentId: params.departmentId,
      windowIsOpen: true,
      lastInboundAt: new Date(),
    },
    select: { id: true },
  });
  const runtime = await prisma.conversationRuntimeState.create({
    data: {
      clientId: params.clientId,
      waId,
      waIdCanonical: waId,
      conversationKey: `queue:${params.suffix}`,
      channel: "webchat",
      provider: "converta",
      firstSeenAt: new Date(),
      windowIsOpen: true,
      lastInboundAt: new Date(),
      mode: "HUMAN",
      departmentId: params.departmentId,
      queueId: params.queueId,
      status: params.status ?? ConversationOperationalStatus.WAITING,
      assignedUserId: params.assignedUserId ?? null,
      assignedTo: params.assignedUserId ? `user:${params.assignedUserId}` : null,
      assignedAt: params.assignedUserId ? new Date() : null,
    },
    select: {
      id: true,
      waId: true,
      waIdCanonical: true,
      assignedUserId: true,
      departmentId: true,
      queueId: true,
      status: true,
    },
  });
  return { conversation, runtime };
}

async function setPolicy(clientId: string, policy: Record<string, unknown>) {
  const config = { queueAssignmentPolicy: policy } as Prisma.InputJsonObject;
  await prisma.tenantOperationalConfig.upsert({
    where: { clientId },
    create: { clientId, config },
    update: { config },
  });
}

test.before(async () => {
  await cleanup();
});

test.after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("missing or disabled policy keeps manual assignment behavior", async () => {
  const client = await createClient("manual");
  await createUser({ clientId: client.id, departmentId: client.departmentId, suffix: "manual-agent" });
  const { conversation, runtime } = await createRuntime({
    clientId: client.id,
    departmentId: client.departmentId,
    queueId: client.queueId,
    suffix: "manual",
  });

  const missing = await applyBalancedQueueAssignment({
    prisma,
    clientId: client.id,
    conversationId: conversation.id,
    runtimeStateId: runtime.id,
    waId: runtime.waId,
    waIdCanonical: runtime.waIdCanonical,
    departmentId: runtime.departmentId,
    queueId: runtime.queueId,
    status: runtime.status,
    assignedUserId: runtime.assignedUserId,
    requestId: "manual-missing",
    source: "test",
  });
  assert.equal(missing.applied, false);
  assert.equal(missing.reason, "no_policy");

  await setPolicy(client.id, { enabled: false, mode: "round_robin", scope: "department" });
  const disabled = await applyBalancedQueueAssignment({
    prisma,
    clientId: client.id,
    conversationId: conversation.id,
    runtimeStateId: runtime.id,
    waId: runtime.waId,
    waIdCanonical: runtime.waIdCanonical,
    departmentId: runtime.departmentId,
    queueId: runtime.queueId,
    status: runtime.status,
    assignedUserId: runtime.assignedUserId,
    requestId: "manual-disabled",
    source: "test",
  });
  assert.equal(disabled.applied, false);
  assert.equal(disabled.reason, "manual");
  const reloaded = await prisma.conversationRuntimeState.findUnique({ where: { id: runtime.id } });
  assert.equal(reloaded?.assignedUserId, null);
});

test("round robin assigns next active agent inside department and tenant", async () => {
  const client = await createClient("round-robin");
  const otherClient = await createClient("round-robin-other");
  const first = await createUser({ clientId: client.id, departmentId: client.departmentId, suffix: "rr-a" });
  const second = await createUser({ clientId: client.id, departmentId: client.departmentId, suffix: "rr-b" });
  await createUser({ clientId: client.id, departmentId: client.departmentId, suffix: "rr-inactive", isActive: false });
  await createUser({ clientId: otherClient.id, departmentId: otherClient.departmentId, suffix: "rr-other-tenant" });
  await setPolicy(client.id, {
    enabled: true,
    mode: "round_robin",
    scope: "department",
    includeSupervisors: true,
    lastAssignedUserIdByScope: { [`department:${client.departmentId}`]: first.id },
  });
  const { conversation, runtime } = await createRuntime({
    clientId: client.id,
    departmentId: client.departmentId,
    queueId: client.queueId,
    suffix: "rr-target",
  });

  const result = await applyBalancedQueueAssignment({
    prisma,
    clientId: client.id,
    conversationId: conversation.id,
    runtimeStateId: runtime.id,
    waId: runtime.waId,
    waIdCanonical: runtime.waIdCanonical,
    departmentId: runtime.departmentId,
    queueId: runtime.queueId,
    status: runtime.status,
    assignedUserId: runtime.assignedUserId,
    requestId: "round-robin",
    source: "test",
  });
  assert.equal(result.applied, true);
  assert.equal(result.selectedUserId, second.id);
  assert.equal(result.eligibleCount, 2);
  const reloaded = await prisma.conversationRuntimeState.findUnique({ where: { id: runtime.id } });
  assert.equal(reloaded?.assignedUserId, second.id);
  const event = await prisma.event.findFirst({
    where: { clientId: client.id, eventName: "queue.assignment.round_robin_applied" },
  });
  assert.ok(event);
  assert.deepEqual(Object.keys(event.payloadJson as Record<string, unknown>).sort(), [
    "action",
    "activeCount",
    "departmentId",
    "eligibleCount",
    "mode",
    "scope",
    "selectedUserId",
    "source",
  ]);
});

test("least active respects maxActivePerAgent and chooses smaller active load", async () => {
  const client = await createClient("least-active");
  const busy = await createUser({ clientId: client.id, departmentId: client.departmentId, suffix: "least-busy" });
  const available = await createUser({ clientId: client.id, departmentId: client.departmentId, suffix: "least-free" });
  await createRuntime({
    clientId: client.id,
    departmentId: client.departmentId,
    queueId: client.queueId,
    suffix: "least-load",
    assignedUserId: busy.id,
    status: ConversationOperationalStatus.IN_PROGRESS,
  });
  await setPolicy(client.id, {
    enabled: true,
    mode: "least_active",
    scope: "department",
    maxActivePerAgent: 2,
  });
  const { conversation, runtime } = await createRuntime({
    clientId: client.id,
    departmentId: client.departmentId,
    queueId: client.queueId,
    suffix: "least-target",
  });

  const result = await applyBalancedQueueAssignment({
    prisma,
    clientId: client.id,
    conversationId: conversation.id,
    runtimeStateId: runtime.id,
    waId: runtime.waId,
    waIdCanonical: runtime.waIdCanonical,
    departmentId: runtime.departmentId,
    queueId: runtime.queueId,
    status: runtime.status,
    assignedUserId: runtime.assignedUserId,
    requestId: "least-active",
    source: "test",
  });
  assert.equal(result.applied, true);
  assert.equal(result.selectedUserId, available.id);
});

test("no eligible agent leaves conversation unassigned and records sanitized event", async () => {
  const client = await createClient("no-eligible");
  const agent = await createUser({ clientId: client.id, departmentId: client.departmentId, suffix: "no-eligible-agent" });
  await createRuntime({
    clientId: client.id,
    departmentId: client.departmentId,
    queueId: client.queueId,
    suffix: "no-eligible-load",
    assignedUserId: agent.id,
    status: ConversationOperationalStatus.IN_PROGRESS,
  });
  await setPolicy(client.id, {
    enabled: true,
    mode: "least_active",
    scope: "department",
    maxActivePerAgent: 1,
  });
  const { conversation, runtime } = await createRuntime({
    clientId: client.id,
    departmentId: client.departmentId,
    queueId: client.queueId,
    suffix: "no-eligible-target",
  });

  const result = await applyBalancedQueueAssignment({
    prisma,
    clientId: client.id,
    conversationId: conversation.id,
    runtimeStateId: runtime.id,
    waId: runtime.waId,
    waIdCanonical: runtime.waIdCanonical,
    departmentId: runtime.departmentId,
    queueId: runtime.queueId,
    status: runtime.status,
    assignedUserId: runtime.assignedUserId,
    requestId: "no-eligible",
    source: "test",
  });
  assert.equal(result.applied, false);
  assert.equal(result.reason, "no_eligible_agent");
  const reloaded = await prisma.conversationRuntimeState.findUnique({ where: { id: runtime.id } });
  assert.equal(reloaded?.assignedUserId, null);
  const event = await prisma.event.findFirst({
    where: { clientId: client.id, eventName: "queue.assignment.no_eligible_agent" },
  });
  assert.ok(event);
  const payload = event.payloadJson as Record<string, unknown>;
  assert.equal(payload.reason, "max_active_reached");
  assert.equal(JSON.stringify(payload).includes(runtime.waId), false);
});

test("department scoped round robin uses active memberships and never falls back globally without department", async () => {
  const client = await createClient("membership-rr");
  const secondDepartment = await prisma.department.create({
    data: {
      clientId: client.id,
      name: "Membership second",
      slug: "membership-second",
      isActive: true,
    },
    select: { id: true },
  });
  const secondQueue = await prisma.queue.create({
    data: { clientId: client.id, departmentId: secondDepartment.id, name: "Second queue" },
    select: { id: true },
  });
  const agentA = await createUser({ clientId: client.id, departmentId: null, suffix: "member-a" });
  const agentB = await createUser({ clientId: client.id, departmentId: null, suffix: "member-b" });
  const agentC = await createUser({ clientId: client.id, departmentId: null, suffix: "member-c" });
  await syncUserDepartmentMemberships(prisma, {
    clientId: client.id,
    userId: agentA.id,
    departmentIds: [client.departmentId, secondDepartment.id],
    primaryDepartmentId: client.departmentId,
  });
  await syncUserDepartmentMemberships(prisma, {
    clientId: client.id,
    userId: agentB.id,
    departmentIds: [client.departmentId],
    primaryDepartmentId: client.departmentId,
  });
  await syncUserDepartmentMemberships(prisma, {
    clientId: client.id,
    userId: agentC.id,
    departmentIds: [secondDepartment.id],
    primaryDepartmentId: secondDepartment.id,
  });
  await setPolicy(client.id, { enabled: true, mode: "round_robin", scope: "department", includeSupervisors: false });

  const firstRuntime = await createRuntime({
    clientId: client.id,
    departmentId: client.departmentId,
    queueId: client.queueId,
    suffix: "member-first",
  });
  const first = await applyBalancedQueueAssignment({
    prisma,
    clientId: client.id,
    conversationId: firstRuntime.conversation.id,
    runtimeStateId: firstRuntime.runtime.id,
    waId: firstRuntime.runtime.waId,
    waIdCanonical: firstRuntime.runtime.waIdCanonical,
    departmentId: client.departmentId,
    queueId: client.queueId,
    status: firstRuntime.runtime.status,
    assignedUserId: null,
    requestId: "member-first",
    source: "test",
  });
  assert.equal(first.applied, true);
  assert.equal(first.eligibleCount, 2);
  assert.ok([agentA.id, agentB.id].includes(first.selectedUserId));

  const secondRuntime = await createRuntime({
    clientId: client.id,
    departmentId: secondDepartment.id,
    queueId: secondQueue.id,
    suffix: "member-second",
  });
  const second = await applyBalancedQueueAssignment({
    prisma,
    clientId: client.id,
    conversationId: secondRuntime.conversation.id,
    runtimeStateId: secondRuntime.runtime.id,
    waId: secondRuntime.runtime.waId,
    waIdCanonical: secondRuntime.runtime.waIdCanonical,
    departmentId: secondDepartment.id,
    queueId: secondQueue.id,
    status: secondRuntime.runtime.status,
    assignedUserId: null,
    requestId: "member-second",
    source: "test",
  });
  assert.equal(second.applied, true);
  assert.equal(second.eligibleCount, 2);
  assert.ok([agentA.id, agentC.id].includes(second.selectedUserId));

  const missingDepartmentRuntime = await createRuntime({
    clientId: client.id,
    departmentId: client.departmentId,
    queueId: client.queueId,
    suffix: "member-missing-department",
  });
  const missing = await applyBalancedQueueAssignment({
    prisma,
    clientId: client.id,
    conversationId: missingDepartmentRuntime.conversation.id,
    runtimeStateId: missingDepartmentRuntime.runtime.id,
    waId: missingDepartmentRuntime.runtime.waId,
    waIdCanonical: missingDepartmentRuntime.runtime.waIdCanonical,
    departmentId: null,
    queueId: null,
    status: missingDepartmentRuntime.runtime.status,
    assignedUserId: null,
    requestId: "member-missing",
    source: "test",
  });
  assert.equal(missing.applied, false);
  assert.equal(missing.reason, "no_eligible_agent");
  const event = await prisma.event.findFirst({
    where: { clientId: client.id, eventName: "queue.assignment.no_eligible_agent" },
    orderBy: { createdAt: "desc" },
  });
  assert.equal((event?.payloadJson as Record<string, unknown> | undefined)?.reason, "department_required");
});
