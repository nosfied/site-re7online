#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
npm run build >/dev/null

REQUEST_ID="e2e-$(date +%s)-$RANDOM"
WA_ID="551149806683"

OUTPUT="$(REQUEST_ID="$REQUEST_ID" WA_ID="$WA_ID" node --input-type=module <<'NODE' 2>&1
const requestId = process.env.REQUEST_ID ?? "e2e";
const waId = process.env.WA_ID ?? "551149806683";

process.env.WHATSAPP_ALLOWLIST = waId;
process.env.WHATSAPP_ACCESS_TOKEN = "smoke_token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "smoke_phone";
process.env.WHATSAPP_OUT_OF_WINDOW_TEMPLATE = "re7_pricing_v1";
process.env.WHATSAPP_SANDBOX = "false";

const { receiveWebhook } = await import("./dist/whatsapp/webhook.controller.js");

const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
const payload = {
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: "smoke_phone" },
            messages: [
              {
                id: `wamid.smoke.${requestId}`,
                from: waId,
                timestamp: `${Math.floor(Date.parse(past) / 1000)}`,
                type: "text",
                text: { body: "quero orçamento" },
              },
            ],
          },
        },
      ],
    },
  ],
};

await receiveWebhook(payload, {
  route: "/webhook",
  method: "POST",
  requestId,
  rawBodyLength: 0,
});
NODE
)"

echo "$OUTPUT" | grep -q "\"event\":\"outbound.needs_template\".*\"requestId\":\"$REQUEST_ID\""
echo "$OUTPUT" | grep -q "\"event\":\"outbound.blocked.window_closed\".*\"requestId\":\"$REQUEST_ID\""
if echo "$OUTPUT" | grep -q "\"event\":\"reply.sending\".*\"requestId\":\"$REQUEST_ID\""; then
  echo "outbound policyB e2e smoke FAIL"
  exit 1
fi

echo "outbound policyB e2e smoke OK"
