import { ConversationOperationalStatus, HandoffStatus } from "@prisma/client";
import { env } from "../config/env.js";
import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";
import { Storage, StoredRecord, MessageStatus } from "./storage.js";
import { ConversationState } from "../conversation/conversation.types.js";
import { makeConversationKey } from "./conversationKey.js";
import {
  buildWaIdLookup,
  canonicalizeBrazilWaId,
  compareConversationLookupPriority,
} from "../utils/waid.js";

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
  handoffRequestedAt?: string | null;
  handoffActivatedAt?: string | null;
  handoffReleasedAt?: string | null;
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
  chatbotNodeId?: string | null;
  chatbotActive?: boolean | null;
  answersJson?: string | null;
  mode?: string | null;
  assignedUserId?: string | null;
  assignedTo?: string | null;
  assignedAt?: string | null;
  departmentId?: string | null;
  queueId?: string | null;
  status?: ConversationOperationalStatus | null;
  closedAt?: string | null;
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

function normalizeDemoStatus(value?: string | null) {
  if (value === "requested" || value === "scheduled") {
    return value;
  }
  return "none";
}

function getJsonFieldValue(view: ShadowCompareFields, field: string) {
  return (view as Record<string, unknown>)[field] ?? null;
}

function maskWaId(value?: string | null) {
  if (!value) return null;
  const suffix = value.slice(-4);
  return suffix ? `***${suffix}` : "***";
}

function maskConversationKey(clientKey: string, waId: string) {
  return `${clientKey}:${maskWaId(waId) ?? "***"}`;
}

function getMostRecentJsonTimestamp(state: ConversationState | null) {
  if (!state) return null;
  const timestamps = [
    state.assignedAt,
    state.closedAt,
    state.lastHandoffDemoScheduledAt,
    state.lastDemoScheduledAt,
    state.lastDemoRequestedAt,
    state.leadCapturedAt,
    state.leadRequestedAt,
    state.lastNeedAt,
    state.handoff?.releasedAt,
    state.handoff?.activatedAt,
    state.handoff?.requestedAt,
    state.lastOutboundAt,
    state.lastInboundAt,
    state.firstSeenAt,
  ]
    .map((value) => toIso(value))
    .filter(Boolean) as string[];
  if (timestamps.length === 0) return null;
  timestamps.sort((a, b) => Date.parse(b) - Date.parse(a));
  return timestamps[0];
}

function getJsonUpdatedAt(state: ConversationState | null, field: string) {
  if (!state) return null;
  switch (field) {
    case "demoStatus":
    case "lastDemoRequestedAt":
      return toIso(state.lastDemoRequestedAt) ?? getMostRecentJsonTimestamp(state);
    case "lastDemoScheduledAt":
    case "demoPreferredSchedule":
      return toIso(state.lastDemoScheduledAt) ?? getMostRecentJsonTimestamp(state);
    case "lastHandoffDemoScheduledKey":
    case "lastHandoffDemoScheduledAt":
      return toIso(state.lastHandoffDemoScheduledAt) ?? getMostRecentJsonTimestamp(state);
    case "leadRequestedAt":
      return toIso(state.leadRequestedAt) ?? getMostRecentJsonTimestamp(state);
    case "leadCapturedAt":
      return toIso(state.leadCapturedAt) ?? getMostRecentJsonTimestamp(state);
    case "handoffStatus":
    case "handoffRequestedAt":
      return toIso(state.handoff?.requestedAt) ?? getMostRecentJsonTimestamp(state);
    case "handoffActivatedAt":
      return toIso(state.handoff?.activatedAt) ?? getMostRecentJsonTimestamp(state);
    case "handoffReleasedAt":
      return toIso(state.handoff?.releasedAt) ?? getMostRecentJsonTimestamp(state);
    default:
      return getMostRecentJsonTimestamp(state);
  }
}

function getLastWriteEvent(state: ConversationState | null, field: string) {
  if (!state) return "unknown";
  switch (field) {
    case "demoStatus":
    case "lastDemoRequestedAt":
      return normalizeDemoStatus(state.demoStatus) === "scheduled"
        ? "lead.demo_scheduled"
        : "lead.demo_requested";
    case "lastDemoScheduledAt":
    case "demoPreferredSchedule":
      return "lead.demo_scheduled";
    case "lastHandoffDemoScheduledKey":
    case "lastHandoffDemoScheduledAt":
      return "handoff.notify";
    case "leadRequestedAt":
      return "lead.capture_requested";
    case "leadCapturedAt":
      return "lead.captured";
    default:
      return "conversation.upsert";
  }
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
    handoffRequestedAt: toIso(state.handoff?.requestedAt),
    handoffActivatedAt: toIso(state.handoff?.activatedAt),
    handoffReleasedAt: toIso(state.handoff?.releasedAt),
    templateNeeded: state.templateNeeded ?? false,
    templateSuggested: state.templateSuggested ?? null,
    lastNeedAt: toIso(state.lastNeedAt),
    lastIntent: state.lastIntent ?? null,
    leadRequestedAt: toIso(state.leadRequestedAt),
    leadCapturedAt: toIso(state.leadCapturedAt),
    demoStatus: normalizeDemoStatus(state.demoStatus),
    lastDemoRequestedAt: toIso(state.lastDemoRequestedAt),
    lastDemoScheduledAt: toIso(state.lastDemoScheduledAt),
    demoPreferredSchedule: state.demoPreferredSchedule ?? null,
    lastHandoffDemoScheduledKey: state.lastHandoffDemoScheduledKey ?? null,
    lastHandoffDemoScheduledAt: toIso(state.lastHandoffDemoScheduledAt),
    flow: state.flow ?? null,
    flowStep: state.flowStep ?? null,
    chatbotNodeId: state.chatbotNodeId ?? null,
    chatbotActive: state.chatbotActive ?? false,
    answersJson: stableJson(state.answers ?? null),
    mode: state.mode ?? null,
    assignedUserId: state.assignedUserId ?? null,
    assignedTo: state.assignedTo ?? null,
    assignedAt: toIso(state.assignedAt),
    departmentId: state.departmentId ?? null,
    queueId: state.queueId ?? null,
    status: toConversationOperationalStatus(state.status),
    closedAt: toIso(state.closedAt),
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
  handoffRequestedAt: Date | null;
  handoffActivatedAt: Date | null;
  handoffReleasedAt: Date | null;
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
  chatbotNodeId: string | null;
  chatbotActive: boolean;
  answers: unknown;
  mode: string | null;
  assignedUserId: string | null;
  assignedTo: string | null;
  assignedAt: Date | null;
  departmentId: string | null;
  queueId: string | null;
  status: ConversationOperationalStatus | null;
  closedAt: Date | null;
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
    handoffRequestedAt: db.handoffRequestedAt
      ? db.handoffRequestedAt.toISOString()
      : null,
    handoffActivatedAt: db.handoffActivatedAt
      ? db.handoffActivatedAt.toISOString()
      : null,
    handoffReleasedAt: db.handoffReleasedAt
      ? db.handoffReleasedAt.toISOString()
      : null,
    templateNeeded: db.templateNeeded,
    templateSuggested: db.templateSuggested ?? null,
    lastNeedAt: db.lastNeedAt ? db.lastNeedAt.toISOString() : null,
    lastIntent: db.lastIntent ?? null,
    leadRequestedAt: db.leadRequestedAt ? db.leadRequestedAt.toISOString() : null,
    leadCapturedAt: db.leadCapturedAt ? db.leadCapturedAt.toISOString() : null,
    demoStatus: normalizeDemoStatus(db.demoStatus),
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
    chatbotNodeId: db.chatbotNodeId ?? null,
    chatbotActive: db.chatbotActive,
    answersJson: stableJson(db.answers),
    mode: db.mode ?? null,
    assignedUserId: db.assignedUserId ?? null,
    assignedTo: db.assignedTo ?? null,
    assignedAt: db.assignedAt ? db.assignedAt.toISOString() : null,
    departmentId: db.departmentId ?? null,
    queueId: db.queueId ?? null,
    status: db.status ?? null,
    closedAt: db.closedAt ? db.closedAt.toISOString() : null,
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

function toConversationOperationalStatus(value?: string | null): ConversationOperationalStatus | null {
  switch ((value ?? "").toUpperCase()) {
    case "WAITING":
      return ConversationOperationalStatus.WAITING;
    case "IN_PROGRESS":
      return ConversationOperationalStatus.IN_PROGRESS;
    case "WAITING_USER":
      return ConversationOperationalStatus.WAITING_USER;
    case "CLOSED":
      return ConversationOperationalStatus.CLOSED;
    default:
      return null;
  }
}

type DualWriteOptions = {
  readSource?: "json" | "hybrid" | "postgres";
  jsonWriteEnabled?: boolean;
};

export function createDualWriteStorage(
  primary: Storage,
  options: DualWriteOptions = {}
): Storage {
  const prisma = getPrisma();
  const cachedClientIds = new Map<string, string>();
  const readMismatchCounts = new Map<string, number>();
  const readSource = options.readSource ?? "json";
  const jsonWriteEnabled = options.jsonWriteEnabled ?? env.CONV_STATE_JSON_WRITE_ENABLED;
  const shouldWriteShadow =
    env.CONV_STATE_DUAL_WRITE ||
    env.STORAGE_MODE === "hybrid" ||
    env.STORAGE_MODE === "postgres" ||
    readSource === "postgres";

  function validateConversationState(
    state: ConversationState | null,
    clientKey: string,
    waId: string
  ): { ok: true; state: ConversationState } | { ok: false; reason: string; error?: string } {
    if (!state) {
      return { ok: false, reason: "not_found" };
    }
    if (!state.firstSeenAt || Number.isNaN(Date.parse(state.firstSeenAt))) {
      return { ok: false, reason: "invalid_first_seen_at" };
    }
    if (!state.lastInboundAt || Number.isNaN(Date.parse(state.lastInboundAt))) {
      return { ok: false, reason: "invalid_last_inbound_at" };
    }
    if (!state.window || typeof state.window.isOpen !== "boolean") {
      return { ok: false, reason: "invalid_window" };
    }
    if (!state.handoff || !["none", "pending", "active"].includes(state.handoff.status)) {
      return { ok: false, reason: "invalid_handoff" };
    }
    if (state.conversationKey !== makeConversationKey(clientKey, state.waId || waId)) {
      return { ok: false, reason: "invalid_conversation_key" };
    }
    return { ok: true, state };
  }

  function normalizeIntent(value?: string | null): ConversationState["intent"] {
    if (value === "pricing" || value === "support" || value === "handoff" || value === "unknown") {
      return value;
    }
    return "unknown";
  }

  function normalizeMode(value?: string | null): ConversationState["mode"] {
    return value === "HUMAN" ? "HUMAN" : "BOT";
  }

  function normalizeFlow(value?: string | null): ConversationState["flow"] {
    if (value === "quote_site") return "quote_site";
    if (typeof value === "string" && value.startsWith("chatbot:")) {
      return value as ConversationState["flow"];
    }
    return undefined;
  }

  function mapDbToConversationState(params: {
    clientKey: string;
    waId: string;
    db: {
      waId: string;
      waIdCanonical: string | null;
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
      handoffRequestedAt: Date | null;
      handoffActivatedAt: Date | null;
      handoffReleasedAt: Date | null;
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
      chatbotNodeId: string | null;
      chatbotActive: boolean;
      answers: unknown;
      mode: string | null;
      assignedUserId: string | null;
      assignedTo: string | null;
      assignedAt: Date | null;
      departmentId: string | null;
      queueId: string | null;
      status: ConversationOperationalStatus | null;
      closedAt: Date | null;
    };
  }): ConversationState {
    const answers =
      params.db.answers && typeof params.db.answers === "object" && !Array.isArray(params.db.answers)
        ? (params.db.answers as ConversationState["answers"])
        : {};
    return {
      clientKey: params.clientKey,
      conversationKey:
        params.db.conversationKey ?? makeConversationKey(params.clientKey, params.db.waId),
      waId: params.db.waId,
      waIdCanonical: params.db.waIdCanonical ?? canonicalizeBrazilWaId(params.db.waId),
      firstSeenAt: params.db.firstSeenAt?.toISOString() ?? "",
      lastInboundAt: params.db.lastInboundAt?.toISOString() ?? "",
      lastOutboundAt: params.db.lastOutboundAt?.toISOString() ?? undefined,
      lastInboundMessageId: params.db.lastInboundMessageId ?? undefined,
      lastOutboundMessageId: params.db.lastOutboundMessageId ?? undefined,
      window: {
        isOpen: params.db.windowIsOpen,
        expiresAt: params.db.windowExpiresAt?.toISOString() ?? undefined,
      },
      intent: normalizeIntent(params.db.intent),
      handoff: {
        status:
          params.db.handoffStatus === HandoffStatus.PENDING
            ? "pending"
            : params.db.handoffStatus === HandoffStatus.ACTIVE
              ? "active"
              : "none",
        requestedAt: params.db.handoffRequestedAt?.toISOString(),
        activatedAt: params.db.handoffActivatedAt?.toISOString(),
        releasedAt: params.db.handoffReleasedAt?.toISOString(),
      },
      templateNeeded: params.db.templateNeeded,
      templateSuggested: params.db.templateSuggested ?? undefined,
      lastNeedAt: params.db.lastNeedAt?.toISOString() ?? undefined,
      lastIntent: normalizeIntent(params.db.lastIntent),
      leadRequestedAt: params.db.leadRequestedAt?.toISOString() ?? undefined,
      leadCapturedAt: params.db.leadCapturedAt?.toISOString() ?? undefined,
      demoStatus: normalizeDemoStatus(params.db.demoStatus),
      lastDemoRequestedAt: params.db.lastDemoRequestedAt?.toISOString() ?? undefined,
      lastDemoScheduledAt: params.db.lastDemoScheduledAt?.toISOString() ?? undefined,
      demoPreferredSchedule: params.db.demoPreferredSchedule ?? undefined,
      lastHandoffDemoScheduledKey: params.db.lastHandoffDemoScheduledKey ?? undefined,
      lastHandoffDemoScheduledAt:
        params.db.lastHandoffDemoScheduledAt?.toISOString() ?? undefined,
      flow: normalizeFlow(params.db.flow),
      flowStep: params.db.flowStep ?? undefined,
      chatbotNodeId: params.db.chatbotNodeId ?? undefined,
      chatbotActive: params.db.chatbotActive ?? false,
      answers,
      mode: normalizeMode(params.db.mode),
      assignedUserId: params.db.assignedUserId ?? null,
      assignedTo: params.db.assignedTo ?? null,
      assignedAt: params.db.assignedAt?.toISOString() ?? null,
      departmentId: params.db.departmentId ?? null,
      queueId: params.db.queueId ?? null,
      status: params.db.status ?? null,
      closedAt: params.db.closedAt?.toISOString() ?? null,
    };
  }

  async function getClientId(
    clientKeyFromState?: string | null,
    operation: "read" | "write" | "delete" = "write"
  ) {
    const clientKey = clientKeyFromState || env.CLIENT_KEY || env.CLIENT_ID || "default";
    const cached = cachedClientIds.get(clientKey);
    if (cached) return cached;
    const client = await prisma.client.findUnique({
      where: { clientKey },
      select: { id: true },
    });
    if (!client) {
      logger.warn({
        event:
          operation === "read"
            ? "state.shadow.read_compare_failed"
            : operation === "delete"
              ? "state.shadow.delete_failed"
              : "state.shadow.write_failed",
        reason: "client_not_found",
        clientKey,
      });
      return null;
    }
    cachedClientIds.set(clientKey, client.id);
    return client.id;
  }

  function summarizeReadMismatch(
    jsonState: ConversationState | null,
    dbState: ShadowCompareFields | null
  ) {
    if (!jsonState && !dbState) {
      return null;
    }
    if (!jsonState && dbState) {
      return {
        kind: "missing_in_json",
        fields: Object.keys(dbState).filter(
          (key) => (dbState as Record<string, unknown>)[key] != null
        ),
      };
    }
    if (jsonState && !dbState) {
      const jsonView = mapStateToShadow(jsonState);
      return {
        kind: "missing_in_postgres",
        fields: Object.keys(jsonView).filter(
          (key) => (jsonView as Record<string, unknown>)[key] != null
        ),
      };
    }
    const jsonView = mapStateToShadow(jsonState as ConversationState);
    const dbView = dbState as ShadowCompareFields;
    const fields = diffShadow(jsonView, dbView);
    if (fields.length === 0) {
      return null;
    }
    return {
      kind: "field_mismatch",
      fields,
    };
  }

  async function readShadowState(waId: string, clientKey?: string | null) {
    const clientId = await getClientId(clientKey, "read");
    if (!clientId) return null;
    const safeClientKey = clientKey || env.CLIENT_KEY || env.CLIENT_ID || "default";
    const lookup = buildWaIdLookup(waId);
    const rows = await prisma.conversationRuntimeState.findMany({
      where: {
        clientId,
        OR: [{ waIdCanonical: lookup.canonical }, { waId: lookup.raw }],
      },
      select: {
        updatedAt: true,
        waId: true,
        waIdCanonical: true,
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
        handoffRequestedAt: true,
        handoffActivatedAt: true,
        handoffReleasedAt: true,
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
        chatbotNodeId: true,
        chatbotActive: true,
        answers: true,
        mode: true,
        assignedUserId: true,
        assignedTo: true,
        assignedAt: true,
        departmentId: true,
        queueId: true,
        status: true,
        closedAt: true,
      },
    });
    const [db] = rows.sort((left, right) => compareConversationLookupPriority(left, right));
    if (rows.length > 1) {
      logger.warn({
        event: "waid.canonical.collision",
        clientId,
        clientKey: safeClientKey,
        waId,
        waIdCanonical: lookup.canonical,
        matchCount: rows.length,
        source: "runtime_shadow",
      });
    }
    return db
      ? {
          clientId,
          state: mapDbToConversationState({
            clientKey: safeClientKey,
            waId,
            db,
          }),
          shadow: mapDbToShadow(db),
          dbUpdatedAt: db.updatedAt.toISOString(),
        }
      : {
          clientId,
          state: null,
          shadow: null,
          dbUpdatedAt: null,
        };
  }

  function logShadowReadMismatch(
    jsonState: ConversationState | null,
    waId: string,
    clientKey: string | undefined,
    shadowResult:
      | {
          clientId: string;
          state: ConversationState | null;
          shadow: ShadowCompareFields | null;
          dbUpdatedAt: string | null;
        }
      | null
  ) {
    if (readSource === "json" || !shadowResult) return;
    const clientKeyValue =
      clientKey || jsonState?.clientKey || env.CLIENT_KEY || env.CLIENT_ID || "default";
    const summary = summarizeReadMismatch(jsonState, shadowResult.shadow);
    if (!summary) {
      return;
    }
    const conversationKey =
      jsonState?.conversationKey ??
      shadowResult.shadow?.conversationKey ??
      makeConversationKey(clientKeyValue, waId);
    const tenantMismatchCount = (readMismatchCounts.get(clientKeyValue) ?? 0) + 1;
    readMismatchCounts.set(clientKeyValue, tenantMismatchCount);
    const jsonView = jsonState ? mapStateToShadow(jsonState) : {};
    const primaryField = summary.fields[0] ?? "unknown";
    const jsonUpdatedAt = getJsonUpdatedAt(jsonState, primaryField);
    const dbUpdatedAt = shadowResult.dbUpdatedAt ?? null;
    const lastWriteSource =
      jsonUpdatedAt && dbUpdatedAt
        ? Date.parse(jsonUpdatedAt) >= Date.parse(dbUpdatedAt)
          ? "json"
          : "db"
        : jsonUpdatedAt
          ? "json"
          : dbUpdatedAt
            ? "db"
            : "unknown";
    logger.warn({
      event: "state.shadow.read_mismatch",
      clientId: shadowResult.clientId,
      clientKey: clientKeyValue,
      waId,
      conversationKey,
      field: primaryField,
      jsonValue: getJsonFieldValue(jsonView, primaryField),
      dbValue: shadowResult.shadow
        ? getJsonFieldValue(shadowResult.shadow, primaryField)
        : null,
      jsonUpdatedAt,
      dbUpdatedAt,
      lastWriteSource,
      lastWriteEvent: getLastWriteEvent(jsonState, primaryField),
      diff: {
        kind: summary.kind,
        fieldCount: summary.fields.length,
        fields: summary.fields.slice(0, 12),
      },
      tenantMismatchCount,
    });
  }

  function logPostgresReadMissing(params: {
    clientId?: string | null;
    clientKey: string;
    waId: string;
    reason: string;
  }) {
    logger.warn({
      event: "state.postgres.read_missing",
      clientId: params.clientId ?? null,
      clientKey: params.clientKey,
      waId: maskWaId(params.waId),
      conversationKey: maskConversationKey(params.clientKey, params.waId),
      reason: params.reason,
      readSource,
    });
  }

  function logPostgresReadFailed(params: {
    clientId?: string | null;
    clientKey: string;
    waId: string;
    reason: string;
    error: string;
  }) {
    logger.warn({
      event: "state.postgres.read_failed",
      clientId: params.clientId ?? null,
      clientKey: params.clientKey,
      waId: maskWaId(params.waId),
      conversationKey: maskConversationKey(params.clientKey, params.waId),
      reason: params.reason,
      readSource,
      error: params.error,
    });
  }

  function logJsonWriteSkipped(params: {
    clientId?: string | null;
    clientKey: string;
    waId: string;
    operation: "upsertConversation" | "updateConversationWindow" | "deleteConversation";
  }) {
    logger.info({
      event: "state.json.write_skipped",
      clientId: params.clientId ?? null,
      clientKey: params.clientKey,
      waId: maskWaId(params.waId),
      conversationKey: maskConversationKey(params.clientKey, params.waId),
      operation: params.operation,
      reason: "json_write_disabled",
    });
  }

  async function writeShadow(state: ConversationState) {
    const clientId = await getClientId(state.clientKey, "write");
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
        waIdCanonical: state.waIdCanonical ?? canonicalizeBrazilWaId(state.waId),
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
        demoStatus: normalizeDemoStatus(state.demoStatus),
        lastDemoRequestedAt: toDate(state.lastDemoRequestedAt),
        lastDemoScheduledAt: toDate(state.lastDemoScheduledAt),
        demoPreferredSchedule: state.demoPreferredSchedule ?? null,
        lastHandoffDemoScheduledKey: state.lastHandoffDemoScheduledKey ?? null,
        lastHandoffDemoScheduledAt: toDate(state.lastHandoffDemoScheduledAt),
        flow: state.flow ?? null,
        flowStep: state.flowStep ?? null,
        chatbotNodeId: state.chatbotNodeId ?? null,
        chatbotActive: state.chatbotActive ?? false,
        answers: state.answers ?? undefined,
        mode: state.mode ?? null,
        assignedUserId: state.assignedUserId ?? null,
        assignedTo: state.assignedTo ?? null,
        assignedAt: toDate(state.assignedAt),
        departmentId: state.departmentId ?? null,
        queueId: state.queueId ?? null,
        status: toConversationOperationalStatus(state.status),
        closedAt: toDate(state.closedAt),
      },
      update: {
        conversationKey: state.conversationKey ?? null,
        waIdCanonical: state.waIdCanonical ?? canonicalizeBrazilWaId(state.waId),
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
        demoStatus: normalizeDemoStatus(state.demoStatus),
        lastDemoRequestedAt: toDate(state.lastDemoRequestedAt),
        lastDemoScheduledAt: toDate(state.lastDemoScheduledAt),
        demoPreferredSchedule: state.demoPreferredSchedule ?? null,
        lastHandoffDemoScheduledKey: state.lastHandoffDemoScheduledKey ?? null,
        lastHandoffDemoScheduledAt: toDate(state.lastHandoffDemoScheduledAt),
        flow: state.flow ?? null,
        flowStep: state.flowStep ?? null,
        chatbotNodeId: state.chatbotNodeId ?? null,
        chatbotActive: state.chatbotActive ?? false,
        answers: state.answers ?? undefined,
        mode: state.mode ?? null,
        assignedUserId: state.assignedUserId ?? null,
        assignedTo: state.assignedTo ?? null,
        assignedAt: toDate(state.assignedAt),
        departmentId: state.departmentId ?? null,
        queueId: state.queueId ?? null,
        status: toConversationOperationalStatus(state.status),
        closedAt: toDate(state.closedAt),
        version: { increment: 1 },
      },
    });
    logger.info({
      event: "state.shadow.write",
      waId: state.waId,
      clientId,
    });
  }

  async function writeShadowSafe(state: ConversationState) {
    if (!shouldWriteShadow) return;
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
      if (readSource === "json") {
        return primary.getConversation(waId, clientKey);
      }

      const shadowPromise = readShadowState(waId, clientKey);

      if (readSource === "hybrid") {
        const primaryPromise = primary.getConversation(waId, clientKey);
        const [jsonResult, shadowResult] = await Promise.allSettled([
          primaryPromise,
          shadowPromise,
        ]);
        if (jsonResult.status === "rejected") {
          throw jsonResult.reason;
        }
        if (shadowResult.status === "rejected") {
          logger.warn({
            event: "state.shadow.read_compare_failed",
            clientKey,
            waId,
            conversationKey: makeConversationKey(clientKey, waId),
            reason: "compare_failed",
            error: (shadowResult.reason as Error).message,
          });
        } else {
          logShadowReadMismatch(jsonResult.value, waId, clientKey, shadowResult.value);
        }
        return jsonResult.value;
      }

      let shadowResult: Awaited<ReturnType<typeof readShadowState>>;
      try {
        shadowResult = await shadowPromise;
      } catch (error) {
        logPostgresReadFailed({
          clientId: null,
          clientKey,
          waId,
          reason: "postgres_read_error",
          error: (error as Error).message,
        });
        throw error;
      }

      const shadowValidation = validateConversationState(
        shadowResult?.state ?? null,
        clientKey,
        waId
      );
      if (shadowValidation.ok) {
        return shadowValidation.state;
      }

      if (shadowValidation.reason === "not_found") {
        logPostgresReadMissing({
          clientId: shadowResult?.clientId ?? null,
          clientKey,
          waId,
          reason: "postgres_not_found",
        });
        return null;
      }

      const errorMessage = `postgres_conversation_state_invalid:${shadowValidation.reason}`;
      logPostgresReadFailed({
        clientId: shadowResult?.clientId ?? null,
        clientKey,
        waId,
        reason: "postgres_invalid_state",
        error: shadowValidation.error ?? errorMessage,
      });
      throw new Error(errorMessage);
    },
    async upsertConversation(state: ConversationState) {
      if (jsonWriteEnabled) {
        await primary.upsertConversation(state);
      } else {
        logJsonWriteSkipped({
          clientId: null,
          clientKey: state.clientKey ?? "default",
          waId: state.waId,
          operation: "upsertConversation",
        });
      }
      await writeShadowSafe(state);
    },
    async updateConversationWindow(waId: string, lastInboundAt: string, clientKey = "default") {
      let updated: ConversationState;
      if (jsonWriteEnabled) {
        updated = await primary.updateConversationWindow(waId, lastInboundAt, clientKey);
      } else {
        logJsonWriteSkipped({
          clientId: null,
          clientKey,
          waId,
          operation: "updateConversationWindow",
        });
        const shadowResult = await readShadowState(waId, clientKey);
        const shadowValidation = validateConversationState(
          shadowResult?.state ?? null,
          clientKey,
          waId
        );
        if (!shadowValidation.ok) {
          throw new Error(`conversation_state_not_found:${shadowValidation.reason}`);
        }
        const inboundTime = Number.isNaN(Date.parse(lastInboundAt))
          ? Date.now()
          : Date.parse(lastInboundAt);
        updated = {
          ...shadowValidation.state,
          lastInboundAt,
          window: {
            isOpen: true,
            expiresAt: new Date(inboundTime + 24 * 60 * 60 * 1000).toISOString(),
          },
        };
      }
      await writeShadowSafe(updated);
      return updated;
    },
    async deleteConversation(waId: string, clientKey = "default") {
      if (jsonWriteEnabled) {
        await primary.deleteConversation(waId, clientKey);
      } else {
        logJsonWriteSkipped({
          clientId: null,
          clientKey,
          waId,
          operation: "deleteConversation",
        });
      }
      const clientId = await getClientId(clientKey, "delete");
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
