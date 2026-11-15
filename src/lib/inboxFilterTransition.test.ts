import assert from "node:assert/strict";
import test from "node:test";
import { InboxConversationQueryRegistry } from "./inboxConversationSearch";
import {
  conversationMatchesPrimaryFilter,
  decideInboxFilterTransition,
  shouldPublishInboxTimelineResponse,
  type InboxCompositionActivity,
} from "./inboxFilterTransition";

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
