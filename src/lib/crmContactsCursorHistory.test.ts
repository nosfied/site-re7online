import assert from "node:assert/strict";
import test from "node:test";
import { CrmContactsCursorHistory } from "./crmContactsCursorHistory";

test("cursor history supports safe next/previous navigation and rejects unseen jumps", () => {
  const history = new CrmContactsCursorHistory();
  assert.equal(history.cursorFor(1), null);
  assert.equal(history.canLoad(2), false);
  history.recordNext(1, "cursor-page-2");
  history.recordNext(2, "cursor-page-3");
  assert.equal(history.cursorFor(2), "cursor-page-2");
  assert.equal(history.cursorFor(3), "cursor-page-3");
  assert.equal(history.cursorFor(1), null);
  assert.equal(history.canLoad(4), false);
});

test("filter reset removes every cursor from the previous result set", () => {
  const history = new CrmContactsCursorHistory();
  history.recordNext(1, "cursor-page-2");
  history.reset();
  assert.equal(history.cursorFor(1), null);
  assert.equal(history.canLoad(2), false);
});
