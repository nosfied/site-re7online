const DEFAULT_META_EMBEDDED_SIGNUP_APP_ID = "2074361376674006";
const DEFAULT_META_EMBEDDED_SIGNUP_CONFIG_ID = "1543311723765403";
const META_SDK_VERSION = "v19.0";
const CONFIG_ID_STORAGE_KEY = "meta_embedded_signup_config_id_override";
const META_EMBEDDED_SIGNUP_REDACTED_VALUE = "[REDACTED]";
export const META_EMBEDDED_SIGNUP_COEXISTENCE_FEATURE_TYPE =
  "whatsapp_business_app_onboarding";

export const META_EMBEDDED_SIGNUP_APP_ID =
  process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_APP_ID?.trim() ||
  DEFAULT_META_EMBEDDED_SIGNUP_APP_ID;

export const META_EMBEDDED_SIGNUP_CONFIG_ID =
  process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID?.trim() ||
  DEFAULT_META_EMBEDDED_SIGNUP_CONFIG_ID;

declare global {
  interface Window {
    FB?: {
      init: (params: Record<string, unknown>) => void;
      login: (
        callback: (response: unknown) => void,
        options?: Record<string, unknown>
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

export type EmbeddedSignupCaptureEntry = {
  timestamp: string;
  source:
    | "query"
    | "fb.postMessage"
    | "fb.callback"
    | "window.focus"
    | "window.blur"
    | "popup.closed";
  raw: unknown;
  parsed: unknown;
  origin?: string;
};

export type EmbeddedSignupQueryState = {
  href: string;
  search: string;
  code: string;
  state: string;
  error: string;
};

export type EmbeddedSignupCapturedData = {
  code: string;
  wabaId: string;
  phoneNumberId: string;
  businessId: string;
  businessPortfolioId: string;
  raw: unknown;
};

export type MetaEmbeddedSignupMode = "standard" | "coexistence";

export type EmbeddedSignupSessionStatus = "FINISH" | "CANCEL" | "ERROR";

export type MetaEmbeddedSignupAuditEventName =
  | "meta.embedded_signup.started"
  | "meta.embedded_signup.callback"
  | "meta.embedded_signup.session_event"
  | "meta.embedded_signup.completed"
  | "meta.embedded_signup.cancelled"
  | "meta.embedded_signup.error";

export type MetaEmbeddedSignupAuditPayload = {
  eventName: MetaEmbeddedSignupAuditEventName;
  correlationId: string;
  mode: MetaEmbeddedSignupMode;
  configIdRef: string | null;
  timestamp: string;
  callbackInvoked?: boolean;
  authResponsePresent?: boolean;
  codePresent?: boolean;
  status?: string | null;
  errorPresent?: boolean;
  originClassification?: "facebook" | "unknown";
  eventType?: string | null;
  flowStatus?: string | null;
  wabaIdRef?: string | null;
  phoneNumberIdRef?: string | null;
  businessIdRef?: string | null;
  businessPortfolioIdRef?: string | null;
};

export type EmbeddedSignupSessionMessage = {
  status: EmbeddedSignupSessionStatus | null;
  data: EmbeddedSignupCapturedData;
  errorMessage: string;
  raw: unknown;
};

function readRecord(input: unknown) {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

export function sanitizeMetaEmbeddedSignupDiagnosticValue(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeMetaEmbeddedSignupDiagnosticValue(item));
  }
  if (!input || typeof input !== "object") return input;

  const sensitiveKeys = new Set([
    "accesscode",
    "accesstoken",
    "access_token",
    "authcode",
    "businesstoken",
    "code",
    "signedrequest",
    "signed_request",
    "token",
  ]);
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalizedKey = key.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
    if (sensitiveKeys.has(normalizedKey) || normalizedKey.endsWith("token")) {
      next[key] = value == null || value === "" ? value : META_EMBEDDED_SIGNUP_REDACTED_VALUE;
      continue;
    }
    next[key] = sanitizeMetaEmbeddedSignupDiagnosticValue(value);
  }
  return next;
}

export function createMetaEmbeddedSignupCorrelationId() {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `mes-${random}`;
}

export function maskMetaEmbeddedSignupReference(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 8) return "***";
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export function resolveMetaEmbeddedSignupExchangeSubmission(params: {
  correlationId?: string | null;
  code?: string | null;
  submittedKey?: string | null;
}) {
  const code = params.code?.trim() ?? "";
  if (!code) return { shouldSubmit: false, key: null };
  const key = `${params.correlationId?.trim() || "no-correlation"}:${code}`;
  return {
    shouldSubmit: params.submittedKey !== key,
    key,
  };
}

function readStatus(input: unknown, sessionMessage: EmbeddedSignupSessionMessage) {
  const parsed = safeParseEventData(input);
  const typed = readRecord(parsed);
  const authResponse = readRecord(typed?.authResponse);
  return (
    sessionMessage.status ||
    readStringProperty(typed, ["status", "event", "type"]) ||
    readStringProperty(authResponse, ["status"]) ||
    null
  );
}

function hasErrorSignal(input: unknown, sessionMessage: EmbeddedSignupSessionMessage) {
  if (sessionMessage.status === "ERROR" || Boolean(sessionMessage.errorMessage)) return true;
  const parsed = safeParseEventData(input);
  const typed = readRecord(parsed);
  return Boolean(
    readStringProperty(typed, [
      "error",
      "errorMessage",
      "error_message",
      "errorDescription",
      "error_description",
    ])
  );
}

function eventNameForSessionStatus(
  status: EmbeddedSignupSessionStatus | null
): MetaEmbeddedSignupAuditEventName {
  if (status === "FINISH") return "meta.embedded_signup.completed";
  if (status === "CANCEL") return "meta.embedded_signup.cancelled";
  if (status === "ERROR") return "meta.embedded_signup.error";
  return "meta.embedded_signup.session_event";
}

export function buildMetaEmbeddedSignupStartedAuditPayload(options: {
  correlationId: string;
  mode: MetaEmbeddedSignupMode;
  configId?: string | null;
  timestamp?: string;
}): MetaEmbeddedSignupAuditPayload {
  return {
    eventName: "meta.embedded_signup.started",
    correlationId: options.correlationId,
    mode: options.mode,
    configIdRef: maskMetaEmbeddedSignupReference(options.configId),
    timestamp: options.timestamp ?? new Date().toISOString(),
  };
}

export function buildMetaEmbeddedSignupCallbackAuditPayload(options: {
  correlationId: string;
  mode: MetaEmbeddedSignupMode;
  configId?: string | null;
  response: unknown;
  timestamp?: string;
}): MetaEmbeddedSignupAuditPayload {
  const parsed = safeParseEventData(options.response);
  const typed = readRecord(parsed);
  const sessionMessage = parseEmbeddedSignupSessionMessage(parsed);
  return {
    eventName: "meta.embedded_signup.callback",
    correlationId: options.correlationId,
    mode: options.mode,
    configIdRef: maskMetaEmbeddedSignupReference(options.configId),
    timestamp: options.timestamp ?? new Date().toISOString(),
    callbackInvoked: true,
    authResponsePresent: Boolean(readRecord(typed?.authResponse)),
    codePresent: Boolean(extractMetaCodeFromUnknownPayload(parsed)),
    status: readStatus(parsed, sessionMessage),
    errorPresent: hasErrorSignal(parsed, sessionMessage),
  };
}

export function buildMetaEmbeddedSignupSessionAuditPayload(options: {
  correlationId: string;
  mode: MetaEmbeddedSignupMode;
  configId?: string | null;
  origin: string;
  message: unknown;
  timestamp?: string;
}): MetaEmbeddedSignupAuditPayload {
  const parsed = safeParseEventData(options.message);
  const typed = readRecord(parsed);
  const sessionMessage = parseEmbeddedSignupSessionMessage(parsed);
  return {
    eventName: eventNameForSessionStatus(sessionMessage.status),
    correlationId: options.correlationId,
    mode: options.mode,
    configIdRef: maskMetaEmbeddedSignupReference(options.configId),
    timestamp: options.timestamp ?? new Date().toISOString(),
    originClassification: isTrustedMetaEmbeddedSignupOrigin(options.origin) ? "facebook" : "unknown",
    eventType: readStringProperty(typed, ["type", "event"]) || null,
    flowStatus: sessionMessage.status,
    wabaIdRef: maskMetaEmbeddedSignupReference(sessionMessage.data.wabaId),
    phoneNumberIdRef: maskMetaEmbeddedSignupReference(sessionMessage.data.phoneNumberId),
    businessIdRef: maskMetaEmbeddedSignupReference(sessionMessage.data.businessId),
    businessPortfolioIdRef: maskMetaEmbeddedSignupReference(sessionMessage.data.businessPortfolioId),
    errorPresent: hasErrorSignal(parsed, sessionMessage),
  };
}

export function buildMetaEmbeddedSignupPopupClosedAuditPayload(options: {
  correlationId: string;
  mode: MetaEmbeddedSignupMode;
  configId?: string | null;
  callbackInvoked: boolean;
  sessionEventReceived: boolean;
  timestamp?: string;
}): MetaEmbeddedSignupAuditPayload {
  return {
    eventName: "meta.embedded_signup.session_event",
    correlationId: options.correlationId,
    mode: options.mode,
    configIdRef: maskMetaEmbeddedSignupReference(options.configId),
    timestamp: options.timestamp ?? new Date().toISOString(),
    callbackInvoked: options.callbackInvoked,
    eventType: "popup.closed",
    flowStatus: options.sessionEventReceived ? "POPUP_CLOSED_AFTER_SIGNAL" : "POPUP_CLOSED_WITHOUT_SIGNAL",
    errorPresent: false,
  };
}

function readCodeFromString(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const parseParams = (value: string) => {
    const params = new URLSearchParams(value.startsWith("?") ? value.slice(1) : value);
    return params.get("code")?.trim() || "";
  };

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      return url.searchParams.get("code")?.trim() || "";
    } catch {
      return "";
    }
  }

  if (trimmed.includes("code=") && (trimmed.includes("&") || trimmed.includes("=") || trimmed.startsWith("?"))) {
    return parseParams(trimmed);
  }

  return "";
}

export function safeParseEventData(input: unknown) {
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {
      return input;
    }
  }
  return input;
}

export function readEmbeddedSignupQuery(win: Window): EmbeddedSignupQueryState {
  const params = new URLSearchParams(win.location.search);
  return {
    href: win.location.href,
    search: win.location.search,
    code: params.get("code") ?? "",
    state: params.get("state") ?? "",
    error: params.get("error") ?? "",
  };
}

function collectStringCandidates(
  input: unknown,
  matchers: RegExp[],
  acc = new Set<string>(),
  depth = 0
): string[] {
  if (depth > 4 || input == null) return Array.from(acc);
  if (Array.isArray(input)) {
    for (const item of input) {
      collectStringCandidates(item, matchers, acc, depth + 1);
    }
    return Array.from(acc);
  }
  if (typeof input !== "object") return Array.from(acc);

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === "string" && matchers.some((matcher) => matcher.test(key))) {
      const trimmed = value.trim();
      if (trimmed) acc.add(trimmed);
    }
    if (value && typeof value === "object") {
      collectStringCandidates(value, matchers, acc, depth + 1);
    }
  }
  return Array.from(acc);
}

function firstCandidate(input: unknown, matchers: RegExp[]) {
  return collectStringCandidates(input, matchers)[0] ?? "";
}

function readStringProperty(input: unknown, keys: string[]) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "";
  const record = input as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readEmbeddedSignupDataNode(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const data = record.data;
  return data && typeof data === "object" && !Array.isArray(data) ? data : record;
}

function normalizeSessionStatus(value: unknown): EmbeddedSignupSessionStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "FINISH" || normalized === "CANCEL" || normalized === "ERROR") {
    return normalized;
  }
  if (normalized.startsWith("FINISH_")) return "FINISH";
  if (normalized.startsWith("CANCEL")) return "CANCEL";
  if (normalized.startsWith("ERROR")) return "ERROR";
  return null;
}

export function extractMetaCodeFromUnknownPayload(input: unknown): string | null {
  const parsed = safeParseEventData(input);

  if (typeof parsed === "string") {
    const fromString = readCodeFromString(parsed);
    return fromString || null;
  }

  const fromObject = firstCandidate(parsed, [/^code$/i]);
  return fromObject || null;
}

export function extractEmbeddedSignupData(input: unknown): EmbeddedSignupCapturedData {
  const parsed = safeParseEventData(input);
  const dataNode = readEmbeddedSignupDataNode(parsed);
  return {
    code: extractMetaCodeFromUnknownPayload(parsed) ?? "",
    wabaId:
      readStringProperty(dataNode, ["waba_id", "wabaId", "whatsapp_business_account_id"]) ||
      firstCandidate(parsed, [/^waba(_id)?$/i, /^whatsapp_?business_?account_?id$/i]),
    phoneNumberId:
      readStringProperty(dataNode, ["phone_number_id", "phoneNumberId"]) ||
      firstCandidate(parsed, [/^phone_?number_?id$/i, /^phoneNumberId$/i]),
    businessId:
      readStringProperty(dataNode, ["business_id", "businessId"]) ||
      firstCandidate(parsed, [/^business_?id$/i, /^businessId$/i]),
    businessPortfolioId: firstCandidate(parsed, [
      /^business_?portfolio_?id$/i,
      /^businessPortfolioId$/i,
    ]),
    raw: parsed,
  };
}

export function parseEmbeddedSignupSessionMessage(input: unknown): EmbeddedSignupSessionMessage {
  const parsed = safeParseEventData(input);
  const typed =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  const dataNode = readEmbeddedSignupDataNode(parsed);
  const status =
    normalizeSessionStatus(typed?.event) ||
    normalizeSessionStatus(typed?.status) ||
    normalizeSessionStatus(readStringProperty(dataNode, ["event", "status"]));
  const errorMessage =
    readStringProperty(dataNode, ["error_message", "errorMessage", "message"]) ||
    readStringProperty(typed, ["error_message", "errorMessage", "message"]);

  return {
    status,
    data: extractEmbeddedSignupData(parsed),
    errorMessage,
    raw: parsed,
  };
}

export function isTrustedMetaEmbeddedSignupOrigin(origin: string) {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === "facebook.com" || hostname.endsWith(".facebook.com");
  } catch {
    return false;
  }
}

export async function loadMetaEmbeddedSignupSdk(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.FB) return;

  const scriptId = "facebook-jssdk";
  const existingScript = document.getElementById(scriptId);

  await new Promise<void>((resolve, reject) => {
    window.fbAsyncInit = function () {
      try {
        window.FB?.init({
          appId: META_EMBEDDED_SIGNUP_APP_ID,
          cookie: true,
          xfbml: false,
          version: META_SDK_VERSION,
        });
        resolve();
      } catch (error) {
        reject(error);
      }
    };

    if (existingScript) {
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = () => reject(new Error("Falha ao carregar Facebook SDK."));
    document.body.appendChild(script);
  });
}

export function getRuntimeMetaEmbeddedSignupConfigId(win: Window = window) {
  try {
    const fromQuery = new URLSearchParams(win.location.search)
      .get("metaConfigId")
      ?.trim();
    if (fromQuery) {
      win.localStorage.setItem(CONFIG_ID_STORAGE_KEY, fromQuery);
      return fromQuery;
    }
    return win.localStorage.getItem(CONFIG_ID_STORAGE_KEY)?.trim() || META_EMBEDDED_SIGNUP_CONFIG_ID;
  } catch {
    return META_EMBEDDED_SIGNUP_CONFIG_ID;
  }
}

export function saveRuntimeMetaEmbeddedSignupConfigId(configId: string, win: Window = window) {
  const normalized = configId.trim();
  if (!normalized) return META_EMBEDDED_SIGNUP_CONFIG_ID;
  try {
    win.localStorage.setItem(CONFIG_ID_STORAGE_KEY, normalized);
  } catch {
    // Storage can be unavailable in restricted browser modes; the caller can still pass the value directly.
  }
  return normalized;
}

export function buildMetaEmbeddedSignupOAuthUrl(options: {
  configId?: string | null;
  redirectUri: string;
  state?: string | null;
}) {
  const configId = options.configId?.trim() || META_EMBEDDED_SIGNUP_CONFIG_ID;
  const redirectUri = options.redirectUri.trim();
  if (!configId) {
    throw new Error("Config ID do Embedded Signup não configurado.");
  }
  if (!redirectUri) {
    throw new Error("Redirect URI do Embedded Signup não configurado.");
  }

  const url = new URL(`https://www.facebook.com/${META_SDK_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", META_EMBEDDED_SIGNUP_APP_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("config_id", configId);
  url.searchParams.set("override_default_response_type", "true");
  if (options.state?.trim()) {
    url.searchParams.set("state", options.state.trim());
  }
  return url.toString();
}

export function buildMetaEmbeddedSignupLoginOptions(options: {
  configId?: string | null;
  mode?: MetaEmbeddedSignupMode;
}) {
  const configId = options.configId?.trim() || META_EMBEDDED_SIGNUP_CONFIG_ID;
  if (!configId) {
    throw new Error("Config ID do Embedded Signup não configurado.");
  }

  const loginOptions: Record<string, unknown> = {
    config_id: configId,
    response_type: "code",
    override_default_response_type: true,
    extras: {
      setup: {},
    },
  };

  if (options.mode === "coexistence") {
    loginOptions.extras = {
      setup: {},
      featureType: META_EMBEDDED_SIGNUP_COEXISTENCE_FEATURE_TYPE,
    };
  }

  return loginOptions;
}

export async function startMetaEmbeddedSignup(options?: {
  configId?: string | null;
  mode?: MetaEmbeddedSignupMode;
}): Promise<unknown> {
  if (!window.FB) {
    throw new Error("Facebook SDK ainda não carregou.");
  }

  const configId = options?.configId?.trim() || getRuntimeMetaEmbeddedSignupConfigId();

  return new Promise((resolve) => {
    window.FB?.login(
      (response) => resolve(response),
      buildMetaEmbeddedSignupLoginOptions({
        configId,
        mode: options?.mode ?? "standard",
      })
    );
  });
}
