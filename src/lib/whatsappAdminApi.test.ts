import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdminTrainingContentUrl,
  describeAdminTemplateSubmissionError,
  formatAdminTemplateDiagnosticStage,
  readAdminTemplateSubmissionDiagnostic,
  resolveAdminApiBaseUrl,
  submitAdminTemplateRequestToMeta,
  updateTenantById,
  type AdminConnection,
} from "./whatsappAdminApi";

test("template submission preserves a structured 5xx diagnosis and uses its dedicated timeout budget", async () => {
  setWindowLocation("https://admin.example.test/admin/templates/manage");
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const observedTimeouts: number[] = [];
  Object.assign(globalThis, {
    setTimeout: ((handler: TimerHandler, timeout?: number) => {
      observedTimeouts.push(timeout ?? 0);
      return originalSetTimeout(handler, timeout);
    }) as typeof setTimeout,
    fetch: async () => new Response(JSON.stringify({
      error: "meta_template_media_upload_failed",
      message: "Nao foi possivel enviar o template para a Meta.",
      details: "Detalhe seguro.",
      diagnostic: {
        stage: "binary_upload",
        httpStatus: 500,
        code: "100",
        subcode: "200",
        type: "OAuthException",
        traceId: "safe-trace",
        message: "A Meta recusou a midia.",
      },
    }), { status: 502, headers: { "content-type": "application/json" } }),
  });

  try {
    await assert.rejects(
      submitAdminTemplateRequestToMeta({ baseUrl: "/agent-api", adminToken: "admin", rememberToken: false }, "request-id"),
      (value: unknown) => {
        const described = describeAdminTemplateSubmissionError(value);
        assert.equal(described.message, "Nao foi possivel enviar o template para a Meta.");
        assert.deepEqual(described.diagnostic, {
          stage: "binary_upload",
          httpStatus: 500,
          code: "100",
          subcode: "200",
          type: "OAuthException",
          traceId: "safe-trace",
          message: "A Meta recusou a midia.",
        });
        return true;
      }
    );
  } finally {
    Object.assign(globalThis, { fetch: originalFetch, setTimeout: originalSetTimeout });
  }
  assert.deepEqual(observedTimeouts, [58_000]);
});

test("unknown administrative responses keep the generic fallback", () => {
  assert.equal(readAdminTemplateSubmissionDiagnostic({ stage: "binary_upload" }), null);
  assert.deepEqual(describeAdminTemplateSubmissionError(new Error("Erro ao submeter template para a Meta.")), {
    message: "Erro ao submeter template para a Meta.",
    diagnostic: null,
  });
  assert.equal(formatAdminTemplateDiagnosticStage("binary_upload"), "Envio dos bytes da mídia");
  assert.equal(formatAdminTemplateDiagnosticStage("unknown"), "Etapa não identificada");
});

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
