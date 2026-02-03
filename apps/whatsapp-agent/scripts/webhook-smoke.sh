#!/usr/bin/env bash
# Usage:
#   WHATSAPP_VERIFY_TOKEN=... bash scripts/webhook-smoke.sh
#   PORT=3001 BASE_URL=http://localhost:3001 bash scripts/webhook-smoke.sh
set -euo pipefail

PORT="${PORT:-3001}"
BASE_URL="${BASE_URL:-http://localhost:${PORT}}"
VERIFY_TOKEN="${WHATSAPP_VERIFY_TOKEN:-}"
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"

if [[ -z "$VERIFY_TOKEN" && -f "$ENV_FILE" ]]; then
  VERIFY_TOKEN=$(grep -E '^WHATSAPP_VERIFY_TOKEN=' "$ENV_FILE" | tail -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'")
fi

if [[ -z "$VERIFY_TOKEN" ]]; then
  echo "WHATSAPP_VERIFY_TOKEN não definido. Use:"
  echo "  WHATSAPP_VERIFY_TOKEN=... bash scripts/webhook-smoke.sh"
  exit 1
fi

echo "== Verify =="
curl -s -i "${BASE_URL}/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=123"
echo

payload=$(
  cat <<'JSON'
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "1234567890",
      "changes": [
        {
          "value": {
            "metadata": {
              "phone_number_id": "1234567890"
            },
            "messages": [
              {
                "id": "wamid.HBgLM...",
                "from": "5584999049614",
                "timestamp": "1730000000",
                "type": "text",
                "text": { "body": "Olá, quero falar com humano" }
              }
            ],
            "statuses": [
              {
                "id": "wamid.HBgLM...",
                "status": "sent"
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

echo "== POST webhook =="
if [[ -n "${META_APP_SECRET:-}" ]]; then
  signature=$(printf "%s" "$payload" | node -e "const crypto=require('crypto');const fs=require('fs');const secret=process.env.META_APP_SECRET;const body=fs.readFileSync(0);process.stdout.write('sha256='+crypto.createHmac('sha256',secret).update(body).digest('hex'));" )
  curl -s -i -H "Content-Type: application/json" -H "X-Hub-Signature-256: ${signature}" \
    -d "$payload" "${BASE_URL}/webhook"
else
  curl -s -i -H "Content-Type: application/json" -d "$payload" "${BASE_URL}/webhook"
fi
echo
