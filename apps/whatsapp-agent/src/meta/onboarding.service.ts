import { env } from "../config/env.js";

const META_EMBEDDED_SIGNUP_APP_ID =
  process.env.META_EMBEDDED_SIGNUP_APP_ID?.trim() || "2074361376674006";

type ExchangeCodeParams = {
  code: string;
  redirectUri?: string | null;
};

type ExchangeResponse = {
  access_token?: string;
  token_type?: string;
  [key: string]: unknown;
};

export type MetaOnboardingExchangeResult = {
  rawPayload: ExchangeResponse;
  businessToken: string | null;
  tokenType: string | null;
  businessId: string | null;
  businessPortfolioId: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
};

type MetaGraphPayload = Record<string, unknown>;

type EnrichOnboardingParams = {
  businessToken: string | null;
  businessId?: string | null;
  businessPortfolioId?: string | null;
  wabaId?: string | null;
  phoneNumberId?: string | null;
};

export class MetaOnboardingExchangeError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly errorBody?: string
  ) {
    super(message);
    this.name = "MetaOnboardingExchangeError";
  }
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

function summarizeExchangePayload(payload: ExchangeResponse) {
  const businessIdCandidates = collectStringCandidates(payload, [
    /^business_?id$/i,
    /^businessId$/i,
  ]);
  const businessPortfolioCandidates = collectStringCandidates(payload, [
    /^business_?portfolio_?id$/i,
    /^businessPortfolioId$/i,
  ]);
  const wabaCandidates = collectStringCandidates(payload, [
    /^waba(_id)?$/i,
    /^whatsapp_?business_?account_?id$/i,
    /^whatsappBusinessAccountId$/i,
  ]);
  const phoneNumberCandidates = collectStringCandidates(payload, [
    /^phone_?number_?id$/i,
    /^phoneNumberId$/i,
  ]);

  return {
    businessId: businessIdCandidates[0] ?? null,
    businessPortfolioId: businessPortfolioCandidates[0] ?? null,
    wabaId: wabaCandidates[0] ?? null,
    phoneNumberId: phoneNumberCandidates[0] ?? null,
  };
}

async function fetchMetaGraphJson(params: {
  path: string;
  accessToken: string;
  query?: Record<string, string>;
}): Promise<MetaGraphPayload> {
  const query = new URLSearchParams(params.query ?? {});
  const queryString = query.toString();
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${params.path}${queryString ? `?${queryString}` : ""}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.accessToken}`,
    },
  });

  const rawText = await response.text();
  let payload: MetaGraphPayload;
  try {
    payload = JSON.parse(rawText) as MetaGraphPayload;
  } catch {
    throw new MetaOnboardingExchangeError(
      "Meta returned non-JSON payload during onboarding enrich",
      response.status,
      rawText.slice(0, 1000)
    );
  }

  if (!response.ok) {
    throw new MetaOnboardingExchangeError(
      "Meta onboarding enrich failed",
      response.status,
      JSON.stringify(payload).slice(0, 1000)
    );
  }

  return payload;
}

async function postMetaGraphJson(params: {
  path: string;
  accessToken: string;
  body: Record<string, unknown>;
}): Promise<MetaGraphPayload> {
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${params.path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify(params.body),
  });

  const rawText = await response.text();
  let payload: MetaGraphPayload;
  try {
    payload = JSON.parse(rawText) as MetaGraphPayload;
  } catch {
    throw new MetaOnboardingExchangeError(
      "Meta returned non-JSON payload during phone registration",
      response.status,
      rawText.slice(0, 1000)
    );
  }

  if (!response.ok) {
    throw new MetaOnboardingExchangeError(
      "Meta phone registration failed",
      response.status,
      JSON.stringify(payload).slice(0, 1000)
    );
  }

  return payload;
}

export async function registerMetaPhoneNumber(params: {
  phoneNumberId: string;
  accessToken: string;
  pin: string;
}): Promise<{ success: boolean; rawPayload: MetaGraphPayload }> {
  const phoneNumberId = params.phoneNumberId.trim();
  const accessToken = params.accessToken.trim();
  const pin = params.pin.trim();
  if (!phoneNumberId) {
    throw new MetaOnboardingExchangeError("Phone number id is required", 400);
  }
  if (!accessToken) {
    throw new MetaOnboardingExchangeError("Access token is required", 400);
  }
  if (!/^\d{6}$/.test(pin)) {
    throw new MetaOnboardingExchangeError("Registration PIN must have 6 digits", 400);
  }

  const payload = await postMetaGraphJson({
    path: `${encodeURIComponent(phoneNumberId)}/register`,
    accessToken,
    body: {
      messaging_product: "whatsapp",
      pin,
    },
  });

  return {
    success: payload.success === true || payload.success === "true",
    rawPayload: payload,
  };
}

export async function subscribeMetaWabaToApp(params: {
  wabaId: string;
  accessToken: string;
}): Promise<{ success: boolean; rawPayload: MetaGraphPayload }> {
  const wabaId = params.wabaId.trim();
  const accessToken = params.accessToken.trim();
  if (!wabaId) {
    throw new MetaOnboardingExchangeError("WABA id is required", 400);
  }
  if (!accessToken) {
    throw new MetaOnboardingExchangeError("Access token is required", 400);
  }

  const payload = await postMetaGraphJson({
    path: `${encodeURIComponent(wabaId)}/subscribed_apps`,
    accessToken,
    body: {},
  });

  return {
    success: payload.success === true || payload.success === "true",
    rawPayload: payload,
  };
}

export async function enrichMetaOnboardingResult(
  params: EnrichOnboardingParams
): Promise<{
  businessId: string | null;
  businessPortfolioId: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  rawPayload: Record<string, unknown>;
}> {
  const accessToken = params.businessToken?.trim() || "";
  if (!accessToken) {
    return {
      businessId: params.businessId ?? null,
      businessPortfolioId: params.businessPortfolioId ?? null,
      wabaId: params.wabaId ?? null,
      phoneNumberId: params.phoneNumberId ?? null,
      rawPayload: {},
    };
  }

  let businessId = params.businessId ?? null;
  let businessPortfolioId = params.businessPortfolioId ?? null;
  let wabaId = params.wabaId ?? null;
  const phoneNumberId = params.phoneNumberId ?? null;
  const rawPayload: Record<string, unknown> = {};

  if (phoneNumberId && (!wabaId || !businessId || !businessPortfolioId)) {
    try {
      const phonePayload = await fetchMetaGraphJson({
        path: phoneNumberId,
        accessToken,
        query: {
          fields: [
            "id",
            "display_phone_number",
            "verified_name",
            "name_status",
            "new_name_status",
            "code_verification_status",
            "account_mode",
            "quality_rating",
            "platform_type",
            "throughput",
          ].join(","),
        },
      });
      rawPayload.phoneNumber = phonePayload;
      const summary = summarizeExchangePayload(phonePayload);
      wabaId = wabaId ?? summary.wabaId;
      businessId = businessId ?? summary.businessId;
      businessPortfolioId = businessPortfolioId ?? summary.businessPortfolioId;
    } catch (error) {
      rawPayload.phoneNumberError =
        error instanceof MetaOnboardingExchangeError
          ? {
              message: error.message,
              status: error.status ?? null,
              errorBody: error.errorBody ?? null,
            }
          : { message: (error as Error).message };
    }
  }

  if (wabaId && (!businessId || !businessPortfolioId)) {
    try {
      const wabaPayload = await fetchMetaGraphJson({
        path: wabaId,
        accessToken,
        query: {
          fields: [
            "id",
            "name",
            "account_review_status",
            "business_verification_status",
            "owner_business_info",
          ].join(","),
        },
      });
      rawPayload.waba = wabaPayload;
      const summary = summarizeExchangePayload(wabaPayload);
      businessId = businessId ?? summary.businessId;
      businessPortfolioId = businessPortfolioId ?? summary.businessPortfolioId;
    } catch (error) {
      rawPayload.wabaError =
        error instanceof MetaOnboardingExchangeError
          ? {
              message: error.message,
              status: error.status ?? null,
              errorBody: error.errorBody ?? null,
            }
          : { message: (error as Error).message };
    }
  }

  return {
    businessId,
    businessPortfolioId,
    wabaId,
    phoneNumberId,
    rawPayload,
  };
}

export async function exchangeEmbeddedSignupCode(
  params: ExchangeCodeParams
): Promise<MetaOnboardingExchangeResult> {
  const code = params.code.trim();
  if (!code) {
    throw new MetaOnboardingExchangeError("Code is required", 400);
  }
  const appSecret = env.META_APP_SECRET || process.env.META_APP_SECRET || "";
  if (!appSecret) {
    throw new MetaOnboardingExchangeError("META_APP_SECRET is not configured", 500);
  }

  const query = new URLSearchParams({
    client_id: META_EMBEDDED_SIGNUP_APP_ID,
    client_secret: appSecret,
    code,
  });
  if (typeof params.redirectUri === "string") {
    query.set("redirect_uri", params.redirectUri.trim());
  }
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/oauth/access_token?${query.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const rawText = await response.text();
  let payload: ExchangeResponse;
  try {
    payload = JSON.parse(rawText) as ExchangeResponse;
  } catch {
    throw new MetaOnboardingExchangeError(
      "Meta returned non-JSON payload during code exchange",
      response.status,
      rawText.slice(0, 1000)
    );
  }

  if (!response.ok) {
    throw new MetaOnboardingExchangeError(
      "Meta code exchange failed",
      response.status,
      JSON.stringify(payload).slice(0, 1000)
    );
  }

  const summary = summarizeExchangePayload(payload);

  return {
    rawPayload: payload,
    businessToken: typeof payload.access_token === "string" ? payload.access_token : null,
    tokenType: typeof payload.token_type === "string" ? payload.token_type : null,
    businessId: summary.businessId,
    businessPortfolioId: summary.businessPortfolioId,
    wabaId: summary.wabaId,
    phoneNumberId: summary.phoneNumberId,
  };
}
