import assert from "node:assert/strict";
import test from "node:test";
import { sendTextMessage } from "./whatsapp.client.js";

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
    { replyToMetaMessageId: "wamid.original.audio" }
  );

  assert.equal(result.ok, true);
  assert.equal(payloads.length, 1);
  assert.deepEqual(payloads[0].context, { message_id: "wamid.original.audio" });
  assert.equal(payloads[0].type, "text");
  assert.deepEqual(payloads[0].text, { body: "Resposta textual para item de midia." });
});
