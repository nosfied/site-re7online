import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_NEW_CHATBOT_FLOW_ENTRY_POINT } from "./chatbotFlowCreationDefaults";

test("new chatbot flows do not become entrypoint by default", () => {
  assert.equal(DEFAULT_NEW_CHATBOT_FLOW_ENTRY_POINT, false);
});
