import assert from "node:assert/strict";
import test from "node:test";

import { shouldMarkReadAfterTimelineRefresh } from "./inboxTimelineRefresh";

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
