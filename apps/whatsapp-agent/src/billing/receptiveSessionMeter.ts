import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { logger } from "../logger/logger.js";

export const RECEPTIVE_SESSION_EVENT_TYPE = "billing.receptive_session.created";
export const RECEPTIVE_SESSION_METER_VERSION = "receptive-session-meter-v1";
export const RECEPTIVE_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

// MVP uses Event as the immutable ledger. A future BillingReceptiveSession table
// can migrate these same semantic fields without changing the metering unit.
type EventRow = {
  id: string;
  requestId: string | null;
  payloadJson: Prisma.JsonValue;
  createdAt: Date;
};

type EventCreateInput = {
  clientId: string;
  conversationId?: string | null;
  waId?: string | null;
  waIdCanonical?: string | null;
  messageId?: string | null;
  requestId?: string | null;
  eventName: string;
  payloadJson: Prisma.InputJsonValue;
  createdAt?: Date;
};

type EventDelegate = {
  findMany(args: any): Promise<EventRow[]>;
  create(args: { data: EventCreateInput } | any): Promise<EventRow | unknown>;
};

export type ReceptiveSessionMeterPrisma = {
  event: EventDelegate;
  $executeRaw?(query: Prisma.Sql): Promise<unknown>;
  $transaction?<T>(fn: (tx: ReceptiveSessionMeterPrisma) => Promise<T>): Promise<T>;
};

export type ReceptiveSessionMeterInput = {
  clientId: string;
  conversationId?: string | null;
  channel?: string | null;
  provider?: string | null;
  channelAccountId?: string | null;
  contactId?: string | null;
  waId?: string | null;
  waIdCanonical?: string | null;
  externalUserHash?: string | null;
  externalUserRef?: string | null;
  sourceInboundMessageId: string;
  providerMessageId?: string | null;
  providerConversationId?: string | null;
  providerConversationCategory?: string | null;
  occurredAt: Date;
  rawPayload?: Prisma.JsonValue | Prisma.InputJsonValue | null;
};

export type ReceptiveSessionMeterResult =
  | { ok: true; metered: true; eventType: typeof RECEPTIVE_SESSION_EVENT_TYPE; sessionStartedAt: Date; sessionEndsAt: Date; requestId: string }
  | { ok: true; metered: false; reason: "not_eligible" | "active_session" | "duplicate" }
  | { ok: false; metered: false; reason: "error"; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeChannel(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeReceptiveSessionProvider(value: unknown) {
  const provider = String(value ?? "").trim().toLowerCase();
  if (provider === "meta" || provider === "meta_cloud") return "meta_cloud";
  return provider || "unknown";
}

export function isEligibleReceptiveSessionInbound(input: Pick<ReceptiveSessionMeterInput, "channel" | "provider" | "rawPayload">) {
  if (normalizeChannel(input.channel) !== "whatsapp") return false;
  if (normalizeReceptiveSessionProvider(input.provider) !== "meta_cloud") return false;
  if (isRecord(input.rawPayload) && (input.rawPayload as Record<string, unknown>).inboxVisibility === "management_only") return false;
  return true;
}

function resolveContactIdentity(input: ReceptiveSessionMeterInput) {
  return (
    normalizeText(input.contactId) ??
    normalizeText(input.waIdCanonical) ??
    normalizeText(input.externalUserHash) ??
    normalizeText(input.externalUserRef) ??
    normalizeText(input.waId)
  );
}

function maskLast4(value: string | null | undefined) {
  const text = String(value ?? "").replace(/\D/g, "");
  if (!text) return null;
  return `***${text.slice(-4)}`;
}

function hashIdentity(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function lockKey(parts: string[]) {
  const hash = crypto.createHash("sha256").update(parts.join(":"), "utf8").digest();
  return hash.readBigInt64BE(0);
}

function parseDate(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractSessionWindow(event: EventRow) {
  if (!isRecord(event.payloadJson)) return null;
  const startedAt = parseDate(event.payloadJson.sessionStartedAt);
  const endsAt = parseDate(event.payloadJson.sessionEndsAt);
  if (!startedAt || !endsAt) return null;
  return { startedAt, endsAt };
}

function isWithinSessionWindow(occurredAt: Date, sessionEndsAt: Date) {
  return occurredAt.getTime() < sessionEndsAt.getTime();
}

function buildRequestId(params: {
  clientId: string;
  provider: string;
  contactIdentityHash: string;
  sessionStartedAt: Date;
}) {
  return [
    "billing",
    "receptive_session",
    params.clientId,
    "whatsapp",
    params.provider,
    params.contactIdentityHash,
    params.sessionStartedAt.toISOString(),
  ].join(":");
}

async function acquireLock(prisma: ReceptiveSessionMeterPrisma, input: {
  clientId: string;
  provider: string;
  contactIdentityHash: string;
}) {
  if (!prisma.$executeRaw) return;
  const key = lockKey(["billing-receptive-session", input.clientId, "whatsapp", input.provider, input.contactIdentityHash]);
  await prisma.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${key})`);
}

async function recordInsideLock(
  prisma: ReceptiveSessionMeterPrisma,
  input: ReceptiveSessionMeterInput,
  provider: string,
  contactIdentity: string
): Promise<ReceptiveSessionMeterResult> {
  const contactIdentityHash = hashIdentity(contactIdentity);
  await acquireLock(prisma, { clientId: input.clientId, provider, contactIdentityHash });
  const previous = await prisma.event.findMany({
    where: {
      clientId: input.clientId,
      eventName: RECEPTIVE_SESSION_EVENT_TYPE,
      waIdCanonical: input.waIdCanonical ?? undefined,
      createdAt: { lte: input.occurredAt },
    },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      requestId: true,
      payloadJson: true,
      createdAt: true,
    },
  });
  for (const event of previous) {
    if (!isRecord(event.payloadJson)) continue;
    if (event.payloadJson.contactIdentityHash !== contactIdentityHash) continue;
    if (event.payloadJson.channel !== "whatsapp") continue;
    if (event.payloadJson.provider !== provider) continue;
    const window = extractSessionWindow(event);
    if (window && isWithinSessionWindow(input.occurredAt, window.endsAt)) {
      return { ok: true, metered: false, reason: "active_session" };
    }
  }

  const sessionStartedAt = input.occurredAt;
  const sessionEndsAt = new Date(sessionStartedAt.getTime() + RECEPTIVE_SESSION_WINDOW_MS);
  const requestId = buildRequestId({
    clientId: input.clientId,
    provider,
    contactIdentityHash,
    sessionStartedAt,
  });
  const payload = {
    billingType: "receptive_session",
    channel: "whatsapp",
    provider,
    sessionStartedAt: sessionStartedAt.toISOString(),
    sessionEndsAt: sessionEndsAt.toISOString(),
    sourceInboundMessageId: input.sourceInboundMessageId,
    providerMessageId: input.providerMessageId ?? null,
    providerConversationId: input.providerConversationId ?? null,
    providerConversationCategory: input.providerConversationCategory ?? null,
    channelAccountId: input.channelAccountId ?? null,
    contactId: input.contactId ?? null,
    contactIdentityHash,
    waIdMasked: maskLast4(input.waIdCanonical ?? input.waId),
    meterVersion: RECEPTIVE_SESSION_METER_VERSION,
  } satisfies Prisma.InputJsonObject;

  try {
    await prisma.event.create({
      data: {
        clientId: input.clientId,
        conversationId: input.conversationId ?? undefined,
        waId: input.waId ?? undefined,
        waIdCanonical: input.waIdCanonical ?? undefined,
        messageId: input.sourceInboundMessageId,
        requestId,
        eventName: RECEPTIVE_SESSION_EVENT_TYPE,
        payloadJson: payload,
        createdAt: sessionStartedAt,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: true, metered: false, reason: "duplicate" };
    }
    throw error;
  }
  return {
    ok: true,
    metered: true,
    eventType: RECEPTIVE_SESSION_EVENT_TYPE,
    sessionStartedAt,
    sessionEndsAt,
    requestId,
  };
}

export async function recordReceptiveSessionIfNeeded(params: {
  prisma: ReceptiveSessionMeterPrisma;
  input: ReceptiveSessionMeterInput;
}): Promise<ReceptiveSessionMeterResult> {
  try {
    if (!isEligibleReceptiveSessionInbound(params.input)) {
      return { ok: true, metered: false, reason: "not_eligible" };
    }
    const contactIdentity = resolveContactIdentity(params.input);
    if (!contactIdentity) {
      return { ok: true, metered: false, reason: "not_eligible" };
    }
    const provider = normalizeReceptiveSessionProvider(params.input.provider);
    const execute = (tx: ReceptiveSessionMeterPrisma) => recordInsideLock(tx, params.input, provider, contactIdentity);
    if (params.prisma.$transaction) return await params.prisma.$transaction(execute);
    return await execute(params.prisma);
  } catch (error) {
    logger.error({
      event: "billing.receptive_session.meter.error",
      clientId: params.input.clientId,
      channel: params.input.channel ?? null,
      provider: params.input.provider ?? null,
      sourceInboundMessageId: params.input.sourceInboundMessageId,
      message: (error as Error).message,
    });
    return { ok: false, metered: false, reason: "error", error: (error as Error).message };
  }
}
