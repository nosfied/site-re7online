import assert from "node:assert/strict";
import test from "node:test";
import { HandoffStatus } from "@prisma/client";
import { buildConsentTextHash } from "../consent/contactConsent.js";
import {
  claimChatbotInactivityHandoff,
  CONSENT_PENDING_INACTIVITY_SKIP_EVENT_COOLDOWN_MS,
  processChatbotInactivityTimeouts,
  resolveInactivityHandoffDestination,
  shouldRecordInactivitySkipEvent,
} from "./chatbotInactivityProcessor.js";
import { resolveChatbotConsentPrecedence } from "./chatbotConsentRuntime.js";

type RuntimeRow = {
  id: string;
  clientId: string;
  waId: string;
  waIdCanonical: string | null;
  channelAccountId: string | null;
  firstSeenAt: Date;
  lastInboundAt: Date;
  windowIsOpen: boolean;
  windowExpiresAt: Date | null;
  chatbotActive: boolean;
  mode: string;
  handoffStatus: HandoffStatus;
  assignedUserId: string | null;
  closedAt: Date | null;
  answers: Record<string, unknown>;
  handoffActivatedAt: Date | null;
  departmentId: string | null;
  queueId: string | null;
  status: string | null;
  flow: string | null;
};

function deepEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function makePrisma(row: RuntimeRow) {
  return {
    conversationRuntimeState: {
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<RuntimeRow> }) => {
        const answersFilter = where.answers as { equals?: unknown } | undefined;
        const matches =
          row.id === where.id &&
          row.chatbotActive === where.chatbotActive &&
          row.mode === where.mode &&
          row.handoffStatus === where.handoffStatus &&
          row.assignedUserId === where.assignedUserId &&
          row.closedAt === where.closedAt &&
          deepEqual(row.answers, answersFilter?.equals);
        if (!matches) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  };
}

function makeRow(overrides: Partial<RuntimeRow> = {}): RuntimeRow {
  return {
    id: "runtime-1",
    clientId: "client-1",
    waId: "558400002218",
    waIdCanonical: "558400002218",
    channelAccountId: "web-account-1",
    firstSeenAt: new Date("2026-08-15T09:00:00.000Z"),
    lastInboundAt: new Date("2026-08-15T10:00:00.000Z"),
    windowIsOpen: true,
    windowExpiresAt: new Date("2026-08-15T12:00:00.000Z"),
    chatbotActive: true,
    mode: "BOT",
    handoffStatus: HandoffStatus.NONE,
    assignedUserId: null,
    closedAt: null,
    answers: {
      chatbotRuntime: {
        lastInteractionAt: "2026-08-15T10:00:00.000Z",
        acceptedConsents: {
          "attendance:secult-pe-v1": true,
        },
      },
    },
    handoffActivatedAt: null,
    departmentId: "department-1",
    queueId: "queue-1",
    status: null,
    flow: "chatbot:flow-secult",
    ...overrides,
  };
}

function makeConsentFlow() {
  return {
    start: "consent",
    inactivityPolicy: { action: "HANDOFF", timeoutMinutes: 60, resetAfterMinutes: 1440 },
    closedHandoffPolicy: { action: "QUEUE_FOR_NEXT_OPEN" },
    nodes: {
      consent: {
        type: "consent",
        purpose: "attendance",
        textVersion: "secult-pe-v1",
        message: "Autoriza atendimento?",
        acceptOption: "1",
        declineOption: "2",
        onAccepted: "availability_router",
        onDeclined: "declined",
      },
      declined: {
        type: "text",
        text: "Atendimento encerrado.",
      },
      availability_router: {
        type: "menu",
        text: "Direcionando atendimento.",
        autoSelectSingleVisibleOption: true,
        departmentId: "department-1",
        queueId: "queue-1",
        options: [
          {
            label: "1 - Atendimento",
            next: "handoff",
            departmentId: "department-1",
            queueId: "queue-1",
          },
        ],
      },
      handoff: {
        type: "handoff",
        text: "Vou encaminhar.",
        departmentId: "department-1",
        queueId: "queue-1",
      },
    },
  };
}

function makeConsentPrisma(consent: { status: string; revokedAt?: Date | null } | null) {
  return {
    contact: { findFirst: async () => ({ id: "contact-1", waId: "558400002218" }) },
    lead: { findFirst: async () => null },
    conversation: { findFirst: async () => null },
    contactConsent: {
      findFirst: async () => consent && {
        id: "consent-1",
        status: consent.status,
        acceptedAt: consent.status === "accepted" ? new Date("2026-08-15T09:00:00.000Z") : null,
        revokedAt: consent.revokedAt ?? null,
        textVersion: "secult-pe-v1",
        textHash: buildConsentTextHash("Autoriza atendimento?"),
        createdAt: new Date("2026-08-15T09:00:00.000Z"),
        updatedAt: new Date("2026-08-15T09:00:00.000Z"),
      },
    },
    event: { create: async () => ({ id: "event-1" }) },
  };
}

test("claimChatbotInactivityHandoff skips when a new inbound changed last interaction", async () => {
  const expectedAnswers = {
    chatbotRuntime: {
      lastInteractionAt: "2026-08-15T10:00:00.000Z",
    },
  };
  const row = makeRow({
    answers: {
      chatbotRuntime: {
        lastInteractionAt: "2026-08-15T10:04:00.000Z",
      },
    },
  });

  const result = await claimChatbotInactivityHandoff({
    prisma: makePrisma(row) as never,
    runtimeStateId: row.id,
    expectedAnswers,
    nextAnswers: {
      chatbotRuntime: {
        lastInteractionAt: "2026-08-15T10:00:00.000Z",
        inactivityHandoffTriggeredAt: "2026-08-15T10:05:00.000Z",
      },
    },
    now: new Date("2026-08-15T10:05:00.000Z"),
    departmentId: "department-1",
    queueId: "queue-1",
  });

  assert.equal(result.count, 0);
  assert.equal(row.mode, "BOT");
  assert.equal(row.handoffStatus, HandoffStatus.NONE);
});

test("claimChatbotInactivityHandoff allows only one concurrent processor winner", async () => {
  const row = makeRow();
  const expectedAnswers = row.answers;
  const prisma = makePrisma(row);
  const nextAnswers = {
    chatbotRuntime: {
      lastInteractionAt: "2026-08-15T10:00:00.000Z",
      inactivityHandoffTriggeredAt: "2026-08-15T10:05:00.000Z",
    },
  };

  const first = await claimChatbotInactivityHandoff({
    prisma: prisma as never,
    runtimeStateId: row.id,
    expectedAnswers,
    nextAnswers,
    now: new Date("2026-08-15T10:05:00.000Z"),
    departmentId: "department-1",
    queueId: "queue-1",
  });
  const second = await claimChatbotInactivityHandoff({
    prisma: prisma as never,
    runtimeStateId: row.id,
    expectedAnswers,
    nextAnswers,
    now: new Date("2026-08-15T10:05:00.000Z"),
    departmentId: "department-1",
    queueId: "queue-1",
  });

  assert.equal(first.count, 1);
  assert.equal(second.count, 0);
  assert.equal(row.mode, "HUMAN");
  assert.equal(row.status, "WAITING");
  assert.equal(row.handoffStatus, HandoffStatus.ACTIVE);
});

test("claimChatbotInactivityHandoff refuses to create human handoff without department and queue", async () => {
  const row = makeRow({ departmentId: null, queueId: null });
  const expectedAnswers = row.answers;

  const result = await claimChatbotInactivityHandoff({
    prisma: makePrisma(row) as never,
    runtimeStateId: row.id,
    expectedAnswers,
    nextAnswers: {
      chatbotRuntime: {
        lastInteractionAt: "2026-08-15T10:00:00.000Z",
        inactivityHandoffTriggeredAt: "2026-08-15T10:05:00.000Z",
      },
    },
    now: new Date("2026-08-15T10:05:00.000Z"),
    departmentId: null,
    queueId: null,
  });

  assert.equal(result.count, 0);
  assert.equal(row.mode, "BOT");
  assert.equal(row.status, null);
  assert.equal(row.handoffStatus, HandoffStatus.NONE);
  assert.equal(row.departmentId, null);
  assert.equal(row.queueId, null);
});

test("resolveInactivityHandoffDestination requires both department and queue", () => {
  assert.deepEqual(
    resolveInactivityHandoffDestination({ departmentId: " department-1 ", queueId: " queue-1 " }),
    { departmentId: "department-1", queueId: "queue-1" }
  );
  assert.equal(resolveInactivityHandoffDestination({ departmentId: "department-1", queueId: null }), null);
  assert.equal(resolveInactivityHandoffDestination({ departmentId: null, queueId: "queue-1" }), null);
  assert.equal(resolveInactivityHandoffDestination({ departmentId: null, queueId: null }), null);
});

test("claimChatbotInactivityHandoff can process a due persisted row after restart once", async () => {
  const row = makeRow();
  const expectedAnswers = row.answers;
  const result = await claimChatbotInactivityHandoff({
    prisma: makePrisma(row) as never,
    runtimeStateId: row.id,
    expectedAnswers,
    nextAnswers: {
      chatbotRuntime: {
        lastInteractionAt: "2026-08-15T10:00:00.000Z",
        inactivityHandoffTriggeredAt: "2026-08-15T10:05:00.000Z",
      },
    },
    now: new Date("2026-08-15T10:05:00.000Z"),
    departmentId: "department-1",
    queueId: "queue-1",
  });

  assert.equal(result.count, 1);
  assert.equal(row.handoffActivatedAt?.toISOString(), "2026-08-15T10:05:00.000Z");
});

test("resolveChatbotConsentPrecedence requires accepted consent before inactivity handoff", async () => {
  const state = makeRow({
    answers: {
      chatbotRuntime: {
        lastInteractionAt: "2026-08-15T10:00:00.000Z",
      },
    },
  });
  const pending = await resolveChatbotConsentPrecedence({
    prisma: makeConsentPrisma(null) as never,
    clientId: "client-1",
    waId: "558400002218",
    state: { waId: "558400002218", answers: state.answers } as never,
    definition: makeConsentFlow() as never,
  });
  assert.equal(pending.accepted, false);
  assert.deepEqual(pending.pendingNodeIds, ["consent"]);

  const acceptedFromStore = await resolveChatbotConsentPrecedence({
    prisma: makeConsentPrisma({ status: "accepted" }) as never,
    clientId: "client-1",
    waId: "558400002218",
    state: { waId: "558400002218", answers: state.answers } as never,
    definition: makeConsentFlow() as never,
  });
  assert.equal(acceptedFromStore.accepted, true);
  assert.deepEqual(acceptedFromStore.pendingNodeIds, []);

  const acceptedFromRuntime = await resolveChatbotConsentPrecedence({
    prisma: makeConsentPrisma(null) as never,
    clientId: "client-1",
    waId: "558400002218",
    state: {
      waId: "558400002218",
      answers: {
        chatbotRuntime: {
          acceptedConsents: {
            "attendance:secult-pe-v1": true,
          },
        },
      },
    } as never,
    definition: makeConsentFlow() as never,
  });
  assert.equal(acceptedFromRuntime.accepted, true);
  assert.deepEqual(acceptedFromRuntime.pendingNodeIds, []);
});

type InactivityEventRow = {
  id: string;
  clientId: string;
  conversationId: string | null;
  eventName: string;
  createdAt: Date;
  payloadJson: Record<string, unknown>;
};

function makeInactivityEventPrisma(events: InactivityEventRow[]) {
  return {
    event: {
      findFirst: async ({ where }: { where: Record<string, any> }) => {
        const cutoff = where.createdAt?.gte instanceof Date ? where.createdAt.gte : null;
        const reasonPath = where.payloadJson?.path?.[0] === "reason" ? where.payloadJson.equals : null;
        return events
          .filter((event) => event.clientId === where.clientId)
          .filter((event) => event.eventName === where.eventName)
          .filter((event) => !where.conversationId || event.conversationId === where.conversationId)
          .filter((event) => !cutoff || event.createdAt >= cutoff)
          .filter((event) => !reasonPath || event.payloadJson.reason === reasonPath)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
      },
      create: async ({ data }: { data: Omit<InactivityEventRow, "id" | "createdAt"> & { createdAt?: Date } }) => {
        const event = {
          id: `event-${events.length + 1}`,
          createdAt: data.createdAt ?? new Date(),
          ...data,
        };
        events.push(event);
        return event;
      },
    },
  };
}

test("processChatbotInactivityTimeouts skips handoff while consent is pending", async () => {
  const row = makeRow({
    id: "runtime-pending-consent",
    answers: {
      chatbotRuntime: {
        lastInteractionAt: "2026-08-15T10:00:00.000Z",
      },
    },
  });
  const events: InactivityEventRow[] = [];
  const prisma = {
    conversationRuntimeState: {
      findMany: async () => [row],
      updateMany: async () => {
        throw new Error("pending consent must not claim inactivity handoff");
      },
    },
    chatbotFlow: {
      findFirst: async () => ({ id: "flow-secult", definition: makeConsentFlow() }),
    },
    ...makeConsentPrisma(null),
    conversation: {
      findFirst: async () => ({ id: "conversation-1" }),
      findUnique: async () => ({ id: "conversation-1" }),
    },
    ...makeInactivityEventPrisma(events),
  };

  const result = await processChatbotInactivityTimeouts({
    prisma: prisma as never,
    now: new Date("2026-08-15T11:01:00.000Z"),
  });

  assert.equal(result.processed, 0);
  assert.equal(row.mode, "BOT");
  assert.equal(row.handoffStatus, HandoffStatus.NONE);
  assert.equal(row.assignedUserId, null);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventName, "chatbot.inactivity.handoff.skipped");
  assert.equal(events[0]?.payloadJson.reason, "consent_pending");
  assert.deepEqual(events[0]?.payloadJson.pendingConsentNodeIds, ["consent"]);
});

test("processChatbotInactivityTimeouts records send skip when window expires after claim", async () => {
  const now = new Date("2026-08-15T11:01:00.000Z");
  const state: Record<string, any> = {
    id: "runtime-expiring-window",
    clientId: "client-1",
    waId: "558400002218",
    waIdCanonical: "558400002218",
    channelAccountId: "web-account-1",
    firstSeenAt: new Date("2026-08-15T09:00:00.000Z"),
    lastInboundAt: new Date("2026-08-15T10:00:00.000Z"),
    windowIsOpen: true,
    windowExpiresAt: new Date("2026-08-15T11:01:00.500Z"),
    flow: "chatbot:flow-secult",
    chatbotActive: true,
    mode: "BOT",
    handoffStatus: HandoffStatus.NONE,
    assignedUserId: null,
    closedAt: null,
    answers: {
      chatbotRuntime: {
        lastInteractionAt: "2026-08-15T10:00:00.000Z",
      },
    },
    departmentId: "department-1",
    queueId: "queue-1",
    status: null,
  };
  state.answers.chatbotRuntime.acceptedConsents = { "attendance:secult-pe-v1": true };
  const events: InactivityEventRow[] = [];
  const eventStore = makeInactivityEventPrisma(events);
  const prisma = {
    conversationRuntimeState: {
      findMany: async (args?: { where?: Record<string, unknown> }) => {
        if (args?.where && Object.prototype.hasOwnProperty.call(args.where, "queueId")) return [];
        return [state];
      },
      updateMany: async ({ where, data }: { where: Record<string, any>; data: Record<string, unknown> }) => {
        const expectedAnswers = where.answers?.equals;
        if (state.id !== where.id || state.mode !== where.mode || !deepEqual(state.answers, expectedAnswers)) {
          return { count: 0 };
        }
        Object.assign(state, data);
        return { count: 1 };
      },
    },
    chatbotFlow: { findFirst: async () => ({ id: "flow-secult", definition: makeConsentFlow() }) },
    ...makeConsentPrisma({ status: "accepted" }),
    conversation: {
      findFirst: async () => ({ id: "conversation-1" }),
      findUnique: async () => ({ id: "conversation-1" }),
    },
    client: { findUnique: async () => ({ clientKey: "tenant-1" }) },
    tenantOperationalConfig: { findUnique: async () => null },
    event: eventStore.event,
  };

  const result = await processChatbotInactivityTimeouts({
    prisma: prisma as never,
    now,
    nowMs: () => new Date("2026-08-15T11:01:01.000Z").getTime(),
  });

  assert.equal(result.processed, 1);
  assert.equal(state.mode, "HUMAN");
  assert.equal(state.status, "WAITING");
  assert.equal(state.assignedUserId, null);
  assert.equal(events.some((event) => event.payloadJson.reason === "window_closed_after_claim"), true);
  const skipped = events.find((event) => event.payloadJson.reason === "window_closed_after_claim");
  assert.equal(skipped?.payloadJson.messageStage, "handoff");
  assert.equal(skipped?.payloadJson.sendReason, "window_closed");
});

test("consent_pending cooldown suppresses only persisted event while processor keeps evaluating", async () => {
  const row = makeRow({
    id: "runtime-pending-consent",
    answers: {
      chatbotRuntime: {
        lastInteractionAt: "2026-08-15T10:00:00.000Z",
      },
    },
  });
  const events: InactivityEventRow[] = [];
  let candidateEvaluations = 0;
  const prisma = {
    conversationRuntimeState: {
      findMany: async () => {
        candidateEvaluations += 1;
        return [row];
      },
      updateMany: async () => {
        throw new Error("pending consent must not claim inactivity handoff");
      },
    },
    chatbotFlow: {
      findFirst: async () => ({ id: "flow-secult", definition: makeConsentFlow() }),
    },
    ...makeConsentPrisma(null),
    conversation: {
      findFirst: async () => ({ id: "conversation-1" }),
      findUnique: async () => ({ id: "conversation-1" }),
    },
    ...makeInactivityEventPrisma(events),
  };

  await processChatbotInactivityTimeouts({
    prisma: prisma as never,
    now: new Date("2026-08-15T11:01:00.000Z"),
  });
  await processChatbotInactivityTimeouts({
    prisma: prisma as never,
    now: new Date("2026-08-15T11:02:00.000Z"),
  });

  assert.equal(candidateEvaluations, 2);
  assert.equal(events.length, 1);
  assert.equal(row.mode, "BOT");
  assert.equal(row.handoffStatus, HandoffStatus.NONE);
});

test("consent_pending inactivity skip event is recorded once inside cooldown", async () => {
  const events: InactivityEventRow[] = [];
  const prisma = makeInactivityEventPrisma(events);
  const now = new Date("2026-08-15T11:00:00.000Z");

  assert.equal(
    await shouldRecordInactivitySkipEvent({
      prisma: prisma as never,
      clientId: "client-1",
      conversationId: "conversation-1",
      runtimeStateId: "runtime-1",
      now,
      reason: "consent_pending",
    }),
    true
  );
  await prisma.event.create({
    data: {
      clientId: "client-1",
      conversationId: "conversation-1",
      eventName: "chatbot.inactivity.handoff.skipped",
      payloadJson: { reason: "consent_pending", runtimeStateId: "runtime-1" },
      createdAt: now,
    },
  });

  for (let minute = 1; minute < 30; minute += 1) {
    assert.equal(
      await shouldRecordInactivitySkipEvent({
        prisma: prisma as never,
        clientId: "client-1",
        conversationId: "conversation-1",
        runtimeStateId: "runtime-1",
        now: new Date(now.getTime() + minute * 60_000),
        reason: "consent_pending",
      }),
      false
    );
  }
});

test("consent_pending inactivity skip event is recorded again after cooldown", async () => {
  const base = new Date("2026-08-15T11:00:00.000Z");
  const events: InactivityEventRow[] = [
    {
      id: "event-1",
      clientId: "client-1",
      conversationId: "conversation-1",
      eventName: "chatbot.inactivity.handoff.skipped",
      createdAt: base,
      payloadJson: { reason: "consent_pending", runtimeStateId: "runtime-1" },
    },
  ];

  assert.equal(
    await shouldRecordInactivitySkipEvent({
      prisma: makeInactivityEventPrisma(events) as never,
      clientId: "client-1",
      conversationId: "conversation-1",
      runtimeStateId: "runtime-1",
      now: new Date(base.getTime() + CONSENT_PENDING_INACTIVITY_SKIP_EVENT_COOLDOWN_MS + 1),
      reason: "consent_pending",
    }),
    true
  );
});

test("inactivity skip dedupe is scoped by reason tenant and conversation", async () => {
  const now = new Date("2026-08-15T11:00:00.000Z");
  const recent = new Date(now.getTime() - 5 * 60_000);
  const events: InactivityEventRow[] = [
    {
      id: "event-1",
      clientId: "client-1",
      conversationId: "conversation-1",
      eventName: "chatbot.inactivity.handoff.skipped",
      createdAt: recent,
      payloadJson: { reason: "consent_pending", runtimeStateId: "runtime-1" },
    },
  ];
  const prisma = makeInactivityEventPrisma(events) as never;

  assert.equal(
    await shouldRecordInactivitySkipEvent({
      prisma,
      clientId: "client-1",
      conversationId: "conversation-1",
      runtimeStateId: "runtime-1",
      now,
      reason: "missing_operational_destination",
    }),
    true
  );
  assert.equal(
    await shouldRecordInactivitySkipEvent({
      prisma,
      clientId: "client-2",
      conversationId: "conversation-1",
      runtimeStateId: "runtime-1",
      now,
      reason: "consent_pending",
    }),
    true
  );
  assert.equal(
    await shouldRecordInactivitySkipEvent({
      prisma,
      clientId: "client-1",
      conversationId: "conversation-2",
      runtimeStateId: "runtime-2",
      now,
      reason: "consent_pending",
    }),
    true
  );
});
