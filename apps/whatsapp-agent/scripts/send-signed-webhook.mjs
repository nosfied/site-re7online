#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";

const secret = process.env.META_APP_SECRET;
if (!secret) {
  console.error("Erro: META_APP_SECRET não definido no ambiente.");
  process.exit(1);
}

const webhookUrl = process.env.WEBHOOK_URL || "http://localhost:3002/webhook";
const bodyFile = process.env.WEBHOOK_BODY_FILE;

const nowSeconds = Math.floor(Date.now() / 1000);
const defaultPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "entry-1",
      changes: [
        {
          field: "messages",
          value: {
            metadata: {
              phone_number_id: "1018032104719713",
            },
            contacts: [
              {
                wa_id: "5511999999999",
                profile: { name: "Teste" },
              },
            ],
            messages: [
              {
                id: `wamid.dev.${Date.now()}`,
                from: "5511999999999",
                timestamp: `${nowSeconds}`,
                type: "text",
                text: { body: "teste webhook assinado" },
              },
            ],
          },
        },
      ],
    },
  ],
};

let rawBody = "";
if (bodyFile) {
  rawBody = fs.readFileSync(bodyFile, "utf8");
} else {
  rawBody = JSON.stringify(defaultPayload);
}

const refreshPayloadTimestamps = (payload) => {
  const entry = payload?.entry?.[0];
  const change = entry?.changes?.[0];
  const messages = change?.value?.messages;
  const first = Array.isArray(messages) ? messages[0] : undefined;
  const currentTs = Number(first?.timestamp ?? 0);
  const ageSeconds = currentTs > 0 ? nowSeconds - currentTs : Number.POSITIVE_INFINITY;
  if (!first || ageSeconds > 24 * 60 * 60) {
    if (first) {
      first.timestamp = `${nowSeconds}`;
      first.id = `wamid.dev.${Date.now()}`;
    }
  }
};

try {
  const parsed = JSON.parse(rawBody);
  refreshPayloadTimestamps(parsed);
  rawBody = JSON.stringify(parsed);
} catch {
  // ignore parse errors; keep raw body as-is
}

const signature = crypto
  .createHmac("sha256", secret)
  .update(rawBody)
  .digest("hex");

const response = await fetch(webhookUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Hub-Signature-256": `sha256=${signature}`,
  },
  body: rawBody,
});

const text = await response.text();
console.log(`Status: ${response.status}`);
console.log(text);
