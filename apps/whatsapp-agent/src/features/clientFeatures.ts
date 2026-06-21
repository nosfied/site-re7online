export type ClientFeatureKey =
  | "dashboard"
  | "departments"
  | "users"
  | "templates"
  | "reports"
  | "campaigns"
  | "chatbot"
  | "knowledgeBase"
  | "scheduling"
  | "satisfaction"
  | "sla";

export type ClientFeatures = Record<ClientFeatureKey, boolean>;
export type ClientProfile = "business" | "government";

export const DEFAULT_BUSINESS_CLIENT_FEATURES: ClientFeatures = {
  dashboard: false,
  departments: true,
  users: true,
  templates: true,
  sla: true,
  reports: true,
  campaigns: true,
  chatbot: true,
  knowledgeBase: false,
  scheduling: false,
  satisfaction: false,
};

export const DEFAULT_GOVERNMENT_CLIENT_FEATURES: ClientFeatures = {
  dashboard: true,
  departments: true,
  users: true,
  templates: false,
  sla: true,
  reports: true,
  campaigns: false,
  chatbot: true,
  knowledgeBase: false,
  scheduling: false,
  satisfaction: false,
};

export const DEFAULT_CLIENT_FEATURES = DEFAULT_BUSINESS_CLIENT_FEATURES;

type ClientWithFeatures = {
  features?: unknown;
  profile?: unknown;
};

type ClientWithProfile = {
  profile?: unknown;
};

function normalizeFeatureValue(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

export function getFeatures(client: ClientWithFeatures | null | undefined): ClientFeatures {
  const defaults =
    getClientProfile(client) === "government"
      ? DEFAULT_GOVERNMENT_CLIENT_FEATURES
      : DEFAULT_BUSINESS_CLIENT_FEATURES;
  const raw = client?.features;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...defaults };
  }
  const input = raw as Record<string, unknown>;
  return {
    dashboard: normalizeFeatureValue(input.dashboard) ?? defaults.dashboard,
    departments: normalizeFeatureValue(input.departments) ?? defaults.departments,
    users: normalizeFeatureValue(input.users) ?? defaults.users,
    templates: normalizeFeatureValue(input.templates) ?? defaults.templates,
    sla: normalizeFeatureValue(input.sla) ?? defaults.sla,
    reports: normalizeFeatureValue(input.reports) ?? defaults.reports,
    campaigns: normalizeFeatureValue(input.campaigns) ?? defaults.campaigns,
    chatbot: normalizeFeatureValue(input.chatbot) ?? defaults.chatbot,
    knowledgeBase: normalizeFeatureValue(input.knowledgeBase) ?? defaults.knowledgeBase,
    scheduling: normalizeFeatureValue(input.scheduling) ?? defaults.scheduling,
    satisfaction: normalizeFeatureValue(input.satisfaction) ?? defaults.satisfaction,
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
