#!/usr/bin/env bash
set -euo pipefail

WAID="${1:-}"
shift || true

RANGE="24h"
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
    *)
      echo "Uso: $0 <waId> [--range 1h|24h] [--port 3001]" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$WAID" ]]; then
  echo "Uso: $0 <waId> [--range 1h|24h] [--port 3001]" >&2
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

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "FAIL: ADMIN_TOKEN ausente no .env" >&2
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
    signature=$(printf "%s" "$payload" | node -e "const crypto=require('crypto');const fs=require('fs');const secret=process.env.META_APP_SECRET;const body=fs.readFileSync(0);process.stdout.write('sha256='+crypto.createHmac('sha256',secret).update(body).digest('hex'));" )
    curl -s -i -H "Content-Type: application/json" -H "X-Hub-Signature-256: ${signature}" \
      -d "$payload" "${BASE_URL}/webhook" >/dev/null
  else
    curl -s -i -H "Content-Type: application/json" -d "$payload" "${BASE_URL}/webhook" >/dev/null
  fi
}

log_step "A: Policy B (template)"
TARGET_WAID="$WAID" RID="$RID" ENV_FILE="$ENV_FILE" BASE_URL="$BASE_URL" \
  bash "${ROOT_DIR}/scripts/outbound-policyB-prod-check.sh"

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
            "metadata": { "phone_number_id": "${RID}" },
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
            "metadata": { "phone_number_id": "${RID}" },
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

curl -s "${BASE_URL}/admin/messages?waId=${WAID}&limit=50" \
  -H "X-Admin-Token: ${ADMIN_TOKEN}" > "$MSG_FILE"

curl -s "${BASE_URL}/admin/metrics?range=${RANGE}" \
  -H "X-Admin-Token: ${ADMIN_TOKEN}" > "$METRICS_FILE"

if ! grep -qi "nome" "$MSG_FILE"; then
  echo "FAIL: pergunta de lead não encontrada"
  exit 1
fi
if ! grep -qi "perfeito\|já registrei" "$MSG_FILE"; then
  echo "FAIL: confirmação de lead não encontrada"
  exit 1
fi
if ! grep -qi "lead" "$METRICS_FILE"; then
  echo "FAIL: métricas de lead não encontradas"
  exit 1
fi
if ! grep -qi "conversion_rate" "$METRICS_FILE"; then
  echo "FAIL: conversion_rate não encontrada"
  exit 1
fi

echo "E2E OK waId=${WAID} rid=${RID}"
