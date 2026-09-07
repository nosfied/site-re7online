export type ClientFeatureKey =
  | "dashboard"
  | "inbox"
  | "departments"
  | "users"
  | "templates"
  | "cannedReplies"
  | "reports"
  | "campaigns"
  | "chatbot"
  | "training"
  | "support"
  | "knowledgeBase"
  | "scheduling"
  | "schedulingReminders"
  | "schedulingRemindersShadow"
  | "schedulingRemindersSend"
  | "schedulingConfirmation"
  | "satisfaction"
  | "operationalServiceMessages"
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
  | "browserPushNotifications"
  | "webhooks"
  | "webhookDispatch"
  | "webhookDispatchExecute"
  | "mfa"
  | "mfaRequired"
  | "mfaEnforced"
  | "sla";

export type ClientFeatures = Record<ClientFeatureKey, boolean>;
export type ClientProfile = "business" | "government";
export type TenantCapabilityKey =
  | ClientFeatureKey
  | "crm"
  | "protocols"
  | "catalog"
  | "salesPipeline"
  | "governmentReports"
  | "operationsBoard";
export type TenantCapabilities = ClientFeatures &
  Record<Exclude<TenantCapabilityKey, ClientFeatureKey>, boolean>;

export const DEFAULT_BUSINESS_CLIENT_FEATURES: ClientFeatures = {
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
  schedulingRemindersSend: false,
  schedulingConfirmation: false,
  satisfaction: false,
  operationalServiceMessages: false,
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
  browserPushNotifications: false,
  webhooks: false,
  webhookDispatch: false,
  webhookDispatchExecute: false,
  mfa: false,
  mfaRequired: false,
  mfaEnforced: false,
};

export const DEFAULT_GOVERNMENT_CLIENT_FEATURES: ClientFeatures = {
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
  schedulingRemindersSend: false,
  schedulingConfirmation: false,
  satisfaction: false,
  operationalServiceMessages: false,
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
  browserPushNotifications: false,
  webhooks: false,
  webhookDispatch: false,
  webhookDispatchExecute: false,
  mfa: false,
  mfaRequired: false,
  mfaEnforced: false,
};

export const DEFAULT_CLIENT_FEATURES = DEFAULT_BUSINESS_CLIENT_FEATURES;
const DEFAULT_ADDITIONAL_CAPABILITIES: Record<Exclude<TenantCapabilityKey, ClientFeatureKey>, boolean> = {
  crm: false,
  protocols: true,
  catalog: false,
  salesPipeline: false,
  governmentReports: false,
  operationsBoard: false,
};

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

function getAdditionalCapabilityDefaults(profile: ClientProfile): Record<Exclude<TenantCapabilityKey, ClientFeatureKey>, boolean> {
  return {
    ...DEFAULT_ADDITIONAL_CAPABILITIES,
    crm: profile === "business",
  };
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
    inbox: normalizeFeatureValue(input.inbox) ?? defaults.inbox,
    departments: normalizeFeatureValue(input.departments) ?? defaults.departments,
    users: normalizeFeatureValue(input.users) ?? defaults.users,
    templates: normalizeFeatureValue(input.templates) ?? defaults.templates,
    cannedReplies: normalizeFeatureValue(input.cannedReplies) ?? defaults.cannedReplies,
    sla: normalizeFeatureValue(input.sla) ?? defaults.sla,
    reports: normalizeFeatureValue(input.reports) ?? defaults.reports,
    campaigns: normalizeFeatureValue(input.campaigns) ?? defaults.campaigns,
    chatbot: normalizeFeatureValue(input.chatbot) ?? defaults.chatbot,
    training: normalizeFeatureValue(input.training) ?? defaults.training,
    support: normalizeFeatureValue(input.support) ?? defaults.support,
    knowledgeBase: normalizeFeatureValue(input.knowledgeBase) ?? defaults.knowledgeBase,
    scheduling: normalizeFeatureValue(input.scheduling) ?? defaults.scheduling,
    schedulingReminders: normalizeFeatureValue(input.schedulingReminders) ?? defaults.schedulingReminders,
    schedulingRemindersShadow:
      normalizeFeatureValue(input.schedulingRemindersShadow) ?? defaults.schedulingRemindersShadow,
    schedulingRemindersSend:
      normalizeFeatureValue(input.schedulingRemindersSend) ?? defaults.schedulingRemindersSend,
    schedulingConfirmation:
      normalizeFeatureValue(input.schedulingConfirmation) ?? defaults.schedulingConfirmation,
    satisfaction: normalizeFeatureValue(input.satisfaction) ?? defaults.satisfaction,
    operationalServiceMessages:
      normalizeFeatureValue(input.operationalServiceMessages) ?? defaults.operationalServiceMessages,
    audioTranscription:
      normalizeFeatureValue(input.audioTranscription) ?? defaults.audioTranscription,
    audioTranscriptionRuntime:
      normalizeFeatureValue(input.audioTranscriptionRuntime) ?? defaults.audioTranscriptionRuntime,
    advancedSearch: normalizeFeatureValue(input.advancedSearch) ?? defaults.advancedSearch,
    advancedSearchRuntime:
      normalizeFeatureValue(input.advancedSearchRuntime) ?? defaults.advancedSearchRuntime,
    webchat: normalizeFeatureValue(input.webchat) ?? defaults.webchat,
    webchatOutbound: normalizeFeatureValue(input.webchatOutbound) ?? defaults.webchatOutbound,
    telegram: normalizeFeatureValue(input.telegram) ?? defaults.telegram,
    telegramInbound: normalizeFeatureValue(input.telegramInbound) ?? defaults.telegramInbound,
    telegramOutbound: normalizeFeatureValue(input.telegramOutbound) ?? defaults.telegramOutbound,
    whatsappWebSession:
      normalizeFeatureValue(input.whatsappWebSession) ?? defaults.whatsappWebSession,
    browserPushNotifications:
      normalizeFeatureValue(input.browserPushNotifications) ?? defaults.browserPushNotifications,
    webhooks: normalizeFeatureValue(input.webhooks) ?? defaults.webhooks,
    webhookDispatch: normalizeFeatureValue(input.webhookDispatch) ?? defaults.webhookDispatch,
    webhookDispatchExecute:
      normalizeFeatureValue(input.webhookDispatchExecute) ?? defaults.webhookDispatchExecute,
    mfa: normalizeFeatureValue(input.mfa) ?? defaults.mfa,
    mfaRequired: normalizeFeatureValue(input.mfaRequired) ?? defaults.mfaRequired,
    mfaEnforced: normalizeFeatureValue(input.mfaEnforced) ?? defaults.mfaEnforced,
  };
}

export function resolveTenantCapabilities(
  client: ClientWithFeatures | null | undefined
): TenantCapabilities {
  const features = getFeatures(client);
  const additionalDefaults = getAdditionalCapabilityDefaults(getClientProfile(client));
  const raw = client?.features;
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    ...features,
    crm: normalizeFeatureValue(input.crm) ?? additionalDefaults.crm,
    protocols: normalizeFeatureValue(input.protocols) ?? additionalDefaults.protocols,
    catalog: normalizeFeatureValue(input.catalog) ?? additionalDefaults.catalog,
    salesPipeline:
      normalizeFeatureValue(input.salesPipeline) ?? additionalDefaults.salesPipeline,
    governmentReports:
      normalizeFeatureValue(input.governmentReports) ?? additionalDefaults.governmentReports,
    operationsBoard:
      normalizeFeatureValue(input.operationsBoard) ?? additionalDefaults.operationsBoard,
  };
}

export function hasCapability(
  client: ClientWithFeatures | null | undefined,
  capabilityName: TenantCapabilityKey
) {
  return resolveTenantCapabilities(client)[capabilityName];
}

export class CapabilityRequiredError extends Error {
  constructor(readonly capability: TenantCapabilityKey) {
    super(`capability_not_enabled:${capability}`);
    this.name = "CapabilityRequiredError";
  }
}

export function requireCapability(
  client: ClientWithFeatures | null | undefined,
  capabilityName: TenantCapabilityKey
) {
  if (!hasCapability(client, capabilityName)) {
    throw new CapabilityRequiredError(capabilityName);
  }
  return resolveTenantCapabilities(client);
}

export function hasFeature(
  client: ClientWithFeatures | null | undefined,
  featureName: ClientFeatureKey
) {
  return hasCapability(client, featureName);
}

export function getExplicitFeatureOverride(
  client: ClientWithFeatures | null | undefined,
  featureName: ClientFeatureKey
) {
  const raw = client?.features;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return normalizeFeatureValue((raw as Record<string, unknown>)[featureName]) ?? null;
}

export function resolveBrowserPushNotificationsFeature(
  client: ClientWithFeatures | null | undefined,
  activeLegacySubscriptions = 0
) {
  const explicit = getExplicitFeatureOverride(client, "browserPushNotifications");
  if (explicit !== null) return explicit;
  return activeLegacySubscriptions > 0;
}

export function getClientProfile(client: ClientWithProfile | null | undefined): ClientProfile {
  return client?.profile === "government" ? "government" : "business";
}
