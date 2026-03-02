import assert from "node:assert/strict";
import { updateInbound, updateOutbound } from "../src/conversation/conversation.service.js";
import { ConversationState } from "../src/conversation/conversation.types.js";

const baseState: ConversationState = {
  clientKey: "tenant-a",
  waId: "558494786787",
  firstSeenAt: "2026-03-01T12:00:00.000Z",
  lastInboundAt: "2026-03-01T12:00:00.000Z",
  window: {
    isOpen: true,
    expiresAt: "2026-03-02T12:00:00.000Z",
  },
  intent: "unknown",
  handoff: { status: "none" },
  answers: {},
};

const afterInbound = updateInbound(
  baseState,
  "wamid.test.inbound",
  "2026-03-01T12:00:00.000Z",
  "oi"
);
const afterOutbound = updateOutbound(
  afterInbound,
  "wamid.test.outbound",
  "2026-03-01T12:00:01.000Z"
);

assert.ok(afterOutbound.lastInboundAt, "lastInboundAt should be set after inbound");
assert.ok(afterOutbound.lastOutboundAt, "lastOutboundAt should be set after outbound");
assert.ok(
  Date.parse(afterOutbound.lastOutboundAt) >= Date.parse(afterOutbound.lastInboundAt),
  "lastOutboundAt must be greater than or equal to lastInboundAt"
);

console.log("ok");
