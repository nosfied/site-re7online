export type ClientFeatureKey = "departments" | "sla" | "reports" | "campaigns" | "chatbot";

export type ClientFeatures = Record<ClientFeatureKey, boolean>;
export type ClientProfile = "business" | "government";

export const DEFAULT_CLIENT_FEATURES: ClientFeatures = {
  departments: true,
  sla: true,
  reports: true,
  campaigns: true,
  chatbot: true,
};

type ClientWithFeatures = {
  features?: unknown;
};

type ClientWithProfile = {
  profile?: unknown;
};

function normalizeFeatureValue(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

export function getFeatures(client: ClientWithFeatures | null | undefined): ClientFeatures {
  const raw = client?.features;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_CLIENT_FEATURES };
  }
  const input = raw as Record<string, unknown>;
  return {
    departments: normalizeFeatureValue(input.departments) ?? DEFAULT_CLIENT_FEATURES.departments,
    sla: normalizeFeatureValue(input.sla) ?? DEFAULT_CLIENT_FEATURES.sla,
    reports: normalizeFeatureValue(input.reports) ?? DEFAULT_CLIENT_FEATURES.reports,
    campaigns: normalizeFeatureValue(input.campaigns) ?? DEFAULT_CLIENT_FEATURES.campaigns,
    chatbot: normalizeFeatureValue(input.chatbot) ?? DEFAULT_CLIENT_FEATURES.chatbot,
  };
}

export function hasFeature(
  client: ClientWithFeatures | null | undefined,
  featureName: ClientFeatureKey
) {
  return getFeatures(client)[featureName];
}

export function getClientProfile(client: ClientWithProfile | null | undefined): ClientProfile {
  return client?.profile === "government" ? "government" : "business";
}
