import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConversationProtocol,
  buildConversationProtocolNotice,
  getConversationIdPrefixFromProtocol,
  normalizeConversationProtocol,
} from "./conversationProtocol.js";

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

test("normalizeConversationProtocol accepts CVT and plain protocol input", () => {
  assert.equal(normalizeConversationProtocol("CVT-123e4567e89b"), "CVT-123E4567E89B");
  assert.equal(normalizeConversationProtocol("protocolo 123e4567-e89b"), "CVT-123E4567E89B");
  assert.equal(normalizeConversationProtocol("abc"), null);
});

test("getConversationIdPrefixFromProtocol maps protocol to UUID prefix for tenant-scoped lookup", () => {
  assert.equal(getConversationIdPrefixFromProtocol("CVT-123E4567E89B"), "123e4567-e89b");
  assert.equal(getConversationIdPrefixFromProtocol("CVT-NOTHEXVALUE1"), null);
});

test("buildConversationProtocolNotice returns institutional citizen message", () => {
  assert.equal(
    buildConversationProtocolNotice("CVT-123E4567E89B"),
    "Seu protocolo de atendimento é CVT-123E4567E89B. Guarde este número para acompanhamento."
  );
});
