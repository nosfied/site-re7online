const DEFAULT_META_EMBEDDED_SIGNUP_APP_ID = "2074361376674006";
const DEFAULT_META_EMBEDDED_SIGNUP_CONFIG_ID = "1261464002116286";
const META_SDK_VERSION = "v19.0";
const CONFIG_ID_STORAGE_KEY = "meta_embedded_signup_config_id_override";

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
  return {
    code: extractMetaCodeFromUnknownPayload(input) ?? "",
    wabaId: firstCandidate(input, [/^waba(_id)?$/i, /^whatsapp_?business_?account_?id$/i]),
    phoneNumberId: firstCandidate(input, [/^phone_?number_?id$/i, /^phoneNumberId$/i]),
    businessId: firstCandidate(input, [/^business_?id$/i, /^businessId$/i]),
    businessPortfolioId: firstCandidate(input, [
      /^business_?portfolio_?id$/i,
      /^businessPortfolioId$/i,
    ]),
    raw: input,
  };
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
    throw new Error("Config ID do Embedded Signup nao configurado.");
  }
  if (!redirectUri) {
    throw new Error("Redirect URI do Embedded Signup nao configurado.");
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

export async function startMetaEmbeddedSignup(options?: { configId?: string | null }): Promise<unknown> {
  if (!window.FB) {
    throw new Error("Facebook SDK ainda nao carregou.");
  }

  const configId = options?.configId?.trim() || getRuntimeMetaEmbeddedSignupConfigId();
  if (!configId) {
    throw new Error("Config ID do Embedded Signup nao configurado.");
  }

  return new Promise((resolve) => {
    window.FB?.login(
      (response) => resolve(response),
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
        },
      }
    );
  });
}
