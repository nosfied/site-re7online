import type {
  AiQualificationSchema,
  AdminDepartmentItem,
  AdminUserItem,
  CampaignItem,
  CampaignDraftSummary,
  ConversationReportRange,
  ConversationReportResponse,
  ConversationOperationalStatus,
  InboxConversationItem,
  InboxMessageItem,
  LeadNoteItem,
  LeadStatus,
} from "@/lib/whatsappAdminApi";
import {
  getAppFeatures,
  getAppProfile,
  getTenantCapabilities,
  type AppFeatures,
  type AppProfile,
  type TenantCapabilities,
} from "@/lib/appFeatures";
import {
  buildAppLoginPath,
  normalizeSessionEndReason,
  sanitizeAppReturnTo,
  type AppSessionEndReason,
} from "@/lib/appSessionRedirect";
import { getAppErrorUxMessage } from "@/lib/appUxLabels";

const SESSION_END_REASON_KEY = "wa_app_session_end_reason_v1";
export { buildAppLoginPath, normalizeSessionEndReason, sanitizeAppReturnTo, type AppSessionEndReason };

function saveSessionEndReason(reason: AppSessionEndReason | null | undefined) {
  if (typeof window === "undefined") return;
  if (!reason) {
    sessionStorage.removeItem(SESSION_END_REASON_KEY);
    localStorage.removeItem(SESSION_END_REASON_KEY);
    return;
  }
  const payload = JSON.stringify({ reason, recordedAt: Date.now() });
  try {
    sessionStorage.setItem(SESSION_END_REASON_KEY, payload);
    localStorage.setItem(SESSION_END_REASON_KEY, payload);
  } catch {
    // best effort only; losing the explanatory message must not block logout.
  }
}

export function consumeAppSessionEndReason(): AppSessionEndReason | null {
  if (typeof window === "undefined") return null;
  const raw =
    sessionStorage.getItem(SESSION_END_REASON_KEY) ||
    localStorage.getItem(SESSION_END_REASON_KEY);
  sessionStorage.removeItem(SESSION_END_REASON_KEY);
  localStorage.removeItem(SESSION_END_REASON_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { reason?: string; recordedAt?: number };
    const ageMs = Date.now() - Number(parsed.recordedAt ?? 0);
    if (!Number.isFinite(ageMs) || ageMs > 5 * 60 * 1000) return null;
    return normalizeSessionEndReason(parsed.reason);
  } catch {
    return null;
  }
}

export type AppSessionUser = {
  id: string;
  name: string;
  email: string;
  clientId: string;
  role: string;
  departmentId?: string | null;
  departmentName?: string | null;
  departmentIds?: string[];
  primaryDepartmentId?: string | null;
};

export type AppSupportAccessContext = {
  accessType: "platform_support";
  grantId: string;
  supportSessionId: string;
  supportClientId: string;
  supportUserId: string;
  expiresAt: string;
  tenantId?: string;
  tenantName?: string;
};

export type AppSession = {
  baseUrl: string;
  token: string;
  expiresAt?: string;
  user: AppSessionUser;
  features: TenantCapabilities;
  profile: AppProfile;
  supportAccess?: AppSupportAccessContext | null;
};

export type AppSupportAccessGrant = {
  id: string;
  active: boolean;
  status: "AUTHORIZED" | "REVOKED" | "EXPIRED" | string;
  scope: string;
  reason: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  grantedBy: { id: string; name: string } | null;
  revokedBy: { id: string; name: string } | null;
};

export type AppSupportAccessSettingsResponse = {
  ok: true;
  tenantId: string;
  grant: AppSupportAccessGrant | null;
  permissions: { canManage: boolean };
};

export type AppAgentSignatureSettings = {
  enabled: boolean;
  mode: "user_name";
  format: "bold_line";
};

export type AppServiceMessagePolicy = {
  protocolNotice: {
    enabled: boolean;
    text: string | null;
  };
  queuePositionNotice: {
    enabled: boolean;
    text: string | null;
  };
  closeNotice: {
    enabled: boolean;
    text?: string | null;
  };
};

export type AppAgentSignatureSettingsResponse = {
  ok: true;
  tenantId: string;
  settings: AppAgentSignatureSettings;
  source: "db" | "json_fallback";
  inboxVisibilityPolicy?: {
    value: AppInboxVisibilityPolicy;
    source: "db" | "json_fallback";
  };
  serviceMessages?: {
    value: AppServiceMessagePolicy;
    source: "db" | "json_fallback";
    closeMessage?: {
      value: string;
      source: "db" | "json_fallback";
    };
  };
  preview: {
    bodyText: string;
  };
  permissions: {
    canUpdate: boolean;
    canUpdateInboxVisibilityPolicy?: boolean;
    canUpdateServiceMessages?: boolean;
  };
};

export type AppInboxReadState = {
  lastReadAtByConversationKey: Record<string, string>;
  manuallyUnreadByConversationKey: Record<string, boolean>;
};

export type AppPushStatus = {
  ok: true;
  supported: boolean;
  configured: boolean;
  publicKey: string | null;
  subscribed: boolean;
  subscriptions: number;
  disabledByTenant?: boolean;
};

export type AppAgentAvailability = {
  available: boolean;
  effectiveAvailable: boolean;
  lastHeartbeatAt: string | null;
  availabilityChangedAt: string | null;
};

export type AppAgentAvailabilityResponse = {
  ok: true;
  availability: AppAgentAvailability;
  heartbeatIntervalMs: number;
  onlineTtlMs: number;
};

export type AppSupportConversation = {
  supportRef: string;
  protocol: string;
  status: "active" | "closed" | string;
  mode: string | null;
  handoffStatus: "none" | "pending" | "active" | string;
  createdAt: string;
  updatedAt: string;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  windowIsOpen?: boolean | null;
  windowExpiresAt?: string | null;
};

export type AppSupportMessage = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  type?: string;
  bodyText: string | null;
  createdAt: string;
  status: string;
  actorName: string | null;
  media?: {
    kind: "image";
    ref: string;
    mimeType: string;
    fileName: string | null;
    caption: string | null;
    sizeBytes: number;
    width: number | null;
    height: number | null;
    url?: string;
  } | null;
};

export type AppSupportConversationDetail = {
  ok: true;
  conversation: AppSupportConversation;
  messages: AppSupportMessage[];
};

export type AppTrainingItemType = "video" | "pdf" | "link";

export type AppTrainingCatalogItem = {
  id: string;
  type: AppTrainingItemType;
  title: string;
  description?: string;
  contentId?: string;
  url?: string;
  durationLabel?: string;
  updatedAt?: string;
  tags?: string[];
  downloadable?: boolean;
  available: boolean;
  streamUrl?: string;
  downloadUrl?: string;
};

export type AppTrainingCatalogSection = {
  id: string;
  title: string;
  description?: string;
  items: AppTrainingCatalogItem[];
};

export type AppTrainingCatalogResponse = {
  ok: true;
  version: number;
  storageConfigured: boolean;
  sections: AppTrainingCatalogSection[];
};

export type AppInstagramBusinessStatus = {
  channelAccountId: string | null;
  externalAccountIds: string[];
  username: string | null;
  facebookPageId: string | null;
  tokenStatus: "configured" | "missing" | "expired" | "not_required" | string;
  enabled: boolean;
  runtimeEnabled: boolean;
  inboundPersistenceEnabled: boolean;
  outboundEnabled: boolean;
  aiEnabled: boolean;
  handoffEnabled: boolean;
  metadata: Record<string, string>;
};

export type AppInstagramBusinessValidation = {
  ok: boolean;
  checkedAt: string;
  tokenStatus: "configured" | "missing" | "invalid";
  tokenDiagnostics?: {
    selectedTokenSource: "instagramBusinessAccessToken" | "pageAccessToken" | "legacy" | "none";
    instagramBusinessToken: {
      present: boolean;
      tokenLength: number;
      tokenPrefix: string | null;
      identityValidated: boolean;
      scopesValidated: boolean;
      source: "instagramBusinessAccessToken" | "pageAccessToken" | "legacy" | "none";
    };
    pageToken: {
      present: boolean;
      tokenLength: number;
      tokenPrefix: string | null;
      debugValidated: boolean;
      scopesValidated: boolean;
    };
  };
  requiredScopes: string[];
  grantedScopes: string[];
  missingScopes: string[];
  account: {
    id: string | null;
    username: string | null;
  };
  capabilities: {
    conversations: "available" | "blocked" | "unknown" | "incompatible_token_or_review_blocked";
    messages: "available" | "blocked" | "unknown" | "incompatible_token_or_review_blocked";
  };
  webhook: {
    callbackConfigured: boolean;
    expectedCallbackUrl: string;
  };
  errors: Array<{ stage: string; message: string; code?: number | null; type?: string | null }>;
};

export type AppCrmContactsFilter = {
  q?: string | null;
  status?: string | null;
  channel?: string | null;
  hasConversation?: boolean | null;
  optOut?: boolean | null;
  operationalStatus?: "active" | "excluded" | null;
  updatedFrom?: string | null;
  updatedTo?: string | null;
  page?: number;
  limit?: number;
};

export type AppCrmContactItem = {
  leadId: string;
  contactId: string | null;
  displayName: string | null;
  companyName: string | null;
  email: string | null;
  city: string | null;
  phoneDisplay: string | null;
  identifierDisplay: string;
  channel: string | null;
  provider: string | null;
  crmStatus: string;
  crmStatusLabel: string;
  leadStatus: string;
  lastConversationId: string | null;
  lastConversationIdentity: string | null;
  lastProtocol: string | null;
  lastConversationStatus: ConversationOperationalStatus | string | null;
  lastConversationUpdatedAt: string | null;
  conversationsCount: number;
  hasConversation: boolean;
  canStartConversation?: boolean;
  startConversationBlockedReason?:
    | "contact_not_active"
    | "contact_operationally_excluded"
    | "invalid_identity"
    | "channel_unavailable"
    | "new_freeform_requires_model"
    | "not_authorized"
    | "active_send_blocked"
    | "identity_conflict"
    | null;
  activeOptOut: boolean;
  isAnonymized: boolean;
  isOperationallyExcluded?: boolean;
  importedSource: string | null;
  hasValidWhatsappIdentity: boolean;
  canStartWhatsappTemplateCandidate: boolean;
  hasOpenConversationWindow: boolean | null;
  campaignRelationship: AppCrmCampaignRelationshipSummary;
  templateSendBlockedReason:
    | "not_whatsapp"
    | "missing_phone"
    | "opt_out"
    | "unsupported_channel"
    | "unknown"
    | null;
  createdAt: string;
  updatedAt: string;
};

export type AppCrmCampaignRelationshipStatus =
  | "PENDING"
  | "SENT"
  | "ACCEPTED"
  | "DELIVERED"
  | "READ"
  | "FAILED"
  | "BLOCKED"
  | "OPT_OUT"
  | "SKIPPED"
  | "IDENTITY_CONFLICT";

export type AppCrmCampaignRelationshipSummary = {
  campaignCount: number;
  latestCampaignId: string | null;
  latestCampaignName: string | null;
  latestCampaignAt: string | null;
  latestTemplate: string | null;
  latestRecipientStatus: AppCrmCampaignRelationshipStatus | null;
  latestResultReason: string | null;
  hasOptOutBlock: boolean;
  latestDeliveredAt: string | null;
};

export type AppCrmCampaignRelationshipHistoryItem = {
  campaignId: string;
  campaignName: string;
  campaignAt: string;
  templateName: string | null;
  recipientStatus: AppCrmCampaignRelationshipStatus;
  resultReason: string | null;
  deliveredAt: string | null;
  hasOptOutBlock: boolean;
  campaignHref: string;
};

export type AppCrmContactConversationItem = {
  conversationId: string;
  conversationIdentity: string;
  canOpenInInbox: boolean;
  protocol: string;
  channel: string | null;
  provider: string | null;
  status: ConversationOperationalStatus | string | null;
  departmentId: string | null;
  departmentName: string | null;
  queueId: string | null;
  queueName: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  updatedAt: string;
  createdAt: string;
};

export type AppCrmContactDetailResponse = {
  ok: true;
  item: AppCrmContactItem & {
    contactIdentity: {
      displayName: string | null;
      channel: string | null;
      provider: string | null;
      lastSeenAt: string | null;
    } | null;
    notesCount: number;
  };
  conversations: AppCrmContactConversationItem[];
  campaignRelationshipHistory: {
    items: AppCrmCampaignRelationshipHistoryItem[];
    pagination: {
      limit: number;
      hasMore: boolean;
      total: number;
    };
  };
  blockingConversation: AppHiddenBlockingConversation | null;
  createStatus?: "created" | "existing_active" | "reused";
  existingContact?: AppCrmExistingContactResolution | null;
  generatedAt: string;
};

export type AppCrmExistingContactResolution = {
  state: "active" | "excluded" | "provisional";
  contactId: string | null;
  leadId: string | null;
  name: string | null;
  phoneDisplay: string | null;
};

export type AppCrmContactCsvMapping = {
  phoneColumn?: string | null;
  nameColumn?: string | null;
  crmSituationColumn?: string | null;
  companyColumn?: string | null;
  cityColumn?: string | null;
  emailColumn?: string | null;
  serviceColumn?: string | null;
};

export type AppCrmContactImportInspectResponse = {
  ok: true;
  headers: string[];
  delimiter: string;
  totalRows: number;
  mapping: AppCrmContactCsvMapping;
};

export type AppCrmContactImportPreviewResponse = {
  ok: true;
  headers: string[];
  delimiter: string;
  totalRows: number;
  validRows: number;
	  invalidRows: number;
	  invalidCrmStatuses?: number;
	  duplicatesInFile: number;
	  existingContacts: number;
	  readyToImport: number;
	  created?: number;
	  updated?: number;
	  unchanged?: number;
	  rows?: Array<{
		    rowNumber: number;
		    name: string | null;
		    company?: string | null;
		    city?: string | null;
		    email?: string | null;
		    service?: string | null;
		    inputPhone: string | null;
	    normalizedPhone: string;
	    phoneDisplay: string | null;
		    operation: "CREATE" | "UPDATE" | "UNCHANGED";
		    leadId: string | null;
		    fieldsToUpdate?: string[];
	    crmSituation: {
	      input: string | null;
	      statusId: string | null;
	      label: string | null;
	      previousStatusId: string | null;
	      previousLabel: string | null;
	    };
	  }>;
	  sampleErrors: Array<{
	    rowNumber: number;
	    reason: string;
	    code?: string;
	    label: string;
	    inputPhone?: string | null;
	    normalizedPhone?: string | null;
	    normalizedPhoneDisplay?: string | null;
	    phoneDisplay: string | null;
	    crmSituationInput?: string | null;
	    crmStatusId?: string | null;
	    crmStatusLabel?: string | null;
	  }>;
  truncatedErrors: boolean;
  excludedContacts?: number;
  provisionalContacts?: number;
  identityConflicts?: number;
};

export type AppCrmContactImportConfirmResponse = {
  ok: true;
  received: number;
  created: number;
  reused: number;
	  updated: number;
	  unchanged?: number;
	  duplicates: number;
	  invalid: number;
	  invalidCrmStatuses?: number;
  readyToImport: number;
  promotedProvisional: number;
  excludedContacts?: number;
  provisionalContacts?: number;
  identityConflicts?: number;
  failed?: number;
  skipped?: number;
  errors?: Array<{
    rowNumber: number;
    reason: string;
    code?: string;
    label: string;
    inputPhone?: string | null;
	    normalizedPhone?: string | null;
	    normalizedPhoneDisplay?: string | null;
	    phoneDisplay: string | null;
	    crmSituationInput?: string | null;
	    crmStatusId?: string | null;
	    crmStatusLabel?: string | null;
	  }>;
  truncatedErrors?: boolean;
};

export type AppCrmContactsResponse = {
  ok: true;
  filters: {
    q: string | null;
    status: string | null;
    channel: string | null;
    hasConversation: boolean | null;
    optOut: boolean | null;
    operationalStatus?: "active" | "excluded";
    updatedFrom: string | null;
    updatedTo: string | null;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  items: AppCrmContactItem[];
  generatedAt: string;
};

export type AppCampaignAudiencePreviewFilter = AppCrmContactsFilter & {
  onlyWhatsappEligible?: boolean | null;
  excludeOptOut?: boolean | null;
  crmStatus?: string | null;
  city?: string | null;
  importedSource?: string | null;
};

export type AppCampaignAudienceBlockedReason =
  | "anonymized_contact"
  | "operationally_excluded_contact"
  | "active_send_blocked"
  | "missing_whatsapp_identity"
  | "non_whatsapp_channel"
  | "invalid_whatsapp_identity"
  | "missing_contact"
  | "unsupported_channel"
  | "unknown";

export type AppCampaignAudiencePreviewItem = {
  leadId: string;
  contactId: string | null;
  displayName: string | null;
  companyName: string | null;
  city: string | null;
  crmStatus: string;
  crmStatusLabel: string;
  channel: string | null;
  phoneDisplay: string | null;
  identifierDisplay: string;
  activeOptOut: boolean;
  isAnonymized: boolean;
  hasValidWhatsappIdentity: boolean;
  lastConversationIdentity: string | null;
  lastProtocol: string | null;
  importedSource: string | null;
  updatedAt: string;
  eligible: boolean;
  blockedReason: AppCampaignAudienceBlockedReason | null;
  blockedReasonLabel: string | null;
};

export type AppCampaignAudiencePreviewResponse = {
  ok: true;
  filters: {
    q: string | null;
    status: string | null;
    channel: string | null;
    hasConversation: boolean | null;
    optOut: boolean | null;
    updatedFrom: string | null;
    updatedTo: string | null;
    onlyWhatsappEligible: boolean | null;
    excludeOptOut: boolean | null;
    crmStatus: string | null;
    city: string | null;
    importedSource: string | null;
  };
  summary: {
    total: number;
    analyzed: number;
    eligible: number;
    blocked: number;
    truncated: boolean;
    blockedByReason: Array<{
      reason: AppCampaignAudienceBlockedReason;
      label: string;
      count: number;
    }>;
  };
  items: AppCampaignAudiencePreviewItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  generatedAt: string;
};

export type AppCampaignAudienceSplitMode = "STATIC_FILTER" | "DYNAMIC_FILTER_AS_STATIC";

export type AppCampaignAudienceSplitPlan = {
  mode: AppCampaignAudienceSplitMode;
  totalEligible: number;
  draftCount: number;
  chunkSizes: number[];
  limit: number;
  analysisLimit: number;
  truncated: boolean;
  audienceSignature: string;
  sourceDescription: string;
};

export type AppMetaCostPreview = {
  source: "campaign" | "manual_campaign_send" | "inbox_template" | "canned_reply" | "inbox_text" | "unknown";
  messageKind: "template" | "canned_reply" | "free_text" | "unknown";
  metaCategory: "service" | "utility" | "marketing" | "authentication" | "unknown";
  country: "BR" | "unknown";
  recipientCount: number;
  eligibleCount: number;
  blockedCount: number;
  unitCostUsd: number | null;
  estimatedCostUsd: number | null;
  estimatedBillable: boolean | "unknown";
  unknownCostCount: number;
  billingRule: string;
  rateCardVersion: string;
  windowOpenAtSend: boolean | "unknown";
  policyMode: "alert_only" | "block_at_limit" | null;
  monthlyLimitUsd: number | null;
  currentMonthUsageUsd: number | null;
  projectedMonthUsageUsd: number | null;
  usagePercentAfterSend: number | null;
  warningLevel: "none" | "info" | "warning" | "danger";
  notes: string[];
};

export type AppMetaUsageReportBucket = {
  deliveredBillableCount: number;
  deliveredEstimatedCostUsd: number;
  billableUnknownCostCount: number;
  sentPendingCount: number;
  failedCount: number;
  nonBillableCount: number;
  totalOutboundWithUsage: number;
};

export type AppMetaUsageMonthlyReport = {
  ok: true;
  reportType: "meta_usage_monthly";
  tenantKey: string | null;
  tenantName: string | null;
  month: string;
  generatedAt: string;
  currency: "USD";
  rateCardVersion: string;
  isEstimate: true;
  disclaimer: string;
  summary: {
    totalOutboundWithUsage: number;
    deliveredBillableCount: number;
    deliveredEstimatedCostUsd: number;
    billableUnknownCostCount: number;
    sentPendingCount: number;
    failedCount: number;
    nonBillableCount: number;
    unknownCategoryCount: number;
    currentPolicyMode: "alert_only" | "block_at_limit";
    policyEnabled: boolean;
    monthlyLimitUsd: number | null;
    monthlyMessageLimit: number | null;
    usagePercentUsd: number | null;
    usagePercentMessages: number | null;
    thresholdReached: number | null;
    limitExceeded: boolean;
  };
  byCategory: Record<string, AppMetaUsageReportBucket>;
  bySource: Record<string, AppMetaUsageReportBucket>;
  byStatus: Record<string, AppMetaUsageReportBucket>;
  policy: {
    enabled: boolean;
    mode: "alert_only" | "block_at_limit";
    monthlyLimitUsd: number | null;
    monthlyMessageLimit: number | null;
    alertThresholds: number[];
    includeEstimatedSent: boolean;
    includeDeliveredOnly: boolean;
    source: "db" | "default";
  };
  notes: string[];
};

export type AppSessionAuditStatus = "OPEN" | "CLOSED" | "EXPIRED";

export type AppSessionAuditItem = {
  id: string;
  userId: string;
  userName: string;
  role: string;
  loginAt: string;
  endedAt: string | null;
  endReason: string | null;
  endReasonLabel: string;
  status: AppSessionAuditStatus;
  statusLabel: string;
  durationObservedSec: number | null;
  lastSeenAt: string | null;
};

export type AppSessionAuditReport = {
  ok: true;
  periodFrom: string;
  periodTo: string;
  userId: string | null;
  role: string | null;
  status: AppSessionAuditStatus | null;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  items: AppSessionAuditItem[];
  notes: string[];
};

export type AppCompletedServiceReportBucket = {
  id: string | null;
  name: string;
  completedCount: number;
};

export type AppCompletedServiceReportDepartmentAgentBucket = {
  departmentId: string | null;
  departmentName: string;
  assignedUserId: string | null;
  agentName: string;
  completedCount: number;
};

export type AppCompletedServiceReportDailyBucket = {
  date: string;
  completedCount: number;
};

export type AppCompletedServiceReportDetailRow = {
  id: string;
  protocol: string;
  closedAt: string;
  agentName: string;
  departmentName: string;
  queueName: string;
  closeReason: string | null;
  closeSource: string | null;
};

export type AppCompletedServiceReport = {
  ok: true;
  periodFrom: string;
  periodTo: string | null;
  departmentId: string | null;
  assignedUserId: string | null;
  timezone: string;
  availableSince: string | null;
  totalCompleted: number;
  byAgent: AppCompletedServiceReportBucket[];
  byDepartment: AppCompletedServiceReportBucket[];
  byDepartmentAgent: AppCompletedServiceReportDepartmentAgentBucket[];
  daily: AppCompletedServiceReportDailyBucket[];
  details: AppCompletedServiceReportDetailRow[];
  notes: string[];
};

export type AppSatisfactionReportSummary = {
  sent: number;
  responded: number;
  pending: number;
  expired: number;
  responseRate: number;
  averageScore: number | null;
  distribution: Record<string, number>;
  byAgent: Array<{
    id: string;
    name: string | null;
    sent: number;
    responded: number;
    responseRate: number;
    averageScore: number | null;
    distribution: Record<string, number>;
  }>;
  byDepartment: Array<{
    id: string;
    name: string | null;
    sent: number;
    responded: number;
    responseRate: number;
    averageScore: number | null;
    distribution: Record<string, number>;
  }>;
  byQueue: Array<{
    id: string;
    name: string | null;
    sent: number;
    responded: number;
    responseRate: number;
    averageScore: number | null;
    distribution: Record<string, number>;
  }>;
};

export type AppSatisfactionReportRow = {
  surveyId: string;
  conversationId: string | null;
  protocol: string | null;
  channel: string | null;
  departmentId: string | null;
  departmentName: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  attribution: string;
  status: string;
  sentAt: string | null;
  answeredAt: string | null;
  expiresAt: string | null;
  score: number;
  scoreLabel: string;
  comment: string | null;
};

export type AppSatisfactionReport = {
  ok: true;
  filters: {
    from: string | null;
    to: string | null;
    departmentId: string | null;
    assignedUserId: string | null;
    channel: string | null;
  };
  summary: AppSatisfactionReportSummary;
  rows: AppSatisfactionReportRow[];
  page: number;
  limit: number | null;
  total: number;
  totalPages: number;
  notes: string[];
};

export type AppCampaignDraftRecipient = {
  leadId: string;
  displayName: string | null;
  phoneDisplay: string | null;
  identifierDisplay: string;
};

export type AppCampaignImportSummary = {
  received: number;
  valid: number;
  invalid: number;
  duplicates: number;
  existingDuplicates: number;
  optOutBlocked: number;
  missingRequiredVariables: number;
  unresolvedCrmSituations?: number;
  created?: number;
  updated?: number;
  unchanged?: number;
  consolidated?: number;
  readyToImport: number;
  blockedByReason: Array<{ reason: string; label: string; count: number }>;
};

export type AppCampaignImportReportRow = {
  sourceRow: number | null;
  maskedIdentity: string;
  operation: string;
  leadId: string | null;
  contactId: string | null;
  fieldsChanged: string[];
  oldCrmSituation: string | null;
  newCrmSituation: string | null;
  oldCrmSituationLabel: string | null;
  newCrmSituationLabel: string | null;
  nameUpdated: boolean;
  duplicate: boolean;
  errorCode: string | null;
  reason: string | null;
};

export type AppCampaignImportReport = {
  summary: AppCampaignImportSummary;
  rows: AppCampaignImportReportRow[];
  csv: string;
};

export type AppCampaignImportPreview = {
  ok: true;
  summary: AppCampaignImportSummary;
  recipients: Array<{
    rowNumber: number | null;
    phoneDisplay: string;
    identifierDisplay: string;
    variables: Record<string, string>;
    operation?: "NOVO" | "ATUALIZAR" | "SEM_ALTERACAO";
    leadId?: string | null;
    fieldsChanged?: string[];
    crmSituation?: {
      input: string | null;
      statusId: string | null;
      label: string | null;
      previousStatusId: string | null;
      previousLabel: string | null;
    };
  }>;
  errors: Array<{
    rowNumber: number | null;
    reason: string;
    label: string;
    phoneDisplay: string | null;
  }>;
  truncatedErrors: boolean;
  csv?: {
    headers: string[];
    delimiter: string;
    maxRows?: number;
    maxBytes?: number;
    phoneMappingRequired?: boolean;
  };
};

export type AppApiError = Error & {
  status?: number;
  errorCode?: string;
  details?: string;
  payload?: unknown;
};

export type AppHiddenBlockingConversation = {
  conversationId: string;
  conversationIdentity: string;
  visibility?: "visible" | "hidden";
  status: string | null;
  mode: string | null;
  handoffStatus?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  queueId?: string | null;
  queueName?: string | null;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
  updatedAt: string | null;
};

export type AppPublicApiScope =
  | "read"
  | "write"
  | "contacts"
  | "conversations"
  | "messages"
  | "campaigns"
  | "webhooks";

export type AppPublicApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: AppPublicApiScope[];
  status: "active" | "revoked" | string;
  rateLimitPerMinute: number | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppPublicApiKeysResponse = {
  ok: true;
  keys: AppPublicApiKey[];
  availableScopes: AppPublicApiScope[];
  publicBasePath: string;
};

export type AppPublicApiKeyCreateResponse = {
  ok: true;
  key: AppPublicApiKey;
  secret: string;
  message: string;
};

export type AppWebhookEndpoint = {
  id: string;
  name: string;
  url: string;
  active: boolean;
  secretStatus?: "encrypted" | "legacy_hash_only" | string;
  signingSecretRotatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppWebhookDelivery = {
  id: string;
  endpointId: string;
  eventType: string;
  payloadHash: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type AppWebhookAttempt = {
  id: string;
  deliveryId: string;
  attemptNumber: number;
  status: string;
  responseCode: number | null;
  createdAt: string;
};

export type AppWebhooksResponse = {
  ok: true;
  endpoints: AppWebhookEndpoint[];
  deliveries: AppWebhookDelivery[];
  attempts: AppWebhookAttempt[];
  supportedEvents: string[];
};

export type AppWebhookEndpointCreateResponse = {
  ok: true;
  endpoint: AppWebhookEndpoint;
  secret: string;
  message: string;
};

type AppConversationOperationalPayload = {
  ok: true;
  waId: string;
  waIdCanonical?: string | null;
  protocol?: string | null;
  cycleId?: string | null;
  channel?: string | null;
  provider?: string | null;
  channelAccountId?: string | null;
  channelOutboundEnabled?: boolean;
  channelSwitchWarning?: InboxConversationItem["channelSwitchWarning"];
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
  humanInboxVisible?: boolean;
  automationReadOnly?: boolean;
  closedAt: string | null;
  awaitingConsent?: boolean;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  windowIsOpen?: boolean | null;
  windowExpiresAt?: string | null;
  waitingFirstResponseSec?: number | null;
  activeDurationSec?: number | null;
  isUnassigned: boolean;
  flowContext?: Record<string, string | number | boolean | null>;
  flowTags?: string[];
  continuation?: {
    protocol: string;
    originalConversationId: string;
    linkedAt: string;
    reason: "protocol_lookup";
  } | null;
};

export type AppDashboardQueueItem = {
  id: string;
  waId: string;
  displayName: string | null;
  status: ConversationOperationalStatus;
  departmentId: string | null;
  departmentName: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  lastInteractionAt: string | null;
  waitingSince: string | null;
};

export type AppDashboardOverview = {
  ok?: true;
  kpis: {
    active: number;
    waiting: number;
    waitingUser: number;
    closedToday: number;
    avgFirstResponseTimeSec: number | null;
    avgResolutionTimeSec: number | null;
    slaBreaches: number;
    totalConversations: number;
  };
  queue: AppDashboardQueueItem[];
  teamPresence: {
    items: Array<{
      userId: string;
      name: string;
      role: string;
      departments: Array<{ id: string; name: string | null }>;
      online: boolean;
      available: boolean;
      lastHeartbeatAt: string | null;
      heartbeatAgeSec: number | null;
      activeConversationCount: number;
    }>;
    summary: {
      online: number;
      offline: number;
      inService: number;
    };
    onlineTtlMs: number;
  };
  generatedAt: string;
};

export type AppOperationsBoardCursor = {
  sortAt: string;
  id: string;
};

export type AppOperationsBoardCard = {
  conversationId: string;
  conversationIdentity: string;
  protocol: string;
  status: ConversationOperationalStatus;
  contactName: string | null;
  company: string | null;
  channel: string | null;
  lastMessage: {
    direction: "INBOUND" | "OUTBOUND";
    type: string | null;
    bodyText: string | null;
    createdAt: string;
  } | null;
  updatedAt: string;
  departmentId: string | null;
  departmentName: string | null;
  queueId: string | null;
  queueName: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  waitingFirstResponseSec: number | null;
  activeDurationSec: number | null;
  continuation: {
    protocol: string;
    originalConversationId: string;
    linkedAt: string;
    reason: "protocol_lookup";
  } | null;
  tags: string[];
};

export type AppOperationsBoardColumn = {
  status: ConversationOperationalStatus;
  count: number;
  limit: number;
  items: AppOperationsBoardCard[];
  nextCursor: AppOperationsBoardCursor | null;
};

export type AppOperationsBoardResponse = {
  ok: true;
  period: {
    from: string;
    to: string;
  };
  filters: {
    departmentId: string | null;
    queueId: string | null;
    assignedUserId: string | null;
  };
  columns: Record<ConversationOperationalStatus, AppOperationsBoardColumn>;
  generatedAt: string;
};

export type AppContactTimelineItem = {
  id: string;
  kind: "message" | "event" | "note";
  direction?: "INBOUND" | "OUTBOUND";
  eventName?: string;
  title: string;
  body?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type AppContactTimelineResponse = {
  ok: true;
  contact: {
    waId: string;
    waIdCanonical: string | null;
    name: string | null;
    phone: string | null;
    leadId: string | null;
    leadStatus: string | null;
    contactId?: string | null;
  };
  items: AppContactTimelineItem[];
  nextCursor: string | null;
};

export type AppTemplateItem = {
  id: string;
  name: string;
  displayName?: string | null;
  category: string;
  submittedCategory: string | null;
  wasRecategorized: boolean;
  requestedCategory?: string | null;
  metaCategory?: string | null;
  effectiveCategory?: string | null;
  categoryChanged?: boolean;
  categoryChangeLabel?: string | null;
  language: string;
  status: string;
  content: string;
  variables: unknown;
  metaTemplateId: string | null;
  providerName?: string | null;
  rejectionReason: string | null;
  componentsSummary?: Array<{ type: string; text: string }>;
  variablesDetected?: string[];
  locallyDisabled?: boolean;
  localAvailabilityUpdatedAt?: string | null;
  canUseInCampaign?: boolean;
  canUseInInbox?: boolean;
  blockedReason?: string | null;
  blockedReasonLabel?: string | null;
  lastSyncedAt?: string | null;
  templateRequest?: {
    id: string;
    status: string;
    notes: string | null;
    createdAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type AppCampaignReturnDestination =
  | {
      type: "human_department";
      departmentId: string;
      queueId?: string | null;
    }
  | {
      type: "automated_flow";
      flowId: string;
    };

export type AppCampaignReturnDestinationsResponse = {
  ok: true;
  departments: Array<{
    id: string;
    name: string;
    operationalReady: boolean;
  }>;
  flows: Array<{ id: string; name: string; entryPoint?: boolean }>;
};

export type AppTemplateCategoryPolicy = {
  allowedCategories: string[] | null;
  unrestricted: boolean;
  source: "db" | "json_fallback";
};

export type AppTemplateRequestItem = {
  id: string;
  name: string;
  content: string;
  variables: unknown;
  variableDetails?: Array<{ key: string; description: string; example: string }>;
  providerError?: unknown;
  category: string;
  language?: string;
  status: string;
  statusLabel?: string;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type AppChatbotFlowItem = {
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

export type AppChatbotDepartmentItem = {
  id: string;
  name: string;
  slug?: string;
  isActive: boolean;
};

export type AppChatbotQueueItem = {
  id: string;
  name: string;
  departmentId: string;
};

export type AppCannedReplyItem = {
  id: string;
  title: string;
  body: string;
  active: boolean;
  category: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type AppCannedRepliesResponse = {
  ok: true;
  tenantId: string;
  items: AppCannedReplyItem[];
  permissions: {
    canManage: boolean;
  };
};

export type AppKnowledgeBaseStatus = "draft" | "published" | "archived";

export type AppKnowledgeBaseCollection = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  visibility: "internal" | "operator" | "public";
  articleCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AppKnowledgeBaseArticle = {
  id: string;
  collectionId: string | null;
  collection: { id: string; key: string; name: string } | null;
  key: string;
  title: string;
  summary: string | null;
  question: string | null;
  body: string;
  tags: string[];
  intentKeys: string[];
  sourceType: "manual" | "document" | "faq" | "flow" | "intent" | "crm";
  sourceNote: string | null;
  sourceUrl: string | null;
  status: AppKnowledgeBaseStatus;
  visibility: "internal" | "operator" | "public";
  version: number;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  publishedByUserId: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppKnowledgeBaseArticlePayload = {
  collectionId?: string | null;
  key?: string | null;
  title: string;
  summary?: string | null;
  question?: string | null;
  body: string;
  tags?: string[];
  intentKeys?: string[];
  sourceType?: string | null;
  sourceNote?: string | null;
  sourceUrl?: string | null;
  visibility?: string | null;
};

export type AppSchedulingEntityStatus = "active" | "inactive" | "archived";
export type AppAppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "rescheduled"
  | "cancelled"
  | "completed"
  | "no_show";

export type AppSchedulingService = {
  id: string;
  departmentId: string | null;
  name: string;
  description: string | null;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  requiresApproval: boolean;
  status: AppSchedulingEntityStatus;
  createdAt: string;
  updatedAt: string;
};

export type AppSchedulingResource = {
  id: string;
  departmentId: string | null;
  userId: string | null;
  name: string;
  description: string | null;
  type: string;
  capacity: number;
  status: AppSchedulingEntityStatus;
  createdAt: string;
  updatedAt: string;
};

export type AppSchedulingAvailability = {
  id: string;
  serviceId: string | null;
  resourceId: string | null;
  weekday: number;
  startsAtLocal: string;
  endsAtLocal: string;
  timezone: string;
  status: AppSchedulingEntityStatus;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppAppointment = {
  id: string;
  serviceId: string | null;
  resourceId: string | null;
  departmentId: string | null;
  contactId: string | null;
  leadId: string | null;
  conversationId: string | null;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: AppAppointmentStatus;
  source: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppAppointmentReminderStatus =
  | "pending"
  | "sent"
  | "skipped"
  | "failed"
  | "cancelled"
  | "expired";

export type AppAppointmentReminderKind =
  | "24h"
  | "2h"
  | "custom"
  | "manual"
  | "confirmation";

export type AppAppointmentReminder = {
  id: string;
  appointmentId: string;
  channel: string;
  kind: AppAppointmentReminderKind;
  scheduledAt: string;
  sentAt: string | null;
  status: AppAppointmentReminderStatus;
  templateName: string | null;
  templateLang: string | null;
  requestId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppSchedulingPayload = {
  services: AppSchedulingService[];
  resources: AppSchedulingResource[];
  availabilities: AppSchedulingAvailability[];
  appointments: AppAppointment[];
  reminders?: AppAppointmentReminder[];
};

export type AppSchedulingServicePayload = {
  name: string;
  description?: string | null;
  departmentId?: string | null;
  durationMinutes?: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  requiresApproval?: boolean;
  status?: AppSchedulingEntityStatus;
};

export type AppSchedulingResourcePayload = {
  name: string;
  description?: string | null;
  departmentId?: string | null;
  userId?: string | null;
  type?: string;
  capacity?: number;
  status?: AppSchedulingEntityStatus;
};

export type AppSchedulingAvailabilityPayload = {
  serviceId?: string | null;
  resourceId?: string | null;
  weekday: number;
  startsAtLocal: string;
  endsAtLocal: string;
  timezone?: string;
  status?: AppSchedulingEntityStatus;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
};

export type AppAppointmentPayload = {
  serviceId?: string | null;
  resourceId?: string | null;
  departmentId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  conversationId?: string | null;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  timezone?: string;
  status?: AppAppointmentStatus;
  source?: string;
};

export type AppAppointmentReminderPayload = {
  appointmentId: string;
  channel?: string;
  kind?: AppAppointmentReminderKind;
  scheduledAt: string;
  sentAt?: string | null;
  status?: AppAppointmentReminderStatus;
  templateName?: string | null;
  templateLang?: string | null;
  requestId?: string | null;
  error?: string | null;
};

export type AppSatisfactionQuestionStatus = "active" | "inactive" | "archived";
export type AppSatisfactionSurveyStatus = "draft" | "pending" | "sent" | "responded" | "expired" | "cancelled";
export type AppSatisfactionType = "csat" | "nps";

export type AppSatisfactionQuestion = {
  id: string;
  key: string;
  type: AppSatisfactionType;
  title: string;
  questionText: string;
  commentPrompt: string | null;
  commentEnabled: boolean;
  status: AppSatisfactionQuestionStatus;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppSatisfactionSurvey = {
  id: string;
  questionId: string | null;
  conversationId: string | null;
  contactId: string | null;
  leadId: string | null;
  departmentId: string | null;
  assignedUserId: string | null;
  channel: string | null;
  type: AppSatisfactionType;
  status: AppSatisfactionSurveyStatus;
  questionText: string;
  commentEnabled: boolean;
  source: string;
  sentAt: string | null;
  answeredAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppSatisfactionResponse = {
  id: string;
  surveyId: string;
  conversationId: string | null;
  contactId: string | null;
  leadId: string | null;
  score: number;
  comment: string | null;
  category: string | null;
  source: string;
  respondedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AppSatisfactionPayload = {
  questions: AppSatisfactionQuestion[];
  surveys: AppSatisfactionSurvey[];
  responses: AppSatisfactionResponse[];
};

export type AppSatisfactionPolicy = {
  enabled: boolean;
  questionText: string;
  commentEnabled: boolean;
  commentOfferText: string;
  commentPromptText: string;
  thankYouText: string;
  newServiceGateText: string;
  ttlMinutes: number;
  eligibility: "HUMAN_ONLY" | "DIRECTED_SERVICE";
};

export type AppSatisfactionQuestionPayload = {
  key?: string;
  type?: AppSatisfactionType;
  title: string;
  questionText: string;
  commentPrompt?: string | null;
  commentEnabled?: boolean;
  status?: AppSatisfactionQuestionStatus;
};

export type AppSatisfactionSurveyPayload = {
  questionId?: string | null;
  conversationId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  departmentId?: string | null;
  assignedUserId?: string | null;
  channel?: string | null;
  type?: AppSatisfactionType;
  status?: AppSatisfactionSurveyStatus;
  questionText: string;
  commentEnabled?: boolean;
  source?: string;
  sentAt?: string | null;
  answeredAt?: string | null;
  expiresAt?: string | null;
};

export type AppSatisfactionResponsePayload = {
  surveyId: string;
  score: number;
  comment?: string | null;
  source?: string;
  respondedAt?: string | null;
};

export type AppAudioTranscription = {
  id: string;
  messageId: string;
  conversationId: string | null;
  channel: string;
  language: string | null;
  transcript: string | null;
  confidence: number | null;
  provider: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type AppAudioTranscriptionJob = {
  id: string;
  transcriptionId: string;
  provider: string | null;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppAudioTranscriptionsPayload = {
  transcriptions: AppAudioTranscription[];
  jobs: AppAudioTranscriptionJob[];
};

export type AppSearchIndex = {
  id: string;
  entityType: string;
  entityId: string;
  title: string | null;
  body: string | null;
  snippet: string | null;
  channel: string | null;
  source: string | null;
  language: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppSearchPayload = {
  indexes: AppSearchIndex[];
  pageInfo: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  filters: {
    query: string | null;
    entityType: string | null;
    channel: string | null;
    source: string | null;
    language: string | null;
  };
  mode: "diagnostic" | "runtime";
  runtimeEnabled: boolean;
};

export type AppWebchatSiteStatus = "active" | "inactive" | "archived";

export type AppWebchatSite = {
  id: string;
  name: string;
  slug: string;
  status: AppWebchatSiteStatus;
  createdAt: string;
  updatedAt: string;
};

export type AppWebchatSettings = {
  id: string;
  siteId: string;
  theme: Record<string, unknown>;
  welcomeMessage: string | null;
  collectName: boolean;
  collectEmail: boolean;
  collectPhone: boolean;
  allowAnonymous: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AppWebchatAllowedDomain = {
  id: string;
  siteId: string;
  domain: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AppWebchatPayload = {
  sites: AppWebchatSite[];
  settings: AppWebchatSettings[];
  allowedDomains: AppWebchatAllowedDomain[];
};

export type AppWebchatSitePayload = {
  name: string;
  slug?: string;
  status?: AppWebchatSiteStatus;
};

export type AppWebchatSettingsPayload = {
  siteId: string;
  theme?: Record<string, unknown>;
  welcomeMessage?: string | null;
  collectName?: boolean;
  collectEmail?: boolean;
  collectPhone?: boolean;
  allowAnonymous?: boolean;
};

export type AppWebchatAllowedDomainPayload = {
  siteId: string;
  domain: string;
  active?: boolean;
};

export type AppTelegramAccountStatus = "pending" | "connected" | "disabled" | "error";

export type AppTelegramAccount = {
  id: string;
  displayName: string | null;
  channel: "telegram";
  provider: "telegram";
  channelAccountId: string;
  botUsername: string | null;
  botId: string | null;
  webhookStatus: string;
  tokenConfigured: boolean;
  tokenStatus: string;
  enabled: boolean;
  automationEnabled: boolean;
  runtimeEnabled: boolean;
  inboundPersistenceEnabled: boolean;
  outboundEnabled: boolean;
  aiEnabled: boolean;
  handoffEnabled: boolean;
  status: AppTelegramAccountStatus;
  aliases: Array<{ alias: string; aliasType: string }>;
  createdAt: string;
  updatedAt: string;
};

export type AppTelegramPayload = {
  accounts: AppTelegramAccount[];
  diagnostics: {
    runtimeImplemented: boolean;
    webhookImplemented: boolean;
    botApiCallsEnabled: boolean;
    webhookStatus: string;
  };
};

export type AppTelegramAccountPayload = {
  displayName: string;
  channelAccountId?: string | null;
  botUsername?: string | null;
  botId?: string | null;
  token?: string | null;
  enabled?: boolean;
  runtimeEnabled?: boolean;
  inboundPersistenceEnabled?: boolean;
  outboundEnabled?: boolean;
  handoffEnabled?: boolean;
  status?: AppTelegramAccountStatus;
};

export type AppAutomationSettings = {
  disableAutoReply: boolean;
  disableChatbot: boolean;
  disableAiFallback: boolean;
  disableIntentClassifier: boolean;
  aiAssistantEnabled?: boolean;
  aiAssistantMaxReplies?: number;
  aiAssistantProfile?: "business" | "government" | "legal_previdenciario";
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
  handoffLeadNotificationEnabled?: boolean;
  handoffLeadNotificationRecipients?: HandoffLeadNotificationRecipient[];
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
  aiConfigured: boolean;
  chatbotLocked?: boolean;
  flowEditingLocked?: boolean;
  aiLocked?: boolean;
  aiAssistantLocked?: boolean;
  intentClassifierLocked?: boolean;
};

export type AppMfaStatus = {
  featureEnabled: boolean;
  required: boolean;
  enforced: boolean;
  enrolled: boolean;
  enabled: boolean;
  enrolledAt: string | null;
  lastUsedAt: string | null;
  recoveryCodes: {
    configured: boolean;
    total: number;
    unused: number;
  };
};

export type AppMfaProvisioning = {
  type: "totp";
  issuer: string;
  accountName: string;
  otpauthUrl: string;
  secret: string;
};

export type AppMfaShadowVerification = {
  ok: true;
  valid: boolean;
  status: "valid" | "invalid";
  mode: "shadow";
};

export type AppMfaRuntimeStatus = {
  enrolled: boolean;
  enabled: boolean;
  wouldRequireMfa: boolean;
  mode: "shadow";
  reason:
    | "mfa_disabled"
    | "mfa_not_required"
    | "role_not_eligible"
    | "admin_required_enrolled"
    | "admin_required_pending_enrollment";
};

export type AppMfaRecoveryCodeStatus = {
  configured: boolean;
  total: number;
  used: number;
  available: number;
};

export type HandoffLeadNotificationRecipient = {
  id: string;
  waId: string;
  label?: string;
  isActive: boolean;
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
  preQualification?: boolean;
  tags?: string[];
};

export type CrmBusinessStatusConfig = {
  id: string;
  label: string;
  isActive: boolean;
  campaignEligible: boolean;
  description?: string;
};

export type AppCrmSettingsResponse = {
  ok: true;
  tenantId: string;
  settings: {
    crmBusinessStatuses: CrmBusinessStatusConfig[];
  };
  leadCountsByStatus: Record<string, number>;
};

export type AppCrmCampaignRecipient = {
  leadId: string;
  name: string | null;
  phone: string;
  status: string;
  updatedAt: string;
};

export type AppQueueAssignmentMode = "manual" | "round_robin" | "least_active";
export type AppQueueAssignmentScope = "tenant" | "department";
export type AppQueueAssignmentPresenceMode = "FRESH" | "AVAILABLE" | "IGNORE";
export type AppQueueAssignmentPresenceModeSource =
  | "explicit"
  | "legacy_require_online_true"
  | "legacy_require_online_false"
  | "default";

export type AppQueueAssignmentPolicy = {
  enabled: boolean;
  mode: AppQueueAssignmentMode;
  scope: AppQueueAssignmentScope;
  maxActivePerAgent: number | null;
  includeSupervisors: boolean;
  requireOnline: boolean;
  presenceMode: AppQueueAssignmentPresenceMode;
  presenceModeSource?: AppQueueAssignmentPresenceModeSource;
  notifyAssignedOnly: boolean;
};

export type AppQueueAssignmentSettingsResponse = {
  ok: true;
  tenantId: string;
  policy: AppQueueAssignmentPolicy;
  effectiveMode: AppQueueAssignmentMode;
  warnings: string[];
  permissions: {
    canUpdate: boolean;
  };
};

export type AppInboxVisibilityPolicy = "shared" | "assignee_only_after_assignment";

export type AppWhatsAppWebSessionObservedState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "QR_REQUIRED"
  | "CONNECTED"
  | "RECONNECTING"
  | "ERROR";

export type AppWhatsAppWebSessionLifecycle = {
  desiredState: "CONNECTED" | "DISCONNECTED";
  observedState: AppWhatsAppWebSessionObservedState;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
  reconnectCount: number;
};

export type AppWhatsAppWebSessionStatus = {
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
  lifecycle: AppWhatsAppWebSessionLifecycle;
  authState: {
    configured: boolean;
    approvedConfigured?: boolean;
    stagingConfigured?: boolean;
    secretKind: string;
    stagingSecretKind?: string;
    updatedAt: string | null;
    stagingUpdatedAt?: string | null;
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
  qr: {
    available: boolean;
    ttlMs: number;
  };
};

export type AppWhatsAppWebSessionResponse = {
  ok: true;
  tenantId: string;
  status: AppWhatsAppWebSessionStatus;
  permissions: {
    canUpdate: boolean;
  };
};

export type AppWhatsAppWebSessionQrResponse = {
  ok: true;
  tenantId: string;
  qr: string | null;
  expired: boolean;
  lifecycle: AppWhatsAppWebSessionLifecycle;
};

export type AppTenantSummary = {
  id: string;
  name: string;
  phoneNumberId: string | null;
  phoneDisplay: string | null;
  whatsappIdentityProvider: "meta" | "web_session" | "hybrid" | "none";
  features: AppFeatures;
  profile: AppProfile;
};

export function formatAppWhatsappIdentityDisplay(
  tenant: Pick<AppTenantSummary, "phoneDisplay" | "whatsappIdentityProvider">
) {
  if (!tenant.phoneDisplay || tenant.whatsappIdentityProvider === "none") return "Nenhum número conectado";
  return formatAppBrazilPhone(tenant.phoneDisplay);
}

function formatAppBrazilPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length === 13) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.startsWith("55") && digits.length === 12) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return digits.startsWith("55") ? `+${digits}` : value;
}

const SESSION_KEY = "wa_app_session_session_v1";
const LOCAL_KEY = "wa_app_session_local_v1";

function getDefaultBaseUrl() {
  return process.env.NEXT_PUBLIC_WHATSAPP_AGENT_BASE_URL || "/agent-api";
}

function normalizeBaseUrl(input: string) {
  const value = input.trim().replace(/\/+$/, "");
  if (!value) return "";
  if (value.startsWith("/")) return value;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function decodeClientAuthToken(token: string): Partial<AppSessionUser> & { sid?: string; exp?: number } {
  try {
    const [, payload] = token.split(".");
    if (!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const parsed = JSON.parse(atob(normalized)) as Partial<{
      sub: string;
      name: string;
      email: string;
      clientId: string;
      role: string;
      sid: string;
      departmentId?: string | null;
      departmentName?: string | null;
      departmentIds?: unknown;
      primaryDepartmentId?: string | null;
      exp?: number;
    }>;
    const departmentIds = Array.isArray(parsed.departmentIds)
      ? parsed.departmentIds.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [];
    return {
      id: typeof parsed.sub === "string" ? parsed.sub : undefined,
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      email: typeof parsed.email === "string" ? parsed.email : undefined,
      clientId: typeof parsed.clientId === "string" ? parsed.clientId : undefined,
      role: typeof parsed.role === "string" ? parsed.role : undefined,
      sid: typeof parsed.sid === "string" ? parsed.sid : undefined,
      exp: typeof parsed.exp === "number" ? parsed.exp : undefined,
      departmentId: typeof parsed.departmentId === "string" ? parsed.departmentId : undefined,
      departmentName: typeof parsed.departmentName === "string" ? parsed.departmentName : undefined,
      departmentIds,
      primaryDepartmentId: typeof parsed.primaryDepartmentId === "string" ? parsed.primaryDepartmentId : undefined,
    };
  } catch {
    return {};
  }
}

function parseStoredSession(raw: string | null): AppSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AppSession>;
    const token = String(parsed?.token || "");
    const tokenUser = decodeClientAuthToken(token);
    const parsedDepartmentIds = Array.isArray(parsed?.user?.departmentIds)
      ? parsed.user.departmentIds.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [];
    const tokenDepartmentIds = Array.isArray(tokenUser.departmentIds)
      ? tokenUser.departmentIds.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [];
    const resolvedUser = {
      id: String(parsed?.user?.id || tokenUser.id || ""),
      name: String(parsed?.user?.name || tokenUser.name || ""),
      email: String(parsed?.user?.email || tokenUser.email || ""),
      clientId: String(parsed?.user?.clientId || tokenUser.clientId || ""),
      role: String(parsed?.user?.role || tokenUser.role || ""),
      departmentId:
        typeof parsed?.user?.departmentId === "string"
          ? parsed.user.departmentId
          : tokenUser.departmentId ?? null,
      departmentName:
        typeof parsed?.user?.departmentName === "string"
          ? parsed.user.departmentName
          : tokenUser.departmentName ?? null,
      departmentIds: parsedDepartmentIds.length > 0 ? parsedDepartmentIds : tokenDepartmentIds,
      primaryDepartmentId:
        typeof parsed?.user?.primaryDepartmentId === "string"
          ? parsed.user.primaryDepartmentId
          : tokenUser.primaryDepartmentId ?? null,
    };
    if (!token || !tokenUser.sid || !resolvedUser.id || !resolvedUser.clientId || !resolvedUser.email) {
      return null;
    }
    return {
      baseUrl: normalizeBaseUrl(String(parsed.baseUrl || getDefaultBaseUrl())),
      token,
      expiresAt:
        typeof parsed.expiresAt === "string" && parsed.expiresAt.trim()
          ? parsed.expiresAt
          : tokenUser.exp
            ? new Date(tokenUser.exp * 1000).toISOString()
            : "",
      user: resolvedUser,
      features: getTenantCapabilities(parsed as Partial<AppSession>),
      profile: getAppProfile(parsed as Partial<AppSession>),
      supportAccess:
        parsed.supportAccess?.accessType === "platform_support"
          ? parsed.supportAccess
          : null,
    };
  } catch {
    return null;
  }
}

export function loadAppSession(): AppSession | null {
  if (typeof window === "undefined") return null;
  return (
    parseStoredSession(sessionStorage.getItem(SESSION_KEY)) ||
    parseStoredSession(localStorage.getItem(LOCAL_KEY))
  );
}

export function saveAppSession(session: AppSession) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify({
    ...session,
    baseUrl: normalizeBaseUrl(session.baseUrl || getDefaultBaseUrl()) || getDefaultBaseUrl(),
  });
  sessionStorage.setItem(SESSION_KEY, payload);
  if (session.supportAccess?.accessType === "platform_support") return;
  localStorage.setItem(LOCAL_KEY, payload);
}

export function clearAppSession(reason?: string | null) {
  if (typeof window === "undefined") return;
  saveSessionEndReason(normalizeSessionEndReason(reason));
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LOCAL_KEY);
}

const SUPPORT_RETURN_SESSION_KEY = "wa_app_support_return_session_v1";

export function saveSupportReturnSession(session: AppSession) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SUPPORT_RETURN_SESSION_KEY, JSON.stringify(session));
}

export function loadSupportReturnSession(): AppSession | null {
  if (typeof window === "undefined") return null;
  return parseStoredSession(sessionStorage.getItem(SUPPORT_RETURN_SESSION_KEY));
}

export function clearSupportReturnSession() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SUPPORT_RETURN_SESSION_KEY);
}

function getCurrentStoredSessionForRequest(session: AppSession) {
  const stored = loadAppSession();
  if (stored?.token && stored.user.id === session.user.id && stored.user.clientId === session.user.clientId) {
    return stored;
  }
  return session;
}

export function getAppSessionExpiresAt(session: AppSession | null): Date | null {
  if (!session?.expiresAt) return null;
  const date = new Date(session.expiresAt);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function getAppSessionRemainingMs(session: AppSession | null, now = new Date()) {
  const expiresAt = getAppSessionExpiresAt(session);
  if (!expiresAt) return null;
  return expiresAt.getTime() - now.getTime();
}

async function requestAppJson<T>(
  session: AppSession,
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const currentSession = getCurrentStoredSessionForRequest(session);
  const baseUrl = normalizeBaseUrl(currentSession.baseUrl || getDefaultBaseUrl()) || getDefaultBaseUrl();
  const token = currentSession.token.trim();
  if (!token) {
    const error = new Error(getAppErrorUxMessage({ status: 401 })) as AppApiError;
    error.status = 401;
    error.errorCode = "missing_token";
    throw error;
  }

  const controller = new AbortController();
  const timeoutMs = typeof init?.timeoutMs === "number" ? init.timeoutMs : 10000;
  const { timeoutMs: _timeoutMs, ...requestInit } = init ?? {};
  let didTimeout = false;
  const timeout = globalThis.setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  const requestSignal = requestInit.signal;
  const abortFromCaller = () => controller.abort();
  if (requestSignal?.aborted) {
    controller.abort();
  } else {
    requestSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }
  const isFormDataBody =
    typeof FormData !== "undefined" && requestInit.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...requestInit,
      headers: {
        ...(isFormDataBody ? {} : { "Content-Type": "application/json" }),
        Authorization: `Bearer ${token}`,
        ...(requestInit.headers ?? {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (fetchError) {
    globalThis.clearTimeout(timeout);
    const error = new Error("Sem resposta do servidor.") as AppApiError;
    error.status = 0;
    error.errorCode = "network_error";
    if ((fetchError as Error).name === "AbortError") {
      error.message = didTimeout ? "Timeout de conexao com o servidor." : "Requisicao cancelada.";
      error.errorCode = didTimeout ? "network_timeout" : "request_aborted";
    }
    throw error;
  } finally {
    requestSignal?.removeEventListener("abort", abortFromCaller);
  }
  globalThis.clearTimeout(timeout);

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let errorCode: string | undefined;
    let details: string | undefined;
    let payload: unknown;
    try {
      const body = (await res.json()) as {
        error?: string | { code?: string; message?: string; details?: string };
        message?: string;
        details?: string;
      };
      payload = body;
      if (typeof body.error === "string") {
        errorCode = body.error;
      } else if (body.error && typeof body.error === "object") {
        errorCode = typeof body.error.code === "string" ? body.error.code : undefined;
        if (typeof body.error.details === "string") {
          details = body.error.details;
        }
        if (typeof body.error.message === "string" && body.error.message.trim()) {
          message = body.error.message;
        }
      }
      details = details || (typeof body.details === "string" ? body.details : undefined);
      message =
        (typeof body.message === "string" && body.message.trim() ? body.message : "") ||
        (typeof body.error === "string" ? body.error : "") ||
        message;
    } catch {
      // noop
    }
    const error = new Error(message) as AppApiError;
    error.status = res.status;
    error.errorCode = errorCode;
    error.details = details;
    error.payload = payload;
    if (res.status === 401) {
      clearAppSession(errorCode);
      error.message = getAppErrorUxMessage({ status: res.status, errorCode });
    }
    if (res.status === 403) error.message = getAppErrorUxMessage({ status: res.status, errorCode });
    if (res.status === 413) {
      error.message = "Arquivo muito grande para envio. Tente uma imagem menor ou compacte o documento.";
      error.errorCode = error.errorCode || "payload_too_large";
    }
    if (errorCode === "feature_disabled" || errorCode === "feature_not_enabled") {
      error.message = getAppErrorUxMessage({ status: res.status, errorCode });
    }
    if (errorCode === "window_closed") {
      error.message = getAppErrorUxMessage({ status: res.status, errorCode });
      error.details =
        details ||
        "A conversa está fora da janela de 24 horas para texto livre. Use um modelo aprovado e, após a resposta do cliente, retome o atendimento manual.";
    }
    if (res.status >= 500 && !errorCode && !details) {
      error.message = getAppErrorUxMessage({ status: res.status, errorCode });
    }
    throw error;
  }

  return (await res.json()) as T;
}

async function requestAppText(
  session: AppSession,
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<string> {
  const currentSession = getCurrentStoredSessionForRequest(session);
  const baseUrl = normalizeBaseUrl(currentSession.baseUrl || getDefaultBaseUrl()) || getDefaultBaseUrl();
  const token = currentSession.token.trim();
  if (!token) {
    const error = new Error(getAppErrorUxMessage({ status: 401 })) as AppApiError;
    error.status = 401;
    error.errorCode = "missing_token";
    throw error;
  }

  const controller = new AbortController();
  const timeoutMs = typeof init?.timeoutMs === "number" ? init.timeoutMs : 10000;
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  const { timeoutMs: _timeoutMs, ...requestInit } = init ?? {};
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...requestInit,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(requestInit.headers ?? {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (fetchError) {
    globalThis.clearTimeout(timeout);
    const error = new Error("Sem resposta do servidor.") as AppApiError;
    error.status = 0;
    error.errorCode = "network_error";
    if ((fetchError as Error).name === "AbortError") {
      error.message = "Timeout de conexao com o servidor.";
      error.errorCode = "network_timeout";
    }
    throw error;
  }
  globalThis.clearTimeout(timeout);

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let errorCode: string | undefined;
    let details: string | undefined;
    let payload: unknown;
    try {
      const body = (await res.json()) as {
        error?: string | { code?: string; message?: string; details?: string };
        message?: string;
        details?: string;
      };
      payload = body;
      if (typeof body.error === "string") {
        errorCode = body.error;
      } else if (body.error && typeof body.error === "object") {
        errorCode = typeof body.error.code === "string" ? body.error.code : undefined;
        if (typeof body.error.details === "string") {
          details = body.error.details;
        }
        if (typeof body.error.message === "string" && body.error.message.trim()) {
          message = body.error.message;
        }
      }
      details = details || (typeof body.details === "string" ? body.details : undefined);
      message =
        (typeof body.message === "string" && body.message.trim() ? body.message : "") ||
        (typeof body.error === "string" ? body.error : "") ||
        message;
      if (body.error === "feature_disabled" || body.error === "feature_not_enabled") {
        message = getAppErrorUxMessage({ status: res.status, errorCode: body.error });
      }
    } catch {
      // noop
    }
    const error = new Error(message) as AppApiError;
    error.status = res.status;
    error.errorCode = errorCode;
    error.details = details;
    error.payload = payload;
    if (res.status === 401) {
      clearAppSession(errorCode);
      error.message = getAppErrorUxMessage({ status: res.status, errorCode });
    }
    if (res.status === 403) error.message = getAppErrorUxMessage({ status: res.status, errorCode });
    if (res.status >= 500 && !errorCode && !details) {
      error.message = getAppErrorUxMessage({ status: res.status, errorCode });
    }
    throw error;
  }

  return res.text();
}

async function requestAppBlob(
  session: AppSession,
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<{
  blob: Blob;
  contentType: string | null;
  fileName: string | null;
}> {
  const currentSession = getCurrentStoredSessionForRequest(session);
  const baseUrl = normalizeBaseUrl(currentSession.baseUrl || getDefaultBaseUrl()) || getDefaultBaseUrl();
  const token = currentSession.token.trim();
  if (!token) {
    const error = new Error(getAppErrorUxMessage({ status: 401 })) as AppApiError;
    error.status = 401;
    error.errorCode = "missing_token";
    throw error;
  }

  const controller = new AbortController();
  const timeoutMs = typeof init?.timeoutMs === "number" ? init.timeoutMs : 20000;
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  const { timeoutMs: _timeoutMs, ...requestInit } = init ?? {};
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...requestInit,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(requestInit.headers ?? {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (fetchError) {
    globalThis.clearTimeout(timeout);
    const error = new Error("Sem resposta do servidor.") as AppApiError;
    error.status = 0;
    error.errorCode = "network_error";
    if ((fetchError as Error).name === "AbortError") {
      error.message = "Timeout de conexao com o servidor.";
      error.errorCode = "network_timeout";
    }
    throw error;
  }
  globalThis.clearTimeout(timeout);

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let errorCode: string | undefined;
    try {
      const body = (await res.json()) as { error?: string | { code?: string; message?: string }; message?: string };
      if (typeof body.error === "string") {
        errorCode = body.error;
      } else if (body.error && typeof body.error === "object") {
        errorCode = typeof body.error.code === "string" ? body.error.code : undefined;
      }
      message =
        (typeof body.message === "string" && body.message.trim()) ||
        (body.error && typeof body.error === "object" && typeof body.error.message === "string"
          ? body.error.message
          : "") ||
        (typeof body.error === "string" ? body.error : "") ||
        message;
      if (body.error === "feature_disabled" || body.error === "feature_not_enabled") {
        message = getAppErrorUxMessage({ status: res.status, errorCode: body.error });
      }
    } catch {
      // noop
    }
    const error = new Error(message) as AppApiError;
    error.status = res.status;
    error.errorCode = errorCode;
    if (res.status === 401) {
      clearAppSession(errorCode);
      error.message = getAppErrorUxMessage({ status: res.status, errorCode });
    }
    if (res.status === 403) error.message = getAppErrorUxMessage({ status: res.status });
    if (res.status >= 500) error.message = getAppErrorUxMessage({ status: res.status });
    throw error;
  }

  const contentDisposition = res.headers.get("content-disposition");
  const fileNameMatch = contentDisposition?.match(/filename\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?/i);
  const encodedFileName = fileNameMatch?.[1] ?? fileNameMatch?.[2] ?? null;
  return {
    blob: await res.blob(),
    contentType: res.headers.get("content-type"),
    fileName: encodedFileName ? decodeURIComponent(encodedFileName) : null,
  };
}

export async function loginAppUser(
  email: string,
  password: string
): Promise<
  | { ok: true; token: string; expiresAt: string; user: AppSessionUser; features: TenantCapabilities; profile: AppProfile; mfaRequired?: false }
  | {
      ok: true;
      mfaRequired: true;
      challengeToken: string;
      expiresAt: string;
      methods: string[];
      user: AppSessionUser;
      features: TenantCapabilities;
      profile: AppProfile;
    }
> {
  const baseUrl = normalizeBaseUrl(getDefaultBaseUrl()) || getDefaultBaseUrl();
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 10000);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (fetchError) {
    globalThis.clearTimeout(timeout);
    const error = new Error("Sem resposta do servidor.") as AppApiError;
    error.status = 0;
    if ((fetchError as Error).name === "AbortError") {
      error.message = "Timeout de conexao com o servidor.";
    }
    throw error;
  }
  globalThis.clearTimeout(timeout);

  if (!res.ok) {
    let message = `Login failed (${res.status})`;
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
    const error = new Error(message) as AppApiError;
    error.status = res.status;
    if (res.status === 401) error.message = "Email ou senha inválidos.";
    if (res.status === 409) error.message = "Email ambiguo entre clientes.";
    if (res.status >= 500) error.message = getAppErrorUxMessage({ status: res.status });
    throw error;
  }

  const payload = (await res.json()) as {
    ok: true;
    token?: string;
    mfaRequired?: boolean;
    challengeToken?: string;
    expiresAt?: string;
    methods?: string[];
    user: AppSessionUser;
    features?: Partial<TenantCapabilities> | null;
    profile?: AppProfile | null;
  };
  if (payload.mfaRequired) {
    return {
      ok: true,
      mfaRequired: true,
      challengeToken: String(payload.challengeToken ?? ""),
      expiresAt: String(payload.expiresAt ?? ""),
      methods: Array.isArray(payload.methods) ? payload.methods.map(String) : ["totp"],
      user: payload.user,
      features: getTenantCapabilities({ features: payload.features ?? undefined }),
      profile: getAppProfile({ profile: payload.profile ?? undefined }),
    };
  }
  if (!payload.token) {
    const error = new Error("Resposta de login invalida.") as AppApiError;
    error.status = 500;
    throw error;
  }
  const tokenUser = decodeClientAuthToken(payload.token);
  return {
    ...payload,
    token: payload.token,
    expiresAt: String(payload.expiresAt ?? ""),
    mfaRequired: false,
    features: getTenantCapabilities({ features: payload.features ?? undefined }),
    profile: getAppProfile({ profile: payload.profile ?? undefined }),
    user: {
      ...payload.user,
      id: payload.user.id || tokenUser.id || "",
      name: payload.user.name || tokenUser.name || "",
      email: payload.user.email || tokenUser.email || "",
      clientId: payload.user.clientId || tokenUser.clientId || "",
      role: payload.user.role || tokenUser.role || "",
      departmentId: payload.user.departmentId ?? tokenUser.departmentId ?? null,
      departmentName: payload.user.departmentName ?? tokenUser.departmentName ?? null,
    },
  };
}

export async function verifyAppMfaLoginChallenge(
  challengeToken: string,
  code: string
): Promise<{ ok: true; token: string; expiresAt: string; user: AppSessionUser; features: TenantCapabilities; profile: AppProfile }> {
  const baseUrl = normalizeBaseUrl(getDefaultBaseUrl()) || getDefaultBaseUrl();
  const res = await fetch(`${baseUrl}/auth/mfa/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeToken, code }),
    cache: "no-store",
  });
  if (!res.ok) {
    let message = "Não foi possível validar o código de verificação.";
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      message = body.message || body.error || message;
    } catch {
      // noop
    }
    const error = new Error(message) as AppApiError;
    error.status = res.status;
    if (res.status === 400) error.message = "Informe o código de verificação.";
    if (res.status === 401) error.message = "Código de verificação inválido ou expirado.";
    if (res.status >= 500) error.message = getAppErrorUxMessage({ status: res.status });
    throw error;
  }

  const payload = (await res.json()) as {
    ok: true;
    token: string;
    expiresAt?: string;
    user: AppSessionUser;
    features?: Partial<TenantCapabilities> | null;
    profile?: AppProfile | null;
  };
  const tokenUser = decodeClientAuthToken(payload.token);
  return {
    ...payload,
    expiresAt: String(payload.expiresAt ?? ""),
    features: getTenantCapabilities({ features: payload.features ?? undefined }),
    profile: getAppProfile({ profile: payload.profile ?? undefined }),
    user: {
      ...payload.user,
      id: payload.user.id || tokenUser.id || "",
      name: payload.user.name || tokenUser.name || "",
      email: payload.user.email || tokenUser.email || "",
      clientId: payload.user.clientId || tokenUser.clientId || "",
      role: payload.user.role || tokenUser.role || "",
      departmentId: payload.user.departmentId ?? tokenUser.departmentId ?? null,
      departmentName: payload.user.departmentName ?? tokenUser.departmentName ?? null,
    },
  };
}

export async function requestAppPasswordReset(email: string): Promise<{ ok: true; message: string }> {
  const baseUrl = normalizeBaseUrl(getDefaultBaseUrl()) || getDefaultBaseUrl();
  const res = await fetch(`${baseUrl}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("Não foi possível solicitar a recuperação agora.");
  }
  return (await res.json()) as { ok: true; message: string };
}

export async function resetAppPassword(
  token: string,
  password: string
): Promise<{ ok: true; message: string }> {
  const baseUrl = normalizeBaseUrl(getDefaultBaseUrl()) || getDefaultBaseUrl();
  const res = await fetch(`${baseUrl}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as
    | { ok?: true; message?: string; error?: string | { message?: string } }
    | null;
  if (!res.ok) {
    const message =
      (typeof body?.message === "string" && body.message) ||
      (typeof body?.error === "object" && typeof body.error.message === "string"
        ? body.error.message
        : "") ||
      "Não foi possível alterar a senha.";
    throw new Error(message);
  }
  return {
    ok: true,
    message: typeof body?.message === "string" ? body.message : "Senha alterada com sucesso.",
  };
}

export function logoutAppSession(
  session: AppSession,
  endpoint?: string | null
): Promise<{ ok: true }> {
  return requestAppJson(session, "/auth/logout", {
    method: "POST",
    body: JSON.stringify({ endpoint: endpoint ?? null }),
    timeoutMs: 3000,
  });
}

export async function fetchAppAgentAvailability(session: AppSession): Promise<AppAgentAvailabilityResponse> {
  return requestAppJson(session, "/app/agent-availability", {
    method: "GET",
    timeoutMs: 5000,
  });
}

export async function updateAppAgentAvailability(
  session: AppSession,
  available: boolean
): Promise<AppAgentAvailabilityResponse> {
  return requestAppJson(session, "/app/agent-availability", {
    method: "PATCH",
    body: JSON.stringify({ available }),
    timeoutMs: 5000,
  });
}

export async function heartbeatAppAgentAvailability(session: AppSession): Promise<AppAgentAvailabilityResponse> {
  return requestAppJson(session, "/app/agent-availability/heartbeat", {
    method: "POST",
    body: JSON.stringify({}),
    timeoutMs: 5000,
  });
}

export async function renewAppSession(
  session: AppSession
): Promise<{ ok: true; token: string; expiresAt: string; user: AppSessionUser; features: TenantCapabilities; profile: AppProfile }> {
  const response = await requestAppJson<{
    ok: true;
    token: string;
    expiresAt: string;
    user: AppSessionUser;
    features?: Partial<TenantCapabilities> | null;
    profile?: AppProfile | null;
  }>(session, "/auth/renew", {
    method: "POST",
    body: JSON.stringify({}),
    timeoutMs: 5000,
  });
  return {
    ok: true,
    token: response.token,
    expiresAt: response.expiresAt,
    user: response.user,
    features: getTenantCapabilities({ features: response.features ?? undefined }),
    profile: getAppProfile({ profile: response.profile ?? undefined }),
  };
}

export async function fetchAppConversations(
  session: AppSession,
  options?: {
    limit?: number;
    cursor?: string | null;
    status?: string | null;
    departmentId?: string | null;
    assignedUserId?: string | null;
    unassigned?: boolean;
    automation?: boolean;
    search?: string | null;
    channel?: string | null;
  }
): Promise<{
  ok: true;
  count: number;
  items: InboxConversationItem[];
  conversations?: InboxConversationItem[];
  filterCounts?: Record<string, number>;
  nextCursor?: string | null;
  readState?: AppInboxReadState;
  inboxVisibilityPolicy?: AppInboxVisibilityPolicy;
  allowAgentOwnClosedConversations?: boolean;
  allowAutomationConversationsInInbox?: boolean;
}> {
  const params = new URLSearchParams();
  if (typeof options?.limit === "number" && Number.isFinite(options.limit)) {
    params.set("limit", String(options.limit));
  }
  if (options?.cursor?.trim()) {
    params.set("cursor", options.cursor.trim());
  }
  if (options?.status?.trim()) {
    params.set("status", options.status.trim());
  }
  if (options?.departmentId?.trim()) {
    params.set("departmentId", options.departmentId.trim());
  }
  if (options?.assignedUserId?.trim()) {
    params.set("assignedUserId", options.assignedUserId.trim());
  }
  if (options?.unassigned) {
    params.set("unassigned", "true");
  }
  if (options?.automation) {
    params.set("automation", "true");
  }
  if (options?.search?.trim()) {
    params.set("search", options.search.trim());
  }
  if (options?.channel?.trim()) {
    params.set("channel", options.channel.trim());
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestAppJson(session, `/app/conversations${suffix}`);
}

export async function updateAppConversationReadState(
  session: AppSession,
  waId: string,
  payload: { unread: boolean; activityAt?: string | null }
): Promise<{ ok: true; readState: AppInboxReadState }> {
  return requestAppJson(session, `/app/conversation/${encodeURIComponent(waId)}/read-state`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchAppConversation(
  session: AppSession,
  waId: string,
  options?: { limit?: number; order?: "asc" | "desc"; after?: string | null; signal?: AbortSignal }
): Promise<AppConversationOperationalPayload & {
  count: number;
  items: InboxMessageItem[];
}> {
  const params = new URLSearchParams();
  if (typeof options?.limit === "number" && Number.isFinite(options.limit)) {
    params.set("limit", String(options.limit));
  }
  if (options?.order) {
    params.set("order", options.order);
  }
  if (options?.after?.trim()) {
    params.set("after", options.after.trim());
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestAppJson(session, `/app/conversation/${encodeURIComponent(waId)}${suffix}`, {
    signal: options?.signal,
  });
}

export async function fetchAppConversationTimeline(
  session: AppSession,
  waId: string,
  options?: { limit?: number; cursor?: string | null }
): Promise<AppContactTimelineResponse> {
  const params = new URLSearchParams();
  if (typeof options?.limit === "number" && Number.isFinite(options.limit)) {
    params.set("limit", String(options.limit));
  }
  if (options?.cursor?.trim()) {
    params.set("cursor", options.cursor.trim());
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestAppJson(session, `/app/conversation/${encodeURIComponent(waId)}/timeline${suffix}`);
}

export async function fetchAppSupportConversations(
  session: AppSession
): Promise<{ ok: true; conversations: AppSupportConversation[] }> {
  return requestAppJson(session, "/app/support/conversations");
}

export async function openAppSupportConversation(
  session: AppSession,
  text: string
): Promise<{ ok: true; conversation: AppSupportConversation; resumed: boolean }> {
  return requestAppJson(session, "/app/support/conversations", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function fetchAppSupportConversation(
  session: AppSession,
  supportRef: string
): Promise<AppSupportConversationDetail> {
  return requestAppJson(session, `/app/support/conversations/${encodeURIComponent(supportRef)}`);
}

export async function sendAppSupportConversationMessage(
  session: AppSession,
  supportRef: string,
  text: string
): Promise<AppSupportConversationDetail> {
  return requestAppJson(session, `/app/support/conversations/${encodeURIComponent(supportRef)}/messages`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function sendAppSupportConversationAttachment(
  session: AppSession,
  supportRef: string,
  file: File,
  caption?: string
): Promise<AppSupportConversationDetail> {
  const formData = new FormData();
  formData.append("file", file);
  if (caption?.trim()) {
    formData.append("caption", caption.trim());
  }
  return requestAppJson(session, `/app/support/conversations/${encodeURIComponent(supportRef)}/attachments`, {
    method: "POST",
    body: formData,
    timeoutMs: 30000,
  });
}

export async function fetchAppSupportAttachment(
  session: AppSession,
  supportRef: string,
  attachmentRef: string
): Promise<{
  blob: Blob;
  contentType: string | null;
  fileName: string | null;
}> {
  return requestAppBlob(
    session,
    `/app/support/conversations/${encodeURIComponent(supportRef)}/attachments/${encodeURIComponent(attachmentRef)}`
  );
}

export async function fetchAppTrainingCatalog(
  session: AppSession
): Promise<AppTrainingCatalogResponse> {
  return requestAppJson(session, "/app/training/catalog");
}

export async function fetchAppTrainingContent(
  session: AppSession,
  contentId: string,
  options?: { download?: boolean }
): Promise<{
  blob: Blob;
  contentType: string | null;
  fileName: string | null;
}> {
  const suffix = options?.download ? "/download" : "";
  return requestAppBlob(session, `/app/training/content/${encodeURIComponent(contentId)}${suffix}`, {
    timeoutMs: 60000,
  });
}

export async function sendAppConversationMessage(
  session: AppSession,
  waId: string,
  text: string,
  replyTo?: { kind: "inbound" | "outbound"; id: string; mode?: "reply" | "rectify" } | null
): Promise<AppConversationOperationalPayload & {
  message: {
    messageId: string;
    internalMessageId?: string | null;
    status: string;
    metaMessageId: string | null;
    createdAt: string;
    bodyText?: string | null;
    agentSignatureApplied?: boolean;
    agentSignatureFormat?: "bold_line" | string | null;
    replyTo?: InboxMessageItem["replyTo"];
    actor?: InboxMessageItem["actor"];
  };
}> {
  return requestAppJson(session, `/app/conversation/${encodeURIComponent(waId)}/send`, {
    method: "POST",
    body: JSON.stringify({ text, ...(replyTo ? { replyTo } : {}) }),
  });
}

export async function startAppCrmContactConversation(
  session: AppSession,
  leadId: string,
  text: string
): Promise<AppConversationOperationalPayload & {
  message: {
    messageId: string;
    internalMessageId?: string | null;
    status: string;
    metaMessageId: string | null;
    createdAt: string;
    bodyText?: string | null;
    agentSignatureApplied?: boolean;
    agentSignatureFormat?: "bold_line" | string | null;
    replyTo?: InboxMessageItem["replyTo"];
    actor?: InboxMessageItem["actor"];
  };
}> {
  return requestAppJson(session, `/app/crm/contacts/${encodeURIComponent(leadId)}/start-conversation`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function sendAppConversationTemplate(
  session: AppSession,
  waId: string,
  payload: { templateId: string; variables?: Record<string, string> }
): Promise<AppConversationOperationalPayload & {
  message: {
    messageId: string;
    internalMessageId?: string | null;
    status: string;
    metaMessageId: string | null;
    createdAt: string;
    type: string;
    bodyText: string | null;
    templateName: string;
    templateLang: string | null;
    agentSignatureApplied?: boolean;
    agentSignatureFormat?: "bold_line" | string | null;
    actor?: InboxMessageItem["actor"];
  };
}> {
  return requestAppJson(session, `/app/conversation/${encodeURIComponent(waId)}/send-template`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function sendAppConversationCannedReply(
  session: AppSession,
  waId: string,
  cannedReplyId: string,
  replyTo?: { kind: "inbound" | "outbound"; id: string; mode?: "reply" | "rectify" } | null
): Promise<AppConversationOperationalPayload & {
  message: {
    messageId: string;
    internalMessageId?: string | null;
    status: string;
    metaMessageId: string | null;
    createdAt: string;
    type: string;
    bodyText: string | null;
    source: "canned_reply";
    cannedReplyId: string;
    cannedReplyTitle: string;
    agentSignatureApplied?: boolean;
    agentSignatureFormat?: "bold_line" | string | null;
    replyTo?: InboxMessageItem["replyTo"];
    actor?: InboxMessageItem["actor"];
  };
}> {
  return requestAppJson(session, `/app/conversation/${encodeURIComponent(waId)}/send-canned-reply`, {
    method: "POST",
    body: JSON.stringify({ cannedReplyId, ...(replyTo ? { replyTo } : {}) }),
  });
}

export async function sendAppConversationMedia(
  session: AppSession,
  waId: string,
  file: File,
  caption?: string,
  replyTo?: { kind: "inbound" | "outbound"; id: string; mode?: "reply" | "rectify" } | null
): Promise<AppConversationOperationalPayload & {
  message: {
    messageId: string;
    internalMessageId?: string | null;
    status: string;
    metaMessageId: string | null;
    createdAt: string;
    type: string;
    bodyText: string | null;
    media?: {
      kind: "image" | "audio" | "video" | "document";
      mimeType?: string;
      fileName?: string | null;
      caption?: string | null;
      hasDownload: boolean;
      downloadUrl?: string;
    } | null;
    replyTo?: InboxMessageItem["replyTo"];
    actor?: InboxMessageItem["actor"];
  };
}> {
  const formData = new FormData();
  formData.append("file", file);
  if (caption?.trim()) {
    formData.append("caption", caption.trim());
  }
  if (replyTo) {
    formData.append("replyTo", JSON.stringify(replyTo));
  }
  return requestAppJson(session, `/app/conversation/${encodeURIComponent(waId)}/send-media`, {
    method: "POST",
    body: formData,
    timeoutMs: 30000,
  });
}

export async function fetchAppConversationMedia(
  session: AppSession,
  waId: string,
  messageId: string
): Promise<{
  blob: Blob;
  contentType: string | null;
  fileName: string | null;
}> {
  return requestAppBlob(
    session,
    `/app/conversation/${encodeURIComponent(waId)}/messages/${encodeURIComponent(messageId)}/media`
  );
}

export async function claimAppConversation(
  session: AppSession,
  waId: string,
  userId?: string
): Promise<AppConversationOperationalPayload> {
  return requestAppJson(session, `/app/conversation/${encodeURIComponent(waId)}/claim`, {
    method: "POST",
    body: JSON.stringify(userId ? { userId } : {}),
  });
}

export async function releaseAppConversation(
  session: AppSession,
  waId: string
): Promise<AppConversationOperationalPayload> {
  return requestAppJson(session, `/app/conversation/${encodeURIComponent(waId)}/release`, {
    method: "POST",
  });
}

export async function releaseAppConversationToGeneral(
  session: AppSession,
  waId: string
): Promise<AppConversationOperationalPayload> {
  return requestAppJson(session, `/app/conversation/${encodeURIComponent(waId)}/release-to-general`, {
    method: "POST",
  });
}

export async function closeAppConversationToGeneral(
  session: AppSession,
  waId: string
): Promise<AppConversationOperationalPayload> {
  return requestAppJson(session, `/app/conversation/${encodeURIComponent(waId)}/close-to-general`, {
    method: "POST",
  });
}

export async function closeAppConversation(
  session: AppSession,
  waId: string
): Promise<AppConversationOperationalPayload> {
  return updateAppConversationStatus(session, waId, "CLOSED");
}

export async function transferAppConversation(
  session: AppSession,
  waId: string,
  userId: string
): Promise<AppConversationOperationalPayload> {
  return requestAppJson(session, `/app/conversation/${encodeURIComponent(waId)}/transfer`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export async function transferAppConversationDepartment(
  session: AppSession,
  waId: string,
  departmentId: string
): Promise<AppConversationOperationalPayload> {
  return requestAppJson(session, `/app/conversation/${encodeURIComponent(waId)}/transfer-department`, {
    method: "POST",
    body: JSON.stringify({ departmentId }),
  });
}

export async function updateAppConversationStatus(
  session: AppSession,
  waId: string,
  status: ConversationOperationalStatus
): Promise<AppConversationOperationalPayload> {
  return requestAppJson(session, `/app/conversation/${encodeURIComponent(waId)}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

export async function fetchAppUsers(
  session: AppSession,
  status: "active" | "inactive" | "all" = "all"
): Promise<{
  ok: true;
  count: number;
  activeUsers?: number;
  maxActiveAppUsers?: number;
  items: AdminUserItem[];
}> {
  const suffix = status === "all" ? "" : `?status=${encodeURIComponent(status)}`;
  return requestAppJson(session, `/app/users${suffix}`);
}

export async function createAppUser(
  session: AppSession,
  payload: {
    name: string;
    email: string;
    password?: string;
    role?: string;
    departmentId?: string | null;
    departmentIds?: string[];
    primaryDepartmentId?: string | null;
    isActive?: boolean;
  }
): Promise<{
  ok: true;
  user: AdminUserItem;
}> {
  return requestAppJson(session, "/app/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAppUser(
  session: AppSession,
  userId: string,
  payload: {
    name?: string;
    email?: string;
    role?: string;
    departmentId?: string | null;
    departmentIds?: string[];
    primaryDepartmentId?: string | null;
    isActive?: boolean;
  }
): Promise<{
  ok: true;
  user: AdminUserItem;
}> {
  return requestAppJson(session, `/app/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function fetchAppPublicApiKeys(session: AppSession): Promise<AppPublicApiKeysResponse> {
  return requestAppJson(session, "/app/api-keys");
}

export function createAppPublicApiKey(
  session: AppSession,
  payload: { name: string; scopes: AppPublicApiScope[]; expiresAt?: string | null }
): Promise<AppPublicApiKeyCreateResponse> {
  return requestAppJson(session, "/app/api-keys", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function revokeAppPublicApiKey(
  session: AppSession,
  keyId: string
): Promise<{ ok: true; key: AppPublicApiKey }> {
  return requestAppJson(session, `/app/api-keys/${encodeURIComponent(keyId)}/revoke`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function fetchAppWebhooks(session: AppSession): Promise<AppWebhooksResponse> {
  return requestAppJson(session, "/app/webhooks");
}

export function createAppWebhookEndpoint(
  session: AppSession,
  payload: { name: string; url: string }
): Promise<AppWebhookEndpointCreateResponse> {
  return requestAppJson(session, "/app/webhooks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAppWebhookEndpoint(
  session: AppSession,
  endpointId: string,
  payload: { name?: string; url?: string; active?: boolean }
): Promise<{ ok: true; endpoint: AppWebhookEndpoint }> {
  return requestAppJson(session, `/app/webhooks/${encodeURIComponent(endpointId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function rotateAppWebhookEndpointSecret(
  session: AppSession,
  endpointId: string
): Promise<AppWebhookEndpointCreateResponse> {
  return requestAppJson(session, `/app/webhooks/${encodeURIComponent(endpointId)}/rotate-secret`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function fetchAppMfaStatus(session: AppSession): Promise<{ ok: true; status: AppMfaStatus }> {
  return requestAppJson(session, "/app/mfa");
}

export function fetchAppMfaRuntimeStatus(
  session: AppSession
): Promise<{ ok: true; status: AppMfaRuntimeStatus }> {
  return requestAppJson(session, "/app/mfa/runtime-status");
}

export function fetchAppMfaRecoveryCodeStatus(
  session: AppSession
): Promise<{ ok: true; status: AppMfaRecoveryCodeStatus }> {
  return requestAppJson(session, "/app/mfa/recovery-codes/status");
}

export function startAppMfaEnrollment(
  session: AppSession
): Promise<{ ok: true; status: AppMfaStatus; provisioning: AppMfaProvisioning; message: string }> {
  return requestAppJson(session, "/app/mfa/enrollment", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function generateAppMfaRecoveryCodes(
  session: AppSession
): Promise<{
  ok: true;
  recoveryCodes: string[];
  status: AppMfaRecoveryCodeStatus;
  regenerated: boolean;
  message: string;
}> {
  return requestAppJson(session, "/app/mfa/recovery-codes/generate", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function verifyAppMfaShadow(session: AppSession, code: string): Promise<AppMfaShadowVerification> {
  return requestAppJson(session, "/app/mfa/verify-shadow", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function fetchAppDepartments(
  session: AppSession,
  options?: { includeInactive?: boolean; purpose?: "transfer" | "reports" }
): Promise<{
  ok: true;
  count: number;
  timezone?: string;
  items: AdminDepartmentItem[];
}> {
  const params = new URLSearchParams();
  if (options?.includeInactive) {
    params.set("includeInactive", "true");
  }
  if (options?.purpose) {
    params.set("purpose", options.purpose);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestAppJson(session, `/app/departments${suffix}`);
}

export async function fetchAppQueueAssignmentSettings(
  session: AppSession
): Promise<AppQueueAssignmentSettingsResponse> {
  return requestAppJson(session, "/app/settings/queue-assignment");
}

export async function updateAppQueueAssignmentSettings(
  session: AppSession,
  policy: AppQueueAssignmentPolicy
): Promise<AppQueueAssignmentSettingsResponse> {
  return requestAppJson(session, "/app/settings/queue-assignment", {
    method: "PUT",
    body: JSON.stringify(policy),
  });
}

export async function fetchAppSupportAccessSettings(
  session: AppSession
): Promise<AppSupportAccessSettingsResponse> {
  return requestAppJson(session, "/app/settings/support-access");
}

export async function grantAppSupportAccess(
  session: AppSession,
  payload: { durationHours: number; reason?: string | null }
): Promise<AppSupportAccessSettingsResponse> {
  return requestAppJson(session, "/app/settings/support-access", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function revokeAppSupportAccess(
  session: AppSession
): Promise<AppSupportAccessSettingsResponse> {
  return requestAppJson(session, "/app/settings/support-access", {
    method: "DELETE",
  });
}

export async function enterPlatformSupportTenant(
  session: AppSession,
  tenantId: string
): Promise<AppSession & { ok: true }> {
  const response = await requestAppJson<AppSession & { ok: true; supportAccess: AppSupportAccessContext }>(
    session,
    `/app/platform-support/tenants/${encodeURIComponent(tenantId)}/enter`,
    { method: "POST" }
  );
  return {
    ...response,
    baseUrl: session.baseUrl,
  };
}

export async function exitPlatformSupportTenant(session: AppSession): Promise<{ ok: true }> {
  return requestAppJson(session, "/app/platform-support/exit", { method: "POST" });
}

export async function fetchAppWhatsAppWebSessionStatus(
  session: AppSession
): Promise<AppWhatsAppWebSessionResponse> {
  return requestAppJson(session, "/app/settings/channels/whatsapp/web-session");
}

export async function prepareAppWhatsAppWebSession(
  session: AppSession,
  input: { displayName?: string; channelAccountId?: string }
): Promise<AppWhatsAppWebSessionResponse> {
  return requestAppJson(session, "/app/settings/channels/whatsapp/web-session", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function connectAppWhatsAppWebSession(
  session: AppSession
): Promise<AppWhatsAppWebSessionResponse> {
  return requestAppJson(session, "/app/settings/channels/whatsapp/web-session/connect", {
    method: "POST",
  });
}

export async function fetchAppWhatsAppWebSessionQr(
  session: AppSession
): Promise<AppWhatsAppWebSessionQrResponse> {
  return requestAppJson(session, "/app/settings/channels/whatsapp/web-session/qr");
}

export async function disconnectAppWhatsAppWebSession(
  session: AppSession
): Promise<AppWhatsAppWebSessionResponse> {
  return requestAppJson(session, "/app/settings/channels/whatsapp/web-session/disconnect", {
    method: "POST",
  });
}

export async function resetAppWhatsAppWebSession(
  session: AppSession
): Promise<AppWhatsAppWebSessionResponse> {
  return requestAppJson(session, "/app/settings/channels/whatsapp/web-session/reset", {
    method: "POST",
  });
}

export async function fetchAppAgentSignatureSettings(
  session: AppSession
): Promise<AppAgentSignatureSettingsResponse> {
  return requestAppJson(session, "/app/settings/agent-signature");
}

export async function updateAppAgentSignatureSettings(
  session: AppSession,
  settings: AppAgentSignatureSettings & {
    inboxVisibilityPolicy?: AppInboxVisibilityPolicy;
    serviceMessages?: AppServiceMessagePolicy;
  }
): Promise<AppAgentSignatureSettingsResponse> {
  return requestAppJson(session, "/app/settings/agent-signature", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export async function fetchAppTenantSummary(
  session: AppSession
): Promise<{ ok: true; tenant: AppTenantSummary }> {
  return requestAppJson(session, "/app/tenant");
}

export async function fetchAppChatbotFlows(
  session: AppSession
): Promise<{
  ok: true;
  count: number;
  items: AppChatbotFlowItem[];
}> {
  return requestAppJson(session, "/app/chatbot/flows");
}

export async function fetchAppChatbotResources(
  session: AppSession
): Promise<{
  ok: true;
  departments: AppChatbotDepartmentItem[];
  queues: AppChatbotQueueItem[];
}> {
  return requestAppJson(session, "/app/chatbot/resources");
}

export async function fetchAppChatbotSettings(
  session: AppSession
): Promise<{
  ok: true;
  tenantId: string;
  settings: AppAutomationSettings;
}> {
  return requestAppJson(session, "/app/chatbot/settings");
}

export async function updateAppChatbotSettings(
  session: AppSession,
  payload: Partial<AppAutomationSettings>
): Promise<{
  ok: true;
  tenantId: string;
  fieldsChanged: string[];
  settings: AppAutomationSettings;
}> {
  return requestAppJson(session, "/app/chatbot/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function createAppChatbotFlow(
  session: AppSession,
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
  flow: AppChatbotFlowItem;
}> {
  return requestAppJson(session, "/app/chatbot/flows", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAppChatbotFlow(
  session: AppSession,
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
  flow: AppChatbotFlowItem;
}> {
  return requestAppJson(session, `/app/chatbot/flows/${encodeURIComponent(flowId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchAppKnowledgeBase(
  session: AppSession,
  params?: { status?: AppKnowledgeBaseStatus | "all"; search?: string }
): Promise<{
  ok: true;
  collections: AppKnowledgeBaseCollection[];
  articles: AppKnowledgeBaseArticle[];
}> {
  const query = new URLSearchParams();
  if (params?.status && params.status !== "all") query.set("status", params.status);
  if (params?.search?.trim()) query.set("search", params.search.trim());
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestAppJson(session, `/app/knowledge-base${suffix}`);
}

export async function fetchAppKnowledgeBaseArticle(
  session: AppSession,
  articleId: string
): Promise<{
  ok: true;
  article: AppKnowledgeBaseArticle;
}> {
  return requestAppJson(session, `/app/knowledge-base/articles/${encodeURIComponent(articleId)}`);
}

export async function createAppKnowledgeBaseCollection(
  session: AppSession,
  payload: { name: string; key?: string | null; description?: string | null; visibility?: string | null }
): Promise<{
  ok: true;
  collection: AppKnowledgeBaseCollection;
}> {
  return requestAppJson(session, "/app/knowledge-base/collections", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createAppKnowledgeBaseArticle(
  session: AppSession,
  payload: AppKnowledgeBaseArticlePayload
): Promise<{
  ok: true;
  article: AppKnowledgeBaseArticle;
}> {
  return requestAppJson(session, "/app/knowledge-base/articles", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAppKnowledgeBaseArticle(
  session: AppSession,
  articleId: string,
  payload: AppKnowledgeBaseArticlePayload
): Promise<{
  ok: true;
  article: AppKnowledgeBaseArticle;
}> {
  return requestAppJson(session, `/app/knowledge-base/articles/${encodeURIComponent(articleId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function transitionAppKnowledgeBaseArticle(
  session: AppSession,
  articleId: string,
  action: "publish" | "unpublish" | "archive"
): Promise<{
  ok: true;
  article: AppKnowledgeBaseArticle;
}> {
  return requestAppJson(
    session,
    `/app/knowledge-base/articles/${encodeURIComponent(articleId)}/${action}`,
    { method: "POST" }
  );
}

export async function fetchAppScheduling(session: AppSession): Promise<{ ok: true } & AppSchedulingPayload> {
  return requestAppJson(session, "/app/scheduling");
}

export async function createAppSchedulingService(
  session: AppSession,
  payload: AppSchedulingServicePayload
): Promise<{ ok: true; service: AppSchedulingService }> {
  return requestAppJson(session, "/app/scheduling/services", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAppSchedulingService(
  session: AppSession,
  serviceId: string,
  payload: AppSchedulingServicePayload
): Promise<{ ok: true; service: AppSchedulingService }> {
  return requestAppJson(session, `/app/scheduling/services/${encodeURIComponent(serviceId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function createAppSchedulingResource(
  session: AppSession,
  payload: AppSchedulingResourcePayload
): Promise<{ ok: true; resource: AppSchedulingResource }> {
  return requestAppJson(session, "/app/scheduling/resources", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAppSchedulingResource(
  session: AppSession,
  resourceId: string,
  payload: AppSchedulingResourcePayload
): Promise<{ ok: true; resource: AppSchedulingResource }> {
  return requestAppJson(session, `/app/scheduling/resources/${encodeURIComponent(resourceId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function createAppSchedulingAvailability(
  session: AppSession,
  payload: AppSchedulingAvailabilityPayload
): Promise<{ ok: true; availability: AppSchedulingAvailability }> {
  return requestAppJson(session, "/app/scheduling/availabilities", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAppSchedulingAvailability(
  session: AppSession,
  availabilityId: string,
  payload: AppSchedulingAvailabilityPayload
): Promise<{ ok: true; availability: AppSchedulingAvailability }> {
  return requestAppJson(session, `/app/scheduling/availabilities/${encodeURIComponent(availabilityId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function createAppAppointment(
  session: AppSession,
  payload: AppAppointmentPayload
): Promise<{ ok: true; appointment: AppAppointment }> {
  return requestAppJson(session, "/app/scheduling/appointments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAppAppointment(
  session: AppSession,
  appointmentId: string,
  payload: AppAppointmentPayload
): Promise<{ ok: true; appointment: AppAppointment }> {
  return requestAppJson(session, `/app/scheduling/appointments/${encodeURIComponent(appointmentId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function createAppAppointmentReminder(
  session: AppSession,
  payload: AppAppointmentReminderPayload
): Promise<{ ok: true; reminder: AppAppointmentReminder }> {
  return requestAppJson(session, "/app/scheduling/reminders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAppAppointmentReminder(
  session: AppSession,
  reminderId: string,
  payload: AppAppointmentReminderPayload
): Promise<{ ok: true; reminder: AppAppointmentReminder }> {
  return requestAppJson(session, `/app/scheduling/reminders/${encodeURIComponent(reminderId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchAppSatisfaction(session: AppSession): Promise<{ ok: true } & AppSatisfactionPayload> {
  return requestAppJson(session, "/app/satisfaction");
}

export async function fetchAppSatisfactionPolicy(
  session: AppSession
): Promise<{ ok: true; policy: AppSatisfactionPolicy; configSource: string }> {
  return requestAppJson(session, "/app/satisfaction/policy");
}

export async function updateAppSatisfactionPolicy(
  session: AppSession,
  payload: Partial<AppSatisfactionPolicy>
): Promise<{ ok: true; policy: AppSatisfactionPolicy; configSource: string }> {
  return requestAppJson(session, "/app/satisfaction/policy", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function createAppSatisfactionQuestion(
  session: AppSession,
  payload: AppSatisfactionQuestionPayload
): Promise<{ ok: true; question: AppSatisfactionQuestion }> {
  return requestAppJson(session, "/app/satisfaction/questions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAppSatisfactionQuestion(
  session: AppSession,
  questionId: string,
  payload: AppSatisfactionQuestionPayload
): Promise<{ ok: true; question: AppSatisfactionQuestion }> {
  return requestAppJson(session, `/app/satisfaction/questions/${encodeURIComponent(questionId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function createAppSatisfactionSurvey(
  session: AppSession,
  payload: AppSatisfactionSurveyPayload
): Promise<{ ok: true; survey: AppSatisfactionSurvey }> {
  return requestAppJson(session, "/app/satisfaction/surveys", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAppSatisfactionSurvey(
  session: AppSession,
  surveyId: string,
  payload: AppSatisfactionSurveyPayload
): Promise<{ ok: true; survey: AppSatisfactionSurvey }> {
  return requestAppJson(session, `/app/satisfaction/surveys/${encodeURIComponent(surveyId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function createAppSatisfactionResponse(
  session: AppSession,
  payload: AppSatisfactionResponsePayload
): Promise<{ ok: true; response: AppSatisfactionResponse }> {
  return requestAppJson(session, "/app/satisfaction/responses", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchAppAudioTranscriptions(
  session: AppSession
): Promise<{ ok: true } & AppAudioTranscriptionsPayload> {
  return requestAppJson(session, "/app/audio-transcriptions");
}

export async function fetchAppSearch(
  session: AppSession,
  filters: {
    query?: string;
    entityType?: string;
    channel?: string;
    source?: string;
    language?: string;
    cursor?: string;
    limit?: number;
  } = {}
): Promise<{ ok: true } & AppSearchPayload> {
  const params = new URLSearchParams();
  if (filters.query?.trim()) params.set("q", filters.query.trim());
  if (filters.entityType?.trim()) params.set("entityType", filters.entityType.trim());
  if (filters.channel?.trim()) params.set("channel", filters.channel.trim());
  if (filters.source?.trim()) params.set("source", filters.source.trim());
  if (filters.language?.trim()) params.set("language", filters.language.trim());
  if (filters.cursor?.trim()) params.set("cursor", filters.cursor.trim());
  if (typeof filters.limit === "number" && Number.isFinite(filters.limit)) {
    params.set("limit", String(Math.trunc(filters.limit)));
  }
  const query = params.toString();
  return requestAppJson(session, `/app/search${query ? `?${query}` : ""}`);
}

export async function fetchAppWebchat(session: AppSession): Promise<{ ok: true } & AppWebchatPayload> {
  return requestAppJson(session, "/app/webchat");
}

export async function createAppWebchatSite(
  session: AppSession,
  payload: AppWebchatSitePayload
): Promise<{ ok: true; site: AppWebchatSite }> {
  return requestAppJson(session, "/app/webchat/sites", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAppWebchatSite(
  session: AppSession,
  siteId: string,
  payload: AppWebchatSitePayload
): Promise<{ ok: true; site: AppWebchatSite }> {
  return requestAppJson(session, `/app/webchat/sites/${encodeURIComponent(siteId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function upsertAppWebchatSettings(
  session: AppSession,
  payload: AppWebchatSettingsPayload
): Promise<{ ok: true; settings: AppWebchatSettings }> {
  return requestAppJson(session, "/app/webchat/settings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createAppWebchatAllowedDomain(
  session: AppSession,
  payload: AppWebchatAllowedDomainPayload
): Promise<{ ok: true; domain: AppWebchatAllowedDomain }> {
  return requestAppJson(session, "/app/webchat/domains", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAppWebchatAllowedDomain(
  session: AppSession,
  domainId: string,
  payload: AppWebchatAllowedDomainPayload
): Promise<{ ok: true; domain: AppWebchatAllowedDomain }> {
  return requestAppJson(session, `/app/webchat/domains/${encodeURIComponent(domainId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchAppTelegram(session: AppSession): Promise<{ ok: true } & AppTelegramPayload> {
  return requestAppJson(session, "/app/telegram");
}

export async function createAppTelegramAccount(
  session: AppSession,
  payload: AppTelegramAccountPayload
): Promise<{ ok: true; account: AppTelegramAccount }> {
  return requestAppJson(session, "/app/telegram/bots", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAppTelegramAccount(
  session: AppSession,
  accountId: string,
  payload: AppTelegramAccountPayload
): Promise<{ ok: true; account: AppTelegramAccount }> {
  return requestAppJson(session, `/app/telegram/bots/${encodeURIComponent(accountId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function rotateAppTelegramToken(
  session: AppSession,
  accountId: string,
  token: string
): Promise<{ ok: true; account: AppTelegramAccount }> {
  return requestAppJson(session, `/app/telegram/bots/${encodeURIComponent(accountId)}/rotate-token`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function fetchAppTelegramDiagnostics(
  session: AppSession,
  accountId: string
): Promise<{
  ok: true;
  diagnostics: {
    account: AppTelegramAccount;
    webhookImplemented: boolean;
    botApiCallsEnabled: boolean;
    runtimeImplemented: boolean;
    message: string;
  };
}> {
  return requestAppJson(session, `/app/telegram/bots/${encodeURIComponent(accountId)}/diagnostics`);
}

export async function fetchAppConversationReport(
  session: AppSession,
  params: {
    range: ConversationReportRange;
    from?: string | null;
    to?: string | null;
    dedupe?: boolean;
    channel?: string | null;
    userId?: string | null;
    departmentId?: string | null;
    queueId?: string | null;
  }
): Promise<ConversationReportResponse> {
  const query = new URLSearchParams({
    range: params.range,
  });
  if (params.userId) query.set("userId", params.userId);
  if (params.departmentId) query.set("departmentId", params.departmentId);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.dedupe) query.set("dedupe", "true");
  if (params.channel) query.set("channel", params.channel);
  if (params.queueId) query.set("queueId", params.queueId);
  return requestAppJson(session, `/app/reports/conversations?${query.toString()}`);
}

export async function fetchAppSessionAuditReport(
  session: AppSession,
  params: {
    from?: string | null;
    to?: string | null;
    userId?: string | null;
    departmentId?: string | null;
    role?: string | null;
    status?: AppSessionAuditStatus | null;
    page?: number | null;
    limit?: number | null;
  }
): Promise<AppSessionAuditReport> {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.userId) query.set("userId", params.userId);
  if (params.departmentId) query.set("departmentId", params.departmentId);
  if (params.role) query.set("role", params.role);
  if (params.status) query.set("status", params.status);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestAppJson(session, `/app/reports/sessions${suffix}`);
}

export async function fetchAppSatisfactionReport(
  session: AppSession,
  params: {
    from?: string | null;
    to?: string | null;
    assignedUserId?: string | null;
    departmentId?: string | null;
    channel?: string | null;
    page?: number | null;
    limit?: number | null;
  }
): Promise<AppSatisfactionReport> {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.assignedUserId) query.set("assignedUserId", params.assignedUserId);
  if (params.departmentId) query.set("departmentId", params.departmentId);
  if (params.channel) query.set("channel", params.channel);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestAppJson(session, `/app/reports/satisfaction${suffix}`);
}

export async function fetchAppCompletedServiceReport(
  session: AppSession,
  params: {
    from?: string | null;
    to?: string | null;
    assignedUserId?: string | null;
    departmentId?: string | null;
  }
): Promise<AppCompletedServiceReport> {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.assignedUserId) query.set("assignedUserId", params.assignedUserId);
  if (params.departmentId) query.set("departmentId", params.departmentId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestAppJson(session, `/app/reports/completed-services${suffix}`);
}

export async function fetchAppDashboardOverview(
  session: AppSession,
  filters?: {
    departmentId?: string | null;
    assignedUserId?: string | null;
    status?: string | null;
  }
): Promise<AppDashboardOverview> {
  const query = new URLSearchParams();
  if (filters?.departmentId?.trim()) query.set("departmentId", filters.departmentId.trim());
  if (filters?.assignedUserId?.trim()) query.set("assignedUserId", filters.assignedUserId.trim());
  if (filters?.status?.trim()) query.set("status", filters.status.trim());
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestAppJson(session, `/app/dashboard/overview${suffix}`);
}

function encodeOperationsBoardCursor(cursor: AppOperationsBoardCursor) {
  return btoa(JSON.stringify(cursor)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function fetchAppOperationsBoard(
  session: AppSession,
  filters?: {
    from?: string | null;
    to?: string | null;
    departmentId?: string | null;
    queueId?: string | null;
    assignedUserId?: string | null;
    limit?: number;
    cursors?: Partial<Record<ConversationOperationalStatus, AppOperationsBoardCursor | null>>;
  }
): Promise<AppOperationsBoardResponse> {
  const query = new URLSearchParams();
  if (filters?.from?.trim()) query.set("from", filters.from.trim());
  if (filters?.to?.trim()) query.set("to", filters.to.trim());
  if (filters?.departmentId?.trim()) query.set("departmentId", filters.departmentId.trim());
  if (filters?.queueId?.trim()) query.set("queueId", filters.queueId.trim());
  if (filters?.assignedUserId?.trim()) query.set("assignedUserId", filters.assignedUserId.trim());
  if (typeof filters?.limit === "number" && Number.isFinite(filters.limit)) {
    query.set("limit", String(filters.limit));
  }
  const cursors = filters?.cursors ?? {};
  if (cursors.WAITING) query.set("waitingCursor", encodeOperationsBoardCursor(cursors.WAITING));
  if (cursors.IN_PROGRESS) query.set("inProgressCursor", encodeOperationsBoardCursor(cursors.IN_PROGRESS));
  if (cursors.WAITING_USER) query.set("waitingUserCursor", encodeOperationsBoardCursor(cursors.WAITING_USER));
  if (cursors.CLOSED) query.set("closedCursor", encodeOperationsBoardCursor(cursors.CLOSED));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestAppJson(session, `/app/operations-board${suffix}`);
}

export async function exportAppConversationReportCsv(
  session: AppSession,
  params: {
    range: ConversationReportRange;
    from?: string | null;
    to?: string | null;
    dedupe?: boolean;
    channel?: string | null;
    userId?: string | null;
    departmentId?: string | null;
    queueId?: string | null;
  }
) {
  const query = new URLSearchParams({
    range: params.range,
  });
  if (params.userId) query.set("userId", params.userId);
  if (params.departmentId) query.set("departmentId", params.departmentId);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.dedupe) query.set("dedupe", "true");
  if (params.channel) query.set("channel", params.channel);
  if (params.queueId) query.set("queueId", params.queueId);
  return requestAppText(session, `/app/reports/conversations/export?${query.toString()}`);
}

export async function exportAppSessionAuditReportCsv(
  session: AppSession,
  params: {
    from?: string | null;
    to?: string | null;
    userId?: string | null;
    departmentId?: string | null;
    role?: string | null;
    status?: AppSessionAuditStatus | null;
  }
) {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.userId) query.set("userId", params.userId);
  if (params.departmentId) query.set("departmentId", params.departmentId);
  if (params.role) query.set("role", params.role);
  if (params.status) query.set("status", params.status);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestAppText(session, `/app/reports/sessions/export${suffix}`);
}

export async function exportAppSatisfactionReportCsv(
  session: AppSession,
  params: {
    from?: string | null;
    to?: string | null;
    assignedUserId?: string | null;
    departmentId?: string | null;
    channel?: string | null;
  }
) {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.assignedUserId) query.set("assignedUserId", params.assignedUserId);
  if (params.departmentId) query.set("departmentId", params.departmentId);
  if (params.channel) query.set("channel", params.channel);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestAppText(session, `/app/reports/satisfaction/export${suffix}`);
}

export async function exportAppCompletedServiceReportCsv(
  session: AppSession,
  params: {
    from?: string | null;
    to?: string | null;
    assignedUserId?: string | null;
    departmentId?: string | null;
    view?: "by-agent" | "department-agent" | "detail";
  }
) {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.assignedUserId) query.set("assignedUserId", params.assignedUserId);
  if (params.departmentId) query.set("departmentId", params.departmentId);
  if (params.view) query.set("view", params.view);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestAppText(session, `/app/reports/completed-services/export${suffix}`);
}

export async function fetchAppInstagramBusinessStatus(
  session: AppSession
): Promise<{
  ok: true;
  redirectUri: string;
  status: AppInstagramBusinessStatus;
}> {
  return requestAppJson(session, "/app/channels/instagram/status");
}

export async function startAppInstagramBusinessConnect(
  session: AppSession
): Promise<{
  ok: true;
  authUrl: string;
  redirectUri: string;
  scopes: string[];
}> {
  return requestAppJson(session, "/app/channels/instagram/connect/start", {
    method: "POST",
  });
}

export async function validateAppInstagramBusinessConnection(
  session: AppSession
): Promise<{
  ok: boolean;
  validation: AppInstagramBusinessValidation;
}> {
  return requestAppJson(session, "/app/channels/instagram/validate", {
    method: "POST",
  });
}

export async function createAppDepartment(
  session: AppSession,
  payload: {
    name: string;
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
  return requestAppJson(session, "/app/departments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAppDepartment(
  session: AppSession,
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
  return requestAppJson(session, `/app/departments/${encodeURIComponent(departmentId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchAppRetentionConfig(
  session: AppSession
): Promise<{ ok: true; retentionDays: number; createdAt: string }> {
  return requestAppJson(session, "/app/privacy/retention");
}

export async function updateAppRetentionConfig(
  session: AppSession,
  retentionDays: number
): Promise<{ ok: true; retentionDays: number; createdAt: string }> {
  return requestAppJson(session, "/app/privacy/retention", {
    method: "PUT",
    body: JSON.stringify({ retentionDays }),
  });
}

export async function executeAppRetention(
  session: AppSession
): Promise<{
  ok: true;
  retentionDays: number;
  cutoff: string;
  deletedConversations: number;
  softDeletedConversations?: number;
  anonymizedConversations?: number;
}> {
  return requestAppJson(session, "/app/privacy/retention/execute", {
    method: "POST",
  });
}

export type AppPrivacySubjectPreview = {
  ok: true;
  subject: {
    contactId: string | null;
    leadId: string | null;
    leadIds: string[];
    alreadyAnonymized: boolean;
    operationalStatus: "active" | "excluded";
    privacyStatus: "identifiable" | "anonymized";
    displayName: string | null;
    phoneDisplay: string | null;
  };
  counts: {
    contacts: number;
    leads: number;
    contactChannelIdentities: number;
    conversations: number;
    runtimeStates: number;
    leadNotes: number;
    inboundMessages: number;
    outboundMessages: number;
    events: number;
    consentRecords: number;
    optOutEvents: number;
    campaignRelationships: number;
  };
  actions: Array<{ entity: string; count: number; action: string }>;
  fieldsToAnonymize: string[];
  historicalObjectsPreserved: string[];
};

export type AppPrivacySubjectSearchResponse = {
  ok: true;
  items: AppCrmContactItem[];
  generatedAt: string;
};

export type AppPrivacySubjectResolutionResponse = {
  ok: true;
  contactId: string | null;
  leadId: string;
  item: AppCrmContactDetailResponse["item"];
};

export type AppPrivacySubjectTarget =
  | { contactId: string; leadId?: string | null }
  | { contactId?: string | null; leadId: string };

function buildAppPrivacySubjectPath(target: AppPrivacySubjectTarget, action: "preview" | "anonymize") {
  if (target.contactId) return `/app/privacy/subjects/${encodeURIComponent(target.contactId)}/${action}`;
  if (!target.leadId) throw new Error("privacy_subject_target_required");
  return `/app/privacy/subjects/${encodeURIComponent(target.leadId)}/${action}?target=lead`;
}

export async function searchAppPrivacySubjects(
  session: AppSession,
  filters?: Pick<AppCrmContactsFilter, "q" | "page" | "limit">
): Promise<AppPrivacySubjectSearchResponse> {
  const params = new URLSearchParams();
  if (filters?.q?.trim()) params.set("q", filters.q.trim());
  if (typeof filters?.page === "number" && Number.isFinite(filters.page)) {
    params.set("page", String(Math.max(1, Math.floor(filters.page))));
  }
  if (typeof filters?.limit === "number" && Number.isFinite(filters.limit)) {
    params.set("limit", String(Math.max(1, Math.floor(filters.limit))));
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestAppJson(session, `/app/privacy/subjects/search${suffix}`);
}

export async function resolveAppPrivacySubjectFromCrmLead(
  session: AppSession,
  leadId: string
): Promise<AppPrivacySubjectResolutionResponse> {
  return requestAppJson(session, "/app/privacy/subjects/resolve", {
    method: "POST",
    body: JSON.stringify({ leadId }),
  });
}

export async function previewAppPrivacySubject(
  session: AppSession,
  target: AppPrivacySubjectTarget
): Promise<AppPrivacySubjectPreview> {
  return requestAppJson(session, buildAppPrivacySubjectPath(target, "preview"), {
    method: "POST",
  });
}

export async function anonymizeAppPrivacySubject(
  session: AppSession,
  target: AppPrivacySubjectTarget,
  confirmation: string
): Promise<{ ok: true; preview: AppPrivacySubjectPreview; anonymized?: Record<string, number>; alreadyAnonymized?: true }> {
  return requestAppJson(session, buildAppPrivacySubjectPath(target, "anonymize"), {
    method: "POST",
    body: JSON.stringify({ confirmation }),
  });
}

export async function fetchAppCrmSettings(session: AppSession): Promise<AppCrmSettingsResponse> {
  return requestAppJson(session, "/app/crm/settings");
}

export async function fetchAppCrmStatuses(session: AppSession): Promise<AppCrmSettingsResponse> {
  return requestAppJson(session, "/app/crm/statuses");
}

export async function fetchAppCrmContacts(
  session: AppSession,
  filters?: AppCrmContactsFilter
): Promise<AppCrmContactsResponse> {
  const params = new URLSearchParams();
  if (filters?.q?.trim()) params.set("q", filters.q.trim());
  if (filters?.status?.trim()) params.set("status", filters.status.trim());
  if (filters?.channel?.trim()) params.set("channel", filters.channel.trim());
  if (typeof filters?.hasConversation === "boolean") {
    params.set("hasConversation", String(filters.hasConversation));
  }
  if (typeof filters?.optOut === "boolean") {
    params.set("optOut", String(filters.optOut));
  }
  if (filters?.operationalStatus === "excluded") {
    params.set("operationalStatus", "excluded");
  }
  if (typeof filters?.page === "number" && Number.isFinite(filters.page)) {
    params.set("page", String(Math.max(1, Math.floor(filters.page))));
  }
  if (typeof filters?.limit === "number" && Number.isFinite(filters.limit)) {
    params.set("limit", String(Math.max(1, Math.floor(filters.limit))));
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestAppJson(session, `/app/crm/contacts${suffix}`);
}

export async function fetchAppCampaignAudiencePreview(
  session: AppSession,
  filters?: AppCampaignAudiencePreviewFilter
): Promise<AppCampaignAudiencePreviewResponse> {
  const params = new URLSearchParams();
  if (filters?.q?.trim()) params.set("q", filters.q.trim());
  if (filters?.status?.trim()) params.set("status", filters.status.trim());
  if (filters?.crmStatus?.trim()) params.set("crmStatus", filters.crmStatus.trim());
  if (filters?.channel?.trim()) params.set("channel", filters.channel.trim());
  if (filters?.city?.trim()) params.set("city", filters.city.trim());
  if (filters?.importedSource?.trim()) {
    params.set("importedSource", filters.importedSource.trim());
  }
  if (typeof filters?.hasConversation === "boolean") {
    params.set("hasConversation", String(filters.hasConversation));
  }
  if (typeof filters?.optOut === "boolean") {
    params.set("optOut", String(filters.optOut));
  }
  if (typeof filters?.onlyWhatsappEligible === "boolean") {
    params.set("onlyWhatsappEligible", String(filters.onlyWhatsappEligible));
  }
  if (typeof filters?.excludeOptOut === "boolean") {
    params.set("excludeOptOut", String(filters.excludeOptOut));
  }
  if (filters?.updatedFrom?.trim()) params.set("updatedFrom", filters.updatedFrom.trim());
  if (filters?.updatedTo?.trim()) params.set("updatedTo", filters.updatedTo.trim());
  if (typeof filters?.page === "number" && Number.isFinite(filters.page)) {
    params.set("page", String(Math.max(1, Math.floor(filters.page))));
  }
  if (typeof filters?.limit === "number" && Number.isFinite(filters.limit)) {
    params.set("limit", String(Math.max(1, Math.floor(filters.limit))));
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestAppJson(session, `/app/campaigns/audience-preview${suffix}`);
}

export async function fetchAppMetaUsagePreview(
  session: AppSession,
  payload: {
    source: "campaign" | "manual_campaign_send" | "inbox_template" | "canned_reply" | "inbox_text";
    messageKind: "template" | "canned_reply" | "free_text";
    templateId?: string | null;
    templateCategory?: string | null;
    recipientCount?: number | null;
    eligibleCount?: number | null;
    blockedCount?: number | null;
    windowOpenAtSend?: boolean | "unknown" | null;
    country?: "BR" | "unknown" | null;
  }
): Promise<{ ok: true; preview: AppMetaCostPreview }> {
  return requestAppJson(session, "/app/usage/meta/preview", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchAppMetaUsageMonthlyReport(
  session: AppSession,
  month?: string | null
): Promise<AppMetaUsageMonthlyReport> {
  const params = new URLSearchParams();
  if (month?.trim()) params.set("month", month.trim());
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestAppJson(session, `/app/usage/meta/report${suffix}`);
}

export async function downloadAppMetaUsageMonthlyReportCsv(
  session: AppSession,
  month?: string | null
) {
  const params = new URLSearchParams();
  if (month?.trim()) params.set("month", month.trim());
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestAppBlob(session, `/app/usage/meta/report.csv${suffix}`, {
    timeoutMs: 20000,
  });
}

export async function fetchAppCrmContactDetail(
  session: AppSession,
  leadId: string,
  options?: { operationalStatus?: "active" | "excluded" | null }
): Promise<AppCrmContactDetailResponse> {
  const params = new URLSearchParams();
  if (options?.operationalStatus === "excluded") params.set("operationalStatus", "excluded");
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestAppJson(session, `/app/crm/contacts/${encodeURIComponent(leadId)}${suffix}`);
}

export async function createAppCrmContact(
  session: AppSession,
  payload: { name?: string | null; phone: string }
): Promise<AppCrmContactDetailResponse> {
  return requestAppJson(session, "/app/crm/contacts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function inspectAppCrmContactCsvImport(
  session: AppSession,
  payload: { csvText: string }
): Promise<AppCrmContactImportInspectResponse> {
  return requestAppJson(session, "/app/crm/contacts/import/inspect", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function previewAppCrmContactCsvImport(
  session: AppSession,
  payload: { csvText: string; mapping?: AppCrmContactCsvMapping | null }
): Promise<AppCrmContactImportPreviewResponse> {
  return requestAppJson(session, "/app/crm/contacts/import/preview", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function confirmAppCrmContactCsvImport(
  session: AppSession,
  payload: { csvText: string; mapping?: AppCrmContactCsvMapping | null }
): Promise<AppCrmContactImportConfirmResponse> {
  return requestAppJson(session, "/app/crm/contacts/import/confirm", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAppCrmContactBasics(
  session: AppSession,
  leadId: string,
  payload: {
    displayName?: string | null;
    companyName?: string | null;
    email?: string | null;
    city?: string | null;
  }
): Promise<AppCrmContactDetailResponse> {
  return requestAppJson(session, `/app/crm/contacts/${encodeURIComponent(leadId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function updateAppCrmContactStatus(
  session: AppSession,
  leadId: string,
  status: string
): Promise<AppCrmContactDetailResponse> {
  return requestAppJson(session, `/app/crm/contacts/${encodeURIComponent(leadId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function recordAppCrmContactOptOut(
  session: AppSession,
  leadId: string
): Promise<AppCrmContactDetailResponse> {
  return requestAppJson(session, `/app/crm/contacts/${encodeURIComponent(leadId)}/opt-out`, {
    method: "POST",
    body: JSON.stringify({ reason: "manual_crm_opt_out" }),
  });
}

export async function revokeAppCrmContactOptOut(
  session: AppSession,
  leadId: string
): Promise<AppCrmContactDetailResponse> {
  return requestAppJson(session, `/app/crm/contacts/${encodeURIComponent(leadId)}/opt-out`, {
    method: "DELETE",
  });
}

export async function excludeAppCrmContactFromOperation(
  session: AppSession,
  leadId: string
): Promise<{ ok: true; excluded: true }> {
  return requestAppJson(session, `/app/crm/contacts/${encodeURIComponent(leadId)}/exclude`, {
    method: "POST",
    body: JSON.stringify({ reason: "manual_crm_operational_exclusion" }),
  });
}

export async function reactivateAppCrmContactForOperation(
  session: AppSession,
  leadId: string
): Promise<AppCrmContactDetailResponse> {
  return requestAppJson(session, `/app/crm/contacts/${encodeURIComponent(leadId)}/reactivate`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function updateAppCrmSettings(
  session: AppSession,
  payload: { crmBusinessStatuses: CrmBusinessStatusConfig[] }
): Promise<{
  ok: true;
  tenantId: string;
  fieldsChanged: string[];
  settings: {
    crmBusinessStatuses: CrmBusinessStatusConfig[];
  };
}> {
  return requestAppJson(session, "/app/crm/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchAppCrmCampaignRecipients(
  session: AppSession,
  statuses: string[],
  limit = 1000
): Promise<{
  ok: true;
  statuses: string[];
  count: number;
  items: AppCrmCampaignRecipient[];
  numbers: string[];
}> {
  const params = new URLSearchParams();
  params.set("statuses", statuses.join(","));
  params.set("limit", String(limit));
  return requestAppJson(session, `/app/crm/campaign-recipients?${params.toString()}`);
}

export async function deleteAppConversationData(
  session: AppSession,
  conversationIdOrWaId: string
): Promise<{ ok: true; deleted: Record<string, number | string> }> {
  return requestAppJson(session, `/app/conversations/${encodeURIComponent(conversationIdOrWaId)}`, {
    method: "DELETE",
  });
}

export async function anonymizeAppConversationData(
  session: AppSession,
  conversationIdOrWaId: string
): Promise<{ ok: true; anonymized: Record<string, number>; waId: string }> {
  return requestAppJson(session, `/app/conversations/${encodeURIComponent(conversationIdOrWaId)}/anonymize`, {
    method: "POST",
  });
}

export async function updateAppLeadStatus(
  session: AppSession,
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
  return requestAppJson(session, `/app/lead/${encodeURIComponent(leadId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function updateAppLead(
  session: AppSession,
  leadId: string,
  payload: { name?: string | null; email?: string | null; company?: string | null }
): Promise<{
  ok: true;
  lead: {
    id: string;
    name: string | null;
    email: string | null;
    company: string | null;
    updatedAt: string;
  };
}> {
  return requestAppJson(session, `/app/lead/${encodeURIComponent(leadId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function fetchAppLeadNotes(
  session: AppSession,
  leadId: string
): Promise<{
  ok: true;
  count: number;
  items: LeadNoteItem[];
}> {
  return requestAppJson(session, `/app/lead/${encodeURIComponent(leadId)}/notes`);
}

export async function createAppLeadNote(
  session: AppSession,
  leadId: string,
  body: string
): Promise<{
  ok: true;
  note: LeadNoteItem;
}> {
  return requestAppJson(session, `/app/lead/${encodeURIComponent(leadId)}/notes`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export type AppInboxEventName =
  | "inbox.priority.rendered"
  | "inbox.sorted"
  | "inbox.suggestion.used"
  | "inbox.action.send.attempt"
  | "inbox.action.send.requested"
  | "inbox.action.send.succeeded"
  | "inbox.action.send.failed"
  | "inbox.action.send.blocked"
  | "inbox.action.send.client_error"
  | "inbox.action.close.attempt"
  | "inbox.action.close.requested"
  | "inbox.action.close.succeeded"
  | "inbox.action.close.failed"
  | "inbox.action.close.blocked"
  | "inbox.action.close.cancelled"
  | "inbox.action.close.client_error";

export function logAppInboxEvent(
  session: AppSession,
  event: AppInboxEventName,
  payload: Record<string, unknown>,
  options?: { keepalive?: boolean }
) {
  return requestAppJson<{ ok: true }>(session, "/app/inbox/events", {
    method: "POST",
    body: JSON.stringify({ event, payload }),
    keepalive: options?.keepalive === true,
    timeoutMs: 3000,
  });
}

export async function logAppInboxEventSafely(
  session: AppSession,
  event: AppInboxEventName,
  payload: Record<string, unknown>,
  options?: { keepalive?: boolean }
): Promise<boolean> {
  try {
    await logAppInboxEvent(session, event, payload, options);
    return true;
  } catch {
    return false;
  }
}

export function getAppPushStatus(session: AppSession): Promise<AppPushStatus> {
  return requestAppJson(session, "/app/push/status");
}

export function subscribeAppPush(
  session: AppSession,
  subscription: PushSubscriptionJSON,
  deviceLabel?: string
): Promise<{
  ok: true;
  subscription: {
    id: string;
    endpointHash: string;
    updatedAt: string;
  };
  publicKey: string;
}> {
  return requestAppJson(session, "/app/push/subscribe", {
    method: "POST",
    body: JSON.stringify({ subscription, deviceLabel }),
  });
}

export function unsubscribeAppPush(
  session: AppSession,
  endpoint?: string | null
): Promise<{ ok: true; revoked: number }> {
  return requestAppJson(session, "/app/push/subscribe", {
    method: "DELETE",
    body: JSON.stringify({ endpoint: endpoint ?? null }),
  });
}

export function updateAppPushPresence(
  session: AppSession,
  endpoint: string,
  presence: { visible: boolean; focused: boolean },
  options?: { keepalive?: boolean }
): Promise<{ ok: true }> {
  return requestAppJson(session, "/app/push/presence", {
    method: "POST",
    body: JSON.stringify({
      endpoint,
      visible: presence.visible,
      focused: presence.focused,
    }),
    keepalive: options?.keepalive === true,
    timeoutMs: 3000,
  });
}

export async function listAppCampaigns(
  session: AppSession,
  options?: { limit?: number }
): Promise<{ ok: true; count: number; items: CampaignItem[] }> {
  const params = new URLSearchParams();
  if (typeof options?.limit === "number" && Number.isFinite(options.limit)) {
    params.set("limit", String(options.limit));
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestAppJson(session, `/app/campaigns${suffix}`);
}

export async function getAppCampaign(
  session: AppSession,
  campaignId: string
): Promise<{ ok: true; campaign: CampaignItem }> {
  return requestAppJson(session, `/app/campaigns/${encodeURIComponent(campaignId)}`);
}

export async function exportAppCampaignConsumptionCsv(
  session: AppSession,
  campaignId: string
): Promise<string> {
  return requestAppText(session, `/app/campaigns/${encodeURIComponent(campaignId)}/export`);
}

export async function fetchAppCampaignReturnDestinations(
  session: AppSession
): Promise<AppCampaignReturnDestinationsResponse> {
  return requestAppJson(session, "/app/campaigns/return-destinations");
}

export async function createAppCampaign(
  session: AppSession,
  payload: {
    name: string;
    templateId?: string;
    templateName: string;
    recipients: string[];
    templateParams?: string[];
    returnDestination: AppCampaignReturnDestination;
  }
): Promise<{ ok: true; campaign: CampaignItem & { campaignId: string; campaignRunId: string } }> {
  return requestAppJson(session, "/app/campaigns", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createAppCampaignDraft(
  session: AppSession,
  payload: {
    name: string;
    templateId: string;
    selectedLeadIds?: string[];
    templateParams?: string[];
    returnDestination: AppCampaignReturnDestination;
    selectionMode?: "STATIC_RECIPIENTS" | "DYNAMIC_CRM_FILTER";
    dynamicFilter?: {
      version: 1;
      crmBusinessStatusId: string;
    } | null;
    templateVariableMappings?: Array<{
      position: string;
      source: "contact.displayName" | "lead.companyName" | "lead.city" | "fixed" | "";
      value?: string;
      fallback?: string;
    }>;
  }
): Promise<{
  ok: true;
  campaign: CampaignItem & { campaignId: string };
  draft: {
    summary: CampaignDraftSummary;
    recipients: AppCampaignDraftRecipient[];
  };
}> {
  return requestAppJson(session, "/app/campaigns/drafts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function previewAppCampaignDraftSplit(
  session: AppSession,
  payload: {
    name: string;
    templateId: string;
    splitMode: AppCampaignAudienceSplitMode;
    filters?: AppCampaignAudiencePreviewFilter;
    dynamicFilter?: {
      version: 1;
      crmBusinessStatusId: string;
    } | null;
    returnDestination: AppCampaignReturnDestination;
    templateVariableMappings?: Array<{
      position: string;
      source: "contact.displayName" | "lead.companyName" | "lead.city" | "fixed" | "";
      value?: string;
      fallback?: string;
    }>;
  }
): Promise<{
  ok: true;
  plan: AppCampaignAudienceSplitPlan;
  summary: CampaignDraftSummary;
}> {
  return requestAppJson(session, "/app/campaigns/drafts/split-preview", {
    method: "POST",
    timeoutMs: 120000,
    body: JSON.stringify(payload),
  });
}

export async function createAppCampaignDraftSplit(
  session: AppSession,
  payload: {
    name: string;
    templateId: string;
    splitMode: AppCampaignAudienceSplitMode;
    filters?: AppCampaignAudiencePreviewFilter;
    dynamicFilter?: {
      version: 1;
      crmBusinessStatusId: string;
    } | null;
    audienceSignature: string;
    requestId: string;
    returnDestination: AppCampaignReturnDestination;
    templateVariableMappings?: Array<{
      position: string;
      source: "contact.displayName" | "lead.companyName" | "lead.city" | "fixed" | "";
      value?: string;
      fallback?: string;
    }>;
  }
): Promise<{
  ok: true;
  idempotent: boolean;
  plan: AppCampaignAudienceSplitPlan;
  campaigns: Array<CampaignItem & { campaignId: string }>;
}> {
  return requestAppJson(session, "/app/campaigns/drafts/split", {
    method: "POST",
    timeoutMs: 120000,
    body: JSON.stringify(payload),
  });
}

export async function previewAppCampaignCsv(
  session: AppSession,
  payload: {
    templateId: string;
    csvText: string;
    mapping: {
      contactColumn?: string | null;
      field1Column?: string | null;
      field2Column?: string | null;
      field3Column?: string | null;
      genericFieldColumns?: Record<string, string | null>;
      phoneColumn?: string | null;
      nameColumn?: string | null;
      crmSituationColumn?: string | null;
      variableColumns?: Record<string, string | null>;
    };
  }
): Promise<AppCampaignImportPreview> {
  return requestAppJson(session, "/app/campaigns/csv-preview", {
    method: "POST",
    timeoutMs: 120000,
    body: JSON.stringify(payload),
  });
}

export async function createAppCampaignDraftFromCsv(
  session: AppSession,
  payload: {
    name: string;
    templateId: string;
    csvText: string;
    requestId?: string;
    mapping: {
      contactColumn?: string | null;
      field1Column?: string | null;
      field2Column?: string | null;
      field3Column?: string | null;
      genericFieldColumns?: Record<string, string | null>;
      phoneColumn?: string | null;
      nameColumn?: string | null;
      crmSituationColumn?: string | null;
      variableColumns?: Record<string, string | null>;
    };
    returnDestination: AppCampaignReturnDestination;
  }
): Promise<{
  ok: true;
  campaign?: CampaignItem & { campaignId: string };
  grouped?: boolean;
  batchId?: string;
  campaigns?: Array<CampaignItem & { campaignId: string }>;
  draft: {
    summary: AppCampaignImportSummary;
    recipients: AppCampaignImportPreview["recipients"];
    report?: AppCampaignImportReport;
  };
  csv: {
    headers: string[];
    delimiter: string;
  };
}> {
  return requestAppJson(session, "/app/campaigns/drafts/csv", {
    method: "POST",
    timeoutMs: 120000,
    body: JSON.stringify(payload),
  });
}

export async function sendAppCampaignDraft(
  session: AppSession,
  campaignId: string
): Promise<{
  ok: true;
  campaign: CampaignItem & { campaignId: string; campaignRunId: string | null };
  send: {
    summary: CampaignDraftSummary;
  };
}> {
  return requestAppJson(session, `/app/campaigns/${encodeURIComponent(campaignId)}/send`, {
    method: "POST",
  });
}

export async function scheduleAppCampaignDraft(
  session: AppSession,
  campaignId: string,
  scheduledAt: string
): Promise<{
  ok: true;
  campaign: CampaignItem;
  schedule: {
    summary: CampaignDraftSummary;
  };
}> {
  return requestAppJson(session, `/app/campaigns/${encodeURIComponent(campaignId)}/schedule`, {
    method: "POST",
    body: JSON.stringify({ scheduledAt }),
  });
}

export async function pauseAppCampaign(
  session: AppSession,
  campaignId: string
): Promise<{ ok: true; campaign: CampaignItem }> {
  return requestAppJson(session, `/app/campaigns/${encodeURIComponent(campaignId)}/pause`, {
    method: "POST",
  });
}

export async function resumeAppCampaign(
  session: AppSession,
  campaignId: string
): Promise<{ ok: true; campaign: CampaignItem & { campaignRunId: string | null } }> {
  return requestAppJson(session, `/app/campaigns/${encodeURIComponent(campaignId)}/resume`, {
    method: "POST",
  });
}

export async function sendAppCampaignTest(
  session: AppSession,
  campaignId: string,
  waId: string,
  variables?: Record<string, string>
): Promise<{ ok: true; messageId: string }> {
  return requestAppJson(session, `/app/campaigns/${encodeURIComponent(campaignId)}/test-send`, {
    method: "POST",
    body: JSON.stringify({ waId, variables: variables ?? {} }),
  });
}

export async function discardAppCampaignDraft(
  session: AppSession,
  campaignId: string
): Promise<{ ok: true; campaign: CampaignItem }> {
  return requestAppJson(session, `/app/campaigns/${encodeURIComponent(campaignId)}/discard`, {
    method: "POST",
  });
}

export async function cancelAppCampaign(
  session: AppSession,
  campaignId: string
): Promise<{ ok: true; campaign: CampaignItem }> {
  return requestAppJson(session, `/app/campaigns/${encodeURIComponent(campaignId)}/cancel`, {
    method: "POST",
  });
}

export async function pauseAppCampaignBatch(
  session: AppSession,
  batchId: string
): Promise<{ ok: true; batchId: string }> {
  return requestAppJson(session, `/app/campaign-batches/${encodeURIComponent(batchId)}/pause`, {
    method: "POST",
  });
}

export async function resumeAppCampaignBatch(
  session: AppSession,
  batchId: string
): Promise<{ ok: true; batchId: string }> {
  return requestAppJson(session, `/app/campaign-batches/${encodeURIComponent(batchId)}/resume`, {
    method: "POST",
  });
}

export async function cancelAppCampaignBatch(
  session: AppSession,
  batchId: string
): Promise<{ ok: true; batchId: string }> {
  return requestAppJson(session, `/app/campaign-batches/${encodeURIComponent(batchId)}/cancel`, {
    method: "POST",
  });
}

export async function listAppTemplates(
  session: AppSession
): Promise<{ ok: true; count: number; items: AppTemplateItem[]; templateCategoryPolicy?: AppTemplateCategoryPolicy }> {
  return requestAppJson(session, "/app/templates");
}

export async function listAppCannedReplies(
  session: AppSession,
  options?: { includeInactive?: boolean }
): Promise<AppCannedRepliesResponse> {
  const params = new URLSearchParams();
  if (options?.includeInactive) params.set("includeInactive", "true");
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestAppJson(session, `/app/canned-replies${suffix}`);
}

export async function createAppCannedReply(
  session: AppSession,
  payload: { title: string; body: string; category?: string }
): Promise<{ ok: true; item: AppCannedReplyItem }> {
  return requestAppJson(session, "/app/canned-replies", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAppCannedReply(
  session: AppSession,
  replyId: string,
  payload: { title?: string; body?: string; category?: string }
): Promise<{ ok: true; item: AppCannedReplyItem }> {
  return requestAppJson(session, `/app/canned-replies/${encodeURIComponent(replyId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function disableAppCannedReply(
  session: AppSession,
  replyId: string
): Promise<{ ok: true; item: AppCannedReplyItem }> {
  return requestAppJson(session, `/app/canned-replies/${encodeURIComponent(replyId)}/disable`, {
    method: "POST",
  });
}

export async function enableAppCannedReply(
  session: AppSession,
  replyId: string
): Promise<{ ok: true; item: AppCannedReplyItem }> {
  return requestAppJson(session, `/app/canned-replies/${encodeURIComponent(replyId)}/enable`, {
    method: "POST",
  });
}

export async function listAppTemplateRequests(
  session: AppSession
): Promise<{ ok: true; count: number; items: AppTemplateRequestItem[] }> {
  return requestAppJson(session, "/app/templates/requests");
}

export async function createAppTemplateRequest(
  session: AppSession,
  payload: {
    name: string;
    content: string;
    variableDetails?: Array<{ key: string; description: string; example: string }>;
    category: string;
    language: string;
  }
): Promise<{
  ok: true;
  request: AppTemplateRequestItem;
  notification?: { attempted: boolean; delivered: boolean; reason?: string };
  warnings?: string[];
}> {
  return requestAppJson(session, "/app/templates/request", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: 25000,
  });
}

export async function cancelAppTemplateRequest(
  session: AppSession,
  requestId: string
): Promise<{ ok: true; request: AppTemplateRequestItem }> {
  return requestAppJson(session, `/app/templates/requests/${encodeURIComponent(requestId)}/cancel`, {
    method: "POST",
    timeoutMs: 15000,
  });
}

export async function syncAppTemplate(
  session: AppSession,
  templateId: string
): Promise<{
  ok: true;
  template: Pick<
    AppTemplateItem,
    "id" | "name" | "category" | "submittedCategory" | "wasRecategorized" | "status" | "rejectionReason" | "updatedAt"
  >;
}> {
  return requestAppJson(session, `/app/templates/${encodeURIComponent(templateId)}/sync`, {
    method: "POST",
  });
}

export async function disableAppTemplate(
  session: AppSession,
  templateId: string
): Promise<{ ok: true; template: AppTemplateItem }> {
  return requestAppJson(session, `/app/templates/${encodeURIComponent(templateId)}/disable`, {
    method: "POST",
    timeoutMs: 15000,
  });
}

export async function enableAppTemplate(
  session: AppSession,
  templateId: string
): Promise<{ ok: true; template: AppTemplateItem }> {
  return requestAppJson(session, `/app/templates/${encodeURIComponent(templateId)}/enable`, {
    method: "POST",
    timeoutMs: 15000,
  });
}

export async function syncAppTemplates(
  session: AppSession
): Promise<{
  ok: true;
  summary: {
    checked: number;
    updated: number;
    approved: number;
    pending: number;
    rejected: number;
    failed: number;
    lastSyncedAt: string | null;
  };
}> {
  return requestAppJson(session, "/app/templates/sync", {
    method: "POST",
    timeoutMs: 30000,
  });
}

export async function scheduleAppCampaignBatch(session: AppSession, batchId: string, scheduledAt: string): Promise<{ ok: true; batchId: string }> {
  return requestAppJson(session, `/app/campaign-batches/${encodeURIComponent(batchId)}/schedule`, {
    method: "POST", body: JSON.stringify({ scheduledAt }),
  });
}

export async function sendAppCampaignBatch(session: AppSession, batchId: string): Promise<{ ok: true; batchId: string }> {
  return requestAppJson(session, `/app/campaign-batches/${encodeURIComponent(batchId)}/send`, {
    method: "POST", body: JSON.stringify({}),
  });
}

export type OwnClosedConversationsSettings = { ok: true; allowAgentOwnClosedConversations: boolean; permissions: { canUpdate: boolean } };
export function fetchOwnClosedConversationsSettings(session: AppSession): Promise<OwnClosedConversationsSettings> {
  return requestAppJson(session, "/app/settings/inbox/closed-conversations");
}
export function updateOwnClosedConversationsSettings(session: AppSession, enabled: boolean): Promise<OwnClosedConversationsSettings> {
  return requestAppJson(session, "/app/settings/inbox/closed-conversations", { method: "PUT", body: JSON.stringify({ allowAgentOwnClosedConversations: enabled }) });
}

export type AutomationConversationsSettings = { ok: true; allowAutomationConversationsInInbox: boolean; permissions: { canUpdate: boolean } };
export function fetchAutomationConversationsSettings(session: AppSession): Promise<AutomationConversationsSettings> {
  return requestAppJson(session, "/app/settings/inbox/automation-conversations");
}
export function updateAutomationConversationsSettings(session: AppSession, enabled: boolean): Promise<AutomationConversationsSettings> {
  return requestAppJson(session, "/app/settings/inbox/automation-conversations", { method: "PUT", body: JSON.stringify({ allowAutomationConversationsInInbox: enabled }) });
}
