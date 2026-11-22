import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  getInboxReadState,
  getInboxReadStateForConversations,
  isInboxReadStateMutationNoop,
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

test("scope-aware read state ignores stale assigned state after closed unassigned transition", async () => {
  await fs.mkdir(testStateDir, { recursive: true });
  await fs.writeFile(
    path.join(testStateDir, "shared.json"),
    JSON.stringify({
      lastReadAtByConversationKey: {
        "558499049614": "2026-08-21T12:04:39.256Z",
        "demo-converta:558499049614": "2026-08-21T05:05:50.218Z",
      },
      manuallyUnreadByConversationKey: {
        "demo-converta:558499049614": true,
      },
    }),
    "utf-8"
  );
  await markInboxConversationUnreadFromActivity({
    clientId: testClientId,
    userId: "ana",
    conversationKeys: ["558499049614", "demo-converta:558499049614"],
    activityAt: "2026-08-21T10:24:28.263Z",
    scope: { type: "assigned", assignedUserId: "ana" },
  });

  const scopedState = await getInboxReadStateForConversations({
    clientId: testClientId,
    userId: "ana",
    conversations: [
      {
        assignedUserId: null,
        conversationKeys: ["558499049614", "demo-converta:558499049614"],
      },
    ],
  });

  assert.equal(scopedState.lastReadAtByConversationKey["558499049614"], "2026-08-21T12:04:39.256Z");
  assert.equal(scopedState.lastReadAtByConversationKey["demo-converta:558499049614"], "2026-08-21T12:04:39.256Z");
  assert.equal(scopedState.manuallyUnreadByConversationKey["558499049614"], undefined);
  assert.equal(scopedState.manuallyUnreadByConversationKey["demo-converta:558499049614"], undefined);
});

test("scope-aware read state switches authority between shared and assigned scopes", async () => {
  await markInboxConversationRead({
    clientId: testClientId,
    userId: "shared",
    conversationKey: "conversation-a",
    activityAt: "2026-08-21T10:00:00.000Z",
    scope: { type: "shared" },
  });
  await markInboxConversationUnreadFromActivity({
    clientId: testClientId,
    userId: "ana",
    conversationKeys: ["conversation-a"],
    activityAt: "2026-08-21T10:05:00.000Z",
    scope: { type: "assigned", assignedUserId: "ana" },
  });

  const sharedScope = await getInboxReadStateForConversations({
    clientId: testClientId,
    userId: "ana",
    conversations: [{ assignedUserId: null, conversationKeys: ["conversation-a"] }],
  });
  assert.equal(sharedScope.manuallyUnreadByConversationKey["conversation-a"], undefined);
  assert.equal(sharedScope.lastReadAtByConversationKey["conversation-a"], "2026-08-21T10:00:00.000Z");

  const assignedToAna = await getInboxReadStateForConversations({
    clientId: testClientId,
    userId: "ana",
    conversations: [{ assignedUserId: "ana", conversationKeys: ["conversation-a"] }],
  });
  assert.equal(assignedToAna.manuallyUnreadByConversationKey["conversation-a"], true);
  assert.equal(assignedToAna.lastReadAtByConversationKey["conversation-a"], "2026-08-21T10:05:00.000Z");

  const assignedToJoaoForAna = await getInboxReadStateForConversations({
    clientId: testClientId,
    userId: "ana",
    conversations: [{ assignedUserId: "joao", conversationKeys: ["conversation-a"] }],
  });
  assert.equal(assignedToJoaoForAna.manuallyUnreadByConversationKey["conversation-a"], undefined);
  assert.equal(assignedToJoaoForAna.lastReadAtByConversationKey["conversation-a"], "2026-08-21T10:00:00.000Z");
});

test("mark read clears all known aliases in the active read scope", async () => {
  await markInboxConversationUnreadFromActivity({
    clientId: testClientId,
    userId: "shared",
    conversationKeys: ["558499049614", "demo-converta:558499049614"],
    activityAt: "2026-08-21T11:29:04.718Z",
    scope: { type: "shared" },
  });

  await markInboxConversationRead({
    clientId: testClientId,
    userId: "ana",
    conversationKey: "558499049614",
    conversationKeys: ["demo-converta:558499049614"],
    activityAt: "2026-08-21T12:04:39.256Z",
    scope: { type: "shared" },
  });

  const scopedState = await getInboxReadStateForConversations({
    clientId: testClientId,
    userId: "ana",
    conversations: [
      {
        assignedUserId: null,
        conversationKeys: ["558499049614", "demo-converta:558499049614"],
      },
    ],
  });
  assert.equal(scopedState.manuallyUnreadByConversationKey["558499049614"], undefined);
  assert.equal(scopedState.manuallyUnreadByConversationKey["demo-converta:558499049614"], undefined);
  assert.equal(scopedState.lastReadAtByConversationKey["558499049614"], "2026-08-21T12:04:39.256Z");
  assert.equal(scopedState.lastReadAtByConversationKey["demo-converta:558499049614"], "2026-08-21T12:04:39.256Z");
});

test("read-state mutation noop detects redundant read and preserves useful updates", () => {
  const current = {
    lastReadAtByConversationKey: {
      "558499049614": "2026-08-22T21:19:54.603Z",
      "demo-converta:558499049614": "2026-08-22T21:19:54.603Z",
    },
    manuallyUnreadByConversationKey: {},
  };

  assert.equal(
    isInboxReadStateMutationNoop({
      current,
      conversationKeys: ["558499049614", "demo-converta:558499049614"],
      unread: false,
      activityAt: "2026-08-22T21:19:53.000Z",
    }),
    true
  );
  assert.equal(
    isInboxReadStateMutationNoop({
      current: {
        ...current,
        manuallyUnreadByConversationKey: { "demo-converta:558499049614": true },
      },
      conversationKeys: ["558499049614", "demo-converta:558499049614"],
      unread: false,
      activityAt: "2026-08-22T21:19:53.000Z",
    }),
    false
  );
  assert.equal(
    isInboxReadStateMutationNoop({
      current,
      conversationKeys: ["558499049614", "demo-converta:558499049614"],
      unread: false,
      activityAt: "2026-08-22T21:19:55.000Z",
    }),
    false
  );
});
