#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
npm run build >/dev/null

node --input-type=module <<'NODE'
import {
  handleHandoff,
  applyAdminCommand,
  shouldAutoReply,
} from "./dist/conversation/conversation.service.js";

const nowIso = new Date().toISOString();

const baseState = {
  waId: "5584999049614",
  firstSeenAt: nowIso,
  lastInboundAt: nowIso,
  window: { isOpen: true, expiresAt: new Date(Date.now() + 86400000).toISOString() },
  intent: "unknown",
  handoff: { status: "none" },
  answers: {},
};

const detect = handleHandoff(baseState, "quero falar com atendente", nowIso);
const pendingOk =
  detect.handled &&
  detect.outcome === "requested" &&
  detect.state.handoff.status === "pending" &&
  detect.replyText?.includes("Posso transferir");

const pendingInvalid = handleHandoff(detect.state, "talvez", nowIso);
const pendingInvalidOk =
  pendingInvalid.handled &&
  pendingInvalid.outcome === "requested" &&
  pendingInvalid.state.handoff.status === "pending" &&
  pendingInvalid.replyText?.includes("Responda apenas SIM ou NÃO");

const accepted = handleHandoff(detect.state, "SIM", nowIso);
const acceptedOk =
  accepted.handled &&
  accepted.outcome === "accepted" &&
  accepted.state.handoff.status === "active";

const activeAutoReply = !shouldAutoReply(accepted.state);

const pausedByAdmin = applyAdminCommand(baseState, "#bot off");
const pausedOk =
  pausedByAdmin.handled &&
  pausedByAdmin.action === "pause" &&
  pausedByAdmin.state.handoff.status === "active";

const resumedByAdmin = applyAdminCommand(accepted.state, "#bot on");
const resumedOk =
  resumedByAdmin.handled &&
  resumedByAdmin.action === "resume" &&
  resumedByAdmin.state.handoff.status === "none";

if (
  pendingOk &&
  pendingInvalidOk &&
  acceptedOk &&
  activeAutoReply &&
  pausedOk &&
  resumedOk
) {
  console.log("handoff smoke OK");
  process.exit(0);
}

console.error("handoff smoke FAIL");
console.error({
  pendingOk,
  pendingInvalidOk,
  acceptedOk,
  activeAutoReply,
  pausedOk,
  resumedOk,
});
process.exit(1);
NODE
