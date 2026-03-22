import { HandoffStatus } from "@prisma/client";
import { env } from "../config/env.js";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";
import { Storage, StoredRecord, MessageStatus } from "./storage.js";
import { ConversationState } from "../conversation/conversation.types.js";

type ShadowCompareFields = {
  conversationKey?: string | null;
  firstSeenAt?: string | null;
  windowIsOpen?: boolean;
  windowExpiresAt?: string | null;
  lastInboundAt?: string | null;
  lastOutboundAt?: string | null;
  lastInboundMessageId?: string | null;
  lastOutboundMessageId?: string | null;
  intent?: string | null;
  handoffStatus?: HandoffStatus | null;
  templateNeeded?: boolean | null;
  templateSuggested?: string | null;
  lastNeedAt?: string | null;
  lastIntent?: string | null;
  leadRequestedAt?: string | null;
  leadCapturedAt?: string | null;
  demoStatus?: string | null;
  lastDemoRequestedAt?: string | null;
  lastDemoScheduledAt?: string | null;
  demoPreferredSchedule?: string | null;
  lastHandoffDemoScheduledKey?: string | null;
  lastHandoffDemoScheduledAt?: string | null;
  flow?: string | null;
  flowStep?: number | null;
  answersJson?: string | null;
  mode?: string | null;
  assignedUserId?: string | null;
  assignedTo?: string | null;
  assignedAt?: string | null;
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

function stableJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((item) => JSON.parse(stableJson(item) ?? "null")));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, JSON.parse(stableJson(item) ?? "null")]);
    return JSON.stringify(Object.fromEntries(entries));
  }
  return JSON.stringify(value);
}

function mapStateToShadow(state: ConversationState): ShadowCompareFields {
  return {
    conversationKey: state.conversationKey ?? null,
    firstSeenAt: toIso(state.firstSeenAt),
    windowIsOpen: Boolean(state.window?.isOpen),
    windowExpiresAt: toIso(state.window?.expiresAt),
    lastInboundAt: toIso(state.lastInboundAt),
    lastOutboundAt: toIso(state.lastOutboundAt),
    lastInboundMessageId: state.lastInboundMessageId ?? null,
    lastOutboundMessageId: state.lastOutboundMessageId ?? null,
    intent: state.intent ?? null,
    handoffStatus: toHandoffStatus(state.handoff?.status),
    templateNeeded: state.templateNeeded ?? false,
    templateSuggested: state.templateSuggested ?? null,
    lastNeedAt: toIso(state.lastNeedAt),
    lastIntent: state.lastIntent ?? null,
    leadRequestedAt: toIso(state.leadRequestedAt),
    leadCapturedAt: toIso(state.leadCapturedAt),
    demoStatus: state.demoStatus ?? null,
    lastDemoRequestedAt: toIso(state.lastDemoRequestedAt),
    lastDemoScheduledAt: toIso(state.lastDemoScheduledAt),
    demoPreferredSchedule: state.demoPreferredSchedule ?? null,
    lastHandoffDemoScheduledKey: state.lastHandoffDemoScheduledKey ?? null,
    lastHandoffDemoScheduledAt: toIso(state.lastHandoffDemoScheduledAt),
    flow: state.flow ?? null,
    flowStep: state.flowStep ?? null,
    answersJson: stableJson(state.answers ?? null),
    mode: state.mode ?? null,
    assignedUserId: state.assignedUserId ?? null,
    assignedTo: state.assignedTo ?? null,
    assignedAt: toIso(state.assignedAt),
  };
}

function mapDbToShadow(db: {
  conversationKey: string | null;
  firstSeenAt: Date | null;
  windowIsOpen: boolean;
  windowExpiresAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  lastInboundMessageId: string | null;
  lastOutboundMessageId: string | null;
  intent: string | null;
  handoffStatus: HandoffStatus | null;
  templateNeeded: boolean;
  templateSuggested: string | null;
  lastNeedAt: Date | null;
  lastIntent: string | null;
  leadRequestedAt: Date | null;
  leadCapturedAt: Date | null;
  demoStatus: string | null;
  lastDemoRequestedAt: Date | null;
  lastDemoScheduledAt: Date | null;
  demoPreferredSchedule: string | null;
  lastHandoffDemoScheduledKey: string | null;
  lastHandoffDemoScheduledAt: Date | null;
  flow: string | null;
  flowStep: number | null;
  answers: unknown;
  mode: string | null;
  assignedUserId: string | null;
  assignedTo: string | null;
  assignedAt: Date | null;
}): ShadowCompareFields {
  return {
    conversationKey: db.conversationKey ?? null,
    firstSeenAt: db.firstSeenAt ? db.firstSeenAt.toISOString() : null,
    windowIsOpen: db.windowIsOpen,
    windowExpiresAt: db.windowExpiresAt ? db.windowExpiresAt.toISOString() : null,
    lastInboundAt: db.lastInboundAt ? db.lastInboundAt.toISOString() : null,
    lastOutboundAt: db.lastOutboundAt ? db.lastOutboundAt.toISOString() : null,
    lastInboundMessageId: db.lastInboundMessageId ?? null,
    lastOutboundMessageId: db.lastOutboundMessageId ?? null,
    intent: db.intent ?? null,
    handoffStatus: db.handoffStatus ?? null,
    templateNeeded: db.templateNeeded,
    templateSuggested: db.templateSuggested ?? null,
    lastNeedAt: db.lastNeedAt ? db.lastNeedAt.toISOString() : null,
    lastIntent: db.lastIntent ?? null,
    leadRequestedAt: db.leadRequestedAt ? db.leadRequestedAt.toISOString() : null,
    leadCapturedAt: db.leadCapturedAt ? db.leadCapturedAt.toISOString() : null,
    demoStatus: db.demoStatus ?? null,
    lastDemoRequestedAt: db.lastDemoRequestedAt
      ? db.lastDemoRequestedAt.toISOString()
      : null,
    lastDemoScheduledAt: db.lastDemoScheduledAt
      ? db.lastDemoScheduledAt.toISOString()
      : null,
    demoPreferredSchedule: db.demoPreferredSchedule ?? null,
    lastHandoffDemoScheduledKey: db.lastHandoffDemoScheduledKey ?? null,
    lastHandoffDemoScheduledAt: db.lastHandoffDemoScheduledAt
      ? db.lastHandoffDemoScheduledAt.toISOString()
      : null,
    flow: db.flow ?? null,
    flowStep: db.flowStep ?? null,
    answersJson: stableJson(db.answers),
    mode: db.mode ?? null,
    assignedUserId: db.assignedUserId ?? null,
    assignedTo: db.assignedTo ?? null,
    assignedAt: db.assignedAt ? db.assignedAt.toISOString() : null,
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
        conversationKey: state.conversationKey ?? null,
        firstSeenAt: toDate(state.firstSeenAt),
        windowIsOpen: Boolean(state.window?.isOpen),
        windowExpiresAt: toDate(state.window?.expiresAt),
        lastInboundAt: toDate(state.lastInboundAt),
        lastOutboundAt: toDate(state.lastOutboundAt),
        lastInboundMessageId: state.lastInboundMessageId ?? null,
        lastOutboundMessageId: state.lastOutboundMessageId ?? null,
        intent: state.intent ?? null,
        handoffStatus: toHandoffStatus(state.handoff?.status),
        handoffRequestedAt: toDate(state.handoff?.requestedAt),
        handoffActivatedAt: toDate(state.handoff?.activatedAt),
        handoffReleasedAt: toDate(state.handoff?.releasedAt),
        templateNeeded: state.templateNeeded ?? false,
        templateSuggested: state.templateSuggested ?? null,
        lastNeedAt: toDate(state.lastNeedAt),
        lastIntent: state.lastIntent ?? null,
        leadRequestedAt: toDate(state.leadRequestedAt),
        leadCapturedAt: toDate(state.leadCapturedAt),
        demoStatus: state.demoStatus ?? null,
        lastDemoRequestedAt: toDate(state.lastDemoRequestedAt),
        lastDemoScheduledAt: toDate(state.lastDemoScheduledAt),
        demoPreferredSchedule: state.demoPreferredSchedule ?? null,
        lastHandoffDemoScheduledKey: state.lastHandoffDemoScheduledKey ?? null,
        lastHandoffDemoScheduledAt: toDate(state.lastHandoffDemoScheduledAt),
        flow: state.flow ?? null,
        flowStep: state.flowStep ?? null,
        answers: state.answers ?? undefined,
        mode: state.mode ?? null,
        assignedUserId: state.assignedUserId ?? null,
        assignedTo: state.assignedTo ?? null,
        assignedAt: toDate(state.assignedAt),
      },
      update: {
        conversationKey: state.conversationKey ?? null,
        firstSeenAt: toDate(state.firstSeenAt),
        windowIsOpen: Boolean(state.window?.isOpen),
        windowExpiresAt: toDate(state.window?.expiresAt),
        lastInboundAt: toDate(state.lastInboundAt),
        lastOutboundAt: toDate(state.lastOutboundAt),
        lastInboundMessageId: state.lastInboundMessageId ?? null,
        lastOutboundMessageId: state.lastOutboundMessageId ?? null,
        intent: state.intent ?? null,
        handoffStatus: toHandoffStatus(state.handoff?.status),
        handoffRequestedAt: toDate(state.handoff?.requestedAt),
        handoffActivatedAt: toDate(state.handoff?.activatedAt),
        handoffReleasedAt: toDate(state.handoff?.releasedAt),
        templateNeeded: state.templateNeeded ?? false,
        templateSuggested: state.templateSuggested ?? null,
        lastNeedAt: toDate(state.lastNeedAt),
        lastIntent: state.lastIntent ?? null,
        leadRequestedAt: toDate(state.leadRequestedAt),
        leadCapturedAt: toDate(state.leadCapturedAt),
        demoStatus: state.demoStatus ?? null,
        lastDemoRequestedAt: toDate(state.lastDemoRequestedAt),
        lastDemoScheduledAt: toDate(state.lastDemoScheduledAt),
        demoPreferredSchedule: state.demoPreferredSchedule ?? null,
        lastHandoffDemoScheduledKey: state.lastHandoffDemoScheduledKey ?? null,
        lastHandoffDemoScheduledAt: toDate(state.lastHandoffDemoScheduledAt),
        flow: state.flow ?? null,
        flowStep: state.flowStep ?? null,
        answers: state.answers ?? undefined,
        mode: state.mode ?? null,
        assignedUserId: state.assignedUserId ?? null,
        assignedTo: state.assignedTo ?? null,
        assignedAt: toDate(state.assignedAt),
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
        conversationKey: true,
        firstSeenAt: true,
        windowIsOpen: true,
        windowExpiresAt: true,
        lastInboundAt: true,
        lastOutboundAt: true,
        lastInboundMessageId: true,
        lastOutboundMessageId: true,
        intent: true,
        handoffStatus: true,
        templateNeeded: true,
        templateSuggested: true,
        lastNeedAt: true,
        lastIntent: true,
        leadRequestedAt: true,
        leadCapturedAt: true,
        demoStatus: true,
        lastDemoRequestedAt: true,
        lastDemoScheduledAt: true,
        demoPreferredSchedule: true,
        lastHandoffDemoScheduledKey: true,
        lastHandoffDemoScheduledAt: true,
        flow: true,
        flowStep: true,
        answers: true,
        mode: true,
        assignedUserId: true,
        assignedTo: true,
        assignedAt: true,
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
      const clientId = await getClientId(clientKey);
      if (!clientId) return;
      try {
        await prisma.conversationRuntimeState.deleteMany({
          where: {
            clientId,
            waId,
          },
        });
      } catch (error) {
        logger.warn({
          event: "state.shadow.delete_failed",
          waId,
          clientId,
          error: (error as Error).message,
        });
        if (env.CONV_STATE_DB_WRITE_STRICT) {
          throw error;
        }
      }
    },
  };
}
