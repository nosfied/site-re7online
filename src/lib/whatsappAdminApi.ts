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
  direction: "INBOUND" | "OUTBOUND";
  type: string;
  status: string;
  intent: string | null;
  bodyText: string | null;
  templateName: string | null;
  templateLang: string | null;
  requestId: string | null;
  messageId: string | null;
  metaMessageId: string | null;
  errorBody: string | null;
  createdAt: string;
};

export type InboxConversationItem = {
  waId: string;
  lastMessage: {
    direction: "INBOUND" | "OUTBOUND";
    type: string;
    status: string;
    bodyText: string | null;
    templateName: string | null;
    createdAt: string;
  } | null;
  leadId: string | null;
  leadStatus: string | null;
  leadName: string | null;
  leadPhone: string | null;
  leadCity: string | null;
  leadService: string | null;
  updatedAt: string;
};

export type LeadStatus =
  | "NEW"
  | "QUALIFIED"
  | "WAITING_ATTENDANT"
  | "IN_ATTENDANCE"
  | "CLOSED";

export type LeadNoteItem = {
  id: string;
  leadId: string;
  tenantId: string;
  body: string;
  createdAt: string;
};

export type TenantConfigResponse = {
  ok: boolean;
  tenantId: string;
  tenant: {
    id: string;
    name: string;
    metaPhoneNumberId: string;
    allowlist: string[];
    handoffAttendantWaid: string;
    defaultLanguage: string;
    templates: {
      manualHandoff: string;
    };
    quotaMonthlyConversations?: number;
    quotaWarnAtPct?: number;
    quotaBlockedReplyText?: string;
    quotaExcludeWaIds?: string[];
  };
};

export type AdminConnection = {
  baseUrl: string;
  adminToken: string;
  rememberToken: boolean;
};

export type AdminApiError = Error & { status?: number };

const STORAGE_KEY = "wa_admin_connection_v1";
const SESSION_TOKEN_KEY = "wa_admin_token_session_v1";
const LOCAL_TOKEN_KEY = "wa_admin_token_local_v1";

function getDefaultBaseUrl() {
  return process.env.NEXT_PUBLIC_WHATSAPP_AGENT_BASE_URL || "http://127.0.0.1:3001";
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

    return {
      baseUrl: normalizeBaseUrl(String(parsed?.baseUrl || getDefaultBaseUrl())),
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
      const body = (await res.json()) as { error?: string; message?: string };
      message = body.message || body.error || message;
    } catch {
      // noop
    }
    const error = new Error(message) as AdminApiError;
    error.status = res.status;
    if (res.status === 401) error.message = "Token invalido (401).";
    if (res.status === 403) error.message = "Sem permissao (403).";
    if (res.status >= 500) error.message = "Erro no servidor (5xx).";
    throw error;
  }

  return (await res.json()) as T;
}

export async function testAdminConnection(connection: AdminConnection) {
  return requestJson<{ ok: boolean }>(connection, "/admin/health");
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

export async function fetchConversations(
  connection: AdminConnection,
  clientKey: string,
  options?: { limit?: number }
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
