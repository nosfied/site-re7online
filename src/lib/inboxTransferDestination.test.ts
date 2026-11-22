import assert from "node:assert/strict";
import test from "node:test";
import { hasExplicitHumanTransferDestination } from "./inboxTransferDestination";

test("human transfer requires an explicit department destination", () => {
  assert.equal(hasExplicitHumanTransferDestination({ departmentId: "department-a" }), true);
  assert.equal(hasExplicitHumanTransferDestination({ departmentId: null }), false);
  assert.equal(hasExplicitHumanTransferDestination({ departmentId: "  " }), false);
});
