import { env } from "../config/env.js";
import { normalizeHybridWhatsappNumber } from "../web-session/hybridIdentity.js";

const META_EMBEDDED_SIGNUP_APP_ID =
  process.env.META_EMBEDDED_SIGNUP_APP_ID?.trim() || "2074361376674006";

export function getMetaEmbeddedSignupAppId() {
  return META_EMBEDDED_SIGNUP_APP_ID;
}

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
  displayPhoneNumber?: string | null;
  expectedPublicIdentity?: string | null;
};

type DiscoveryStage = "DISCOVERED" | "CONFIGURED" | "OPERATIONAL";

type WabaCandidate = {
  id: string;
  businessId: string | null;
  source: string;
};

type PhoneCandidate = {
  businessId: string | null;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  canonicalNumber: string | null;
  phonePayload: Record<string, unknown>;
  source: string;
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

function normalizeComparablePhone(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function isSameDisplayedPhone(left: string | null | undefined, right: string | null | undefined) {
  const leftDigits = normalizeHybridWhatsappNumber(left ?? "") || normalizeComparablePhone(left);
  const rightDigits = normalizeHybridWhatsappNumber(right ?? "") || normalizeComparablePhone(right);
  if (!leftDigits || !rightDigits) return false;
  return leftDigits === rightDigits;
}

function normalizeGraphId(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null;
}

function buildSafeTokenDebugPayload(payload: MetaGraphPayload) {
  const data =
    payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
      ? (payload.data as Record<string, unknown>)
      : {};
  const granularScopes = Array.isArray(data.granular_scopes)
    ? data.granular_scopes
        .filter((scope): scope is Record<string, unknown> => Boolean(scope) && typeof scope === "object")
        .map((scope) => ({
          scope: normalizeGraphId(scope.scope),
          target_ids: Array.isArray(scope.target_ids)
            ? scope.target_ids.map(normalizeGraphId).filter((id): id is string => Boolean(id))
            : [],
        }))
    : [];
  return {
    is_valid: data.is_valid === true,
    app_id: normalizeGraphId(data.app_id),
    type: normalizeGraphId(data.type),
    user_id: normalizeGraphId(data.user_id),
    scopes: Array.isArray(data.scopes)
      ? data.scopes.map(normalizeGraphId).filter((scope): scope is string => Boolean(scope))
      : [],
    granular_scopes: granularScopes,
  };
}

function sanitizeExchangePayload(payload: ExchangeResponse) {
  const sanitized: Record<string, unknown> = { ...payload };
  if (typeof sanitized.access_token === "string") {
    sanitized.access_token = "[stored_in_businessToken]";
  }
  return sanitized;
}

function addWabaCandidate(
  candidates: Map<string, WabaCandidate>,
  id: unknown,
  source: string,
  businessId: string | null = null
) {
  const normalizedId = normalizeGraphId(id);
  if (!normalizedId) return;
  const existing = candidates.get(normalizedId);
  if (existing) {
    if (!existing.businessId && businessId) {
      candidates.set(normalizedId, { ...existing, businessId });
    }
    return;
  }
  candidates.set(normalizedId, { id: normalizedId, businessId, source });
}

function readGraphDataArray(payload: MetaGraphPayload) {
  return Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : [];
}

async function debugMetaBusinessToken(accessToken: string): Promise<MetaGraphPayload | null> {
  const appSecret = env.META_APP_SECRET || process.env.META_APP_SECRET || "";
  if (!META_EMBEDDED_SIGNUP_APP_ID || !appSecret) return null;
  return fetchMetaGraphJson({
    path: "debug_token",
    accessToken: `${META_EMBEDDED_SIGNUP_APP_ID}|${appSecret}`,
    query: { input_token: accessToken },
  });
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
  const requestedPhoneNumberId = normalizeGraphId(params.phoneNumberId);
  const requestedWabaId = normalizeGraphId(params.wabaId);
  const expectedPublicIdentity =
    normalizeHybridWhatsappNumber(params.expectedPublicIdentity ?? "") ||
    normalizeHybridWhatsappNumber(params.displayPhoneNumber ?? "");
  if (!accessToken) {
    return {
      businessId: params.businessId ?? null,
      businessPortfolioId: params.businessPortfolioId ?? null,
      wabaId: requestedWabaId,
      phoneNumberId: requestedPhoneNumberId,
      rawPayload: {},
    };
  }

  let businessId = params.businessId ?? null;
  let businessPortfolioId = params.businessPortfolioId ?? null;
  let wabaId: string | null = null;
  let phoneNumberId: string | null = null;
  const rawPayload: Record<string, unknown> = {};
  const wabaCandidates = new Map<string, WabaCandidate>();
  const phoneCandidates: PhoneCandidate[] = [];

  const addPhoneCandidate = (candidate: PhoneCandidate) => {
    if (
      phoneCandidates.some(
        (existing) =>
          existing.wabaId === candidate.wabaId &&
          existing.phoneNumberId === candidate.phoneNumberId
      )
    ) {
      return;
    }
    phoneCandidates.push(candidate);
  };

  addWabaCandidate(wabaCandidates, requestedWabaId, "frontend_hint", businessId);

  if (requestedPhoneNumberId) {
    try {
      const phonePayload = await fetchMetaGraphJson({
        path: requestedPhoneNumberId,
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
            "is_on_biz_app",
            "throughput",
          ].join(","),
        },
      });
      rawPayload.phoneNumber = phonePayload;
      const summary = summarizeExchangePayload(phonePayload);
      addWabaCandidate(wabaCandidates, summary.wabaId, "phone_object", businessId);
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

  try {
    const debugTokenPayload = await debugMetaBusinessToken(accessToken);
    if (debugTokenPayload) {
      const safeDebugToken = buildSafeTokenDebugPayload(debugTokenPayload);
      rawPayload.debugToken = safeDebugToken;
      if (safeDebugToken.is_valid === false) {
        rawPayload.discovery = {
          stage: "DISCOVERED" satisfies DiscoveryStage,
          selected: false,
          reason: "invalid_debug_token",
          wabaCandidateCount: 0,
          phoneCandidateCount: 0,
        };
        return {
          businessId,
          businessPortfolioId,
          wabaId: null,
          phoneNumberId: null,
          rawPayload,
        };
      }
      for (const scope of safeDebugToken.granular_scopes) {
        const scopeName = scope.scope ?? "";
        if (
          scopeName !== "whatsapp_business_management" &&
          scopeName !== "whatsapp_business_messaging" &&
          scopeName !== "business_management"
        ) {
          continue;
        }
        for (const targetId of scope.target_ids) {
          addWabaCandidate(wabaCandidates, targetId, `debug_token:${scopeName}`);
        }
      }
    }
  } catch (error) {
    rawPayload.debugTokenError =
      error instanceof MetaOnboardingExchangeError
        ? {
            message: error.message,
            status: error.status ?? null,
            errorBody: error.errorBody ?? null,
          }
        : { message: (error as Error).message };
  }

  try {
    const businessesPayload = await fetchMetaGraphJson({
      path: "me/businesses",
      accessToken,
      query: {
        fields: "id,name,verification_status",
      },
    });
    rawPayload.businesses = businessesPayload;
    const businesses = readGraphDataArray(businessesPayload);

    for (const business of businesses) {
      const graphBusinessId = normalizeGraphId(business.id);
      if (!graphBusinessId) continue;
      for (const edge of [
        "owned_whatsapp_business_accounts",
        "client_whatsapp_business_accounts",
      ]) {
        const wabasPayload = await fetchMetaGraphJson({
          path: `${encodeURIComponent(graphBusinessId)}/${edge}`,
          accessToken,
          query: {
            fields: "id,name,account_review_status,business_verification_status",
          },
        });
        rawPayload[`${edge}_${graphBusinessId}`] = wabasPayload;
        for (const waba of readGraphDataArray(wabasPayload)) {
          addWabaCandidate(wabaCandidates, waba.id, edge, graphBusinessId);
        }
      }
    }
  } catch (error) {
    rawPayload.businessResolutionError =
      error instanceof MetaOnboardingExchangeError
        ? {
            message: error.message,
            status: error.status ?? null,
            errorBody: error.errorBody ?? null,
          }
        : { message: (error as Error).message };
  }

  for (const candidate of wabaCandidates.values()) {
    try {
      const wabaPayload = await fetchMetaGraphJson({
        path: candidate.id,
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
      rawPayload[`waba_${candidate.id}`] = wabaPayload;
      const summary = summarizeExchangePayload(wabaPayload);
      const candidateBusinessId = candidate.businessId ?? summary.businessId ?? null;
      const phonesPayload = await fetchMetaGraphJson({
        path: `${encodeURIComponent(candidate.id)}/phone_numbers`,
        accessToken,
        query: {
          fields: [
            "id",
            "display_phone_number",
            "verified_name",
            "code_verification_status",
            "name_status",
            "new_name_status",
            "account_mode",
            "quality_rating",
            "platform_type",
            "is_on_biz_app",
            "throughput",
          ].join(","),
        },
      });
      rawPayload[`waba_${candidate.id}_phone_numbers`] = phonesPayload;
      for (const phone of readGraphDataArray(phonesPayload)) {
        const graphPhoneNumberId = normalizeGraphId(phone.id);
        if (!graphPhoneNumberId) continue;
        const graphDisplayPhone = normalizeGraphId(phone.display_phone_number);
        addPhoneCandidate({
          businessId: candidateBusinessId,
          wabaId: candidate.id,
          phoneNumberId: graphPhoneNumberId,
          displayPhoneNumber: graphDisplayPhone,
          canonicalNumber: normalizeHybridWhatsappNumber(graphDisplayPhone ?? "") || null,
          phonePayload: phone,
          source: candidate.source,
        });
      }
    } catch (error) {
      rawPayload[`waba_${candidate.id}_error`] =
        error instanceof MetaOnboardingExchangeError
          ? {
              message: error.message,
              status: error.status ?? null,
              errorBody: error.errorBody ?? null,
            }
          : { message: (error as Error).message };
    }
  }

  const idFiltered = requestedPhoneNumberId
    ? phoneCandidates.filter((candidate) => candidate.phoneNumberId === requestedPhoneNumberId)
    : phoneCandidates;
  const identityFiltered = expectedPublicIdentity
    ? idFiltered.filter((candidate) => candidate.canonicalNumber === expectedPublicIdentity)
    : idFiltered;
  const displayFiltered =
    !expectedPublicIdentity && params.displayPhoneNumber
      ? identityFiltered.filter((candidate) =>
          isSameDisplayedPhone(params.displayPhoneNumber, candidate.displayPhoneNumber)
        )
      : identityFiltered;
  const uniqueMatches = Array.from(
    new Map(
      displayFiltered.map((match) => [`${match.wabaId}:${match.phoneNumberId}`, match])
    ).values()
  );

  rawPayload.discovery = {
    stage: (uniqueMatches.length === 1 ? "CONFIGURED" : "DISCOVERED") satisfies DiscoveryStage,
    selected: uniqueMatches.length === 1,
    reason:
      uniqueMatches.length === 1
        ? "single_graph_confirmed_candidate"
        : phoneCandidates.length === 0
          ? "no_authorized_phone_candidate"
          : "ambiguous_or_mismatched_candidate",
    expectedPublicIdentity: expectedPublicIdentity || null,
    requestedPhoneNumberId,
    requestedWabaId,
    wabaCandidateCount: wabaCandidates.size,
    phoneCandidateCount: phoneCandidates.length,
    matchCount: uniqueMatches.length,
    candidates: phoneCandidates.map((candidate) => ({
      wabaId: candidate.wabaId,
      phoneNumberId: candidate.phoneNumberId,
      maskedNumber: candidate.canonicalNumber
        ? `****${candidate.canonicalNumber.slice(-4)}`
        : null,
      source: candidate.source,
    })),
  };

  if (uniqueMatches.length === 1) {
    const match = uniqueMatches[0];
    businessId = businessId ?? match.businessId;
    businessPortfolioId = businessPortfolioId ?? match.businessId;
    wabaId = match.wabaId;
    phoneNumberId = match.phoneNumberId;
    rawPayload.phoneNumber = match.phonePayload;
    rawPayload.waba = rawPayload[`waba_${match.wabaId}`] ?? null;
    rawPayload.discovery = {
      ...(rawPayload.discovery as Record<string, unknown>),
      stage: "CONFIGURED" satisfies DiscoveryStage,
    };
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
    rawPayload: sanitizeExchangePayload(payload),
    businessToken: typeof payload.access_token === "string" ? payload.access_token : null,
    tokenType: typeof payload.token_type === "string" ? payload.token_type : null,
    businessId: summary.businessId,
    businessPortfolioId: summary.businessPortfolioId,
    wabaId: summary.wabaId,
    phoneNumberId: summary.phoneNumberId,
  };
}
