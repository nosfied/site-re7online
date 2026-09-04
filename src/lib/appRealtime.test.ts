import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRealtimeNotificationUserContext,
  canUserSeeConversationInInboxByPolicy,
  canUserReceiveTargetedNotification,
  handleRealtimeNotificationCandidate,
} from "./appRealtime";

test("ADMIN receives unassigned notifications from every department", () => {
  assert.equal(
    canUserReceiveTargetedNotification(
      { departmentId: "department-b" },
      { id: "admin-a", role: "ADMIN", departmentId: "department-a" }
    ),
    true
  );
});

test("department-scoped roles use primary department only when memberships are unavailable", () => {
  assert.equal(
    canUserReceiveTargetedNotification(
      { departmentId: "department-b" },
      { id: "supervisor-a", role: "SUPERVISOR", departmentId: "department-a" }
    ),
    false
  );
  assert.equal(
    canUserReceiveTargetedNotification(
      { departmentId: "department-a" },
      { id: "agent-a", role: "AGENT", departmentId: "department-a" }
    ),
    true
  );
});

test("department-scoped roles receive notifications for active memberships", () => {
  assert.equal(
    canUserReceiveTargetedNotification(
      { departmentId: "department-c" },
      { id: "agent-a", role: "AGENT", departmentId: "department-a", departmentIds: ["department-a", "department-b", "department-c"] }
    ),
    true
  );
  assert.equal(
    canUserReceiveTargetedNotification(
      { departmentId: "department-d" },
      { id: "supervisor-a", role: "SUPERVISOR", departmentId: "department-a", departmentIds: ["department-a", "department-b"] }
    ),
    false
  );
});

test("global realtime notification context carries membership department ids", () => {
  assert.deepEqual(
    buildRealtimeNotificationUserContext({
      id: "agent-a",
      role: "AGENT",
      departmentId: "department-primary",
      departmentIds: ["department-secult", "department-fundarpe", "department-mapa"],
      departmentName: "Mapa",
    }),
    {
      userId: "agent-a",
      userRole: "AGENT",
      userDepartmentId: "department-primary",
      userDepartmentIds: ["department-secult", "department-fundarpe", "department-mapa"],
      userDepartmentName: "Mapa",
    }
  );
});

test("non-primary memberships are eligible for realtime notification candidates", () => {
  const userContext = buildRealtimeNotificationUserContext({
    id: "agent-maria",
    role: "AGENT",
    departmentId: "department-mapa",
    departmentIds: ["department-secult", "department-fundarpe", "department-mapa"],
    departmentName: "Mapa",
  });

  assert.equal(
    canUserReceiveTargetedNotification(
      { departmentId: "department-secult" },
      {
        id: "agent-maria",
        role: "AGENT",
        departmentId: "department-mapa",
        departmentIds: ["department-secult", "department-fundarpe", "department-mapa"],
      }
    ),
    true
  );

  assert.equal(
    handleRealtimeNotificationCandidate({
      source: "websocket",
      kind: "message",
      conversationIdentity: "conversation-secult-message",
      messageId: "message-secult",
      createdAt: "2026-08-21T10:01:00.000Z",
      direction: "INBOUND",
      mode: "HUMAN",
      handoffStatus: "active",
      departmentId: "department-secult",
      ...userContext,
    }),
    true
  );

  assert.equal(
    handleRealtimeNotificationCandidate({
      source: "websocket",
      kind: "handoff",
      conversationIdentity: "conversation-secult-handoff",
      createdAt: "2026-08-21T10:02:00.000Z",
      direction: "INBOUND",
      mode: "HUMAN",
      handoffStatus: "active",
      departmentId: "department-secult",
      ...userContext,
    }),
    true
  );
});

test("backend eligible notification bypasses stale primary-only session membership", () => {
  const accepted = handleRealtimeNotificationCandidate({
    source: "polling",
    kind: "handoff",
    conversationIdentity: "conversation-a",
    createdAt: "2026-08-19T10:00:00.000Z",
    direction: "INBOUND",
    mode: "HUMAN",
    handoffStatus: "active",
    departmentId: "department-b",
    userId: "agent-a",
    userRole: "AGENT",
    userDepartmentId: "department-a",
    userDepartmentIds: ["department-a"],
    backendEligible: true,
  });

  assert.equal(accepted, true);
});

test("active operational inbound notifications remain eligible for sound", () => {
  const accepted = handleRealtimeNotificationCandidate({
    source: "websocket",
    kind: "message",
    conversationIdentity: "conversation-active-operational",
    messageId: "message-active-operational",
    createdAt: "2026-09-04T10:00:00.000Z",
    direction: "INBOUND",
    mode: "HUMAN",
    handoffStatus: "active",
    status: "IN_PROGRESS",
    humanInboxVisible: true,
    assignedUserId: "agent-a",
    userId: "agent-a",
    userRole: "AGENT",
    userDepartmentId: "department-a",
    userDepartmentIds: ["department-a"],
  });

  assert.equal(accepted, true);
});

test("post-close CSAT score replies do not trigger local inbox sound", () => {
  const accepted = handleRealtimeNotificationCandidate({
    source: "websocket",
    kind: "message",
    conversationIdentity: "conversation-csat-score",
    messageId: "message-csat-score",
    createdAt: "2026-09-04T10:01:00.000Z",
    direction: "INBOUND",
    mode: "HUMAN",
    handoffStatus: "none",
    status: "CLOSED",
    humanInboxVisible: false,
    assignedUserId: "agent-a",
    userId: "agent-a",
    userRole: "AGENT",
    userDepartmentId: "department-a",
    userDepartmentIds: ["department-a"],
  });

  assert.equal(accepted, false);
});

test("post-close CSAT optional comment replies do not trigger local inbox sound", () => {
  const accepted = handleRealtimeNotificationCandidate({
    source: "websocket",
    kind: "message",
    conversationIdentity: "conversation-csat-comment",
    messageId: "message-csat-comment",
    createdAt: "2026-09-04T10:02:00.000Z",
    direction: "INBOUND",
    mode: "HUMAN",
    handoffStatus: "none",
    status: "CLOSED",
    humanInboxVisible: false,
    assignedUserId: "agent-a",
    userId: "agent-a",
    userRole: "AGENT",
    userDepartmentId: "department-a",
    userDepartmentIds: ["department-a"],
  });

  assert.equal(accepted, false);
});

test("CSAT and system outbound prompts do not trigger local inbox sound", () => {
  const accepted = handleRealtimeNotificationCandidate({
    source: "websocket",
    kind: "message",
    conversationIdentity: "conversation-csat-prompt",
    messageId: "message-csat-prompt",
    createdAt: "2026-09-04T10:03:00.000Z",
    direction: "OUTBOUND",
    mode: "HUMAN",
    handoffStatus: "none",
    status: "CLOSED",
    humanInboxVisible: false,
    assignedUserId: "agent-a",
    userId: "agent-a",
    userRole: "AGENT",
    userDepartmentId: "department-a",
    userDepartmentIds: ["department-a"],
  });

  assert.equal(accepted, false);
});

test("new service cycle after a closed conversation remains eligible for sound", () => {
  const accepted = handleRealtimeNotificationCandidate({
    source: "websocket",
    kind: "message",
    conversationIdentity: "conversation-new-cycle",
    messageId: "message-new-cycle",
    createdAt: "2026-09-04T10:04:00.000Z",
    direction: "INBOUND",
    mode: "HUMAN",
    handoffStatus: "active",
    status: "WAITING",
    humanInboxVisible: true,
    assignedUserId: "agent-a",
    userId: "agent-a",
    userRole: "AGENT",
    userDepartmentId: "department-a",
    userDepartmentIds: ["department-a"],
  });

  assert.equal(accepted, true);
});

test("an explicit assignment remains visible only to the assigned user", () => {
  assert.equal(
    canUserReceiveTargetedNotification(
      { assignedUserId: "admin-b", departmentId: "department-b" },
      { id: "admin-a", role: "ADMIN", departmentId: "department-a" }
    ),
    false
  );
  assert.equal(
    canUserReceiveTargetedNotification(
      { assignedUserId: "agent-b", departmentId: "department-b" },
      { id: "agent-a", role: "AGENT", departmentId: "department-a", departmentIds: ["department-b"] }
    ),
    false
  );
  assert.equal(
    canUserReceiveTargetedNotification(
      { assignedUserId: "agent-b", departmentId: "department-c" },
      { id: "agent-b", role: "AGENT", departmentId: "department-a", departmentIds: [] }
    ),
    true
  );
});

test("assignee-only inbox visibility hides assigned conversations from other agents", () => {
  assert.equal(
    canUserSeeConversationInInboxByPolicy(
      { assignedUserId: "agent-b", departmentId: "department-a", status: "IN_PROGRESS" },
      { id: "agent-a", role: "AGENT", departmentId: "department-a", departmentIds: ["department-a"] },
      "assignee_only_after_assignment"
    ),
    false
  );
  assert.equal(
    canUserSeeConversationInInboxByPolicy(
      { assignedUserId: "agent-b", departmentId: "department-a", status: "IN_PROGRESS" },
      { id: "agent-b", role: "AGENT", departmentId: "department-b", departmentIds: [] },
      "assignee_only_after_assignment"
    ),
    true
  );
});

test("assignee-only inbox visibility keeps unassigned queue entries shared", () => {
  assert.equal(
    canUserSeeConversationInInboxByPolicy(
      { assignedUserId: null, departmentId: "department-a", status: "WAITING" },
      { id: "agent-a", role: "AGENT", departmentId: "department-b", departmentIds: ["department-a"] },
      "assignee_only_after_assignment"
    ),
    true
  );
});

test("shared inbox visibility preserves department-scoped visibility for assigned conversations", () => {
  assert.equal(
    canUserSeeConversationInInboxByPolicy(
      { assignedUserId: "agent-b", departmentId: "department-a", status: "IN_PROGRESS" },
      { id: "agent-a", role: "AGENT", departmentId: "department-a", departmentIds: ["department-a"] },
      "shared"
    ),
    true
  );
});
