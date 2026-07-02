import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPreviousClosedMonthPeriod,
  parseConversationReportPeriod,
  parseConversationReportRange,
} from "./conversationReportPeriod.js";

test("buildPreviousClosedMonthPeriod returns the previous calendar month in UTC", () => {
  const period = buildPreviousClosedMonthPeriod(new Date("2026-07-15T12:00:00.000Z"));

  assert.equal(period.key, "month");
  assert.equal(period.since.toISOString(), "2026-06-01T00:00:00.000Z");
  assert.equal(period.until.toISOString(), "2026-06-30T23:59:59.999Z");
});

test("parseConversationReportRange supports the monthly contractual range", () => {
  const period = parseConversationReportRange("month", new Date("2026-01-05T03:00:00.000Z"));

  assert.ok(period);
  assert.equal(period.key, "month");
  assert.equal(period.since.toISOString(), "2025-12-01T00:00:00.000Z");
  assert.equal(period.until?.toISOString(), "2025-12-31T23:59:59.999Z");
});

test("parseConversationReportPeriod keeps custom period validation", () => {
  assert.equal(
    parseConversationReportPeriod({
      from: "2026-07-02T10:00:00.000Z",
      to: "2026-07-01T10:00:00.000Z",
    }),
    null
  );

  const period = parseConversationReportPeriod({
    from: "2026-07-01T10:00:00.000Z",
    to: "2026-07-02T10:00:00.000Z",
  });

  assert.ok(period);
  assert.equal(period.key, "custom");
  assert.equal(period.since.toISOString(), "2026-07-01T10:00:00.000Z");
  assert.equal(period.until?.toISOString(), "2026-07-02T10:00:00.000Z");
});
