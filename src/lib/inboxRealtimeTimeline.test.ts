import assert from "node:assert/strict";
import test from "node:test";

import {
  realtimeEventTargetsSelectedConversation,
  resolveRealtimeConversationOperationalProjection,
  resolveRealtimeTimelineConversationKey,
} from "./inboxRealtimeTimeline";

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

test("realtime partial event does not reopen a known closed conversation visually", () => {
  const projection = resolveRealtimeConversationOperationalProjection(
    { status: "CLOSED", mode: "HUMAN" },
    { mode: "BOT" }
  );

  assert.deepEqual(projection, {
    status: "CLOSED",
    mode: "HUMAN",
  });
});

test("realtime explicit new cycle status replaces a known closed conversation", () => {
  const waitingProjection = resolveRealtimeConversationOperationalProjection(
    { status: "CLOSED", mode: "HUMAN" },
    { status: "WAITING", mode: "BOT" }
  );
  const inProgressProjection = resolveRealtimeConversationOperationalProjection(
    { status: "CLOSED", mode: "HUMAN" },
    { status: "IN_PROGRESS", mode: "HUMAN" }
  );

  assert.deepEqual(waitingProjection, {
    status: "WAITING",
    mode: "BOT",
  });
  assert.deepEqual(inProgressProjection, {
    status: "IN_PROGRESS",
    mode: "HUMAN",
  });
});
