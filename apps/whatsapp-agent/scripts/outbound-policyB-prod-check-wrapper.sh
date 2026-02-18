#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env}"
PORT="${PORT:-3001}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
RID="${RID:-$(date +%s)$RANDOM}"
PAST_TS="${PAST_TS:-$(date -d '48 hours ago' +%s)}"
INTENT="pricing"
TARGET_WAID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --to)
      TARGET_WAID="$2"
      shift 2
      ;;
    --intent)
      INTENT="$2"
      shift 2
      ;;
    --range)
      shift 2
      ;;
    *)
      echo "Uso: $0 --to <waId> [--intent pricing]" >&2
      exit 2
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Erro: .env não encontrado em ${ENV_FILE}" >&2
  exit 1
fi

ADMIN_TOKEN=$(grep -E '^ADMIN_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")
META_APP_SECRET=$(grep -E '^META_APP_SECRET=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")
PHONE_NUMBER_ID=$(grep -E '^WHATSAPP_PHONE_NUMBER_ID=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "Erro: ADMIN_TOKEN ausente no .env" >&2
  exit 1
fi
if [[ -z "$META_APP_SECRET" ]]; then
  echo "Erro: META_APP_SECRET ausente no .env" >&2
  exit 1
fi
if [[ -z "$PHONE_NUMBER_ID" ]]; then
  echo "Erro: WHATSAPP_PHONE_NUMBER_ID ausente no .env" >&2
  exit 1
fi

if [[ -z "$TARGET_WAID" ]]; then
  echo "Erro: --to <waId> é obrigatório" >&2
  exit 2
fi
TARGET_WAID="${TARGET_WAID//[^0-9]/}"
if [[ -z "$TARGET_WAID" ]]; then
  echo "Erro: waId inválido" >&2
  exit 2
fi

wait_ready() {
  local timeout_s=10
  local start_ts
  start_ts=$(date +%s)
  while true; do
    local code
    code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 1 "${BASE_URL}/health" || true)
    if [[ "$code" =~ ^2 ]]; then
      return 0
    fi
    if (( $(date +%s) - start_ts >= timeout_s )); then
      echo "FAIL: server not ready at ${BASE_URL}" >&2
      return 1
    fi
    sleep 0.2
  done
}

post_webhook() {
  local payload="$1"
  local signature
  signature=$(printf "%s" "$payload" | META_APP_SECRET="$META_APP_SECRET" node -e "const crypto=require('crypto');const fs=require('fs');const secret=process.env.META_APP_SECRET;const body=fs.readFileSync(0);process.stdout.write('sha256='+crypto.createHmac('sha256',secret).update(body).digest('hex'));" )
  curl -s -i -H "Content-Type: application/json" -H "X-Hub-Signature-256: ${signature}" \
    -d "$payload" "${BASE_URL}/webhook" >/dev/null
}

metrics_count() {
  local field="$1"
  curl -s "${BASE_URL}/admin/metrics?range=1h" -H "X-Admin-Token: ${ADMIN_TOKEN}" |
    node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync(0,'utf8'));const path='${field}'.split('.');let v=data;for (const p of path){v=v?.[p];}process.stdout.write(String(v ?? 0));"
}

echo "== Policy B prod check (RID=${RID}) =="
wait_ready

before_blocked=$(metrics_count "counts.outbound.blocked_window_closed")

payload_inbound=$(
  cat <<JSON
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "${RID}",
      "changes": [
        {
          "value": {
            "metadata": {
              "phone_number_id": "${PHONE_NUMBER_ID}"
            },
            "messages": [
              {
                "id": "wamid.policyb.${RID}",
                "from": "${TARGET_WAID}",
                "timestamp": "${PAST_TS}",
                "type": "text",
                "text": { "body": "quero orçamento ${INTENT}" }
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

post_webhook "$payload_inbound"

after_blocked="$before_blocked"
for _ in 1 2 3 4 5; do
  after_blocked=$(metrics_count "counts.outbound.blocked_window_closed")
  if [[ "$after_blocked" -gt "$before_blocked" ]]; then
    break
  fi
  sleep 1
done

if [[ "$after_blocked" -le "$before_blocked" ]]; then
  echo "FAIL: blocked_window_closed não incrementou (before=${before_blocked}, after=${after_blocked})" >&2
  exit 1
fi

echo "OK: Policy B bloqueou janela (before=${before_blocked}, after=${after_blocked})"
