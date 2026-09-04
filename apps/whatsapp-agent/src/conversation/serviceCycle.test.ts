import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { ConversationState } from "./conversation.types.js";
import {
  buildCompletedServiceSnapshotExpectation,
  buildServiceCycleHistoryMap,
  clearSatisfactionRuntimeForNewServiceCycle,
  closeCurrentServiceCycle,
  ensureActiveServiceCycle,
  getActiveServiceCycle,
  getLastClosedServiceCycle,
  getServiceCycleSnapshot,
  isCompletedServiceSnapshotCompatible,
  recordCompletedServiceSnapshot,
  recordServiceCycleEvent,
  startNewServiceCycle,
  withServiceCycleSnapshot,
} from "./serviceCycle.js";
import { buildConversationProtocol } from "../inbox/conversationProtocol.js";

function state(): ConversationState {
  return {
    waId: "contact",
    firstSeenAt: "2026-08-18T12:00:00.000Z",
    lastInboundAt: "2026-08-18T12:00:00.000Z",
    window: { isOpen: true },
    handoff: { status: "none" },
    answers: {},
  };
}

test("service cycles remain stable while active and change after terminal close", () => {
  const at = new Date("2026-08-18T12:00:00.000Z");
  const cycleA = ensureActiveServiceCycle(state(), at, "meta_cloud");
  const sameA = ensureActiveServiceCycle(cycleA.state, new Date(at.getTime() + 1_000), "meta_cloud");
  assert.equal(sameA.created, false);
  assert.deepEqual(sameA.cycle, cycleA.cycle);

  const closedA = closeCurrentServiceCycle({
    state: sameA.state,
    at: new Date(at.getTime() + 2_000),
    reason: "operator_close",
    source: "inbox",
  });
  assert.equal(getActiveServiceCycle(closedA.state), null);
  assert.equal(getLastClosedServiceCycle(closedA.state)?.protocol, cycleA.cycle.protocol);

  const cycleB = startNewServiceCycle(closedA.state, new Date(at.getTime() + 3_000), "meta_cloud");
  const closedB = closeCurrentServiceCycle({
    state: cycleB.state,
    at: new Date(at.getTime() + 4_000),
    reason: "customer_close",
    source: "whatsapp",
  });
  const cycleC = startNewServiceCycle(closedB.state, new Date(at.getTime() + 5_000), "web_session");

  assert.notEqual(cycleA.cycle.protocol, cycleB.cycle.protocol);
  assert.notEqual(cycleB.cycle.protocol, cycleC.cycle.protocol);
  assert.notEqual(cycleA.cycle.cycleId, cycleC.cycle.cycleId);
});

test("message snapshots preserve the cycle after a later cycle starts", () => {
  const cycleA = startNewServiceCycle(state(), new Date("2026-08-18T12:00:00.000Z"), "web_session");
  const rawA = withServiceCycleSnapshot({ provider: "web_session" }, cycleA.cycle);
  const closedA = closeCurrentServiceCycle({
    state: cycleA.state,
    at: new Date("2026-08-18T12:01:00.000Z"),
    reason: "close_command",
    source: "web_session",
  });
  const cycleB = startNewServiceCycle(closedA.state, new Date("2026-08-18T12:02:00.000Z"), "web_session");

  assert.equal(getServiceCycleSnapshot(rawA)?.protocol, cycleA.cycle.protocol);
  assert.notEqual(getServiceCycleSnapshot(rawA)?.protocol, cycleB.cycle.protocol);
});

test("message snapshots never fall back to the permanent conversation protocol when cycles exist", () => {
  const legacyConversation = {
    id: "be35eda4-62be-4d8a-9f22-000000000000",
    createdAt: "2026-08-18T12:50:14.274Z",
  };
  const legacyFallback = buildConversationProtocol(legacyConversation);
  assert.equal(legacyFallback, "CVT-BE35EDA462BE");

  const messageA = withServiceCycleSnapshot(
    { provider: "web_session" },
    {
      protocol: "CVT-AAAAAAAAAAAA",
      cycleId: "cycle_a",
      issuedAt: "2026-08-18T12:54:56.000Z",
      source: "web_session",
    }
  );
  const messageB = withServiceCycleSnapshot(
    { provider: "web_session" },
    {
      protocol: "CVT-BBBBBBBBBBBB",
      cycleId: "cycle_b",
      issuedAt: "2026-08-18T13:01:09.000Z",
      source: "web_session",
    }
  );
  const activeB = {
    ...state(),
    answers: {
      operationalProtocol: {
        protocol: "CVT-BBBBBBBBBBBB",
        cycleId: "cycle_b",
        issuedAt: "2026-08-18T13:01:09.000Z",
        source: "web_session",
      },
    },
  };

  assert.equal(getServiceCycleSnapshot(messageA)?.protocol, "CVT-AAAAAAAAAAAA");
  assert.equal(getServiceCycleSnapshot(messageB)?.protocol, "CVT-BBBBBBBBBBBB");
  assert.notEqual(getServiceCycleSnapshot(messageA)?.protocol, legacyFallback);
  assert.notEqual(getServiceCycleSnapshot(messageB)?.protocol, legacyFallback);
  assert.equal(getActiveServiceCycle(activeB)?.protocol, "CVT-BBBBBBBBBBBB");
});

test("a cancelled close does not mutate the active cycle", () => {
  const active = startNewServiceCycle(state(), new Date("2026-08-18T12:00:00.000Z"), "web_session");
  const before = getActiveServiceCycle(active.state);
  const waitingState: ConversationState = { ...active.state, status: "WAITING" };
  const after = getActiveServiceCycle(waitingState);
  assert.deepEqual(after, before);
});

test("new service cycles clear transient satisfaction runtime only", () => {
  const current = {
    ...state(),
    answers: {
      operationalProtocol: {
        protocol: "CVT-ACTIVE12345",
        issuedAt: "2026-08-18T12:00:00.000Z",
        cycleId: "cycle_active",
        source: "web_session",
      },
      lastClosedServiceCycle: {
        protocol: "CVT-CLOSED12345",
        issuedAt: "2026-08-18T11:00:00.000Z",
        cycleId: "cycle_closed",
        source: "web_session",
        closedAt: "2026-08-18T11:30:00.000Z",
        closeReason: "human_close",
        closeSource: "inbox",
      },
      satisfactionRuntime: {
        commentOffer: { awaiting: true, surveyId: "survey_old", responseId: "response_old" },
        commentInput: { awaiting: true, surveyId: "survey_old", responseId: "response_old" },
        completedSurveyDecision: { awaiting: true, prompted: true },
        awaitingExpiredSurveyDecision: true,
        expiredSurveyId: "survey_expired",
      },
      retainedAnswer: "keep",
    },
  };

  const cleared = clearSatisfactionRuntimeForNewServiceCycle(current);
  const answers = cleared.answers as Record<string, unknown>;

  assert.equal(answers.retainedAnswer, "keep");
  assert.equal(Boolean(answers.operationalProtocol), true);
  assert.equal(Boolean(answers.lastClosedServiceCycle), true);
  assert.equal("satisfactionRuntime" in answers, false);
});

test("protocol lifecycle events keep the acting tenant and cycle snapshot", async () => {
  const writes: Array<Record<string, unknown>> = [];
  const active = startNewServiceCycle(state(), new Date("2026-08-18T12:00:00.000Z"), "meta_cloud");
  await recordServiceCycleEvent({
    prisma: {
      event: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          writes.push(data);
          return data;
        },
      },
    } as never,
    clientId: "tenant_a",
    conversationId: "conversation_a",
    requestId: "request_a",
    action: "started",
    cycle: active.cycle,
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.clientId, "tenant_a");
  assert.equal(writes[0]?.conversationId, "conversation_a");
  assert.equal((writes[0]?.payloadJson as Record<string, unknown>).cycleId, active.cycle.cycleId);
  assert.equal((writes[0]?.payloadJson as Record<string, unknown>).source, "meta_cloud");
});

test("closed protocol events create an immutable completed service snapshot without contact pii", async () => {
  const writes: Array<{ model: string; data: Record<string, unknown> }> = [];
  const closed = closeCurrentServiceCycle({
    state: startNewServiceCycle(state(), new Date("2026-08-18T12:00:00.000Z"), "web_session").state,
    at: new Date("2026-08-18T12:20:00.000Z"),
    reason: "operator_close",
    source: "app_inbox",
  });
  assert.ok(closed.cycle);

  await recordServiceCycleEvent({
    prisma: {
      completedServiceSnapshot: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          writes.push({ model: "completedServiceSnapshot", data });
          return data;
        },
      },
      event: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          writes.push({ model: "event", data });
          return data;
        },
      },
    } as never,
    clientId: "tenant_a",
    conversationId: "conversation_a",
    waId: "558499999999",
    waIdCanonical: "558499999999",
    requestId: "request_close",
    action: "closed",
    cycle: closed.cycle,
    completedService: {
      assignedUserId: "agent_b",
      departmentId: "department_ti",
      queueId: "queue_ti",
      closedByUserId: "supervisor_1",
    },
  });

  const snapshot = writes.find((write) => write.model === "completedServiceSnapshot")?.data;
  assert.equal(snapshot?.clientId, "tenant_a");
  assert.equal(snapshot?.conversationId, "conversation_a");
  assert.equal(snapshot?.cycleId, closed.cycle.cycleId);
  assert.equal(snapshot?.protocol, closed.cycle.protocol);
  assert.equal((snapshot?.closedAt as Date).toISOString(), "2026-08-18T12:20:00.000Z");
  assert.equal(snapshot?.assignedUserId, "agent_b");
  assert.equal(snapshot?.departmentId, "department_ti");
  assert.equal(snapshot?.queueId, "queue_ti");
  assert.equal(snapshot?.closedByUserId, "supervisor_1");
  assert.equal(snapshot?.closeReason, "operator_close");
  assert.equal(snapshot?.closeSource, "app_inbox");
  assert.equal("waId" in (snapshot ?? {}), false);
  assert.equal("waIdCanonical" in (snapshot ?? {}), false);
});

test("completed service snapshots allow system closes without an assigned owner", async () => {
  const writes: Array<Record<string, unknown>> = [];
  await recordCompletedServiceSnapshot({
    prisma: {
      completedServiceSnapshot: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          writes.push(data);
          return data;
        },
      },
    } as never,
    clientId: "tenant_a",
    conversationId: "conversation_a",
    cycle: {
      protocol: "CVT-SYSTEMCLOSE",
      cycleId: "cycle_system",
      issuedAt: "2026-08-18T12:00:00.000Z",
      source: "web_session",
      closedAt: "2026-08-18T12:30:00.000Z",
      closeReason: "service_closed",
      closeSource: "web_session",
    },
    attribution: {},
  });

  assert.equal(writes[0]?.assignedUserId, null);
  assert.equal(writes[0]?.departmentId, null);
  assert.equal(writes[0]?.queueId, null);
  assert.equal(writes[0]?.closedByUserId, null);
});

test("completed service snapshots are idempotent for an identical duplicate close", async () => {
  const existing = {
    conversationId: "conversation_a",
    protocol: "CVT-DUPLICATE1",
    closedAt: new Date("2026-08-18T12:30:00.000Z"),
    assignedUserId: "agent_1",
    departmentId: "department_1",
    queueId: "queue_1",
    closedByUserId: "agent_1",
    closeReason: "operator_close",
    closeSource: "app_inbox",
  };
  let createCalls = 0;
  let findUniqueWhere: unknown = null;
  await recordCompletedServiceSnapshot({
    prisma: {
      completedServiceSnapshot: {
        create: async () => {
          createCalls += 1;
          throw new Prisma.PrismaClientKnownRequestError("duplicate", {
            code: "P2002",
            clientVersion: "test",
          });
        },
        findUnique: async ({ where }: { where: unknown }) => {
          findUniqueWhere = where;
          return existing;
        },
      },
    } as never,
    clientId: "tenant_a",
    conversationId: existing.conversationId,
    cycle: {
      protocol: existing.protocol,
      cycleId: "cycle_duplicate",
      issuedAt: "2026-08-18T12:00:00.000Z",
      source: "web_session",
      closedAt: existing.closedAt.toISOString(),
      closeReason: existing.closeReason,
      closeSource: existing.closeSource,
    },
    attribution: {
      assignedUserId: existing.assignedUserId,
      departmentId: existing.departmentId,
      queueId: existing.queueId,
      closedByUserId: existing.closedByUserId,
    },
  });

  assert.equal(createCalls, 1);
  assert.deepEqual(findUniqueWhere, {
    clientId_cycleId: {
      clientId: "tenant_a",
      cycleId: "cycle_duplicate",
    },
  });
});

test("completed service snapshots can be matched as a prior same-cycle close for retry cleanup", () => {
  const existing = {
    conversationId: "conversation_a",
    protocol: "CVT-DUPLICATE1",
    closedAt: new Date("2026-08-18T12:30:00.000Z"),
    assignedUserId: "agent_1",
    departmentId: "department_1",
    queueId: "queue_1",
    closedByUserId: "agent_1",
    closeReason: "operator_close",
    closeSource: "app_inbox",
  };
  const expected = buildCompletedServiceSnapshotExpectation({
    clientId: "tenant_a",
    conversationId: existing.conversationId,
    cycle: {
      protocol: existing.protocol,
      cycleId: "cycle_duplicate",
      issuedAt: "2026-08-18T12:00:00.000Z",
      source: "web_session",
      closedAt: "2026-08-18T12:35:00.000Z",
      closeReason: existing.closeReason,
      closeSource: existing.closeSource,
    },
    attribution: {
      assignedUserId: existing.assignedUserId,
      departmentId: existing.departmentId,
      queueId: existing.queueId,
      closedByUserId: "supervisor_retry",
    },
  });

  assert.equal(
    isCompletedServiceSnapshotCompatible(existing, expected, {
      allowDifferentClosedAt: true,
      allowDifferentClosedByUserId: true,
    }),
    true
  );
  assert.equal(isCompletedServiceSnapshotCompatible(existing, expected), false);
});

test("completed service snapshots reject conflicting duplicate attribution", async () => {
  await assert.rejects(
    recordCompletedServiceSnapshot({
      prisma: {
        completedServiceSnapshot: {
          create: async () => {
            throw new Prisma.PrismaClientKnownRequestError("duplicate", {
              code: "P2002",
              clientVersion: "test",
            });
          },
          findUnique: async () => ({
            conversationId: "conversation_a",
            protocol: "CVT-CONFLICT1",
            closedAt: new Date("2026-08-18T12:30:00.000Z"),
            assignedUserId: "agent_old",
            departmentId: "department_1",
            queueId: "queue_1",
            closedByUserId: "agent_old",
            closeReason: "operator_close",
            closeSource: "app_inbox",
          }),
        },
      } as never,
      clientId: "tenant_a",
      conversationId: "conversation_a",
      cycle: {
        protocol: "CVT-CONFLICT1",
        cycleId: "cycle_conflict",
        issuedAt: "2026-08-18T12:00:00.000Z",
        source: "web_session",
        closedAt: "2026-08-18T12:30:00.000Z",
        closeReason: "operator_close",
        closeSource: "app_inbox",
      },
      attribution: {
        assignedUserId: "agent_new",
        departmentId: "department_1",
        queueId: "queue_1",
        closedByUserId: "agent_new",
      },
    }),
    /completed_service_snapshot_conflict/
  );
});

test("completed service snapshot idempotency is scoped by tenant and cycle", async () => {
  const rows: Array<Record<string, unknown>> = [];
  const prisma = {
    completedServiceSnapshot: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const duplicate = rows.find((row) => row.clientId === data.clientId && row.cycleId === data.cycleId);
        if (duplicate) {
          throw new Prisma.PrismaClientKnownRequestError("duplicate", {
            code: "P2002",
            clientVersion: "test",
          });
        }
        rows.push(data);
        return data;
      },
      findUnique: async ({ where }: { where: { clientId_cycleId: { clientId: string; cycleId: string } } }) =>
        rows.find(
          (row) =>
            row.clientId === where.clientId_cycleId.clientId &&
            row.cycleId === where.clientId_cycleId.cycleId
        ) ?? null,
    },
  } as never;
  const cycle = {
    protocol: "CVT-TENANTCYCLE",
    cycleId: "cycle_shared",
    issuedAt: "2026-08-18T12:00:00.000Z",
    source: "web_session",
    closedAt: "2026-08-18T12:30:00.000Z",
    closeReason: "operator_close",
    closeSource: "app_inbox",
  };

  await recordCompletedServiceSnapshot({
    prisma,
    clientId: "tenant_a",
    conversationId: "conversation_a",
    cycle,
    attribution: { assignedUserId: "agent_a" },
  });
  await recordCompletedServiceSnapshot({
    prisma,
    clientId: "tenant_b",
    conversationId: "conversation_b",
    cycle,
    attribution: { assignedUserId: "agent_b" },
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.clientId), ["tenant_a", "tenant_b"]);
});

test("report history keeps multiple service cycles for one conversation", () => {
  const history = buildServiceCycleHistoryMap([
    {
      conversationId: "conversation_a",
      eventName: "conversation.protocol.started",
      payloadJson: { protocol: "CVT-AAAAAAAAAAAA", cycleId: "cycle_a", issuedAt: "2026-08-18T10:00:00.000Z" },
      createdAt: new Date("2026-08-18T10:00:00.000Z"),
    },
    {
      conversationId: "conversation_a",
      eventName: "conversation.protocol.closed",
      payloadJson: { protocol: "CVT-AAAAAAAAAAAA", cycleId: "cycle_a", closedAt: "2026-08-18T10:05:00.000Z" },
      createdAt: new Date("2026-08-18T10:05:00.000Z"),
    },
    {
      conversationId: "conversation_a",
      eventName: "conversation.protocol.started",
      payloadJson: { protocol: "CVT-BBBBBBBBBBBB", cycleId: "cycle_b", issuedAt: "2026-08-18T11:00:00.000Z" },
      createdAt: new Date("2026-08-18T11:00:00.000Z"),
    },
  ]);

  assert.deepEqual(history.get("conversation_a")?.map((cycle) => cycle.protocol), [
    "CVT-AAAAAAAAAAAA",
    "CVT-BBBBBBBBBBBB",
  ]);
  assert.equal(history.get("conversation_a")?.[0]?.closedAt?.toISOString(), "2026-08-18T10:05:00.000Z");
  assert.equal(history.get("conversation_a")?.[1]?.closedAt, null);
});
