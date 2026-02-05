#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
npm run build >/dev/null

node --input-type=module <<'NODE'
import { decideOutboundPolicy } from "./dist/conversation/conversation.service.js";
import { parseTemplateCommand, resolveTemplateKey } from "./dist/whatsapp/templateCommand.js";

const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
const state = {
  waId: "5584999049614",
  firstSeenAt: past,
  lastInboundAt: past,
  window: { isOpen: true, expiresAt: past },
  intent: "pricing",
  handoff: { status: "none" },
  answers: {},
};

const decision = decideOutboundPolicy({
  state,
  now: Date.now(),
  isSandbox: false,
  outOfWindowTemplate: "re7_pricing_v1",
  sandboxTemplate: "hello_world",
});

const hasBlocked = decision.action === "block";
const events = decision.events ?? [];
const hasNeedsTemplate = events.some((e) => e.event === "outbound.needs_template");
const hasBlockedEvent = events.some((e) => e.event === "outbound.blocked.window_closed");

const parsed = parseTemplateCommand("#template pricing 5584999049614");
const template = resolveTemplateKey(parsed?.templateKey);

const commandOk =
  parsed?.templateKey === "pricing" &&
  parsed?.targetWaId === "5584999049614" &&
  template?.name === "re7_pricing_v1";

if (hasBlocked && hasNeedsTemplate && hasBlockedEvent && commandOk) {
  console.log("outbound policyB smoke OK");
  process.exit(0);
}

console.error("outbound policyB smoke FAIL");
console.error({ hasBlocked, hasNeedsTemplate, hasBlockedEvent, commandOk });
process.exit(1);
NODE
