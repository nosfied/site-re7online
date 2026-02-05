#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
npm run build >/dev/null

REQUEST_ID="smoke-$(date +%s)-$RANDOM"

OUTPUT="$(REQUEST_ID="$REQUEST_ID" node --input-type=module <<NODE
import { decideOutboundPolicy } from "./dist/conversation/conversation.service.js";
import { parseTemplateCommand, resolveTemplateKey } from "./dist/whatsapp/templateCommand.js";

const requestId = process.env.REQUEST_ID ?? "smoke";
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

if (decision.action === "block") {
  console.log(JSON.stringify({ event: "outbound.blocked.window_closed", requestId }));
  console.log(
    JSON.stringify({
      event: "outbound.needs_template",
      requestId,
      suggestedTemplate: decision.templateName,
      language: decision.templateLanguage,
    })
  );
}

const parsed = parseTemplateCommand("#template pricing 5584999049614");
const template = resolveTemplateKey(parsed?.templateKey);
if (
  parsed?.templateKey === "pricing" &&
  parsed?.targetWaId === "5584999049614" &&
  template?.name === "re7_pricing_v1"
) {
  console.log(JSON.stringify({ event: "admin.template.sent", requestId }));
}
NODE
)"

echo "$OUTPUT" | grep -q "\"event\":\"outbound.needs_template\".*\"requestId\":\"$REQUEST_ID\""
echo "$OUTPUT" | grep -q "\"event\":\"outbound.blocked.window_closed\".*\"requestId\":\"$REQUEST_ID\""
echo "$OUTPUT" | grep -q "\"event\":\"admin.template.sent\".*\"requestId\":\"$REQUEST_ID\""
if echo "$OUTPUT" | grep -q "\"event\":\"reply.sending\".*\"requestId\":\"$REQUEST_ID\""; then
  echo "outbound policyB smoke FAIL"
  exit 1
fi

echo "outbound policyB smoke OK"
