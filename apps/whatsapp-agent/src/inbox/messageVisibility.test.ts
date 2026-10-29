import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  isManagementOnlyInboxMessage,
  shouldIncludeInboxMessageForView,
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

test("management-only messages remain private except in an authorized Automation view", () => {
  const consent = withInboxMessageVisibility({}, "management_only", "consent_prompt");
  assert.equal(shouldIncludeInboxMessageForView(consent, "human"), false);
  assert.equal(shouldIncludeInboxMessageForView(consent, "authorized_automation"), true);
  assert.equal(shouldIncludeInboxMessageForView({}, "human"), true);
});

test("Meta webhook propagates the existing consent classification to both persistence paths", () => {
  const source = readFileSync(new URL("../whatsapp/webhook.controller.ts", import.meta.url), "utf8");
  assert.match(source, /managementInteraction: chatbotResult\.managementInteraction/);
  assert.match(source, /withInboxMessageVisibility\([\s\S]*?"management_only", chatbotFlowResult\.managementInteraction\.inboundKind\)/);
  assert.match(source, /inboxVisibility: chatbotFlowResult\.managementInteraction\?\.outboundKind[\s\S]*?inboxInteractionKind: chatbotFlowResult\.managementInteraction\?\.outboundKind/);
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
