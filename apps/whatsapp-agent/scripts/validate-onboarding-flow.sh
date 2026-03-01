#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:3001}"
WAID="${WAID:-${1:-}}"

log() {
  echo "[validate-onboarding] $*"
}

die() {
  log "ERROR: $*"
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing command: $1"
}

load_admin_token() {
  if [[ -n "${ADMIN_TOKEN:-}" ]]; then
    return
  fi
  ADMIN_TOKEN="$(
    rg --no-line-number '^ADMIN_TOKEN=' "${APP_DIR}/.env" | tail -n1 | sed -E 's/^ADMIN_TOKEN=\"?([^\"]+)\"?/\1/'
  )"
  export ADMIN_TOKEN
}

mask_tail() {
  local value="$1"
  echo "${value: -4}"
}

fetch_conversation_raw() {
  local out_file="$1"
  local status
  status="$(
    curl -sS -o "$out_file" -w "%{http_code}" \
      "${BASE_URL}/admin/conversations/${WAID}" \
      -H "X-Admin-Token: ${ADMIN_TOKEN}"
  )"
  echo "$status"
}

print_conversation_state() {
  local tmp status
  tmp="$(mktemp)"
  status="$(fetch_conversation_raw "$tmp")"
  if [[ "$status" == "200" ]]; then
    log "ConversationState:"
    jq '{waId,intent,demoStatus,demoPreferredSchedule,handoff,flow,flowStep,lastInboundAt,lastOutboundAt}' "$tmp"
  elif [[ "$status" == "404" ]]; then
    log "ConversationState: sem conversa (404)"
    cat "$tmp"
    echo
  else
    log "ConversationState: HTTP=$status"
    cat "$tmp"
    echo
  fi
  rm -f "$tmp"
}

reset_conversation() {
  log "Resetando conversa de ${WAID}"
  curl -sS -X POST \
    "${BASE_URL}/admin/conversations/${WAID}/reset" \
    -H "X-Admin-Token: ${ADMIN_TOKEN}"
  echo
}

confirm_reset() {
  local tmp status
  tmp="$(mktemp)"
  status="$(fetch_conversation_raw "$tmp")"
  if [[ "$status" == "404" ]]; then
    log "Reset confirmado: sem conversa (404)"
  elif [[ "$status" == "200" ]]; then
    log "Reset respondeu 200; estado ainda presente:"
    jq '.' "$tmp"
  else
    log "Reset confirmou com HTTP=${status}:"
    cat "$tmp"
    echo
  fi
  rm -f "$tmp"
}

capture_latest_rid() {
  local tail4 rid
  tail4="$(mask_tail "$WAID")"
  rid="$(
    pm2 logs 0 --lines 8000 --nostream 2>/dev/null \
      | rg "\"requestId\":\"[^\"]+\".*(\"from\":\"${WAID}\"|\"waId\":\"\\*\\*\\*${tail4}\"|\"leadWaId\":\"\\*\\*\\*${tail4}\"|\"toResolved\":\"\\*\\*\\*${tail4}\")|(\"from\":\"${WAID}\"|\"waId\":\"\\*\\*\\*${tail4}\"|\"leadWaId\":\"\\*\\*\\*${tail4}\"|\"toResolved\":\"\\*\\*\\*${tail4}\").*\"requestId\":\"[^\"]+\"" \
      | tail -n1 \
      | sed -E 's/.*"requestId":"([^"]+)".*/\1/'
  )"
  if [[ -z "$rid" ]]; then
    die "nao foi possivel capturar requestId para ${WAID}"
  fi
  echo "$rid"
}

print_rid_trace() {
  local rid="$1"
  log "Trilha do requestId=${rid}"
  pm2 logs 0 --lines 8000 --nostream 2>/dev/null \
    | rg -n "$rid" \
    | rg -n "tenant\\.resolved|allowlist\\.check|conversation\\.intent|lead\\.demo_|handoff\\.notify|reply\\.|outbound\\.|failed|error|skipped|blocked"
}

step_prompt() {
  local label="$1"
  local human_text="$2"
  echo
  log "Envie agora no WhatsApp (${WAID}): ${human_text}"
  read -r -p "[validate-onboarding] Pressione ENTER apos enviar (${label})... " _
}

summarize() {
  local tmp status final_trace handoff_template_sent
  tmp="$(mktemp)"
  status="$(fetch_conversation_raw "$tmp")"
  if [[ "$status" == "200" ]]; then
    log "Resumo final:"
    jq '{
      demoStatus: (.demoStatus // "none"),
      demoPreferredSchedule: (.demoPreferredSchedule // null),
      handoffStatus: (.handoff.status // "none")
    }' "$tmp"
  else
    log "Resumo final: sem ConversationState (HTTP=${status})"
    cat "$tmp"
    echo
  fi

  final_trace="$(
    pm2 logs 0 --lines 8000 --nostream 2>/dev/null \
      | rg -n "${LAST_RID:-__none__}" \
      | rg -n "handoff\\.notify\\.template\\.sent|outbound\\.template\\.sent|outbound\\.text\\.sent|handoff\\.notify\\.sent" || true
  )"
  if printf '%s' "$final_trace" | rg -q "handoff\\.notify\\.template\\.sent|outbound\\.template\\.sent"; then
    handoff_template_sent="true"
  else
    handoff_template_sent="false"
  fi
  log "handoffTemplateSent=${handoff_template_sent}"
  if [[ -n "$final_trace" ]]; then
    printf '%s\n' "$final_trace"
  fi
  rm -f "$tmp"
}

main() {
  require_cmd curl
  require_cmd jq
  require_cmd pm2
  require_cmd rg

  [[ -n "$WAID" ]] || die "WAID obrigatorio. Use WAID=558... bash scripts/validate-onboarding-flow.sh"

  cd "$APP_DIR"
  load_admin_token
  [[ -n "${ADMIN_TOKEN:-}" ]] || die "ADMIN_TOKEN vazio"

  log "APP_DIR=${APP_DIR}"
  log "BASE_URL=${BASE_URL}"
  log "WAID=${WAID}"

  reset_conversation
  confirm_reset

  step_prompt "1/3" "oi"
  LAST_RID="$(capture_latest_rid)"
  print_rid_trace "$LAST_RID"
  print_conversation_state

  step_prompt "2/3" "quero uma demo"
  LAST_RID="$(capture_latest_rid)"
  print_rid_trace "$LAST_RID"
  print_conversation_state

  step_prompt "3/3" "terça 15h"
  LAST_RID="$(capture_latest_rid)"
  print_rid_trace "$LAST_RID"
  print_conversation_state

  summarize
}

main "$@"
