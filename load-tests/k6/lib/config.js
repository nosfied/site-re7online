import http from "k6/http";
import { check, fail, sleep } from "k6";

const PROFILE_VUS = {
  smoke1: 1,
  vu1: 1,
  smoke5: 5,
  vu5: 5,
  vu10: 10,
  vu20: 20,
  vu50: 50,
};

export const config = {
  apiBaseUrl: (__ENV.API_BASE_URL || "https://converta.re7online.com/agent-api").replace(/\/$/, ""),
  appBaseUrl: (__ENV.APP_BASE_URL || "https://converta.re7online.com").replace(/\/$/, ""),
  hostHeader: __ENV.HOST_HEADER || "",
  profile: __ENV.PROFILE || "vu5",
  duration: __ENV.DURATION || "2m",
  sleepSeconds: Number(__ENV.SLEEP_SECONDS || "1"),
  publicApiKey: __ENV.PUBLIC_API_KEY || "",
  publicApiKeys: parseJsonArray(__ENV.PUBLIC_API_KEYS_JSON || "") || splitCsv(__ENV.PUBLIC_API_KEYS || ""),
  appJwt: __ENV.APP_JWT || "",
  appTokens: parseJsonArray(__ENV.APP_TOKENS_JSON || __ENV.LOAD_TEST_TOKENS_JSON || "") || splitCsv(__ENV.APP_TOKENS || ""),
  appUsers: parseJsonArray(__ENV.APP_USERS_JSON || __ENV.LOAD_TEST_USERS_JSON || "") || [],
  loginEmail: __ENV.LOGIN_EMAIL || "",
  loginPassword: __ENV.LOGIN_PASSWORD || "",
  loginUsers: parseJsonArray(__ENV.LOGIN_USERS_JSON || __ENV.LOAD_TEST_USERS_JSON || "") || [],
  searchQuery: __ENV.SEARCH_QUERY || "teste",
  conversationId: __ENV.CONVERSATION_ID || "",
};

function splitCsv(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonArray(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function pickByVu(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const vu = Number(__VU || 1);
  return items[(Math.max(vu, 1) - 1) % items.length] || items[0];
}

export function scenarioOptions(extraThresholds = {}) {
  const vus = PROFILE_VUS[config.profile];
  if (!vus) {
    fail(`Invalid PROFILE=${config.profile}. Allowed: ${Object.keys(PROFILE_VUS).join(", ")}`);
  }
  return {
    vus,
    duration: config.duration,
    thresholds: {
      http_req_failed: ["rate<0.01"],
      http_req_duration: ["p(95)<1500"],
      ...extraThresholds,
    },
  };
}

export function profileVus() {
  const vus = PROFILE_VUS[config.profile];
  if (!vus) {
    fail(`Invalid PROFILE=${config.profile}. Allowed: ${Object.keys(PROFILE_VUS).join(", ")}`);
  }
  return vus;
}

export function loginScenarioOptions(extraThresholds = {}) {
  return scenarioOptions({
    http_req_failed: [__ENV.LOGIN_HTTP_FAILED_THRESHOLD || "rate<0.20"],
    http_req_duration: ["p(95)<1000"],
    ...extraThresholds,
  });
}

export function validateLoginScenarioConfig() {
  const allowedProfiles = new Set(["smoke1", "vu1"]);
  if (!allowedProfiles.has(config.profile)) {
    fail(`Login load scenario must use PROFILE=smoke1 or PROFILE=vu1. Received PROFILE=${config.profile}`);
  }
  if (config.sleepSeconds < 5) {
    fail(`Login load scenario must use SLEEP_SECONDS>=5 to avoid hammering /auth/login. Received ${config.sleepSeconds}`);
  }
}

export function requireEnv(name, value) {
  if (!value) fail(`Missing required env ${name}`);
  return value;
}

export function apiUrl(path) {
  return `${config.apiBaseUrl}${path}`;
}

export function appUrl(path) {
  return `${config.appBaseUrl}${path}`;
}

export function jsonHeaders(extra = {}) {
  const hostHeader = config.hostHeader ? { Host: config.hostHeader } : {};
  return {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...hostHeader,
      ...extra,
    },
  };
}

export function requestParams(extra = {}) {
  return jsonHeaders(extra);
}

export function bearerHeaders(token, extra = {}) {
  return jsonHeaders({ Authorization: `Bearer ${token}`, ...extra });
}

export function publicApiHeaders() {
  const key = pickByVu(config.publicApiKeys) || config.publicApiKey;
  return bearerHeaders(requireEnv("PUBLIC_API_KEY", key));
}

export function appAuthHeaders() {
  return bearerHeaders(requireEnv("APP_JWT", config.appJwt));
}

export function appAuthHeadersForToken(token) {
  return bearerHeaders(requireEnv("APP_JWT", token || config.appJwt));
}

export function selectedLoginUser() {
  const selected = pickByVu(config.loginUsers);
  if (!selected || typeof selected !== "object") {
    return {
      email: config.loginEmail,
      password: config.loginPassword,
    };
  }
  return {
    email: String(selected.email || ""),
    password: String(selected.password || ""),
  };
}

export function selectedAppUser() {
  const selected = pickByVu(config.appUsers);
  if (!selected || typeof selected !== "object") {
    return null;
  }
  return {
    email: String(selected.email || ""),
    password: String(selected.password || ""),
  };
}

export function login() {
  const credentials = selectedLoginUser();
  requireEnv("LOGIN_EMAIL", credentials.email);
  requireEnv("LOGIN_PASSWORD", credentials.password);
  const res = http.post(
    apiUrl("/auth/login"),
    JSON.stringify({ email: credentials.email, password: credentials.password }),
    jsonHeaders()
  );
  check(res, {
    "login status is 200": (r) => r.status === 200,
    "login returned json": (r) => String(r.headers["Content-Type"] || "").includes("application/json"),
  });
  if (res.status !== 200) return "";
  const body = safeJson(res);
  return body?.token || body?.accessToken || body?.jwt || body?.session?.token || "";
}

export function loginAppUser() {
  if (config.appJwt) return config.appJwt;
  const credentials = selectedAppUser();
  if (!credentials) return "";
  requireEnv("APP_USER_EMAIL", credentials.email);
  requireEnv("APP_USER_PASSWORD", credentials.password);
  const res = http.post(
    apiUrl("/auth/login"),
    JSON.stringify({ email: credentials.email, password: credentials.password }),
    jsonHeaders()
  );
  if (res.status !== 200) return "";
  const body = safeJson(res);
  return body?.token || body?.accessToken || body?.jwt || body?.session?.token || "";
}

export function loginAllAppUsers() {
  if (config.appJwt) return [config.appJwt];
  if (Array.isArray(config.appTokens) && config.appTokens.length > 0) return config.appTokens;
  if (!Array.isArray(config.appUsers) || config.appUsers.length === 0) {
    requireEnv("APP_JWT", config.appJwt);
    return [];
  }
  const tokens = [];
  for (const user of config.appUsers) {
    const email = String(user?.email || "");
    const password = String(user?.password || "");
    if (!email || !password) continue;
    const res = http.post(
      apiUrl("/auth/login"),
      JSON.stringify({ email, password }),
      jsonHeaders()
    );
    const body = safeJson(res);
    const token = body?.token || body?.accessToken || body?.jwt || body?.session?.token || "";
    if (res.status === 200 && token) tokens.push(token);
  }
  if (tokens.length === 0) fail("No app auth tokens could be created from APP_USERS_JSON/APP_JWT");
  return tokens;
}

export function requireAppTokensForProfile(tokens) {
  const required = profileVus();
  if (!Array.isArray(tokens) || tokens.length < required) {
    fail(`APP_TOKENS_JSON must contain at least ${required} valid tokens for PROFILE=${config.profile}. Received ${Array.isArray(tokens) ? tokens.length : 0}`);
  }
  return tokens;
}

export function pickToken(tokens) {
  return pickByVu(tokens);
}

export function safeJson(response) {
  try {
    return response.json();
  } catch (_error) {
    return null;
  }
}

export function sleepBetweenRequests() {
  if (config.sleepSeconds > 0) sleep(config.sleepSeconds);
}
