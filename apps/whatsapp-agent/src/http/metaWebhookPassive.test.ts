import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ChannelAdapterRegistry } from "../channels/channelAdapterRegistry.js";
import { clearDryRunSessions, listDryRunSessions } from "../channels/channelDryRunSessions.js";
import { clearObservedChannelEvents } from "../channels/observedChannelEvents.js";
import type { TenantConfig } from "../config/tenantConfig.js";

process.env.WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "meta-webhook-test-token";
process.env.APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "meta-webhook-test-secret";
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || "meta-webhook-admin-test-token";

const originalCwd = process.cwd();
const originalMetaAppSecret = process.env.META_APP_SECRET;
const originalNodeEnv = process.env.NODE_ENV;
let tempRoot = "";
let tenantsPath = "";
let server: Server;
let baseUrl = "";
let handleRequest: typeof import("./routes.js").handleRequest;
let processPassiveMetaWebhookPayload: typeof import("./metaWebhookPassive.js").processPassiveMetaWebhookPayload;
let verifyPassiveMetaWebhookSignature: typeof import("./metaWebhookPassive.js").verifyPassiveMetaWebhookSignature;

const messengerPayload = {
  object: "page",
  entry: [
    {
      id: "page-1",
      messaging: [
        {
          sender: { id: "psid-1" },
          recipient: { id: "page-1" },
          timestamp: 1778760000000,
          message: {
            mid: "mid-1",
            text: "olá",
          },
        },
      ],
    },
  ],
};

function messengerPayloadWithText(text: string, mid: string) {
  return {
    object: "page",
    entry: [
      {
        id: "page-1",
        messaging: [
          {
            sender: { id: "psid-1" },
            recipient: { id: "page-1" },
            timestamp: 1778760000000,
            message: {
              mid,
              text,
            },
          },
        ],
      },
    ],
  };
}

function tenantWithQualification(): TenantConfig {
  return {
    id: "tenant-a",
    name: "Tenant A",
    metaPhoneNumberId: "phone-tenant-a",
    allowlist: [],
    handoffAttendantWaid: "",
    defaultLanguage: "pt_BR",
    aiAssistantHandoffKeywords: ["atendente", "humano"],
    aiQualification: {
      enabled: true,
      semanticResolverEnabled: true,
      schemaVersion: "1",
      slots: [
        {
          key: "tipo_atendimento",
          label: "Tipo de atendimento",
          type: "enum",
          required: true,
          allowedValues: ["atacado", "varejo"],
          captureHints: ["atacado", "varejo"],
          question: "Você procura atendimento para atacado ou varejo?",
        },
        {
          key: "produto_interesse",
          label: "Produto de interesse",
          type: "text",
          required: true,
          question: "Qual produto?",
        },
        {
          key: "duvida_principal",
          label: "Dúvida principal",
          type: "enum",
          required: false,
          allowedValues: ["catalogo", "valores", "disponibilidade"],
          semanticAliases: { catalogo: ["modelos"] },
          captureHints: ["catalogo", "preco"],
          askAfter: ["produto_interesse"],
          question: "Você quer catálogo, valores ou disponibilidade?",
        },
      ],
      handoffWhen: ["duvida_principal"],
    },
    channelAccounts: [
      {
        id: "messenger-page-1",
        tenantKey: "tenant-a",
        channel: "messenger",
        provider: "meta",
        channelAccountId: "page-1",
        enabled: true,
      },
    ],
  };
}

async function writeTenants() {
  await fs.mkdir(path.dirname(tenantsPath), { recursive: true });
  await fs.writeFile(
    tenantsPath,
    JSON.stringify(
      {
        "tenant-a": {
          id: "tenant-a",
          name: "Tenant A",
          metaPhoneNumberId: "phone-tenant-a",
          allowlist: [],
          handoffAttendantWaid: "",
          defaultLanguage: "pt_BR",
          channelAccounts: [
            {
              id: "messenger-page-1",
              tenantKey: "tenant-a",
              channel: "messenger",
              provider: "meta",
              channelAccountId: "page-1",
              enabled: true,
            },
          ],
        },
      },
      null,
      2
    ),
    "utf-8"
  );
}

function signRawBody(rawBody: string, secret: string) {
  return `sha256=${crypto.createHmac("sha256", secret).update(Buffer.from(rawBody)).digest("hex")}`;
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

async function post(route: string, body: unknown, signature?: string) {
  const rawBody = JSON.stringify(body);
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature ? { "x-hub-signature-256": signature } : {}),
    },
    body: rawBody,
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function adminRequest(method: string, route: string, token = process.env.ADMIN_TOKEN) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(token ? { "x-admin-token": token } : {}),
    },
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function adminJsonRequest(
  method: string,
  route: string,
  body: unknown,
  token = process.env.ADMIN_TOKEN
) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-admin-token": token } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function flushPassiveWebhookProcessing() {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

test.before(async () => {
  process.env.META_APP_SECRET = "";
  process.env.NODE_ENV = "test";
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "re7-meta-webhook-"));
  tenantsPath = path.join(tempRoot, ".data", "tenants.json");
  process.chdir(tempRoot);
  await writeTenants();

  handleRequest = (await import("./routes.js")).handleRequest;
  const metaWebhook = await import("./metaWebhookPassive.js");
  processPassiveMetaWebhookPayload = metaWebhook.processPassiveMetaWebhookPayload;
  verifyPassiveMetaWebhookSignature = metaWebhook.verifyPassiveMetaWebhookSignature;

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

test.beforeEach(() => {
  clearDryRunSessions();
  clearObservedChannelEvents();
});

test.after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  process.chdir(originalCwd);
  restoreEnv("META_APP_SECRET", originalMetaAppSecret);
  restoreEnv("NODE_ENV", originalNodeEnv);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("GET meta webhook challenge with valid token returns challenge", async () => {
  const response = await fetch(
    `${baseUrl}/meta/webhook?hub.mode=subscribe&hub.verify_token=meta-webhook-test-token&hub.challenge=challenge-1`
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "challenge-1");
});

test("GET meta webhook challenge with invalid token returns 403", async () => {
  const response = await fetch(
    `${baseUrl}/meta/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-1`
  );

  assert.equal(response.status, 403);
});

test("POST meta webhook Messenger payload returns 200", async () => {
  const response = await post("/meta/webhook", messengerPayload);

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  await flushPassiveWebhookProcessing();
});

test("observed channel events admin endpoint requires superadmin and returns redacted events", async () => {
  await flushPassiveWebhookProcessing();
  clearObservedChannelEvents();
  await processPassiveMetaWebhookPayload(messengerPayload, {
    requestId: "test-request",
    tenants: {
      "tenant-a": {
        id: "tenant-a",
        name: "Tenant A",
        metaPhoneNumberId: "phone-tenant-a",
        allowlist: [],
        handoffAttendantWaid: "",
        defaultLanguage: "pt_BR",
        channelAccounts: [
          {
            id: "messenger-page-1",
            tenantKey: "tenant-a",
            channel: "messenger",
            provider: "meta",
            channelAccountId: "page-1",
            enabled: true,
          },
        ],
      },
    },
  });

  const unauthorized = await adminRequest("GET", "/admin/channel-events/observed", "");
  const response = await adminRequest("GET", "/admin/channel-events/observed");

  assert.equal(unauthorized.status, 401);
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.count, 1);
  const rawResponse = JSON.stringify(response.body);
  assert.equal(rawResponse.includes("olá"), false);
  assert.equal(rawResponse.includes("psid-1"), false);
  assert.equal(rawResponse.includes("raw"), false);
  assert.equal(rawResponse.includes("token"), false);
  assert.equal(rawResponse.includes("externalUserHash"), true);
});

test("observed channel events admin DELETE clears buffer", async () => {
  await flushPassiveWebhookProcessing();
  clearObservedChannelEvents();
  await processPassiveMetaWebhookPayload(messengerPayload, {
    requestId: "test-request",
    tenants: {
      "tenant-a": {
        id: "tenant-a",
        name: "Tenant A",
        metaPhoneNumberId: "phone-tenant-a",
        allowlist: [],
        handoffAttendantWaid: "",
        defaultLanguage: "pt_BR",
        channelAccounts: [
          {
            id: "messenger-page-1",
            tenantKey: "tenant-a",
            channel: "messenger",
            provider: "meta",
            channelAccountId: "page-1",
            enabled: true,
          },
        ],
      },
    },
  });

  const deleted = await adminRequest("DELETE", "/admin/channel-events/observed");
  const listed = await adminRequest("GET", "/admin/channel-events/observed");

  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.cleared, 1);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.count, 0);
});

test("dry-run sessions admin endpoint requires superadmin and returns redacted sessions", async () => {
  await processPassiveMetaWebhookPayload(messengerPayloadWithText("varejo", "mid-dry-1"), {
    requestId: "test-request",
    tenants: {
      "tenant-a": tenantWithQualification(),
    },
  });

  const unauthorized = await adminRequest("GET", "/admin/channel-events/dry-run-sessions", "");
  const response = await adminRequest("GET", "/admin/channel-events/dry-run-sessions");

  assert.equal(unauthorized.status, 401);
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.count, 1);
  const rawResponse = JSON.stringify(response.body);
  assert.equal(rawResponse.includes("psid-1"), false);
  assert.equal(rawResponse.includes("raw"), false);
  assert.equal(rawResponse.includes("token"), false);
  assert.equal(rawResponse.includes("externalUserHash"), true);
  assert.equal(rawResponse.includes("tipo_atendimento"), true);
});

test("dry-run sessions admin DELETE clears sessions", async () => {
  await processPassiveMetaWebhookPayload(messengerPayloadWithText("varejo", "mid-dry-1"), {
    requestId: "test-request",
    tenants: {
      "tenant-a": tenantWithQualification(),
    },
  });

  const deleted = await adminRequest("DELETE", "/admin/channel-events/dry-run-sessions");
  const listed = await adminRequest("GET", "/admin/channel-events/dry-run-sessions");

  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.cleared, 1);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.count, 0);
});

test("channel runtime readiness endpoint requires superadmin and returns redacted report", async () => {
  await processPassiveMetaWebhookPayload(messengerPayloadWithText("varejo", "mid-readiness-1"), {
    requestId: "test-request",
    tenants: {
      "tenant-a": tenantWithQualification(),
    },
  });

  const unauthorized = await adminRequest("GET", "/admin/channel-runtime-readiness", "");
  const response = await adminRequest("GET", "/admin/channel-runtime-readiness?tenant=tenant-a&channel=messenger");

  assert.equal(unauthorized.status, 401);
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.count, 1);
  const reports = response.body.reports as Array<Record<string, unknown>>;
  const report = reports[0] as Record<string, unknown>;
  assert.equal(report.tenantKey, "tenant-a");
  assert.equal(report.channel, "messenger");
  assert.equal(report.channelAccountId, "page-1");
  assert.equal((report.observed as Record<string, unknown>).totalEvents, 1);
  assert.equal(typeof (report.observed as Record<string, unknown>).lastEventAt, "string");
  assert.equal((report.observed as Record<string, unknown>).lastResolution, "matched_enabled");
  assert.equal((report.dryRun as Record<string, unknown>).sessions, 1);
  assert.equal(((report.gate as Record<string, unknown>).allowed as boolean), false);
  assert.equal(
    ((report.readiness as Record<string, unknown>).blockers as string[]).includes("runtime_disabled"),
    true
  );
  const rawResponse = JSON.stringify(response.body);
  assert.equal(rawResponse.includes("varejo"), false);
  assert.equal(rawResponse.includes("psid-1"), false);
  assert.equal(rawResponse.includes("raw"), false);
  assert.equal(rawResponse.includes("externalUserHash"), false);
});

test("channel runtime readiness endpoint supports empty tenant filter", async () => {
  const response = await adminRequest("GET", "/admin/channel-runtime-readiness?tenant=missing-tenant");

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.count, 0);
  assert.deepEqual(response.body.reports, []);
});

test("channel runtime preflight endpoint requires superadmin and returns dry-run result", async () => {
  const previousSecret = process.env.META_APP_SECRET;
  process.env.META_APP_SECRET = "configured-secret";
  try {
    const payload = {
      tenantKey: "tenant-a",
      channel: "messenger",
      provider: "meta",
      channelAccountId: "page-1",
      mode: "dry_run",
    };
    const unauthorized = await adminJsonRequest("POST", "/admin/channel-runtime-preflight", payload, "");
    const response = await adminJsonRequest("POST", "/admin/channel-runtime-preflight", payload);

    assert.equal(unauthorized.status, 401);
    assert.equal(response.status, 200);
    assert.equal(response.body.ok, false);
    const preflight = response.body.preflight as Record<string, unknown>;
    assert.equal(preflight.tenantKey, "tenant-a");
    assert.equal(preflight.channel, "messenger");
    assert.equal(preflight.channelAccountId, "page-1");
    assert.equal((preflight.summary as Record<string, unknown>).canPersist, false);
    assert.equal((preflight.summary as Record<string, unknown>).canSendOutbound, false);
    assert.equal((preflight.blockers as string[]).includes("runtime_disabled"), true);
    const rawResponse = JSON.stringify(response.body);
    assert.equal(rawResponse.includes("psid-1"), false);
    assert.equal(rawResponse.includes("raw"), false);
    assert.equal(rawResponse.includes("externalUserHash"), false);
    assert.equal(rawResponse.includes("configured-secret"), false);
  } finally {
    restoreEnv("META_APP_SECRET", previousSecret);
  }
});

test("channel runtime preflight endpoint reports runtime candidate blocked by unsupported persistence and outbound", async () => {
  const previousSecret = process.env.META_APP_SECRET;
  process.env.META_APP_SECRET = "configured-secret";
  try {
    const updated = await adminJsonRequest("PUT", "/admin/tenants/tenant-a/channel-accounts", {
      channelAccounts: [
        {
          id: "messenger-page-1",
          tenantKey: "tenant-a",
          channel: "messenger",
          provider: "meta",
          channelAccountId: "page-1",
          enabled: true,
          automationEnabled: true,
          runtimeEnabled: true,
          outboundEnabled: false,
          aiEnabled: true,
          handoffEnabled: true,
          status: "connected",
          tokenStatus: "configured",
        },
      ],
    });
    assert.equal(updated.status, 200);

    const response = await adminJsonRequest("POST", "/admin/channel-runtime-preflight", {
      tenantKey: "tenant-a",
      channel: "messenger",
      provider: "meta",
      channelAccountId: "page-1",
      mode: "runtime_candidate",
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.ok, false);
    const preflight = response.body.preflight as Record<string, unknown>;
    assert.equal((preflight.summary as Record<string, unknown>).canDryRun, true);
    assert.equal((preflight.summary as Record<string, unknown>).canAttemptRuntime, false);
    assert.equal((preflight.blockers as string[]).includes("persistence_not_implemented"), true);
    assert.equal((preflight.blockers as string[]).includes("outbound_not_implemented"), true);
  } finally {
    restoreEnv("META_APP_SECRET", previousSecret);
    await writeTenants();
  }
});

test("passive webhook dry-run session reuses state across multiple Messenger turns", async () => {
  const tenants = {
    "tenant-a": tenantWithQualification(),
  };

  await processPassiveMetaWebhookPayload(messengerPayloadWithText("varejo", "mid-turn-1"), {
    requestId: "test-request-1",
    tenants,
  });
  await processPassiveMetaWebhookPayload(messengerPayloadWithText("blusa", "mid-turn-2"), {
    requestId: "test-request-2",
    tenants,
  });
  await processPassiveMetaWebhookPayload(messengerPayloadWithText("quero ver os modelos", "mid-turn-3"), {
    requestId: "test-request-3",
    tenants,
  });

  const sessions = listDryRunSessions();
  assert.equal(sessions.length, 1);
  const [session] = sessions;
  assert.equal(session.turnCount, 3);
  assert.equal(session.aiQualification?.slots?.tipo_atendimento, "varejo");
  assert.equal(session.aiQualification?.slots?.produto_interesse, "blusa");
  assert.equal(session.aiQualification?.slots?.duvida_principal, "catalogo");
  assert.equal(session.aiQualification?.readyForHandoff, true);
  assert.equal(session.lastDryRunResult?.readyForHandoff, true);
  assert.equal(session.lastDryRunResult?.wouldPersist, false);
  assert.equal(session.lastDryRunResult?.wouldSendOutbound, false);
  assert.equal(session.lastShadowPlan?.summary.wouldPersist, false);
  assert.equal(session.lastShadowPlan?.summary.wouldSendOutbound, false);
  assert.equal(session.lastShadowPlan?.gate.reason, "automation_disabled");
  const rawSession = JSON.stringify(session);
  assert.equal(rawSession.includes("psid-1"), false);
  assert.equal(rawSession.includes("quero ver os modelos"), false);
  assert.equal(rawSession.includes("raw"), false);
  assert.equal(rawSession.includes("conversationKey"), false);
});

test("POST meta webhook accepts valid signature when secret is configured", async () => {
  const previousSecret = process.env.META_APP_SECRET;
  process.env.META_APP_SECRET = "signature-secret";
  try {
    const rawBody = JSON.stringify(messengerPayload);
    const response = await post(
      "/meta/webhook",
      messengerPayload,
      signRawBody(rawBody, "signature-secret")
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
  } finally {
    restoreEnv("META_APP_SECRET", previousSecret);
  }
});

test("POST meta webhook rejects invalid signature when secret is configured", async () => {
  const previousSecret = process.env.META_APP_SECRET;
  process.env.META_APP_SECRET = "signature-secret";
  try {
    const response = await post("/meta/webhook", messengerPayload, "sha256=deadbeef");

    assert.equal(response.status, 403);
  } finally {
    restoreEnv("META_APP_SECRET", previousSecret);
  }
});

test("POST meta webhook rejects missing signature when secret is configured", async () => {
  const previousSecret = process.env.META_APP_SECRET;
  process.env.META_APP_SECRET = "signature-secret";
  try {
    const response = await post("/meta/webhook", messengerPayload);

    assert.equal(response.status, 403);
  } finally {
    restoreEnv("META_APP_SECRET", previousSecret);
  }
});

test("POST meta webhook unsupported Instagram-like payload returns 200", async () => {
  const response = await post("/meta/webhook", {
    object: "instagram",
    entry: [{ id: "ig-account-1", messaging: [] }],
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
});

test("POST meta webhook invalid json returns 400", async () => {
  const response = await fetch(`${baseUrl}/meta/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{invalid",
  });

  assert.equal(response.status, 400);
});

test("signature helper allows missing secret outside production", () => {
  const previousSecret = process.env.META_APP_SECRET;
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.META_APP_SECRET;
  process.env.NODE_ENV = "test";
  try {
    const result = verifyPassiveMetaWebhookSignature(Buffer.from("{}"), undefined, "test-request");

    assert.deepEqual(result, { ok: true, status: "skipped" });
  } finally {
    restoreEnv("META_APP_SECRET", previousSecret);
    restoreEnv("NODE_ENV", previousNodeEnv);
  }
});

test("signature helper blocks missing secret in production", () => {
  const previousSecret = process.env.META_APP_SECRET;
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.META_APP_SECRET;
  process.env.NODE_ENV = "production";
  try {
    const result = verifyPassiveMetaWebhookSignature(Buffer.from("{}"), undefined, "test-request");

    assert.deepEqual(result, { ok: false, statusCode: 503, reason: "missing_app_secret" });
  } finally {
    restoreEnv("META_APP_SECRET", previousSecret);
    restoreEnv("NODE_ENV", previousNodeEnv);
  }
});

test("passive processor normalizes Messenger and resolves tenant from channelAccounts", async () => {
  const result = await processPassiveMetaWebhookPayload(messengerPayload, {
    requestId: "test-request",
    tenants: {
      "tenant-a": {
        id: "tenant-a",
        name: "Tenant A",
        metaPhoneNumberId: "phone-tenant-a",
        allowlist: [],
        handoffAttendantWaid: "",
        defaultLanguage: "pt_BR",
        channelAccounts: [
          {
            id: "messenger-page-1",
            tenantKey: "tenant-a",
            channel: "messenger",
            provider: "meta",
            channelAccountId: "page-1",
            enabled: true,
          },
        ],
      },
    },
  });

  assert.deepEqual(result, { ok: true, normalizedCount: 1, unsupportedCount: 0 });
});

test("passive processor observes disabled account without normalizing", async () => {
  const result = await processPassiveMetaWebhookPayload(messengerPayload, {
    requestId: "test-request",
    tenants: {
      "tenant-a": {
        id: "tenant-a",
        name: "Tenant A",
        metaPhoneNumberId: "phone-tenant-a",
        allowlist: [],
        handoffAttendantWaid: "",
        defaultLanguage: "pt_BR",
        channelAccounts: [
          {
            id: "messenger-page-1",
            tenantKey: "tenant-a",
            channel: "messenger",
            provider: "meta",
            channelAccountId: "page-1",
            enabled: false,
            status: "disabled",
          },
        ],
      },
    },
  });

  assert.deepEqual(result, { ok: true, normalizedCount: 0, unsupportedCount: 1 });
});

test("passive processor logs blocked runtime gate for matched account without runtime flags", async () => {
  const originalInfo = console.info;
  const lines: string[] = [];
  console.info = (...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    await processPassiveMetaWebhookPayload(messengerPayload, {
      requestId: "test-request",
      tenants: {
        "tenant-a": {
          id: "tenant-a",
          name: "Tenant A",
          metaPhoneNumberId: "phone-tenant-a",
          allowlist: [],
          handoffAttendantWaid: "",
          defaultLanguage: "pt_BR",
          channelAccounts: [
            {
              id: "messenger-page-1",
              tenantKey: "tenant-a",
              channel: "messenger",
              provider: "meta",
              channelAccountId: "page-1",
              enabled: true,
              status: "connected",
            },
          ],
        },
      },
    });
  } finally {
    console.info = originalInfo;
  }

  const joined = lines.join("\n");
  assert.equal(joined.includes("channel.runtime_gate.blocked"), true);
  assert.equal(joined.includes("channel.runtime_shadow_plan.created"), true);
  assert.equal(joined.includes('"reason":"automation_disabled"'), true);
  assert.equal(joined.includes('"wouldEnterRuntime":false'), true);
  assert.equal(joined.includes('"wouldSendOutbound":false'), true);
});

test("passive processor logs allowed runtime gate without executing real runtime", async () => {
  const originalInfo = console.info;
  const lines: string[] = [];
  console.info = (...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    await processPassiveMetaWebhookPayload(messengerPayload, {
      requestId: "test-request",
      tenants: {
        "tenant-a": {
          id: "tenant-a",
          name: "Tenant A",
          metaPhoneNumberId: "phone-tenant-a",
          allowlist: [],
          handoffAttendantWaid: "",
          defaultLanguage: "pt_BR",
          channelAccounts: [
            {
              id: "messenger-page-1",
              tenantKey: "tenant-a",
              channel: "messenger",
              provider: "meta",
              channelAccountId: "page-1",
              enabled: true,
              automationEnabled: true,
              runtimeEnabled: true,
              outboundEnabled: true,
              aiEnabled: true,
              handoffEnabled: true,
              status: "connected",
            },
          ],
        },
      },
    });
  } finally {
    console.info = originalInfo;
  }

  const joined = lines.join("\n");
  assert.equal(joined.includes("channel.runtime_gate.allowed"), true);
  assert.equal(joined.includes("channel.runtime_shadow_plan.created"), true);
  assert.equal(joined.includes('"reason":"runtime_allowed"'), true);
  assert.equal(joined.includes('"outboundAllowed":true'), true);
  assert.equal(joined.includes('"aiAllowed":true'), true);
  assert.equal(joined.includes('"handoffAllowed":true'), true);
  assert.equal(joined.includes('"wouldEnterRuntime":true'), true);
  assert.equal(joined.includes('"wouldSendOutbound":true'), true);
  assert.equal(joined.includes("channel.runtime_dry_run.completed"), true);
  assert.equal(joined.includes('"wouldPersist":false'), true);
  assert.equal(joined.includes('"dryRun":true'), true);
  assert.equal(joined.includes('"orchestratorExecuted":false'), true);
  assert.equal(joined.includes("olá"), false);
  assert.equal(joined.includes("psid-1"), false);
});

test("passive processor logs no raw text or PSID", async () => {
  const originalInfo = console.info;
  const lines: string[] = [];
  console.info = (...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    await processPassiveMetaWebhookPayload(messengerPayload, {
      requestId: "test-request",
      tenants: {
        "tenant-a": {
          id: "tenant-a",
          name: "Tenant A",
          metaPhoneNumberId: "phone-tenant-a",
          allowlist: [],
          handoffAttendantWaid: "",
          defaultLanguage: "pt_BR",
          channelAccounts: [
            {
              id: "messenger-page-1",
              tenantKey: "tenant-a",
              channel: "messenger",
              provider: "meta",
              channelAccountId: "page-1",
              enabled: true,
              status: "connected",
            },
          ],
        },
      },
    });
  } finally {
    console.info = originalInfo;
  }

  const joined = lines.join("\n");
  assert.equal(joined.includes("olá"), false);
  assert.equal(joined.includes("psid-1"), false);
  assert.equal(joined.includes("externalUserHash"), true);
  assert.equal(joined.includes("channel.webhook.passive_received"), true);
  assert.equal(joined.includes("channel.tenant_resolution.matched_enabled"), true);
  assert.equal(joined.includes("channel.runtime_gate.blocked"), true);
  assert.equal(joined.includes("channel.runtime_shadow_plan.created"), true);
  assert.equal(joined.includes("channel.runtime_dry_run.completed"), true);
  assert.equal(joined.includes('"wouldPersist":false'), true);
  assert.equal(joined.includes('"wouldSendOutbound":false'), true);
});

test("passive processor does not throw when Messenger adapter is missing", async () => {
  const result = await processPassiveMetaWebhookPayload(messengerPayload, {
    requestId: "test-request",
    registry: new ChannelAdapterRegistry(),
    tenants: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.normalizedCount, 0);
  assert.equal(result.unsupportedCount, 1);
});
