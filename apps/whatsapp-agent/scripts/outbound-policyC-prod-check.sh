#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${APP_DIR}/.env"
PORT="${PORT:-3001}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
RID="${RID:-$(date +%s)$RANDOM}"

if [[ -f "$ENV_FILE" ]]; then
  META_APP_SECRET=$(grep -E '^META_APP_SECRET=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  ALLOWLIST=$(grep -E '^WHATSAPP_ALLOWLIST=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")
else
  META_APP_SECRET=""
  ALLOWLIST=""
fi

TARGET_WAID="${TARGET_WAID:-${ALLOWLIST%%,*}}"
TARGET_WAID="${TARGET_WAID//[^0-9]/}"

if [[ -z "$TARGET_WAID" ]]; then
  echo "Erro: WHATSAPP_ALLOWLIST vazio no .env"
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
                "id": "wamid.policyc.${RID}",
                "from": "${TARGET_WAID}",
                "timestamp": "$(date +%s)",
                "type": "text",
                "text": { "body": "oi" }
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

echo "== Policy C prod check (RID=${RID}) =="
post_webhook "$payload_inbound"

sleep 1

LOG_FILE="/home/deploy/.pm2/logs/re7-whatsapp-agent-out-0.log"
LOGS=""
if [[ -f "$LOG_FILE" ]]; then
  LOGS=$(tail -n 2000 "$LOG_FILE" 2>/dev/null || true)
else
  LOGS=$(pm2 logs 0 --raw --lines 2000 --nostream 2>/dev/null || pm2 logs 0 --raw --lines 2000 2>/dev/null || true)
fi

SENT=$(echo "$LOGS" | grep "wamid.policyc.${RID}" | grep '"event":"outbound.text.sent"' || true)
FAIL=$(echo "$LOGS" | grep "wamid.policyc.${RID}" | grep '"event":"outbound.text.failed"' || true)

if [[ -z "$SENT" || -n "$FAIL" ]]; then
  echo "FAIL (RID=${RID})"
  echo "== outbound.text.sent =="
  echo "$SENT"
  echo "== outbound.text.failed =="
  echo "$FAIL"
  exit 1
fi

echo "OK (RID=${RID})"
