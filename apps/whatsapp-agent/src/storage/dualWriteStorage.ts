import { HandoffStatus } from "@prisma/client";
import { env } from "../config/env.js";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";
import { Storage, StoredRecord, MessageStatus } from "./storage.js";
import { ConversationState } from "../conversation/conversation.types.js";

type ShadowCompareFields = {
  windowIsOpen?: boolean;
  windowExpiresAt?: string | null;
  lastInboundAt?: string | null;
  lastOutboundAt?: string | null;
  intent?: string | null;
  handoffStatus?: HandoffStatus | null;
  leadRequestedAt?: string | null;
  leadCapturedAt?: string | null;
  demoStatus?: string | null;
  lastDemoRequestedAt?: string | null;
  lastDemoScheduledAt?: string | null;
};

function toIso(value?: string | null) {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? null : new Date(ts).toISOString();
}

function toDate(value?: string | null) {
  const iso = toIso(value);
  return iso ? new Date(iso) : null;
}

function mapStateToShadow(state: ConversationState): ShadowCompareFields {
  return {
    windowIsOpen: Boolean(state.window?.isOpen),
    windowExpiresAt: toIso(state.window?.expiresAt),
    lastInboundAt: toIso(state.lastInboundAt),
    lastOutboundAt: toIso(state.lastOutboundAt),
    intent: state.intent ?? null,
    handoffStatus: toHandoffStatus(state.handoff?.status),
    leadRequestedAt: toIso(state.leadRequestedAt),
    leadCapturedAt: toIso(state.leadCapturedAt),
    demoStatus: state.demoStatus ?? null,
    lastDemoRequestedAt: toIso(state.lastDemoRequestedAt),
    lastDemoScheduledAt: toIso(state.lastDemoScheduledAt),
  };
}

function mapDbToShadow(db: {
  windowIsOpen: boolean;
  windowExpiresAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  intent: string | null;
  handoffStatus: HandoffStatus | null;
  leadRequestedAt: Date | null;
  leadCapturedAt: Date | null;
  demoStatus: string | null;
  lastDemoRequestedAt: Date | null;
  lastDemoScheduledAt: Date | null;
}): ShadowCompareFields {
  return {
    windowIsOpen: db.windowIsOpen,
    windowExpiresAt: db.windowExpiresAt ? db.windowExpiresAt.toISOString() : null,
    lastInboundAt: db.lastInboundAt ? db.lastInboundAt.toISOString() : null,
    lastOutboundAt: db.lastOutboundAt ? db.lastOutboundAt.toISOString() : null,
    intent: db.intent ?? null,
    handoffStatus: db.handoffStatus ?? null,
    leadRequestedAt: db.leadRequestedAt ? db.leadRequestedAt.toISOString() : null,
    leadCapturedAt: db.leadCapturedAt ? db.leadCapturedAt.toISOString() : null,
    demoStatus: db.demoStatus ?? null,
    lastDemoRequestedAt: db.lastDemoRequestedAt
      ? db.lastDemoRequestedAt.toISOString()
      : null,
    lastDemoScheduledAt: db.lastDemoScheduledAt
      ? db.lastDemoScheduledAt.toISOString()
      : null,
  };
}

function diffShadow(a: ShadowCompareFields, b: ShadowCompareFields) {
  const diffs: string[] = [];
  (Object.keys(a) as Array<keyof ShadowCompareFields>).forEach((key) => {
    if ((a[key] ?? null) !== (b[key] ?? null)) {
      diffs.push(String(key));
    }
  });
  return diffs;
}

function toHandoffStatus(value?: string | null): HandoffStatus {
  const normalized = (value ?? "none").toLowerCase();
  if (normalized === "pending") return HandoffStatus.PENDING;
  if (normalized === "active") return HandoffStatus.ACTIVE;
  return HandoffStatus.NONE;
}

export function createDualWriteStorage(primary: Storage): Storage {
  const prisma = getPrisma();
  const cachedClientIds = new Map<string, string>();

  async function getClientId(clientKeyFromState?: string | null) {
    const clientKey = clientKeyFromState || env.CLIENT_KEY || env.CLIENT_ID || "default";
    const cached = cachedClientIds.get(clientKey);
    if (cached) return cached;
    const client = await prisma.client.findUnique({
      where: { clientKey },
      select: { id: true },
    });
    if (!client) {
      logger.warn({
        event: "state.shadow.write_failed",
        reason: "client_not_found",
        clientKey,
      });
      return null;
    }
    cachedClientIds.set(clientKey, client.id);
    return client.id;
  }

  async function writeShadow(state: ConversationState) {
    const clientId = await getClientId(state.clientKey);
    if (!clientId) {
      return;
    }
    await prisma.conversationRuntimeState.upsert({
      where: {
        clientId_waId: { clientId, waId: state.waId },
      },
      create: {
        clientId,
        waId: state.waId,
        windowIsOpen: Boolean(state.window?.isOpen),
        windowExpiresAt: toDate(state.window?.expiresAt),
        lastInboundAt: toDate(state.lastInboundAt),
        lastOutboundAt: toDate(state.lastOutboundAt),
        intent: state.intent ?? null,
        handoffStatus: toHandoffStatus(state.handoff?.status),
        handoffRequestedAt: toDate(state.handoff?.requestedAt),
        handoffActivatedAt: toDate(state.handoff?.activatedAt),
        handoffReleasedAt: toDate(state.handoff?.releasedAt),
        leadRequestedAt: toDate(state.leadRequestedAt),
        leadCapturedAt: toDate(state.leadCapturedAt),
        demoStatus: state.demoStatus ?? null,
        lastDemoRequestedAt: toDate(state.lastDemoRequestedAt),
        lastDemoScheduledAt: toDate(state.lastDemoScheduledAt),
      },
      update: {
        windowIsOpen: Boolean(state.window?.isOpen),
        windowExpiresAt: toDate(state.window?.expiresAt),
        lastInboundAt: toDate(state.lastInboundAt),
        lastOutboundAt: toDate(state.lastOutboundAt),
        intent: state.intent ?? null,
        handoffStatus: toHandoffStatus(state.handoff?.status),
        handoffRequestedAt: toDate(state.handoff?.requestedAt),
        handoffActivatedAt: toDate(state.handoff?.activatedAt),
        handoffReleasedAt: toDate(state.handoff?.releasedAt),
        leadRequestedAt: toDate(state.leadRequestedAt),
        leadCapturedAt: toDate(state.leadCapturedAt),
        demoStatus: state.demoStatus ?? null,
        lastDemoRequestedAt: toDate(state.lastDemoRequestedAt),
        lastDemoScheduledAt: toDate(state.lastDemoScheduledAt),
        version: { increment: 1 },
      },
    });
    logger.info({
      event: "state.shadow.write",
      waId: state.waId,
      clientId,
    });
  }

  async function compareShadow(state: ConversationState) {
    const clientId = await getClientId(state.clientKey);
    if (!clientId) return;
    const db = await prisma.conversationRuntimeState.findUnique({
      where: {
        clientId_waId: { clientId, waId: state.waId },
      },
      select: {
        windowIsOpen: true,
        windowExpiresAt: true,
        lastInboundAt: true,
        lastOutboundAt: true,
        intent: true,
        handoffStatus: true,
        leadRequestedAt: true,
        leadCapturedAt: true,
        demoStatus: true,
        lastDemoRequestedAt: true,
        lastDemoScheduledAt: true,
      },
    });
    if (!db) return;
    const jsonView = mapStateToShadow(state);
    const dbView = mapDbToShadow(db);
    const diffs = diffShadow(jsonView, dbView);
    if (diffs.length > 0) {
      logger.warn({
        event: "state.shadow.mismatch",
        waId: state.waId,
        clientId,
        fields: diffs,
      });
    }
  }

  async function writeShadowSafe(state: ConversationState) {
    if (!env.CONV_STATE_DUAL_WRITE) return;
    try {
      await writeShadow(state);
    } catch (error) {
      logger.warn({
        event: "state.shadow.write_failed",
        reason: "db_error",
        waId: state.waId,
        error: (error as Error).message,
      });
      if (env.CONV_STATE_DB_WRITE_STRICT) {
        throw error;
      }
    }
  }

  return {
    async saveIncomingMessage(record: StoredRecord) {
      await primary.saveIncomingMessage(record);
    },
    async appendOutboundEvent(record: StoredRecord) {
      await primary.appendOutboundEvent(record);
    },
    async findByMessageId(messageId: string) {
      return primary.findByMessageId(messageId);
    },
    async updateStatus(messageId: string, status: MessageStatus, extra?: Record<string, unknown>) {
      await primary.updateStatus(messageId, status, extra);
    },
    async updateMessage(messageId: string, patch: Partial<StoredRecord>) {
      await primary.updateMessage(messageId, patch);
    },
    async getConversation(waId: string, clientKey = "default") {
      const state = await primary.getConversation(waId, clientKey);
      if (state && env.CONV_STATE_SHADOW_COMPARE) {
        try {
          await compareShadow(state);
        } catch (error) {
          logger.warn({
            event: "state.shadow.mismatch",
            waId,
            reason: "compare_failed",
            error: (error as Error).message,
          });
        }
      }
      return state;
    },
    async upsertConversation(state: ConversationState) {
      await primary.upsertConversation(state);
      await writeShadowSafe(state);
    },
    async updateConversationWindow(waId: string, lastInboundAt: string, clientKey = "default") {
      const updated = await primary.updateConversationWindow(
        waId,
        lastInboundAt,
        clientKey
      );
      await writeShadowSafe(updated);
      return updated;
    },
    async deleteConversation(waId: string, clientKey = "default") {
      await primary.deleteConversation(waId, clientKey);
    },
  };
}
