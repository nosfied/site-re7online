import assert from "node:assert/strict";
import test from "node:test";

import {
  addAutoReadSuppressionKeys,
  clearAutoReadSuppressionKeys,
  hasAutoReadSuppressionKey,
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
