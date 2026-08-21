import assert from "node:assert/strict";
import test from "node:test";
import { ConversationOperationalStatus, Prisma } from "@prisma/client";
import { getPrisma } from "../db.js";
import { syncUserDepartmentMemberships } from "../users/departmentMemberships.js";
import { AGENT_ONLINE_TTL_MS } from "./agentAvailability.js";
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
  await prisma.agentAvailability.deleteMany({ where: { clientId: { in: clientIds } } });
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

async function setAvailability(params: {
  clientId: string;
  userId: string;
  available: boolean;
  lastHeartbeatAt?: Date | null;
}) {
  return prisma.agentAvailability.upsert({
    where: { clientId_userId: { clientId: params.clientId, userId: params.userId } },
    create: {
      clientId: params.clientId,
      userId: params.userId,
      available: params.available,
      lastHeartbeatAt: params.lastHeartbeatAt ?? null,
    },
    update: {
      available: params.available,
      lastHeartbeatAt: params.lastHeartbeatAt ?? null,
    },
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
  assert.equal(reloaded?.status, ConversationOperationalStatus.IN_PROGRESS);
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
  const reloaded = await prisma.conversationRuntimeState.findUnique({ where: { id: runtime.id } });
  assert.equal(reloaded?.status, ConversationOperationalStatus.IN_PROGRESS);
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
  await prisma.conversationRuntimeState.update({
    where: { id: missingDepartmentRuntime.runtime.id },
    data: { departmentId: null, queueId: null },
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

test("requireOnline false preserves legacy assignment without availability rows", async () => {
  const client = await createClient("online-disabled");
  const first = await createUser({ clientId: client.id, departmentId: client.departmentId, suffix: "online-disabled-a" });
  const second = await createUser({ clientId: client.id, departmentId: client.departmentId, suffix: "online-disabled-b" });
  await setAvailability({
    clientId: client.id,
    userId: first.id,
    available: false,
    lastHeartbeatAt: null,
  });
  await setPolicy(client.id, {
    enabled: true,
    mode: "round_robin",
    scope: "department",
    includeSupervisors: false,
    requireOnline: false,
    lastAssignedUserIdByScope: { [`department:${client.departmentId}`]: first.id },
  });
  const { conversation, runtime } = await createRuntime({
    clientId: client.id,
    departmentId: client.departmentId,
    queueId: client.queueId,
    suffix: "online-disabled-target",
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
    assignedUserId: null,
    requestId: "online-disabled",
    source: "test",
  });

  assert.equal(result.applied, true);
  assert.equal(result.selectedUserId, second.id);
});

test("requireOnline true filters round robin to available users with recent heartbeat", async () => {
  const client = await createClient("online-rr");
  const now = new Date();
  const first = await createUser({ clientId: client.id, departmentId: client.departmentId, suffix: "online-rr-a" });
  const second = await createUser({ clientId: client.id, departmentId: client.departmentId, suffix: "online-rr-b" });
  const third = await createUser({ clientId: client.id, departmentId: client.departmentId, suffix: "online-rr-c" });
  await setAvailability({ clientId: client.id, userId: first.id, available: true, lastHeartbeatAt: now });
  await setAvailability({ clientId: client.id, userId: second.id, available: false, lastHeartbeatAt: now });
  await setAvailability({ clientId: client.id, userId: third.id, available: true, lastHeartbeatAt: now });
  await setPolicy(client.id, {
    enabled: true,
    mode: "round_robin",
    scope: "department",
    includeSupervisors: false,
    requireOnline: true,
    lastAssignedUserIdByScope: { [`department:${client.departmentId}`]: first.id },
  });
  const firstTarget = await createRuntime({
    clientId: client.id,
    departmentId: client.departmentId,
    queueId: client.queueId,
    suffix: "online-rr-target-1",
  });
  const firstResult = await applyBalancedQueueAssignment({
    prisma,
    clientId: client.id,
    conversationId: firstTarget.conversation.id,
    runtimeStateId: firstTarget.runtime.id,
    waId: firstTarget.runtime.waId,
    waIdCanonical: firstTarget.runtime.waIdCanonical,
    departmentId: firstTarget.runtime.departmentId,
    queueId: firstTarget.runtime.queueId,
    status: firstTarget.runtime.status,
    assignedUserId: null,
    requestId: "online-rr-1",
    source: "test",
  });
  assert.equal(firstResult.applied, true);
  assert.equal(firstResult.selectedUserId, third.id);
  assert.equal(firstResult.eligibleCount, 2);

  const secondTarget = await createRuntime({
    clientId: client.id,
    departmentId: client.departmentId,
    queueId: client.queueId,
    suffix: "online-rr-target-2",
  });
  const secondResult = await applyBalancedQueueAssignment({
    prisma,
    clientId: client.id,
    conversationId: secondTarget.conversation.id,
    runtimeStateId: secondTarget.runtime.id,
    waId: secondTarget.runtime.waId,
    waIdCanonical: secondTarget.runtime.waIdCanonical,
    departmentId: secondTarget.runtime.departmentId,
    queueId: secondTarget.runtime.queueId,
    status: secondTarget.runtime.status,
    assignedUserId: null,
    requestId: "online-rr-2",
    source: "test",
  });
  assert.equal(secondResult.applied, true);
  assert.equal(secondResult.selectedUserId, first.id);

  await setAvailability({ clientId: client.id, userId: second.id, available: true, lastHeartbeatAt: now });
  const thirdTarget = await createRuntime({
    clientId: client.id,
    departmentId: client.departmentId,
    queueId: client.queueId,
    suffix: "online-rr-target-3",
  });
  const thirdResult = await applyBalancedQueueAssignment({
    prisma,
    clientId: client.id,
    conversationId: thirdTarget.conversation.id,
    runtimeStateId: thirdTarget.runtime.id,
    waId: thirdTarget.runtime.waId,
    waIdCanonical: thirdTarget.runtime.waIdCanonical,
    departmentId: thirdTarget.runtime.departmentId,
    queueId: thirdTarget.runtime.queueId,
    status: thirdTarget.runtime.status,
    assignedUserId: null,
    requestId: "online-rr-3",
    source: "test",
  });
  assert.equal(thirdResult.applied, true);
  assert.equal(thirdResult.selectedUserId, second.id);
});

test("requireOnline true excludes stale heartbeat from least active and leaves shared waiting when none online", async () => {
  const client = await createClient("online-least");
  const now = new Date();
  const stale = new Date(now.getTime() - AGENT_ONLINE_TTL_MS - 15_000);
  const highLoad = await createUser({ clientId: client.id, departmentId: client.departmentId, suffix: "online-least-a" });
  const staleLowLoad = await createUser({ clientId: client.id, departmentId: client.departmentId, suffix: "online-least-b" });
  const lowLoad = await createUser({ clientId: client.id, departmentId: client.departmentId, suffix: "online-least-c" });
  await setAvailability({ clientId: client.id, userId: highLoad.id, available: true, lastHeartbeatAt: now });
  await setAvailability({ clientId: client.id, userId: staleLowLoad.id, available: true, lastHeartbeatAt: stale });
  await setAvailability({ clientId: client.id, userId: lowLoad.id, available: true, lastHeartbeatAt: now });
  await Promise.all(
    [1, 2, 3].map((index) =>
      createRuntime({
        clientId: client.id,
        departmentId: client.departmentId,
        queueId: client.queueId,
        suffix: `online-least-load-a-${index}`,
        assignedUserId: highLoad.id,
        status: ConversationOperationalStatus.IN_PROGRESS,
      })
    )
  );
  await createRuntime({
    clientId: client.id,
    departmentId: client.departmentId,
    queueId: client.queueId,
    suffix: "online-least-load-c",
    assignedUserId: lowLoad.id,
    status: ConversationOperationalStatus.IN_PROGRESS,
  });
  await setPolicy(client.id, {
    enabled: true,
    mode: "least_active",
    scope: "department",
    includeSupervisors: false,
    requireOnline: true,
  });
  const target = await createRuntime({
    clientId: client.id,
    departmentId: client.departmentId,
    queueId: client.queueId,
    suffix: "online-least-target",
  });
  const result = await applyBalancedQueueAssignment({
    prisma,
    clientId: client.id,
    conversationId: target.conversation.id,
    runtimeStateId: target.runtime.id,
    waId: target.runtime.waId,
    waIdCanonical: target.runtime.waIdCanonical,
    departmentId: target.runtime.departmentId,
    queueId: target.runtime.queueId,
    status: target.runtime.status,
    assignedUserId: null,
    requestId: "online-least",
    source: "test",
  });
  assert.equal(result.applied, true);
  assert.equal(result.selectedUserId, lowLoad.id);

  await Promise.all(
    [highLoad.id, staleLowLoad.id, lowLoad.id].map((userId) =>
      setAvailability({ clientId: client.id, userId, available: false, lastHeartbeatAt: now })
    )
  );
  const waitingTarget = await createRuntime({
    clientId: client.id,
    departmentId: client.departmentId,
    queueId: client.queueId,
    suffix: "online-least-waiting",
  });
  const missing = await applyBalancedQueueAssignment({
    prisma,
    clientId: client.id,
    conversationId: waitingTarget.conversation.id,
    runtimeStateId: waitingTarget.runtime.id,
    waId: waitingTarget.runtime.waId,
    waIdCanonical: waitingTarget.runtime.waIdCanonical,
    departmentId: waitingTarget.runtime.departmentId,
    queueId: waitingTarget.runtime.queueId,
    status: waitingTarget.runtime.status,
    assignedUserId: null,
    requestId: "online-least-missing",
    source: "test",
  });
  assert.equal(missing.applied, false);
  assert.equal(missing.reason, "no_eligible_agent");
  const reloaded = await prisma.conversationRuntimeState.findUnique({ where: { id: waitingTarget.runtime.id } });
  assert.equal(reloaded?.assignedUserId, null);
  assert.equal(reloaded?.status, ConversationOperationalStatus.WAITING);
  const event = await prisma.event.findFirst({
    where: { clientId: client.id, eventName: "queue.assignment.no_eligible_agent" },
    orderBy: { createdAt: "desc" },
  });
  assert.equal((event?.payloadJson as Record<string, unknown> | undefined)?.reason, "online_presence_unavailable");
});

test("tenant scoped policy still respects department membership eligibility", async () => {
  const client = await createClient("tenant-scope-membership");
  const secondDepartment = await prisma.department.create({
    data: {
      clientId: client.id,
      name: "Tenant scope second",
      slug: "tenant-scope-second",
      isActive: true,
    },
    select: { id: true },
  });
  const first = await createUser({ clientId: client.id, departmentId: null, suffix: "tenant-scope-a" });
  const otherDepartmentOnly = await createUser({ clientId: client.id, departmentId: null, suffix: "tenant-scope-b" });
  await syncUserDepartmentMemberships(prisma, {
    clientId: client.id,
    userId: first.id,
    departmentIds: [client.departmentId],
    primaryDepartmentId: client.departmentId,
  });
  await syncUserDepartmentMemberships(prisma, {
    clientId: client.id,
    userId: otherDepartmentOnly.id,
    departmentIds: [secondDepartment.id],
    primaryDepartmentId: secondDepartment.id,
  });
  await setPolicy(client.id, {
    enabled: true,
    mode: "round_robin",
    scope: "tenant",
    includeSupervisors: false,
    requireOnline: false,
  });
  const target = await createRuntime({
    clientId: client.id,
    departmentId: client.departmentId,
    queueId: client.queueId,
    suffix: "tenant-scope-target",
  });

  const result = await applyBalancedQueueAssignment({
    prisma,
    clientId: client.id,
    conversationId: target.conversation.id,
    runtimeStateId: target.runtime.id,
    waId: target.runtime.waId,
    waIdCanonical: target.runtime.waIdCanonical,
    departmentId: target.runtime.departmentId,
    queueId: target.runtime.queueId,
    status: target.runtime.status,
    assignedUserId: null,
    requestId: "tenant-scope-membership",
    source: "test",
  });

  assert.equal(result.applied, true);
  assert.equal(result.selectedUserId, first.id);
  assert.equal(result.eligibleCount, 1);
});

test("concurrent round robin assignments are serialized per department scope", async () => {
  const client = await createClient("rr-concurrent");
  const first = await createUser({ clientId: client.id, departmentId: client.departmentId, suffix: "rr-concurrent-a" });
  const second = await createUser({ clientId: client.id, departmentId: client.departmentId, suffix: "rr-concurrent-b" });
  await setPolicy(client.id, {
    enabled: true,
    mode: "round_robin",
    scope: "department",
    includeSupervisors: false,
  });
  const targets = await Promise.all(
    [1, 2, 3, 4].map((index) =>
      createRuntime({
        clientId: client.id,
        departmentId: client.departmentId,
        queueId: client.queueId,
        suffix: `rr-concurrent-${index}`,
      })
    )
  );

  const results = await Promise.all(
    targets.map(({ conversation, runtime }, index) =>
      applyBalancedQueueAssignment({
        prisma,
        clientId: client.id,
        conversationId: conversation.id,
        runtimeStateId: runtime.id,
        waId: runtime.waId,
        waIdCanonical: runtime.waIdCanonical,
        departmentId: runtime.departmentId,
        queueId: runtime.queueId,
        status: runtime.status,
        assignedUserId: null,
        requestId: `rr-concurrent-${index}`,
        source: "test",
      })
    )
  );

  assert.equal(results.every((result) => result.applied), true);
  const assignedCounts = await prisma.conversationRuntimeState.groupBy({
    by: ["assignedUserId"],
    where: { id: { in: targets.map((target) => target.runtime.id) } },
    _count: { _all: true },
  });
  const countByUser = new Map(assignedCounts.map((row) => [row.assignedUserId, row._count._all]));
  assert.equal(countByUser.get(first.id), 2);
  assert.equal(countByUser.get(second.id), 2);
  const updatedPolicy = await prisma.tenantOperationalConfig.findUnique({
    where: { clientId: client.id },
    select: { config: true },
  });
  const lastAssigned = (updatedPolicy?.config as Record<string, unknown> | null)?.queueAssignmentPolicy as
    | Record<string, unknown>
    | undefined;
  assert.ok(lastAssigned);
  assert.equal(
    ((lastAssigned.lastAssignedUserIdByScope as Record<string, string> | undefined) ?? {})[
      `department:${client.departmentId}`
    ],
    second.id
  );
});

test("concurrent least-active assignments observe committed load", async () => {
  const client = await createClient("least-concurrent");
  const first = await createUser({ clientId: client.id, departmentId: client.departmentId, suffix: "least-concurrent-a" });
  const second = await createUser({ clientId: client.id, departmentId: client.departmentId, suffix: "least-concurrent-b" });
  await setPolicy(client.id, {
    enabled: true,
    mode: "least_active",
    scope: "department",
    includeSupervisors: false,
  });
  const targets = await Promise.all(
    [1, 2, 3, 4].map((index) =>
      createRuntime({
        clientId: client.id,
        departmentId: client.departmentId,
        queueId: client.queueId,
        suffix: `least-concurrent-${index}`,
      })
    )
  );

  const results = await Promise.all(
    targets.map(({ conversation, runtime }, index) =>
      applyBalancedQueueAssignment({
        prisma,
        clientId: client.id,
        conversationId: conversation.id,
        runtimeStateId: runtime.id,
        waId: runtime.waId,
        waIdCanonical: runtime.waIdCanonical,
        departmentId: runtime.departmentId,
        queueId: runtime.queueId,
        status: runtime.status,
        assignedUserId: null,
        requestId: `least-concurrent-${index}`,
        source: "test",
      })
    )
  );

  assert.equal(results.every((result) => result.applied), true);
  const assignedCounts = await prisma.conversationRuntimeState.groupBy({
    by: ["assignedUserId"],
    where: { id: { in: targets.map((target) => target.runtime.id) } },
    _count: { _all: true },
  });
  const countByUser = new Map(assignedCounts.map((row) => [row.assignedUserId, row._count._all]));
  assert.equal(countByUser.get(first.id), 2);
  assert.equal(countByUser.get(second.id), 2);
});
