#!/usr/bin/env bash
set -euo pipefail

WAID=""
WAID_OPEN=""
RANGE="1h"
PORT="${PORT:-3001}"
REPEAT=1
E2E_RUN_POLICYB="${E2E_RUN_POLICYB:-false}"
POLL_TRIES_DEFAULT="${POLL_TRIES_DEFAULT:-20}"
POLL_SLEEP_DEFAULT="${POLL_SLEEP_DEFAULT:-1}"
ATT_LIMIT="${ATT_LIMIT:-200}"
ATT_RETRIES="${ATT_RETRIES:-12}"
ATT_SLEEP_S="${ATT_SLEEP_S:-5}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --range)
      RANGE="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --waid)
      WAID="$2"
      shift 2
      ;;
    --waid-open)
      WAID_OPEN="$2"
      shift 2
      ;;
    --repeat)
      REPEAT="$2"
      shift 2
      ;;
    *)
      if [[ -z "$WAID" ]]; then
        WAID="$1"
        shift 1
      else
        echo "Uso: $0 <waId> [--waid-open <waId>] [--range 1h|24h|7d|30d] [--port 3001] [--repeat N]" >&2
        exit 2
      fi
      ;;
  esac
done

if [[ -z "$WAID" ]]; then
  echo "Uso: $0 <waId> [--waid-open <waId>] [--range 1h|24h|7d|30d] [--port 3001] [--repeat N]" >&2
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: .env não encontrado em ${ENV_FILE}" >&2
  exit 1
fi

ADMIN_TOKEN="${ADMIN_TOKEN:-$(grep -E '^ADMIN_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '\r\"' | xargs || true)}"
META_APP_SECRET="${META_APP_SECRET:-$(grep -E '^META_APP_SECRET=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '\r\"' | xargs || true)}"
PHONE_NUMBER_ID="${PHONE_NUMBER_ID:-$(grep -E '^WHATSAPP_PHONE_NUMBER_ID=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '\r\"' | xargs || true)}"
HANDOFF_ENABLED="${HANDOFF_ENABLED:-$(grep -E '^HANDOFF_ENABLED=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '\r\"' | xargs || true)}"
HANDOFF_ATTENDANT_WAID="${HANDOFF_ATTENDANT_WAID:-$(grep -E '^HANDOFF_ATTENDANT_WAID=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '\r\"' | xargs || true)}"
HANDOFF_NOTIFY_TEMPLATE_NAME="${HANDOFF_NOTIFY_TEMPLATE_NAME:-$(grep -E '^HANDOFF_NOTIFY_TEMPLATE_NAME=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '\r\"' | xargs || true)}"
HANDOFF_TEMPLATE_NAME="${HANDOFF_TEMPLATE_NAME:-$(grep -E '^HANDOFF_TEMPLATE_NAME=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '\r\"' | xargs || true)}"

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "FAIL: ADMIN_TOKEN ausente no .env" >&2
  exit 1
fi
if [[ -z "$PHONE_NUMBER_ID" ]]; then
  echo "FAIL: WHATSAPP_PHONE_NUMBER_ID ausente no .env" >&2
  exit 1
fi
if [[ -z "${ADMIN_TOKEN:-}" ]]; then
  echo "FATAL: ADMIN_TOKEN vazio" >&2
  exit 2
fi
if [[ "${HANDOFF_ENABLED:-}" == "true" && -z "${HANDOFF_ATTENDANT_WAID:-}" ]]; then
  echo "FATAL: HANDOFF_ATTENDANT_WAID vazio" >&2
  exit 2
fi

"${ROOT_DIR}/scripts/wait-for-http.sh" "${BASE_URL}/health"

log_step() {
  echo "== $1 =="
}

redact_token() {
  if [[ -n "${1:-}" ]]; then
    echo "***REDACTED***"
  else
    echo ""
  fi
}

fail() {
  echo "FAIL: $1" >&2
  return 1
}

print_attendant_tail() {
  local file="$1"
  node -e '
    const fs=require("fs");
    const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    const items=(data.items||[]).slice(0,10).map((m)=>({
      createdAt:m.createdAt,
      direction:m.direction,
      type:m.type,
      status:m.status,
      templateName:m.templateName,
      messageId:m.messageId
    }));
    console.error(JSON.stringify(items,null,2));
  ' "$file" 2>/dev/null || true
}

print_attendant_headtail() {
  local file="$1"
  node -e '
    const fs=require("fs");
    const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    const items=(data.items||[]).map((m)=>({
      createdAt:m.createdAt,
      direction:m.direction,
      type:m.type,
      status:m.status,
      templateName:m.templateName,
      requestId:m.requestId,
      messageId:m.messageId
    }));
    const head=items.slice(0,5);
    const tail=items.slice(-5);
    console.error(JSON.stringify({head,tail},null,2));
  ' "$file" 2>/dev/null || true
}

print_events_summary() {
  local file="$1"
  local rid="$2"
  node -e '
    const fs=require("fs");
    const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    const rid=String(process.argv[2]||"");
    const byRid=(Array.isArray(data)?data:[]).filter((i)=>String(i.messageId||"").includes(rid));
    const openId="wamid.e2e.demo.open."+rid;
    const scheduleId="wamid.e2e.demo.schedule."+rid;
    const openCount=byRid.filter((i)=>String(i.messageId||"")===openId).length;
    const scheduleCount=byRid.filter((i)=>String(i.messageId||"")===scheduleId).length;
    console.error(JSON.stringify({openCount,scheduleCount,totalByRid:byRid.length},null,2));
    console.error(JSON.stringify(byRid.slice(0,10),null,2));
  ' "$file" "$rid" 2>/dev/null || true
}

poll_until() {
  local desc="$1"
  local attempts="${2:-$POLL_TRIES_DEFAULT}"
  local sleep_sec="${3:-$POLL_SLEEP_DEFAULT}"
  shift 3 || true
  local i
  for i in $(seq 1 "$attempts"); do
    if "$@"; then
      return 0
    fi
    sleep "$sleep_sec"
  done
  fail "$desc"
}

post_webhook() {
  local payload="$1"
  if [[ -n "${META_APP_SECRET:-}" ]]; then
    local signature
    signature=$(printf "%s" "$payload" | META_APP_SECRET="$META_APP_SECRET" node -e "const crypto=require('crypto');const fs=require('fs');const secret=process.env.META_APP_SECRET;const body=fs.readFileSync(0);process.stdout.write('sha256='+crypto.createHmac('sha256',secret).update(body).digest('hex'));" )
    curl -s -i -H "Content-Type: application/json" -H "X-Hub-Signature-256: ${signature}" \
      -d "$payload" "${BASE_URL}/webhook" >/dev/null
  else
    curl -s -i -H "Content-Type: application/json" -d "$payload" "${BASE_URL}/webhook" >/dev/null
  fi
}

run_once() {
  local RID
  local RUN_ID
  local START_EPOCH
  local START_EPOCH_MS
  local SINCE_EPOCH
  local SINCE_EPOCH_MS
  local DEMO_REQUESTED
  local DEMO_SCHEDULED
  local EXPECTED_TEMPLATE_NAME
  RUN_ID="${RUN_ID:-$(date +%s)$RANDOM}"
  RID="${RID:-$RUN_ID}"
  START_EPOCH="$(date +%s)"
  START_EPOCH_MS=$((START_EPOCH * 1000))
  SINCE_EPOCH="$START_EPOCH"
  SINCE_EPOCH_MS=$((SINCE_EPOCH * 1000))
  EXPECTED_TEMPLATE_NAME="${HANDOFF_NOTIFY_TEMPLATE_NAME:-${HANDOFF_TEMPLATE_NAME:-}}"
  if [[ -z "$EXPECTED_TEMPLATE_NAME" ]]; then
    echo "FAIL: HANDOFF_TEMPLATE_NAME/HANDOFF_NOTIFY_TEMPLATE_NAME ausente no .env" >&2
    return 1
  fi
  echo "runId=${RUN_ID} rid=${RID}"
  echo "BASE_URL=${BASE_URL} RANGE=${RANGE} HANDOFF_ENABLED=${HANDOFF_ENABLED} HANDOFF_ATTENDANT_WAID=${HANDOFF_ATTENDANT_WAID} EXPECTED_TEMPLATE_NAME=${EXPECTED_TEMPLATE_NAME}"
  echo "ADMIN_TOKEN=$(redact_token "${ADMIN_TOKEN}")"

  log_step "A: reset e2e state"
  if ! node "${ROOT_DIR}/scripts/reset-e2e-state.mjs" \
    --lead "${WAID}" \
    --attendant "${HANDOFF_ATTENDANT_WAID}" \
    --events; then
    return 1
  fi

  if [[ "${E2E_RUN_POLICYB}" == "true" ]]; then
    log_step "A2: Policy B (template)"
    if [[ -x "${ROOT_DIR}/scripts/outbound-policyB-prod-check-wrapper.sh" ]]; then
      if ! RID="$RID" "${ROOT_DIR}/scripts/outbound-policyB-prod-check-wrapper.sh" --to "$WAID" --intent pricing --range "$RANGE"; then
        echo "WARN: wrapper de Policy B falhou; seguindo com validação por evidência" >&2
      fi
    fi
  else
    log_step "A2: Policy B (skip)"
  fi

  log_step "B: demo scheduled (janela fechada)"
  NOW_TS=$(date +%s)
  payload_open=$(cat <<JSON
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "${RID}",
      "changes": [
        {
          "value": {
            "metadata": { "phone_number_id": "${PHONE_NUMBER_ID}" },
            "messages": [
              {
                "id": "wamid.e2e.demo.open.${RID}",
                "from": "${WAID}",
                "timestamp": "${NOW_TS}",
                "type": "text",
                "text": { "body": "Quero uma demonstração" }
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
JSON
)
  post_webhook "$payload_open"

  NEXT_TS=$((NOW_TS + 5))
  payload_demo=$(cat <<JSON
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "${RID}",
      "changes": [
        {
          "value": {
            "metadata": { "phone_number_id": "${PHONE_NUMBER_ID}" },
            "messages": [
              {
                "id": "wamid.e2e.demo.schedule.${RID}",
                "from": "${WAID}",
                "timestamp": "${NEXT_TS}",
                "type": "text",
                "text": { "body": "terça 14h" }
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
JSON
)
  post_webhook "$payload_demo"

  log_step "C: validar template no atendente (janela fechada)"
  if [[ "${HANDOFF_ENABLED:-false}" == "true" && -n "${HANDOFF_ATTENDANT_WAID:-}" ]]; then
    ATT_FILE="/tmp/re7-whatsapp-agent-admin-demo-attendant-${RID}.json"
    check_attendant_closed() {
      curl -s "${BASE_URL}/admin/messages?waId=${HANDOFF_ATTENDANT_WAID}&limit=${ATT_LIMIT}&order=desc&type=TEMPLATE&status=SENT&templateName=${EXPECTED_TEMPLATE_NAME}" \
        -H "X-Admin-Token: ${ADMIN_TOKEN}" > "$ATT_FILE"
      if ! grep -q '"ok":true' "$ATT_FILE"; then
        return 1
      fi
      if ! node -e '
        const fs=require("fs");
        const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
        const startMs=Number(process.argv[2]||0)||0;
        const expected=String(process.argv[3]||"");
        const items=(j && (j.items||[]))||[];
        if(!Array.isArray(items)) process.exit(2);
        const hit=items.some((m)=>{
          const dir=String(m.direction||"");
          if (dir === "INBOUND") return false;
          if (dir && dir !== "OUTBOUND") return false;
          const tpl=String(m.templateName||"");
          if(tpl!==expected) return false;
          const type=String(m.type||"");
          if(type && type !== "TEMPLATE") return false;
          const status=String(m.status||"");
          if(status && status !== "SENT") return false;
          const ts=Date.parse(m.createdAt||"");
          if(startMs && Number.isFinite(ts) && ts<startMs) return false;
          return true;
        });
        process.exit(hit?0:2);
      ' "$ATT_FILE" "$SINCE_EPOCH_MS" "$EXPECTED_TEMPLATE_NAME"; then
        return 1
      fi
      return 0
    }
    if ! poll_until "template do atendente não encontrado (janela fechada)" "$ATT_RETRIES" "$ATT_SLEEP_S" check_attendant_closed; then
      echo "expectedTemplateName=${EXPECTED_TEMPLATE_NAME}" >&2
      echo "filters=type:TEMPLATE status:SENT order:desc limit:${ATT_LIMIT}" >&2
      echo "ATT_FILE=${ATT_FILE}" >&2
      print_attendant_headtail "$ATT_FILE"
      print_attendant_tail "$ATT_FILE"
      tail -c 2000 "$ATT_FILE" || true
      return 1
    fi
  fi

  log_step "D: validar via admin"
  METRICS_FILE="/tmp/re7-whatsapp-agent-admin-demo-metrics-${RID}.json"
  check_metrics() {
    curl -s "${BASE_URL}/admin/metrics?range=${RANGE}" \
      -H "X-Admin-Token: ${ADMIN_TOKEN}" > "$METRICS_FILE"
    if ! grep -q '"ok":true' "$METRICS_FILE"; then
      return 1
    fi
    read -r DEMO_REQUESTED DEMO_SCHEDULED < <(
      node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const lead=data.lead||{};process.stdout.write(String(lead.demo_requested??0)+' '+String(lead.demo_scheduled??0));" "$METRICS_FILE"
    )
    if [[ "$DEMO_REQUESTED" -lt 1 ]]; then
      return 1
    fi
    if [[ "$DEMO_SCHEDULED" -lt 1 ]]; then
      return 1
    fi
    return 0
  }
  if ! poll_until "métricas de demo não atingiram o mínimo" "$POLL_TRIES_DEFAULT" "$POLL_SLEEP_DEFAULT" check_metrics; then
    head -c 2000 "$METRICS_FILE" || true
    return 1
  fi

  log_step "E: validar eventos por RID (.data/whatsapp-events.json)"
  EVENTS_FILE="${ROOT_DIR}/.data/whatsapp-events.json"
  check_events_rid() {
    if [[ ! -f "$EVENTS_FILE" ]]; then
      return 1
    fi
    if ! node -e '
      const fs=require("fs");
      const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
      const rid=String(process.argv[2]||"");
      const attendant=String(process.argv[3]||"");
      if(!Array.isArray(data)) process.exit(2);
      const byRid=data.filter((i)=>String(i.messageId||"").includes(rid));
      const openId="wamid.e2e.demo.open."+rid;
      const scheduleId="wamid.e2e.demo.schedule."+rid;
      const openCount=byRid.filter((i)=>String(i.messageId||"")===openId && (i.status==="received" || i.status==="replied")).length;
      const scheduleCount=byRid.filter((i)=>String(i.messageId||"")===scheduleId && i.status==="received").length;
      if(openCount!==1 || scheduleCount!==1) process.exit(2);
      const inboundAttendant=byRid.filter((i)=>{
        const dir=String(i.direction||"");
        if (dir) return dir === "INBOUND" && String(i.from || "") === attendant;
        return false;
      }).length;
      if(inboundAttendant>0) process.exit(2);
      process.exit(0);
    ' "$EVENTS_FILE" "$RID" "$HANDOFF_ATTENDANT_WAID"; then
      return 1
    fi
    return 0
  }
  if ! poll_until "eventos demo (requested/scheduled) por RID ausentes ou inválidos" "$POLL_TRIES_DEFAULT" "$POLL_SLEEP_DEFAULT" check_events_rid; then
    echo "EVENTS_FILE=${EVENTS_FILE}" >&2
    print_events_summary "$EVENTS_FILE" "$RID"
    tail -c 2000 "$EVENTS_FILE" || true
    return 1
  fi

  LEAD_FILE="/tmp/re7-whatsapp-agent-admin-demo-lead-${RID}.json"
  check_lead_followup() {
    curl -s "${BASE_URL}/admin/messages?waId=${WAID}&limit=120" \
      -H "X-Admin-Token: ${ADMIN_TOKEN}" > "$LEAD_FILE"
    if ! grep -q '"ok":true' "$LEAD_FILE"; then
      return 1
    fi
    if ! node -e "
    const fs=require('fs');
    const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
    const items=data.items||[];
    const rid=process.argv[2];
    const startEpoch=Number(process.argv[3]||0)*1000;
    const scheduleItem=items.find((i)=>String(i.messageId||'').includes('schedule.'+rid)&&i.direction==='INBOUND');
    if(!scheduleItem) process.exit(2);
    const scheduleTs=Date.parse(scheduleItem.createdAt||'');
    if(!Number.isFinite(scheduleTs)) process.exit(2);
    const re=/(Qual (solu[cç][aã]o|produto|servi[cç]o)|Para qual (produto|servi[cç]o)|qual produto ou servi[cç]o)/i;
    const hit=items.some((i)=>i.direction==='OUTBOUND' && re.test(String(i.bodyText||'')) && (!startEpoch || Date.parse(i.createdAt||'')>=startEpoch) && (Date.parse(i.createdAt||'')>scheduleTs));
    if(hit){process.exit(2);}
    " "$LEAD_FILE" "$RID" "$START_EPOCH"; then
      return 1
    fi
    return 0
  }
  if ! poll_until "encontrou pergunta de solução/produto após agendamento" "$POLL_TRIES_DEFAULT" "$POLL_SLEEP_DEFAULT" check_lead_followup; then
    tail -c 2000 "$LEAD_FILE" || true
    return 1
  fi

  if [[ "${HANDOFF_ENABLED:-false}" == "true" && -n "${HANDOFF_ATTENDANT_WAID:-}" ]]; then
    ATT_FILE="/tmp/re7-whatsapp-agent-admin-demo-attendant-${RID}.json"
    check_attendant_closed() {
      curl -s "${BASE_URL}/admin/messages?waId=${HANDOFF_ATTENDANT_WAID}&limit=${ATT_LIMIT}&order=desc&type=TEMPLATE&status=SENT&templateName=${EXPECTED_TEMPLATE_NAME}" \
        -H "X-Admin-Token: ${ADMIN_TOKEN}" > "$ATT_FILE"
      if ! grep -q '"ok":true' "$ATT_FILE"; then
        return 1
      fi
      if ! node -e '
        const fs=require("fs");
        const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
        const startMs=Number(process.argv[2]||0)||0;
        const expected=String(process.argv[3]||"");
        const items=(j && (j.items||[]))||[];
        if(!Array.isArray(items)) process.exit(2);
        const hit=items.some((m)=>{
          const tpl=String(m.templateName||"");
          if(tpl!==expected) return false;
          const dir=String(m.direction||"");
          if(dir==="INBOUND") return false;
          if(dir && dir!=="OUTBOUND") return false;
          const type=String(m.type||"");
          if(type && type !== "TEMPLATE") return false;
          const status=String(m.status||"");
          if(status && status !== "SENT") return false;
          const ts=Date.parse(m.createdAt||"");
          if(startMs && Number.isFinite(ts) && ts<startMs) return false;
          return true;
        });
        process.exit(hit?0:2);
      ' "$ATT_FILE" "$SINCE_EPOCH_MS" "$EXPECTED_TEMPLATE_NAME"; then
        return 1
      fi
      return 0
    }
    if ! poll_until "template do atendente não encontrado (janela fechada)" "$ATT_RETRIES" "$ATT_SLEEP_S" check_attendant_closed; then
      echo "expectedTemplateName=${EXPECTED_TEMPLATE_NAME}" >&2
      echo "filters=type:TEMPLATE status:SENT order:desc limit:${ATT_LIMIT}" >&2
      echo "ATT_FILE=${ATT_FILE}" >&2
      print_attendant_headtail "$ATT_FILE"
      tail -c 2000 "$ATT_FILE" || true
      return 1
    fi
  fi

  echo "Counters: demoRequested=${DEMO_REQUESTED} demoScheduled=${DEMO_SCHEDULED}"
  echo "E2E OK waId=${WAID} rid=${RID}"
  return 0
}

failures=0
for run in $(seq 1 "$REPEAT"); do
  echo "== RUN ${run}/${REPEAT} =="
  if run_once; then
    echo "RUN ${run} OK"
  else
    echo "RUN ${run} FAIL" >&2
    failures=$((failures + 1))
  fi
done

if [[ "$failures" -gt 0 ]]; then
  echo "E2E FAIL (runs failed: ${failures}/${REPEAT})" >&2
  exit 1
fi

echo "E2E PASSED (${REPEAT}/${REPEAT})"
