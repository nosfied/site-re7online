#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";

const DEFAULT_WEBHOOK_URL = "http://localhost:3002/webhook";
const DEFAULT_FROM = "5511999999999";
const DEFAULT_PROFILE_NAME = "Teste";
const DEFAULT_TEXT = "teste webhook assinado";
const DEFAULT_PHONE_NUMBER_ID = "1018032104719713";

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getArgValue = (flag) => {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
};

if (hasFlag("--help")) {
  console.log(`Uso:
  node scripts/send-signed-webhook.mjs [opções]

Opções (CLI sobrepõe ENV):
  --url <URL>                 WEBHOOK_URL
  --file <PATH>               WEBHOOK_BODY_FILE
  --from <E164>               FROM
  --name <NOME>               PROFILE_NAME
  --text <MENSAGEM>            TEXT
  --phone-number-id <ID>      PHONE_NUMBER_ID
  --message-id <ID>           MESSAGE_ID
  --timestamp <EPOCH>         TIMESTAMP
  --print-body                imprime request/response
  --dry-run                   não envia; imprime corpo e assinatura
  --help                      mostra esta ajuda
`);
  process.exit(0);
}

const secret = process.env.META_APP_SECRET;
if (!secret) {
  console.error("Erro: META_APP_SECRET não definido no ambiente.");
  process.exit(1);
}

const webhookUrl =
  getArgValue("--url") || process.env.WEBHOOK_URL || DEFAULT_WEBHOOK_URL;
const bodyFile = getArgValue("--file") || process.env.WEBHOOK_BODY_FILE;
const from = getArgValue("--from") || process.env.FROM || DEFAULT_FROM;
const profileName = getArgValue("--name") || process.env.PROFILE_NAME || DEFAULT_PROFILE_NAME;
const text = getArgValue("--text") || process.env.TEXT || DEFAULT_TEXT;
const phoneNumberId =
  getArgValue("--phone-number-id") ||
  process.env.PHONE_NUMBER_ID ||
  DEFAULT_PHONE_NUMBER_ID;
const messageId = getArgValue("--message-id") || process.env.MESSAGE_ID || "";
const timestampEnv = getArgValue("--timestamp") || process.env.TIMESTAMP || "";
const printBody = hasFlag("--print-body");
const dryRun = hasFlag("--dry-run");

const nowSeconds = Math.floor(Date.now() / 1000);
const resolvedTimestamp = timestampEnv ? String(timestampEnv) : String(nowSeconds);
const resolvedMessageId = messageId || `wamid.dev.${Date.now()}`;

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
              phone_number_id: phoneNumberId,
            },
            contacts: [
              {
                wa_id: from,
                profile: { name: profileName },
              },
            ],
            messages: [
              {
                id: resolvedMessageId,
                from,
                timestamp: resolvedTimestamp,
                type: "text",
                text: { body: text },
              },
            ],
          },
        },
      ],
    },
  ],
};

const applyOverrides = (payload) => {
  const base = payload && Array.isArray(payload.entry) ? payload : JSON.parse(JSON.stringify(defaultPayload));
  const entry = base.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value ?? {};
  const contacts = Array.isArray(value.contacts) ? value.contacts : [];
  const messages = Array.isArray(value.messages) ? value.messages : [];
  const contact = contacts[0] ?? { wa_id: from, profile: { name: profileName } };
  const message = messages[0] ?? { id: resolvedMessageId, from, timestamp: resolvedTimestamp };

  value.metadata = value.metadata || {};
  value.metadata.phone_number_id = phoneNumberId;

  contact.wa_id = from;
  contact.profile = contact.profile || {};
  contact.profile.name = profileName;

  message.from = from;
  message.id = resolvedMessageId;
  message.timestamp = resolvedTimestamp;
  message.type = "text";
  message.text = { body: text };

  value.contacts = [contact];
  value.messages = [message];
  change.value = value;
  entry.changes = [change];
  base.entry = [entry];
  return base;
};

let rawBody = "";
if (bodyFile) {
  try {
    const parsed = JSON.parse(fs.readFileSync(bodyFile, "utf8"));
    rawBody = JSON.stringify(applyOverrides(parsed));
  } catch {
    rawBody = JSON.stringify(defaultPayload);
  }
} else {
  rawBody = JSON.stringify(defaultPayload);
}

const signature = crypto
  .createHmac("sha256", secret)
  .update(rawBody)
  .digest("hex");

if (dryRun) {
  console.log(`X-Hub-Signature-256: sha256=${signature.slice(0, 16)}...`);
  console.log(rawBody);
  process.exit(0);
}

try {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": `sha256=${signature}`,
    },
    body: rawBody,
  });

  const responseText = await response.text();
  const requestId = response.headers.get("x-request-id") || "";
  console.log(`Status: ${response.status}`);
  if (requestId) console.log(`RequestId: ${requestId}`);
  if (printBody || !response.ok) {
    console.log(responseText);
  }
} catch (error) {
  console.error("Erro: não foi possível conectar ao servidor.");
  console.error("Dica: confirme se o app está rodando (npm run dev)." );
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
}
