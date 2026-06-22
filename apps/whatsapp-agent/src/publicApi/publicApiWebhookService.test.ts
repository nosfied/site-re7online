import test from "node:test";
import assert from "node:assert/strict";
import {
  createWebhookEndpoint,
  decryptWebhookSigningSecret,
  dispatchWebhookDelivery,
  encryptWebhookSigningSecret,
  generateWebhookShadowDelivery,
  hashWebhookSigningSecret,
  rotateWebhookEndpointSecret,
  signWebhookPayload,
  updateWebhookEndpoint,
  validateWebhookEndpointUrl,
} from "./publicApiWebhookService.js";

const TEST_WEBHOOK_ENCRYPTION_KEY = "test-webhook-secret-encryption-key-32";

function makeDate(value: string) {
  return new Date(value);
}

function makePrisma() {
  const state = {
    clients: [
      {
        id: "tenant_a",
        clientKey: "tenant-a",
        status: "ACTIVE",
        features: { webhooks: true, webhookDispatch: true, webhookDispatchExecute: true },
        profile: "government",
      },
      {
        id: "tenant_b",
        clientKey: "tenant-b",
        status: "ACTIVE",
        features: { webhooks: false, webhookDispatch: false, webhookDispatchExecute: false },
        profile: "government",
      },
    ] as Array<Record<string, unknown>>,
    endpoints: [] as Array<Record<string, unknown>>,
    deliveries: [] as Array<Record<string, unknown>>,
    attempts: [] as Array<Record<string, unknown>>,
    events: [] as Array<Record<string, unknown>>,
  };
  return {
    state,
    client: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        state.clients.find((item) => item.id === where.id) ?? null,
    },
    webhookEndpoint: {
      count: async ({ where }: { where: Record<string, unknown> }) =>
        state.endpoints.filter((item) => item.clientId === where.clientId).length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const item = {
          id: `endpoint_${state.endpoints.length + 1}`,
          createdAt: makeDate("2026-06-22T12:00:00.000Z"),
          updatedAt: makeDate("2026-06-22T12:00:00.000Z"),
          ...data,
        };
        state.endpoints.push(item);
        return item;
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.endpoints.find((item) => item.id === where.id && item.clientId === where.clientId) ?? null,
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const index = state.endpoints.findIndex((item) => item.id === where.id);
        assert.notEqual(index, -1);
        const item = {
          ...state.endpoints[index],
          ...data,
          updatedAt: makeDate("2026-06-22T12:05:00.000Z"),
        };
        state.endpoints[index] = item;
        return item;
      },
    },
    webhookDelivery: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const item = {
          id: `delivery_${state.deliveries.length + 1}`,
          createdAt: makeDate("2026-06-22T12:10:00.000Z"),
          updatedAt: makeDate("2026-06-22T12:10:00.000Z"),
          ...data,
        };
        state.deliveries.push(item);
        return item;
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const index = state.deliveries.findIndex((item) => item.id === where.id);
        assert.notEqual(index, -1);
        const item = {
          ...state.deliveries[index],
          ...data,
          updatedAt: makeDate("2026-06-22T12:11:00.000Z"),
        };
        state.deliveries[index] = item;
        return item;
      },
    },
    webhookAttempt: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const item = {
          id: `attempt_${state.attempts.length + 1}`,
          createdAt: makeDate("2026-06-22T12:10:01.000Z"),
          ...data,
        };
        state.attempts.push(item);
        return item;
      },
    },
    $transaction: async (operations: Array<Promise<unknown>>) => await Promise.all(operations),
    event: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.events.push(data);
        return data;
      },
    },
  };
}

function encryptedEndpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: "endpoint_1",
    clientId: "tenant_a",
    name: "ERP",
    url: "https://integracao.example.gov.br/webhook",
    active: true,
    signingSecretHash: hashWebhookSigningSecret("whsec_real"),
    signingSecretCiphertext: encryptWebhookSigningSecret("whsec_real"),
    signingSecretKeyVersion: "WEBHOOK_SECRET_ENCRYPTION_KEY",
    signingSecretRotatedAt: makeDate("2026-06-22T12:00:00.000Z"),
    createdAt: makeDate("2026-06-22T12:00:00.000Z"),
    updatedAt: makeDate("2026-06-22T12:00:00.000Z"),
    ...overrides,
  };
}

test("validates webhook URLs and blocks obvious SSRF targets", () => {
  assert.equal(validateWebhookEndpointUrl("https://integracao.example.gov.br/webhook").ok, true);
  assert.equal(validateWebhookEndpointUrl("http://integracao.example.gov.br/webhook").ok, false);
  assert.equal(validateWebhookEndpointUrl("https://localhost/webhook").ok, false);
  assert.equal(validateWebhookEndpointUrl("https://127.0.0.1/webhook").ok, false);
  assert.equal(validateWebhookEndpointUrl("https://10.0.0.5/webhook").ok, false);
  assert.equal(validateWebhookEndpointUrl("https://192.168.1.20/webhook").ok, false);
});

test("shadow delivery blocks disabled feature without persisting delivery", async () => {
  const prisma = makePrisma();
  const result = await generateWebhookShadowDelivery({
    prisma: prisma as any,
    clientId: "tenant_b",
    endpointId: "endpoint_1",
    eventType: "message.received",
    requestId: "req_shadow_disabled",
  });
  assert.deepEqual(result, { ok: false, error: "feature_disabled" });
  assert.equal(prisma.state.deliveries.length, 0);
  assert.equal(prisma.state.events[0].eventName, "webhook.shadow.denied");
});

test("shadow delivery blocks endpoint from another tenant", async () => {
  const prisma = makePrisma();
  prisma.state.endpoints.push({
    id: "endpoint_1",
    clientId: "tenant_b",
    name: "Outro tenant",
    url: "https://integracao.example.gov.br/webhook",
    active: true,
    signingSecretHash: "hash",
    createdAt: makeDate("2026-06-22T12:00:00.000Z"),
    updatedAt: makeDate("2026-06-22T12:00:00.000Z"),
  });
  const result = await generateWebhookShadowDelivery({
    prisma: prisma as any,
    clientId: "tenant_a",
    endpointId: "endpoint_1",
    eventType: "message.received",
    requestId: "req_shadow_cross_tenant",
  });
  assert.deepEqual(result, { ok: false, error: "webhook_endpoint_not_found" });
  assert.equal(prisma.state.deliveries.length, 0);
  assert.equal(prisma.state.events[0].eventName, "webhook.shadow.skipped");
});

test("shadow delivery blocks inactive endpoint", async () => {
  const prisma = makePrisma();
  prisma.state.endpoints.push({
    id: "endpoint_1",
    clientId: "tenant_a",
    name: "Inativo",
    url: "https://integracao.example.gov.br/webhook",
    active: false,
    signingSecretHash: "hash",
    createdAt: makeDate("2026-06-22T12:00:00.000Z"),
    updatedAt: makeDate("2026-06-22T12:00:00.000Z"),
  });
  const result = await generateWebhookShadowDelivery({
    prisma: prisma as any,
    clientId: "tenant_a",
    endpointId: "endpoint_1",
    eventType: "message.received",
    requestId: "req_shadow_inactive",
  });
  assert.deepEqual(result, { ok: false, error: "webhook_endpoint_inactive" });
  assert.equal(prisma.state.deliveries.length, 0);
});

test("shadow delivery dry-run calculates payload hash and HMAC without persistence", async () => {
  const prisma = makePrisma();
  prisma.state.endpoints.push({
    id: "endpoint_1",
    clientId: "tenant_a",
    name: "ERP",
    url: "https://integracao.example.gov.br/webhook",
    active: true,
    signingSecretHash: "stored_hash",
    createdAt: makeDate("2026-06-22T12:00:00.000Z"),
    updatedAt: makeDate("2026-06-22T12:00:00.000Z"),
  });
  const result = await generateWebhookShadowDelivery({
    prisma: prisma as any,
    clientId: "tenant_a",
    endpointId: "endpoint_1",
    eventType: "message.received",
    payload: { id: "evt_1", type: "message.received", data: { text: "Oi" } },
    requestId: "req_shadow_dry_run",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.headers["X-Converta-Signature"], /^sha256=[a-f0-9]{64}$/);
  assert.equal(result.recorded, false);
  assert.equal(prisma.state.deliveries.length, 0);
  assert.equal(prisma.state.attempts.length, 0);
  assert.equal(prisma.state.events[0].eventName, "webhook.shadow.generated");
});

test("shadow delivery can persist delivery and skipped attempt", async () => {
  const prisma = makePrisma();
  prisma.state.endpoints.push({
    id: "endpoint_1",
    clientId: "tenant_a",
    name: "ERP",
    url: "https://integracao.example.gov.br/webhook",
    active: true,
    signingSecretHash: "stored_hash",
    createdAt: makeDate("2026-06-22T12:00:00.000Z"),
    updatedAt: makeDate("2026-06-22T12:00:00.000Z"),
  });
  const result = await generateWebhookShadowDelivery({
    prisma: prisma as any,
    clientId: "tenant_a",
    endpointId: "endpoint_1",
    eventType: "message.sent",
    requestId: "req_shadow_record",
    recordAttempts: true,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.recorded, true);
  assert.equal(result.delivery?.status, "shadow");
  assert.equal(result.attempt?.status, "skipped");
  assert.equal(prisma.state.deliveries.length, 1);
  assert.equal(prisma.state.attempts.length, 1);
});

test("shadow delivery uses decrypted signing secret when ciphertext exists", async () => {
  const previous = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = TEST_WEBHOOK_ENCRYPTION_KEY;
  const prisma = makePrisma();
  prisma.state.endpoints.push({
    id: "endpoint_1",
    clientId: "tenant_a",
    name: "ERP",
    url: "https://integracao.example.gov.br/webhook",
    active: true,
    signingSecretHash: "stored_hash",
    signingSecretCiphertext: encryptWebhookSigningSecret("whsec_real"),
    signingSecretKeyVersion: "WEBHOOK_SECRET_ENCRYPTION_KEY",
    signingSecretRotatedAt: makeDate("2026-06-22T12:00:00.000Z"),
    createdAt: makeDate("2026-06-22T12:00:00.000Z"),
    updatedAt: makeDate("2026-06-22T12:00:00.000Z"),
  });
  try {
    const result = await generateWebhookShadowDelivery({
      prisma: prisma as any,
      clientId: "tenant_a",
      endpointId: "endpoint_1",
      eventType: "message.received",
      payload: { id: "evt_1", type: "message.received", data: { text: "Oi" } },
      requestId: "req_shadow_real_secret",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.signatureMode, "encrypted_secret");
    assert.equal(result.headers["X-Converta-Signature-Mode"], "encrypted_secret");
    assert.match(result.headers["X-Converta-Signature"], /^sha256=[a-f0-9]{64}$/);
  } finally {
    if (previous === undefined) delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    else process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = previous;
  }
});

test("controlled dispatch dry-run signs payload without HTTP or persistence", async () => {
  const previous = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = TEST_WEBHOOK_ENCRYPTION_KEY;
  const prisma = makePrisma();
  prisma.state.endpoints.push(encryptedEndpoint());
  try {
    const result = await dispatchWebhookDelivery({
      prisma: prisma as any,
      clientId: "tenant_a",
      endpointId: "endpoint_1",
      eventType: "message.received",
      requestId: "req_dispatch_dry_run",
      execute: false,
      httpPost: async () => {
        throw new Error("http should not be called");
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.executed, false);
    assert.equal(result.httpCalled, false);
    assert.equal(result.delivery, null);
    assert.match(result.headers["X-Converta-Signature"], /^sha256=[a-f0-9]{64}$/);
    assert.equal(prisma.state.deliveries.length, 0);
    assert.equal(prisma.state.attempts.length, 0);
    assert.equal(prisma.state.events[0].eventName, "webhook.dispatch.started");
  } finally {
    if (previous === undefined) delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    else process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = previous;
  }
});

test("controlled dispatch execute sends once and marks delivery delivered", async () => {
  const previous = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = TEST_WEBHOOK_ENCRYPTION_KEY;
  const prisma = makePrisma();
  prisma.state.endpoints.push(encryptedEndpoint());
  try {
    const result = await dispatchWebhookDelivery({
      prisma: prisma as any,
      clientId: "tenant_a",
      endpointId: "endpoint_1",
      eventType: "message.sent",
      requestId: "req_dispatch_execute",
      execute: true,
      httpPost: async ({ headers }) => {
        assert.equal(headers["X-Converta-Event"], "message.sent");
        assert.match(headers["X-Converta-Signature"], /^sha256=[a-f0-9]{64}$/);
        assert.equal(typeof headers["X-Converta-Delivery-Id"], "string");
        return { ok: true, responseCode: 204, responseBodyHash: "hash", durationMs: 12, redirected: false };
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.executed, true);
    assert.equal(result.httpCalled, true);
    assert.equal(result.delivery?.status, "delivered");
    assert.equal(result.attempt?.status, "delivered");
    assert.equal(result.responseCode, 204);
    assert.equal(prisma.state.deliveries[0].status, "delivered");
    assert.equal(prisma.state.attempts[0].responseCode, 204);
    assert.equal(prisma.state.events[prisma.state.events.length - 1]?.eventName, "webhook.dispatch.succeeded");
  } finally {
    if (previous === undefined) delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    else process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = previous;
  }
});

test("controlled dispatch execute records 4xx and 5xx failures without retry", async () => {
  const previous = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = TEST_WEBHOOK_ENCRYPTION_KEY;
  const prisma = makePrisma();
  prisma.state.endpoints.push(encryptedEndpoint());
  try {
    const result = await dispatchWebhookDelivery({
      prisma: prisma as any,
      clientId: "tenant_a",
      endpointId: "endpoint_1",
      eventType: "message.received",
      requestId: "req_dispatch_4xx",
      execute: true,
      httpPost: async () => ({
        ok: false,
        responseCode: 403,
        responseBodyHash: "hash_403",
        errorCode: "http_4xx",
        durationMs: 10,
        redirected: false,
      }),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.delivery?.status, "failed");
    assert.equal(result.attempt?.status, "failed");
    assert.equal(result.responseCode, 403);
    assert.equal(result.errorCode, "http_4xx");
    assert.equal(prisma.state.attempts.length, 1);

    const serverError = await dispatchWebhookDelivery({
      prisma: prisma as any,
      clientId: "tenant_a",
      endpointId: "endpoint_1",
      eventType: "message.received",
      requestId: "req_dispatch_5xx",
      execute: true,
      httpPost: async () => ({
        ok: false,
        responseCode: 503,
        responseBodyHash: "hash_503",
        errorCode: "http_5xx",
        durationMs: 11,
        redirected: false,
      }),
    });
    assert.equal(serverError.ok, true);
    if (!serverError.ok) return;
    assert.equal(serverError.delivery?.status, "failed");
    assert.equal(serverError.attempt?.status, "failed");
    assert.equal(serverError.errorCode, "http_5xx");

    const timeout = await dispatchWebhookDelivery({
      prisma: prisma as any,
      clientId: "tenant_a",
      endpointId: "endpoint_1",
      eventType: "message.received",
      requestId: "req_dispatch_timeout",
      execute: true,
      httpPost: async () => ({
        ok: false,
        errorCode: "timeout",
        durationMs: 5000,
      }),
    });
    assert.equal(timeout.ok, true);
    if (!timeout.ok) return;
    assert.equal(timeout.delivery?.status, "failed");
    assert.equal(timeout.attempt?.status, "failed");
    assert.equal(timeout.errorCode, "timeout");

    const blocked = await dispatchWebhookDelivery({
      prisma: prisma as any,
      clientId: "tenant_a",
      endpointId: "endpoint_1",
      eventType: "message.received",
      requestId: "req_dispatch_ssrf",
      execute: true,
      httpPost: async () => ({
        ok: false,
        errorCode: "ssrf_blocked",
        durationMs: 0,
      }),
    });
    assert.equal(blocked.ok, true);
    if (!blocked.ok) return;
    assert.equal(blocked.delivery?.status, "dead_letter");
    assert.equal(blocked.attempt?.status, "dead_letter");
    assert.equal(blocked.errorCode, "ssrf_blocked");
  } finally {
    if (previous === undefined) delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    else process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = previous;
  }
});

test("controlled dispatch blocks tenant mismatch, inactive endpoint and disabled flags", async () => {
  const previous = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = TEST_WEBHOOK_ENCRYPTION_KEY;
  const prisma = makePrisma();
  prisma.state.endpoints.push(encryptedEndpoint({ active: false }));
  try {
    const disabled = await dispatchWebhookDelivery({
      prisma: prisma as any,
      clientId: "tenant_b",
      endpointId: "endpoint_1",
      eventType: "message.received",
      requestId: "req_dispatch_disabled",
      execute: false,
    });
    assert.deepEqual(disabled, { ok: false, error: "feature_disabled" });

    const missing = await dispatchWebhookDelivery({
      prisma: prisma as any,
      clientId: "tenant_a",
      endpointId: "endpoint_other",
      eventType: "message.received",
      requestId: "req_dispatch_missing",
      execute: false,
    });
    assert.deepEqual(missing, { ok: false, error: "webhook_endpoint_not_found" });

    const inactive = await dispatchWebhookDelivery({
      prisma: prisma as any,
      clientId: "tenant_a",
      endpointId: "endpoint_1",
      eventType: "message.received",
      requestId: "req_dispatch_inactive",
      execute: false,
    });
    assert.deepEqual(inactive, { ok: false, error: "webhook_endpoint_inactive" });
  } finally {
    if (previous === undefined) delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    else process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = previous;
  }
});

test("controlled dispatch requires execute flag feature and encrypted secret", async () => {
  const previous = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = TEST_WEBHOOK_ENCRYPTION_KEY;
  const prisma = makePrisma();
  prisma.state.endpoints.push(encryptedEndpoint());
  try {
    prisma.state.clients[0].features = { webhooks: true, webhookDispatch: true, webhookDispatchExecute: false };
    const executeDenied = await dispatchWebhookDelivery({
      prisma: prisma as any,
      clientId: "tenant_a",
      endpointId: "endpoint_1",
      eventType: "message.received",
      requestId: "req_dispatch_execute_denied",
      execute: true,
    });
    assert.deepEqual(executeDenied, { ok: false, error: "execute_disabled" });

    prisma.state.clients[0].features = { webhooks: true, webhookDispatch: true, webhookDispatchExecute: true };
    prisma.state.endpoints[0].signingSecretCiphertext = null;
    const legacyDenied = await dispatchWebhookDelivery({
      prisma: prisma as any,
      clientId: "tenant_a",
      endpointId: "endpoint_1",
      eventType: "message.received",
      requestId: "req_dispatch_legacy_denied",
      execute: true,
    });
    assert.deepEqual(legacyDenied, { ok: false, error: "webhook_secret_not_encrypted" });
  } finally {
    if (previous === undefined) delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    else process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = previous;
  }
});

test("shadow delivery rejects unsafe payload fields", async () => {
  const prisma = makePrisma();
  prisma.state.endpoints.push({
    id: "endpoint_1",
    clientId: "tenant_a",
    name: "ERP",
    url: "https://integracao.example.gov.br/webhook",
    active: true,
    signingSecretHash: "stored_hash",
    createdAt: makeDate("2026-06-22T12:00:00.000Z"),
    updatedAt: makeDate("2026-06-22T12:00:00.000Z"),
  });
  const result = await generateWebhookShadowDelivery({
    prisma: prisma as any,
    clientId: "tenant_a",
    endpointId: "endpoint_1",
    eventType: "message.received",
    payload: { id: "evt_1", data: { rawPayload: { private: true } } },
    requestId: "req_shadow_unsafe",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "unsafe_payload");
  assert.equal(prisma.state.deliveries.length, 0);
});

test("creates endpoint with one-time secret and hash-only storage", async () => {
  const previous = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = TEST_WEBHOOK_ENCRYPTION_KEY;
  const prisma = makePrisma();
  try {
    const result = await createWebhookEndpoint({
      prisma: prisma as any,
      clientId: "tenant_a",
      userId: "user_1",
      requestId: "req_1",
      name: "ERP",
      url: "https://integracao.example.gov.br/webhook",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.secret, /^whsec_/);
    assert.equal(result.endpoint.secretStatus, "encrypted");
    const stored = prisma.state.endpoints[0];
    assert.equal(stored.signingSecretHash, hashWebhookSigningSecret(result.secret));
    assert.notEqual(stored.signingSecretHash, result.secret);
    assert.equal(typeof stored.signingSecretCiphertext, "string");
    assert.equal(decryptWebhookSigningSecret(String(stored.signingSecretCiphertext)), result.secret);
    assert.equal(prisma.state.events[0].eventName, "webhook.endpoint.created");
  } finally {
    if (previous === undefined) delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    else process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = previous;
  }
});

test("create endpoint blocks missing or weak encryption key", async () => {
  const previous = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  const prisma = makePrisma();
  try {
    const result = await createWebhookEndpoint({
      prisma: prisma as any,
      clientId: "tenant_a",
      userId: "user_1",
      requestId: "req_no_key",
      name: "ERP",
      url: "https://integracao.example.gov.br/webhook",
    });
    assert.deepEqual(result, { ok: false, error: "webhook_secret_encryption_key_missing_or_weak" });
    assert.equal(prisma.state.endpoints.length, 0);
  } finally {
    if (previous === undefined) delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    else process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = previous;
  }
});

test("rotates endpoint secret once and keeps tenant isolation", async () => {
  const previous = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = TEST_WEBHOOK_ENCRYPTION_KEY;
  const prisma = makePrisma();
  prisma.state.endpoints.push({
    id: "endpoint_1",
    clientId: "tenant_a",
    name: "ERP",
    url: "https://integracao.example.gov.br/webhook",
    active: true,
    signingSecretHash: "old_hash",
    signingSecretCiphertext: encryptWebhookSigningSecret("whsec_old"),
    signingSecretKeyVersion: "WEBHOOK_SECRET_ENCRYPTION_KEY",
    signingSecretRotatedAt: makeDate("2026-06-22T12:00:00.000Z"),
    createdAt: makeDate("2026-06-22T12:00:00.000Z"),
    updatedAt: makeDate("2026-06-22T12:00:00.000Z"),
  });
  try {
    const denied = await rotateWebhookEndpointSecret({
      prisma: prisma as any,
      clientId: "tenant_b",
      userId: "user_1",
      requestId: "req_rotate_denied",
      endpointId: "endpoint_1",
    });
    assert.deepEqual(denied, { ok: false, error: "webhook_endpoint_not_found" });

    const result = await rotateWebhookEndpointSecret({
      prisma: prisma as any,
      clientId: "tenant_a",
      userId: "user_1",
      requestId: "req_rotate",
      endpointId: "endpoint_1",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.secret, /^whsec_/);
    assert.notEqual(result.secret, "whsec_old");
    const stored = prisma.state.endpoints[0];
    assert.equal(stored.signingSecretHash, hashWebhookSigningSecret(result.secret));
    assert.equal(decryptWebhookSigningSecret(String(stored.signingSecretCiphertext)), result.secret);
    assert.equal(prisma.state.events[0].eventName, "webhook.endpoint.secret_rotated");
  } finally {
    if (previous === undefined) delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    else process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = previous;
  }
});

test("updates endpoint only inside the tenant scope", async () => {
  const prisma = makePrisma();
  prisma.state.endpoints.push({
    id: "endpoint_1",
    clientId: "tenant_a",
    name: "ERP",
    url: "https://integracao.example.gov.br/webhook",
    active: true,
    signingSecretHash: "hash",
    createdAt: makeDate("2026-06-22T12:00:00.000Z"),
    updatedAt: makeDate("2026-06-22T12:00:00.000Z"),
  });
  const denied = await updateWebhookEndpoint({
    prisma: prisma as any,
    clientId: "tenant_b",
    userId: "user_1",
    requestId: "req_2",
    endpointId: "endpoint_1",
    active: false,
  });
  assert.deepEqual(denied, { ok: false, error: "webhook_endpoint_not_found" });

  const updated = await updateWebhookEndpoint({
    prisma: prisma as any,
    clientId: "tenant_a",
    userId: "user_1",
    requestId: "req_3",
    endpointId: "endpoint_1",
    active: false,
  });
  assert.equal(updated.ok, true);
  if (!updated.ok) return;
  assert.equal(updated.endpoint.active, false);
  assert.equal(prisma.state.events[0].eventName, "webhook.endpoint.disabled");
});

test("signs webhook payloads deterministically without leaking the secret", () => {
  const signature = signWebhookPayload({
    secret: "whsec_test",
    timestamp: "1770000000",
    payload: "{\"event\":\"message.received\"}",
  });
  assert.match(signature, /^sha256=[a-f0-9]{64}$/);
  assert.equal(
    signature,
    signWebhookPayload({
      secret: "whsec_test",
      timestamp: "1770000000",
      payload: "{\"event\":\"message.received\"}",
    })
  );
});
