#!/usr/bin/env bash
set -euo pipefail

WAID=""
WAID_OPEN=""
RANGE="1h"
PORT="${PORT:-3001}"

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
    *)
      if [[ -z "$WAID" ]]; then
        WAID="$1"
        shift 1
      else
        echo "Uso: $0 <waId> [--waid-open <waId>] [--range 1h|24h|7d|30d] [--port 3001]" >&2
        exit 2
      fi
      ;;
  esac
done

if [[ -z "$WAID" ]]; then
  echo "Uso: $0 <waId> [--waid-open <waId>] [--range 1h|24h|7d|30d] [--port 3001]" >&2
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
BASE_URL="http://127.0.0.1:${PORT}"
RID="${RID:-$(date +%s)$RANDOM}"
RID_OPEN="${RID_OPEN:-$(date +%s)$RANDOM}"

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

count_attendant_templates() {
  local file="$1"
  local rid="$2"
  node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const items=data.items||[];const rid=process.argv[2];const count=items.filter((i)=>String(i.messageId||'').includes(rid)&&i.type==='TEMPLATE'&&i.templateName==='re7_atendente_manual_v1'&&i.status==='SENT').length;process.stdout.write(String(count));" "$file" "$rid"
}

log_step "A: Policy B (template)"
if [[ -x "${ROOT_DIR}/scripts/outbound-policyB-prod-check-wrapper.sh" ]]; then
  "${ROOT_DIR}/scripts/outbound-policyB-prod-check-wrapper.sh" --to "$WAID" --intent pricing --range "$RANGE"
fi

if [[ "${HANDOFF_ENABLED:-false}" == "true" && -n "${HANDOFF_ATTENDANT_WAID:-}" ]]; then
  if [[ -z "$WAID_OPEN" ]]; then
    echo "FAIL: --waid-open é obrigatório para validar janela aberta e fechada do atendente" >&2
    exit 1
  fi
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
  if [[ "$(count_attendant_templates "$ATT_FILE" "$RID_OPEN")" -gt 0 ]]; then
    echo "FAIL: template encontrado para atendente mesmo com janela aberta (RID_OPEN)"
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

if [[ "${HANDOFF_ENABLED:-false}" == "true" && -n "${HANDOFF_ATTENDANT_WAID:-}" ]]; then
  ATT_FILE="/tmp/re7-whatsapp-agent-admin-demo-attendant-${RID}.json"
  curl -s "${BASE_URL}/admin/messages?waId=${HANDOFF_ATTENDANT_WAID}&limit=50" \
    -H "X-Admin-Token: ${ADMIN_TOKEN}" > "$ATT_FILE"
  if ! grep -q '"ok":true' "$ATT_FILE"; then
    echo "FAIL: resposta de /admin/messages (attendant) sem ok=true"
    tail -c 2000 "$ATT_FILE" || true
    exit 1
  fi
  if ! grep -q "re7_atendente_manual_v1" "$ATT_FILE"; then
    echo "FAIL: template re7_atendente_manual_v1 não encontrado para atendente (janela fechada)"
    tail -c 2000 "$ATT_FILE" || true
    exit 1
  fi
  if [[ "$(count_attendant_templates "$ATT_FILE" "$RID")" -lt 1 ]]; then
    echo "FAIL: template não encontrado para o RID atual (janela fechada)"
    tail -c 2000 "$ATT_FILE" || true
    exit 1
  fi
fi

echo "Counters: demoRequested=${demo_requested} demoScheduled=${demo_scheduled}"
echo "E2E OK waId=${WAID} rid=${RID}"
