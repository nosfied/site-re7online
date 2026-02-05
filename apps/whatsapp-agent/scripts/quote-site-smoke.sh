#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
npm run build >/dev/null

node --input-type=module <<'NODE'
import { advanceQuoteSiteFlow, updateInbound } from "./dist/conversation/conversation.service.js";

let state = {
  waId: "5584999049614",
  firstSeenAt: new Date().toISOString(),
  lastInboundAt: new Date().toISOString(),
  window: { isOpen: true, expiresAt: new Date(Date.now() + 86400000).toISOString() },
  intent: "unknown",
  handoff: { status: "none" },
  answers: {},
};

const inputs = [
  "quero um orçamento de site",
  "tenho um escritório de contabilidade",
  "institucional",
  "até 5",
  "whatsapp e formulário",
  "já tenho logo e cores",
  "em 30 dias",
];

let finalReply = "";
for (const [index, input] of inputs.entries()) {
  state = updateInbound(state, `m${index + 1}`, new Date().toISOString(), input);
  const result = advanceQuoteSiteFlow(state, input);
  state = result.state;
  if (result.replyText) {
    finalReply = result.replyText;
  }
}

const checks = [
  finalReply.includes("Resumo do briefing"),
  finalReply.includes("Essencial:"),
  finalReply.includes("Profissional:"),
  finalReply.includes("Premium:"),
  finalReply.includes("Qual seu e-mail"),
];

if (checks.every(Boolean)) {
  console.log("quote-site smoke OK");
  process.exit(0);
}

console.error("quote-site smoke FAIL");
console.error(finalReply);
process.exit(1);
NODE
