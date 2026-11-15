import assert from "node:assert/strict";
import test from "node:test";
import { InboxConversationQueryRegistry } from "./inboxConversationSearch";
import {
  conversationMatchesInboxFilters,
  conversationMatchesPrimaryFilter,
  decideInboxFilterTransition,
  shouldPublishInboxTimelineResponse,
  type InboxCompositionActivity,
} from "./inboxFilterTransition";

const activeFilters = {
  primaryFilter: "WAITING" as const,
  userId: "agent-1",
  activeDepartmentId: "department-support",
  conversationDepartmentId: "department-support",
  activeChannel: "whatsapp",
  conversationChannel: "whatsapp",
  quickFilter: "UNREAD" as const,
  isUnread: true,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const unsentComposition: InboxCompositionActivity = {
  draft: "resposta ainda não enviada",
  hasReplyTarget: true,
  hasMedia: true,
  audioState: "idle",
};

test("rapid filter changes keep an eligible selection, draft and attachment while stale list results are ignored", async () => {
  const selected = {
    status: "WAITING" as const,
    mode: "HUMAN" as const,
    handoffStatus: "none",
    assignedUserId: null,
    assignedAt: null,
  };
  const registry = new InboxConversationQueryRegistry();
  const allResponse = deferred<string[]>();
  const waitingResponse = deferred<string[]>();
  let visibleRows = ["conversation-6306"];
  const composition = { ...unsentComposition };

  registry.setCurrentKey("filter=ALL");
  const staleList = registry.run("filter=ALL", async () => {
    const rows = await allResponse.promise;
    if (registry.isCurrent("filter=ALL")) visibleRows = rows;
  });

  const decision = decideInboxFilterTransition({
    filterChanged: true,
    hasSelection: true,
    selectionMatchesNextFilter: conversationMatchesPrimaryFilter(selected, "WAITING", "agent-1"),
    composition,
  });
  assert.equal(decision, "retain");

  registry.setCurrentKey("filter=WAITING");
  const currentList = registry.run("filter=WAITING", async () => {
    const rows = await waitingResponse.promise;
    if (registry.isCurrent("filter=WAITING")) visibleRows = rows;
  });
  waitingResponse.resolve(["conversation-6306", "conversation-2"]);
  await currentList;
  allResponse.resolve(["stale-conversation"]);
  await staleList;

  assert.deepEqual(visibleRows, ["conversation-6306", "conversation-2"]);
  assert.deepEqual(composition, unsentComposition);
});

test("an out-of-filter selection is retained only to protect unsent work and is explicitly distinguishable", () => {
  const selected = {
    status: "WAITING" as const,
    mode: "HUMAN" as const,
    assignedUserId: null,
  };
  assert.equal(conversationMatchesPrimaryFilter(selected, "IN_PROGRESS", "agent-1"), false);
  assert.equal(decideInboxFilterTransition({
    filterChanged: true,
    hasSelection: true,
    selectionMatchesNextFilter: false,
    composition: unsentComposition,
  }), "retain_outside_filter");
  assert.equal(decideInboxFilterTransition({
    filterChanged: true,
    hasSelection: true,
    selectionMatchesNextFilter: false,
    composition: { draft: "", hasReplyTarget: false, hasMedia: false, audioState: "idle" },
  }), "clear");
});

test("effective eligibility applies department, channel and quick filters through one predicate", () => {
  const selected = {
    status: "WAITING" as const,
    mode: "HUMAN" as const,
    assignedUserId: null,
  };
  assert.equal(conversationMatchesInboxFilters(selected, activeFilters), true);
  assert.equal(conversationMatchesInboxFilters(selected, {
    ...activeFilters,
    conversationDepartmentId: "department-sales",
  }), false);
  assert.equal(conversationMatchesInboxFilters(selected, {
    ...activeFilters,
    conversationChannel: "instagram",
  }), false);
  assert.equal(conversationMatchesInboxFilters(selected, {
    ...activeFilters,
    isUnread: false,
  }), false);
  assert.equal(conversationMatchesInboxFilters(selected, {
    ...activeFilters,
    quickFilter: "HUMAN",
  }), true);
  assert.equal(conversationMatchesInboxFilters({ ...selected, mode: "BOT" }, {
    ...activeFilters,
    primaryFilter: "AUTOMATION",
    quickFilter: "HUMAN",
  }), false);
  assert.equal(conversationMatchesInboxFilters(selected, {
    ...activeFilters,
    quickFilter: "ASSIGNED",
  }), false);
});

test("secondary-filter exclusion preserves draft, attachment, reply and recording state", () => {
  const selected = {
    status: "WAITING" as const,
    mode: "HUMAN" as const,
    assignedUserId: null,
  };
  assert.equal(conversationMatchesInboxFilters(selected, activeFilters), true);
  const secondaryChanges = [
    { ...activeFilters, activeChannel: "instagram" },
    { ...activeFilters, activeDepartmentId: "department-sales" },
    { ...activeFilters, quickFilter: "UNREAD" as const, isUnread: false },
  ];
  for (const filters of secondaryChanges) {
    const matches = conversationMatchesInboxFilters(selected, filters);
    assert.equal(matches, false);
    assert.equal(decideInboxFilterTransition({
      filterChanged: true,
      hasSelection: true,
      selectionMatchesNextFilter: matches,
      composition: { ...unsentComposition, audioState: "recording" },
    }), "retain_outside_filter");
  }
});

test("timeline publication rejects out-of-order and cross-conversation responses without erasing composition", () => {
  const composition = { ...unsentComposition };
  assert.equal(shouldPublishInboxTimelineResponse({
    requestSequence: 10,
    currentSequence: 11,
    expectedConversationIdentities: ["conversation-6306", "55846306"],
    responseConversationIdentities: ["conversation-6306"],
  }), false);
  assert.equal(shouldPublishInboxTimelineResponse({
    requestSequence: 11,
    currentSequence: 11,
    expectedConversationIdentities: ["conversation-6306", "55846306"],
    responseConversationIdentities: ["other-conversation"],
  }), false);
  assert.equal(shouldPublishInboxTimelineResponse({
    requestSequence: 11,
    currentSequence: 11,
    expectedConversationIdentities: ["conversation-6306", "55846306"],
    responseConversationIdentities: ["55846306"],
  }), true);
  assert.deepEqual(composition, unsentComposition);
});
