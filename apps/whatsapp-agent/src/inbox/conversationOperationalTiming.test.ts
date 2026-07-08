import assert from "node:assert/strict";
import test from "node:test";
import { ConversationOperationalStatus } from "@prisma/client";
import { buildConversationOperationalTimingFields } from "./conversationOperationalTiming.js";

test("buildConversationOperationalTimingFields measures first response waiting time", () => {
  const result = buildConversationOperationalTimingFields({
    source: {
      firstResponseAt: null,
      lastInboundAt: "2026-07-08T10:00:00.000Z",
    },
    operational: {
      assignedAt: null,
      closedAt: null,
      status: ConversationOperationalStatus.WAITING,
    },
    now: "2026-07-08T10:05:30.000Z",
  });

  assert.equal(result.waitingFirstResponseSec, 330);
  assert.equal(result.activeDurationSec, null);
});

test("buildConversationOperationalTimingFields does not report waiting time after first response", () => {
  const result = buildConversationOperationalTimingFields({
    source: {
      firstResponseAt: "2026-07-08T10:02:00.000Z",
      lastInboundAt: "2026-07-08T10:00:00.000Z",
    },
    operational: {
      assignedAt: "2026-07-08T10:01:00.000Z",
      closedAt: null,
      status: ConversationOperationalStatus.IN_PROGRESS,
    },
    now: "2026-07-08T10:08:00.000Z",
  });

  assert.equal(result.waitingFirstResponseSec, null);
  assert.equal(result.activeDurationSec, 420);
});

test("buildConversationOperationalTimingFields stops active duration at closedAt", () => {
  const result = buildConversationOperationalTimingFields({
    source: {
      firstResponseAt: "2026-07-08T10:02:00.000Z",
      lastInboundAt: "2026-07-08T10:00:00.000Z",
    },
    operational: {
      assignedAt: "2026-07-08T10:01:00.000Z",
      closedAt: "2026-07-08T10:11:30.000Z",
      status: ConversationOperationalStatus.CLOSED,
    },
    now: "2026-07-08T11:00:00.000Z",
  });

  assert.equal(result.waitingFirstResponseSec, null);
  assert.equal(result.activeDurationSec, 630);
});
