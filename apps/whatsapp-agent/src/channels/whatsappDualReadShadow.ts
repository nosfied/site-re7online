import { logger as defaultLogger } from "../logger/logger.js";
import { buildWhatsAppMultichannelIdentity } from "./whatsappMultichannelShadowWrite.js";

export type WhatsAppDualReadModel = "Conversation" | "ConversationRuntimeState" | "Lead";

export type WhatsAppDualReadRecord = {
  id: string;
  ownerId: string;
  channelAccountId?: string | null;
  externalUserHash?: string | null;
  legacyWaId?: string | null;
};

export type WhatsAppDualReadResult = {
  legacyFound: boolean;
  multichannelFound: boolean;
  sameRecord: boolean;
  legacyId?: string | null;
  multichannelId?: string | null;
  mismatchReason?: string | null;
};

export type WhatsAppDualReadLogger = {
  info(data: Record<string, unknown>): void;
  warn(data: Record<string, unknown>): void;
};

export type WhatsAppDualReadPrisma = {
  conversation: {
    findFirst(args: unknown): Promise<unknown>;
  };
  conversationRuntimeState: {
    findFirst(args: unknown): Promise<unknown>;
  };
  lead: {
    findFirst(args: unknown): Promise<unknown>;
  };
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hashPrefix(value?: string | null) {
  const normalized = normalizeText(value);
  return normalized ? `hash:${normalized.slice(0, 8)}` : null;
}

function isDualReadEnabled(env = process.env) {
  return (env.MULTICHANNEL_DUAL_READ ?? "false").trim().toLowerCase() === "true";
}

function redactedLogContext() {
  return {
    waId: undefined,
    conversationKey: undefined,
  };
}

function ownerField(model: WhatsAppDualReadModel) {
  return model === "Lead" ? "tenantId" : "clientId";
}

function clientDelegate(prisma: WhatsAppDualReadPrisma, model: WhatsAppDualReadModel) {
  if (model === "Lead") return prisma.lead;
  if (model === "ConversationRuntimeState") return prisma.conversationRuntimeState;
  return prisma.conversation;
}

function selectForModel(model: WhatsAppDualReadModel) {
  return {
    id: true,
    [ownerField(model)]: true,
    channelAccountId: true,
    externalUserHash: true,
    legacyWaId: true,
  };
}

function mapRecord(model: WhatsAppDualReadModel, record: Record<string, unknown> | null) {
  if (!record) return null;
  return {
    id: String(record.id),
    ownerId: String(record[ownerField(model)] ?? ""),
    channelAccountId: normalizeText(record.channelAccountId),
    externalUserHash: normalizeText(record.externalUserHash),
    legacyWaId: normalizeText(record.legacyWaId),
  };
}

export async function resolveLegacyConversation(params: {
  prisma: WhatsAppDualReadPrisma;
  model: WhatsAppDualReadModel;
  ownerId: string;
  waId: string;
}) {
  const delegate = clientDelegate(params.prisma, params.model);
  return mapRecord(
    params.model,
    (await delegate.findFirst({
      where: {
        [ownerField(params.model)]: params.ownerId,
        waId: params.waId,
      },
      select: selectForModel(params.model),
    })) as Record<string, unknown> | null
  );
}

export async function resolveMultichannelConversation(params: {
  prisma: WhatsAppDualReadPrisma;
  model: WhatsAppDualReadModel;
  ownerId: string;
  channelAccountId: string;
  externalUserHash: string;
}) {
  const delegate = clientDelegate(params.prisma, params.model);
  return mapRecord(
    params.model,
    (await delegate.findFirst({
      where: {
        [ownerField(params.model)]: params.ownerId,
        channel: "whatsapp",
        provider: "meta",
        channelAccountId: params.channelAccountId,
        externalUserHash: params.externalUserHash,
      },
      select: selectForModel(params.model),
    })) as Record<string, unknown> | null
  );
}

export function compareConversationResolution(params: {
  legacy: WhatsAppDualReadRecord | null;
  multichannel: WhatsAppDualReadRecord | null;
  expectedOwnerId: string;
  expectedChannelAccountId: string;
  expectedExternalUserHash: string;
}) {
  const legacyFound = Boolean(params.legacy);
  const multichannelFound = Boolean(params.multichannel);
  let mismatchReason: string | null = null;

  if (!legacyFound && !multichannelFound) {
    mismatchReason = "both_missing";
  } else if (legacyFound && !multichannelFound) {
    mismatchReason = "multichannel_missing";
  } else if (!legacyFound && multichannelFound) {
    mismatchReason = "legacy_missing";
  } else if (params.legacy?.id !== params.multichannel?.id) {
    mismatchReason = "id_mismatch";
  } else if (params.multichannel?.ownerId !== params.expectedOwnerId) {
    mismatchReason = "owner_mismatch";
  } else if (params.multichannel?.channelAccountId !== params.expectedChannelAccountId) {
    mismatchReason = "channel_account_mismatch";
  } else if (params.multichannel?.externalUserHash !== params.expectedExternalUserHash) {
    mismatchReason = "hash_mismatch";
  }

  return {
    legacyFound,
    multichannelFound,
    sameRecord: legacyFound && multichannelFound && !mismatchReason,
    legacyId: params.legacy?.id ?? null,
    multichannelId: params.multichannel?.id ?? null,
    mismatchReason,
  } satisfies WhatsAppDualReadResult;
}

export const compareRuntimeStateResolution = compareConversationResolution;
export const compareLeadResolution = compareConversationResolution;

export async function runWhatsAppDualReadShadow(params: {
  prisma: WhatsAppDualReadPrisma;
  model: WhatsAppDualReadModel;
  ownerId: string;
  waId: string;
  phoneNumberId?: string | null;
  legacyRecord?: WhatsAppDualReadRecord | null;
  logger?: WhatsAppDualReadLogger;
  env?: NodeJS.ProcessEnv;
}): Promise<WhatsAppDualReadResult | { skipped: true; reason: string }> {
  if (!isDualReadEnabled(params.env ?? process.env)) {
    return { skipped: true, reason: "disabled" };
  }

  const logger = params.logger ?? defaultLogger;
  const identity = buildWhatsAppMultichannelIdentity({
    waId: params.waId,
    phoneNumberId: params.phoneNumberId,
  });
  if (!identity) {
    logger.info({
      ...redactedLogContext(),
      event: "multichannel.dual_read.skipped",
      model: params.model,
      ownerId: params.ownerId,
      reason: "missing_identity",
    });
    return { skipped: true, reason: "missing_identity" };
  }

  try {
    const [legacy, multichannel] = await Promise.all([
      params.legacyRecord === undefined
        ? resolveLegacyConversation({
            prisma: params.prisma,
            model: params.model,
            ownerId: params.ownerId,
            waId: params.waId,
          })
        : Promise.resolve(params.legacyRecord),
      resolveMultichannelConversation({
        prisma: params.prisma,
        model: params.model,
        ownerId: params.ownerId,
        channelAccountId: identity.channelAccountId,
        externalUserHash: identity.externalUserHash,
      }),
    ]);

    const result = compareConversationResolution({
      legacy,
      multichannel,
      expectedOwnerId: params.ownerId,
      expectedChannelAccountId: identity.channelAccountId,
      expectedExternalUserHash: identity.externalUserHash,
    });

    const payload = {
      ...redactedLogContext(),
      event: result.sameRecord
        ? "multichannel.dual_read.match"
        : "multichannel.dual_read.mismatch",
      model: params.model,
      ownerId: params.ownerId,
      channel: "whatsapp",
      provider: "meta",
      channelAccountId: identity.channelAccountId,
      externalUserHash: hashPrefix(identity.externalUserHash),
      legacyFound: result.legacyFound,
      multichannelFound: result.multichannelFound,
      sameRecord: result.sameRecord,
      legacyId: result.legacyId ?? null,
      multichannelId: result.multichannelId ?? null,
      mismatchReason: result.mismatchReason ?? null,
    };
    if (result.sameRecord) {
      logger.info(payload);
    } else {
      logger.warn(payload);
    }

    return result;
  } catch (error) {
    logger.warn({
      ...redactedLogContext(),
      event: "multichannel.dual_read.skipped",
      model: params.model,
      ownerId: params.ownerId,
      channel: "whatsapp",
      provider: "meta",
      channelAccountId: identity.channelAccountId,
      externalUserHash: hashPrefix(identity.externalUserHash),
      reason: "compare_failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return { skipped: true, reason: "compare_failed" };
  }
}
