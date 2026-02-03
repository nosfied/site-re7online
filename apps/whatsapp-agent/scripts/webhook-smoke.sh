#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3001}"
BASE_URL="http://localhost:${PORT}"
VERIFY_TOKEN="${WHATSAPP_VERIFY_TOKEN:-changeme}"

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
