import type {
  AdminUserItem,
  CampaignItem,
  InboxConversationItem,
  InboxMessageItem,
  LeadNoteItem,
  LeadStatus,
} from "@/lib/whatsappAdminApi";

export type AppSessionUser = {
  id: string;
  name: string;
  email: string;
  clientId: string;
};

export type AppSession = {
  baseUrl: string;
  token: string;
  user: AppSessionUser;
};

export type AppApiError = Error & {
  status?: number;
  errorCode?: string;
  details?: string;
  payload?: unknown;
};

export type AppTemplateItem = {
  id: string;
  name: string;
  category: string;
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

function parseStoredSession(raw: string | null): AppSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AppSession>;
    if (!parsed?.token || !parsed?.user?.id || !parsed.user.clientId || !parsed.user.email) {
      return null;
    }
    return {
      baseUrl: normalizeBaseUrl(String(parsed.baseUrl || getDefaultBaseUrl())),
      token: String(parsed.token),
      user: {
        id: String(parsed.user.id),
        name: String(parsed.user.name || ""),
        email: String(parsed.user.email),
        clientId: String(parsed.user.clientId),
      },
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
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...requestInit,
      headers: {
        "Content-Type": "application/json",
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
        error?: string;
        message?: string;
        details?: string;
      };
      payload = body;
      errorCode = typeof body.error === "string" ? body.error : undefined;
      details = typeof body.details === "string" ? body.details : undefined;
      message = body.message || body.error || message;
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

  return (await res.json()) as T;
}

export async function loginAppUser(email: string, password: string): Promise<{ ok: true; token: string; user: AppSessionUser; }> {
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
      const body = (await res.json()) as { error?: string; message?: string };
      message = body.message || body.error || message;
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

  return (await res.json()) as { ok: true; token: string; user: AppSessionUser };
}

export async function fetchAppConversations(
  session: AppSession,
  options?: { limit?: number }
): Promise<{ ok: true; count: number; items: InboxConversationItem[] }> {
  const params = new URLSearchParams();
  if (typeof options?.limit === "number" && Number.isFinite(options.limit)) {
    params.set("limit", String(options.limit));
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestAppJson(session, `/app/conversations${suffix}`);
}

export async function fetchAppConversation(
  session: AppSession,
  waId: string,
  options?: { limit?: number; order?: "asc" | "desc" }
): Promise<{
  ok: true;
  waId: string;
  waIdCanonical?: string | null;
  mode: "BOT" | "HUMAN";
  assignedUserId: string | null;
  assignedTo: string | null;
  assignedUserName: string | null;
  assignedAt: string | null;
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
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestAppJson(session, `/app/conversation/${encodeURIComponent(waId)}${suffix}`);
}

export async function sendAppConversationMessage(
  session: AppSession,
  waId: string,
  text: string
): Promise<{
  ok: true;
  waId: string;
  waIdCanonical?: string | null;
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

export async function claimAppConversation(
  session: AppSession,
  waId: string,
  userId?: string
): Promise<{
  ok: true;
  waId: string;
  waIdCanonical?: string | null;
  mode: "BOT" | "HUMAN";
  assignedUserId: string | null;
  assignedTo: string | null;
  assignedUserName: string | null;
  assignedAt: string | null;
}> {
  return requestAppJson(session, `/app/conversation/${encodeURIComponent(waId)}/claim`, {
    method: "POST",
    body: JSON.stringify(userId ? { userId } : {}),
  });
}

export async function releaseAppConversation(
  session: AppSession,
  waId: string
): Promise<{
  ok: true;
  waId: string;
  waIdCanonical?: string | null;
  mode: "BOT" | "HUMAN";
  assignedUserId: string | null;
  assignedTo: string | null;
  assignedUserName: string | null;
  assignedAt: string | null;
}> {
  return requestAppJson(session, `/app/conversation/${encodeURIComponent(waId)}/release`, {
    method: "POST",
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
  payload: { name?: string | null }
): Promise<{
  ok: true;
  lead: {
    id: string;
    name: string | null;
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
  template: Pick<AppTemplateItem, "id" | "name" | "status" | "rejectionReason" | "updatedAt">;
}> {
  return requestAppJson(session, `/app/templates/${encodeURIComponent(templateId)}/sync`, {
    method: "POST",
  });
}
