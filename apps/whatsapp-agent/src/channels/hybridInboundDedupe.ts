import crypto from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

export const HYBRID_INBOUND_CLAIM_EVENT = "whatsapp.hybrid.inbound.logical_message.claimed";
export const HYBRID_INBOUND_DEDUPED_EVENT = "whatsapp.hybrid.inbound.cross_provider_deduped";

export type WhatsappInboundProvider = "meta" | "web_session";

type LogicalInboundKeyInput = {
  clientId: string;
  senderWaIdCanonical?: string | null;
  provider: WhatsappInboundProvider;
  providerMessageId: string;
};

type ClaimInput = LogicalInboundKeyInput & {
  prisma: PrismaClient;
  requestId?: string | null;
};

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function base64Decode(value: string) {
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function normalizeProviderMessageId(value: string) {
  return value.trim().replace(/\s+/g, "");
}

export function extractUnderlyingWhatsAppStanzaId(params: {
  provider: WhatsappInboundProvider;
  providerMessageId: string;
  senderWaIdCanonical?: string | null;
}) {
  const providerMessageId = normalizeProviderMessageId(params.providerMessageId);
  if (!providerMessageId) return null;
  if (params.provider === "web_session") return providerMessageId;

  if (!providerMessageId.startsWith("wamid.")) return null;
  const encoded = providerMessageId.slice("wamid.".length);
  const decoded = base64Decode(encoded);
  if (!decoded) return null;

  const sender = String(params.senderWaIdCanonical ?? "").replace(/\D/g, "");
  if (sender && !decoded.includes(sender)) return null;

  const candidates = decoded.match(/[A-F0-9]{16,80}/g) ?? [];
  return candidates.length > 0 ? candidates[candidates.length - 1] ?? null : null;
}

export function buildHybridInboundLogicalKey(input: LogicalInboundKeyInput) {
  const sender = String(input.senderWaIdCanonical ?? "").replace(/\D/g, "");
  if (!input.clientId || !sender) return null;

  const stanzaId = extractUnderlyingWhatsAppStanzaId({
    provider: input.provider,
    providerMessageId: input.providerMessageId,
    senderWaIdCanonical: sender,
  });
  if (!stanzaId) return null;

  const keyMaterial = [
    "whatsapp.logical-inbound.v1",
    `client:${input.clientId}`,
    `sender:${sender}`,
    `stanza:${stanzaId}`,
  ].join("|");
  const hash = sha256(keyMaterial);
  return {
    hash,
    requestId: `hybrid-inbound:${hash}`,
    stanzaIdHash: sha256(stanzaId),
    senderHash: sha256(sender),
  };
}

export async function claimHybridInboundLogicalMessage(input: ClaimInput) {
  const key = buildHybridInboundLogicalKey(input);
  if (!key) {
    return { claimed: true as const, key: null, reason: "logical_key_unavailable" as const };
  }

  try {
    await input.prisma.event.create({
      data: {
        clientId: input.clientId,
        eventName: HYBRID_INBOUND_CLAIM_EVENT,
        requestId: key.requestId,
        messageId: key.hash,
        payloadJson: {
          logicalInboundKeyHash: key.hash,
          senderHash: key.senderHash,
          stanzaIdHash: key.stanzaIdHash,
          winningProvider: input.provider,
          duplicateSuppression: "client_sender_stanza",
          sourceRequestId: input.requestId ?? null,
        },
      },
    });
    return { claimed: true as const, key, reason: "claimed" as const };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await input.prisma.event.findFirst({
        where: {
          clientId: input.clientId,
          eventName: HYBRID_INBOUND_CLAIM_EVENT,
          requestId: key.requestId,
        },
        select: { payloadJson: true },
      });
      const payload = existing?.payloadJson;
      const winningProvider =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? typeof payload.winningProvider === "string"
            ? payload.winningProvider
            : null
          : null;
      await recordHybridInboundDuplicateSuppressed({
        prisma: input.prisma,
        clientId: input.clientId,
        provider: input.provider,
        logicalInboundKeyHash: key.hash,
        senderHash: key.senderHash,
        stanzaIdHash: key.stanzaIdHash,
        winningProvider,
        requestId: input.requestId ?? null,
      });
      return { claimed: false as const, key, reason: "duplicate_logical_message" as const, winningProvider };
    }
    throw error;
  }
}

async function recordHybridInboundDuplicateSuppressed(params: {
  prisma: PrismaClient;
  clientId: string;
  provider: WhatsappInboundProvider;
  logicalInboundKeyHash: string;
  senderHash: string;
  stanzaIdHash: string;
  winningProvider: string | null;
  requestId: string | null;
}) {
  try {
    await params.prisma.event.create({
      data: {
        clientId: params.clientId,
        eventName: HYBRID_INBOUND_DEDUPED_EVENT,
        requestId: `${HYBRID_INBOUND_DEDUPED_EVENT}:${params.logicalInboundKeyHash}:${params.provider}`,
        messageId: params.logicalInboundKeyHash,
        payloadJson: {
          logicalInboundKeyHash: params.logicalInboundKeyHash,
          senderHash: params.senderHash,
          stanzaIdHash: params.stanzaIdHash,
          duplicateProvider: params.provider,
          winningProvider: params.winningProvider,
          sourceRequestId: params.requestId,
        },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  }
}
