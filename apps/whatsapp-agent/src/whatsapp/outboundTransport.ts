import { sendTextMessage } from "./whatsapp.client.js";
import {
  normalizeWhatsAppTransportProvider,
  resolveWhatsAppTransportCapabilities,
  type WhatsAppTransportProvider,
} from "./transportCapabilities.js";
import type { TenantOutboundCredentials } from "./tenantCredentials.js";

export type WhatsAppTextTransportOptions = {
  replyToMetaMessageId?: string | null;
  replyToOriginalType?: string | null;
};

export type WhatsAppTextTransportResult = Awaited<ReturnType<typeof sendTextMessage>>;

export type WhatsAppOutboundTransport = {
  provider: WhatsAppTransportProvider;
  sendText(
    to: string,
    body: string,
    credentials: TenantOutboundCredentials,
    options?: WhatsAppTextTransportOptions
  ): Promise<WhatsAppTextTransportResult>;
};

export type WhatsAppOutboundTransportResolution =
  | { ok: true; transport: WhatsAppOutboundTransport }
  | { ok: false; provider: string; error: "unsupported_whatsapp_transport" | "whatsapp_transport_unavailable" };

const metaTransport: WhatsAppOutboundTransport = {
  provider: "meta",
  sendText(to, body, credentials, options) {
    return sendTextMessage(
      to,
      body,
      {
        accessToken: credentials.accessToken,
        phoneNumberId: credentials.phoneNumberId,
      },
      {
        replyToMetaMessageId: options?.replyToMetaMessageId ?? null,
        replyToOriginalType: options?.replyToOriginalType ?? null,
      }
    );
  },
};

export function resolveWhatsAppOutboundTextTransport(params: {
  provider: unknown;
  tenantFeatures?: { whatsappWebSession?: boolean | null } | null;
}): WhatsAppOutboundTransportResolution {
  const provider = normalizeWhatsAppTransportProvider(params.provider);
  if (!provider) {
    return {
      ok: false,
      provider: typeof params.provider === "string" ? params.provider : "",
      error: "unsupported_whatsapp_transport",
    };
  }
  const capabilities = resolveWhatsAppTransportCapabilities({
    provider,
    tenantFeatures: params.tenantFeatures,
  });
  if (!capabilities.ok || !capabilities.available || !capabilities.capabilities.text) {
    return { ok: false, provider, error: "whatsapp_transport_unavailable" };
  }
  if (provider === "meta") {
    return { ok: true, transport: metaTransport };
  }
  return { ok: false, provider, error: "whatsapp_transport_unavailable" };
}

export async function sendWhatsAppTextViaResolvedTransport(params: {
  provider: unknown;
  to: string;
  body: string;
  credentials: TenantOutboundCredentials;
  tenantFeatures?: { whatsappWebSession?: boolean | null } | null;
  options?: WhatsAppTextTransportOptions;
}) {
  const resolution = resolveWhatsAppOutboundTextTransport({
    provider: params.provider,
    tenantFeatures: params.tenantFeatures,
  });
  if (!resolution.ok) {
    return {
      ok: false as const,
      status: 0,
      messageId: null,
      errorBody: resolution.error,
      requestDiagnostic: undefined,
    };
  }
  return resolution.transport.sendText(params.to, params.body, params.credentials, params.options);
}
