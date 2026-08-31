import crypto from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { normalizeConversationProtocol } from "../inbox/conversationProtocol.js";
import { ConversationState } from "./conversation.types.js";

export type ServiceCycleSnapshot = {
  protocol: string;
  cycleId: string;
  issuedAt: string;
  source: string;
};

export type ClosedServiceCycleSnapshot = ServiceCycleSnapshot & {
  closedAt: string;
  closeReason: string;
  closeSource: string;
};

export type CompletedServiceAttributionSnapshot = {
  assignedUserId?: string | null;
  departmentId?: string | null;
  queueId?: string | null;
  closedByUserId?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseCycle(value: unknown): ServiceCycleSnapshot | null {
  if (!isRecord(value)) return null;
  const protocol = normalizeConversationProtocol(typeof value.protocol === "string" ? value.protocol : null);
  const cycleId = typeof value.cycleId === "string" ? value.cycleId.trim() : "";
  const issuedAt = typeof value.issuedAt === "string" ? value.issuedAt.trim() : "";
  const source = typeof value.source === "string" && value.source.trim()
    ? value.source.trim()
    : "service_cycle";
  if (!protocol || !cycleId || !issuedAt) return null;
  return { protocol, cycleId, issuedAt, source };
}

export function getActiveServiceCycle(state?: { answers?: unknown } | null) {
  const answers = isRecord(state?.answers) ? state.answers : {};
  return parseCycle(answers.operationalProtocol);
}

export function getLastClosedServiceCycle(state?: { answers?: unknown } | null) {
  const answers = isRecord(state?.answers) ? state.answers : {};
  const cycle = parseCycle(answers.lastClosedServiceCycle);
  const raw: Record<string, unknown> = isRecord(answers.lastClosedServiceCycle)
    ? answers.lastClosedServiceCycle
    : {};
  const closedAt = typeof raw.closedAt === "string" ? raw.closedAt.trim() : "";
  if (!cycle || !closedAt) return null;
  return {
    ...cycle,
    closedAt,
    closeReason: typeof raw.closeReason === "string" ? raw.closeReason : "closed",
    closeSource: typeof raw.closeSource === "string" ? raw.closeSource : "unknown",
  } satisfies ClosedServiceCycleSnapshot;
}

export function buildServiceCycleSnapshot(at: Date, source = "service_cycle"): ServiceCycleSnapshot {
  return {
    protocol: `CVT-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
    cycleId: crypto.randomUUID(),
    issuedAt: at.toISOString(),
    source: source.trim() || "service_cycle",
  };
}

export function startNewServiceCycle(state: ConversationState, at: Date, source = "service_cycle") {
  const cycle = buildServiceCycleSnapshot(at, source);
  const answers = isRecord(state.answers) ? state.answers : {};
  return {
    state: {
      ...state,
      answers: {
        ...answers,
        operationalProtocol: cycle,
      } as ConversationState["answers"],
    },
    cycle,
  };
}

export function ensureActiveServiceCycle(state: ConversationState, at: Date, source = "service_cycle") {
  const existing = getActiveServiceCycle(state);
  return existing ? { state, cycle: existing, created: false as const } : {
    ...startNewServiceCycle(state, at, source),
    created: true as const,
  };
}

export function closeCurrentServiceCycle(params: {
  state: ConversationState;
  at: Date;
  reason: string;
  source: string;
}) {
  const active = getActiveServiceCycle(params.state);
  if (!active) return { state: params.state, cycle: null };
  const answers = isRecord(params.state.answers) ? { ...params.state.answers } : {};
  delete answers.operationalProtocol;
  const cycle: ClosedServiceCycleSnapshot = {
    ...active,
    closedAt: params.at.toISOString(),
    closeReason: params.reason,
    closeSource: params.source,
  };
  answers.lastClosedServiceCycle = cycle;
  return {
    state: { ...params.state, answers: answers as ConversationState["answers"] },
    cycle,
  };
}

export function clearServiceCycleState(state: ConversationState) {
  const answers = isRecord(state.answers) ? { ...state.answers } : {};
  delete answers.operationalProtocol;
  delete answers.lastClosedServiceCycle;
  return { ...state, answers: answers as ConversationState["answers"] };
}

export function clearActiveServiceCycle(state: ConversationState) {
  const answers = isRecord(state.answers) ? { ...state.answers } : {};
  delete answers.operationalProtocol;
  return { ...state, answers: answers as ConversationState["answers"] };
}

export function clearSatisfactionRuntimeForNewServiceCycle(state: ConversationState) {
  const answers: Record<string, unknown> = isRecord(state.answers) ? { ...state.answers } : {};
  const runtime = isRecord(answers.satisfactionRuntime) ? { ...answers.satisfactionRuntime } : null;
  if (!runtime) return state;
  delete runtime.commentOffer;
  delete runtime.commentInput;
  delete runtime.completedSurveyDecision;
  delete runtime.awaitingExpiredSurveyDecision;
  delete runtime.expiredSurveyId;
  if (Object.keys(runtime).length === 0) {
    delete answers.satisfactionRuntime;
  } else {
    answers.satisfactionRuntime = runtime;
  }
  return { ...state, answers: answers as ConversationState["answers"] };
}

export function getServiceCycleForDisplay(state?: { answers?: unknown } | null) {
  return getActiveServiceCycle(state) ?? getLastClosedServiceCycle(state);
}

export function withServiceCycleSnapshot(rawPayload: unknown, cycle: ServiceCycleSnapshot | null) {
  const raw = isRecord(rawPayload) ? { ...rawPayload } : {};
  if (!cycle) return raw as Prisma.InputJsonObject;
  return {
    ...raw,
    serviceCycle: {
      protocol: cycle.protocol,
      cycleId: cycle.cycleId,
      issuedAt: cycle.issuedAt,
    },
  } satisfies Prisma.InputJsonObject;
}

export function getServiceCycleSnapshot(rawPayload: unknown) {
  if (!isRecord(rawPayload)) return null;
  return parseCycle(rawPayload.serviceCycle);
}

export type ServiceCycleHistory = {
  protocol: string;
  cycleId: string;
  startedAt: Date;
  closedAt: Date | null;
};

export function buildServiceCycleHistoryMap(events: Array<{
  conversationId: string | null;
  eventName: string;
  payloadJson: unknown;
  createdAt: Date;
}>) {
  const byConversationId = new Map<string, Map<string, ServiceCycleHistory>>();
  for (const event of events) {
    if (!event.conversationId || !isRecord(event.payloadJson)) continue;
    const protocol = normalizeConversationProtocol(
      typeof event.payloadJson.protocol === "string" ? event.payloadJson.protocol : null
    );
    const cycleId = typeof event.payloadJson.cycleId === "string"
      ? event.payloadJson.cycleId.trim()
      : "";
    if (!protocol || !cycleId) continue;
    const cycles = byConversationId.get(event.conversationId) ?? new Map<string, ServiceCycleHistory>();
    const current = cycles.get(cycleId);
    const eventAt = event.eventName === "conversation.protocol.started"
      ? event.payloadJson.issuedAt
      : event.payloadJson.closedAt;
    const parsedAt = typeof eventAt === "string" ? new Date(eventAt) : event.createdAt;
    const occurredAt = Number.isFinite(parsedAt.getTime()) ? parsedAt : event.createdAt;
    if (event.eventName === "conversation.protocol.started") {
      cycles.set(cycleId, {
        protocol,
        cycleId,
        startedAt: occurredAt,
        closedAt: current?.closedAt ?? null,
      });
    } else if (event.eventName === "conversation.protocol.closed") {
      if (!current) continue;
      cycles.set(cycleId, {
        protocol,
        cycleId,
        startedAt: current.startedAt,
        closedAt: occurredAt,
      });
    }
    byConversationId.set(event.conversationId, cycles);
  }
  return new Map(
    Array.from(byConversationId.entries()).map(([conversationId, cycles]) => [
      conversationId,
      Array.from(cycles.values()).sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime()),
    ])
  );
}

export async function recordServiceCycleEvent(params: {
  prisma: PrismaClient;
  clientId: string;
  conversationId?: string | null;
  waId?: string | null;
  waIdCanonical?: string | null;
  requestId: string;
  action: "started" | "closed";
  cycle: ServiceCycleSnapshot | ClosedServiceCycleSnapshot;
  completedService?: CompletedServiceAttributionSnapshot;
}) {
  const closed = "closedAt" in params.cycle ? params.cycle : null;
  if (closed && params.completedService) {
    await recordCompletedServiceSnapshot({
      prisma: params.prisma,
      clientId: params.clientId,
      conversationId: params.conversationId ?? null,
      cycle: closed,
      attribution: params.completedService,
    });
  }
  await params.prisma.event.create({
    data: {
      clientId: params.clientId,
      conversationId: params.conversationId ?? null,
      waId: params.waId ?? null,
      waIdCanonical: params.waIdCanonical ?? null,
      requestId: `${params.requestId}:protocol:${params.action}:${params.cycle.cycleId}`,
      eventName: `conversation.protocol.${params.action}`,
      payloadJson: {
        clientId: params.clientId,
        conversationId: params.conversationId ?? null,
        protocol: params.cycle.protocol,
        cycleId: params.cycle.cycleId,
        issuedAt: params.cycle.issuedAt,
        source: params.cycle.source,
        ...(closed
          ? {
              closedAt: closed.closedAt,
              reason: closed.closeReason,
              closeSource: closed.closeSource,
            }
          : {}),
      },
    },
  });
}

function normalizeNullableId(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function sameNullableDate(left: Date, right: Date) {
  return left.getTime() === right.getTime();
}

function assertCompletedSnapshotMatches(existing: {
  conversationId: string | null;
  protocol: string;
  closedAt: Date;
  assignedUserId: string | null;
  departmentId: string | null;
  queueId: string | null;
  closedByUserId: string | null;
  closeReason: string | null;
  closeSource: string | null;
}, expected: {
  conversationId: string | null;
  protocol: string;
  closedAt: Date;
  assignedUserId: string | null;
  departmentId: string | null;
  queueId: string | null;
  closedByUserId: string | null;
  closeReason: string | null;
  closeSource: string | null;
}) {
  const matches =
    existing.conversationId === expected.conversationId &&
    existing.protocol === expected.protocol &&
    sameNullableDate(existing.closedAt, expected.closedAt) &&
    existing.assignedUserId === expected.assignedUserId &&
    existing.departmentId === expected.departmentId &&
    existing.queueId === expected.queueId &&
    existing.closedByUserId === expected.closedByUserId &&
    existing.closeReason === expected.closeReason &&
    existing.closeSource === expected.closeSource;
  if (!matches) {
    throw new Error("completed_service_snapshot_conflict");
  }
}

export async function recordCompletedServiceSnapshot(params: {
  prisma: PrismaClient;
  clientId: string;
  conversationId?: string | null;
  cycle: ClosedServiceCycleSnapshot;
  attribution: CompletedServiceAttributionSnapshot;
}) {
  const expected = {
    clientId: params.clientId,
    conversationId: normalizeNullableId(params.conversationId),
    cycleId: params.cycle.cycleId,
    protocol: params.cycle.protocol,
    closedAt: new Date(params.cycle.closedAt),
    assignedUserId: normalizeNullableId(params.attribution.assignedUserId),
    departmentId: normalizeNullableId(params.attribution.departmentId),
    queueId: normalizeNullableId(params.attribution.queueId),
    closedByUserId: normalizeNullableId(params.attribution.closedByUserId),
    closeReason: normalizeNullableId(params.cycle.closeReason),
    closeSource: normalizeNullableId(params.cycle.closeSource),
  };
  try {
    await params.prisma.completedServiceSnapshot.create({ data: expected });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
    const existing = await params.prisma.completedServiceSnapshot.findUnique({
      where: {
        clientId_cycleId: {
          clientId: params.clientId,
          cycleId: params.cycle.cycleId,
        },
      },
      select: {
        conversationId: true,
        protocol: true,
        closedAt: true,
        assignedUserId: true,
        departmentId: true,
        queueId: true,
        closedByUserId: true,
        closeReason: true,
        closeSource: true,
      },
    });
    if (!existing) throw error;
    assertCompletedSnapshotMatches(existing, expected);
  }
}
