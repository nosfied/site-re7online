import test from "node:test";
import assert from "node:assert/strict";
import { buildConversationProtocol } from "./conversationProtocol.js";

test("buildConversationProtocol creates a deterministic public protocol from a conversation id", () => {
  const protocol = buildConversationProtocol({
    id: "123e4567-e89b-12d3-a456-426614174000",
    createdAt: new Date("2026-06-29T12:00:00.000Z"),
  });

  assert.equal(protocol, "CVT-123E4567E89B");
});

test("buildConversationProtocol falls back to a stable timestamp when id is unavailable", () => {
  const createdAt = new Date("2026-06-29T12:00:00.000Z");
  const protocol = buildConversationProtocol({ createdAt });

  assert.equal(protocol, `CVT-${createdAt.getTime().toString(36).toUpperCase()}`);
});
