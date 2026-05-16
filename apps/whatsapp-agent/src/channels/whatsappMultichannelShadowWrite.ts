import { logger as defaultLogger } from "../logger/logger.js";
import { hashWhatsAppExternalUser } from "./whatsappBackfillDryRun.js";

export type WhatsAppShadowModel =
  | "Conversation"
  | "ConversationRuntimeState"
  | "InboundMessage"
  | "OutboundMessage"
  | "Lead"
  | "Contact";

export type WhatsAppMultichannelIdentity = {
  channel: "whatsapp";
  provider: "meta";
  channelAccountId: string;
  externalUserHash: string;
  externalUserRef: null;
  legacyWaId: string;
};

export type WhatsAppShadowWriteResult =
  | { ok: true; status: "applied"; model: WhatsAppShadowModel; recordId?: string }
  | { ok: true; status: "skipped_disabled"; model: WhatsAppShadowModel }
  | { ok: true; status: "skipped_missing_identity"; model: WhatsAppShadowModel; reason: string }
  | { ok: true; status: "skipped_schema_missing"; model: WhatsAppShadowModel; error: string }
  | { ok: false; status: "failed"; model: WhatsAppShadowModel; error: string };

export type ShadowLogger = {
  info(data: Record<string, unknown>): void;
  warn(data: Record<string, unknown>): void;
  error(data: Record<string, unknown>): void;
};

export type ShadowPrismaClient = {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
};

const TABLES: Record<WhatsAppShadowModel, string> = {
  Conversation: "Conversation",
  ConversationRuntimeState: "ConversationRuntimeState",
  InboundMessage: "InboundMessage",
  OutboundMessage: "OutboundMessage",
  Lead: "Lead",
  Contact: "Contact",
};

const UUID_ID_MODELS = new Set<WhatsAppShadowModel>([
  "Conversation",
  "InboundMessage",
  "OutboundMessage",
  "Contact",
]);

function boolEnv(name: string) {
  return (process.env[name] ?? "false").trim().toLowerCase() === "true";
}

export function isWhatsAppMultichannelShadowWriteEnabled(env = process.env) {
  return (env.MULTICHANNEL_SHADOW_WRITE ?? "false").trim().toLowerCase() === "true";
}

export function isWhatsAppMultichannelShadowStrict(env = process.env) {
  return (env.MULTICHANNEL_SHADOW_STRICT ?? "false").trim().toLowerCase() === "true";
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function maskHash(value: string | null | undefined) {
  const normalized = normalizeText(value);
  return normalized ? `hash:${normalized.slice(0, 8)}` : null;
}

function redactedShadowLogContext() {
  return {
    waId: undefined,
    conversationKey: undefined,
  };
}

function isSchemaMissingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("does not exist") ||
    message.includes("Unknown argument") ||
    message.includes("P2022") ||
    message.includes("column") && message.includes("not exist")
  );
}

function quoteTable(model: WhatsAppShadowModel) {
  return `"${TABLES[model]}"`;
}

function idPredicate(model: WhatsAppShadowModel) {
  return UUID_ID_MODELS.has(model) ? `"id" = $7::uuid` : `"id" = $7`;
}

function legacyPredicate(model: WhatsAppShadowModel) {
  const tenantColumn = model === "Lead" ? "tenantId" : "clientId";
  return `"${tenantColumn}" = $7::uuid AND "waId" = $8`;
}

export function buildWhatsAppMultichannelIdentity(input: {
  waId?: string | null;
  phoneNumberId?: string | null;
}): WhatsAppMultichannelIdentity | null {
  const waId = normalizeText(input.waId);
  const channelAccountId = normalizeText(input.phoneNumberId);
  if (!waId || !channelAccountId) return null;
  return {
    channel: "whatsapp",
    provider: "meta",
    channelAccountId,
    externalUserHash: hashWhatsAppExternalUser(waId),
    externalUserRef: null,
    legacyWaId: waId,
  };
}

export function buildWhatsAppMultichannelShadowPatch(
  identity: WhatsAppMultichannelIdentity
) {
  return {
    channel: identity.channel,
    provider: identity.provider,
    channelAccountId: identity.channelAccountId,
    externalUserHash: identity.externalUserHash,
    externalUserRef: identity.externalUserRef,
    legacyWaId: identity.legacyWaId,
  };
}

export async function applyWhatsAppMultichannelShadowById(params: {
  prisma: ShadowPrismaClient;
  model: WhatsAppShadowModel;
  recordId: string;
  identity: WhatsAppMultichannelIdentity;
}) {
  const sql = `
    UPDATE ${quoteTable(params.model)}
    SET "channel" = $1,
        "provider" = $2,
        "channelAccountId" = $3,
        "externalUserHash" = $4,
        "externalUserRef" = $5,
        "legacyWaId" = $6
    WHERE ${idPredicate(params.model)}
  `;
  return params.prisma.$executeRawUnsafe(
    sql,
    params.identity.channel,
    params.identity.provider,
    params.identity.channelAccountId,
    params.identity.externalUserHash,
    params.identity.externalUserRef,
    params.identity.legacyWaId,
    params.recordId
  );
}

export async function applyWhatsAppMultichannelShadowByLegacyIdentity(params: {
  prisma: ShadowPrismaClient;
  model: WhatsAppShadowModel;
  clientId: string;
  waId: string;
  identity: WhatsAppMultichannelIdentity;
}) {
  const sql = `
    UPDATE ${quoteTable(params.model)}
    SET "channel" = $1,
        "provider" = $2,
        "channelAccountId" = $3,
        "externalUserHash" = $4,
        "externalUserRef" = $5,
        "legacyWaId" = $6
    WHERE ${legacyPredicate(params.model)}
  `;
  return params.prisma.$executeRawUnsafe(
    sql,
    params.identity.channel,
    params.identity.provider,
    params.identity.channelAccountId,
    params.identity.externalUserHash,
    params.identity.externalUserRef,
    params.identity.legacyWaId,
    params.clientId,
    params.waId
  );
}

export async function safeApplyWhatsAppMultichannelShadow(params: {
  prisma: ShadowPrismaClient;
  model: WhatsAppShadowModel;
  clientId?: string | null;
  recordId?: string | null;
  waId?: string | null;
  phoneNumberId?: string | null;
  logger?: ShadowLogger;
  env?: NodeJS.ProcessEnv;
}): Promise<WhatsAppShadowWriteResult> {
  const env = params.env ?? process.env;
  const logger = params.logger ?? defaultLogger;
  if (!isWhatsAppMultichannelShadowWriteEnabled(env)) {
    logger.info({
      ...redactedShadowLogContext(),
      event: "multichannel.shadow_write.skipped_disabled",
      model: params.model,
      recordId: params.recordId ?? null,
    });
    return { ok: true, status: "skipped_disabled", model: params.model };
  }

  const identity = buildWhatsAppMultichannelIdentity({
    waId: params.waId,
    phoneNumberId: params.phoneNumberId,
  });
  if (!identity) {
    const reason = !normalizeText(params.waId)
      ? "missing_waid"
      : "missing_channel_account_id";
    logger.warn({
      ...redactedShadowLogContext(),
      event: "multichannel.shadow_write.failed",
      model: params.model,
      recordId: params.recordId ?? null,
      reason,
    });
    const result: WhatsAppShadowWriteResult = {
      ok: true,
      status: "skipped_missing_identity",
      model: params.model,
      reason,
    };
    if (isWhatsAppMultichannelShadowStrict(env)) {
      throw new Error(`multichannel_shadow_${reason}`);
    }
    return result;
  }

  try {
    if (params.recordId) {
      await applyWhatsAppMultichannelShadowById({
        prisma: params.prisma,
        model: params.model,
        recordId: params.recordId,
        identity,
      });
    } else if (params.clientId && params.waId) {
      await applyWhatsAppMultichannelShadowByLegacyIdentity({
        prisma: params.prisma,
        model: params.model,
        clientId: params.clientId,
        waId: params.waId,
        identity,
      });
    } else {
      throw new Error("missing_record_target");
    }
    logger.info({
      ...redactedShadowLogContext(),
      event: "multichannel.shadow_write.applied",
      model: params.model,
      recordId: params.recordId ?? null,
      clientId: params.clientId ?? null,
      channel: identity.channel,
      provider: identity.provider,
      channelAccountId: identity.channelAccountId,
      externalUserHash: maskHash(identity.externalUserHash),
    });
    return { ok: true, status: "applied", model: params.model, recordId: params.recordId ?? undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isSchemaMissingError(error)) {
      logger.warn({
        ...redactedShadowLogContext(),
        event: "multichannel.shadow_write.skipped_schema_missing",
        model: params.model,
        recordId: params.recordId ?? null,
        clientId: params.clientId ?? null,
        channel: "whatsapp",
        provider: "meta",
        channelAccountId: identity.channelAccountId,
        externalUserHash: maskHash(identity.externalUserHash),
        error: message,
      });
      if (isWhatsAppMultichannelShadowStrict(env)) {
        throw error;
      }
      return {
        ok: true,
        status: "skipped_schema_missing",
        model: params.model,
        error: message,
      };
    }
    logger.warn({
      ...redactedShadowLogContext(),
      event: "multichannel.shadow_write.failed",
      model: params.model,
      recordId: params.recordId ?? null,
      clientId: params.clientId ?? null,
      channel: "whatsapp",
      provider: "meta",
      channelAccountId: identity.channelAccountId,
      externalUserHash: maskHash(identity.externalUserHash),
      error: message,
    });
    if (isWhatsAppMultichannelShadowStrict(env)) {
      throw error;
    }
    return { ok: false, status: "failed", model: params.model, error: message };
  }
}
