import assert from "node:assert/strict";
import test from "node:test";

import type { InboxMessageItem } from "./whatsappAdminApi";
import {
  compareTimelineMessagesAscending,
  conversationMutationTargetsSelectedConversation,
  getRealtimeHumanInboxVisibility,
  isHumanTimelineMessageItem,
  isManagementOnlyRealtimeMessage,
  isNonHumanTimelineRealtimeMessage,
  realtimeEventTargetsSelectedConversation,
  resolveRealtimeConversationOperationalProjection,
  resolveRealtimeTimelineConversationKey,
  shouldApplyRealtimeMessageToHumanTimeline,
} from "./inboxRealtimeTimeline";

function timelineMessage(overrides: Partial<InboxMessageItem>): InboxMessageItem {
  return {
    id: overrides.internalMessageId ?? overrides.messageId ?? overrides.requestId ?? "message",
    direction: "INBOUND",
    type: "TEXT",
    bodyText: "mensagem",
    status: "received",
    actorName: null,
    createdAt: "2026-08-28T12:00:00.000Z",
    ...overrides,
  } as InboxMessageItem;
}

test("realtime timeline matches selected conversation across canonical identity variants", () => {
  const event = {
    waId: "5584999996787",
    waIdCanonical: "558499996787",
  };

  assert.equal(
    realtimeEventTargetsSelectedConversation({
      event,
      selectedConversationKey: "558499996787",
      selectedConversationWaId: "5584999996787",
      selectedConversationIdentityCandidates: ["558499996787", "5584999996787"],
    }),
    true
  );

  assert.equal(
    resolveRealtimeTimelineConversationKey({
      event,
      selectedConversationKey: "558499996787",
      selectedConversationWaId: "5584999996787",
      selectedConversationIdentityCandidates: ["558499996787", "5584999996787"],
    }),
    "558499996787"
  );
});

test("management-only realtime messages are identifiable without body text matching", () => {
  assert.equal(
    isManagementOnlyRealtimeMessage({
      message: {
        inboxVisibility: "management_only",
      } as never,
    }),
    true
  );
  assert.equal(
    isManagementOnlyRealtimeMessage({
      message: {
        bodyText: "Obrigado(a) por participar da nossa pesquisa!",
      } as never,
    }),
    false
  );
});

test("non-human realtime messages are identified by structured visibility projection", () => {
  assert.equal(
    isNonHumanTimelineRealtimeMessage({
      humanInboxVisible: false,
      message: {
        bodyText: "5",
      } as never,
    }),
    true
  );
  assert.equal(
    isNonHumanTimelineRealtimeMessage({
      humanInboxVisible: true,
      message: {
        inboxVisibility: "human_timeline",
        bodyText: "mensagem humana",
      } as never,
    }),
    false
  );
});

test("realtime messages only update human timeline when explicitly classified as human", () => {
  assert.equal(
    shouldApplyRealtimeMessageToHumanTimeline({
      humanInboxVisible: true,
      message: {
        bodyText: "mensagem humana",
      } as never,
    }),
    true
  );
  assert.equal(
    shouldApplyRealtimeMessageToHumanTimeline({
      message: {
        inboxVisibility: "human_timeline",
        bodyText: "mensagem humana",
      } as never,
    }),
    true
  );
  assert.equal(
    shouldApplyRealtimeMessageToHumanTimeline({
      message: {
        bodyText: "5",
      } as never,
    }),
    false
  );
  assert.equal(
    shouldApplyRealtimeMessageToHumanTimeline({
      humanInboxVisible: false,
      message: {
        inboxVisibility: "human_timeline",
        bodyText: "5",
      } as never,
    }),
    false
  );
  assert.equal(
    shouldApplyRealtimeMessageToHumanTimeline({
      humanInboxVisible: true,
      message: {
        inboxVisibility: "management_only",
        bodyText: "5",
      } as never,
    }),
    false
  );
});

test("timeline item visibility uses structured inbox visibility", () => {
  assert.equal(isHumanTimelineMessageItem({ inboxVisibility: "management_only" }), false);
  assert.equal(isHumanTimelineMessageItem({ inboxVisibility: "human_timeline" }), true);
  assert.equal(isHumanTimelineMessageItem({}), true);
});

test("timeline ordering is deterministic when timestamps match", () => {
  const items = [
    timelineMessage({
      internalMessageId: "internal-3",
      messageId: "provider-3",
      createdAt: "2026-08-28T12:00:00.000Z",
    }),
    timelineMessage({
      direction: "OUTBOUND",
      internalMessageId: "internal-1",
      messageId: "provider-1",
      createdAt: "2026-08-28T12:00:00.000Z",
    }),
    timelineMessage({
      internalMessageId: "internal-2",
      messageId: "provider-2",
      createdAt: "2026-08-28T12:00:00.000Z",
    }),
  ];

  const firstSort = [...items].sort(compareTimelineMessagesAscending).map((item) => item.internalMessageId);
  const secondSort = [...items].reverse().sort(compareTimelineMessagesAscending).map((item) => item.internalMessageId);

  assert.deepEqual(firstSort, ["internal-2", "internal-3", "internal-1"]);
  assert.deepEqual(secondSort, firstSort);
});

test("realtime human inbox visibility comes from structured backend projection", () => {
  assert.equal(getRealtimeHumanInboxVisibility({ humanInboxVisible: true }), true);
  assert.equal(getRealtimeHumanInboxVisibility({ humanInboxVisible: false }), false);
  assert.equal(getRealtimeHumanInboxVisibility({}), null);
});

test("realtime timeline keeps support/internal channel identity provider-neutral", () => {
  const event = {
    waId: "support:source-user-hash",
    waIdCanonical: "support:source-user-hash",
  };

  assert.equal(
    realtimeEventTargetsSelectedConversation({
      event,
      selectedConversationKey: "support:source-user-hash",
      selectedConversationWaId: "support:source-user-hash",
      selectedConversationIdentityCandidates: [],
    }),
    true
  );
});

test("realtime timeline rejects unrelated selected conversation", () => {
  assert.equal(
    realtimeEventTargetsSelectedConversation({
      event: {
        waId: "conversation-a",
        waIdCanonical: "conversation-a-canonical",
      },
      selectedConversationKey: "conversation-b",
      selectedConversationWaId: "conversation-b",
      selectedConversationIdentityCandidates: ["conversation-b"],
    }),
    false
  );
});

test("delayed timeline mutation for previous selection is rejected", () => {
  assert.equal(
    conversationMutationTargetsSelectedConversation({
      mutationConversationCandidates: ["conversation-a", "558400002291"],
      selectedConversationKey: "conversation-b",
      selectedConversationWaId: "558400009933",
      selectedConversationIdentityCandidates: ["conversation-b", "558400009933"],
    }),
    false
  );
});

test("delayed timeline mutation still applies to selected canonical aliases", () => {
  assert.equal(
    conversationMutationTargetsSelectedConversation({
      mutationConversationCandidates: ["5584999996787", "558499996787"],
      selectedConversationKey: "558499996787",
      selectedConversationWaId: "5584999996787",
      selectedConversationIdentityCandidates: ["558499996787", "5584999996787"],
    }),
    true
  );
});

test("realtime partial event does not reopen a known closed conversation visually", () => {
  const projection = resolveRealtimeConversationOperationalProjection(
    {
      status: "CLOSED",
      mode: "HUMAN",
      handoffStatus: "none",
      assignedUserId: null,
      departmentId: "department-closed",
      queueId: "queue-closed",
    },
    {
      mode: "BOT",
      handoffStatus: "none",
      assignedUserId: "agent-from-partial-event",
      departmentId: "department-from-partial-event",
      queueId: "queue-from-partial-event",
    }
  );

  assert.deepEqual(projection, {
    status: "CLOSED",
    mode: "HUMAN",
    handoffStatus: "none",
    assignedUserId: null,
    departmentId: "department-closed",
    queueId: "queue-closed",
  });
});

test("realtime explicit new cycle status replaces a known closed conversation", () => {
  const waitingProjection = resolveRealtimeConversationOperationalProjection(
    {
      status: "CLOSED",
      mode: "HUMAN",
      handoffStatus: "none",
      assignedUserId: null,
      departmentId: "department-closed",
      queueId: "queue-closed",
    },
    {
      status: "WAITING",
      mode: "BOT",
      departmentId: "department-new",
      queueId: "queue-new",
    }
  );
  const inProgressProjection = resolveRealtimeConversationOperationalProjection(
    {
      status: "CLOSED",
      mode: "HUMAN",
      handoffStatus: "none",
      assignedUserId: null,
      departmentId: "department-closed",
      queueId: "queue-closed",
    },
    {
      status: "IN_PROGRESS",
      mode: "HUMAN",
      handoffStatus: "active",
      assignedUserId: "agent-new",
      departmentId: "department-new",
      queueId: "queue-new",
    }
  );

  assert.deepEqual(waitingProjection, {
    status: "WAITING",
    mode: "BOT",
    handoffStatus: "none",
    assignedUserId: null,
    departmentId: "department-new",
    queueId: "queue-new",
  });
  assert.deepEqual(inProgressProjection, {
    status: "IN_PROGRESS",
    mode: "HUMAN",
    handoffStatus: "active",
    assignedUserId: "agent-new",
    departmentId: "department-new",
    queueId: "queue-new",
  });
});

test("survey partial message events preserve closed operational state", () => {
  const current = {
    status: "CLOSED" as const,
    mode: "HUMAN" as const,
    handoffStatus: "none" as const,
    assignedUserId: null,
    departmentId: "department-survey",
    queueId: "queue-survey",
  };
  const partialEvents = [
    { source: "survey-comment-offer", mode: "BOT" as const },
    { source: "survey-comment-prompt", mode: "BOT" as const },
    { source: "survey-thanks", mode: "BOT" as const },
    { source: "survey-completed-choice", mode: "BOT" as const },
  ];

  for (const event of partialEvents) {
    assert.deepEqual(
      resolveRealtimeConversationOperationalProjection(current, event),
      current,
      event.source
    );
  }
});
