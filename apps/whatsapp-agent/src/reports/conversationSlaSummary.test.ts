import test from "node:test";
import assert from "node:assert/strict";
import { buildConversationSlaOperationalSummary } from "./conversationSlaSummary.js";

test("buildConversationSlaOperationalSummary counts operational statuses and averages SLA times", () => {
  const summary = buildConversationSlaOperationalSummary(
    [
      { firstResponseTimeSec: 30, resolutionTimeSec: 120 },
      { firstResponseTimeSec: 90, resolutionTimeSec: 300 },
      { firstResponseTimeSec: null, resolutionTimeSec: null },
    ],
    [
      { status: "WAITING" },
      { status: "WAITING" },
      { status: "IN_PROGRESS" },
      { status: "WAITING_USER" },
      { status: "CLOSED" },
      { status: null },
    ]
  );

  assert.deepEqual(summary, {
    waitingFirstResponse: 2,
    inProgress: 1,
    waitingUser: 1,
    closed: 1,
    avgFirstResponseTimeSec: 60,
    avgResolutionTimeSec: 210,
  });
});

test("buildConversationSlaOperationalSummary returns null averages without measured values", () => {
  const summary = buildConversationSlaOperationalSummary(
    [{ firstResponseTimeSec: null, resolutionTimeSec: null }],
    [{ status: "WAITING" }]
  );

  assert.equal(summary.avgFirstResponseTimeSec, null);
  assert.equal(summary.avgResolutionTimeSec, null);
  assert.equal(summary.waitingFirstResponse, 1);
});
