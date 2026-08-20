export type SummaryRange = "1h" | "24h" | "7d" | "30d";

export type TenantSummaryItem = {
  tenantId: string;
  clientKey: string;
  name: string;
  lastMessageAt: string | null;
  counts: {
    inbound: { received: number };
    outbound: { sent_text: number; sent_template: number; failed: number };
  };
  quota: {
    period: string;
    limit: number | null;
    used: number;
    pct: number | null;
    warnAtPct: number | null;
    warning: boolean;
  };
};

export type InboxMessageItem = {
  inboxVisibility?: "human_timeline" | "management_only";
  protocol?: string | null;
  cycleId?: string | null;
  internalMessageId?: string | null;
  messageKind?: "inbound" | "outbound" | string | null;
  direction: "INBOUND" | "OUTBOUND";
  type: string;
  status: string;
  intent: string | null;
  bodyText: string | null;
  location?: {
    latitude: number;
    longitude: number;
    name: string | null;
    address: string | null;
    googleMapsUrl: string;
    openStreetMapUrl: string;
  } | null;
  media?: {
    kind: "image" | "audio" | "video" | "document";
    mimeType?: string;
    fileName?: string;
    caption?: string;
    hasDownload: boolean;
    downloadUrl?: string;
  } | null;
  templateName: string | null;
  templateLang: string | null;
  requestId: string | null;
  messageId: string | null;
  metaMessageId: string | null;
  replyTo?: {
    kind: "inbound" | "outbound";
    id: string;
    previewType?: string | null;
    mode?: "reply" | "rectify" | string | null;
    previewBody?: string | null;
    previewDirection?: "INBOUND" | "OUTBOUND" | string | null;
    previewMedia?: (NonNullable<InboxMessageItem["media"]> & { messageId?: string | null }) | null;
    previewLocation?: InboxMessageItem["location"];
  } | null;
  actor?: {
    source: string;
    userId?: string | null;
    displayName?: string | null;
  } | null;
  agentSignatureApplied?: boolean;
  agentSignatureFormat?: "bold_line" | string | null;
  errorBody: string | null;
  createdAt: string;
};

export type InboxChannel = "whatsapp" | "messenger" | "instagram" | "webchat" | "telegram" | "support";

export type WhatsappMediaKind = "image" | "audio" | "video" | "document";

export type WhatsappMediaPolicy = {
  inbound: Record<WhatsappMediaKind, boolean>;
  outbound: Record<WhatsappMediaKind, boolean>;
};

export type InboxConversationContinuation = {
  protocol: string;
  originalConversationId: string;
  linkedAt: string;
  reason: "protocol_lookup";
};

export type InboxConversationItem = {
  waId: string;
  waIdCanonical?: string | null;
  protocol?: string | null;
  cycleId?: string | null;
  channel?: InboxChannel | string | null;
  provider?: string | null;
  channelAccountId?: string | null;
  channelOutboundEnabled?: boolean;
  lastMessage: {
    protocol?: string | null;
    cycleId?: string | null;
    direction: "INBOUND" | "OUTBOUND";
    type: string;
    status: string;
    messageId?: string | null;
    bodyText: string | null;
    location?: InboxMessageItem["location"];
    templateName: string | null;
    createdAt: string;
  } | null;
  leadId: string | null;
  leadStatus: string | null;
  leadName: string | null;
  leadPhone: string | null;
  leadCity: string | null;
  leadService: string | null;
  leadEmail: string | null;
  leadCompany: string | null;
  mode: "BOT" | "HUMAN";
  handoffStatus?: "none" | "pending" | "active" | null;
  assignedUserId: string | null;
  assignedTo: string | null;
  assignedUserName: string | null;
  assignedAt: string | null;
  departmentId: string | null;
  departmentName: string | null;
  queueId: string | null;
  queueName: string | null;
  status: ConversationOperationalStatus | null;
  closedAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  waitingFirstResponseSec?: number | null;
  activeDurationSec?: number | null;
  unreadCount?: number;
  isUnassigned: boolean;
  flowContext?: Record<string, string | number | boolean | null>;
  flowTags?: string[];
  continuation?: InboxConversationContinuation | null;
  updatedAt: string;
};

export type ConversationOperationalStatus =
  | "WAITING"
  | "IN_PROGRESS"
  | "WAITING_USER"
  | "CLOSED";

export type AdminUserItem = {
  id: string;
  name: string;
  email: string;
  role: string;
  departmentId?: string | null;
  departmentName?: string | null;
  departmentIds?: string[];
  primaryDepartmentId?: string | null;
  memberships?: Array<{
    departmentId: string;
    departmentName?: string | null;
    isPrimary: boolean;
    isActive: boolean;
    source?: "membership" | "legacy" | string;
  }>;
  isActive?: boolean;
  createdAt: string;
  firstAccess?: {
    status: "password_configured" | "token_active" | "token_expired" | "not_ready";
    tokenExpiresAt: string | null;
  } | null;
};

export type AdminDepartmentItem = {
  id: string;
  name: string;
  slug?: string;
  isActive: boolean;
  createdAt: string;
  businessHours?: Array<{
    id?: string;
    weekday: number;
    startMinute: number;
    endMinute: number;
  }>;
  businessHourExceptions?: Array<{
    id?: string;
    date: string;
    type: "CLOSED" | "CUSTOM_HOURS" | string;
    reason?: string | null;
    intervals?: Array<{ startMinute: number; endMinute: number }> | null;
  }>;
  businessHoursConfigured?: boolean;
};

export type AdminQueueItem = {
  id: string;
  name: string;
  departmentId: string;
};

export type AdminClientItem = {
  id: string;
  name: string;
  clientKey: string;
  profile?: "business" | "government";
  createdAt: string;
  updatedAt: string;
  phoneNumbers?: Array<{
    id?: string;
    phoneNumberId: string;
    display?: string;
  }>;
};

export type ConversationReportRange = "1d" | "7d" | "30d" | "month" | "custom";

export type AdminChatbotFlowItem = {
  id: string;
  clientId: string;
  name: string;
  isActive: boolean;
  entryPoint: boolean;
  definition: {
    start: string;
    nodes: Record<string, unknown>;
  };
  createdAt: string;
  updatedAt: string;
};

export type AdminAutomationSettings = {
  disableAutoReply: boolean;
  disableChatbot: boolean;
  disableAiFallback: boolean;
  disableIntentClassifier: boolean;
  disableLegacyFlows?: boolean;
  disableChatbotFlowEditing?: boolean;
  aiAssistantEnabled?: boolean;
  aiAssistantMaxReplies?: number;
  aiAssistantProfile?: "business" | "government" | "legal_previdenciario";
  aiAssistantSystemPrompt?: string;
  aiAssistantFallbackToHandoff?: boolean;
  aiAssistantAllowedTopics?: string[];
  aiAssistantSecondaryTopics?: string[];
  aiAssistantBlockedTerms?: string[];
  aiAssistantHandoffKeywords?: string[];
  aiAssistantGreetingMessage?: string;
  aiAssistantFallbackMessage?: string;
  aiAssistantHandoffPrompt?: string;
  aiAssistantIntentCatalog?: AiAssistantIntentCatalogItem[];
  aiQualification?: AiQualificationSchema;
  aiAssistantPresetApplied?: string;
  handoffLeadNotificationEnabled?: boolean;
  handoffLeadNotificationRecipients?: HandoffLeadNotificationRecipient[];
  mediaHandoffPolicy?: MediaHandoffPolicy;
  aiAssistantGlobalSafety?: {
    questionStarters: string[];
    topicTerms: string[];
    blockedTerms: string[];
    handoffTerms?: string[];
    maxInputChars: number;
    personalDataBlocked: boolean;
  };
  aiAssistantConfigurationStatus?: {
    ready: boolean;
    missing: string[];
    warnings: string[];
    score: number;
  };
  aiBusinessContext?: string;
  followUpEnabled?: boolean;
  followUpDelayMinutes?: number;
  followUpMaxCount?: number;
  followUpUseTemplate?: boolean;
  followUpTemplateName?: string;
  followUpTemplateLang?: string;
  aiConfigured: boolean;
  chatbotLocked?: boolean;
  flowEditingLocked?: boolean;
  aiLocked?: boolean;
  aiAssistantLocked?: boolean;
  intentClassifierLocked?: boolean;
};

export type HandoffLeadNotificationRecipient = {
  id: string;
  waId: string;
  label?: string;
  isActive: boolean;
};

export type MediaHandoffPolicy = {
  enabled: boolean;
  channels: Array<"whatsapp" | "messenger" | "instagram" | "webchat" | "telegram" | "support">;
  behavior: "notify_and_reply" | "notify_only" | "reply_only" | "ignore";
  customerNoticeText: string;
  attendantSummaryText: string;
};

export type AiAssistantIntentCatalogItem = {
  key: string;
  title?: string;
  topics?: string[];
  response?: string;
  nextQuestion?: string;
  leadTemp?: "quente" | "morno" | "frio";
  priority?: "alta" | "media" | "baixa";
  handoff?: boolean;
  tags?: string[];
};

export type AiQualificationSlot = {
  key: string;
  label?: string;
  type?: "text" | "enum" | "boolean";
  required?: boolean;
  requiredWhen?: Record<string, string | boolean | number>;
  allowedValues?: string[];
  question: string;
  captureHints?: string[];
  semanticAliases?: Record<string, string[]>;
  askAfter?: string[];
  crmMapping?: {
    flowContextKey?: string;
    leadField?: "company" | "service";
    leadTemp?: "frio" | "morno" | "quente";
    priority?: "baixa" | "media" | "alta";
    whenValue?: string[];
  };
};

export type AiQualificationCommercialContinuation = {
  enabled?: boolean;
  negativeReply?: string;
  ambiguousEnumReply?: string;
};

export type AiQualificationSemanticConfirmation = {
  enabled?: boolean;
  minimumConfidence?: number;
  autoAcceptConfidence?: number;
  expirationMinutes?: number;
};

export type AiQualificationSchema = {
  enabled?: boolean;
  semanticResolverEnabled?: boolean;
  semanticConfirmationEnabled?: boolean;
  semanticConfirmation?: AiQualificationSemanticConfirmation;
  schemaVersion?: string;
  slots?: AiQualificationSlot[];
  handoffWhen?: string[];
  outcomes?: string[];
  commercialContinuation?: AiQualificationCommercialContinuation;
};

export type ConversationReportByAgentItem = {
  userId: string;
  conversations: number;
  avgResponseTimeSec: number | null;
};

export type ConversationReportAgentMessageActivityItem = {
  userId: string;
  userName: string | null;
  outboundMessages: number;
};

export type ConversationReportByDepartmentItem = {
  departmentId: string | null;
  departmentName: string | null;
  conversations: number;
  avgResponseTimeSec: number | null;
};

export type ConversationReportByChannelItem = {
  channel: "whatsapp" | "messenger" | "instagram" | "webchat" | "telegram" | "support" | "unknown";
  channelName: string;
  conversations: number;
};

export type ConversationReportConversationItem = {
  conversationId: string;
  cycleId: string | null;
  protocol: string;
  waId: string;
  channel: "whatsapp" | "messenger" | "instagram" | "webchat" | "telegram" | "support" | "unknown";
  channelName: string;
  departmentId: string | null;
  departmentName: string | null;
  assignedUserIds: string[];
  status: string | null;
  startedAt: string;
  closedAt: string | null;
};

export type ConversationReportResponse = {
  ok: true;
  range: ConversationReportRange;
  periodFrom?: string | null;
  periodTo?: string | null;
  dedupe?: boolean;
  channel?: "whatsapp" | "messenger" | "instagram" | "webchat" | "telegram" | "support" | null;
  userId: string | null;
  departmentId: string | null;
  queueId?: string | null;
  totalConversations: number;
  automatedConversations?: number;
  humanTransferCount?: number;
  avgFirstResponseTimeSec: number | null;
  avgResolutionTimeSec: number | null;
  slaOperational?: {
    waitingFirstResponse: number;
    inProgress: number;
    waitingUser: number;
    closed: number;
    avgFirstResponseTimeSec: number | null;
    avgResolutionTimeSec: number | null;
  };
  slaBreaches: number;
  agentMessageActivity?: ConversationReportAgentMessageActivityItem[];
  assignedConversationsByAgent?: ConversationReportByAgentItem[];
  byAgent: ConversationReportByAgentItem[];
  byDepartment: ConversationReportByDepartmentItem[];
  byChannel?: ConversationReportByChannelItem[];
  conversations?: ConversationReportConversationItem[];
  notes?: string[];
};

export type OpsMetricLabels = Record<string, string>;

export type OpsCounterMetric = {
  name: string;
  labels: OpsMetricLabels;
  value: number;
};

export type OpsGaugeMetric = {
  name: string;
  labels: OpsMetricLabels;
  value: number;
};

export type OpsTimingMetric = {
  name: string;
  labels: OpsMetricLabels;
  count: number;
  totalMs: number;
  avgMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  lastMs: number;
};

export type OpsAverageMetric = {
  name: string;
  labels: OpsMetricLabels;
  count: number;
  avgMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
};

export type OpsMetricsSnapshot = {
  ok: true;
  generatedAt: string;
  process?: {
    uptimeSeconds?: number;
    memory?: {
      rss?: number;
      heapTotal?: number;
      heapUsed?: number;
      external?: number;
      arrayBuffers?: number;
    };
    cpu?: {
      user?: number;
      system?: number;
    };
  };
  counters: OpsCounterMetric[];
  gauges: OpsGaugeMetric[];
  timings: OpsTimingMetric[];
  averages?: OpsAverageMetric[];
};

export type LeadStatus = string;

export type LeadNoteItem = {
  id: string;
  leadId: string;
  tenantId: string;
  body: string;
  createdAt: string;
};

export type CampaignItem = {
  id: string;
  clientId: string;
  templateId?: string | null;
  name: string;
  templateName: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  blockedCount: number;
  createdAt: string;
  updatedAt: string;
  progress: {
    totalRecipients: number;
    sentCount: number;
    blockedCount: number;
    pendingCount: number;
  };
  metaSummary?: {
    totalSent: number;
    totalDelivered: number;
    totalRead: number;
    totalFailed: number;
  };
  messagesMetaStatus?: Array<{
    waId: string;
    templateName: string | null;
    status: "sent" | "delivered" | "read" | "failed";
    sentAt: string | null;
    deliveredAt: string | null;
    billable: boolean;
    nonBillingReason: string | null;
    pricingCategory: string | null;
    pricingBillable: boolean | null;
    pricingModel: string | null;
    conversationId: string | null;
    error: string | null;
  }>;
  draftSeed?: {
    name: string;
    templateId?: string | null;
    templateName: string;
    leadIds?: string[];
    recipients: string[];
    manualRecipientInput?: string[];
    templateParams: string[];
    templateVariableMappings?: Array<{
      position: string;
      source: string;
      value?: string;
      fallback?: string;
    }>;
  };
  draftReview?: {
    summary: CampaignDraftSummary;
    recipients: Array<{
      phoneDisplay: string | null;
      identifierDisplay: string;
    }>;
  };
};

export type CampaignDraftSummary = {
  requested: number;
  accepted: number;
  blocked: number;
  duplicatesRemoved: number;
  blockedByReason: Array<{
    reason: string;
    label: string;
    count: number;
  }>;
};

export type TemplateObservabilityItem = {
  createdAt: string;
  waId: string;
  type: string;
  templateName: string | null;
  templateLang: string | null;
  status: string;
  requestId: string | null;
  errorBody: string | null;
  metaMessageId: string | null;
  lastStatus: string | null;
  pricingCategory: string | null;
  pricingBillable: boolean | null;
  pricingModel: string | null;
  conversationId: string | null;
  statusDetail: string | null;
  errorData: Record<string, unknown> | null;
  errors: unknown[] | null;
};

export type AdminTemplateCatalogItem = {
  id: string;
  clientId: string;
  clientKey: string;
  clientName: string;
  name: string;
  category: string;
  language: string;
  status: string;
  locallyDisabled?: boolean;
  localAvailabilityUpdatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminTemplateRequestItem = {
  id: string;
  clientId: string;
  clientKey: string;
  clientName: string;
  name: string;
  content: string;
  variables: unknown;
  variableDetails?: Array<{ key: string; description: string; example: string }>;
  category: string;
  language?: string;
  status: string;
  statusLabel?: string;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type TenantOnboardingExchangePayload = {
  code: string;
  redirectUri?: string | null;
  replaceExistingMetaIdentity?: boolean;
  embeddedSignup?: {
    businessId?: string | null;
    businessPortfolioId?: string | null;
    wabaId?: string | null;
    phoneNumberId?: string | null;
    displayPhoneNumber?: string | null;
    raw?: unknown;
  };
};

export type TenantOnboardingManualBindPayload = {
  phoneNumberId: string;
  displayPhoneNumber?: string | null;
  wabaId?: string | null;
  businessId?: string | null;
  businessPortfolioId?: string | null;
  replaceExistingMetaIdentity?: boolean;
  raw?: unknown;
};

export type TenantOnboardingRegisterPhonePayload = {
  phoneNumberId?: string | null;
  pin: string;
};

export type Channel = "whatsapp" | "instagram" | "messenger";

export type Provider = "meta" | "web_session";

export type TenantChannelAccount = {
  id: string;
  tenantKey: string;
  channel: Channel;
  provider: Provider;
  displayName?: string;
  channelAccountId: string;
  externalAccountIds?: string[];
  externalBusinessId?: string;
  metadata?: Record<string, string>;
  enabled: boolean;
  automationEnabled?: boolean;
  runtimeEnabled?: boolean;
  inboundPersistenceEnabled?: boolean;
  outboundEnabled?: boolean;
  aiEnabled?: boolean;
  handoffEnabled?: boolean;
  status?: "connected" | "disabled" | "pending" | "error";
  tokenStatus?: "not_required" | "configured" | "expired" | "missing";
  pageAccessToken?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TenantWebSessionStatus = {
  configured: boolean;
  featureEnabled: boolean;
  account: {
    id: string;
    channelAccountId: string;
    displayName: string | null;
    channel: "whatsapp";
    provider: "web_session";
    enabled: boolean;
    runtimeEnabled: boolean;
    status: string;
    tokenStatus: string;
    lastUpdatedAt: string;
  } | null;
  lifecycle: {
    desiredState: "CONNECTED" | "DISCONNECTED";
    observedState: "DISCONNECTED" | "CONNECTING" | "QR_REQUIRED" | "CONNECTED" | "RECONNECTING" | "ERROR";
    lastConnectedAt: string | null;
    lastDisconnectedAt: string | null;
    lastErrorAt: string | null;
    lastErrorCode: string | null;
    reconnectCount: number;
  };
  authorization: {
    status: "AUTHORIZED" | "OWNED" | "RELEASED" | "INVALIDATED_BY_META_IDENTITY_CHANGE";
    authorizedNumberCanonical: string | null;
    authorizedNumberMasked: string | null;
    authorizedAt: string | null;
    authorizedBy: string | null;
    releasedAt: string | null;
    releasedBy: string | null;
    invalidatedAt?: string | null;
    invalidatedBy?: string | null;
    invalidationReason?: string | null;
  };
  hybridIdentity?: {
    meta: {
      configured: boolean;
      canonicalNumber: string | null;
      maskedNumber: string | null;
      phoneNumberIdPresent: boolean;
      reason: string;
    };
    web: {
      status: string;
      canonicalNumber: string | null;
      maskedNumber: string | null;
    };
    conflict: boolean;
    logicalIdentity: {
      provider: "meta" | "web_session";
      canonicalNumber: string;
      maskedNumber: string | null;
    } | null;
  };
  primaryTransport?: "meta" | "web_session" | null;
  detectedNumber: {
    masked: string | null;
    matchesAuthorized: boolean;
  } | null;
};

export type TenantConfigResponse = {
  ok: boolean;
  tenantId: string;
  supportAccess?: {
    id: string;
    clientId: string;
    grantedByUserId: string;
    reason: string | null;
    scope: string;
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
    revokedByUserId: string | null;
    revokeReason: string | null;
    active: boolean;
  } | null;
  client?: {
    id: string;
    clientKey: string;
    status: string;
    profile?: "business" | "government";
    features?: Record<string, unknown> | null;
  } | null;
  featureEntitlements?: Array<{
    key: string;
    label: string;
    description: string;
    category: "attendance" | "communication" | "management" | "security" | "automation";
    technicalCapabilitySource: string;
    entitlementSource: "Client.features";
    runtimeDependency: string;
    frontendVisibilityGuard: string;
    backendGuard: string;
    defaultByProfile: Record<"business" | "government", boolean>;
    enabled: boolean;
    status: "enabled" | "disabled" | "unavailable";
    unavailableReasons: string[];
  }>;
  tenant: {
    id: string;
    name: string;
    metaPhoneNumberId: string;
    displayPhoneNumber?: string;
    companyLegalName?: string;
    companyTradeName?: string;
    companyTaxId?: string;
    companyStateRegistration?: string;
    companyMunicipalRegistration?: string;
    companyWebsite?: string;
    companyIndustry?: string;
    companyAddressStreet?: string;
    companyAddressNumber?: string;
    companyAddressComplement?: string;
    companyAddressDistrict?: string;
    companyAddressCity?: string;
    companyAddressState?: string;
    companyAddressZip?: string;
    companyAddressCountry?: string;
    legalRepresentativeName?: string;
    legalRepresentativeCpf?: string;
    legalRepresentativeEmail?: string;
    legalRepresentativePhone?: string;
    billingContactName?: string;
    billingContactEmail?: string;
    billingContactPhone?: string;
    billingEmail?: string;
    financialContactName?: string;
    financialContactEmail?: string;
    financialContactPhone?: string;
    technicalContactName?: string;
    technicalContactEmail?: string;
    technicalContactPhone?: string;
    contractPlanName?: string;
    contractStartDate?: string;
    contractEndDate?: string;
    contractBillingDay?: number;
    contractPaymentMethod?: string;
    contractNotes?: string;
    maxActiveAppUsers?: number;
    allowlist: string[];
    handoffAttendantWaid: string;
    defaultLanguage: string;
    disableAutoReply?: boolean;
    disableChatbot?: boolean;
    disableLegacyFlows?: boolean;
    disableChatbotFlowEditing?: boolean;
    disableAiFallback?: boolean;
    disableIntentClassifier?: boolean;
    appDisableIntentClassifier?: boolean;
    aiBusinessContext?: string;
    templates?: {
      manualHandoff?: string;
    };
    quotaMonthlyConversations?: number;
    quotaWarnAtPct?: number;
    quotaBlockedReplyText?: string;
    quotaExcludeWaIds?: string[];
    channelAccounts?: TenantChannelAccount[];
  };
};

export type AdminConnection = {
  baseUrl: string;
  adminToken: string;
  rememberToken: boolean;
};

export type AdminApiError = Error & { status?: number };

export type AdminTrainingContentType = "VIDEO" | "PDF";
export type AdminTrainingContentStatus = "DRAFT" | "PUBLISHED";

export type AdminTrainingContentItem = {
  id: string;
  contentId: string;
  type: AdminTrainingContentType;
  title: string;
  description: string | null;
  category: string;
  sortOrder: number;
  status: AdminTrainingContentStatus;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  downloadable: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  previewUrl: string;
  downloadUrl: string;
};

export type AdminTrainingContentPayload = {
  title: string;
  description?: string;
  category: string;
  type: AdminTrainingContentType;
  sortOrder: number;
  status: AdminTrainingContentStatus;
  downloadable: boolean;
};

const STORAGE_KEY = "wa_admin_connection_v1";
const SESSION_TOKEN_KEY = "wa_admin_token_session_v1";
const LOCAL_TOKEN_KEY = "wa_admin_token_local_v1";

function getDefaultBaseUrl() {
  return process.env.NEXT_PUBLIC_WHATSAPP_AGENT_BASE_URL || "/agent-api";
}

function shouldReplaceStoredBaseUrl(baseUrl: string) {
  if (typeof window === "undefined") return false;
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized.startsWith("http://127.0.0.1:") && !normalized.startsWith("http://localhost:")) {
    return false;
  }
  const hostname = window.location.hostname;
  return hostname !== "127.0.0.1" && hostname !== "localhost";
}

export function normalizeBaseUrl(input: string) {
  const value = input.trim().replace(/\/+$/, "");
  if (!value) return "";
  if (value.startsWith("/")) {
    return value;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

export function loadAdminConnection(): AdminConnection {
  if (typeof window === "undefined") {
    return { baseUrl: getDefaultBaseUrl(), adminToken: "", rememberToken: false };
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as
      | Partial<Pick<AdminConnection, "baseUrl" | "rememberToken">>
      | undefined;
    const rememberToken = Boolean(parsed?.rememberToken);
    const sessionToken = sessionStorage.getItem(SESSION_TOKEN_KEY) || "";
    const localToken = localStorage.getItem(LOCAL_TOKEN_KEY) || "";
    const adminToken = rememberToken ? localToken : sessionToken;

    const storedBaseUrl = normalizeBaseUrl(String(parsed?.baseUrl || getDefaultBaseUrl()));
    return {
      baseUrl: shouldReplaceStoredBaseUrl(storedBaseUrl)
        ? getDefaultBaseUrl()
        : storedBaseUrl,
      adminToken: adminToken.trim(),
      rememberToken,
    };
  } catch {
    return { baseUrl: getDefaultBaseUrl(), adminToken: "", rememberToken: false };
  }
}

export function saveAdminConnection(connection: AdminConnection) {
  if (typeof window === "undefined") return;
  const normalizedBaseUrl = normalizeBaseUrl(connection.baseUrl);
  const payload = {
    ...(normalizedBaseUrl ? { baseUrl: normalizedBaseUrl } : {}),
    rememberToken: Boolean(connection.rememberToken),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  sessionStorage.setItem(SESSION_TOKEN_KEY, connection.adminToken);
  if (connection.rememberToken) {
    localStorage.setItem(LOCAL_TOKEN_KEY, connection.adminToken);
  } else {
    localStorage.removeItem(LOCAL_TOKEN_KEY);
  }
}

export function clearAdminConnection() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LOCAL_TOKEN_KEY);
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

async function requestJson<T>(
  connection: AdminConnection,
  path: string,
  init?: RequestInit
): Promise<T> {
  const baseUrl = normalizeBaseUrl(connection.baseUrl);
  if (!baseUrl) {
    const error = new Error("Base URL invalida. Use http(s)://... ou /agent-api.") as AdminApiError;
    error.status = 400;
    throw error;
  }
  const adminToken = connection.adminToken.trim();
  if (!adminToken) {
    const error = new Error("Informe o X-Admin-Token.") as AdminApiError;
    error.status = 400;
    throw error;
  }
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 10000);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Token": adminToken,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (fetchError) {
    globalThis.clearTimeout(timeout);
    const error = new Error("Sem resposta do servidor.") as AdminApiError;
    error.status = 0;
    if ((fetchError as Error).name === "AbortError") {
      error.message = "Timeout de conexao com o servidor.";
    }
    throw error;
  }
  globalThis.clearTimeout(timeout);

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as {
        error?: string | { code?: string; message?: string };
        message?: string;
      };
      message =
        (typeof body.error === "object" && body.error && typeof body.error.message === "string"
          ? body.error.message
          : "") ||
        body.message ||
        (typeof body.error === "string" ? body.error : "") ||
        message;
    } catch {
      // noop
    }
    const error = new Error(message) as AdminApiError;
    error.status = res.status;
    if (res.status === 401) error.message = "Token inválido (401).";
    if (res.status === 403) error.message = "Sem permissão (403).";
    if (res.status >= 500) error.message = "Erro no servidor (5xx).";
    throw error;
  }

  return (await res.json()) as T;
}

async function requestText(
  connection: AdminConnection,
  path: string,
  init?: RequestInit
): Promise<string> {
  const baseUrl = normalizeBaseUrl(connection.baseUrl);
  if (!baseUrl) {
    const error = new Error("Base URL invalida. Use http(s)://... ou /agent-api.") as AdminApiError;
    error.status = 400;
    throw error;
  }
  const adminToken = connection.adminToken.trim();
  if (!adminToken) {
    const error = new Error("Informe o X-Admin-Token.") as AdminApiError;
    error.status = 400;
    throw error;
  }
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 10000);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "X-Admin-Token": adminToken,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (fetchError) {
    globalThis.clearTimeout(timeout);
    const error = new Error("Sem resposta do servidor.") as AdminApiError;
    error.status = 0;
    if ((fetchError as Error).name === "AbortError") {
      error.message = "Timeout de conexao com o servidor.";
    }
    throw error;
  }
  globalThis.clearTimeout(timeout);

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as {
        error?: string | { code?: string; message?: string };
        message?: string;
      };
      message =
        (typeof body.error === "object" && body.error && typeof body.error.message === "string"
          ? body.error.message
          : "") ||
        body.message ||
        (typeof body.error === "string" ? body.error : "") ||
        message;
    } catch {
      // noop
    }
    const error = new Error(message) as AdminApiError;
    error.status = res.status;
    if (res.status === 401) error.message = "Token inválido (401).";
    if (res.status === 403) error.message = "Sem permissão (403).";
    if (res.status >= 500) error.message = "Erro no servidor (5xx).";
    throw error;
  }

  return res.text();
}

async function requestFormJson<T>(
  connection: AdminConnection,
  path: string,
  formData: FormData,
  init?: RequestInit
): Promise<T> {
  const baseUrl = normalizeBaseUrl(connection.baseUrl);
  if (!baseUrl) {
    const error = new Error("Base URL invalida. Use http(s)://... ou /agent-api.") as AdminApiError;
    error.status = 400;
    throw error;
  }
  const adminToken = connection.adminToken.trim();
  if (!adminToken) {
    const error = new Error("Informe o X-Admin-Token.") as AdminApiError;
    error.status = 400;
    throw error;
  }
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    method: init?.method ?? "POST",
    headers: {
      "X-Admin-Token": adminToken,
      ...(init?.headers ?? {}),
    },
    body: formData,
    cache: "no-store",
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      message = body.message || body.error || message;
    } catch {
      // noop
    }
    const error = new Error(message) as AdminApiError;
    error.status = res.status;
    if (res.status === 401) error.message = "Token inválido (401).";
    if (res.status === 403) error.message = "Sem permissão (403).";
    if (res.status >= 500) error.message = "Erro no servidor (5xx).";
    throw error;
  }
  return (await res.json()) as T;
}

async function requestAdminBlob(
  connection: AdminConnection,
  path: string
): Promise<{ blob: Blob; contentType: string | null; fileName: string | null }> {
  const baseUrl = normalizeBaseUrl(connection.baseUrl);
  if (!baseUrl) {
    const error = new Error("Base URL invalida. Use http(s)://... ou /agent-api.") as AdminApiError;
    error.status = 400;
    throw error;
  }
  const adminToken = connection.adminToken.trim();
  if (!adminToken) {
    const error = new Error("Informe o X-Admin-Token.") as AdminApiError;
    error.status = 400;
    throw error;
  }
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "X-Admin-Token": adminToken },
    cache: "no-store",
  });
  if (!res.ok) {
    const error = new Error(res.status >= 500 ? "Erro no servidor (5xx)." : `Request failed (${res.status})`) as AdminApiError;
    error.status = res.status;
    if (res.status === 401) error.message = "Token inválido (401).";
    if (res.status === 403) error.message = "Sem permissão (403).";
    throw error;
  }
  const disposition = res.headers.get("content-disposition");
  const fileNameMatch = disposition?.match(/filename="([^"]+)"/i);
  return {
    blob: await res.blob(),
    contentType: res.headers.get("content-type"),
    fileName: fileNameMatch?.[1] ?? null,
  };
}

export async function testAdminConnection(connection: AdminConnection) {
  return requestJson<{ ok: boolean }>(connection, "/admin/health");
}

function trainingPayloadToFormData(payload: AdminTrainingContentPayload, file?: File | null) {
  const formData = new FormData();
  formData.set("title", payload.title);
  formData.set("description", payload.description ?? "");
  formData.set("category", payload.category);
  formData.set("type", payload.type);
  formData.set("sortOrder", String(payload.sortOrder));
  formData.set("status", payload.status);
  formData.set("downloadable", String(payload.downloadable));
  if (file) formData.set("file", file);
  return formData;
}

export async function fetchAdminTrainingContent(
  connection: AdminConnection
): Promise<{ ok: true; items: AdminTrainingContentItem[] }> {
  return requestJson(connection, "/admin/training");
}

export async function createAdminTrainingContent(
  connection: AdminConnection,
  payload: AdminTrainingContentPayload,
  file: File
): Promise<{ ok: true; item: AdminTrainingContentItem }> {
  return requestFormJson(connection, "/admin/training", trainingPayloadToFormData(payload, file));
}

export async function updateAdminTrainingContent(
  connection: AdminConnection,
  itemId: string,
  payload: Omit<AdminTrainingContentPayload, "type">
): Promise<{ ok: true; item: AdminTrainingContentItem }> {
  return requestJson(connection, `/admin/training/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function publishAdminTrainingContent(
  connection: AdminConnection,
  itemId: string
): Promise<{ ok: true; item: AdminTrainingContentItem }> {
  return requestJson(connection, `/admin/training/${encodeURIComponent(itemId)}/publish`, {
    method: "POST",
  });
}

export async function unpublishAdminTrainingContent(
  connection: AdminConnection,
  itemId: string
): Promise<{ ok: true; item: AdminTrainingContentItem }> {
  return requestJson(connection, `/admin/training/${encodeURIComponent(itemId)}/unpublish`, {
    method: "POST",
  });
}

export async function replaceAdminTrainingContentFile(
  connection: AdminConnection,
  itemId: string,
  file: File
): Promise<{ ok: true; item: AdminTrainingContentItem }> {
  const formData = new FormData();
  formData.set("file", file);
  return requestFormJson(connection, `/admin/training/${encodeURIComponent(itemId)}/file`, formData);
}

export async function deleteAdminTrainingContent(
  connection: AdminConnection,
  itemId: string
): Promise<{ ok: true }> {
  return requestJson(connection, `/admin/training/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
}

export function buildAdminTrainingContentUrl(connection: AdminConnection, path: string) {
  const baseUrl = normalizeBaseUrl(connection.baseUrl);
  return `${baseUrl}${path}`;
}

export async function fetchAdminTrainingContentBlob(
  connection: AdminConnection,
  itemId: string
): Promise<{ blob: Blob; contentType: string | null; fileName: string | null }> {
  return requestAdminBlob(connection, `/admin/training/${encodeURIComponent(itemId)}/content`);
}

export async function fetchTenantsSummary(
  connection: AdminConnection,
  range: SummaryRange
): Promise<TenantSummaryItem[]> {
  const response = await requestJson<{
    ok: boolean;
    tenants: TenantSummaryItem[];
  }>(connection, `/admin/tenants/summary?range=${range}`);
  return response.tenants;
}

export async function fetchAdminClients(
  connection: AdminConnection
): Promise<{
  items: AdminClientItem[];
}> {
  return requestJson(connection, "/admin/clients");
}

export async function fetchConversationReport(
  connection: AdminConnection,
  params: {
    clientKey: string;
    range: ConversationReportRange;
    userId?: string | null;
    departmentId?: string | null;
  }
): Promise<ConversationReportResponse> {
  const query = new URLSearchParams({
    clientKey: params.clientKey,
    range: params.range,
  });
  if (params.userId) {
    query.set("userId", params.userId);
  }
  if (params.departmentId) {
    query.set("departmentId", params.departmentId);
  }
  return requestJson(connection, `/admin/reports/conversations?${query.toString()}`);
}

export async function fetchOpsMetrics(
  connection: AdminConnection
): Promise<OpsMetricsSnapshot> {
  return requestJson(connection, "/admin/ops/metrics");
}

export async function exportConversationReportCsv(
  connection: AdminConnection,
  params: {
    clientKey: string;
    range: ConversationReportRange;
    userId?: string | null;
    departmentId?: string | null;
  }
) {
  const query = new URLSearchParams({
    clientKey: params.clientKey,
    range: params.range,
  });
  if (params.userId) {
    query.set("userId", params.userId);
  }
  if (params.departmentId) {
    query.set("departmentId", params.departmentId);
  }
  return requestText(connection, `/admin/reports/conversations/export?${query.toString()}`);
}

export async function createAdminClient(
  connection: AdminConnection,
  payload: {
    name: string;
    clientKey: string;
    phoneNumberId: string;
    profile?: "business" | "government";
    initialUser?: {
      name: string;
      email: string;
      password?: string;
      role?: string;
      departmentId?: string | null;
      isActive?: boolean;
    };
  }
): Promise<AdminClientItem> {
  return requestJson(connection, "/admin/clients", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      clientKey: payload.clientKey,
      phone_number_id: payload.phoneNumberId,
      profile: payload.profile,
      ...(payload.initialUser ? { initialUser: payload.initialUser } : {}),
    }),
  });
}

export async function createAdminTenant(
  connection: AdminConnection,
  payload: {
    name: string;
    clientKey: string;
    profile?: "business" | "government";
    status?: "ACTIVE" | "INACTIVE" | "ONBOARDING";
    phoneNumberId?: string;
    displayPhoneNumber?: string;
    companyLegalName?: string;
    companyTradeName?: string;
    companyTaxId?: string;
    companyAddressStreet?: string;
    companyAddressNumber?: string;
    companyAddressDistrict?: string;
    companyAddressCity?: string;
    companyAddressState?: string;
    companyAddressZip?: string;
    companyAddressCountry?: string;
    legalRepresentativeName?: string;
    legalRepresentativePhone?: string;
    contractPlanName?: string;
    contractNotes?: string;
  }
): Promise<{
  ok: boolean;
  tenantId: string;
  clientKey: string;
  action: "created" | "updated" | "existing";
  initialChannel: "meta_cloud" | "none";
  client: AdminClientItem & { status?: string };
  tenant: TenantConfigResponse["tenant"];
}> {
  return requestJson(connection, "/admin/tenants", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchTenantById(
  connection: AdminConnection,
  tenantId: string
): Promise<TenantConfigResponse> {
  return requestJson<TenantConfigResponse>(
    connection,
    `/admin/tenants/${encodeURIComponent(tenantId)}`
  );
}

export async function updateTenantById(
  connection: AdminConnection,
  tenantId: string,
  body: Record<string, unknown>
): Promise<{
  ok: boolean;
  tenantId: string;
  backupPath?: string;
  fieldsChanged?: string[];
  tenant: TenantConfigResponse["tenant"];
}> {
  return requestJson(connection, `/admin/tenants/${encodeURIComponent(tenantId)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function updateTenantFeatures(
  connection: AdminConnection,
  tenantId: string,
  features: Record<string, boolean>
): Promise<{
  ok: true;
  tenantId: string;
  client: NonNullable<TenantConfigResponse["client"]>;
  featureEntitlements: NonNullable<TenantConfigResponse["featureEntitlements"]>;
  fieldsChanged: string[];
}> {
  return requestJson(connection, `/admin/tenants/${encodeURIComponent(tenantId)}/features`, {
    method: "PUT",
    body: JSON.stringify({ features }),
  });
}

export async function getTenantChannelAccounts(
  connection: AdminConnection,
  tenantId: string
): Promise<{
  ok: true;
  tenantId: string;
  channelAccounts: TenantChannelAccount[];
  webSessionStatus?: TenantWebSessionStatus;
}> {
  return requestJson(
    connection,
    `/admin/tenants/${encodeURIComponent(tenantId)}/channel-accounts`
  );
}

export async function updateTenantChannelAccounts(
  connection: AdminConnection,
  tenantId: string,
  accounts: unknown[]
): Promise<{
  ok: true;
  tenantId: string;
  backupPath: string;
  fieldsChanged: string[];
  channelAccounts: TenantChannelAccount[];
  webSessionStatus?: TenantWebSessionStatus;
}> {
  return requestJson(
    connection,
    `/admin/tenants/${encodeURIComponent(tenantId)}/channel-accounts`,
    {
      method: "PUT",
      body: JSON.stringify(accounts),
    }
  );
}

export async function getTenantWhatsAppMediaPolicy(
  connection: AdminConnection,
  tenantId: string
): Promise<{
  ok: true;
  tenantId: string;
  source: "db" | "json_fallback";
  whatsappMediaPolicy: WhatsappMediaPolicy;
  permissions: { canUpdate: boolean };
}> {
  return requestJson(
    connection,
    `/admin/tenants/${encodeURIComponent(tenantId)}/whatsapp/media-policy`
  );
}

export async function updateTenantWhatsAppMediaPolicy(
  connection: AdminConnection,
  tenantId: string,
  whatsappMediaPolicy: WhatsappMediaPolicy
): Promise<{
  ok: true;
  tenantId: string;
  source: "db";
  fieldsChanged: string[];
  whatsappMediaPolicy: WhatsappMediaPolicy;
  permissions: { canUpdate: boolean };
}> {
  return requestJson(
    connection,
    `/admin/tenants/${encodeURIComponent(tenantId)}/whatsapp/media-policy`,
    {
      method: "PUT",
      body: JSON.stringify({ whatsappMediaPolicy }),
    }
  );
}

export async function authorizeTenantWebSessionNumber(
  connection: AdminConnection,
  tenantId: string,
  number: string
): Promise<{
  ok: true;
  tenantId: string;
  status: TenantWebSessionStatus;
}> {
  return requestJson(
    connection,
    `/admin/tenants/${encodeURIComponent(tenantId)}/web-session/authorize-number`,
    {
      method: "PUT",
      body: JSON.stringify({ number }),
    }
  );
}

export async function releaseTenantWebSessionNumber(
  connection: AdminConnection,
  tenantId: string
): Promise<{
  ok: true;
  tenantId: string;
  status: TenantWebSessionStatus;
}> {
  return requestJson(
    connection,
    `/admin/tenants/${encodeURIComponent(tenantId)}/web-session/release-number`,
    {
      method: "POST",
    }
  );
}

export async function updateTenantWhatsAppPrimaryTransport(
  connection: AdminConnection,
  tenantId: string,
  provider: "meta" | "web_session"
): Promise<{
  ok: true;
  tenantId: string;
  primaryTransport: "meta" | "web_session";
  status: TenantWebSessionStatus;
}> {
  return requestJson(
    connection,
    `/admin/tenants/${encodeURIComponent(tenantId)}/whatsapp/primary-transport`,
    {
      method: "PUT",
      body: JSON.stringify({ provider }),
    }
  );
}

export async function startTenantInstagramBusinessConnect(
  connection: AdminConnection,
  tenantId: string
): Promise<{
  ok: true;
  authUrl: string;
  redirectUri: string;
  returnPath: string;
  scopes: string[];
}> {
  return requestJson(
    connection,
    `/admin/tenants/${encodeURIComponent(tenantId)}/channels/instagram/connect/start`,
    {
      method: "POST",
    }
  );
}

export async function bootstrapTenantById(
  connection: AdminConnection,
  tenantId: string,
  payload?: {
    initialUser?: {
      name: string;
      email: string;
      password?: string;
      role?: string;
      departmentId?: string | null;
      isActive?: boolean;
    };
  }
): Promise<{
  ok: true;
  tenantId: string;
  clientId: string;
  clientKey: string;
  seed: {
    created: number;
    reactivated: number;
    unchanged: number;
    total: number;
  };
  initialUser: {
    action: "created" | "updated";
    id: string;
    email: string;
    role: string;
    departmentId: string | null;
    isActive: boolean;
  } | null;
  departmentCount: number;
  firstDepartmentId: string | null;
}> {
  return requestJson(connection, `/admin/tenants/${encodeURIComponent(tenantId)}/bootstrap`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export async function fetchConversations(
  connection: AdminConnection,
  clientKey: string,
  options?: { limit?: number; channel?: string | null }
): Promise<{
  ok: true;
  count: number;
  items: InboxConversationItem[];
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  if (typeof options?.limit === "number" && Number.isFinite(options.limit)) {
    params.set("limit", String(options.limit));
  }
  if (options?.channel?.trim()) {
    params.set("channel", options.channel.trim());
  }
  return requestJson(connection, `/admin/conversations?${params.toString()}`);
}

export async function fetchConversation(
  connection: AdminConnection,
  clientKey: string,
  waId: string,
  options?: { limit?: number; order?: "asc" | "desc" }
): Promise<{
  ok: true;
  waId: string;
  channel?: string | null;
  provider?: string | null;
  channelAccountId?: string | null;
  mode: "BOT" | "HUMAN";
  assignedUserId: string | null;
  assignedTo: string | null;
  assignedUserName: string | null;
  assignedAt: string | null;
  count: number;
  items: InboxMessageItem[];
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  if (typeof options?.limit === "number" && Number.isFinite(options.limit)) {
    params.set("limit", String(options.limit));
  }
  if (options?.order) {
    params.set("order", options.order);
  }
  return requestJson(
    connection,
    `/admin/conversation/${encodeURIComponent(waId)}?${params.toString()}`
  );
}

export async function claimConversation(
  connection: AdminConnection,
  clientKey: string,
  waId: string,
  userId?: string
): Promise<{
  ok: true;
  waId: string;
  mode: "BOT" | "HUMAN";
  assignedUserId: string | null;
  assignedTo: string | null;
  assignedUserName: string | null;
  assignedAt: string | null;
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  if (userId) {
    params.set("userId", userId);
  }
  return requestJson(
    connection,
    `/admin/conversation/${encodeURIComponent(waId)}/claim?${params.toString()}`,
    { method: "POST" }
  );
}

export async function releaseConversation(
  connection: AdminConnection,
  clientKey: string,
  waId: string
): Promise<{
  ok: true;
  waId: string;
  mode: "BOT" | "HUMAN";
  assignedUserId: string | null;
  assignedTo: string | null;
  assignedUserName: string | null;
  assignedAt: string | null;
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  return requestJson(
    connection,
    `/admin/conversation/${encodeURIComponent(waId)}/release?${params.toString()}`,
    { method: "POST" }
  );
}

export async function transferConversationDepartment(
  connection: AdminConnection,
  clientKey: string,
  waId: string,
  departmentId: string
): Promise<{
  ok: true;
  waId: string;
  waIdCanonical?: string | null;
  mode: "BOT" | "HUMAN";
  assignedUserId: string | null;
  assignedTo: string | null;
  assignedUserName: string | null;
  assignedAt: string | null;
  departmentId: string | null;
  departmentName: string | null;
  queueId: string | null;
  queueName: string | null;
  status: ConversationOperationalStatus | null;
  closedAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  isUnassigned: boolean;
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  return requestJson(
    connection,
    `/admin/conversations/${encodeURIComponent(waId)}/transfer-department?${params.toString()}`,
    {
      method: "POST",
      body: JSON.stringify({ departmentId }),
    }
  );
}

export async function fetchUsers(
  connection: AdminConnection,
  clientKey: string
): Promise<{
  ok: true;
  count: number;
  items: AdminUserItem[];
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  return requestJson(connection, `/admin/users?${params.toString()}`);
}

export async function fetchDepartments(
  connection: AdminConnection,
  clientKey: string,
  options?: { includeInactive?: boolean }
): Promise<{
  ok: true;
  count: number;
  timezone?: string;
  items: AdminDepartmentItem[];
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  if (options?.includeInactive) {
    params.set("includeInactive", "true");
  }
  return requestJson(connection, `/admin/departments?${params.toString()}`);
}

export async function createDepartment(
  connection: AdminConnection,
  clientKey: string,
  payload: {
    name: string;
    businessHours?: Array<{ weekday: number; startMinute: number; endMinute: number }>;
    businessHourExceptions?: Array<{
      date: string;
      type: "CLOSED" | "CUSTOM_HOURS";
      reason?: string | null;
      intervals?: Array<{ startMinute: number; endMinute: number }> | null;
    }>;
  }
): Promise<{
  ok: true;
  department: AdminDepartmentItem;
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  return requestJson(connection, `/admin/departments?${params.toString()}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateDepartment(
  connection: AdminConnection,
  clientKey: string,
  departmentId: string,
  payload: {
    name?: string;
    isActive?: boolean;
    businessHours?: Array<{ weekday: number; startMinute: number; endMinute: number }>;
    businessHourExceptions?: Array<{
      date: string;
      type: "CLOSED" | "CUSTOM_HOURS";
      reason?: string | null;
      intervals?: Array<{ startMinute: number; endMinute: number }> | null;
    }>;
  }
): Promise<{
  ok: true;
  department: AdminDepartmentItem;
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  return requestJson(
    connection,
    `/admin/departments/${encodeURIComponent(departmentId)}?${params.toString()}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
}

export async function consolidateDepartment(
  connection: AdminConnection,
  clientKey: string,
  departmentId: string,
  targetDepartmentId: string
): Promise<{
  ok: true;
  sourceDepartment: AdminDepartmentItem;
  targetDepartment: AdminDepartmentItem;
  counts: {
    usersMoved: number;
    conversationsMoved: number;
    runtimeStatesMoved: number;
    queuesMoved: number;
    queuesMerged: number;
    runtimeStatesRequeued: number;
  };
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  return requestJson(
    connection,
    `/admin/departments/${encodeURIComponent(departmentId)}/consolidate?${params.toString()}`,
    {
      method: "POST",
      body: JSON.stringify({ targetDepartmentId }),
    }
  );
}

export async function createUser(
  connection: AdminConnection,
  clientKey: string,
  payload: {
    name: string;
    email: string;
    password?: string;
    role?: string;
    departmentId?: string | null;
    isActive?: boolean;
  }
): Promise<{
  ok: true;
  user: AdminUserItem;
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  return requestJson(connection, `/admin/users?${params.toString()}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function resetUserPassword(
  connection: AdminConnection,
  userId: string,
  clientKey: string,
  password: string
): Promise<{
  ok: true;
  user: {
    id: string;
    email: string;
    name: string;
  };
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  return requestJson(
    connection,
    `/admin/users/${encodeURIComponent(userId)}/reset-password?${params.toString()}`,
    {
      method: "POST",
      body: JSON.stringify({ password }),
    }
  );
}

export async function prepareUserFirstAccess(
  connection: AdminConnection,
  clientKey: string,
  payload: { userIds?: string[]; sendEmail?: boolean } = {}
): Promise<{
  ok: true;
  deliveryMode: "prepare_only" | "email";
  deliveryConfigured: boolean;
  requestedCount: number;
  eligibleCount: number;
  issuedCount: number;
  deliveredCount: number;
  skippedPasswordConfiguredCount: number;
  expiresAt: string;
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  return requestJson(connection, `/admin/users/first-access?${params.toString()}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateUser(
  connection: AdminConnection,
  userId: string,
  clientKey: string,
  payload: {
    name?: string;
    email?: string;
    role?: string;
    departmentId?: string | null;
    isActive?: boolean;
  }
): Promise<{
  ok: true;
  user: AdminUserItem;
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  return requestJson(connection, `/admin/users/${encodeURIComponent(userId)}?${params.toString()}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function updateUserRole(
  connection: AdminConnection,
  userId: string,
  clientKey: string,
  role: string
): Promise<{
  ok: true;
  user: AdminUserItem;
}> {
  return updateUser(connection, userId, clientKey, { role });
}

export async function sendConversationMessage(
  connection: AdminConnection,
  clientKey: string,
  waId: string,
  text: string
): Promise<{
  ok: true;
  waId: string;
  message: {
    messageId: string;
    status: string;
    metaMessageId: string | null;
    createdAt: string;
  };
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  return requestJson(
    connection,
    `/admin/conversation/${encodeURIComponent(waId)}/send?${params.toString()}`,
    {
      method: "POST",
      body: JSON.stringify({ text }),
    }
  );
}

export async function updateLeadStatus(
  connection: AdminConnection,
  clientKey: string,
  leadId: string,
  status: LeadStatus
): Promise<{
  ok: true;
  lead: {
    id: string;
    status: LeadStatus;
    updatedAt: string;
  };
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  return requestJson(
    connection,
    `/admin/lead/${encodeURIComponent(leadId)}/status?${params.toString()}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }
  );
}

export async function fetchLeadNotes(
  connection: AdminConnection,
  clientKey: string,
  leadId: string
): Promise<{
  ok: true;
  count: number;
  items: LeadNoteItem[];
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  return requestJson(
    connection,
    `/admin/lead/${encodeURIComponent(leadId)}/notes?${params.toString()}`
  );
}

export async function createLeadNote(
  connection: AdminConnection,
  clientKey: string,
  leadId: string,
  body: string
): Promise<{
  ok: true;
  note: LeadNoteItem;
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  return requestJson(
    connection,
    `/admin/lead/${encodeURIComponent(leadId)}/notes?${params.toString()}`,
    {
      method: "POST",
      body: JSON.stringify({ body }),
    }
  );
}

export async function listCampaigns(
  connection: AdminConnection,
  clientKey: string,
  options?: { limit?: number }
): Promise<{
  ok: true;
  count: number;
  items: CampaignItem[];
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  if (typeof options?.limit === "number" && Number.isFinite(options.limit)) {
    params.set("limit", String(options.limit));
  }
  return requestJson(connection, `/admin/campaigns?${params.toString()}`);
}

export async function getCampaign(
  connection: AdminConnection,
  clientKey: string,
  campaignId: string
): Promise<{
  ok: true;
  campaign: CampaignItem;
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  return requestJson(
    connection,
    `/admin/campaigns/${encodeURIComponent(campaignId)}?${params.toString()}`
  );
}

export async function createCampaign(
  connection: AdminConnection,
  clientKey: string,
  payload: {
    name: string;
    templateId?: string;
    templateName: string;
    recipients: string[];
    templateParams?: string[];
  }
): Promise<{
  campaignId: string;
  templateId?: string | null;
  status: string;
  totalRecipients: number;
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  return requestJson(connection, `/admin/campaigns?${params.toString()}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelCampaign(
  connection: AdminConnection,
  clientKey: string,
  campaignId: string
): Promise<{
  ok: true;
  campaign: CampaignItem;
}> {
  const params = new URLSearchParams();
  params.set("clientKey", clientKey);
  return requestJson(
    connection,
    `/admin/campaigns/${encodeURIComponent(campaignId)}/cancel?${params.toString()}`,
    { method: "POST" }
  );
}

export async function fetchTemplatesObservability(
  connection: AdminConnection
): Promise<{
  defaultTemplate: { name: string; language: string };
  fallback: { enabled: boolean; name: string; language: string };
  failed: TemplateObservabilityItem[];
  recent: TemplateObservabilityItem[];
  catalog: AdminTemplateCatalogItem[];
  breakdown24h: Array<{
    templateName: string | null;
    templateLang: string | null;
    count: number;
    topWaIds: Array<{ waId: string; count: number }>;
  }>;
  breakdown7d: Array<{
    templateName: string | null;
    templateLang: string | null;
    count: number;
    topWaIds: Array<{ waId: string; count: number }>;
  }>;
}> {
  return requestJson(connection, "/admin/templates");
}

export async function fetchAdminChatbotFlows(
  connection: AdminConnection,
  clientKey: string
): Promise<{
  ok: true;
  count: number;
  items: AdminChatbotFlowItem[];
}> {
  const params = new URLSearchParams({ clientKey });
  return requestJson(connection, `/admin/chatbot/flows?${params.toString()}`);
}

export async function fetchAdminChatbotResources(
  connection: AdminConnection,
  clientKey: string
): Promise<{
  ok: true;
  departments: AdminDepartmentItem[];
  queues: AdminQueueItem[];
}> {
  const params = new URLSearchParams({ clientKey });
  return requestJson(connection, `/admin/chatbot/resources?${params.toString()}`);
}

export async function fetchAdminChatbotSettings(
  connection: AdminConnection,
  clientKey: string
): Promise<{
  ok: true;
  tenantId: string;
  settings: AdminAutomationSettings;
}> {
  const params = new URLSearchParams({ clientKey });
  return requestJson(connection, `/admin/chatbot/settings?${params.toString()}`);
}

export async function updateAdminChatbotSettings(
  connection: AdminConnection,
  clientKey: string,
  payload: Partial<AdminAutomationSettings>
): Promise<{
  ok: true;
  tenantId: string;
  fieldsChanged: string[];
  settings: AdminAutomationSettings;
}> {
  const params = new URLSearchParams({ clientKey });
  return requestJson(connection, `/admin/chatbot/settings?${params.toString()}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function createAdminChatbotFlow(
  connection: AdminConnection,
  clientKey: string,
  payload: {
    name: string;
    isActive?: boolean;
    entryPoint?: boolean;
    definition: {
      start: string;
      nodes: Record<string, unknown>;
    };
  }
): Promise<{
  ok: true;
  flow: AdminChatbotFlowItem;
}> {
  const params = new URLSearchParams({ clientKey });
  return requestJson(connection, `/admin/chatbot/flows?${params.toString()}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminChatbotFlow(
  connection: AdminConnection,
  clientKey: string,
  flowId: string,
  payload: {
    name?: string;
    isActive?: boolean;
    entryPoint?: boolean;
    definition?: {
      start: string;
      nodes: Record<string, unknown>;
    };
  }
): Promise<{
  ok: true;
  flow: AdminChatbotFlowItem;
}> {
  const params = new URLSearchParams({ clientKey });
  return requestJson(
    connection,
    `/admin/chatbot/flows/${encodeURIComponent(flowId)}?${params.toString()}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    }
  );
}

export async function fetchAdminTemplateRequests(
  connection: AdminConnection,
  filters?: { clientKey?: string; status?: string; category?: string; search?: string }
): Promise<{
  ok: true;
  count: number;
  items: AdminTemplateRequestItem[];
}> {
  const params = new URLSearchParams();
  if (filters?.clientKey) params.set("clientKey", filters.clientKey);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.category) params.set("category", filters.category);
  if (filters?.search) params.set("search", filters.search);
  return requestJson(connection, `/admin/templates/requests${params.size ? `?${params.toString()}` : ""}`);
}

export async function approveAdminTemplateRequest(
  connection: AdminConnection,
  requestId: string
): Promise<{
  ok: true;
  template: AdminTemplateCatalogItem;
}> {
  return requestJson(connection, `/admin/templates/requests/${encodeURIComponent(requestId)}/approve`, {
    method: "POST",
  });
}

export async function rejectAdminTemplateRequest(
  connection: AdminConnection,
  requestId: string,
  notes?: string
): Promise<{ ok: true }> {
  return requestJson(connection, `/admin/templates/requests/${encodeURIComponent(requestId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ notes }),
  });
}

export async function cancelAdminTemplateRequest(
  connection: AdminConnection,
  requestId: string
): Promise<{ ok: true; request: AdminTemplateRequestItem }> {
  return requestJson(connection, `/admin/templates/requests/${encodeURIComponent(requestId)}/cancel`, {
    method: "POST",
  });
}

export async function updateAdminTemplateRequest(
  connection: AdminConnection,
  requestId: string,
  payload: {
    name?: string;
    category?: string;
    language?: string;
    content?: string;
    variableDetails?: Array<{ key: string; description: string; example: string }>;
    status?: string;
    notes?: string | null;
  }
): Promise<{ ok: true; request: AdminTemplateRequestItem }> {
  return requestJson(connection, `/admin/templates/requests/${encodeURIComponent(requestId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function submitAdminTemplateRequestToMeta(
  connection: AdminConnection,
  requestId: string
): Promise<{
  ok: boolean;
  request: AdminTemplateRequestItem;
  template: AdminTemplateCatalogItem;
  submission: {
    submitted: boolean;
    status: string;
    templateId: string;
    errorMessage: string | null;
  };
}> {
  return requestJson(connection, `/admin/templates/requests/${encodeURIComponent(requestId)}/submit`, {
    method: "POST",
  });
}

export async function syncAdminTemplateRequest(
  connection: AdminConnection,
  requestId: string
): Promise<{ ok: true; request: AdminTemplateRequestItem; sync: unknown }> {
  return requestJson(connection, `/admin/templates/requests/${encodeURIComponent(requestId)}/sync`, {
    method: "POST",
  });
}

export async function disableAdminTemplate(
  connection: AdminConnection,
  templateId: string
): Promise<{ ok: true; template: AdminTemplateCatalogItem }> {
  return requestJson(connection, `/admin/templates/${encodeURIComponent(templateId)}/disable`, {
    method: "POST",
  });
}

export async function enableAdminTemplate(
  connection: AdminConnection,
  templateId: string
): Promise<{ ok: true; template: AdminTemplateCatalogItem }> {
  return requestJson(connection, `/admin/templates/${encodeURIComponent(templateId)}/enable`, {
    method: "POST",
  });
}

export async function onboardingExchangeCode(
  connection: AdminConnection,
  tenantId: string,
  payload: TenantOnboardingExchangePayload
): Promise<{
  success: true;
  businessTokenStored: boolean;
  phoneNumberId: string | null;
  wabaId: string | null;
  businessId: string | null;
  businessPortfolioId: string | null;
  warning?: string | null;
}> {
  return requestJson(
    connection,
    `/admin/tenants/${encodeURIComponent(tenantId)}/onboarding/exchange-code`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function onboardingManualBindNumber(
  connection: AdminConnection,
  tenantId: string,
  payload: TenantOnboardingManualBindPayload
): Promise<{
  success: true;
  businessTokenStored: false;
  phoneNumberId: string | null;
  wabaId: string | null;
  businessId: string | null;
  businessPortfolioId: string | null;
  phoneMappingAction?: string | null;
  warning?: string | null;
}> {
  return requestJson(
    connection,
    `/admin/tenants/${encodeURIComponent(tenantId)}/onboarding/manual-bind`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function onboardingRegisterPhoneNumber(
  connection: AdminConnection,
  tenantId: string,
  payload: TenantOnboardingRegisterPhonePayload
): Promise<{
  success: true;
  phoneNumberId: string;
  displayPhoneNumber?: string | null;
  registered: boolean;
  warning?: string | null;
}> {
  return requestJson(
    connection,
    `/admin/tenants/${encodeURIComponent(tenantId)}/onboarding/register-phone`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export function normalizeWaIdList(input: string) {
  const set = new Set<string>();
  for (const rawPart of input.split(/[\n,;]+/)) {
    const digits = rawPart.replace(/\D/g, "").trim();
    if (digits) set.add(digits);
  }
  return Array.from(set);
}

export function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function formatPct(value: number | null) {
  if (value === null || !Number.isFinite(value) || value < 0 || value > 1_000_000) return "-";
  return `${(value * 100).toFixed(2)}%`;
}
