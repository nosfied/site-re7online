export type AppProfile = "business" | "government";

export type AppFeatureKey =
  | "dashboard"
  | "departments"
  | "users"
  | "templates"
  | "sla"
  | "reports"
  | "campaigns"
  | "chatbot"
  | "knowledgeBase"
  | "scheduling"
  | "schedulingReminders"
  | "schedulingRemindersShadow"
  | "schedulingConfirmation"
  | "satisfaction"
  | "webchat"
  | "webchatOutbound"
  | "webhooks";

export type FutureAppFeatureKey =
  | "governmentReports"
  | "poc"
  | "salesPipeline"
  | "instagramIntegration";

export type AppFeatures = Record<AppFeatureKey | FutureAppFeatureKey, boolean>;

export const DEFAULT_BUSINESS_APP_FEATURES: Record<AppFeatureKey, boolean> = {
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
  schedulingReminders: false,
  schedulingRemindersShadow: false,
  schedulingConfirmation: false,
  satisfaction: false,
  webchat: false,
  webchatOutbound: false,
  webhooks: false,
};

export const DEFAULT_GOVERNMENT_APP_FEATURES: Record<AppFeatureKey, boolean> = {
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
  schedulingReminders: false,
  schedulingRemindersShadow: false,
  schedulingConfirmation: false,
  satisfaction: false,
  webchat: false,
  webchatOutbound: false,
  webhooks: false,
};

export const DEFAULT_FUTURE_APP_FEATURES: Record<FutureAppFeatureKey, boolean> = {
  governmentReports: false,
  poc: false,
  salesPipeline: false,
  instagramIntegration: false,
};

export const DEFAULT_APP_FEATURES: AppFeatures = {
  ...DEFAULT_BUSINESS_APP_FEATURES,
  ...DEFAULT_FUTURE_APP_FEATURES,
};

type SessionLike = { features?: unknown; profile?: unknown } | null | undefined;

function normalizeBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

export function getAppFeatures(session: SessionLike): AppFeatures {
  const defaults =
    getAppProfile(session) === "government"
      ? DEFAULT_GOVERNMENT_APP_FEATURES
      : DEFAULT_BUSINESS_APP_FEATURES;
  const raw = session?.features;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...defaults, ...DEFAULT_FUTURE_APP_FEATURES };
  }
  const input = raw as Record<string, unknown>;
  return {
    dashboard: normalizeBoolean(input.dashboard) ?? defaults.dashboard,
    departments: normalizeBoolean(input.departments) ?? defaults.departments,
    users: normalizeBoolean(input.users) ?? defaults.users,
    templates: normalizeBoolean(input.templates) ?? defaults.templates,
    sla: normalizeBoolean(input.sla) ?? defaults.sla,
    reports: normalizeBoolean(input.reports) ?? defaults.reports,
    campaigns: normalizeBoolean(input.campaigns) ?? defaults.campaigns,
    chatbot: normalizeBoolean(input.chatbot) ?? defaults.chatbot,
    knowledgeBase: normalizeBoolean(input.knowledgeBase) ?? defaults.knowledgeBase,
    scheduling: normalizeBoolean(input.scheduling) ?? defaults.scheduling,
    schedulingReminders: normalizeBoolean(input.schedulingReminders) ?? defaults.schedulingReminders,
    schedulingRemindersShadow:
      normalizeBoolean(input.schedulingRemindersShadow) ?? defaults.schedulingRemindersShadow,
    schedulingConfirmation:
      normalizeBoolean(input.schedulingConfirmation) ?? defaults.schedulingConfirmation,
    satisfaction: normalizeBoolean(input.satisfaction) ?? defaults.satisfaction,
    webchat: normalizeBoolean(input.webchat) ?? defaults.webchat,
    webchatOutbound: normalizeBoolean(input.webchatOutbound) ?? defaults.webchatOutbound,
    webhooks: normalizeBoolean(input.webhooks) ?? defaults.webhooks,
    governmentReports:
      normalizeBoolean(input.governmentReports) ?? DEFAULT_FUTURE_APP_FEATURES.governmentReports,
    poc: normalizeBoolean(input.poc) ?? DEFAULT_FUTURE_APP_FEATURES.poc,
    salesPipeline: normalizeBoolean(input.salesPipeline) ?? DEFAULT_FUTURE_APP_FEATURES.salesPipeline,
    instagramIntegration:
      normalizeBoolean(input.instagramIntegration) ??
      DEFAULT_FUTURE_APP_FEATURES.instagramIntegration,
  };
}

export function hasAppFeature(session: SessionLike, featureName: AppFeatureKey) {
  return getAppFeatures(session)[featureName];
}

export function getAppProfile(session: { profile?: unknown } | null | undefined): AppProfile {
  return session?.profile === "government" ? "government" : "business";
}
