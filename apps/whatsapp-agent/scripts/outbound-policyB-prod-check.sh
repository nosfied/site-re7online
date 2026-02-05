#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${APP_DIR}/.env"
PORT="${PORT:-3001}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
RID="${RID:-$(date +%s)$RANDOM}"

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
                "timestamp": "$(date +%s)",
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
                "timestamp": "$(date +%s)",
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
post_webhook "$payload_debug"
post_webhook "$payload_inbound"

sleep 1

LOGS=$(pm2 logs 0 --raw --lines 20000 2>/dev/null || true)
BLOCKED=$(echo "$LOGS" | grep "$RID" | grep '"event":"outbound.blocked.window_closed"' || true)
NEEDS=$(echo "$LOGS" | grep "$RID" | grep '"event":"outbound.needs_template"' || true)
SENDING=$(echo "$LOGS" | grep "$RID" | grep '"event":"reply.sending"' || true)

if [[ -z "$BLOCKED" || -z "$NEEDS" || -n "$SENDING" ]]; then
  echo "FAIL"
  echo "== outbound.blocked.window_closed =="
  echo "$BLOCKED"
  echo "== outbound.needs_template =="
  echo "$NEEDS"
  echo "== reply.sending (should be empty) =="
  echo "$SENDING"
  exit 1
fi

echo "OK"
