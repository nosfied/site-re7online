import assert from "node:assert/strict";
import test from "node:test";
import { ConversationState } from "./conversation.types.js";
import {
  buildServiceCycleHistoryMap,
  clearSatisfactionRuntimeForNewServiceCycle,
  closeCurrentServiceCycle,
  ensureActiveServiceCycle,
  getActiveServiceCycle,
  getLastClosedServiceCycle,
  getServiceCycleSnapshot,
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
