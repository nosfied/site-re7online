import type { Prisma, PrismaClient } from "@prisma/client";
import { env } from "./env.js";
import {
  normalizeQualificationSchema,
  type AiQualificationSchema,
} from "../agent/qualification.js";
import {
  normalizeAiAssistantIntentCatalog,
  normalizeCrmBusinessStatuses,
  normalizeHandoffLeadNotificationRecipients,
  normalizeTenantMediaHandoffPolicy,
  type AiAssistantIntentCatalogItem,
  type CrmBusinessStatusConfig,
  type HandoffLeadNotificationRecipient,
  type TenantMediaHandoffPolicy,
  type TenantConfig,
} from "./tenantConfig.js";

export type TenantOperationalConfigValue = {
  crmBusinessStatuses?: CrmBusinessStatusConfig[];
  templates?: {
    manualHandoff?: string;
  };
  followUp?: FollowUpSettings;
  handoffLeadNotification?: HandoffLeadNotificationSettings;
  mediaHandoffPolicy?: TenantMediaHandoffPolicy;
  planLimits?: PlanLimitsSettings;
  automationFlags?: AutomationFlagsSettings;
  aiAssistantConfig?: AiAssistantConfigSettings;
  aiIntentQualification?: AiIntentQualificationSettings;
};

export type TenantOperationalConfigSource = "db" | "json_fallback";

export type ResolvedCrmBusinessStatuses = {
  statuses: CrmBusinessStatusConfig[];
  source: TenantOperationalConfigSource;
};

export type ResolvedManualHandoffTemplate = {
  templateName: string | null;
  source: TenantOperationalConfigSource;
};

export type FollowUpSettings = {
  enabled: boolean;
  delayMinutes: number;
  maxCount: number;
  useTemplate: boolean;
  templateName: string;
  templateLang: string;
};

export type ResolvedFollowUpSettings = {
  settings: FollowUpSettings;
  source: TenantOperationalConfigSource;
};

export type HandoffLeadNotificationSettings = {
  enabled: boolean;
  recipients: HandoffLeadNotificationRecipient[];
};

export type ResolvedHandoffLeadNotificationSettings = {
  settings: HandoffLeadNotificationSettings;
  source: TenantOperationalConfigSource;
};

export type ResolvedMediaHandoffPolicy = {
  policy: TenantMediaHandoffPolicy;
  source: TenantOperationalConfigSource;
};

export type PlanLimitsSettings = {
  planName: string | null;
  messagesLimit: number | null;
  quotaMonthlyConversations: number | null;
  quotaWarnAtPct: number;
  quotaBlockedReplyText: string | null;
  quotaExcludeWaIds: string[];
};

export type ResolvedPlanLimitsSettings = {
  settings: PlanLimitsSettings;
  source: TenantOperationalConfigSource;
};

export type AutomationFlagsSettings = {
  disableChatbot: boolean;
  disableAiFallback: boolean;
  disableIntentClassifier: boolean;
  disableLegacyFlows: boolean;
  disableChatbotFlowEditing: boolean;
};

export type ResolvedAutomationFlagsSettings = {
  settings: AutomationFlagsSettings;
  source: TenantOperationalConfigSource;
};

export type AiAssistantProfile = "business" | "government" | "legal_previdenciario";

export type AiAssistantConfigSettings = {
  aiBusinessContext: string;
  aiAssistantSystemPrompt: string;
  aiAssistantGreetingMessage: string;
  aiAssistantFallbackMessage: string;
  aiAssistantHandoffPrompt: string;
  aiAssistantAllowedTopics: string[];
  aiAssistantSecondaryTopics: string[];
  aiAssistantBlockedTerms: string[];
  aiAssistantHandoffKeywords: string[];
  aiAssistantMaxReplies: number;
  aiAssistantProfile: AiAssistantProfile;
};

export type ResolvedAiAssistantConfigSettings = {
  settings: AiAssistantConfigSettings;
  source: TenantOperationalConfigSource;
};

export type AiIntentQualificationSettings = {
  aiAssistantIntentCatalog: AiAssistantIntentCatalogItem[];
  aiQualification: AiQualificationSchema | null;
};

export type ResolvedAiIntentQualificationSettings = {
  settings: AiIntentQualificationSettings;
  source: TenantOperationalConfigSource;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeManualHandoffTemplate(input: unknown) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  return value ? value.slice(0, 120) : null;
}

function normalizePositiveInteger(input: unknown, fallback: number) {
  if (typeof input !== "number" || !Number.isFinite(input)) return fallback;
  return Math.max(1, Math.floor(input));
}

function normalizeNonNegativeInteger(input: unknown, fallback: number) {
  if (typeof input !== "number" || !Number.isFinite(input)) return fallback;
  return Math.max(0, Math.floor(input));
}

function normalizeTemplateName(input: unknown) {
  if (typeof input !== "string") return "";
  const value = input.trim();
  return /^[a-z0-9_]+$/.test(value) ? value.slice(0, 120) : "";
}

function normalizeTemplateLang(input: unknown, fallback?: string | null) {
  const value = typeof input === "string" ? input.trim() : "";
  if (/^[a-z]{2}_[A-Z]{2}$/.test(value)) return value;
  const fallbackValue = typeof fallback === "string" ? fallback.trim() : "";
  if (/^[a-z]{2}_[A-Z]{2}$/.test(fallbackValue)) return fallbackValue;
  return env.OUTBOUND_TEMPLATE_DEFAULT_LANG;
}

function normalizeFollowUpSettings(input: unknown, fallbackTenant?: Pick<TenantConfig, "defaultLanguage"> | null): FollowUpSettings {
  const record = isRecord(input) ? input : {};
  return {
    enabled: record.enabled === true,
    delayMinutes: normalizePositiveInteger(record.delayMinutes, env.FOLLOWUP_DEFAULT_DELAY_MINUTES),
    maxCount: normalizeNonNegativeInteger(record.maxCount, env.FOLLOWUP_MAX_PER_CONVERSATION),
    useTemplate: record.useTemplate === true,
    templateName: normalizeTemplateName(record.templateName),
    templateLang: normalizeTemplateLang(record.templateLang, fallbackTenant?.defaultLanguage),
  };
}

function normalizeFollowUpSettingsFromTenant(
  tenant?: Pick<
    TenantConfig,
    | "followUpEnabled"
    | "followUpDelayMinutes"
    | "followUpMaxCount"
    | "followUpUseTemplate"
    | "followUpTemplateName"
    | "followUpTemplateLang"
    | "defaultLanguage"
  > | null
): FollowUpSettings {
  return {
    enabled: tenant?.followUpEnabled === true,
    delayMinutes: normalizePositiveInteger(tenant?.followUpDelayMinutes, env.FOLLOWUP_DEFAULT_DELAY_MINUTES),
    maxCount: normalizeNonNegativeInteger(tenant?.followUpMaxCount, env.FOLLOWUP_MAX_PER_CONVERSATION),
    useTemplate: tenant?.followUpUseTemplate === true,
    templateName: normalizeTemplateName(tenant?.followUpTemplateName),
    templateLang: normalizeTemplateLang(tenant?.followUpTemplateLang, tenant?.defaultLanguage),
  };
}

function normalizeHandoffLeadNotificationSettings(input: unknown): HandoffLeadNotificationSettings {
  const record = isRecord(input) ? input : {};
  return {
    enabled: record.enabled === true,
    recipients: normalizeHandoffLeadNotificationRecipients(record.recipients),
  };
}

function normalizeHandoffLeadNotificationSettingsFromTenant(
  tenant?: Pick<
    TenantConfig,
    "handoffLeadNotificationEnabled" | "handoffLeadNotificationRecipients"
  > | null
): HandoffLeadNotificationSettings {
  return {
    enabled: tenant?.handoffLeadNotificationEnabled === true,
    recipients: normalizeHandoffLeadNotificationRecipients(tenant?.handoffLeadNotificationRecipients),
  };
}

function normalizeOptionalText(input: unknown, maxLength: number) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  return value ? value.slice(0, maxLength) : null;
}

function normalizeOptionalNonNegativeNumber(input: unknown) {
  if (typeof input !== "number" || !Number.isFinite(input) || input < 0) return null;
  return Math.floor(input);
}

function normalizeQuotaWarnAtPct(input: unknown) {
  if (typeof input !== "number" || !Number.isFinite(input)) return 0.8;
  return Math.min(1, Math.max(0, input));
}

function normalizeQuotaExcludeWaIds(input: unknown) {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((waId) => (typeof waId === "string" ? waId.replace(/\D/g, "") : ""))
        .filter(Boolean)
    )
  );
}

function normalizePlanLimitsSettings(input: unknown): PlanLimitsSettings {
  const record = isRecord(input) ? input : {};
  return {
    planName: normalizeOptionalText(record.planName, 80),
    messagesLimit: normalizeOptionalNonNegativeNumber(record.messagesLimit),
    quotaMonthlyConversations: normalizeOptionalNonNegativeNumber(record.quotaMonthlyConversations),
    quotaWarnAtPct: normalizeQuotaWarnAtPct(record.quotaWarnAtPct),
    quotaBlockedReplyText: normalizeOptionalText(record.quotaBlockedReplyText, 1000),
    quotaExcludeWaIds: normalizeQuotaExcludeWaIds(record.quotaExcludeWaIds),
  };
}

function normalizePlanLimitsSettingsFromTenant(
  tenant?: Pick<
    TenantConfig,
    | "planName"
    | "messagesLimit"
    | "quotaMonthlyConversations"
    | "quotaWarnAtPct"
    | "quotaBlockedReplyText"
    | "quotaExcludeWaIds"
  > | null
): PlanLimitsSettings {
  return normalizePlanLimitsSettings({
    planName: tenant?.planName,
    messagesLimit: tenant?.messagesLimit,
    quotaMonthlyConversations: tenant?.quotaMonthlyConversations,
    quotaWarnAtPct: tenant?.quotaWarnAtPct,
    quotaBlockedReplyText: tenant?.quotaBlockedReplyText,
    quotaExcludeWaIds: tenant?.quotaExcludeWaIds,
  });
}

function normalizeAutomationFlagsSettings(input: unknown): AutomationFlagsSettings {
  const record = isRecord(input) ? input : {};
  return {
    disableChatbot: record.disableChatbot === true,
    disableAiFallback: record.disableAiFallback === true,
    disableIntentClassifier: record.disableIntentClassifier === true,
    disableLegacyFlows: record.disableLegacyFlows !== false,
    disableChatbotFlowEditing: record.disableChatbotFlowEditing === true,
  };
}

function normalizeAutomationFlagsSettingsFromTenant(
  tenant?: Pick<
    TenantConfig,
    | "disableChatbot"
    | "disableAiFallback"
    | "disableIntentClassifier"
    | "disableLegacyFlows"
    | "disableChatbotFlowEditing"
  > | null
): AutomationFlagsSettings {
  return {
    disableChatbot: tenant?.disableChatbot === true,
    disableAiFallback: tenant?.disableAiFallback === true,
    disableIntentClassifier: tenant?.disableIntentClassifier === true,
    disableLegacyFlows: tenant?.disableLegacyFlows !== false,
    disableChatbotFlowEditing: tenant?.disableChatbotFlowEditing === true,
  };
}

function normalizeAiAssistantProfile(input: unknown): AiAssistantProfile {
  if (input === "government" || input === "legal_previdenciario") return input;
  return "business";
}

function normalizeAiAssistantText(input: unknown, maxLength: number) {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, maxLength);
}

function normalizeAiAssistantTermList(input: unknown) {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((term) => (typeof term === "string" ? term.trim() : ""))
        .filter(Boolean)
        .map((term) => term.slice(0, 120))
    )
  );
}

function normalizeAiAssistantConfigSettings(input: unknown): AiAssistantConfigSettings {
  const record = isRecord(input) ? input : {};
  return {
    aiBusinessContext: normalizeAiAssistantText(record.aiBusinessContext, 4000),
    aiAssistantSystemPrompt: normalizeAiAssistantText(record.aiAssistantSystemPrompt, 4000),
    aiAssistantGreetingMessage: normalizeAiAssistantText(record.aiAssistantGreetingMessage, 1000),
    aiAssistantFallbackMessage: normalizeAiAssistantText(record.aiAssistantFallbackMessage, 1000),
    aiAssistantHandoffPrompt: normalizeAiAssistantText(record.aiAssistantHandoffPrompt, 1000),
    aiAssistantAllowedTopics: normalizeAiAssistantTermList(record.aiAssistantAllowedTopics),
    aiAssistantSecondaryTopics: normalizeAiAssistantTermList(record.aiAssistantSecondaryTopics),
    aiAssistantBlockedTerms: normalizeAiAssistantTermList(record.aiAssistantBlockedTerms),
    aiAssistantHandoffKeywords: normalizeAiAssistantTermList(record.aiAssistantHandoffKeywords),
    aiAssistantMaxReplies: normalizeNonNegativeInteger(record.aiAssistantMaxReplies, 2),
    aiAssistantProfile: normalizeAiAssistantProfile(record.aiAssistantProfile),
  };
}

function normalizeAiAssistantConfigSettingsFromTenant(
  tenant?: Pick<
    TenantConfig,
    | "aiBusinessContext"
    | "aiAssistantSystemPrompt"
    | "aiAssistantGreetingMessage"
    | "aiAssistantFallbackMessage"
    | "aiAssistantHandoffPrompt"
    | "aiAssistantAllowedTopics"
    | "aiAssistantSecondaryTopics"
    | "aiAssistantBlockedTerms"
    | "aiAssistantHandoffKeywords"
    | "aiAssistantMaxReplies"
    | "aiAssistantProfile"
  > | null
): AiAssistantConfigSettings {
  return normalizeAiAssistantConfigSettings({
    aiBusinessContext: tenant?.aiBusinessContext,
    aiAssistantSystemPrompt: tenant?.aiAssistantSystemPrompt,
    aiAssistantGreetingMessage: tenant?.aiAssistantGreetingMessage,
    aiAssistantFallbackMessage: tenant?.aiAssistantFallbackMessage,
    aiAssistantHandoffPrompt: tenant?.aiAssistantHandoffPrompt,
    aiAssistantAllowedTopics: tenant?.aiAssistantAllowedTopics,
    aiAssistantSecondaryTopics: tenant?.aiAssistantSecondaryTopics,
    aiAssistantBlockedTerms: tenant?.aiAssistantBlockedTerms,
    aiAssistantHandoffKeywords: tenant?.aiAssistantHandoffKeywords,
    aiAssistantMaxReplies: tenant?.aiAssistantMaxReplies,
    aiAssistantProfile: tenant?.aiAssistantProfile,
  });
}

function normalizeAiIntentQualificationSettings(input: unknown): AiIntentQualificationSettings {
  const record = isRecord(input) ? input : {};
  return {
    aiAssistantIntentCatalog: normalizeAiAssistantIntentCatalog(record.aiAssistantIntentCatalog),
    aiQualification: Object.prototype.hasOwnProperty.call(record, "aiQualification")
      ? normalizeQualificationSchema(record.aiQualification) ?? null
      : null,
  };
}

function normalizeAiIntentQualificationSettingsFromTenant(
  tenant?: Pick<TenantConfig, "aiAssistantIntentCatalog" | "aiQualification"> | null
): AiIntentQualificationSettings {
  return {
    aiAssistantIntentCatalog: normalizeAiAssistantIntentCatalog(tenant?.aiAssistantIntentCatalog),
    aiQualification: normalizeQualificationSchema(tenant?.aiQualification) ?? null,
  };
}

function parseOperationalConfig(value: unknown): TenantOperationalConfigValue {
  if (!isRecord(value)) return {};
  const config: TenantOperationalConfigValue = {};
  if (Object.prototype.hasOwnProperty.call(value, "crmBusinessStatuses")) {
    config.crmBusinessStatuses = normalizeCrmBusinessStatuses(value.crmBusinessStatuses);
  }
  if (isRecord(value.templates)) {
    const manualHandoff = normalizeManualHandoffTemplate(value.templates.manualHandoff);
    if (manualHandoff) {
      config.templates = { manualHandoff };
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, "followUp")) {
    config.followUp = normalizeFollowUpSettings(value.followUp);
  }
  if (Object.prototype.hasOwnProperty.call(value, "handoffLeadNotification")) {
    config.handoffLeadNotification = normalizeHandoffLeadNotificationSettings(value.handoffLeadNotification);
  }
  if (Object.prototype.hasOwnProperty.call(value, "mediaHandoffPolicy")) {
    config.mediaHandoffPolicy = normalizeTenantMediaHandoffPolicy(value.mediaHandoffPolicy);
  }
  if (Object.prototype.hasOwnProperty.call(value, "planLimits")) {
    config.planLimits = normalizePlanLimitsSettings(value.planLimits);
  }
  if (Object.prototype.hasOwnProperty.call(value, "automationFlags")) {
    config.automationFlags = normalizeAutomationFlagsSettings(value.automationFlags);
  }
  if (Object.prototype.hasOwnProperty.call(value, "aiAssistantConfig")) {
    config.aiAssistantConfig = normalizeAiAssistantConfigSettings(value.aiAssistantConfig);
  }
  if (Object.prototype.hasOwnProperty.call(value, "aiIntentQualification")) {
    config.aiIntentQualification = normalizeAiIntentQualificationSettings(value.aiIntentQualification);
  }
  return config;
}

export async function resolveCrmBusinessStatuses(params: {
  prisma: PrismaClient;
  clientId: string;
  tenant?: Pick<TenantConfig, "crmBusinessStatuses"> | null;
}): Promise<ResolvedCrmBusinessStatuses> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const dbConfig = parseOperationalConfig(record?.config);
  if (dbConfig.crmBusinessStatuses) {
    return {
      statuses: dbConfig.crmBusinessStatuses,
      source: "db",
    };
  }
  return {
    statuses: normalizeCrmBusinessStatuses(params.tenant?.crmBusinessStatuses),
    source: "json_fallback",
  };
}

export async function resolveManualHandoffTemplate(params: {
  prisma: PrismaClient;
  clientId: string;
  tenant?: Pick<TenantConfig, "templates"> | null;
}): Promise<ResolvedManualHandoffTemplate> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const dbConfig = parseOperationalConfig(record?.config);
  if (dbConfig.templates?.manualHandoff) {
    return {
      templateName: dbConfig.templates.manualHandoff,
      source: "db",
    };
  }
  return {
    templateName: normalizeManualHandoffTemplate(params.tenant?.templates?.manualHandoff),
    source: "json_fallback",
  };
}

export async function resolveFollowUpSettings(params: {
  prisma: PrismaClient;
  clientId: string;
  tenant?: Pick<
    TenantConfig,
    | "followUpEnabled"
    | "followUpDelayMinutes"
    | "followUpMaxCount"
    | "followUpUseTemplate"
    | "followUpTemplateName"
    | "followUpTemplateLang"
    | "defaultLanguage"
  > | null;
}): Promise<ResolvedFollowUpSettings> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const dbConfig = parseOperationalConfig(record?.config);
  if (dbConfig.followUp) {
    return {
      settings: dbConfig.followUp,
      source: "db",
    };
  }
  return {
    settings: normalizeFollowUpSettingsFromTenant(params.tenant),
    source: "json_fallback",
  };
}

export async function saveFollowUpSettings(params: {
  prisma: PrismaClient;
  clientId: string;
  settings: Partial<FollowUpSettings>;
  tenant?: Pick<
    TenantConfig,
    | "followUpEnabled"
    | "followUpDelayMinutes"
    | "followUpMaxCount"
    | "followUpUseTemplate"
    | "followUpTemplateName"
    | "followUpTemplateLang"
    | "defaultLanguage"
  > | null;
}) {
  const existing = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
  const currentFollowUp = parseOperationalConfig(existing?.config).followUp
    ?? normalizeFollowUpSettingsFromTenant(params.tenant);
  const nextFollowUp = normalizeFollowUpSettings({
    ...currentFollowUp,
    ...params.settings,
  }, params.tenant);
  const nextConfig = {
    ...existingConfig,
    followUp: nextFollowUp,
  };
  const saved = await params.prisma.tenantOperationalConfig.upsert({
    where: { clientId: params.clientId },
    update: {
      config: nextConfig as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
    create: {
      clientId: params.clientId,
      config: nextConfig as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
    select: {
      id: true,
      schemaVersion: true,
      updatedAt: true,
    },
  });
  return {
    record: saved,
    settings: nextFollowUp,
  };
}

export async function resolveHandoffLeadNotificationSettings(params: {
  prisma: PrismaClient;
  clientId: string;
  tenant?: Pick<
    TenantConfig,
    "handoffLeadNotificationEnabled" | "handoffLeadNotificationRecipients"
  > | null;
}): Promise<ResolvedHandoffLeadNotificationSettings> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const dbConfig = parseOperationalConfig(record?.config);
  if (dbConfig.handoffLeadNotification) {
    return {
      settings: dbConfig.handoffLeadNotification,
      source: "db",
    };
  }
  return {
    settings: normalizeHandoffLeadNotificationSettingsFromTenant(params.tenant),
    source: "json_fallback",
  };
}

export async function saveHandoffLeadNotificationSettings(params: {
  prisma: PrismaClient;
  clientId: string;
  settings: Partial<HandoffLeadNotificationSettings>;
  tenant?: Pick<
    TenantConfig,
    "handoffLeadNotificationEnabled" | "handoffLeadNotificationRecipients"
  > | null;
}) {
  const existing = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
  const currentSettings = parseOperationalConfig(existing?.config).handoffLeadNotification
    ?? normalizeHandoffLeadNotificationSettingsFromTenant(params.tenant);
  const nextSettings: HandoffLeadNotificationSettings = {
    enabled: params.settings.enabled ?? currentSettings.enabled,
    recipients: params.settings.recipients
      ? normalizeHandoffLeadNotificationRecipients(params.settings.recipients)
      : currentSettings.recipients,
  };
  const nextConfig = {
    ...existingConfig,
    handoffLeadNotification: nextSettings,
  };
  const saved = await params.prisma.tenantOperationalConfig.upsert({
    where: { clientId: params.clientId },
    update: {
      config: nextConfig as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
    create: {
      clientId: params.clientId,
      config: nextConfig as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
    select: {
      id: true,
      schemaVersion: true,
      updatedAt: true,
    },
  });
  return {
    record: saved,
    settings: nextSettings,
  };
}

export async function resolveMediaHandoffPolicy(params: {
  prisma: PrismaClient;
  clientId: string;
  tenant?: Pick<TenantConfig, "mediaHandoffPolicy"> | null;
}): Promise<ResolvedMediaHandoffPolicy> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const dbConfig = parseOperationalConfig(record?.config);
  if (dbConfig.mediaHandoffPolicy) {
    return {
      policy: dbConfig.mediaHandoffPolicy,
      source: "db",
    };
  }
  return {
    policy: normalizeTenantMediaHandoffPolicy(params.tenant?.mediaHandoffPolicy),
    source: "json_fallback",
  };
}

export async function saveMediaHandoffPolicy(params: {
  prisma: PrismaClient;
  clientId: string;
  policy: TenantMediaHandoffPolicy;
}) {
  const existing = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
  const nextPolicy = normalizeTenantMediaHandoffPolicy(params.policy);
  const nextConfig = {
    ...existingConfig,
    mediaHandoffPolicy: nextPolicy,
  };
  const saved = await params.prisma.tenantOperationalConfig.upsert({
    where: { clientId: params.clientId },
    update: {
      config: nextConfig as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
    create: {
      clientId: params.clientId,
      config: nextConfig as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
    select: {
      id: true,
      schemaVersion: true,
      updatedAt: true,
    },
  });
  return {
    record: saved,
    policy: nextPolicy,
  };
}

export async function resolvePlanLimitsSettings(params: {
  prisma: PrismaClient;
  clientId: string;
  tenant?: Pick<
    TenantConfig,
    | "planName"
    | "messagesLimit"
    | "quotaMonthlyConversations"
    | "quotaWarnAtPct"
    | "quotaBlockedReplyText"
    | "quotaExcludeWaIds"
  > | null;
}): Promise<ResolvedPlanLimitsSettings> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const dbConfig = parseOperationalConfig(record?.config);
  if (dbConfig.planLimits) {
    return {
      settings: dbConfig.planLimits,
      source: "db",
    };
  }
  return {
    settings: normalizePlanLimitsSettingsFromTenant(params.tenant),
    source: "json_fallback",
  };
}

export async function savePlanLimitsSettings(params: {
  prisma: PrismaClient;
  clientId: string;
  settings: Partial<PlanLimitsSettings>;
  tenant?: Pick<
    TenantConfig,
    | "planName"
    | "messagesLimit"
    | "quotaMonthlyConversations"
    | "quotaWarnAtPct"
    | "quotaBlockedReplyText"
    | "quotaExcludeWaIds"
  > | null;
}) {
  const existing = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
  const currentSettings = parseOperationalConfig(existing?.config).planLimits
    ?? normalizePlanLimitsSettingsFromTenant(params.tenant);
  const nextSettings = normalizePlanLimitsSettings({
    ...currentSettings,
    ...params.settings,
  });
  const nextConfig = {
    ...existingConfig,
    planLimits: nextSettings,
  };
  const saved = await params.prisma.tenantOperationalConfig.upsert({
    where: { clientId: params.clientId },
    update: {
      config: nextConfig as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
    create: {
      clientId: params.clientId,
      config: nextConfig as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
    select: {
      id: true,
      schemaVersion: true,
      updatedAt: true,
    },
  });
  return {
    record: saved,
    settings: nextSettings,
  };
}

export async function resolveAutomationFlagsSettings(params: {
  prisma: PrismaClient;
  clientId: string;
  tenant?: Pick<
    TenantConfig,
    | "disableChatbot"
    | "disableAiFallback"
    | "disableIntentClassifier"
    | "disableLegacyFlows"
    | "disableChatbotFlowEditing"
  > | null;
}): Promise<ResolvedAutomationFlagsSettings> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const dbConfig = parseOperationalConfig(record?.config);
  if (dbConfig.automationFlags) {
    return {
      settings: dbConfig.automationFlags,
      source: "db",
    };
  }
  return {
    settings: normalizeAutomationFlagsSettingsFromTenant(params.tenant),
    source: "json_fallback",
  };
}

export async function saveAutomationFlagsSettings(params: {
  prisma: PrismaClient;
  clientId: string;
  settings: Partial<AutomationFlagsSettings>;
  tenant?: Pick<
    TenantConfig,
    | "disableChatbot"
    | "disableAiFallback"
    | "disableIntentClassifier"
    | "disableLegacyFlows"
    | "disableChatbotFlowEditing"
  > | null;
}) {
  const existing = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
  const currentSettings = parseOperationalConfig(existing?.config).automationFlags
    ?? normalizeAutomationFlagsSettingsFromTenant(params.tenant);
  const nextSettings = normalizeAutomationFlagsSettings({
    ...currentSettings,
    ...params.settings,
  });
  const nextConfig = {
    ...existingConfig,
    automationFlags: nextSettings,
  };
  const saved = await params.prisma.tenantOperationalConfig.upsert({
    where: { clientId: params.clientId },
    update: {
      config: nextConfig as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
    create: {
      clientId: params.clientId,
      config: nextConfig as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
    select: {
      id: true,
      schemaVersion: true,
      updatedAt: true,
    },
  });
  return {
    record: saved,
    settings: nextSettings,
  };
}

export async function resolveAiAssistantConfigSettings(params: {
  prisma: PrismaClient;
  clientId: string;
  tenant?: Pick<
    TenantConfig,
    | "aiBusinessContext"
    | "aiAssistantSystemPrompt"
    | "aiAssistantGreetingMessage"
    | "aiAssistantFallbackMessage"
    | "aiAssistantHandoffPrompt"
    | "aiAssistantAllowedTopics"
    | "aiAssistantSecondaryTopics"
    | "aiAssistantBlockedTerms"
    | "aiAssistantHandoffKeywords"
    | "aiAssistantMaxReplies"
    | "aiAssistantProfile"
  > | null;
}): Promise<ResolvedAiAssistantConfigSettings> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const dbConfig = parseOperationalConfig(record?.config);
  if (dbConfig.aiAssistantConfig) {
    return {
      settings: dbConfig.aiAssistantConfig,
      source: "db",
    };
  }
  return {
    settings: normalizeAiAssistantConfigSettingsFromTenant(params.tenant),
    source: "json_fallback",
  };
}

export async function saveAiAssistantConfigSettings(params: {
  prisma: PrismaClient;
  clientId: string;
  settings: Partial<AiAssistantConfigSettings>;
  tenant?: Pick<
    TenantConfig,
    | "aiBusinessContext"
    | "aiAssistantSystemPrompt"
    | "aiAssistantGreetingMessage"
    | "aiAssistantFallbackMessage"
    | "aiAssistantHandoffPrompt"
    | "aiAssistantAllowedTopics"
    | "aiAssistantSecondaryTopics"
    | "aiAssistantBlockedTerms"
    | "aiAssistantHandoffKeywords"
    | "aiAssistantMaxReplies"
    | "aiAssistantProfile"
  > | null;
}) {
  const existing = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
  const currentSettings = parseOperationalConfig(existing?.config).aiAssistantConfig
    ?? normalizeAiAssistantConfigSettingsFromTenant(params.tenant);
  const nextSettings = normalizeAiAssistantConfigSettings({
    ...currentSettings,
    ...params.settings,
  });
  const nextConfig = {
    ...existingConfig,
    aiAssistantConfig: nextSettings,
  };
  const saved = await params.prisma.tenantOperationalConfig.upsert({
    where: { clientId: params.clientId },
    update: {
      config: nextConfig as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
    create: {
      clientId: params.clientId,
      config: nextConfig as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
    select: {
      id: true,
      schemaVersion: true,
      updatedAt: true,
    },
  });
  return {
    record: saved,
    settings: nextSettings,
  };
}

export function applyAiAssistantConfigToTenant<T extends Partial<TenantConfig>>(
  tenant: T,
  settings: AiAssistantConfigSettings
): T & AiAssistantConfigSettings {
  return {
    ...tenant,
    ...settings,
  };
}

export async function resolveAiIntentQualificationSettings(params: {
  prisma: PrismaClient;
  clientId: string;
  tenant?: Pick<TenantConfig, "aiAssistantIntentCatalog" | "aiQualification"> | null;
}): Promise<ResolvedAiIntentQualificationSettings> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const fallback = normalizeAiIntentQualificationSettingsFromTenant(params.tenant);
  const dbConfig = parseOperationalConfig(record?.config);
  if (dbConfig.aiIntentQualification) {
    return {
      settings: {
        aiAssistantIntentCatalog: dbConfig.aiIntentQualification.aiAssistantIntentCatalog,
        aiQualification: dbConfig.aiIntentQualification.aiQualification,
      },
      source: "db",
    };
  }
  return {
    settings: fallback,
    source: "json_fallback",
  };
}

export async function saveAiIntentQualificationSettings(params: {
  prisma: PrismaClient;
  clientId: string;
  settings: Partial<AiIntentQualificationSettings>;
  tenant?: Pick<TenantConfig, "aiAssistantIntentCatalog" | "aiQualification"> | null;
}) {
  const existing = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
  const currentSettings = parseOperationalConfig(existing?.config).aiIntentQualification
    ?? normalizeAiIntentQualificationSettingsFromTenant(params.tenant);
  const nextSettings: AiIntentQualificationSettings = {
    aiAssistantIntentCatalog: Object.prototype.hasOwnProperty.call(params.settings, "aiAssistantIntentCatalog")
      ? normalizeAiAssistantIntentCatalog(params.settings.aiAssistantIntentCatalog)
      : currentSettings.aiAssistantIntentCatalog,
    aiQualification: Object.prototype.hasOwnProperty.call(params.settings, "aiQualification")
      ? normalizeQualificationSchema(params.settings.aiQualification) ?? null
      : currentSettings.aiQualification,
  };
  const nextConfig = {
    ...existingConfig,
    aiIntentQualification: nextSettings,
  };
  const saved = await params.prisma.tenantOperationalConfig.upsert({
    where: { clientId: params.clientId },
    update: {
      config: nextConfig as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
    create: {
      clientId: params.clientId,
      config: nextConfig as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
    select: {
      id: true,
      schemaVersion: true,
      updatedAt: true,
    },
  });
  return {
    record: saved,
    settings: nextSettings,
  };
}

export function applyAiIntentQualificationToTenant<T extends Partial<TenantConfig>>(
  tenant: T,
  settings: AiIntentQualificationSettings
): T & {
  aiAssistantIntentCatalog: AiAssistantIntentCatalogItem[];
  aiQualification?: AiQualificationSchema;
} {
  const nextTenant = {
    ...tenant,
    aiAssistantIntentCatalog: settings.aiAssistantIntentCatalog,
  } as T & {
    aiAssistantIntentCatalog: AiAssistantIntentCatalogItem[];
    aiQualification?: AiQualificationSchema;
  };
  if (settings.aiQualification) {
    nextTenant.aiQualification = settings.aiQualification;
  } else {
    delete nextTenant.aiQualification;
  }
  return nextTenant;
}

export async function saveCrmBusinessStatuses(params: {
  prisma: PrismaClient;
  clientId: string;
  statuses: CrmBusinessStatusConfig[];
}) {
  const normalized = normalizeCrmBusinessStatuses(params.statuses);
  const existing = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
  const nextConfig = {
    ...existingConfig,
    crmBusinessStatuses: normalized,
  };
  const saved = await params.prisma.tenantOperationalConfig.upsert({
    where: { clientId: params.clientId },
    update: {
      config: nextConfig as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
    create: {
      clientId: params.clientId,
      config: nextConfig as Prisma.InputJsonValue,
      schemaVersion: 1,
    },
    select: {
      id: true,
      schemaVersion: true,
      updatedAt: true,
    },
  });
  return {
    record: saved,
    statuses: normalized,
  };
}
