#!/usr/bin/env bash
set -euo pipefail

WAID=""
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
    *)
      if [[ -z "$WAID" ]]; then
        WAID="$1"
        shift 1
      else
        echo "Uso: $0 <waId> [--range 1h|24h|7d|30d] [--port 3001]" >&2
        exit 2
      fi
      ;;
  esac
done

if [[ -z "$WAID" ]]; then
  echo "Uso: $0 <waId> [--range 1h|24h|7d|30d] [--port 3001]" >&2
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
BASE_URL="http://127.0.0.1:${PORT}"
RID="${RID:-$(date +%s)$RANDOM}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: .env não encontrado em ${ENV_FILE}" >&2
  exit 1
fi

ADMIN_TOKEN=$(grep -E '^ADMIN_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2-)
META_APP_SECRET=$(grep -E '^META_APP_SECRET=' "$ENV_FILE" | head -n1 | cut -d= -f2-)
PHONE_NUMBER_ID=$(grep -E '^WHATSAPP_PHONE_NUMBER_ID=' "$ENV_FILE" | head -n1 | cut -d= -f2-)
DISABLE_DEBUG_COMMANDS=$(grep -E '^DISABLE_DEBUG_COMMANDS=' "$ENV_FILE" | head -n1 | cut -d= -f2-)

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

log_step "A: Policy B (template)"
if [[ -x "${ROOT_DIR}/scripts/outbound-policyB-prod-check-wrapper.sh" ]]; then
  "${ROOT_DIR}/scripts/outbound-policyB-prod-check-wrapper.sh" --to "$WAID" --intent pricing --range "$RANGE"
elif [[ -x "/usr/local/bin/outbound-policyB-prod-check" && "${DISABLE_DEBUG_COMMANDS:-true}" != "true" ]]; then
  TARGET_WAID="$WAID" RID="$RID" ENV_FILE="$ENV_FILE" BASE_URL="$BASE_URL" \
    /usr/local/bin/outbound-policyB-prod-check
else
  PAST_TS=$(date -d '48 hours ago' +%s)
  payload_policyb=$(cat <<JSON
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
                "id": "wamid.policyb.${RID}",
                "from": "${WAID}",
                "timestamp": "${PAST_TS}",
                "type": "text",
                "text": { "body": "quero orçamento" }
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
  post_webhook "$payload_policyb"
  sleep 1
fi

log_step "B: abrir janela (lead.capture.requested)"
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
                "id": "wamid.e2e.open.${RID}",
                "from": "${WAID}",
                "timestamp": "${NOW_TS}",
                "type": "text",
                "text": { "body": "ok, quero orçamento" }
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

log_step "C: capturar lead (lead.captured)"
NEXT_TS=$((NOW_TS + 5))
payload_lead=$(cat <<JSON
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
                "id": "wamid.e2e.lead.${RID}",
                "from": "${WAID}",
                "timestamp": "${NEXT_TS}",
                "type": "text",
                "text": { "body": "Nome: Teste E2E\nCidade: Natal\nServiço: WhatsApp" }
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
post_webhook "$payload_lead"

log_step "D: validar via admin"
MSG_FILE="/tmp/re7-whatsapp-agent-admin-lead-messages-${RID}.json"
METRICS_FILE="/tmp/re7-whatsapp-agent-admin-lead-metrics-${RID}.json"

curl -s "${BASE_URL}/admin/messages?waId=${WAID}&limit=200" \
  -H "X-Admin-Token: ${ADMIN_TOKEN}" > "$MSG_FILE"

if ! grep -q '"ok":true' "$MSG_FILE"; then
  echo "FAIL: resposta de /admin/messages sem ok=true"
  echo "---- messages (tail) ----"
  tail -c 2000 "$MSG_FILE" || true
  exit 1
fi

if ! grep -qi "Para te ajudar melhor, me informe:" "$MSG_FILE"; then
  echo "FAIL: pergunta esperada ('Para te ajudar melhor, me informe:') não encontrada"
  echo "---- messages (tail) ----"
  tail -c 2000 "$MSG_FILE" || true
  exit 1
fi
if ! grep -qi "como posso ajudar\|posso ajudar" "$MSG_FILE"; then
  echo "FAIL: confirmação de lead não contém 'como posso ajudar' ou 'posso ajudar'"
  echo "---- messages (tail) ----"
  tail -c 2000 "$MSG_FILE" || true
  exit 1
fi

lead_captured_ok=""
lead_requested_count="0"
lead_captured_count="0"
lead_template_count="0"
for _ in 1 2 3 4 5; do
  curl -s "${BASE_URL}/admin/metrics?range=${RANGE}" \
    -H "X-Admin-Token: ${ADMIN_TOKEN}" > "$METRICS_FILE"
  if ! grep -q '"ok":true' "$METRICS_FILE"; then
    echo "FAIL: resposta de /admin/metrics sem ok=true"
    echo "---- metrics ----"
    cat "$METRICS_FILE" | head -c 2000 || true
    exit 1
  fi
  read -r lead_requested_count lead_captured_count lead_template_count < <(
    node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const lead=data.lead||{};process.stdout.write(String(lead.requested??0)+' '+String(lead.captured??0)+' '+String(lead.template_sent??0));" "$METRICS_FILE"
  )
  if [[ "$lead_captured_count" -ge 1 && "$lead_requested_count" -ge 1 && "$lead_template_count" -ge 1 ]]; then
    lead_captured_ok="yes"
    break
  fi
  sleep 1
done

if ! grep -q '"lead":' "$METRICS_FILE"; then
  echo "FAIL: métricas de lead não encontradas"
  echo "---- metrics ----"
  cat "$METRICS_FILE" | head -c 2000 || true
  exit 1
fi
if [[ "$lead_requested_count" -lt 1 ]]; then
  echo "FAIL: lead.requested < 1"
  echo "---- metrics ----"
  cat "$METRICS_FILE" | head -c 2000 || true
  exit 1
fi
if [[ "$lead_template_count" -lt 1 ]]; then
  echo "FAIL: lead.template_sent < 1"
  echo "---- metrics ----"
  cat "$METRICS_FILE" | head -c 2000 || true
  exit 1
fi
if [[ -z "$lead_captured_ok" ]]; then
  echo "FAIL: lead.captured < 1"
  echo "---- metrics ----"
  cat "$METRICS_FILE" | head -c 2000 || true
  exit 1
fi
if ! grep -qi "conversion_rate" "$METRICS_FILE"; then
  echo "FAIL: conversion_rate não encontrada"
  echo "---- metrics ----"
  cat "$METRICS_FILE" | head -c 2000 || true
  exit 1
fi

echo "Counters: leadRequested=${lead_requested_count} leadCaptured=${lead_captured_count} templateSent=${lead_template_count}"
echo "E2E OK waId=${WAID} rid=${RID}"
