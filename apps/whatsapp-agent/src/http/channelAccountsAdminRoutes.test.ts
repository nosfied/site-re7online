import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || "channel-admin-test-token";
process.env.APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "channel-admin-test-secret";

type TestResponse<T = unknown> = {
  status: number;
  body: T;
};

const originalCwd = process.cwd();
let tempRoot = "";
let tenantsPath = "";
let server: Server;
let baseUrl = "";
let handleRequest: typeof import("./routes.js").handleRequest;

type ErrorPayload = {
  error?: string | { code?: string; message?: string };
  message?: string;
};

function getErrorCode(payload: ErrorPayload) {
  return typeof payload.error === "string" ? payload.error : payload.error?.code;
}

function makeTenant(id: string) {
  return {
    id,
    name: id,
    metaPhoneNumberId: `phone-${id}`,
    allowlist: [],
    handoffAttendantWaid: "",
    defaultLanguage: "pt_BR",
  };
}

async function writeTenants(payload: Record<string, unknown>) {
  await fs.mkdir(path.dirname(tenantsPath), { recursive: true });
  await fs.writeFile(tenantsPath, JSON.stringify(payload, null, 2), "utf-8");
}

async function request<T = unknown>(
  method: string,
  route: string,
  body?: unknown,
  token = process.env.ADMIN_TOKEN
): Promise<TestResponse<T>> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(token ? { "x-admin-token": token } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    body: (await response.json()) as T,
  };
}

test.before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "re7-channel-accounts-"));
  tenantsPath = path.join(tempRoot, ".data", "tenants.json");
  process.chdir(tempRoot);
  handleRequest = (await import("./routes.js")).handleRequest;
  await writeTenants({
    "tenant-a": makeTenant("tenant-a"),
    "tenant-b": makeTenant("tenant-b"),
  });
  server = createServer((req, res) => {
    void handleRequest(req, res);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
});

test.after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("GET channel-accounts returns empty list for tenant without accounts", async () => {
  const response = await request<{
    ok: boolean;
    tenantId: string;
    channelAccounts: unknown[];
  }>("GET", "/admin/tenants/tenant-a/channel-accounts");

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.tenantId, "tenant-a");
  assert.deepEqual(response.body.channelAccounts, []);
});

test("PUT creates passive channel account, coerces tenantKey, redacts tokens and creates backup", async () => {
  const response = await request<{
    ok: boolean;
    backupPath: string;
    fieldsChanged: string[];
    channelAccounts: Array<Record<string, unknown>>;
  }>("PUT", "/admin/tenants/tenant-a/channel-accounts", [
    {
      id: "primary_ig",
      tenantKey: "wrong-tenant",
      channel: "instagram",
      provider: "meta",
      displayName: "Instagram principal",
      channelAccountId: "ig-account-1",
      externalBusinessId: "business-1",
      enabled: true,
      automationEnabled: true,
      aiEnabled: true,
      handoffEnabled: true,
      status: "connected",
      tokenStatus: "configured",
      token: "secret-token",
      accessToken: "secret-access-token",
      pageAccessToken: "secret-page-token",
      businessToken: "secret-business-token",
    },
  ]);

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.deepEqual(response.body.fieldsChanged, ["channelAccounts"]);
  assert.equal(response.body.channelAccounts.length, 1);
  assert.equal(response.body.channelAccounts[0]?.tenantKey, "tenant-a");
  assert.equal(response.body.channelAccounts[0]?.channelAccountId, "ig-account-1");
  assert.equal("token" in (response.body.channelAccounts[0] ?? {}), false);
  assert.equal("accessToken" in (response.body.channelAccounts[0] ?? {}), false);
  assert.equal("pageAccessToken" in (response.body.channelAccounts[0] ?? {}), false);
  assert.equal("businessToken" in (response.body.channelAccounts[0] ?? {}), false);

  const backupStat = await fs.stat(response.body.backupPath);
  assert.equal(backupStat.isFile(), true);
});

test("GET channel-accounts never returns token fields", async () => {
  const response = await request<{
    ok: boolean;
    channelAccounts: Array<Record<string, unknown>>;
  }>("GET", "/admin/tenants/tenant-a/channel-accounts");

  assert.equal(response.status, 200);
  assert.equal(response.body.channelAccounts.length, 1);
  assert.equal("token" in (response.body.channelAccounts[0] ?? {}), false);
  assert.equal("accessToken" in (response.body.channelAccounts[0] ?? {}), false);
  assert.equal("pageAccessToken" in (response.body.channelAccounts[0] ?? {}), false);
  assert.equal("businessToken" in (response.body.channelAccounts[0] ?? {}), false);
});

test("PUT deduplicates repeated accounts and drops invalid items", async () => {
  const response = await request<{
    ok: boolean;
    channelAccounts: Array<Record<string, unknown>>;
  }>("PUT", "/admin/tenants/tenant-b/channel-accounts", [
    {
      tenantKey: "tenant-b",
      channel: "messenger",
      provider: "meta",
      channelAccountId: "page-1",
      enabled: true,
    },
    {
      tenantKey: "tenant-b",
      channel: "messenger",
      provider: "meta",
      channelAccountId: "page-1",
      enabled: true,
    },
    {
      tenantKey: "tenant-b",
      channel: "instagram",
      provider: "meta",
      enabled: true,
    },
  ]);

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.channelAccounts.length, 1);
  assert.equal(response.body.channelAccounts[0]?.channel, "messenger");
  assert.equal(response.body.channelAccounts[0]?.channelAccountId, "page-1");
});

test("PUT rejects non-array channelAccounts payload", async () => {
  const response = await request<ErrorPayload>(
    "PUT",
    "/admin/tenants/tenant-b/channel-accounts",
    { channelAccounts: { channel: "instagram" } }
  );

  assert.equal(response.status, 400);
  assert.equal(getErrorCode(response.body), "bad_request");
});

test("missing tenant and missing superadmin fail safely", async () => {
  const missingTenant = await request<ErrorPayload>(
    "GET",
    "/admin/tenants/missing/channel-accounts"
  );
  const unauthorized = await request<ErrorPayload>(
    "GET",
    "/admin/tenants/tenant-a/channel-accounts",
    undefined,
    ""
  );

  assert.equal(missingTenant.status, 404);
  assert.equal(getErrorCode(missingTenant.body), "tenant_not_found");
  assert.equal(unauthorized.status, 401);
  assert.equal(getErrorCode(unauthorized.body), "unauthorized");
});
