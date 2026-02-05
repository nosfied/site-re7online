#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${APP_DIR}/.env"
PORT="${PORT:-3001}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
RID="${RID:-$(date +%s)$RANDOM}"
PAST_TS="${PAST_TS:-$(date -d '48 hours ago' +%s)}"

if [[ -f "$ENV_FILE" ]]; then
  VERIFY_TOKEN=$(grep -E '^WHATSAPP_VERIFY_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  META_APP_SECRET=$(grep -E '^META_APP_SECRET=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  ADMIN_ALLOWLIST=$(grep -E '^WHATSAPP_ADMIN_ALLOWLIST=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  ALLOWLIST=$(grep -E '^WHATSAPP_ALLOWLIST=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  DISABLE_DEBUG_COMMANDS=$(grep -E '^DISABLE_DEBUG_COMMANDS=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")
else
  VERIFY_TOKEN=""
  META_APP_SECRET=""
  ADMIN_ALLOWLIST=""
  ALLOWLIST=""
  DISABLE_DEBUG_COMMANDS="true"
fi

ADMIN_WAID="${ADMIN_WAID:-${ADMIN_ALLOWLIST%%,*}}"
TARGET_WAID="${TARGET_WAID:-${ALLOWLIST%%,*}}"
ADMIN_WAID="${ADMIN_WAID//[^0-9]/}"
TARGET_WAID="${TARGET_WAID//[^0-9]/}"

if [[ -z "$VERIFY_TOKEN" ]]; then
  echo "Erro: WHATSAPP_VERIFY_TOKEN não encontrado no .env"
  exit 1
fi

if [[ -z "$ADMIN_WAID" ]]; then
  echo "Erro: WHATSAPP_ADMIN_ALLOWLIST vazio no .env"
  exit 1
fi

if [[ -z "$TARGET_WAID" ]]; then
  echo "Erro: WHATSAPP_ALLOWLIST vazio no .env"
  exit 1
fi

if [[ "${DISABLE_DEBUG_COMMANDS:-true}" == "true" ]]; then
  echo "Erro: DISABLE_DEBUG_COMMANDS=true. Ajuste no .env para false antes do teste."
  exit 1
fi

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

payload_debug=$(
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
              "phone_number_id": "${RID}"
            },
            "messages": [
              {
                "id": "wamid.debug.${RID}",
                "from": "${ADMIN_WAID}",
                "timestamp": "${PAST_TS}",
                "type": "text",
                "text": { "body": "#debug closewindow ${TARGET_WAID}" }
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
              "phone_number_id": "${RID}"
            },
            "messages": [
              {
                "id": "wamid.policyb.${RID}",
                "from": "${TARGET_WAID}",
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

echo "== Policy B prod check (RID=${RID}) =="
echo "Timestamp usado (PAST_TS): ${PAST_TS}"
post_webhook "$payload_debug"
post_webhook "$payload_inbound"

timeout_s=15
start_ts=$(date +%s)
found_blocked=""
found_needs=""
found_reply=""

while true; do
  now_ts=$(date +%s)
  if (( now_ts - start_ts > timeout_s )); then
    break
  fi
  LOGS=$(pm2 logs 0 --raw --lines 2000 --nostream 2>/dev/null || pm2 logs 0 --raw --lines 2000 2>/dev/null || true)
  found_blocked=$(echo "$LOGS" | grep "$RID" | grep '"event":"outbound.blocked.window_closed"' || true)
  found_needs=$(echo "$LOGS" | grep "$RID" | grep '"event":"outbound.needs_template"' || true)
  found_reply=$(echo "$LOGS" | grep "$RID" | grep -E '"event":"reply\.sending"|"event":"reply\.sent"' || true)
  if [[ -n "$found_reply" ]]; then
    break
  fi
  if [[ -n "$found_blocked" && -n "$found_needs" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$found_blocked" || -z "$found_needs" || -n "$found_reply" ]]; then
  echo "FAIL (RID=${RID})"
  echo "== outbound.blocked.window_closed =="
  echo "$found_blocked"
  echo "== outbound.needs_template =="
  echo "$found_needs"
  echo "== reply.sending/reply.sent (should be empty) =="
  echo "$found_reply"
  exit 1
fi

echo "OK (RID=${RID})"
