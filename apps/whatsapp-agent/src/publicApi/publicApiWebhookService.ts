import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

export const PUBLIC_API_WEBHOOK_EVENTS = [
  "contact.created",
  "conversation.created",
  "message.received",
  "message.sent",
  "appointment.created",
  "appointment.confirmed",
  "survey.responded",
] as const;

export type PublicApiWebhookEvent = (typeof PUBLIC_API_WEBHOOK_EVENTS)[number];

const WEBHOOK_SECRET_PREFIX = "whsec";
const MAX_ENDPOINTS_PER_TENANT = 20;
const PRIVATE_IPV4_RANGES = [
  /^10\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
];

export function generateWebhookSigningSecret() {
  return `${WEBHOOK_SECRET_PREFIX}_${crypto.randomBytes(32).toString("base64url")}`;
}

export function hashWebhookSigningSecret(secret: string) {
  return crypto.createHash("sha256").update(secret, "utf8").digest("hex");
}

export function signWebhookPayload(params: {
  secret: string;
  timestamp: string | number;
  payload: string | Buffer;
}) {
  const body = Buffer.isBuffer(params.payload) ? params.payload : Buffer.from(params.payload, "utf8");
  const signedPayload = Buffer.concat([
    Buffer.from(String(params.timestamp), "utf8"),
    Buffer.from(".", "utf8"),
    body,
  ]);
  const digest = crypto.createHmac("sha256", params.secret).update(signedPayload).digest("hex");
  return `sha256=${digest}`;
}

export function hashWebhookPayload(payload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(payload ?? {}), "utf8").digest("hex");
}

export function validateWebhookEndpointUrl(input: string) {
  const value = input.trim();
  if (!value || value.length > 2048) {
    return { ok: false as const, error: "invalid_url" };
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false as const, error: "invalid_url" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false as const, error: "invalid_url_protocol" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false as const, error: "invalid_url_credentials" };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname === "metadata.google.internal"
  ) {
    return { ok: false as const, error: "blocked_internal_url" };
  }
  if (PRIVATE_IPV4_RANGES.some((pattern) => pattern.test(hostname))) {
    return { ok: false as const, error: "blocked_internal_url" };
  }
  return { ok: true as const, url: parsed.toString() };
}

function serializeWebhookEndpoint(item: {
  id: string;
  name: string;
  url: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    name: item.name,
    url: item.url,
    active: item.active,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function serializeWebhookDelivery(item: {
  id: string;
  endpointId: string;
  eventType: string;
  payloadHash: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    endpointId: item.endpointId,
    eventType: item.eventType,
    payloadHash: item.payloadHash,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function serializeWebhookAttempt(item: {
  id: string;
  deliveryId: string;
  attemptNumber: number;
  status: string;
  responseCode: number | null;
  createdAt: Date;
}) {
  return {
    id: item.id,
    deliveryId: item.deliveryId,
    attemptNumber: item.attemptNumber,
    status: item.status,
    responseCode: item.responseCode,
    createdAt: item.createdAt.toISOString(),
  };
}

export async function listWebhookDashboard(params: {
  prisma: PrismaClient;
  clientId: string;
}) {
  const [endpoints, deliveries, attempts] = await Promise.all([
    params.prisma.webhookEndpoint.findMany({
      where: { clientId: params.clientId },
      orderBy: { createdAt: "desc" },
    }),
    params.prisma.webhookDelivery.findMany({
      where: { clientId: params.clientId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    params.prisma.webhookAttempt.findMany({
      where: { clientId: params.clientId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return {
    endpoints: endpoints.map(serializeWebhookEndpoint),
    deliveries: deliveries.map(serializeWebhookDelivery),
    attempts: attempts.map(serializeWebhookAttempt),
    supportedEvents: [...PUBLIC_API_WEBHOOK_EVENTS],
  };
}

export async function createWebhookEndpoint(params: {
  prisma: PrismaClient;
  clientId: string;
  userId: string;
  requestId: string;
  name: string;
  url: string;
}) {
  const name = params.name.trim();
  if (!name || name.length > 120) return { ok: false as const, error: "invalid_name" };
  const urlResult = validateWebhookEndpointUrl(params.url);
  if (!urlResult.ok) return { ok: false as const, error: urlResult.error };
  const count = await params.prisma.webhookEndpoint.count({ where: { clientId: params.clientId } });
  if (count >= MAX_ENDPOINTS_PER_TENANT) {
    return { ok: false as const, error: "webhook_endpoint_limit_reached" };
  }
  const secret = generateWebhookSigningSecret();
  const endpoint = await params.prisma.webhookEndpoint.create({
    data: {
      clientId: params.clientId,
      name,
      url: urlResult.url,
      signingSecretHash: hashWebhookSigningSecret(secret),
      active: true,
      createdByUserId: params.userId,
    },
  });
  await recordWebhookAuditEvent(params.prisma, {
    clientId: params.clientId,
    requestId: `${params.requestId}:webhook-endpoint-created:${endpoint.id}`,
    eventName: "webhook.endpoint.created",
    payload: {
      endpointId: endpoint.id,
      urlHost: new URL(endpoint.url).hostname,
      createdByUserId: params.userId,
    },
  });
  return {
    ok: true as const,
    endpoint: serializeWebhookEndpoint(endpoint),
    secret,
  };
}

export async function updateWebhookEndpoint(params: {
  prisma: PrismaClient;
  clientId: string;
  userId: string;
  requestId: string;
  endpointId: string;
  name?: unknown;
  url?: unknown;
  active?: unknown;
}) {
  const existing = await params.prisma.webhookEndpoint.findFirst({
    where: { id: params.endpointId, clientId: params.clientId },
  });
  if (!existing) return { ok: false as const, error: "webhook_endpoint_not_found" };

  const data: { name?: string; url?: string; active?: boolean } = {};
  if (typeof params.name === "string") {
    const name = params.name.trim();
    if (!name || name.length > 120) return { ok: false as const, error: "invalid_name" };
    data.name = name;
  }
  if (typeof params.url === "string") {
    const urlResult = validateWebhookEndpointUrl(params.url);
    if (!urlResult.ok) return { ok: false as const, error: urlResult.error };
    data.url = urlResult.url;
  }
  if (typeof params.active === "boolean") {
    data.active = params.active;
  }
  if (Object.keys(data).length === 0) {
    return { ok: true as const, endpoint: serializeWebhookEndpoint(existing) };
  }
  const endpoint = await params.prisma.webhookEndpoint.update({
    where: { id: existing.id },
    data,
  });
  const eventName =
    existing.active && endpoint.active === false ? "webhook.endpoint.disabled" : "webhook.endpoint.updated";
  await recordWebhookAuditEvent(params.prisma, {
    clientId: params.clientId,
    requestId: `${params.requestId}:${eventName}:${endpoint.id}`,
    eventName,
    payload: {
      endpointId: endpoint.id,
      urlHost: new URL(endpoint.url).hostname,
      updatedByUserId: params.userId,
      active: endpoint.active,
    },
  });
  return { ok: true as const, endpoint: serializeWebhookEndpoint(endpoint) };
}

export async function recordWebhookAuditEvent(
  prisma: PrismaClient,
  params: {
    clientId: string;
    requestId: string;
    eventName: string;
    payload: Record<string, unknown>;
  }
) {
  await prisma.event.create({
    data: {
      clientId: params.clientId,
      requestId: params.requestId,
      eventName: params.eventName,
      payloadJson: params.payload as Prisma.InputJsonObject,
    },
  });
}

export function webhookEndpointErrorStatus(error: string) {
  if (error.endsWith("_not_found")) return 404;
  if (error === "webhook_endpoint_limit_reached") return 409;
  return 400;
}
