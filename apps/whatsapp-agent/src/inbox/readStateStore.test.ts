import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  getInboxReadState,
  markInboxConversationRead,
  markInboxConversationUnread,
} from "./readStateStore.js";

const testClientId = "read-state-shared-test-client";
const otherTestClientId = "read-state-shared-other-client";
const testStateDir = path.resolve(process.cwd(), ".data", "app-read-state", testClientId);
const otherTestStateDir = path.resolve(process.cwd(), ".data", "app-read-state", otherTestClientId);

test.afterEach(async () => {
  await fs.rm(testStateDir, { recursive: true, force: true });
  await fs.rm(otherTestStateDir, { recursive: true, force: true });
});

test("read state is shared across users in the same tenant", async () => {
  await markInboxConversationUnread({
    clientId: testClientId,
    userId: "user-a",
    conversationKey: "conversation-a",
  });

  const userBState = await getInboxReadState(testClientId, "user-b");
  assert.equal(userBState.manuallyUnreadByConversationKey["conversation-a"], true);

  await markInboxConversationRead({
    clientId: testClientId,
    userId: "user-b",
    conversationKey: "conversation-a",
    activityAt: "2026-08-19T10:00:00.000Z",
  });

  const userAState = await getInboxReadState(testClientId, "user-a");
  assert.equal(userAState.manuallyUnreadByConversationKey["conversation-a"], undefined);
  assert.equal(userAState.lastReadAtByConversationKey["conversation-a"], "2026-08-19T10:00:00.000Z");
});

test("shared read state remains tenant isolated", async () => {
  await markInboxConversationUnread({
    clientId: testClientId,
    userId: "user-a",
    conversationKey: "conversation-a",
  });

  const otherTenantState = await getInboxReadState(otherTestClientId, "user-a");
  assert.deepEqual(otherTenantState.manuallyUnreadByConversationKey, {});
});
