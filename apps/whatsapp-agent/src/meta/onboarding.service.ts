import { env } from "../config/env.js";

const META_EMBEDDED_SIGNUP_APP_ID =
  process.env.META_EMBEDDED_SIGNUP_APP_ID?.trim() || "2074361376674006";

type ExchangeCodeParams = {
  code: string;
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

export async function exchangeEmbeddedSignupCode(
  params: ExchangeCodeParams
): Promise<MetaOnboardingExchangeResult> {
  const code = params.code.trim();
  if (!code) {
    throw new MetaOnboardingExchangeError("Code is required", 400);
  }
  if (!env.META_APP_SECRET) {
    throw new MetaOnboardingExchangeError("META_APP_SECRET is not configured", 500);
  }

  const query = new URLSearchParams({
    client_id: META_EMBEDDED_SIGNUP_APP_ID,
    client_secret: env.META_APP_SECRET,
    code,
  });
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
