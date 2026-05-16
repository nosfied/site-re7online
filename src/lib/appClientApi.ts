import type {
  AiQualificationSchema,
  AdminDepartmentItem,
  AdminUserItem,
  CampaignItem,
  ConversationReportRange,
  ConversationReportResponse,
  ConversationOperationalStatus,
  InboxConversationItem,
  InboxMessageItem,
  LeadNoteItem,
  LeadStatus,
} from "@/lib/whatsappAdminApi";
import { getAppFeatures, getAppProfile, type AppFeatures, type AppProfile } from "@/lib/appFeatures";

export type AppSessionUser = {
  id: string;
  name: string;
  email: string;
  clientId: string;
  role: string;
  departmentId?: string | null;
  departmentName?: string | null;
};

export type AppSession = {
  baseUrl: string;
  token: string;
  user: AppSessionUser;
  features: AppFeatures;
  profile: AppProfile;
};

export type AppInboxReadState = {
  lastReadAtByConversationKey: Record<string, string>;
  manuallyUnreadByConversationKey: Record<string, boolean>;
};

export type AppApiError = Error & {
  status?: number;
  errorCode?: string;
  details?: string;
  payload?: unknown;
};

type AppConversationOperationalPayload = {
  ok: true;
  waId: string;
  waIdCanonical?: string | null;
  channel?: string | null;
  provider?: string | null;
  channelAccountId?: string | null;
  channelOutboundEnabled?: boolean;
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
  isUnassigned: boolean;
  flowContext?: Record<string, string | number | boolean | null>;
  flowTags?: string[];
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
  category: string;
  submittedCategory: string | null;
  wasRecategorized: boolean;
  language: string;
  status: string;
  content: string;
  variables: unknown;
  metaTemplateId: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppTemplateRequestItem = {
  id: string;
  name: string;
  content: string;
  variables: unknown;
  category: string;
  status: string;
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

export type AppTenantSummary = {
  id: string;
  name: string;
  phoneNumberId: string | null;
  phoneDisplay: string | null;
  features: AppFeatures;
  profile: AppProfile;
};

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

function decodeClientAuthToken(token: string): Partial<AppSessionUser> {
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
      departmentId?: string | null;
      departmentName?: string | null;
    }>;
    return {
      id: typeof parsed.sub === "string" ? parsed.sub : undefined,
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      email: typeof parsed.email === "string" ? parsed.email : undefined,
      clientId: typeof parsed.clientId === "string" ? parsed.clientId : undefined,
      role: typeof parsed.role === "string" ? parsed.role : undefined,
      departmentId: typeof parsed.departmentId === "string" ? parsed.departmentId : undefined,
      departmentName: typeof parsed.departmentName === "string" ? parsed.departmentName : undefined,
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
    };
    if (!token || !resolvedUser.id || !resolvedUser.clientId || !resolvedUser.email) {
      return null;
    }
    return {
      baseUrl: normalizeBaseUrl(String(parsed.baseUrl || getDefaultBaseUrl())),
      token,
      user: resolvedUser,
      features: getAppFeatures(parsed as Partial<AppSession>),
      profile: getAppProfile(parsed as Partial<AppSession>),
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
  localStorage.setItem(LOCAL_KEY, payload);
}

export function clearAppSession() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LOCAL_KEY);
}

async function requestAppJson<T>(
  session: AppSession,
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const baseUrl = normalizeBaseUrl(session.baseUrl || getDefaultBaseUrl()) || getDefaultBaseUrl();
  const token = session.token.trim();
  if (!token) {
    const error = new Error("Sessao invalida. Faca login novamente.") as AppApiError;
    error.status = 401;
    throw error;
  }

  const controller = new AbortController();
  const timeoutMs = typeof init?.timeoutMs === "number" ? init.timeoutMs : 10000;
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  const { timeoutMs: _timeoutMs, ...requestInit } = init ?? {};
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
    } catch {
      // noop
    }
    const error = new Error(message) as AppApiError;
    error.status = res.status;
    error.errorCode = errorCode;
    error.details = details;
    error.payload = payload;
    if (res.status === 401) error.message = "Sessao expirada. Faca login novamente.";
    if (res.status === 403) error.message = "Sem permissao (403).";
    if (errorCode === "feature_disabled" || errorCode === "feature_not_enabled") {
      error.message = "Este modulo nao esta disponivel para este perfil.";
    }
    if (errorCode === "window_closed") {
      error.message =
        "Janela possivelmente fechada. Envie primeiro um template aprovado pela Meta para reabrir a conversa.";
      error.details =
        details ||
        "A conversa esta fora da janela de 24 horas para texto livre. Use um template aprovado e, apos a resposta do cliente, retome o atendimento manual.";
    }
    if (res.status >= 500 && !errorCode && !details) {
      error.message = "Erro no servidor (5xx).";
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
  const baseUrl = normalizeBaseUrl(session.baseUrl || getDefaultBaseUrl()) || getDefaultBaseUrl();
  const token = session.token.trim();
  if (!token) {
    const error = new Error("Sessao invalida. Faca login novamente.") as AppApiError;
    error.status = 401;
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
        message = "Este modulo nao esta disponivel para este perfil.";
      }
    } catch {
      // noop
    }
    const error = new Error(message) as AppApiError;
    error.status = res.status;
    error.errorCode = errorCode;
    error.details = details;
    error.payload = payload;
    if (res.status === 401) error.message = "Sessao expirada. Faca login novamente.";
    if (res.status === 403) error.message = "Sem permissao (403).";
    if (res.status >= 500 && !errorCode && !details) {
      error.message = "Erro no servidor (5xx).";
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
  const baseUrl = normalizeBaseUrl(session.baseUrl || getDefaultBaseUrl()) || getDefaultBaseUrl();
  const token = session.token.trim();
  if (!token) {
    const error = new Error("Sessao invalida. Faca login novamente.") as AppApiError;
    error.status = 401;
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
    try {
      const body = (await res.json()) as { error?: string | { message?: string }; message?: string };
      message =
        (typeof body.message === "string" && body.message.trim()) ||
        (body.error && typeof body.error === "object" && typeof body.error.message === "string"
          ? body.error.message
          : "") ||
        (typeof body.error === "string" ? body.error : "") ||
        message;
      if (body.error === "feature_disabled" || body.error === "feature_not_enabled") {
        message = "Este modulo nao esta disponivel para este perfil.";
      }
    } catch {
      // noop
    }
    const error = new Error(message) as AppApiError;
    error.status = res.status;
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
): Promise<{ ok: true; token: string; user: AppSessionUser; features: AppFeatures; profile: AppProfile }> {
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
    if (res.status === 401) error.message = "Email ou senha invalidos.";
    if (res.status === 409) error.message = "Email ambiguo entre clientes.";
    if (res.status >= 500) error.message = "Erro no servidor (5xx).";
    throw error;
  }

  const payload = (await res.json()) as {
    ok: true;
    token: string;
    user: AppSessionUser;
    features?: Partial<AppFeatures> | null;
    profile?: AppProfile | null;
  };
  const tokenUser = decodeClientAuthToken(payload.token);
  return {
    ...payload,
    features: getAppFeatures({ features: payload.features ?? undefined }),
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

export async function fetchAppConversations(
  session: AppSession,
  options?: {
    limit?: number;
    cursor?: string | null;
    status?: string | null;
    departmentId?: string | null;
    assignedUserId?: string | null;
    unassigned?: boolean;
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
  options?: { limit?: number; order?: "asc" | "desc"; after?: string | null }
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
  return requestAppJson(session, `/app/conversation/${encodeURIComponent(waId)}${suffix}`);
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

export async function sendAppConversationMessage(
  session: AppSession,
  waId: string,
  text: string
): Promise<AppConversationOperationalPayload & {
  message: {
    messageId: string;
    status: string;
    metaMessageId: string | null;
    createdAt: string;
  };
}> {
  return requestAppJson(session, `/app/conversation/${encodeURIComponent(waId)}/send`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function sendAppConversationMedia(
  session: AppSession,
  waId: string,
  file: File,
  caption?: string
): Promise<AppConversationOperationalPayload & {
  message: {
    messageId: string;
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
  };
}> {
  const formData = new FormData();
  formData.append("file", file);
  if (caption?.trim()) {
    formData.append("caption", caption.trim());
  }
  return requestAppJson(session, `/app/conversation/${encodeURIComponent(waId)}/send-media`, {
    method: "POST",
    body: formData,
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
  session: AppSession
): Promise<{
  ok: true;
  count: number;
  items: AdminUserItem[];
}> {
  return requestAppJson(session, "/app/users");
}

export async function createAppUser(
  session: AppSession,
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

export async function fetchAppDepartments(
  session: AppSession,
  options?: { includeInactive?: boolean }
): Promise<{
  ok: true;
  count: number;
  items: AdminDepartmentItem[];
}> {
  const params = new URLSearchParams();
  if (options?.includeInactive) {
    params.set("includeInactive", "true");
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestAppJson(session, `/app/departments${suffix}`);
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

export async function fetchAppConversationReport(
  session: AppSession,
  params: {
    range: ConversationReportRange;
    userId?: string | null;
    departmentId?: string | null;
  }
): Promise<ConversationReportResponse> {
  const query = new URLSearchParams({
    range: params.range,
  });
  if (params.userId) query.set("userId", params.userId);
  if (params.departmentId) query.set("departmentId", params.departmentId);
  return requestAppJson(session, `/app/reports/conversations?${query.toString()}`);
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

export async function exportAppConversationReportCsv(
  session: AppSession,
  params: {
    range: ConversationReportRange;
    userId?: string | null;
    departmentId?: string | null;
  }
) {
  const query = new URLSearchParams({
    range: params.range,
  });
  if (params.userId) query.set("userId", params.userId);
  if (params.departmentId) query.set("departmentId", params.departmentId);
  return requestAppText(session, `/app/reports/conversations/export?${query.toString()}`);
}

export async function createAppDepartment(
  session: AppSession,
  payload: {
    name: string;
    isActive?: boolean;
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

export async function fetchAppCrmSettings(session: AppSession): Promise<AppCrmSettingsResponse> {
  return requestAppJson(session, "/app/crm/settings");
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

export function logAppInboxEvent(
  session: AppSession,
  event: "inbox.priority.rendered" | "inbox.sorted" | "inbox.suggestion.used",
  payload: Record<string, unknown>
) {
  return requestAppJson<{ ok: true }>(session, "/app/inbox/events", {
    method: "POST",
    body: JSON.stringify({ event, payload }),
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

export async function createAppCampaign(
  session: AppSession,
  payload: {
    name: string;
    templateId?: string;
    templateName: string;
    recipients: string[];
    templateParams?: string[];
  }
): Promise<{ ok: true; campaign: CampaignItem & { campaignId: string; campaignRunId: string } }> {
  return requestAppJson(session, "/app/campaigns", {
    method: "POST",
    body: JSON.stringify(payload),
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

export async function listAppTemplates(
  session: AppSession
): Promise<{ ok: true; count: number; items: AppTemplateItem[] }> {
  return requestAppJson(session, "/app/templates");
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
    variables?: unknown;
    category: string;
    autoSubmit?: boolean;
  }
): Promise<{
  ok: true;
  request: AppTemplateRequestItem;
  submission?: {
    attempted: boolean;
    submitted: boolean;
    mode: "assisted" | "self_service";
    templateId: string | null;
    status: string | null;
    errorMessage: string | null;
  };
}> {
  return requestAppJson(session, "/app/templates/request", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: 25000,
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
