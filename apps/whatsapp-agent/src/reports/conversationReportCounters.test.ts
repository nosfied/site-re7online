import test from "node:test";
import assert from "node:assert/strict";
import {
  getHumanTransferReportCount,
  isAutomatedConversationReportState,
} from "./conversationReportCounters.js";

test("isAutomatedConversationReportState identifies bot-only conversations waiting for human handoff", () => {
  assert.equal(
    isAutomatedConversationReportState({
      mode: "BOT",
      assignedUserId: null,
      assignedUserIds: [],
      status: "WAITING",
    }),
    true
  );

  assert.equal(
    isAutomatedConversationReportState({
      mode: "BOT",
      assignedUserId: null,
      assignedUserIds: [],
      status: null,
    }),
    true
  );
});

test("isAutomatedConversationReportState rejects conversations already assigned to humans", () => {
  assert.equal(
    isAutomatedConversationReportState({
      mode: "BOT",
      assignedUserId: "user-1",
      assignedUserIds: ["user-1"],
      status: "ASSIGNED",
    }),
    false
  );
});

test("getHumanTransferReportCount returns only valid positive assignment counts", () => {
  assert.equal(getHumanTransferReportCount({ assignmentCount: 3.8 }), 3);
  assert.equal(getHumanTransferReportCount({ assignmentCount: 0 }), 0);
  assert.equal(getHumanTransferReportCount({ assignmentCount: -1 }), 0);
  assert.equal(getHumanTransferReportCount({ assignmentCount: Number.NaN }), 0);
  assert.equal(getHumanTransferReportCount(undefined), 0);
});
