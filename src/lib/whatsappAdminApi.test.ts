import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdminTrainingContentUrl,
  resolveAdminApiBaseUrl,
  updateTenantById,
  type AdminConnection,
} from "./whatsappAdminApi";

function setWindowLocation(href: string) {
  Object.assign(globalThis, {
    window: {
      location: new URL(href),
    },
  });
}

test("admin API base URL normalization uses agent-api for empty or root same-origin inputs", () => {
  setWindowLocation("https://admin.example.test/admin/tenants/demo");

  assert.equal(resolveAdminApiBaseUrl(""), "/agent-api");
  assert.equal(resolveAdminApiBaseUrl("/"), "/agent-api");
  assert.equal(resolveAdminApiBaseUrl("https://admin.example.test"), "/agent-api");
  assert.equal(resolveAdminApiBaseUrl("https://admin.example.test/"), "/agent-api");
});

test("admin API base URL normalization preserves canonical proxy path once", () => {
  setWindowLocation("https://admin.example.test/admin/tenants/demo");

  assert.equal(resolveAdminApiBaseUrl("/agent-api"), "/agent-api");
  assert.equal(resolveAdminApiBaseUrl("/agent-api/"), "/agent-api");
  assert.equal(resolveAdminApiBaseUrl("https://admin.example.test/agent-api"), "/agent-api");
  assert.equal(resolveAdminApiBaseUrl("https://admin.example.test/agent-api/"), "/agent-api");
});

test("admin API base URL normalization canonicalizes external bases to agent-api", () => {
  setWindowLocation("https://admin.example.test/admin/tenants/demo");

  assert.equal(resolveAdminApiBaseUrl("https://api.re7online.com"), "/agent-api");
  assert.equal(resolveAdminApiBaseUrl("https://api.example.test/"), "/agent-api");
  assert.equal(resolveAdminApiBaseUrl("http://127.0.0.1:3001/"), "/agent-api");
  assert.equal(resolveAdminApiBaseUrl("https://other.example.test/admin"), "/agent-api");
});

test("admin API base URL normalization rejects accidental frontend-relative paths", () => {
  setWindowLocation("https://admin.example.test/admin/tenants/demo");

  assert.equal(resolveAdminApiBaseUrl("/admin"), "");
  assert.equal(resolveAdminApiBaseUrl("/api"), "");
  assert.equal(resolveAdminApiBaseUrl("https://admin.example.test/admin"), "");
});

test("tenant update uses canonical agent-api path for same-origin root configuration", async () => {
  setWindowLocation("https://admin.example.test/admin/tenants/demo");
  const calls: Array<{ url: string; method: string; body: string | null }> = [];
  const originalFetch = globalThis.fetch;
  Object.assign(globalThis, {
    fetch: async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : null,
      });
      return new Response(
        JSON.stringify({
          ok: true,
          tenantId: "cra-pr",
          tenant: {},
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    },
  });

  try {
    const connection: AdminConnection = {
      baseUrl: "https://admin.example.test/",
      adminToken: "admin-token",
      rememberToken: false,
    };

    await updateTenantById(connection, "cra-pr", {
      webSessionAlertEmails: ["ops@example.test"],
    });
  } finally {
    Object.assign(globalThis, { fetch: originalFetch });
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "/agent-api/admin/tenants/cra-pr");
  assert.equal(calls[0]?.method, "PUT");
  assert.deepEqual(JSON.parse(calls[0]?.body ?? "{}"), {
    webSessionAlertEmails: ["ops@example.test"],
  });
});

test("tenant update ignores stale external admin base URLs", async () => {
  setWindowLocation("https://converta.re7online.com/admin/tenants/cra-pr");
  const calls: Array<{ url: string; method: string; body: string | null }> = [];
  const originalFetch = globalThis.fetch;
  Object.assign(globalThis, {
    fetch: async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : null,
      });
      return new Response(
        JSON.stringify({
          ok: true,
          tenantId: "cra-pr",
          tenant: {},
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    },
  });

  try {
    const connection: AdminConnection = {
      baseUrl: "https://api.re7online.com",
      adminToken: "admin-token",
      rememberToken: false,
    };

    await updateTenantById(connection, "cra-pr", {
      webSessionAlertEmails: ["ops@example.test"],
    });
  } finally {
    Object.assign(globalThis, { fetch: originalFetch });
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "/agent-api/admin/tenants/cra-pr");
  assert.equal(calls[0]?.method, "PUT");
  assert.deepEqual(JSON.parse(calls[0]?.body ?? "{}"), {
    webSessionAlertEmails: ["ops@example.test"],
  });
});

test("admin training content URLs use the internal admin proxy", () => {
  setWindowLocation("https://converta.re7online.com/admin/training");

  assert.equal(
    buildAdminTrainingContentUrl(
      { baseUrl: "https://api.re7online.com", adminToken: "admin-token", rememberToken: false },
      "/admin/training/item-1/content"
    ),
    "/agent-api/admin/training/item-1/content"
  );
});
