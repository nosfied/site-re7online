#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

const DEFAULT_TENANT = "demo-prefeitura";
const DEFAULT_BASE_URL = "http://127.0.0.1:3001";
const DEFAULT_ORIGIN = "https://loadtest.converta.local";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, "load-tests/k6/results/fixtures.env");
const DEFAULT_MANIFEST_FILE = path.join(REPO_ROOT, "load-tests/k6/results/fixtures-manifest.json");

dotenv.config({ path: path.join(SCRIPT_DIR, "..", ".env") });

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      args._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function randomSecret(prefix = "Lt78N2") {
  return `${prefix}-${crypto.randomBytes(14).toString("base64url")}!`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function parseEnvValue(value) {
  const raw = String(value || "").trim();
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replace(/'\\''/g, "'");
  }
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw.slice(1, -1);
    }
  }
  return raw;
}

function safeUrl(baseUrl, pathname, query = {}) {
  const url = new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function readJsonResponse(response, context) {
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  if (!response.ok) {
    const code = body?.error?.code || body?.error || response.status;
    throw new Error(`${context}_failed:${response.status}:${code}`);
  }
  return body;
}

async function requestJson(method, url, body, headers = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return readJsonResponse(response, `${method} ${new URL(url).pathname}`);
}

async function login(baseUrl, email, password) {
  const body = await requestJson("POST", safeUrl(baseUrl, "/auth/login"), { email, password });
  const token = body.token || body.accessToken || body.jwt || body.session?.token || "";
  if (!token) throw new Error(`login_missing_token:${email}`);
  return token;
}

async function createUser(baseUrl, adminToken, tenant, input) {
  const body = await requestJson(
    "POST",
    safeUrl(baseUrl, "/admin/users", { clientKey: tenant }),
    input,
    { "X-Admin-Token": adminToken }
  );
  return body.user;
}

async function listDepartments(baseUrl, adminToken, tenant) {
  const body = await requestJson(
    "GET",
    safeUrl(baseUrl, "/admin/departments", { clientKey: tenant }),
    undefined,
    { "X-Admin-Token": adminToken }
  );
  return Array.isArray(body.items) ? body.items : [];
}

async function updateUser(baseUrl, adminToken, tenant, userId, input) {
  const body = await requestJson(
    "PATCH",
    safeUrl(baseUrl, `/admin/users/${encodeURIComponent(userId)}`, { clientKey: tenant }),
    input,
    { "X-Admin-Token": adminToken }
  );
  return body.user;
}

async function createApiKey(baseUrl, token, name, scopes, expiresAt) {
  const body = await requestJson(
    "POST",
    safeUrl(baseUrl, "/app/api-keys"),
    { name, scopes, expiresAt },
    { Authorization: `Bearer ${token}` }
  );
  return { key: body.key, secret: body.secret };
}

async function revokeApiKey(baseUrl, token, keyId) {
  return requestJson(
    "POST",
    safeUrl(baseUrl, `/app/api-keys/${encodeURIComponent(keyId)}/revoke`),
    {},
    { Authorization: `Bearer ${token}` }
  );
}

async function createWebchatFixture(baseUrl, token, runId, origin) {
  const siteBody = await requestJson(
    "POST",
    safeUrl(baseUrl, "/app/webchat/sites"),
    {
      name: `Load Test ${runId}`,
      slug: `load-test-${runId}`,
      status: "active",
    },
    { Authorization: `Bearer ${token}` }
  );
  const site = siteBody.site;
  await requestJson(
    "POST",
    safeUrl(baseUrl, "/app/webchat/settings"),
    {
      siteId: site.id,
      welcomeMessage: "Load test fixture",
      collectName: true,
      collectEmail: true,
      collectPhone: false,
      allowAnonymous: true,
      theme: { primaryColor: "#2563eb" },
    },
    { Authorization: `Bearer ${token}` }
  );
  const originHost = new URL(origin).hostname;
  await requestJson(
    "POST",
    safeUrl(baseUrl, "/app/webchat/domains"),
    { siteId: site.id, domain: originHost, active: true },
    { Authorization: `Bearer ${token}` }
  );
  const sessionBody = await requestJson(
    "POST",
    safeUrl(baseUrl, "/webchat/v1/session"),
    {
      siteId: site.id,
      visitorId: `load-test-${runId}`,
      visitor: {
        name: "Visitante Load Test",
        email: `visitor-${runId}@loadtest.local`,
      },
    },
    { Origin: origin }
  );
  const sessionToken = sessionBody.sessionToken || sessionBody.token;
  if (!sessionToken) throw new Error("webchat_session_missing_token");
  const inboundBody = await requestJson(
    "POST",
    safeUrl(baseUrl, "/webchat/v1/messages"),
    {
      sessionToken,
      text: `Mensagem inbound load test ${runId}`,
    },
    { Origin: origin }
  );
  const conversationId = inboundBody.conversation?.waId || inboundBody.conversation?.id || "";
  if (!conversationId) throw new Error("webchat_conversation_missing_id");
  await requestJson(
    "POST",
    safeUrl(baseUrl, `/app/conversation/${encodeURIComponent(conversationId)}/claim`),
    {},
    { Authorization: `Bearer ${token}` }
  );
  await requestJson(
    "POST",
    safeUrl(baseUrl, `/app/conversation/${encodeURIComponent(conversationId)}/send`),
    { text: `Resposta outbound load test ${runId}` },
    { Authorization: `Bearer ${token}` }
  );
  return { site, sessionToken, conversationId, origin, outboundCreated: true, outboundSkippedReason: null };
}

async function listWebchatSites(baseUrl, token) {
  const body = await requestJson(
    "GET",
    safeUrl(baseUrl, "/app/webchat"),
    undefined,
    { Authorization: `Bearer ${token}` }
  );
  return Array.isArray(body.sites) ? body.sites : [];
}

async function archiveWebchatSite(baseUrl, token, siteId) {
  return requestJson(
    "PUT",
    safeUrl(baseUrl, `/app/webchat/sites/${encodeURIComponent(siteId)}`),
    { name: `Archived ${siteId.slice(0, 8)}`, slug: `archived-${siteId.slice(0, 8)}`, status: "archived" },
    { Authorization: `Bearer ${token}` }
  );
}

async function cleanupSearchIndexes(tenant) {
  const prisma = new PrismaClient();
  try {
    const client = await prisma.client.findUnique({
      where: { clientKey: tenant },
      select: { id: true },
    });
    if (!client) return 0;
    const result = await prisma.searchIndex.deleteMany({
      where: { clientId: client.id },
    });
    return result.count;
  } finally {
    await prisma.$disconnect();
  }
}

async function writeFixtureFiles(params) {
  const outputDir = path.dirname(params.out);
  await fs.mkdir(outputDir, { recursive: true });
  const appUsers = params.appUsers
    .filter((item) => item.role === "ADMIN" || item.role === "SUPERVISOR")
    .map((item) => ({ email: item.email, password: item.password }));
  const loginUsers = params.loginUsers.map((item) => ({ email: item.email, password: item.password }));
  const env = {
    API_BASE_URL: params.baseUrl,
    LOGIN_USERS_JSON: JSON.stringify(loginUsers),
    APP_USERS_JSON: JSON.stringify(appUsers),
    APP_TOKENS_JSON: JSON.stringify(params.appAuthTokens || []),
    PUBLIC_API_KEYS_JSON: JSON.stringify(params.publicApiSecrets),
    CONVERSATION_ID: params.conversationId,
    SEARCH_QUERY: params.searchQuery,
  };
  const envLines = Object.entries(env).map(([key, value]) => `${key}=${shellQuote(value)}`).concat("");
  await fs.writeFile(params.out, envLines.join("\n"), { mode: 0o600 });
  await fs.writeFile(params.manifest, `${JSON.stringify(params.manifestData, null, 2)}\n`, { mode: 0o600 });
}

async function prepare(options) {
  const tenant = String(options.tenant || DEFAULT_TENANT);
  const baseUrl = String(options["base-url"] || process.env.API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const adminToken = String(options["admin-token"] || process.env.ADMIN_TOKEN || "");
  if (!adminToken) throw new Error("missing_admin_token");
  const runId = String(options["run-id"] || `78n2-${Date.now().toString(36)}`).replace(/[^a-zA-Z0-9-]/g, "-");
  const userCount = Math.max(1, Math.min(Number(options.users || 20), 50));
  const loginUserCount = Math.max(1, Math.min(Number(options["login-users"] || 2), 10));
  const apiKeyCount = Math.max(1, Math.min(Number(options["api-keys"] || userCount), 50));
  const origin = String(options.origin || DEFAULT_ORIGIN);
  const out = String(options.out || DEFAULT_ENV_FILE);
  const manifest = String(options.manifest || DEFAULT_MANIFEST_FILE);
  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

  const appUsers = [];
  const loginUsers = [];
  const appAuthTokens = [];
  const publicApiKeys = [];
  const publicApiSecrets = [];
  const departments = await listDepartments(baseUrl, adminToken, tenant);
  const defaultDepartment = departments.find((item) => item?.isActive !== false) || departments[0];
  if (!defaultDepartment?.id) throw new Error("fixture_department_required");
  let webchat = null;
  const persistPartial = async () => {
    await writeFixtureFiles({
      out,
      manifest,
      baseUrl,
      appUsers,
      loginUsers,
      appAuthTokens,
      publicApiSecrets,
      conversationId: webchat?.conversationId ?? "",
      searchQuery: "load test",
      manifestData: {
        runId,
        tenant,
        baseUrl,
        origin,
        createdAt: new Date().toISOString(),
        expiresAt,
        partial: !webchat,
        users: [...appUsers, ...loginUsers].map(({ password, ...item }) => item),
        appUsers: appUsers.map(({ password, ...item }) => item),
        loginUsers: loginUsers.map(({ password, ...item }) => item),
        appTokenCount: appAuthTokens.length,
        publicApiKeys,
        webchat: webchat
          ? {
              siteId: webchat.site.id,
              conversationId: webchat.conversationId,
              outboundCreated: webchat.outboundCreated,
              outboundSkippedReason: webchat.outboundSkippedReason,
              origin,
            }
          : null,
        envFile: out,
      },
    });
  };

  for (let index = 0; index < userCount; index += 1) {
    const role = index === 0 ? "ADMIN" : "SUPERVISOR";
    const email = `loadtest-${runId}-${String(index + 1).padStart(2, "0")}@${tenant}.local`;
    const password = randomSecret();
    const user = await createUser(baseUrl, adminToken, tenant, {
      name: `Load Test ${runId} ${index + 1}`,
      email,
      password,
      role,
      ...(role === "AGENT" || role === "SUPERVISOR" ? { departmentId: defaultDepartment.id } : {}),
      isActive: true,
    });
    appUsers.push({ id: user.id, email, password, role, departmentId: user.departmentId ?? null, purpose: "app-load" });
    await persistPartial();
  }

  for (let index = 0; index < loginUserCount; index += 1) {
    const email = `loadtest-login-${runId}-${String(index + 1).padStart(2, "0")}@${tenant}.local`;
    const password = randomSecret();
    const user = await createUser(baseUrl, adminToken, tenant, {
      name: `Load Test Login ${runId} ${index + 1}`,
      email,
      password,
      role: "AGENT",
      departmentId: defaultDepartment.id,
      isActive: true,
    });
    loginUsers.push({ id: user.id, email, password, role: "AGENT", departmentId: user.departmentId ?? null, purpose: "login-only" });
    await persistPartial();
  }

  const adminUser = appUsers.find((item) => item.role === "ADMIN") || appUsers[0];
  const adminJwt = await login(baseUrl, adminUser.email, adminUser.password);
  appAuthTokens.push(adminJwt);
  for (const user of appUsers.filter((item) => item.role === "SUPERVISOR")) {
    appAuthTokens.push(await login(baseUrl, user.email, user.password));
  }
  await persistPartial();
  for (let index = 0; index < apiKeyCount; index += 1) {
    const created = await createApiKey(
      baseUrl,
      adminJwt,
      `load-test-${runId}-${String(index + 1).padStart(2, "0")}`,
      ["read", "contacts", "conversations", "messages"],
      expiresAt
    );
    publicApiKeys.push({ id: created.key.id, keyPrefix: created.key.keyPrefix, scopes: created.key.scopes });
    publicApiSecrets.push(created.secret);
    await persistPartial();
  }

  webchat = await createWebchatFixture(baseUrl, adminJwt, runId, origin);

  const manifestData = {
    runId,
    tenant,
    baseUrl,
    origin,
    createdAt: new Date().toISOString(),
    expiresAt,
    users: [...appUsers, ...loginUsers].map(({ password, ...item }) => item),
    appUsers: appUsers.map(({ password, ...item }) => item),
    loginUsers: loginUsers.map(({ password, ...item }) => item),
    appTokenCount: appAuthTokens.length,
    publicApiKeys,
    webchat: {
      siteId: webchat.site.id,
      conversationId: webchat.conversationId,
      outboundCreated: webchat.outboundCreated,
      outboundSkippedReason: webchat.outboundSkippedReason,
      origin,
    },
    envFile: out,
  };
  await writeFixtureFiles({
    out,
    manifest,
    baseUrl,
    appUsers,
    loginUsers,
    appAuthTokens,
    publicApiSecrets,
    conversationId: webchat.conversationId,
    searchQuery: "load test",
    manifestData,
  });
  console.log(JSON.stringify({ ok: true, runId, tenant, users: appUsers.length + loginUsers.length, appUsers: appUsers.length, loginUsers: loginUsers.length, appTokens: appAuthTokens.length, apiKeys: publicApiKeys.length, conversationId: webchat.conversationId, envFile: out, manifest }, null, 2));
}

async function cleanup(options) {
  const tenant = String(options.tenant || DEFAULT_TENANT);
  const baseUrl = String(options["base-url"] || process.env.API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const adminToken = String(options["admin-token"] || process.env.ADMIN_TOKEN || "");
  if (!adminToken) throw new Error("missing_admin_token");
  const manifestPath = String(options.manifest || DEFAULT_MANIFEST_FILE);
  const envPath = String(options.out || DEFAULT_ENV_FILE);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const envText = await fs.readFile(envPath, "utf8").catch(() => "");
  const usersJson = parseEnvValue(envText.match(/^LOGIN_USERS_JSON=(.*)$/m)?.[1] || "[]");
  const usersWithPasswords = JSON.parse(usersJson);
  const adminCandidate = usersWithPasswords.find((item) => /-01@/.test(item.email)) || usersWithPasswords[0];
  let adminJwt = "";
  const archivedSiteIds = new Set();
  if (adminCandidate) {
    try {
      adminJwt = await login(baseUrl, adminCandidate.email, adminCandidate.password);
    } catch {
      adminJwt = "";
    }
  }
  if (adminJwt) {
    for (const key of manifest.publicApiKeys || []) {
      await revokeApiKey(baseUrl, adminJwt, key.id).catch(() => null);
    }
    if (manifest.webchat?.siteId) {
      await archiveWebchatSite(baseUrl, adminJwt, manifest.webchat.siteId).catch(() => null);
      archivedSiteIds.add(manifest.webchat.siteId);
    }
    const sites = await listWebchatSites(baseUrl, adminJwt).catch(() => []);
    for (const site of sites) {
      if (
        site?.id &&
        !archivedSiteIds.has(site.id) &&
        (String(site.slug || "").startsWith("load-test-") || String(site.name || "").startsWith("Load Test "))
      ) {
        await archiveWebchatSite(baseUrl, adminJwt, site.id).catch(() => null);
        archivedSiteIds.add(site.id);
      }
    }
  }
  for (const user of manifest.users || []) {
    await updateUser(baseUrl, adminToken, tenant, user.id, { isActive: false }).catch(() => null);
  }
  const searchIndexesDeleted = await cleanupSearchIndexes(tenant).catch(() => 0);
  await fs.rm(envPath, { force: true }).catch(() => null);
  await fs.rm(manifestPath, { force: true }).catch(() => null);
  console.log(JSON.stringify({ ok: true, runId: manifest.runId, usersDeactivated: manifest.users?.length ?? 0, apiKeysRevoked: manifest.publicApiKeys?.length ?? 0, webchatArchived: archivedSiteIds.size, searchIndexesDeleted }, null, 2));
}

async function status(options) {
  const manifestPath = String(options.manifest || DEFAULT_MANIFEST_FILE);
  const manifestText = await fs.readFile(manifestPath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (!manifestText) {
    console.log(JSON.stringify({ ok: true, prepared: false, manifest: manifestPath }, null, 2));
    return;
  }
  const manifest = JSON.parse(manifestText);
  console.log(JSON.stringify({
    ok: true,
    prepared: true,
    runId: manifest.runId,
    tenant: manifest.tenant,
    users: manifest.users?.length ?? 0,
    appUsers: manifest.appUsers?.length ?? null,
    loginUsers: manifest.loginUsers?.length ?? null,
    appTokenCount: manifest.appTokenCount ?? null,
    apiKeys: manifest.publicApiKeys?.length ?? 0,
    hasConversationId: Boolean(manifest.webchat?.conversationId),
    envFile: manifest.envFile,
    expiresAt: manifest.expiresAt,
  }, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const command = options._[0] || "prepare";
  if (command === "prepare") return prepare(options);
  if (command === "cleanup") return cleanup(options);
  if (command === "status") return status(options);
  throw new Error(`unknown_command:${command}`);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
