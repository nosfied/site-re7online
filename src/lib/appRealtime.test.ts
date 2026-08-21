import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRealtimeNotificationUserContext,
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
