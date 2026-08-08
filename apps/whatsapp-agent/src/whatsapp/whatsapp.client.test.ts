import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWhatsAppTextMessagePayload,
  buildWhatsAppTextMessageRequestDiagnostic,
  sendTextMessage,
} from "./whatsapp.client.js";

process.env.WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "whatsapp-client-test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "whatsapp-client-test-phone";

test("sendTextMessage includes contextual message id for any resolved original type", async (t) => {
  const originalFetch = globalThis.fetch;
  const payloads: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    payloads.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return new Response(JSON.stringify({ messages: [{ id: "wamid.sent.contextual" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await sendTextMessage(
    "5584999990000",
    "Resposta textual para item de midia.",
    { accessToken: "token", phoneNumberId: "phone" },
    { replyToMetaMessageId: "wamid.original.audio", replyToOriginalType: "AUDIO" }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.requestDiagnostic, {
    messageType: "text",
    contextPresent: true,
    contextMessageIdPresent: true,
    replyToOriginalType: "AUDIO",
  });
  assert.equal(payloads.length, 1);
  assert.deepEqual(payloads[0].context, { message_id: "wamid.original.audio" });
  assert.equal(payloads[0].type, "text");
  assert.deepEqual(payloads[0].text, { body: "Resposta textual para item de midia." });
});

test("text reply provider payload shape is identical for TEXT and AUDIO originals", () => {
  const textPayload = buildWhatsAppTextMessagePayload("5584999990000", "Resposta para texto.", {
    replyToMetaMessageId: "wamid.original.text",
  });
  const audioPayload = buildWhatsAppTextMessagePayload("5584999990000", "Resposta para audio.", {
    replyToMetaMessageId: "wamid.original.audio",
  });

  assert.deepEqual(Object.keys(textPayload).sort(), Object.keys(audioPayload).sort());
  assert.equal(textPayload.type, "text");
  assert.equal(audioPayload.type, "text");
  assert.deepEqual(buildWhatsAppTextMessageRequestDiagnostic(textPayload, { replyToOriginalType: "TEXT" }), {
    messageType: "text",
    contextPresent: true,
    contextMessageIdPresent: true,
    replyToOriginalType: "TEXT",
  });
  assert.deepEqual(buildWhatsAppTextMessageRequestDiagnostic(audioPayload, { replyToOriginalType: "AUDIO" }), {
    messageType: "text",
    contextPresent: true,
    contextMessageIdPresent: true,
    replyToOriginalType: "AUDIO",
  });
});
