import crypto from "node:crypto";
import { ConversationOperationalStatus, HandoffStatus, MessageType, Prisma, type PrismaClient } from "@prisma/client";
import { ensureDefaultOperationalDepartmentAndQueue } from "../bootstrap/defaultOperationalDepartment.js";
import { encryptMessengerExternalUserRef } from "../channels/messengerOutbound.js";
import { getFeatures } from "../features/clientFeatures.js";
import { publishRealtimeEvent } from "../realtime/hub.js";
import { applyBalancedQueueAssignment } from "../queue/assignmentPolicy.js";
import { CONTACT_LIFECYCLE_ACTIVE } from "../contacts/contactLifecycle.js";
import {
  hasConfiguredTelegramToken,
  markTelegramWebhookReplay,
  parseTelegramWebhookPayload,
  resolveTelegramAccount,
} from "./telegramWebhookShadow.js";

const TELEGRAM_PROVIDER = "telegram";
const TELEGRAM_CHANNEL = "telegram";

type JsonInput = Record<string, unknown>;

function hashValue(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function shortHash(input: string, size = 32) {
  return hashValue(input).slice(0, size);
}

function sanitizeMessageIdPart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 160);
}

function buildTelegramSyntheticWaId(params: { accountId: string; chatId: string }) {
  return `telegram:${shortHash(`${params.accountId}:${params.chatId}`, 32)}`;
}

function buildTelegramInboundMessageId(params: {
  accountId: string;
  chatId: string;
  messageId: string;
}) {
  return `telegram:${sanitizeMessageIdPart(params.accountId)}:${shortHash(params.chatId, 16)}:${sanitizeMessageIdPart(
    params.messageId
  )}`;
}

function redactedPayload(params: {
  updateId: number;
  messageId: string;
  textLength: number;
  chatId: string;
  fromId: string | null;
}) {
  return {
    source: "telegram",
    updateId: params.updateId,
    messageId: params.messageId,
    textLength: params.textLength,
    chatIdHash: shortHash(params.chatId, 16),
    fromIdHash: params.fromId ? shortHash(params.fromId, 16) : null,
  } satisfies Prisma.InputJsonObject;
}

export type TelegramInboundResult =
  | {
      ok: true;
      persisted: true;
      replay: false;
      tenantKey: string;
      clientId: string;
      channelAccountId: string;
      syntheticWaId: string;
      conversationId: string;
      runtimeStateId: string;
      inboundMessageId: string;
      contactId: string;
      contactCreated: boolean;
      conversationCreated: boolean;
      parsed: {
        updateId: number;
        messageId: string;
        textPresent: true;
        textLength: number;
      };
    }
  | {
      ok: true;
      persisted: false;
      replay: boolean;
      tenantKey: string;
      clientId: string;
      channelAccountId: string;
      reason: "telegram_replay_update" | "telegram_text_missing" | "telegram_duplicate_message";
      parsed: {
        updateId: number;
        messageId: string;
        textPresent: boolean;
        textLength: number;
      };
    }
  | {
      ok: false;
      status: number;
      error: string;
      resolution?: "not_found" | "matched_channel_account" | "matched_alias";
    };

export async function persistTelegramInboundMessage(params: {
  prisma: PrismaClient;
  tenantOrAlias: string;
  payload: JsonInput;
  requestId: string;
  now?: Date;
  publishRealtimeEvent?: typeof publishRealtimeEvent;
}): Promise<TelegramInboundResult> {
  const resolved = await resolveTelegramAccount({
    prisma: params.prisma,
    tenantOrAlias: params.tenantOrAlias,
  });
  if (!resolved) {
    return { ok: false, status: 404, error: "telegram_account_not_found", resolution: "not_found" };
  }

  const { account } = resolved;
  if (account.client.status !== "ACTIVE") {
    return { ok: false, status: 403, error: "client_inactive", resolution: resolved.resolution };
  }
  const features = getFeatures(account.client);
  if (!features.telegram || !features.telegramInbound) {
    return { ok: false, status: 403, error: "telegram_feature_disabled", resolution: resolved.resolution };
  }
  if (!account.enabled || !account.runtimeEnabled || !account.inboundPersistenceEnabled) {
    return { ok: false, status: 403, error: "telegram_account_inactive", resolution: resolved.resolution };
  }
  if (!hasConfiguredTelegramToken(account)) {
    return { ok: false, status: 403, error: "telegram_token_missing", resolution: resolved.resolution };
  }

  const parsed = parseTelegramWebhookPayload(params.payload);
  if (!parsed.ok) {
    return { ok: false, status: 400, error: parsed.error, resolution: resolved.resolution };
  }

  const replay = markTelegramWebhookReplay({
    accountId: account.id,
    updateId: parsed.parsed.updateId,
    now: params.now?.getTime(),
  });
  const parsedSummary = {
    updateId: parsed.parsed.updateId,
    messageId: parsed.parsed.messageId,
    textPresent: parsed.parsed.textPresent,
    textLength: parsed.parsed.textLength,
  };
  if (replay) {
    return {
      ok: true,
      persisted: false,
      replay: true,
      tenantKey: account.client.clientKey,
      clientId: account.clientId,
      channelAccountId: account.channelAccountId,
      reason: "telegram_replay_update",
      parsed: parsedSummary,
    };
  }
  if (!parsed.parsed.text) {
    return {
      ok: true,
      persisted: false,
      replay: false,
      tenantKey: account.client.clientKey,
      clientId: account.clientId,
      channelAccountId: account.channelAccountId,
      reason: "telegram_text_missing",
      parsed: parsedSummary,
    };
  }

  const now = params.now ?? new Date();
  const externalUserHash = shortHash(`${account.id}:${parsed.parsed.chatId}`, 32);
  const syntheticWaId = buildTelegramSyntheticWaId({ accountId: account.id, chatId: parsed.parsed.chatId });
  const messageId = buildTelegramInboundMessageId({
    accountId: account.id,
    chatId: parsed.parsed.chatId,
    messageId: parsed.parsed.messageId,
  });
  const duplicate = await params.prisma.inboundMessage.findUnique({
    where: { clientId_messageId: { clientId: account.clientId, messageId } },
    select: { id: true },
  });
  if (duplicate) {
    return {
      ok: true,
      persisted: false,
      replay: false,
      tenantKey: account.client.clientKey,
      clientId: account.clientId,
      channelAccountId: account.channelAccountId,
      reason: "telegram_duplicate_message",
      parsed: parsedSummary,
    };
  }

  const defaults = await ensureDefaultOperationalDepartmentAndQueue(params.prisma, account.clientId);
  const displayName = parsed.parsed.displayName ?? "Contato Telegram";
  const channelFields = {
    channel: TELEGRAM_CHANNEL,
    provider: TELEGRAM_PROVIDER,
    channelAccountId: account.channelAccountId,
    externalUserHash,
    externalUserRef: encryptMessengerExternalUserRef(parsed.parsed.chatId),
    legacyWaId: null,
  };
  const existingContact = await params.prisma.contact.findUnique({
    where: { clientId_waId: { clientId: account.clientId, waId: syntheticWaId } },
    select: { id: true },
  });
  const existingConversation = await params.prisma.conversation.findUnique({
    where: { clientId_waId: { clientId: account.clientId, waId: syntheticWaId } },
    select: { id: true },
  });

  const [conversation, runtimeState, inbound, contact] = await params.prisma.$transaction(async (tx) => {
    const contactRecord = await tx.contact.upsert({
      where: { clientId_waId: { clientId: account.clientId, waId: syntheticWaId } },
      create: {
        clientId: account.clientId,
        waId: syntheticWaId,
        name: displayName,
        lifecycle: CONTACT_LIFECYCLE_ACTIVE,
        ...channelFields,
      },
      update: {
        name: displayName,
        ...channelFields,
      },
      select: { id: true },
    });
    const identity = await tx.contactChannelIdentity.upsert({
      where: {
        clientId_channel_provider_channelAccountId_externalUserHash: {
          clientId: account.clientId,
          channel: TELEGRAM_CHANNEL,
          provider: TELEGRAM_PROVIDER,
          channelAccountId: account.channelAccountId,
          externalUserHash,
        },
      },
      create: {
        clientId: account.clientId,
        contactId: contactRecord.id,
        channel: TELEGRAM_CHANNEL,
        provider: TELEGRAM_PROVIDER,
        channelAccountId: account.channelAccountId,
        externalUserHash,
        externalUserRef: channelFields.externalUserRef,
        displayName,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        contactId: contactRecord.id,
        externalUserRef: channelFields.externalUserRef,
        displayName,
        lastSeenAt: now,
      },
      select: { id: true },
    });
    const conversationRecord = await tx.conversation.upsert({
      where: { clientId_waId: { clientId: account.clientId, waId: syntheticWaId } },
      create: {
        clientId: account.clientId,
        waId: syntheticWaId,
        waIdCanonical: syntheticWaId,
        phoneNumberId: null,
        ...channelFields,
        departmentId: defaults.department.id,
        windowIsOpen: true,
        lastInboundAt: now,
      },
      update: {
        waIdCanonical: syntheticWaId,
        ...channelFields,
        departmentId: defaults.department.id,
        lastInboundAt: now,
        deletedAt: null,
        anonymizedAt: null,
      },
      select: { id: true },
    });
    const runtimeRecord = await tx.conversationRuntimeState.upsert({
      where: { clientId_waId: { clientId: account.clientId, waId: syntheticWaId } },
      create: {
        clientId: account.clientId,
        waId: syntheticWaId,
        waIdCanonical: syntheticWaId,
        conversationKey: `${account.client.clientKey}:telegram:${account.channelAccountId}:${externalUserHash}`,
        ...channelFields,
        firstSeenAt: now,
        windowIsOpen: true,
        lastInboundAt: now,
        lastInboundMessageId: messageId,
        handoffStatus: HandoffStatus.NONE,
        mode: "HUMAN",
        status: ConversationOperationalStatus.WAITING,
        departmentId: defaults.department.id,
        queueId: defaults.queue.id,
      },
      update: {
        waIdCanonical: syntheticWaId,
        ...channelFields,
        lastInboundAt: now,
        lastInboundMessageId: messageId,
        mode: "HUMAN",
        status: ConversationOperationalStatus.WAITING,
        departmentId: defaults.department.id,
        queueId: defaults.queue.id,
        closedAt: null,
      },
      select: {
        id: true,
        assignedUserId: true,
        departmentId: true,
        queueId: true,
        status: true,
      },
    });
    const inboundRecord = await tx.inboundMessage.create({
      data: {
        clientId: account.clientId,
        phoneNumberId: null,
        waId: syntheticWaId,
        waIdCanonical: syntheticWaId,
        messageId,
        ...channelFields,
        externalMessageId: parsed.parsed.messageId,
        type: MessageType.TEXT,
        bodyText: parsed.parsed.text,
        allowlistHit: false,
        requestId: params.requestId,
        createdAt: now,
        rawPayload: redactedPayload({
          updateId: parsed.parsed.updateId,
          messageId: parsed.parsed.messageId,
          textLength: parsed.parsed.textLength,
          chatId: parsed.parsed.chatId,
          fromId: parsed.parsed.fromId,
        }),
      },
      select: { id: true },
    });
    await tx.lead.upsert({
      where: { tenantId_waId: { tenantId: account.clientId, waId: syntheticWaId } },
      create: {
        tenantId: account.clientId,
        waId: syntheticWaId,
        waIdCanonical: syntheticWaId,
        name: displayName,
        phone: null,
        status: "NEW",
        contactChannelIdentityId: identity.id,
        ...channelFields,
      },
      update: {
        waIdCanonical: syntheticWaId,
        name: displayName,
        contactChannelIdentityId: identity.id,
        ...channelFields,
      },
      select: { id: true },
    });
    if (!existingContact) {
      await tx.event.create({
        data: {
          clientId: account.clientId,
          waId: syntheticWaId,
          waIdCanonical: syntheticWaId,
          requestId: params.requestId,
          eventName: "telegram.contact.created",
          payloadJson: {
            channelAccountId: account.channelAccountId,
            externalUserHash: externalUserHash.slice(0, 16),
          } satisfies Prisma.InputJsonObject,
        },
      });
    }
    if (!existingConversation) {
      await tx.event.create({
        data: {
          clientId: account.clientId,
          conversationId: conversationRecord.id,
          waId: syntheticWaId,
          waIdCanonical: syntheticWaId,
          requestId: params.requestId,
          eventName: "telegram.conversation.created",
          payloadJson: {
            channelAccountId: account.channelAccountId,
            externalUserHash: externalUserHash.slice(0, 16),
          } satisfies Prisma.InputJsonObject,
        },
      });
    }
    await tx.event.create({
      data: {
        clientId: account.clientId,
        conversationId: conversationRecord.id,
        waId: syntheticWaId,
        waIdCanonical: syntheticWaId,
        messageId,
        requestId: params.requestId,
        eventName: "telegram.inbound.persisted",
        payloadJson: {
          channelAccountId: account.channelAccountId,
          updateId: parsed.parsed.updateId,
          messageId: parsed.parsed.messageId,
          textLength: parsed.parsed.textLength,
          externalUserHash: externalUserHash.slice(0, 16),
        } satisfies Prisma.InputJsonObject,
      },
    });
    return [conversationRecord, runtimeRecord, inboundRecord, contactRecord] as const;
  });
  const assignment = await applyBalancedQueueAssignment({
    prisma: params.prisma,
    clientId: account.clientId,
    conversationId: conversation.id,
    runtimeStateId: runtimeState.id,
    waId: syntheticWaId,
    waIdCanonical: syntheticWaId,
    departmentId: runtimeState.departmentId ?? defaults.department.id,
    queueId: runtimeState.queueId ?? defaults.queue.id,
    status: runtimeState.status,
    assignedUserId: runtimeState.assignedUserId,
    requestId: params.requestId,
    source: "telegram.inbound",
  });
  const assignedUserId = assignment.applied ? assignment.selectedUserId : runtimeState.assignedUserId ?? null;

  const publish = params.publishRealtimeEvent ?? publishRealtimeEvent;
  publish({
    type: "message.created",
    clientId: account.clientId,
    waId: syntheticWaId,
    waIdCanonical: syntheticWaId,
    mode: "HUMAN",
    handoffStatus: "none",
    humanInboxVisible: true,
    assignedUserId,
    departmentId: defaults.department.id,
    message: {
      inboxVisibility: "human_timeline",
      direction: "INBOUND",
      type: MessageType.TEXT,
      status: "RECEIVED",
      intent: null,
      bodyText: parsed.parsed.text,
      media: undefined,
      templateName: null,
      templateLang: null,
      requestId: params.requestId,
      messageId,
      metaMessageId: null,
      errorBody: null,
      createdAt: now.toISOString(),
    },
  });

  return {
    ok: true,
    persisted: true,
    replay: false,
    tenantKey: account.client.clientKey,
    clientId: account.clientId,
    channelAccountId: account.channelAccountId,
    syntheticWaId,
    conversationId: conversation.id,
    runtimeStateId: runtimeState.id,
    inboundMessageId: inbound.id,
    contactId: contact.id,
    contactCreated: !existingContact,
    conversationCreated: !existingConversation,
    parsed: {
      updateId: parsed.parsed.updateId,
      messageId: parsed.parsed.messageId,
      textPresent: true,
      textLength: parsed.parsed.textLength,
    },
  };
}
