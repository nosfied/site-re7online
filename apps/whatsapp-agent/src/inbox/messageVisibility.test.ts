import assert from "node:assert/strict";
import test from "node:test";

import {
  isManagementOnlyInboxMessage,
  shouldProjectConversationToHumanInbox,
  shouldUserSeeConversationInInbox,
  withInboxMessageVisibility,
} from "./messageVisibility.js";

test("inbox message visibility uses structured raw payload metadata only", () => {
  const payload = withInboxMessageVisibility({ provider: "web_session" }, "management_only", "satisfaction");

  assert.equal(isManagementOnlyInboxMessage(payload), true);
  assert.equal(isManagementOnlyInboxMessage({ provider: "web_session", bodyText: "Obrigado(a)" }), false);
  assert.equal(isManagementOnlyInboxMessage(null), false);
});

test("human inbox projection requires a real human operational state", () => {
  assert.equal(
    shouldProjectConversationToHumanInbox({
      status: null,
      mode: "BOT",
      handoffStatus: "none",
      departmentId: null,
      queueId: null,
    }),
    false
  );
  assert.equal(
    shouldProjectConversationToHumanInbox({
      status: "CLOSED",
      mode: "BOT",
      handoffStatus: "none",
      departmentId: null,
      queueId: null,
    }),
    false
  );
  assert.equal(
    shouldProjectConversationToHumanInbox({
      status: "WAITING",
      mode: "HUMAN",
      handoffStatus: "active",
      departmentId: "department-1",
      queueId: null,
    }),
    false
  );
  assert.equal(
    shouldProjectConversationToHumanInbox({
      status: "WAITING",
      mode: "HUMAN",
      handoffStatus: "active",
      departmentId: "department-1",
      queueId: "queue-1",
    }),
    true
  );
  assert.equal(
    shouldProjectConversationToHumanInbox({
      status: "WAITING",
      mode: "HUMAN",
      handoffStatus: "none",
      departmentId: "department-1",
      queueId: "queue-1",
    }),
    true
  );
  assert.equal(
    shouldProjectConversationToHumanInbox({
      status: "CLOSED",
      mode: "HUMAN",
      handoffStatus: "none",
      departmentId: "department-1",
      queueId: "queue-1",
      handoffActivatedAt: "2026-08-20T12:00:00.000Z",
    }),
    true
  );
});

test("shared inbox visibility keeps department queue conversations visible to agents", () => {
  assert.equal(
    shouldUserSeeConversationInInbox({
      policy: "shared",
      currentUserId: "agent-a",
      userRole: "AGENT",
      userDepartmentIds: ["department-a"],
      status: "WAITING",
      mode: "HUMAN",
      handoffStatus: "active",
      departmentId: "department-a",
      queueId: "queue-a",
    }),
    true
  );
});

test("assignee-only visibility hides assigned conversations from other agents", () => {
  assert.equal(
    shouldUserSeeConversationInInbox({
      policy: "assignee_only_after_assignment",
      currentUserId: "agent-a",
      userRole: "AGENT",
      userDepartmentIds: ["department-a"],
      status: "IN_PROGRESS",
      mode: "HUMAN",
      handoffStatus: "active",
      departmentId: "department-a",
      queueId: "queue-a",
      assignedUserId: "agent-b",
    }),
    false
  );
  assert.equal(
    shouldUserSeeConversationInInbox({
      policy: "assignee_only_after_assignment",
      currentUserId: "agent-b",
      userRole: "AGENT",
      userDepartmentIds: [],
      status: "IN_PROGRESS",
      mode: "HUMAN",
      handoffStatus: "active",
      departmentId: "department-a",
      queueId: "queue-a",
      assignedUserId: "agent-b",
    }),
    true
  );
});

test("assignee-only visibility keeps unassigned queue entries shared until assignment", () => {
  assert.equal(
    shouldUserSeeConversationInInbox({
      policy: "assignee_only_after_assignment",
      currentUserId: "agent-a",
      userRole: "AGENT",
      userDepartmentIds: ["department-a"],
      status: "WAITING",
      mode: "HUMAN",
      handoffStatus: "active",
      departmentId: "department-a",
      queueId: "queue-a",
      assignedUserId: null,
    }),
    true
  );
});

test("assignee-only visibility keeps closed conversations only for participating agents", () => {
  assert.equal(
    shouldUserSeeConversationInInbox({
      policy: "assignee_only_after_assignment",
      currentUserId: "agent-a",
      userRole: "AGENT",
      userDepartmentIds: ["department-a"],
      status: "CLOSED",
      mode: "HUMAN",
      handoffStatus: "none",
      departmentId: "department-a",
      queueId: "queue-a",
      handoffActivatedAt: "2026-08-23T12:00:00.000Z",
      userParticipated: false,
    }),
    false
  );
  assert.equal(
    shouldUserSeeConversationInInbox({
      policy: "assignee_only_after_assignment",
      currentUserId: "agent-a",
      userRole: "AGENT",
      userDepartmentIds: ["department-a"],
      status: "CLOSED",
      mode: "HUMAN",
      handoffStatus: "none",
      departmentId: "department-a",
      queueId: "queue-a",
      handoffActivatedAt: "2026-08-23T12:00:00.000Z",
      userParticipated: true,
    }),
    true
  );
});

test("supervisor and admin visibility are not narrowed by assignee-only agent policy", () => {
  assert.equal(
    shouldUserSeeConversationInInbox({
      policy: "assignee_only_after_assignment",
      currentUserId: "supervisor-a",
      userRole: "SUPERVISOR",
      userDepartmentIds: ["department-a"],
      status: "IN_PROGRESS",
      mode: "HUMAN",
      handoffStatus: "active",
      departmentId: "department-a",
      queueId: "queue-a",
      assignedUserId: "agent-a",
    }),
    true
  );
  assert.equal(
    shouldUserSeeConversationInInbox({
      policy: "assignee_only_after_assignment",
      currentUserId: "admin-a",
      userRole: "ADMIN",
      status: "IN_PROGRESS",
      mode: "HUMAN",
      handoffStatus: "active",
      departmentId: "department-b",
      queueId: "queue-b",
      assignedUserId: "agent-a",
    }),
    true
  );
});
