export const META_EMBEDDED_SIGNUP_APP_ID = "2074361376674006";
export const META_EMBEDDED_SIGNUP_CONFIG_ID = "1261464002116286";
const META_SDK_VERSION = "v19.0";

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

export function extractEmbeddedSignupData(input: unknown): EmbeddedSignupCapturedData {
  return {
    code: firstCandidate(input, [/^code$/i]),
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

export async function startMetaEmbeddedSignup(): Promise<unknown> {
  if (!window.FB) {
    throw new Error("Facebook SDK ainda nao carregou.");
  }

  return new Promise((resolve) => {
    window.FB?.login(
      (response) => resolve(response),
      {
        config_id: META_EMBEDDED_SIGNUP_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
        },
      }
    );
  });
}
