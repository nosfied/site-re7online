#!/usr/bin/env bash
set -euo pipefail

WAID=""
WAID_OPEN=""
RANGE="1h"
PORT="${PORT:-3001}"
REPEAT=1

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
BASE_URL="http://127.0.0.1:${PORT}"
RID="${RID:-}"
RID_OPEN="${RID_OPEN:-}"
START_EPOCH="${START_EPOCH:-}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: .env não encontrado em ${ENV_FILE}" >&2
  exit 1
fi

ADMIN_TOKEN=$(grep -E '^ADMIN_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '\r"' | xargs || true)
META_APP_SECRET=$(grep -E '^META_APP_SECRET=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '\r"' | xargs || true)
PHONE_NUMBER_ID=$(grep -E '^WHATSAPP_PHONE_NUMBER_ID=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '\r"' | xargs || true)
HANDOFF_ENABLED=$(grep -E '^HANDOFF_ENABLED=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '\r"' | xargs || true)
HANDOFF_ATTENDANT_WAID=$(grep -E '^HANDOFF_ATTENDANT_WAID=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '\r"' | xargs || true)

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "FAIL: ADMIN_TOKEN ausente no .env" >&2
  exit 1
fi
if [[ -z "$PHONE_NUMBER_ID" ]]; then
  echo "FAIL: WHATSAPP_PHONE_NUMBER_ID ausente no .env" >&2
  exit 1
fi

"${ROOT_DIR}/scripts/wait-for-http.sh" "${BASE_URL}/health"

log_step() {
  echo "== $1 =="
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

force_attendant_window() {
  local mode="$1"
  local ts
  if [[ "$mode" == "open" ]]; then
    ts=$(date +%s)
  else
    ts=$(date -d '48 hours ago' +%s)
  fi
  local payload
  payload=$(cat <<JSON
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
                "id": "wamid.e2e.demo.attendant.${mode}.${RID}",
                "from": "${HANDOFF_ATTENDANT_WAID}",
                "timestamp": "${ts}",
                "type": "text",
                "text": { "body": "ping ${mode}" }
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
  post_webhook "$payload"
}

count_templates_by_window() {
  local file="$1"
  local template="$2"
  local startEpochMs="$3"
  node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const items=data.items||[];const tmpl=process.argv[2];const start=Number(process.argv[3]||0);const count=items.filter((i)=>i.type==='TEMPLATE'&&i.templateName===tmpl&&i.status==='SENT'&&(Date.parse(i.createdAt||'')>=start)).length;process.stdout.write(String(count));" "$file" "$template" "$startEpochMs"
}

count_text_by_window() {
  local file="$1"
  local startEpochMs="$2"
  node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const items=data.items||[];const start=Number(process.argv[2]||0);const count=items.filter((i)=>i.type==='TEXT'&&i.direction==='OUTBOUND'&&i.status==='SENT'&&(Date.parse(i.createdAt||'')>=start)).length;process.stdout.write(String(count));" "$file" "$startEpochMs"
}

run_once() {
  RID="${RID:-$(date +%s)$RANDOM}"
  RID_OPEN="${RID_OPEN:-$(date +%s)$RANDOM}"
  START_EPOCH="${START_EPOCH:-$(date +%s)}"
  START_EPOCH_MS=$((START_EPOCH * 1000))

  log_step "A: Policy B (template)"
  if [[ -x "${ROOT_DIR}/scripts/outbound-policyB-prod-check-wrapper.sh" ]]; then
    "${ROOT_DIR}/scripts/outbound-policyB-prod-check-wrapper.sh" --to "$WAID" --intent pricing --range "$RANGE"
  fi

  POLICY_FILE="/tmp/re7-whatsapp-agent-admin-demo-policyb-${RID}.json"
  curl -s "${BASE_URL}/admin/messages?waId=${WAID}&limit=80" \
    -H "X-Admin-Token: ${ADMIN_TOKEN}" > "$POLICY_FILE"
  if ! grep -q '"ok":true' "$POLICY_FILE"; then
    echo "FAIL: resposta de /admin/messages (policyB) sem ok=true"
    tail -c 2000 "$POLICY_FILE" || true
    exit 1
  fi
  node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const items=data.items||[];const rid=process.argv[2];const hit=items.some((i)=>i.direction==='OUTBOUND'&&i.type==='TEMPLATE'&&i.templateName==='re7_pricing_v1'&&i.status==='SENT'&&String(i.messageId||'').includes(rid));if(!hit)process.exit(2);" "$POLICY_FILE" "$RID"
  if [[ $? -ne 0 ]]; then
    echo "FAIL: Policy B template não encontrado para RID atual"
    tail -c 2000 "$POLICY_FILE" || true
    exit 1
  fi

  if [[ "${HANDOFF_ENABLED:-false}" == "true" && -n "${HANDOFF_ATTENDANT_WAID:-}" && -n "${WAID_OPEN:-}" ]]; then
    log_step "B: forçar janela aberta do atendente"
    force_attendant_window "open"
    sleep 1
    log_step "C: demo scheduled (janela aberta)"
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
                "id": "wamid.e2e.demo.open2.${RID_OPEN}",
                "from": "${WAID_OPEN}",
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
                "id": "wamid.e2e.demo.schedule2.${RID_OPEN}",
                "from": "${WAID_OPEN}",
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
    sleep 1
    ATT_FILE="/tmp/re7-whatsapp-agent-admin-demo-attendant-${RID}.json"
    curl -s "${BASE_URL}/admin/messages?waId=${HANDOFF_ATTENDANT_WAID}&limit=50" \
      -H "X-Admin-Token: ${ADMIN_TOKEN}" > "$ATT_FILE"
    if ! grep -q '"ok":true' "$ATT_FILE"; then
      echo "FAIL: resposta de /admin/messages (attendant) sem ok=true"
      tail -c 2000 "$ATT_FILE" || true
      exit 1
    fi
    if [[ "$(count_templates_by_window "$ATT_FILE" "re7_atendente_manual_v1" "$START_EPOCH_MS")" -gt 0 ]]; then
      echo "FAIL: template encontrado para atendente mesmo com janela aberta (run atual)"
      tail -c 2000 "$ATT_FILE" || true
      exit 1
    fi
    if [[ "$(count_text_by_window "$ATT_FILE" "$START_EPOCH_MS")" -lt 1 ]]; then
      echo "FAIL: não encontrou texto do atendente no run atual (janela aberta)"
      tail -c 2000 "$ATT_FILE" || true
      exit 1
    fi
  fi

  log_step "D: forçar janela fechada do atendente"
  if [[ "${HANDOFF_ENABLED:-false}" == "true" && -n "${HANDOFF_ATTENDANT_WAID:-}" ]]; then
    force_attendant_window "closed"
    sleep 1
  fi

  log_step "E: abrir janela do lead"
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

  log_step "F: demo scheduled"
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

  log_step "G: validar via admin"
  METRICS_FILE="/tmp/re7-whatsapp-agent-admin-demo-metrics-${RID}.json"

  curl -s "${BASE_URL}/admin/metrics?range=${RANGE}" \
    -H "X-Admin-Token: ${ADMIN_TOKEN}" > "$METRICS_FILE"

if ! grep -q '"ok":true' "$METRICS_FILE"; then
  echo "FAIL: resposta de /admin/metrics sem ok=true"
  head -c 2000 "$METRICS_FILE" || true
  exit 1
fi

  read -r demo_requested demo_scheduled < <(
    node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const lead=data.lead||{};process.stdout.write(String(lead.demo_requested??0)+' '+String(lead.demo_scheduled??0));" "$METRICS_FILE"
  )

if [[ "$demo_requested" -lt 1 ]]; then
  echo "FAIL: lead.demo_requested < 1"
  head -c 2000 "$METRICS_FILE" || true
  exit 1
fi

if [[ "$demo_scheduled" -lt 1 ]]; then
  echo "FAIL: lead.demo_scheduled < 1"
  head -c 2000 "$METRICS_FILE" || true
  exit 1
fi

  LEAD_FILE="/tmp/re7-whatsapp-agent-admin-demo-lead-${RID}.json"
  curl -s "${BASE_URL}/admin/messages?waId=${WAID}&limit=120" \
    -H "X-Admin-Token: ${ADMIN_TOKEN}" > "$LEAD_FILE"
  if ! grep -q '"ok":true' "$LEAD_FILE"; then
    echo "FAIL: resposta de /admin/messages (lead) sem ok=true"
    tail -c 2000 "$LEAD_FILE" || true
    exit 1
  fi

  node -e "
  const fs=require('fs');
  const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
  const items=data.items||[];
  const rid=process.argv[2];
  const startEpoch=Number(process.argv[3]||0)*1000;
  const idx=items.findIndex((i)=>String(i.messageId||'').includes('schedule.'+rid)&&i.direction==='INBOUND');
  const after=idx>=0?items.slice(0,idx):items;
  const re=/(Qual (solu[cç][aã]o|produto|servi[cç]o)|Para qual (produto|servi[cç]o)|qual produto ou servi[cç]o)/i;
  const hit=after.some((i)=>i.direction==='OUTBOUND' && String(i.messageId||'').includes(rid) && re.test(String(i.bodyText||'')) && (!startEpoch || Date.parse(i.createdAt||'')>=startEpoch));
  if(hit){process.exit(2);}
  " "$LEAD_FILE" "$RID" "$START_EPOCH"
  if [[ $? -ne 0 ]]; then
    echo "FAIL: encontrou pergunta de solução/produto após agendamento"
    tail -c 2000 "$LEAD_FILE" || true
    exit 1
  fi

  if [[ "${HANDOFF_ENABLED:-false}" == "true" && -n "${HANDOFF_ATTENDANT_WAID:-}" ]]; then
    ATT_FILE="/tmp/re7-whatsapp-agent-admin-demo-attendant-${RID}.json"
    curl -s "${BASE_URL}/admin/messages?waId=${HANDOFF_ATTENDANT_WAID}&limit=50" \
      -H "X-Admin-Token: ${ADMIN_TOKEN}" > "$ATT_FILE"
    if ! grep -q '"ok":true' "$ATT_FILE"; then
      echo "FAIL: resposta de /admin/messages (attendant) sem ok=true"
      tail -c 2000 "$ATT_FILE" || true
      exit 1
    fi
    if [[ "$(count_templates_by_window "$ATT_FILE" "re7_atendente_manual_v1" "$START_EPOCH_MS")" -lt 1 ]]; then
      echo "FAIL: template re7_atendente_manual_v1 não encontrado para atendente (janela fechada)"
      tail -c 2000 "$ATT_FILE" || true
      exit 1
    fi
  fi

  echo "Counters: demoRequested=${demo_requested} demoScheduled=${demo_scheduled}"
  echo "E2E OK waId=${WAID} rid=${RID}"
}

for run in $(seq 1 "$REPEAT"); do
  echo "== RUN ${run}/${REPEAT} =="
  run_once
done
