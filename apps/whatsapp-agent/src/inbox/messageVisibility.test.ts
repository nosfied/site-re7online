import assert from "node:assert/strict";
import test from "node:test";

import {
  isManagementOnlyInboxMessage,
  shouldProjectConversationToHumanInbox,
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
