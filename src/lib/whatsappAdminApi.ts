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
  waIdCanonical?: string | null;
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
  isActive?: boolean;
  createdAt: string;
};

export type AdminDepartmentItem = {
  id: string;
  name: string;
  slug?: string;
  isActive: boolean;
  createdAt: string;
};

export type AdminClientItem = {
  id: string;
  name: string;
  clientKey: string;
  createdAt: string;
  updatedAt: string;
  phoneNumbers?: Array<{
    id?: string;
    phoneNumberId: string;
    display?: string;
  }>;
};

export type ConversationReportRange = "1d" | "7d" | "30d";

export type ConversationReportByAgentItem = {
  userId: string;
  conversations: number;
  avgResponseTimeSec: number | null;
};

export type ConversationReportByDepartmentItem = {
  departmentId: string | null;
  departmentName: string | null;
  conversations: number;
  avgResponseTimeSec: number | null;
};

export type ConversationReportResponse = {
  ok: true;
  range: ConversationReportRange;
  userId: string | null;
  departmentId: string | null;
  totalConversations: number;
  avgFirstResponseTimeSec: number | null;
  avgResolutionTimeSec: number | null;
  slaBreaches: number;
  byAgent: ConversationReportByAgentItem[];
  byDepartment: ConversationReportByDepartmentItem[];
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
    pricingCategory: string | null;
    pricingBillable: boolean | null;
    pricingModel: string | null;
    conversationId: string | null;
    error: string | null;
  }>;
  draftSeed?: {
    name: string;
    templateName: string;
    recipients: string[];
    templateParams: string[];
  };
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
  category: string;
  status: string;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type TenantOnboardingExchangePayload = {
  code: string;
  embeddedSignup?: {
    businessId?: string | null;
    businessPortfolioId?: string | null;
    wabaId?: string | null;
    phoneNumberId?: string | null;
    raw?: unknown;
  };
};

export type TenantConfigResponse = {
  ok: boolean;
  tenantId: string;
  client?: {
    id: string;
    clientKey: string;
    status: string;
  } | null;
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
    if (res.status === 401) error.message = "Token invalido (401).";
    if (res.status === 403) error.message = "Sem permissao (403).";
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
    if (res.status === 401) error.message = "Token invalido (401).";
    if (res.status === 403) error.message = "Sem permissao (403).";
    if (res.status >= 500) error.message = "Erro no servidor (5xx).";
    throw error;
  }

  return res.text();
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
      ...(payload.initialUser ? { initialUser: payload.initialUser } : {}),
    }),
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
  payload: { name: string }
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
  payload: { name?: string; isActive?: boolean }
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

export async function fetchAdminTemplateRequests(
  connection: AdminConnection
): Promise<{
  ok: true;
  count: number;
  items: AdminTemplateRequestItem[];
}> {
  return requestJson(connection, "/admin/templates/requests");
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
  requestId: string
): Promise<{ ok: true }> {
  return requestJson(connection, `/admin/templates/requests/${encodeURIComponent(requestId)}/reject`, {
    method: "POST",
    body: JSON.stringify({}),
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
