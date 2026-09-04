import assert from "node:assert/strict";
import test from "node:test";
import {
  CONVERSATION_FILTER_BY_VALUE,
  MORE_CONVERSATION_FILTERS,
  PRIMARY_CONVERSATION_FILTERS,
} from "./inboxConversationFilters";

test("desktop primary inbox filters keep Minhas immediately after Todas", () => {
  assert.deepEqual(PRIMARY_CONVERSATION_FILTERS.slice(0, 2), ["ALL", "MINE"]);
  assert.equal(CONVERSATION_FILTER_BY_VALUE.get("ALL")?.label, "Todas");
  assert.equal(CONVERSATION_FILTER_BY_VALUE.get("MINE")?.label, "Minhas");
  assert.equal(MORE_CONVERSATION_FILTERS.some((filter) => filter.value === "MINE"), false);
});

test("remaining primary inbox filters preserve their relative order", () => {
  assert.deepEqual(PRIMARY_CONVERSATION_FILTERS.slice(2), ["WAITING", "AUTOMATION"]);
});

test("more inbox filters keep non-primary filters available", () => {
  assert.deepEqual(
    MORE_CONVERSATION_FILTERS.map((filter) => filter.value),
    ["IN_PROGRESS", "WAITING_USER", "CLOSED", "UNASSIGNED"]
  );
});
