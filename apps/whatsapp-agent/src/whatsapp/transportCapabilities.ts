export type WhatsAppTransportProvider = "meta" | "web_session";

export type WhatsAppTransportCapabilities = {
  text: boolean;
  media: boolean;
  contextualReply: boolean;
  templates: boolean;
  campaigns: boolean;
  metaDeliveryStatus: boolean;
  metaUsageLedger: boolean;
};

export type WhatsAppTransportCapabilityDecision =
  | {
      ok: true;
      provider: WhatsAppTransportProvider;
      available: boolean;
      reason: "available" | "feature_disabled" | "runtime_not_implemented";
      capabilities: WhatsAppTransportCapabilities;
    }
  | {
      ok: false;
      provider: string;
      available: false;
      reason: "unsupported_whatsapp_transport";
      capabilities: WhatsAppTransportCapabilities;
    };

type TenantFeatureInput = {
  whatsappWebSession?: boolean | null;
} | null | undefined;

const NO_CAPABILITIES: WhatsAppTransportCapabilities = {
  text: false,
  media: false,
  contextualReply: false,
  templates: false,
  campaigns: false,
  metaDeliveryStatus: false,
  metaUsageLedger: false,
};

const META_CLOUD_CAPABILITIES: WhatsAppTransportCapabilities = {
  text: true,
  media: true,
  contextualReply: true,
  templates: true,
  campaigns: true,
  metaDeliveryStatus: true,
  metaUsageLedger: true,
};

const WEB_SESSION_CAPABILITIES: WhatsAppTransportCapabilities = {
  text: true,
  media: false,
  contextualReply: false,
  templates: false,
  campaigns: false,
  metaDeliveryStatus: false,
  metaUsageLedger: false,
};

export function normalizeWhatsAppTransportProvider(value: unknown): WhatsAppTransportProvider | null {
  return value === "meta" || value === "web_session" ? value : null;
}

export function resolveWhatsAppTransportCapabilities(params: {
  provider: unknown;
  tenantFeatures?: TenantFeatureInput;
}): WhatsAppTransportCapabilityDecision {
  const provider = normalizeWhatsAppTransportProvider(params.provider);
  if (!provider) {
    return {
      ok: false,
      provider: typeof params.provider === "string" ? params.provider : "",
      available: false,
      reason: "unsupported_whatsapp_transport",
      capabilities: { ...NO_CAPABILITIES },
    };
  }

  if (provider === "meta") {
    return {
      ok: true,
      provider,
      available: true,
      reason: "available",
      capabilities: { ...META_CLOUD_CAPABILITIES },
    };
  }

  if (params.tenantFeatures?.whatsappWebSession !== true) {
    return {
      ok: true,
      provider,
      available: false,
      reason: "feature_disabled",
      capabilities: { ...NO_CAPABILITIES },
    };
  }

  return {
    ok: true,
    provider,
    available: true,
    reason: "available",
    capabilities: { ...WEB_SESSION_CAPABILITIES },
  };
}
