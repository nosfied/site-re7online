export type AppProfile = "business" | "government";

export type AppFeatureKey =
  | "dashboard"
  | "inbox"
  | "departments"
  | "users"
  | "templates"
  | "cannedReplies"
  | "sla"
  | "reports"
  | "campaigns"
  | "chatbot"
  | "training"
  | "support"
  | "knowledgeBase"
  | "scheduling"
  | "schedulingReminders"
  | "schedulingRemindersShadow"
  | "schedulingConfirmation"
  | "satisfaction"
  | "audioTranscription"
  | "audioTranscriptionRuntime"
  | "advancedSearch"
  | "advancedSearchRuntime"
  | "webchat"
  | "webchatOutbound"
  | "telegram"
  | "telegramInbound"
  | "telegramOutbound"
  | "whatsappWebSession"
  | "webhooks"
  | "mfa"
  | "mfaRequired"
  | "mfaEnforced";

export type FutureAppFeatureKey =
  | "governmentReports"
  | "poc"
  | "salesPipeline"
  | "instagramIntegration";

export type AppFeatures = Record<AppFeatureKey | FutureAppFeatureKey, boolean>;
export type TenantCapabilityKey =
  | AppFeatureKey
  | FutureAppFeatureKey
  | "crm"
  | "protocols"
  | "catalog"
  | "operationsBoard";
export type TenantCapabilities = AppFeatures & Record<"crm" | "protocols" | "catalog" | "operationsBoard", boolean>;

export const DEFAULT_BUSINESS_APP_FEATURES: Record<AppFeatureKey, boolean> = {
  dashboard: false,
  inbox: true,
  departments: true,
  users: true,
  templates: true,
  cannedReplies: true,
  sla: true,
  reports: true,
  campaigns: true,
  chatbot: true,
  training: true,
  support: true,
  knowledgeBase: false,
  scheduling: false,
  schedulingReminders: false,
  schedulingRemindersShadow: false,
  schedulingConfirmation: false,
  satisfaction: false,
  audioTranscription: false,
  audioTranscriptionRuntime: false,
  advancedSearch: false,
  advancedSearchRuntime: false,
  webchat: false,
  webchatOutbound: false,
  telegram: false,
  telegramInbound: false,
  telegramOutbound: false,
  whatsappWebSession: false,
  webhooks: false,
  mfa: false,
  mfaRequired: false,
  mfaEnforced: false,
};

export const DEFAULT_GOVERNMENT_APP_FEATURES: Record<AppFeatureKey, boolean> = {
  dashboard: true,
  inbox: true,
  departments: true,
  users: true,
  templates: false,
  cannedReplies: true,
  sla: true,
  reports: true,
  campaigns: false,
  chatbot: true,
  training: true,
  support: true,
  knowledgeBase: false,
  scheduling: false,
  schedulingReminders: false,
  schedulingRemindersShadow: false,
  schedulingConfirmation: false,
  satisfaction: false,
  audioTranscription: false,
  audioTranscriptionRuntime: false,
  advancedSearch: false,
  advancedSearchRuntime: false,
  webchat: false,
  webchatOutbound: false,
  telegram: false,
  telegramInbound: false,
  telegramOutbound: false,
  whatsappWebSession: false,
  webhooks: false,
  mfa: false,
  mfaRequired: false,
  mfaEnforced: false,
};

export const DEFAULT_FUTURE_APP_FEATURES: Record<FutureAppFeatureKey, boolean> = {
  governmentReports: false,
  poc: false,
  salesPipeline: false,
  instagramIntegration: false,
};

const DEFAULT_ADDITIONAL_CAPABILITIES: Record<"crm" | "protocols" | "catalog" | "operationsBoard", boolean> = {
  crm: false,
  protocols: true,
  catalog: false,
  operationsBoard: false,
};

export const DEFAULT_APP_FEATURES: AppFeatures = {
  ...DEFAULT_BUSINESS_APP_FEATURES,
  ...DEFAULT_FUTURE_APP_FEATURES,
};

type SessionLike = { features?: unknown; profile?: unknown } | null | undefined;

function normalizeBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function getAdditionalCapabilityDefaults(profile: AppProfile): Record<"crm" | "protocols" | "catalog" | "operationsBoard", boolean> {
  return {
    ...DEFAULT_ADDITIONAL_CAPABILITIES,
    crm: profile === "business",
  };
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
    inbox: normalizeBoolean(input.inbox) ?? defaults.inbox,
    departments: normalizeBoolean(input.departments) ?? defaults.departments,
    users: normalizeBoolean(input.users) ?? defaults.users,
    templates: normalizeBoolean(input.templates) ?? defaults.templates,
    cannedReplies: normalizeBoolean(input.cannedReplies) ?? defaults.cannedReplies,
    sla: normalizeBoolean(input.sla) ?? defaults.sla,
    reports: normalizeBoolean(input.reports) ?? defaults.reports,
    campaigns: normalizeBoolean(input.campaigns) ?? defaults.campaigns,
    chatbot: normalizeBoolean(input.chatbot) ?? defaults.chatbot,
    training: normalizeBoolean(input.training) ?? defaults.training,
    support: normalizeBoolean(input.support) ?? defaults.support,
    knowledgeBase: normalizeBoolean(input.knowledgeBase) ?? defaults.knowledgeBase,
    scheduling: normalizeBoolean(input.scheduling) ?? defaults.scheduling,
    schedulingReminders: normalizeBoolean(input.schedulingReminders) ?? defaults.schedulingReminders,
    schedulingRemindersShadow:
      normalizeBoolean(input.schedulingRemindersShadow) ?? defaults.schedulingRemindersShadow,
    schedulingConfirmation:
      normalizeBoolean(input.schedulingConfirmation) ?? defaults.schedulingConfirmation,
    satisfaction: normalizeBoolean(input.satisfaction) ?? defaults.satisfaction,
    audioTranscription: normalizeBoolean(input.audioTranscription) ?? defaults.audioTranscription,
    audioTranscriptionRuntime:
      normalizeBoolean(input.audioTranscriptionRuntime) ?? defaults.audioTranscriptionRuntime,
    advancedSearch: normalizeBoolean(input.advancedSearch) ?? defaults.advancedSearch,
    advancedSearchRuntime:
      normalizeBoolean(input.advancedSearchRuntime) ?? defaults.advancedSearchRuntime,
    webchat: normalizeBoolean(input.webchat) ?? defaults.webchat,
    webchatOutbound: normalizeBoolean(input.webchatOutbound) ?? defaults.webchatOutbound,
    telegram: normalizeBoolean(input.telegram) ?? defaults.telegram,
    telegramInbound: normalizeBoolean(input.telegramInbound) ?? defaults.telegramInbound,
    telegramOutbound: normalizeBoolean(input.telegramOutbound) ?? defaults.telegramOutbound,
    whatsappWebSession:
      normalizeBoolean(input.whatsappWebSession) ?? defaults.whatsappWebSession,
    webhooks: normalizeBoolean(input.webhooks) ?? defaults.webhooks,
    mfa: normalizeBoolean(input.mfa) ?? defaults.mfa,
    mfaRequired: normalizeBoolean(input.mfaRequired) ?? defaults.mfaRequired,
    mfaEnforced: normalizeBoolean(input.mfaEnforced) ?? defaults.mfaEnforced,
    governmentReports:
      normalizeBoolean(input.governmentReports) ?? DEFAULT_FUTURE_APP_FEATURES.governmentReports,
    poc: normalizeBoolean(input.poc) ?? DEFAULT_FUTURE_APP_FEATURES.poc,
    salesPipeline: normalizeBoolean(input.salesPipeline) ?? DEFAULT_FUTURE_APP_FEATURES.salesPipeline,
    instagramIntegration:
      normalizeBoolean(input.instagramIntegration) ??
      DEFAULT_FUTURE_APP_FEATURES.instagramIntegration,
  };
}

export function getTenantCapabilities(session: SessionLike): TenantCapabilities {
  const features = getAppFeatures(session);
  const additionalDefaults = getAdditionalCapabilityDefaults(getAppProfile(session));
  const raw = session?.features;
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    ...features,
    crm: normalizeBoolean(input.crm) ?? additionalDefaults.crm,
    protocols: normalizeBoolean(input.protocols) ?? additionalDefaults.protocols,
    catalog: normalizeBoolean(input.catalog) ?? additionalDefaults.catalog,
    operationsBoard: normalizeBoolean(input.operationsBoard) ?? additionalDefaults.operationsBoard,
  };
}

export function hasCapability(session: SessionLike, capabilityName: TenantCapabilityKey) {
  return getTenantCapabilities(session)[capabilityName];
}

export function hasAppFeature(session: SessionLike, featureName: AppFeatureKey) {
  return hasCapability(session, featureName);
}

export function getAppProfile(session: { profile?: unknown } | null | undefined): AppProfile {
  return session?.profile === "government" ? "government" : "business";
}
