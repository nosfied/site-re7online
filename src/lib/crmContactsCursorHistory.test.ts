import assert from "node:assert/strict";
import test from "node:test";
import { acceptCurrentCrmContactsResponse, CrmContactsCursorHistory } from "./crmContactsCursorHistory";
import { createLatestResponseGuard } from "./crmContactsInitialLoad";
import { ScreenProcessingRegistry } from "./screenProcessing";

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

test("failed navigation preserves page, contacts and cursor so the same page can be retried", async () => {
  const history = new CrmContactsCursorHistory();
  const guard = createLatestResponseGuard();
  const overlay = new ScreenProcessingRegistry();
  let page = 1;
  let contacts = ["page-1"];
  history.recordNext(1, "cursor-page-2");

  const navigate = async (load: () => Promise<{ pagination: { page: number }; pageInfo: { nextCursor: string | null }; items: string[] }>) => {
    const requestId = guard.begin();
    const operationId = overlay.begin("Contatos", "Carregando próxima página…");
    try {
      const response = await load();
      return acceptCurrentCrmContactsResponse({
        history,
        requestId,
        isCurrent: guard.isCurrent,
        response,
        commit: (accepted) => {
          page = accepted.pagination.page;
          contacts = accepted.items;
        },
      });
    } finally {
      overlay.end(operationId);
    }
  };

  await assert.rejects(navigate(async () => { throw new Error("timeout"); }), /timeout/);
  assert.equal(page, 1);
  assert.deepEqual(contacts, ["page-1"]);
  assert.equal(history.cursorFor(2), "cursor-page-2");
  assert.equal(history.cursorFor(3), undefined);
  assert.equal(overlay.size, 0);

  assert.equal(await navigate(async () => ({
    pagination: { page: 2 },
    pageInfo: { nextCursor: "cursor-page-3" },
    items: ["page-2"],
  })), true);
  assert.equal(page, 2);
  assert.deepEqual(contacts, ["page-2"]);
  assert.equal(history.cursorFor(3), "cursor-page-3");
  assert.equal(overlay.size, 0);
});

test("obsolete response changes neither visible page, contacts nor cursor history", () => {
  const history = new CrmContactsCursorHistory();
  const guard = createLatestResponseGuard();
  history.recordNext(1, "cursor-page-2");
  let page = 1;
  let contacts = ["page-1"];
  const oldRequest = guard.begin();
  guard.begin();
  const accepted = acceptCurrentCrmContactsResponse({
    history,
    requestId: oldRequest,
    isCurrent: guard.isCurrent,
    response: { pagination: { page: 2 }, pageInfo: { nextCursor: "cursor-page-3" }, items: ["stale"] },
    commit: (response) => {
      page = response.pagination.page;
      contacts = response.items;
    },
  });
  assert.equal(accepted, false);
  assert.equal(page, 1);
  assert.deepEqual(contacts, ["page-1"]);
  assert.equal(history.cursorFor(3), undefined);
});

test("filter page one is consolidated only after an accepted response", () => {
  const history = new CrmContactsCursorHistory();
  const guard = createLatestResponseGuard();
  history.recordNext(1, "old-page-2");
  history.recordNext(2, "old-page-3");
  let page = 2;
  let contacts = ["old-filter"];

  const failedRequest = guard.begin();
  assert.equal(guard.isCurrent(failedRequest), true);
  assert.equal(page, 2);
  assert.deepEqual(contacts, ["old-filter"]);
  assert.equal(history.cursorFor(3), "old-page-3");

  const successfulRequest = guard.begin();
  assert.equal(acceptCurrentCrmContactsResponse({
    history,
    requestId: successfulRequest,
    isCurrent: guard.isCurrent,
    response: { pagination: { page: 1 }, pageInfo: { nextCursor: "new-page-2" }, items: ["new-filter"] },
    commit: (response) => {
      history.reset();
      page = response.pagination.page;
      contacts = response.items;
    },
  }), true);
  assert.equal(page, 1);
  assert.deepEqual(contacts, ["new-filter"]);
  assert.equal(history.cursorFor(2), "new-page-2");
  assert.equal(history.cursorFor(3), undefined);
});
