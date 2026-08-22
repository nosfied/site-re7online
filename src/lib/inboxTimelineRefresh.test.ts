import assert from "node:assert/strict";
import test from "node:test";

import {
  addAutoReadSuppressionKeys,
  clearAutoReadSuppressionKeys,
  hasAutoReadSuppressionKey,
  isConversationEffectivelyRead,
  mergeReadStatePreservingUnrelated,
  retainAutoReadSuppressionKeys,
  removeAutoReadSuppressionKeys,
  shouldMarkReadAfterTimelineRefresh,
} from "./inboxTimelineRefresh";

test("technical queue mutation refresh can skip automatic mark-read", () => {
  assert.equal(
    shouldMarkReadAfterTimelineRefresh({
      canMutateReadState: true,
      isForegroundFocused: true,
      intent: { skipMarkRead: true },
    }),
    false
  );
});

test("normal foreground refresh still marks read when the user can mutate read state", () => {
  assert.equal(
    shouldMarkReadAfterTimelineRefresh({
      canMutateReadState: true,
      isForegroundFocused: true,
    }),
    true
  );
});

test("background refresh and non-mutable read state do not mark read", () => {
  assert.equal(
    shouldMarkReadAfterTimelineRefresh({
      canMutateReadState: true,
      isForegroundFocused: false,
    }),
    false
  );
  assert.equal(
    shouldMarkReadAfterTimelineRefresh({
      canMutateReadState: false,
      isForegroundFocused: true,
    }),
    false
  );
});

test("queue mutation suppression survives technical refreshes until a real open clears it", () => {
  const suppressedKeys = new Set<string>();

  addAutoReadSuppressionKeys(suppressedKeys, [
    "demo-converta:558499049614",
    "558499049614",
    "",
    null,
    undefined,
  ]);

  assert.equal(hasAutoReadSuppressionKey(suppressedKeys, ["558499049614"]), true);
  assert.equal(
    shouldMarkReadAfterTimelineRefresh({
      canMutateReadState: true,
      isForegroundFocused: true,
      intent: hasAutoReadSuppressionKey(suppressedKeys, ["558499049614"])
        ? { skipMarkRead: true }
        : undefined,
    }),
    false
  );

  removeAutoReadSuppressionKeys(suppressedKeys, ["558499049614"]);

  assert.equal(hasAutoReadSuppressionKey(suppressedKeys, ["558499049614"]), false);
  assert.equal(
    shouldMarkReadAfterTimelineRefresh({
      canMutateReadState: true,
      isForegroundFocused: true,
    }),
    true
  );
});

test("queue mutation suppression is scoped to the active session lifecycle", () => {
  const suppressedKeys = new Set<string>();

  addAutoReadSuppressionKeys(suppressedKeys, ["tenant-a:conversation-x", "conversation-x"]);
  assert.equal(hasAutoReadSuppressionKey(suppressedKeys, ["tenant-a:conversation-x"]), true);

  clearAutoReadSuppressionKeys(suppressedKeys);

  assert.equal(suppressedKeys.size, 0);
  assert.equal(hasAutoReadSuppressionKey(suppressedKeys, ["tenant-a:conversation-x"]), false);
});

test("queue mutation suppression prunes conversations that leave the local list", () => {
  const suppressedKeys = new Set<string>();

  addAutoReadSuppressionKeys(suppressedKeys, [
    "tenant-a:conversation-a",
    "conversation-a",
    "tenant-a:conversation-b",
  ]);

  retainAutoReadSuppressionKeys(suppressedKeys, ["tenant-a:conversation-a", "conversation-a"]);

  assert.equal(hasAutoReadSuppressionKey(suppressedKeys, ["tenant-a:conversation-a"]), true);
  assert.equal(hasAutoReadSuppressionKey(suppressedKeys, ["conversation-a"]), true);
  assert.equal(hasAutoReadSuppressionKey(suppressedKeys, ["tenant-a:conversation-b"]), false);
});

test("queue mutation suppression does not leak across tenant cleanup", () => {
  const suppressedKeys = new Set<string>();

  addAutoReadSuppressionKeys(suppressedKeys, ["tenant-a:conversation-x", "conversation-x"]);
  clearAutoReadSuppressionKeys(suppressedKeys);
  addAutoReadSuppressionKeys(suppressedKeys, ["tenant-b:conversation-x"]);

  assert.equal(hasAutoReadSuppressionKey(suppressedKeys, ["tenant-a:conversation-x"]), false);
  assert.equal(hasAutoReadSuppressionKey(suppressedKeys, ["tenant-b:conversation-x"]), true);
});

test("already read conversations do not need redundant mark-read mutations", () => {
  assert.equal(
    isConversationEffectivelyRead({
      readState: {
        lastReadAtByConversationKey: {
          "558499049614": "2026-08-22T21:19:54.603Z",
          "demo-converta:558499049614": "2026-08-22T21:19:54.603Z",
        },
        manuallyUnreadByConversationKey: {},
      },
      conversationKeys: ["558499049614", "demo-converta:558499049614"],
      activityAt: "2026-08-22T21:19:53.000Z",
    }),
    true
  );
});

test("manual unread and newer activity still require mark-read", () => {
  assert.equal(
    isConversationEffectivelyRead({
      readState: {
        lastReadAtByConversationKey: { "conversation-a": "2026-08-22T21:19:54.603Z" },
        manuallyUnreadByConversationKey: { "conversation-a": true },
      },
      conversationKeys: ["conversation-a"],
      activityAt: "2026-08-22T21:19:53.000Z",
    }),
    false
  );
  assert.equal(
    isConversationEffectivelyRead({
      readState: {
        lastReadAtByConversationKey: { "conversation-a": "2026-08-22T21:19:54.603Z" },
        manuallyUnreadByConversationKey: {},
      },
      conversationKeys: ["conversation-a"],
      activityAt: "2026-08-22T21:19:55.000Z",
    }),
    false
  );
});

test("missing canonical alias still requires mark-read", () => {
  assert.equal(
    isConversationEffectivelyRead({
      readState: {
        lastReadAtByConversationKey: { "558499049614": "2026-08-22T21:19:54.603Z" },
        manuallyUnreadByConversationKey: {},
      },
      conversationKeys: ["558499049614", "demo-converta:558499049614"],
      activityAt: "2026-08-22T21:19:53.000Z",
    }),
    false
  );
});

test("partial read-state updates do not touch unrelated similar-name conversations", () => {
  const current = {
    lastReadAtByConversationKey: {
      "558494786787": "2026-08-22T21:21:02.067Z",
      "demo-converta:558494786787": "2026-08-22T21:21:02.067Z",
      "558499049614": "2026-08-22T21:19:54.603Z",
      "demo-converta:558499049614": "2026-08-22T21:19:54.603Z",
    },
    manuallyUnreadByConversationKey: {},
  };

  const merged = mergeReadStatePreservingUnrelated(current, {
    lastReadAtByConversationKey: {
      "558494786787": "2026-08-22T21:21:02.067Z",
      "demo-converta:558494786787": "2026-08-22T21:21:02.067Z",
    },
    manuallyUnreadByConversationKey: {},
  });

  assert.equal(
    isConversationEffectivelyRead({
      readState: merged,
      conversationKeys: ["558494786787", "demo-converta:558494786787"],
      activityAt: "2026-08-22T21:21:00.000Z",
    }),
    true
  );
  assert.equal(
    isConversationEffectivelyRead({
      readState: merged,
      conversationKeys: ["558499049614", "demo-converta:558499049614"],
      activityAt: "2026-08-22T21:19:53.000Z",
    }),
    true
  );
});
