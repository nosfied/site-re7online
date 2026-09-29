import { withLockedTenantOperationalConfig } from "./tenantOperationalConfigStore.js";
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
  runtimeLimits?: RuntimeLimitsSettings;
  agentSignature?: AgentSignatureSettings;
  followUp?: FollowUpSettings;
  handoffLeadNotification?: HandoffLeadNotificationSettings;
  mediaHandoffPolicy?: TenantMediaHandoffPolicy;
  whatsappMediaPolicy?: WhatsappMediaPolicy;
  planLimits?: PlanLimitsSettings;
  automationFlags?: AutomationFlagsSettings;
  aiAssistantConfig?: AiAssistantConfigSettings;
  aiIntentQualification?: AiIntentQualificationSettings;
  webSessionAlertEmails?: string[];
  inboxVisibilityPolicy?: InboxVisibilityPolicy;
  allowInteractiveContactStartViaWebSession?: boolean;
  whatsappTransports?: WhatsappTransportRoutingSettings;
  whatsappTemplatePolicy?: WhatsappTemplatePolicySettings;
  satisfactionPolicy?: SatisfactionPolicySettings;
  serviceMessages?: ServiceMessagePolicySettings;
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

export type WhatsappMediaKind = "image" | "audio" | "video" | "document";
export type WhatsappMediaDirection = "inbound" | "outbound";

export type WhatsappMediaPolicyDirection = Record<WhatsappMediaKind, boolean>;

export type WhatsappMediaPolicy = {
  inbound: WhatsappMediaPolicyDirection;
  outbound: WhatsappMediaPolicyDirection;
};

export type ResolvedWhatsappMediaPolicy = {
  policy: WhatsappMediaPolicy;
  source: TenantOperationalConfigSource;
};

export type ResolvedWebSessionAlertEmails = {
  emails: string[];
  source: TenantOperationalConfigSource;
};

export type ResolvedInteractiveContactStartPolicy = {
  allowInteractiveContactStartViaWebSession: boolean;
  source: TenantOperationalConfigSource;
};

export type WhatsappTransportRoutingKey = "meta" | "webSession";

export type WhatsappTransportRoutingSettings = {
  meta?: {
    enabledForRouting: boolean;
  };
  webSession?: {
    enabledForRouting: boolean;
  };
};

export type ResolvedWhatsappTransportRoutingSettings = {
  settings: WhatsappTransportRoutingSettings;
  source: TenantOperationalConfigSource;
};

export type WhatsappTemplateCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";

export const WHATSAPP_TEMPLATE_CATEGORIES: WhatsappTemplateCategory[] = [
  "UTILITY",
  "MARKETING",
  "AUTHENTICATION",
];

export type WhatsappTemplatePolicySettings = {
  allowedCategories?: WhatsappTemplateCategory[];
};

export type ResolvedWhatsappTemplatePolicySettings = {
  settings: WhatsappTemplatePolicySettings;
  source: TenantOperationalConfigSource;
  unrestricted: boolean;
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

export type RuntimeLimitsSettings = {
  maxActiveAppUsers: number | null;
};

export type ResolvedRuntimeLimitsSettings = {
  settings: RuntimeLimitsSettings;
  source: TenantOperationalConfigSource;
};

export type SatisfactionEligibility = "HUMAN_ONLY" | "DIRECTED_SERVICE";

export type SatisfactionPolicySettings = {
  enabled: boolean;
  questionText: string;
  commentEnabled: boolean;
  commentOfferText: string;
  commentPromptText: string;
  thankYouText: string;
  newServiceGateText: string;
  ttlMinutes: number;
  eligibility: SatisfactionEligibility;
};

export type ResolvedSatisfactionPolicySettings = {
  settings: SatisfactionPolicySettings;
  source: TenantOperationalConfigSource;
};

export type ServiceMessageToggleTextSettings = {
  enabled: boolean;
  text: string | null;
};

export type ServiceMessageCloseNoticeSettings = {
  enabled: boolean;
};

export type ServiceMessagePolicySettings = {
  protocolNotice: ServiceMessageToggleTextSettings;
  queuePositionNotice: ServiceMessageToggleTextSettings;
  closeNotice: ServiceMessageCloseNoticeSettings;
};

export type ResolvedServiceMessagePolicySettings = {
  settings: ServiceMessagePolicySettings;
  source: TenantOperationalConfigSource;
};

export type ChatbotCloseMessageSettings = {
  closedMessage: string;
};

export type ResolvedChatbotCloseMessageSettings = {
  settings: ChatbotCloseMessageSettings;
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

export type AgentSignatureSettings = {
  enabled: boolean;
  mode: "user_name";
  format: "bold_line";
};

export type ResolvedAgentSignatureSettings = {
  settings: AgentSignatureSettings;
  source: TenantOperationalConfigSource;
};

export type InboxVisibilityPolicy = "shared" | "assignee_only_after_assignment";

export type ResolvedInboxVisibilityPolicy = {
  policy: InboxVisibilityPolicy;
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

export function getDefaultAgentSignatureSettings(): AgentSignatureSettings {
  return {
    enabled: false,
    mode: "user_name",
    format: "bold_line",
  };
}

export function normalizeAgentSignatureSettings(input: unknown): AgentSignatureSettings {
  const record = isRecord(input) ? input : {};
  return {
    enabled: record.enabled === true,
    mode: "user_name",
    format: "bold_line",
  };
}

function normalizeOptionalMessageText(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) || null : null;
}

export function getDefaultServiceMessagePolicySettings(): ServiceMessagePolicySettings {
  return {
    protocolNotice: {
      enabled: true,
      text: null,
    },
    queuePositionNotice: {
      enabled: true,
      text: null,
    },
    closeNotice: {
      enabled: true,
    },
  };
}

export function normalizeServiceMessagePolicySettings(input: unknown): ServiceMessagePolicySettings {
  const defaults = getDefaultServiceMessagePolicySettings();
  const record = isRecord(input) ? input : {};
  const protocolNotice = isRecord(record.protocolNotice) ? record.protocolNotice : {};
  const queuePositionNotice = isRecord(record.queuePositionNotice) ? record.queuePositionNotice : {};
  const closeNotice = isRecord(record.closeNotice) ? record.closeNotice : {};
  return {
    protocolNotice: {
      enabled: typeof protocolNotice.enabled === "boolean" ? protocolNotice.enabled : defaults.protocolNotice.enabled,
      text: normalizeOptionalMessageText(protocolNotice.text ?? protocolNotice.messageTemplate),
    },
    queuePositionNotice: {
      enabled:
        typeof queuePositionNotice.enabled === "boolean"
          ? queuePositionNotice.enabled
          : defaults.queuePositionNotice.enabled,
      text: normalizeOptionalMessageText(queuePositionNotice.text),
    },
    closeNotice: {
      enabled: typeof closeNotice.enabled === "boolean" ? closeNotice.enabled : defaults.closeNotice.enabled,
    },
  };
}

export function getDefaultChatbotCloseMessageSettings(): ChatbotCloseMessageSettings {
  return {
    closedMessage: "Atendimento encerrado. Obrigado pelo contato.",
  };
}

export function normalizeChatbotCloseMessageSettings(input: unknown): ChatbotCloseMessageSettings {
  const record = isRecord(input) ? input : {};
  return {
    closedMessage:
      normalizeOptionalMessageText(record.closedMessage, 500) ??
      getDefaultChatbotCloseMessageSettings().closedMessage,
  };
}

function mergeServiceMessagePolicySettings(
  current: ServiceMessagePolicySettings,
  input: Record<string, unknown>
) {
  const protocolNotice = isRecord(input.protocolNotice) ? input.protocolNotice : {};
  const queuePositionNotice = isRecord(input.queuePositionNotice) ? input.queuePositionNotice : {};
  const closeNotice = isRecord(input.closeNotice) ? input.closeNotice : {};
  return normalizeServiceMessagePolicySettings({
    protocolNotice: {
      ...current.protocolNotice,
      ...protocolNotice,
    },
    queuePositionNotice: {
      ...current.queuePositionNotice,
      ...queuePositionNotice,
    },
    closeNotice: {
      ...current.closeNotice,
      ...closeNotice,
    },
  });
}

export function normalizeInboxVisibilityPolicy(input: unknown): InboxVisibilityPolicy {
  return input === "assignee_only_after_assignment" ? "assignee_only_after_assignment" : "shared";
}

export function normalizeAllowInteractiveContactStartViaWebSession(input: unknown) {
  return input === true;
}

function normalizeWhatsappTransportRoutingEntry(input: unknown) {
  if (!isRecord(input) || typeof input.enabledForRouting !== "boolean") return undefined;
  return { enabledForRouting: input.enabledForRouting };
}

export function normalizeWhatsappTransportRoutingSettings(input: unknown): WhatsappTransportRoutingSettings {
  const record = isRecord(input) ? input : {};
  const settings: WhatsappTransportRoutingSettings = {};
  const meta = normalizeWhatsappTransportRoutingEntry(record.meta);
  const webSession = normalizeWhatsappTransportRoutingEntry(record.webSession);
  if (meta) settings.meta = meta;
  if (webSession) settings.webSession = webSession;
  return settings;
}

export function isWhatsappTransportEnabledForRouting(
  settings: WhatsappTransportRoutingSettings | null | undefined,
  transport: WhatsappTransportRoutingKey,
  fallbackEnabled: boolean
) {
  const explicit = settings?.[transport]?.enabledForRouting;
  return typeof explicit === "boolean" ? explicit : fallbackEnabled;
}

export function normalizeWhatsappTemplateCategory(input: unknown): WhatsappTemplateCategory | null {
  if (typeof input !== "string") return null;
  const normalized = input.trim().toUpperCase();
  return WHATSAPP_TEMPLATE_CATEGORIES.includes(normalized as WhatsappTemplateCategory)
    ? (normalized as WhatsappTemplateCategory)
    : null;
}

export function normalizeWhatsappTemplatePolicySettings(input: unknown): WhatsappTemplatePolicySettings {
  const record = isRecord(input) ? input : {};
  if (!Object.prototype.hasOwnProperty.call(record, "allowedCategories")) return {};
  const allowedCategories = Array.isArray(record.allowedCategories)
    ? Array.from(
        new Set(
          record.allowedCategories
            .map((category) => normalizeWhatsappTemplateCategory(category))
            .filter((category): category is WhatsappTemplateCategory => Boolean(category))
        )
      )
    : [];
  return { allowedCategories };
}

export function isWhatsappTemplateCategoryAllowed(
  settings: WhatsappTemplatePolicySettings | null | undefined,
  category: unknown
) {
  const normalized = normalizeWhatsappTemplateCategory(category);
  const allowedCategories = settings?.allowedCategories;
  if (!Array.isArray(allowedCategories)) return true;
  return Boolean(normalized && allowedCategories.includes(normalized));
}

export const WHATSAPP_MEDIA_KINDS: WhatsappMediaKind[] = ["image", "audio", "video", "document"];

export function getDefaultWhatsappMediaPolicy(): WhatsappMediaPolicy {
  return {
    inbound: {
      image: true,
      audio: true,
      video: true,
      document: true,
    },
    outbound: {
      image: true,
      audio: true,
      video: true,
      document: true,
    },
  };
}

export function isWhatsappMediaKind(value: unknown): value is WhatsappMediaKind {
  return typeof value === "string" && WHATSAPP_MEDIA_KINDS.includes(value.trim().toLowerCase() as WhatsappMediaKind);
}

function normalizeWhatsappMediaPolicyDirection(input: unknown): WhatsappMediaPolicyDirection {
  const defaults = getDefaultWhatsappMediaPolicy().inbound;
  const record = isRecord(input) ? input : {};
  return {
    image: typeof record.image === "boolean" ? record.image : defaults.image,
    audio: typeof record.audio === "boolean" ? record.audio : defaults.audio,
    video: typeof record.video === "boolean" ? record.video : defaults.video,
    document: typeof record.document === "boolean" ? record.document : defaults.document,
  };
}

export function normalizeWhatsappMediaPolicy(input: unknown): WhatsappMediaPolicy {
  const record = isRecord(input) ? input : {};
  return {
    inbound: normalizeWhatsappMediaPolicyDirection(record.inbound),
    outbound: normalizeWhatsappMediaPolicyDirection(record.outbound),
  };
}

export function isWhatsappMediaAllowed(
  policy: WhatsappMediaPolicy,
  direction: WhatsappMediaDirection,
  kind: WhatsappMediaKind
) {
  return policy[direction][kind] === true;
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

function normalizeSatisfactionText(input: unknown, fallback: string) {
  if (typeof input !== "string") return fallback;
  const value = input.trim();
  return value ? value.slice(0, 2000) : fallback;
}

export function getDefaultSatisfactionPolicySettings(): SatisfactionPolicySettings {
  return {
    enabled: false,
    eligibility: "HUMAN_ONLY",
    ttlMinutes: 15,
    questionText:
      "Pesquisa de Satisfação do Protocolo #{protocol}.\n\nComo você avalia este atendimento?\n5 - ⭐⭐⭐⭐⭐\n4 - ⭐⭐⭐⭐\n3 - ⭐⭐⭐\n2 - ⭐⭐\n1 - ⭐\n\nObs.: Você tem 15 minutos para responder à pesquisa.",
    commentEnabled: false,
    commentOfferText: "Poderia compartilhar conosco o que motivou essa avaliação?\n\n1 - Sim\n2 - Não",
    commentPromptText: "Digite o texto:",
    thankYouText: "Obrigad@ por participar da nossa pesquisa! 😊",
    newServiceGateText: "Deseja iniciar um novo atendimento? 😀\n\n1 - Sim. 😁\n2 - Não. 😉",
  };
}

export function normalizeSatisfactionPolicySettings(input: unknown): SatisfactionPolicySettings {
  const defaults = getDefaultSatisfactionPolicySettings();
  const record = isRecord(input) ? input : {};
  const legacyComment = isRecord(record.comment) ? record.comment : {};
  const eligibility =
    typeof record.eligibility === "string" && record.eligibility.trim().toUpperCase() === "DIRECTED_SERVICE"
      ? "DIRECTED_SERVICE"
      : "HUMAN_ONLY";
  const ttlInput = typeof record.expiresAfterMinutes === "number" ? record.expiresAfterMinutes : record.ttlMinutes;
  return {
    enabled: record.enabled === true,
    eligibility,
    ttlMinutes: normalizePositiveInteger(ttlInput, defaults.ttlMinutes),
    questionText: normalizeSatisfactionText(record.questionText, defaults.questionText),
    commentEnabled:
      typeof record.commentEnabled === "boolean"
        ? record.commentEnabled
        : typeof legacyComment.enabled === "boolean"
          ? legacyComment.enabled
          : defaults.commentEnabled,
    commentOfferText: normalizeSatisfactionText(
      record.commentOfferText ?? legacyComment.offerText,
      defaults.commentOfferText
    ),
    commentPromptText: normalizeSatisfactionText(
      record.commentPromptText ?? legacyComment.promptText,
      defaults.commentPromptText
    ),
    thankYouText: normalizeSatisfactionText(record.thankYouText ?? legacyComment.thankYouText, defaults.thankYouText),
    newServiceGateText: normalizeSatisfactionText(record.newServiceGateText, defaults.newServiceGateText),
  };
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

function normalizeRuntimeLimitsSettings(input: unknown): RuntimeLimitsSettings {
  const record = isRecord(input) ? input : {};
  const maxActiveAppUsers =
    typeof record.maxActiveAppUsers === "number" &&
    Number.isInteger(record.maxActiveAppUsers) &&
    record.maxActiveAppUsers >= 0
      ? record.maxActiveAppUsers
      : null;
  return { maxActiveAppUsers };
}

function normalizeRuntimeLimitsSettingsFromTenant(
  tenant?: Pick<TenantConfig, "maxActiveAppUsers"> | null
): RuntimeLimitsSettings {
  return normalizeRuntimeLimitsSettings({ maxActiveAppUsers: tenant?.maxActiveAppUsers });
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
  if (Object.prototype.hasOwnProperty.call(value, "runtimeLimits")) {
    config.runtimeLimits = normalizeRuntimeLimitsSettings(value.runtimeLimits);
  }
  if (Object.prototype.hasOwnProperty.call(value, "agentSignature")) {
    config.agentSignature = normalizeAgentSignatureSettings(value.agentSignature);
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
  if (Object.prototype.hasOwnProperty.call(value, "whatsappMediaPolicy")) {
    config.whatsappMediaPolicy = normalizeWhatsappMediaPolicy(value.whatsappMediaPolicy);
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
  if (Object.prototype.hasOwnProperty.call(value, "webSessionAlertEmails")) {
    config.webSessionAlertEmails = normalizeWebSessionAlertEmails(value.webSessionAlertEmails);
  }
  if (Object.prototype.hasOwnProperty.call(value, "inboxVisibilityPolicy")) {
    config.inboxVisibilityPolicy = normalizeInboxVisibilityPolicy(value.inboxVisibilityPolicy);
  }
  if (Object.prototype.hasOwnProperty.call(value, "allowInteractiveContactStartViaWebSession")) {
    config.allowInteractiveContactStartViaWebSession = normalizeAllowInteractiveContactStartViaWebSession(
      value.allowInteractiveContactStartViaWebSession
    );
  }
  if (Object.prototype.hasOwnProperty.call(value, "whatsappTransports")) {
    config.whatsappTransports = normalizeWhatsappTransportRoutingSettings(value.whatsappTransports);
  }
  if (Object.prototype.hasOwnProperty.call(value, "whatsappTemplatePolicy")) {
    config.whatsappTemplatePolicy = normalizeWhatsappTemplatePolicySettings(value.whatsappTemplatePolicy);
  }
  if (Object.prototype.hasOwnProperty.call(value, "satisfactionPolicy")) {
    config.satisfactionPolicy = normalizeSatisfactionPolicySettings(value.satisfactionPolicy);
  }
  if (Object.prototype.hasOwnProperty.call(value, "serviceMessages")) {
    config.serviceMessages = normalizeServiceMessagePolicySettings(value.serviceMessages);
  }
  return config;
}

function normalizeWebSessionAlertEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 180) : null;
}

export function normalizeWebSessionAlertEmails(input: unknown): string[] {
  const values = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/[\n,;]/)
      : [];
  const emails: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const email = normalizeWebSessionAlertEmail(value);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
    if (emails.length >= 20) break;
  }
  return emails;
}

export async function resolveWebSessionAlertEmails(params: {
  prisma: PrismaClient;
  clientId: string;
}): Promise<ResolvedWebSessionAlertEmails> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const dbConfig = parseOperationalConfig(record?.config);
  return {
    emails: dbConfig.webSessionAlertEmails ?? [],
    source: dbConfig.webSessionAlertEmails ? "db" : "json_fallback",
  };
}

export async function saveWebSessionAlertEmails(params: {
  prisma: PrismaClient;
  clientId: string;
  emails: unknown;
}) {
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
    const existing = await params.prisma.tenantOperationalConfig.findUnique({
      where: { clientId: params.clientId },
      select: { config: true },
    });
    const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
    const nextEmails = normalizeWebSessionAlertEmails(params.emails);
    const nextConfig = {
      ...existingConfig,
      webSessionAlertEmails: nextEmails,
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
      emails: nextEmails,
    };
  });
}

export async function resolveRuntimeLimitsSettings(params: {
  prisma: PrismaClient;
  clientId: string;
  tenant?: Pick<TenantConfig, "maxActiveAppUsers"> | null;
}): Promise<ResolvedRuntimeLimitsSettings> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const dbConfig = parseOperationalConfig(record?.config);
  if (dbConfig.runtimeLimits?.maxActiveAppUsers !== null && dbConfig.runtimeLimits?.maxActiveAppUsers !== undefined) {
    return {
      settings: dbConfig.runtimeLimits,
      source: "db",
    };
  }
  return {
    settings: normalizeRuntimeLimitsSettingsFromTenant(params.tenant),
    source: "json_fallback",
  };
}

export async function saveRuntimeLimitsSettings(params: {
  prisma: PrismaClient;
  clientId: string;
  settings: Partial<RuntimeLimitsSettings>;
  tenant?: Pick<TenantConfig, "maxActiveAppUsers"> | null;
}) {
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
    const existing = await params.prisma.tenantOperationalConfig.findUnique({
      where: { clientId: params.clientId },
      select: { config: true },
    });
    const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
    const currentSettings = parseOperationalConfig(existing?.config).runtimeLimits
      ?? normalizeRuntimeLimitsSettingsFromTenant(params.tenant);
    const nextSettings = normalizeRuntimeLimitsSettings({
      ...currentSettings,
      ...params.settings,
    });
    const nextConfig = {
      ...existingConfig,
      runtimeLimits: nextSettings,
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
  });
}

export async function resolveSatisfactionPolicySettings(params: {
  prisma: PrismaClient | Prisma.TransactionClient;
  clientId: string;
}): Promise<ResolvedSatisfactionPolicySettings> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const rawConfig = isRecord(record?.config) ? record.config : {};
  const hasPolicy = Object.prototype.hasOwnProperty.call(rawConfig, "satisfactionPolicy");
  return {
    settings: hasPolicy
      ? normalizeSatisfactionPolicySettings(rawConfig.satisfactionPolicy)
      : getDefaultSatisfactionPolicySettings(),
    source: hasPolicy ? "db" : "json_fallback",
  };
}

export async function saveSatisfactionPolicySettings(params: {
  prisma: PrismaClient | Prisma.TransactionClient;
  clientId: string;
  settings: unknown;
}) {
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
    const existing = await params.prisma.tenantOperationalConfig.findUnique({
      where: { clientId: params.clientId },
      select: { config: true },
    });
    const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
    const currentSettings = normalizeSatisfactionPolicySettings(existingConfig.satisfactionPolicy);
    const inputSettings = isRecord(params.settings) ? params.settings : {};
    const nextSettings = normalizeSatisfactionPolicySettings({
      ...currentSettings,
      ...inputSettings,
    });
    const nextConfig = {
      ...existingConfig,
      satisfactionPolicy: nextSettings,
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
        config: true,
      },
    });
    return {
      record: saved,
      settings: parseOperationalConfig(saved.config).satisfactionPolicy ?? getDefaultSatisfactionPolicySettings(),
      source: "db" as const,
    };
  });
}

export async function resolveServiceMessagePolicySettings(params: {
  prisma: PrismaClient | Prisma.TransactionClient;
  clientId: string;
}): Promise<ResolvedServiceMessagePolicySettings> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const rawConfig = isRecord(record?.config) ? record.config : {};
  const hasPolicy = Object.prototype.hasOwnProperty.call(rawConfig, "serviceMessages");
  const serviceMessages = hasPolicy
    ? normalizeServiceMessagePolicySettings(rawConfig.serviceMessages)
    : getDefaultServiceMessagePolicySettings();
  return {
    settings: serviceMessages,
    source: hasPolicy ? "db" : "json_fallback",
  };
}

export async function saveServiceMessagePolicySettings(params: {
  prisma: PrismaClient | Prisma.TransactionClient;
  clientId: string;
  settings: unknown;
}) {
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
    const existing = await params.prisma.tenantOperationalConfig.findUnique({
      where: { clientId: params.clientId },
      select: { config: true },
    });
    const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
    const currentSettings = normalizeServiceMessagePolicySettings(existingConfig.serviceMessages);
    const inputSettings = isRecord(params.settings) ? params.settings : {};
    const nextSettings = mergeServiceMessagePolicySettings(currentSettings, inputSettings);
    const nextConfig = {
      ...existingConfig,
      serviceMessages: nextSettings,
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
        config: true,
      },
    });
    return {
      record: saved,
      settings: parseOperationalConfig(saved.config).serviceMessages ?? getDefaultServiceMessagePolicySettings(),
      source: "db" as const,
    };
  });
}

export async function resolveChatbotCloseMessageSettings(params: {
  prisma: PrismaClient | Prisma.TransactionClient;
  clientId: string;
}): Promise<ResolvedChatbotCloseMessageSettings> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const rawConfig = isRecord(record?.config) ? record.config : {};
  const hasCloseCommand = isRecord(rawConfig.chatbotCloseCommand) &&
    Object.prototype.hasOwnProperty.call(rawConfig.chatbotCloseCommand, "closedMessage");
  return {
    settings: normalizeChatbotCloseMessageSettings(rawConfig.chatbotCloseCommand),
    source: hasCloseCommand ? "db" : "json_fallback",
  };
}

export async function saveChatbotCloseMessageSettings(params: {
  prisma: PrismaClient | Prisma.TransactionClient;
  clientId: string;
  settings: unknown;
}) {
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
    const existing = await params.prisma.tenantOperationalConfig.findUnique({
      where: { clientId: params.clientId },
      select: { config: true },
    });
    const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
    const existingCloseCommand = isRecord(existingConfig.chatbotCloseCommand)
      ? { ...existingConfig.chatbotCloseCommand }
      : {};
    const nextSettings = normalizeChatbotCloseMessageSettings({
      ...existingCloseCommand,
      ...(isRecord(params.settings) ? params.settings : {}),
    });
    const nextConfig = {
      ...existingConfig,
      chatbotCloseCommand: {
        ...existingCloseCommand,
        closedMessage: nextSettings.closedMessage,
      },
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
        config: true,
      },
    });
    return {
      record: saved,
      settings: normalizeChatbotCloseMessageSettings(
        isRecord(saved.config) ? saved.config.chatbotCloseCommand : null
      ),
      source: "db" as const,
    };
  });
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

export async function resolveAgentSignatureSettings(params: {
  prisma: PrismaClient;
  clientId: string;
}): Promise<ResolvedAgentSignatureSettings> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const dbConfig = parseOperationalConfig(record?.config);
  return {
    settings: dbConfig.agentSignature ?? getDefaultAgentSignatureSettings(),
    source: dbConfig.agentSignature ? "db" : "json_fallback",
  };
}

export async function saveAgentSignatureSettings(params: {
  prisma: PrismaClient;
  clientId: string;
  settings: Partial<AgentSignatureSettings>;
}) {
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
    const existing = await params.prisma.tenantOperationalConfig.findUnique({
      where: { clientId: params.clientId },
      select: { config: true },
    });
    const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
    const currentSettings = parseOperationalConfig(existing?.config).agentSignature ?? getDefaultAgentSignatureSettings();
    const nextSettings = normalizeAgentSignatureSettings({
      ...currentSettings,
      ...params.settings,
    });
    const nextConfig = {
      ...existingConfig,
      agentSignature: nextSettings,
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
  });
}

export async function resolveInboxVisibilityPolicy(params: {
  prisma: PrismaClient;
  clientId: string;
}): Promise<ResolvedInboxVisibilityPolicy> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const rawConfig = isRecord(record?.config) ? record.config : {};
  const hasPolicy = Object.prototype.hasOwnProperty.call(rawConfig, "inboxVisibilityPolicy");
  const policy = parseOperationalConfig(record?.config).inboxVisibilityPolicy ?? "shared";
  return {
    policy,
    source: hasPolicy ? "db" : "json_fallback",
  };
}

export async function resolveInteractiveContactStartPolicy(params: {
  prisma: PrismaClient;
  clientId: string;
}): Promise<ResolvedInteractiveContactStartPolicy> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const rawConfig = isRecord(record?.config) ? record.config : {};
  const hasPolicy = Object.prototype.hasOwnProperty.call(rawConfig, "allowInteractiveContactStartViaWebSession");
  return {
    allowInteractiveContactStartViaWebSession: parseOperationalConfig(record?.config)
      .allowInteractiveContactStartViaWebSession ?? false,
    source: hasPolicy ? "db" : "json_fallback",
  };
}

export async function saveInteractiveContactStartPolicy(params: {
  prisma: PrismaClient;
  clientId: string;
  allowInteractiveContactStartViaWebSession: unknown;
}) {
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
    const existing = await params.prisma.tenantOperationalConfig.findUnique({
      where: { clientId: params.clientId },
      select: { config: true },
    });
    const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
    const nextValue = normalizeAllowInteractiveContactStartViaWebSession(
      params.allowInteractiveContactStartViaWebSession
    );
    const nextConfig = {
      ...existingConfig,
      allowInteractiveContactStartViaWebSession: nextValue,
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
      select: { config: true },
    });
    return {
      allowInteractiveContactStartViaWebSession: parseOperationalConfig(saved.config)
        .allowInteractiveContactStartViaWebSession ?? false,
      source: "db" as const,
    };
  });
}

export async function resolveWhatsappTransportRoutingSettings(params: {
  prisma: PrismaClient | Prisma.TransactionClient;
  clientId: string;
}): Promise<ResolvedWhatsappTransportRoutingSettings> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const rawConfig = isRecord(record?.config) ? record.config : {};
  const hasPolicy = Object.prototype.hasOwnProperty.call(rawConfig, "whatsappTransports");
  return {
    settings: parseOperationalConfig(record?.config).whatsappTransports ?? {},
    source: hasPolicy ? "db" : "json_fallback",
  };
}

export async function saveWhatsappTransportRoutingEnabled(params: {
  prisma: PrismaClient | Prisma.TransactionClient;
  clientId: string;
  transport: WhatsappTransportRoutingKey;
  enabledForRouting: unknown;
}) {
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
    const existing = await params.prisma.tenantOperationalConfig.findUnique({
      where: { clientId: params.clientId },
      select: { config: true },
    });
    const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
    const current = parseOperationalConfig(existing?.config).whatsappTransports ?? {};
    const nextSettings: WhatsappTransportRoutingSettings = {
      ...current,
      [params.transport]: {
        enabledForRouting: params.enabledForRouting === true,
      },
    };
    const nextConfig = {
      ...existingConfig,
      whatsappTransports: nextSettings,
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
        config: true,
      },
    });
    return {
      record: saved,
      settings: parseOperationalConfig(saved.config).whatsappTransports ?? {},
    };
  });
}

export async function resolveWhatsappTemplatePolicySettings(params: {
  prisma: PrismaClient | Prisma.TransactionClient;
  clientId: string;
}): Promise<ResolvedWhatsappTemplatePolicySettings> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const rawConfig = isRecord(record?.config) ? record.config : {};
  const hasPolicy = Object.prototype.hasOwnProperty.call(rawConfig, "whatsappTemplatePolicy");
  const settings = parseOperationalConfig(record?.config).whatsappTemplatePolicy ?? {};
  return {
    settings,
    source: hasPolicy ? "db" : "json_fallback",
    unrestricted: !Array.isArray(settings.allowedCategories),
  };
}

export async function saveWhatsappTemplatePolicySettings(params: {
  prisma: PrismaClient | Prisma.TransactionClient;
  clientId: string;
  allowedCategories: unknown;
}) {
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
    const existing = await params.prisma.tenantOperationalConfig.findUnique({
      where: { clientId: params.clientId },
      select: { config: true },
    });
    const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
    const nextSettings = normalizeWhatsappTemplatePolicySettings({
      allowedCategories: params.allowedCategories,
    });
    const nextConfig = {
      ...existingConfig,
      whatsappTemplatePolicy: nextSettings,
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
        config: true,
      },
    });
    const settings = parseOperationalConfig(saved.config).whatsappTemplatePolicy ?? {};
    return {
      record: saved,
      settings,
      source: "db" as const,
      unrestricted: !Array.isArray(settings.allowedCategories),
    };
  });
}

export async function saveInboxVisibilityPolicy(params: {
  prisma: PrismaClient;
  clientId: string;
  policy: InboxVisibilityPolicy;
}) {
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
    const existing = await params.prisma.tenantOperationalConfig.findUnique({
      where: { clientId: params.clientId },
      select: { config: true },
    });
    const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
    const nextPolicy = normalizeInboxVisibilityPolicy(params.policy);
    const nextConfig = {
      ...existingConfig,
      inboxVisibilityPolicy: nextPolicy,
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
      select: { config: true },
    });
    return {
      policy: parseOperationalConfig(saved.config).inboxVisibilityPolicy ?? "shared",
      source: "db" as const,
    };
  });
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
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
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
  });
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
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
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
  });
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
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
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
  });
}

export async function resolveWhatsappMediaPolicy(params: {
  prisma: PrismaClient;
  clientId: string;
}): Promise<ResolvedWhatsappMediaPolicy> {
  const record = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const dbConfig = parseOperationalConfig(record?.config);
  if (dbConfig.whatsappMediaPolicy) {
    return {
      policy: dbConfig.whatsappMediaPolicy,
      source: "db",
    };
  }
  return {
    policy: getDefaultWhatsappMediaPolicy(),
    source: "json_fallback",
  };
}

export async function saveWhatsappMediaPolicy(params: {
  prisma: PrismaClient;
  clientId: string;
  policy: unknown;
}) {
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
    const existing = await params.prisma.tenantOperationalConfig.findUnique({
      where: { clientId: params.clientId },
      select: { config: true },
    });
    const existingConfig = isRecord(existing?.config) ? { ...existing.config } : {};
    const nextPolicy = normalizeWhatsappMediaPolicy(params.policy);
    const nextConfig = {
      ...existingConfig,
      whatsappMediaPolicy: nextPolicy,
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
  });
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
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
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
  });
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
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
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
  });
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
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
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
  });
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
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
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
  });
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
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    params = { ...params, prisma: tx as typeof params.prisma };
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
  });
}

/** Explicit opt-in only. No legacy JSON fallback for this permission. */
export async function resolveAllowAgentOwnClosedConversations(params: {
  prisma: PrismaClient | import("@prisma/client").Prisma.TransactionClient;
  clientId: string;
}): Promise<boolean> {
  const row = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId }, select: { config: true },
  });
  const config = row?.config;
  return Boolean(config && typeof config === "object" && !Array.isArray(config) && config.allowAgentOwnClosedConversations === true);
}

export async function saveAllowAgentOwnClosedConversations(params: {
  prisma: PrismaClient | import("@prisma/client").Prisma.TransactionClient;
  clientId: string;
  enabled: boolean;
}) {
  if (typeof params.enabled !== "boolean") throw new Error("invalid_closed_conversations_setting");
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    const row = await tx.tenantOperationalConfig.findUniqueOrThrow({ where: { clientId: params.clientId } });
    const config = row.config && typeof row.config === "object" && !Array.isArray(row.config) ? row.config : {};
    await tx.tenantOperationalConfig.update({
      where: { clientId: params.clientId },
      data: { config: { ...config, allowAgentOwnClosedConversations: params.enabled } },
    });
    return params.enabled;
  });
}

/** Explicit opt-in only. No legacy JSON fallback for this permission. */
export async function resolveAllowAutomationConversationsInInbox(params: {
  prisma: PrismaClient | import("@prisma/client").Prisma.TransactionClient;
  clientId: string;
}): Promise<boolean> {
  const row = await params.prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId }, select: { config: true },
  });
  const config = row?.config;
  return Boolean(config && typeof config === "object" && !Array.isArray(config) && config.allowAutomationConversationsInInbox === true);
}

export async function saveAllowAutomationConversationsInInbox(params: {
  prisma: PrismaClient | import("@prisma/client").Prisma.TransactionClient;
  clientId: string;
  enabled: boolean;
}) {
  if (typeof params.enabled !== "boolean") throw new Error("invalid_automation_conversations_setting");
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    const row = await tx.tenantOperationalConfig.findUniqueOrThrow({ where: { clientId: params.clientId } });
    const config = row.config && typeof row.config === "object" && !Array.isArray(row.config) ? row.config : {};
    await tx.tenantOperationalConfig.update({
      where: { clientId: params.clientId },
      data: { config: { ...config, allowAutomationConversationsInInbox: params.enabled } },
    });
    return params.enabled;
  });
}
