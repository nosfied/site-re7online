import assert from "node:assert/strict";
import test from "node:test";
import { HandoffStatus } from "@prisma/client";
import { buildConsentTextHash } from "../consent/contactConsent.js";
import {
  claimChatbotInactivityHandoff,
  processChatbotInactivityTimeouts,
  resolveInactivityHandoffDestination,
} from "./chatbotInactivityProcessor.js";
import { resolveChatbotConsentPrecedence } from "./chatbotConsentRuntime.js";

type RuntimeRow = {
  id: string;
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

test("processChatbotInactivityTimeouts skips handoff while consent is pending", async () => {
  const row = makeRow({
    id: "runtime-pending-consent",
    answers: {
      chatbotRuntime: {
        lastInteractionAt: "2026-08-15T10:00:00.000Z",
      },
    },
  });
  const events: Array<{ eventName: string; payloadJson: Record<string, unknown> }> = [];
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
    event: {
      create: async ({ data }: { data: { eventName: string; payloadJson: Record<string, unknown> } }) => {
        events.push({ eventName: data.eventName, payloadJson: data.payloadJson });
        return { id: `event-${events.length}` };
      },
    },
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
