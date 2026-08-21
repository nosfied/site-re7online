import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  getInboxReadState,
  markInboxConversationRead,
  markInboxConversationUnread,
  markInboxConversationUnreadFromActivity,
  resolveConversationReadScope,
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

test("assigned read state is visible only to the assigned user", async () => {
  const scope = { type: "assigned" as const, assignedUserId: "joao" };

  await markInboxConversationUnreadFromActivity({
    clientId: testClientId,
    userId: "joao",
    conversationKeys: ["conversation-assigned"],
    activityAt: "2026-08-21T10:00:00.000Z",
    scope,
  });

  const joaoState = await getInboxReadState(testClientId, "joao");
  assert.equal(joaoState.manuallyUnreadByConversationKey["conversation-assigned"], true);
  assert.equal(joaoState.lastReadAtByConversationKey["conversation-assigned"], "2026-08-21T10:00:00.000Z");

  const mariaState = await getInboxReadState(testClientId, "maria");
  assert.equal(mariaState.manuallyUnreadByConversationKey["conversation-assigned"], undefined);
  assert.equal(mariaState.lastReadAtByConversationKey["conversation-assigned"], undefined);
});

test("shared read updates do not clear assigned unread state", async () => {
  await markInboxConversationUnreadFromActivity({
    clientId: testClientId,
    userId: "joao",
    conversationKeys: ["conversation-assigned"],
    activityAt: "2026-08-21T10:00:00.000Z",
    scope: { type: "assigned", assignedUserId: "joao" },
  });

  await markInboxConversationRead({
    clientId: testClientId,
    userId: "maria",
    conversationKey: "conversation-assigned",
    activityAt: "2026-08-21T10:05:00.000Z",
    scope: { type: "shared" },
  });

  const joaoState = await getInboxReadState(testClientId, "joao");
  assert.equal(joaoState.manuallyUnreadByConversationKey["conversation-assigned"], true);
  assert.equal(joaoState.lastReadAtByConversationKey["conversation-assigned"], "2026-08-21T10:00:00.000Z");

  const mariaState = await getInboxReadState(testClientId, "maria");
  assert.equal(mariaState.manuallyUnreadByConversationKey["conversation-assigned"], undefined);
  assert.equal(mariaState.lastReadAtByConversationKey["conversation-assigned"], "2026-08-21T10:05:00.000Z");
});

test("conversation read scope uses assignment when present", () => {
  assert.deepEqual(resolveConversationReadScope({ assignedUserId: " joao " }), {
    type: "assigned",
    assignedUserId: "joao",
  });
  assert.deepEqual(resolveConversationReadScope({ assignedUserId: null }), { type: "shared" });
});
