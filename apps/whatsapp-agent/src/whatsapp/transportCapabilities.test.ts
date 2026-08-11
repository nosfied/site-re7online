import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveWhatsAppOutboundTextTransport,
  sendWhatsAppTextViaResolvedTransport,
} from "./outboundTransport.js";
import {
  normalizeWhatsAppTransportProvider,
  resolveWhatsAppTransportCapabilities,
} from "./transportCapabilities.js";

test("meta resolves as the only available WhatsApp transport", () => {
  const decision = resolveWhatsAppTransportCapabilities({ provider: "meta" });
  const transport = resolveWhatsAppOutboundTextTransport({ provider: "meta" });

  assert.equal(decision.ok, true);
  assert.equal(decision.available, true);
  assert.equal(decision.provider, "meta");
  assert.deepEqual(decision.capabilities, {
    text: true,
    media: true,
    contextualReply: true,
    templates: true,
    campaigns: true,
    metaDeliveryStatus: true,
    metaUsageLedger: true,
  });
  assert.equal(transport.ok, true);
  if (transport.ok) {
    assert.equal(transport.transport.provider, "meta");
  }
});

test("unsupported WhatsApp provider fails safely without defaulting to Meta", () => {
  const capabilities = resolveWhatsAppTransportCapabilities({ provider: "unknown_provider" });
  const transport = resolveWhatsAppOutboundTextTransport({ provider: "unknown_provider" });

  assert.equal(capabilities.ok, false);
  assert.equal(capabilities.available, false);
  assert.equal(capabilities.reason, "unsupported_whatsapp_transport");
  assert.equal(capabilities.capabilities.text, false);
  assert.deepEqual(transport, {
    ok: false,
    provider: "unknown_provider",
    error: "unsupported_whatsapp_transport",
  });
});

test("web_session is not operationally active when feature is absent or false", () => {
  const absent = resolveWhatsAppTransportCapabilities({ provider: "web_session" });
  const disabled = resolveWhatsAppTransportCapabilities({
    provider: "web_session",
    tenantFeatures: { whatsappWebSession: false },
  });

  assert.equal(absent.ok, true);
  assert.equal(absent.available, false);
  assert.equal(absent.reason, "feature_disabled");
  assert.equal(absent.capabilities.text, false);
  assert.equal(disabled.ok, true);
  assert.equal(disabled.available, false);
  assert.equal(disabled.reason, "feature_disabled");
  assert.deepEqual(resolveWhatsAppOutboundTextTransport({ provider: "web_session" }), {
    ok: false,
    provider: "web_session",
    error: "whatsapp_transport_unavailable",
  });
});

test("web_session remains unavailable even with a tenant-generic feature flag", () => {
  const decision = resolveWhatsAppTransportCapabilities({
    provider: "web_session",
    tenantFeatures: { whatsappWebSession: true },
  });
  const transport = resolveWhatsAppOutboundTextTransport({
    provider: "web_session",
    tenantFeatures: { whatsappWebSession: true },
  });

  assert.equal(normalizeWhatsAppTransportProvider("web_session"), "web_session");
  assert.equal(decision.ok, true);
  assert.equal(decision.available, false);
  assert.equal(decision.reason, "runtime_not_implemented");
  assert.equal(decision.capabilities.templates, false);
  assert.equal(transport.ok, false);
});

test("resolved Meta text transport calls the existing Meta Cloud sender", async (t) => {
  const originalFetch = globalThis.fetch;
  const payloads: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    payloads.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return new Response(JSON.stringify({ messages: [{ id: "wamid.transport.text" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await sendWhatsAppTextViaResolvedTransport({
    provider: "meta",
    to: "5584999990000",
    body: "Mensagem de teste de transporte.",
    credentials: {
      accessToken: "token",
      phoneNumberId: "phone",
      source: "tenant_meta",
    },
    options: {
      replyToMetaMessageId: "wamid.original",
      replyToOriginalType: "TEXT",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.messageId, "wamid.transport.text");
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].messaging_product, "whatsapp");
  assert.equal(payloads[0].type, "text");
  assert.deepEqual(payloads[0].context, { message_id: "wamid.original" });
});
