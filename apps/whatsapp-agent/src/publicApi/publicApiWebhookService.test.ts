import test from "node:test";
import assert from "node:assert/strict";
import {
  createWebhookEndpoint,
  generateWebhookShadowDelivery,
  hashWebhookSigningSecret,
  signWebhookPayload,
  updateWebhookEndpoint,
  validateWebhookEndpointUrl,
} from "./publicApiWebhookService.js";

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
        features: { webhooks: true },
        profile: "government",
      },
      {
        id: "tenant_b",
        clientKey: "tenant-b",
        status: "ACTIVE",
        features: { webhooks: false },
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
    event: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.events.push(data);
        return data;
      },
    },
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
  const prisma = makePrisma();
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
  const stored = prisma.state.endpoints[0];
  assert.equal(stored.signingSecretHash, hashWebhookSigningSecret(result.secret));
  assert.notEqual(stored.signingSecretHash, result.secret);
  assert.equal(prisma.state.events[0].eventName, "webhook.endpoint.created");
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
