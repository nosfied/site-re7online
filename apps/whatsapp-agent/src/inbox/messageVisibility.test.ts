import assert from "node:assert/strict";
import test from "node:test";

import { isManagementOnlyInboxMessage, withInboxMessageVisibility } from "./messageVisibility.js";

test("inbox message visibility uses structured raw payload metadata only", () => {
  const payload = withInboxMessageVisibility({ provider: "web_session" }, "management_only", "satisfaction");

  assert.equal(isManagementOnlyInboxMessage(payload), true);
  assert.equal(isManagementOnlyInboxMessage({ provider: "web_session", bodyText: "Obrigado(a)" }), false);
  assert.equal(isManagementOnlyInboxMessage(null), false);
});
