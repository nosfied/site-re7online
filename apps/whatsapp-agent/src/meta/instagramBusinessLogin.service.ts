import crypto from "node:crypto";
import { env } from "../config/env.js";
import { getTenants, saveTenants, type TenantConfig } from "../config/tenantConfig.js";
import { logger } from "../logger/logger.js";
import type { TenantChannelAccount } from "../channels/tenantChannelAccount.types.js";

const INSTAGRAM_BUSINESS_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
];

const STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_CALLBACK_PATH = "/agent-api/meta/instagram/oauth/callback";
const DEFAULT_RETURN_PATH = "/app/settings/channels/instagram";
const INSTAGRAM_AUTH_BASE_URL = "https://www.instagram.com/oauth/authorize";
const INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH_BASE_URL = "https://graph.facebook.com";
const GRAPH_INSTAGRAM_BASE_URL = "https://graph.instagram.com";

export type InstagramBusinessValidationStatus = {
  ok: boolean;
  checkedAt: string;
  tokenStatus: "configured" | "missing" | "invalid";
  tokenDiagnostics: {
    selectedTokenSource: "instagramBusinessAccessToken" | "pageAccessToken" | "legacy" | "none";
    instagramBusinessToken: {
      present: boolean;
      tokenLength: number;
      tokenPrefix: string | null;
      identityValidated: boolean;
      scopesValidated: boolean;
      source: "instagramBusinessAccessToken" | "pageAccessToken" | "legacy" | "none";
    };
    pageToken: {
      present: boolean;
      tokenLength: number;
      tokenPrefix: string | null;
      debugValidated: boolean;
      scopesValidated: boolean;
    };
  };
  requiredScopes: string[];
  grantedScopes: string[];
  missingScopes: string[];
  account: {
    id: string | null;
    username: string | null;
  };
  capabilities: {
    conversations: "available" | "blocked" | "unknown" | "incompatible_token_or_review_blocked";
    messages: "available" | "blocked" | "unknown" | "incompatible_token_or_review_blocked";
  };
  webhook: {
    callbackConfigured: boolean;
    expectedCallbackUrl: string;
  };
  errors: Array<{ stage: string; message: string; code?: number | null; type?: string | null }>;
};

type InstagramBusinessTokenResponse = {
  access_token?: string;
  user_id?: number | string;
  permissions?: string;
  error_message?: string;
  error_type?: string;
  code?: number;
};

type InstagramLongLivedTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
};

type GraphErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    subcode?: number;
  };
};

function getInstagramBusinessAppId() {
  const appId =
    process.env.META_INSTAGRAM_BUSINESS_LOGIN_APP_ID?.trim() ||
    process.env.META_INSTAGRAM_APP_ID?.trim() ||
    process.env.META_EMBEDDED_SIGNUP_APP_ID?.trim();
  if (!appId) throw new Error("instagram_business_login_app_id_not_configured");
  return appId;
}

function getInstagramBusinessAppSecret() {
  return (
    process.env.META_INSTAGRAM_BUSINESS_LOGIN_APP_SECRET?.trim() ||
    process.env.META_INSTAGRAM_APP_SECRET?.trim() ||
    env.META_APP_SECRET
  );
}

export function getInstagramBusinessRedirectUri() {
  const explicit = process.env.META_INSTAGRAM_BUSINESS_LOGIN_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const baseUrl =
    process.env.PUBLIC_APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    "https://converta.re7online.com";
  return `${baseUrl.replace(/\/+$/, "")}${DEFAULT_CALLBACK_PATH}`;
}

function getStateSecret() {
  return (
    process.env.META_INSTAGRAM_BUSINESS_LOGIN_STATE_SECRET?.trim() ||
    env.APP_AUTH_SECRET ||
    env.ADMIN_TOKEN ||
    env.META_APP_SECRET
  );
}

function base64UrlEncode(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signState(payload: string) {
  return crypto.createHmac("sha256", getStateSecret()).update(payload).digest("base64url");
}

export function createInstagramBusinessLoginState(params: {
  tenantKey: string;
  userId: string;
  returnPath?: string | null;
}) {
  const payload = JSON.stringify({
    tenantKey: params.tenantKey,
    userId: params.userId,
    nonce: crypto.randomBytes(16).toString("hex"),
    expiresAt: Date.now() + STATE_TTL_MS,
    returnPath:
      typeof params.returnPath === "string" && params.returnPath.startsWith("/")
        ? params.returnPath
        : DEFAULT_RETURN_PATH,
  });
  const encoded = base64UrlEncode(payload);
  return `${encoded}.${signState(encoded)}`;
}

export function verifyInstagramBusinessLoginState(state: string) {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature || signState(encoded) !== signature) {
    throw new Error("instagram_oauth_state_invalid");
  }
  const parsed = JSON.parse(base64UrlDecode(encoded)) as {
    tenantKey?: unknown;
    userId?: unknown;
    expiresAt?: unknown;
    returnPath?: unknown;
  };
  const tenantKey = typeof parsed.tenantKey === "string" ? parsed.tenantKey.trim() : "";
  const userId = typeof parsed.userId === "string" ? parsed.userId.trim() : "";
  const expiresAt = typeof parsed.expiresAt === "number" ? parsed.expiresAt : 0;
  const returnPath =
    typeof parsed.returnPath === "string" && parsed.returnPath.startsWith("/")
      ? parsed.returnPath
      : DEFAULT_RETURN_PATH;
  if (!tenantKey || !userId || expiresAt < Date.now()) {
    throw new Error("instagram_oauth_state_expired");
  }
  return { tenantKey, userId, returnPath };
}

export function buildInstagramBusinessLoginAuthUrl(params: {
  state: string;
  redirectUri?: string;
}) {
  const appId = getInstagramBusinessAppId();
  const redirectUri = params.redirectUri ?? getInstagramBusinessRedirectUri();
  const url = new URL(INSTAGRAM_AUTH_BASE_URL);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_BUSINESS_SCOPES.join(","));
  url.searchParams.set("state", params.state);
  url.searchParams.set("enable_fb_login", "0");
  url.searchParams.set("force_authentication", "1");
  return url.toString();
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { parseError: true, text: text.slice(0, 300) };
  }
  return { response, payload };
}

function summarizeGraphError(payload: unknown) {
  const error = (payload as GraphErrorPayload | null)?.error;
  return {
    message: error?.message?.slice(0, 240) ?? "Meta request failed",
    type: error?.type ?? null,
    code: error?.code ?? null,
  };
}

function tokenDiagnostic(token: string | null | undefined) {
  const normalized = typeof token === "string" ? token.trim() : "";
  return {
    present: normalized.length > 0,
    tokenLength: normalized.length,
    tokenPrefix: normalized ? normalized.slice(0, 4) : null,
  };
}

function isLikelySerializedToken(token: string) {
  const trimmed = token.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith("\"");
}

async function exchangeCodeForShortLivedToken(params: { code: string; redirectUri: string }) {
  const appId = getInstagramBusinessAppId();
  const appSecret = getInstagramBusinessAppSecret();
  if (!appId || !appSecret) throw new Error("instagram_business_login_app_not_configured");

  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: params.redirectUri,
    code: params.code,
  });
  const { response, payload } = await fetchJson(INSTAGRAM_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const error = payload as InstagramBusinessTokenResponse;
    throw new Error(error.error_message || summarizeGraphError(payload).message);
  }
  const tokenPayload = payload as InstagramBusinessTokenResponse;
  if (!tokenPayload.access_token) throw new Error("instagram_access_token_missing");
  return tokenPayload;
}

async function exchangeForLongLivedToken(shortLivedToken: string) {
  const appSecret = getInstagramBusinessAppSecret();
  const url = new URL(`${GRAPH_INSTAGRAM_BASE_URL}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("access_token", shortLivedToken);
  const { response, payload } = await fetchJson(url.toString());
  if (!response.ok) {
    return { accessToken: shortLivedToken, tokenType: "short_lived", expiresIn: null };
  }
  const tokenPayload = payload as InstagramLongLivedTokenResponse;
  return {
    accessToken: tokenPayload.access_token || shortLivedToken,
    tokenType: tokenPayload.access_token ? "long_lived" : "short_lived",
    expiresIn: tokenPayload.expires_in ?? null,
  };
}

async function fetchInstagramBusinessProfile(accessToken: string) {
  const url = new URL(`${GRAPH_INSTAGRAM_BASE_URL}/me`);
  url.searchParams.set("fields", "id,username,user_id,account_type");
  url.searchParams.set("access_token", accessToken);
  const { response, payload } = await fetchJson(url.toString());
  if (!response.ok) throw new Error(summarizeGraphError(payload).message);
  const record = payload as Record<string, unknown>;
  return {
    id: typeof record.id === "string" ? record.id : typeof record.user_id === "string" ? record.user_id : null,
    username: typeof record.username === "string" ? record.username : null,
    rawKeys: Object.keys(record).sort(),
  };
}

function redactAccountStatus(account?: TenantChannelAccount | null): InstagramBusinessValidationStatus["account"] {
  return {
    id: account?.channelAccountId ?? null,
    username:
      typeof account?.metadata?.username === "string"
        ? account.metadata.username
        : null,
  };
}

function getInstagramAccount(tenant?: TenantConfig | null) {
  return (tenant?.channelAccounts ?? []).find(
    (account) => account.channel === "instagram" && account.provider === "meta"
  );
}

function resolveAccountTokens(account?: TenantChannelAccount | null) {
  const raw = account as (TenantChannelAccount & Record<string, unknown>) | null | undefined;
  const legacy =
    (typeof raw?.accessToken === "string" ? raw.accessToken : "") ||
    (typeof raw?.token === "string" ? raw.token : "") ||
    (typeof raw?.longLivedToken === "string" ? raw.longLivedToken : "") ||
    (typeof raw?.businessToken === "string" ? raw.businessToken : "") ||
    "";
  return {
    instagramBusinessAccessToken: (account?.instagramBusinessAccessToken ?? "").trim(),
    pageAccessToken: (account?.pageAccessToken ?? "").trim(),
    legacyToken: legacy.trim(),
  };
}

function resolvePreferredToken(account?: TenantChannelAccount | null) {
  const tokens = resolveAccountTokens(account);
  if (tokens.instagramBusinessAccessToken) {
    return { token: tokens.instagramBusinessAccessToken, source: "instagramBusinessAccessToken" as const };
  }
  if (tokens.pageAccessToken) {
    return { token: tokens.pageAccessToken, source: "pageAccessToken" as const };
  }
  if (tokens.legacyToken) {
    return { token: tokens.legacyToken, source: "legacy" as const };
  }
  return { token: "", source: "none" as const };
}

export function buildInstagramBusinessStatus(tenant?: TenantConfig | null) {
  const account = getInstagramAccount(tenant);
  const hasToken = Boolean(resolvePreferredToken(account).token);
  return {
    channelAccountId: account?.channelAccountId ?? null,
    externalAccountIds: account?.externalAccountIds ?? [],
    username: account?.metadata?.username ?? null,
    facebookPageId: account?.metadata?.facebookPageId ?? null,
    tokenStatus: hasToken ? "configured" : account?.tokenStatus ?? "missing",
    enabled: account?.enabled === true,
    runtimeEnabled: account?.runtimeEnabled === true,
    inboundPersistenceEnabled: account?.inboundPersistenceEnabled === true,
    outboundEnabled: account?.outboundEnabled === true,
    aiEnabled: account?.aiEnabled === true,
    handoffEnabled: account?.handoffEnabled === true,
    metadata: account?.metadata ?? {},
  };
}

export async function validateInstagramBusinessConnection(params: {
  tenantKey: string;
}): Promise<InstagramBusinessValidationStatus> {
  const tenants = await getTenants();
  const tenant = tenants[params.tenantKey];
  const account = getInstagramAccount(tenant);
  const tokens = resolveAccountTokens(account);
  const preferred = resolvePreferredToken(account);
  const accessToken = preferred.token;
  const checkedAt = new Date().toISOString();
  const errors: InstagramBusinessValidationStatus["errors"] = [];
  const grantedScopes = new Set<string>();
  const capabilities: InstagramBusinessValidationStatus["capabilities"] = {
    conversations: "unknown",
    messages: "unknown",
  };
  let tokenStatus: InstagramBusinessValidationStatus["tokenStatus"] = accessToken ? "configured" : "missing";
  let profile = redactAccountStatus(account);
  let instagramBusinessIdentityValidated = false;
  let instagramBusinessScopesValidated = false;
  let pageTokenDebugValidated = false;
  let pageTokenScopesValidated = false;
  let effectiveInstagramToken = "";
  let effectiveInstagramTokenSource: InstagramBusinessValidationStatus["tokenDiagnostics"]["instagramBusinessToken"]["source"] = "none";
  const instagramBusinessTokenDiagnostic = tokenDiagnostic(tokens.instagramBusinessAccessToken);
  const pageTokenDiagnostic = tokenDiagnostic(tokens.pageAccessToken);
  const selectedTokenDiagnostic = tokenDiagnostic(accessToken);

  if (!accessToken) {
    return {
      ok: false,
      checkedAt,
      tokenStatus,
      tokenDiagnostics: {
        selectedTokenSource: "none",
        instagramBusinessToken: {
          ...instagramBusinessTokenDiagnostic,
          identityValidated: false,
          scopesValidated: false,
          source: "none",
        },
        pageToken: {
          ...pageTokenDiagnostic,
          debugValidated: false,
          scopesValidated: false,
        },
      },
      requiredScopes: INSTAGRAM_BUSINESS_SCOPES,
      grantedScopes: [],
      missingScopes: INSTAGRAM_BUSINESS_SCOPES,
      account: profile,
      capabilities,
      webhook: {
        callbackConfigured: true,
        expectedCallbackUrl: getInstagramBusinessRedirectUri(),
      },
      errors: [{ stage: "token", message: "Instagram Business token is missing" }],
    };
  }

  if (isLikelySerializedToken(accessToken)) {
    tokenStatus = "invalid";
    errors.push({
      stage: "token_format",
      message: "Saved token looks serialized instead of a plain OAuth access token.",
    });
  }

  try {
    const nextProfile = await fetchInstagramBusinessProfile(accessToken);
    profile = {
      id: nextProfile.id ?? profile.id,
      username: nextProfile.username ?? profile.username,
    };
    instagramBusinessIdentityValidated = true;
    effectiveInstagramToken = accessToken;
    effectiveInstagramTokenSource = preferred.source;
  } catch (error) {
    errors.push({ stage: "instagram_business_identity", message: (error as Error).message });
  }

  if (tokens.pageAccessToken && preferred.source === "pageAccessToken" && !instagramBusinessIdentityValidated) {
    try {
      const debugUrl = new URL(`${GRAPH_BASE_URL}/debug_token`);
      const appId = getInstagramBusinessAppId();
      const appSecret = getInstagramBusinessAppSecret();
      debugUrl.searchParams.set("input_token", tokens.pageAccessToken);
      debugUrl.searchParams.set("access_token", `${appId}|${appSecret}`);
      const { response, payload } = await fetchJson(debugUrl.toString());
      if (!response.ok || !(payload as Record<string, any>)?.data?.is_valid) {
        tokenStatus = "invalid";
        errors.push({ stage: "page_token_debug", ...summarizeGraphError(payload) });
      } else {
        pageTokenDebugValidated = true;
        const scopes = (payload as Record<string, any>).data?.scopes;
        if (Array.isArray(scopes)) {
          pageTokenScopesValidated = true;
          scopes.forEach((scope) => {
            if (typeof scope === "string") grantedScopes.add(scope);
          });
        }
      }
    } catch (error) {
      errors.push({ stage: "page_token_debug", message: (error as Error).message });
    }
  }

  if (instagramBusinessIdentityValidated) {
    try {
      const permissionsUrl = new URL(`${GRAPH_INSTAGRAM_BASE_URL}/me/permissions`);
      permissionsUrl.searchParams.set("access_token", effectiveInstagramToken);
      const { response, payload } = await fetchJson(permissionsUrl.toString());
      if (response.ok) {
        const data = (payload as Record<string, unknown>).data;
        if (Array.isArray(data)) {
          instagramBusinessScopesValidated = true;
          data.forEach((item) => {
            const permission = item as Record<string, unknown>;
            const name = typeof permission.permission === "string" ? permission.permission : "";
            const status = typeof permission.status === "string" ? permission.status : "granted";
            if (name && status !== "declined") grantedScopes.add(name);
          });
        }
      }
    } catch (error) {
      errors.push({ stage: "instagram_business_permissions", message: (error as Error).message });
    }
  }

  const accountId = profile.id ?? account?.channelAccountId ?? "";
  if (accountId && effectiveInstagramToken) {
    try {
      const conversationsUrl = new URL(`${GRAPH_BASE_URL}/${env.WHATSAPP_API_VERSION}/${accountId}/conversations`);
      conversationsUrl.searchParams.set("platform", "instagram");
      conversationsUrl.searchParams.set("limit", "1");
      conversationsUrl.searchParams.set("access_token", effectiveInstagramToken);
      const { response, payload } = await fetchJson(conversationsUrl.toString());
      if (response.ok) {
        capabilities.conversations = "available";
        capabilities.messages = "available";
      } else {
        const summarized = summarizeGraphError(payload);
        const incompatible =
          summarized.message.toLowerCase().includes("cannot parse access token") ||
          summarized.message.toLowerCase().includes("application does not have the capability");
        capabilities.conversations = incompatible ? "incompatible_token_or_review_blocked" : "blocked";
        capabilities.messages = incompatible ? "incompatible_token_or_review_blocked" : "blocked";
        errors.push({ stage: "conversations_capability", ...summarized });
      }
    } catch (error) {
      capabilities.conversations = "unknown";
      capabilities.messages = "unknown";
      errors.push({ stage: "conversations", message: (error as Error).message });
    }
  }

  const granted = Array.from(grantedScopes).sort();
  const scopesValidated = instagramBusinessScopesValidated || pageTokenScopesValidated;
  const missingScopes = scopesValidated
    ? INSTAGRAM_BUSINESS_SCOPES.filter((scope) => !grantedScopes.has(scope))
    : [];
  return {
    ok: tokenStatus === "configured" && instagramBusinessIdentityValidated,
    checkedAt,
    tokenStatus,
    tokenDiagnostics: {
      selectedTokenSource: preferred.source,
      instagramBusinessToken: {
        ...selectedTokenDiagnostic,
        identityValidated: instagramBusinessIdentityValidated,
        scopesValidated: instagramBusinessScopesValidated,
        source: effectiveInstagramTokenSource,
      },
      pageToken: {
        ...pageTokenDiagnostic,
        debugValidated: pageTokenDebugValidated,
        scopesValidated: pageTokenScopesValidated,
      },
    },
    requiredScopes: INSTAGRAM_BUSINESS_SCOPES,
    grantedScopes: granted,
    missingScopes,
    account: profile,
    capabilities,
    webhook: {
      callbackConfigured: true,
      expectedCallbackUrl: getInstagramBusinessRedirectUri(),
    },
    errors,
  };
}

export async function completeInstagramBusinessLogin(params: {
  code: string;
  state: string;
}) {
  const state = verifyInstagramBusinessLoginState(params.state);
  const redirectUri = getInstagramBusinessRedirectUri();
  const shortToken = await exchangeCodeForShortLivedToken({
    code: params.code,
    redirectUri,
  });
  const longToken = await exchangeForLongLivedToken(shortToken.access_token!);
  const profile = await fetchInstagramBusinessProfile(longToken.accessToken);
  if (!profile.id) throw new Error("instagram_business_profile_id_missing");
  const tokenInfo = tokenDiagnostic(longToken.accessToken);

  const tenants = await getTenants();
  const tenant = tenants[state.tenantKey];
  if (!tenant) throw new Error("tenant_not_found");
  const currentAccounts = tenant.channelAccounts ?? [];
  const existing = getInstagramAccount(tenant);
  const nextAccount: TenantChannelAccount = {
    ...(existing ?? {
      id: `${state.tenantKey}-meta-instagram-${profile.id}`,
      tenantKey: state.tenantKey,
      channel: "instagram",
      provider: "meta",
      channelAccountId: profile.id,
      enabled: true,
      status: "connected",
    }),
    tenantKey: state.tenantKey,
    channel: "instagram",
    provider: "meta",
    channelAccountId: existing?.channelAccountId || profile.id,
    externalAccountIds: existing?.externalAccountIds,
    metadata: {
      ...(existing?.metadata ?? {}),
      graphAccountId: existing?.metadata?.graphAccountId || profile.id,
      username: profile.username ?? existing?.metadata?.username ?? "",
      source: "instagram_business_login",
      tokenType: longToken.tokenType,
      tokenExpiresIn: longToken.expiresIn != null ? String(longToken.expiresIn) : "",
      lastConnectedAt: new Date().toISOString(),
    },
    instagramBusinessAccessToken: longToken.accessToken,
    tokenStatus: "configured",
    enabled: true,
    runtimeEnabled: existing?.runtimeEnabled ?? true,
    inboundPersistenceEnabled: existing?.inboundPersistenceEnabled ?? true,
    outboundEnabled: false,
    aiEnabled: false,
    handoffEnabled: false,
    status: "connected",
  };
  const nextAccounts = existing
    ? currentAccounts.map((account) => (account === existing ? nextAccount : account))
    : [...currentAccounts, nextAccount];
  const nextTenants = {
    ...tenants,
    [state.tenantKey]: {
      ...tenant,
      channelAccounts: nextAccounts,
    },
  };
  const saved = await saveTenants(nextTenants);
  logger.info({
    event: "instagram.business_login.connected",
    tenantKey: state.tenantKey,
    userId: state.userId,
    channelAccountId: nextAccount.channelAccountId,
    username: profile.username ?? null,
    tokenPresent: tokenInfo.present,
    tokenLength: tokenInfo.tokenLength,
    tokenPrefix: tokenInfo.tokenPrefix,
  });
  return {
    tenantKey: state.tenantKey,
    returnPath: state.returnPath,
    backupPath: saved.backupPath,
    status: buildInstagramBusinessStatus(saved.tenants[state.tenantKey]),
  };
}
