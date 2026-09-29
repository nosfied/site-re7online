import { withLockedTenantOperationalConfig } from "../config/tenantOperationalConfigStore.js";
import crypto from "node:crypto";
import { ConversationOperationalStatus, Prisma, type PrismaClient } from "@prisma/client";
import {
  getEligibleUsersForDepartmentAssignment,
  getUserDepartmentMemberships,
} from "../users/departmentMemberships.js";
import { getPresenceEligibleUserIds, type AssignmentPresenceMode } from "./agentAvailability.js";

export type QueueAssignmentMode = "manual" | "round_robin" | "least_active";
export type QueueAssignmentScope = "tenant" | "department";
export type QueueAssignmentPresenceMode = AssignmentPresenceMode;
export type QueueAssignmentPresenceModeSource =
  | "explicit"
  | "legacy_require_online_true"
  | "legacy_require_online_false"
  | "default";

export type QueueAssignmentPolicy = {
  enabled: boolean;
  mode: QueueAssignmentMode;
  scope: QueueAssignmentScope;
  maxActivePerAgent: number | null;
  includeSupervisors: boolean;
  requireOnline: boolean;
  presenceMode: QueueAssignmentPresenceMode;
  presenceModeSource: QueueAssignmentPresenceModeSource;
  notifyAssignedOnly: boolean;
  lastAssignedUserIdByScope: Record<string, string>;
};

export type PublicQueueAssignmentPolicy = Omit<QueueAssignmentPolicy, "lastAssignedUserIdByScope">;
export type QueueAssignmentPolicyInput = Omit<PublicQueueAssignmentPolicy, "presenceModeSource"> & {
  presenceModeSource?: QueueAssignmentPresenceModeSource;
};

export type QueueAssignmentPolicyValidationResult =
  | { ok: true; policy: QueueAssignmentPolicyInput }
  | { ok: false; status: number; code: string; message: string };

export type BalancedQueueAssignmentResult =
  | { applied: false; reason: "manual" | "already_assigned" | "status_not_waiting" | "no_policy" | "no_eligible_agent" | "automation_active" | "runtime_changed" }
  | {
      applied: true;
      mode: "round_robin" | "least_active";
      selectedUserId: string;
      assignedAt: Date;
      eligibleCount: number;
      activeCount: number;
    };

export type QueueAssignmentEligibilityResult =
  | {
      ok: true;
      user: {
        id: string;
        name: string | null;
        role: string;
      };
      policy: QueueAssignmentPolicy;
      activeCount: number;
      capacityLimit: number | null;
    }
  | {
      ok: false;
      status: 409 | 404;
      code:
        | "user_not_found"
        | "conversation_department_required"
        | "department_membership_required"
        | "online_presence_unavailable"
        | "max_active_reached";
      message: string;
      policy: QueueAssignmentPolicy;
      activeCount?: number;
      capacityLimit?: number | null;
    };

const DEFAULT_QUEUE_ASSIGNMENT_POLICY: QueueAssignmentPolicy = {
  enabled: false,
  mode: "manual",
  scope: "department",
  maxActivePerAgent: null,
  includeSupervisors: true,
  requireOnline: false,
  presenceMode: "IGNORE",
  presenceModeSource: "default",
  notifyAssignedOnly: false,
  lastAssignedUserIdByScope: {},
};

type PrismaLike = PrismaClient | Prisma.TransactionClient;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeMode(value: unknown): QueueAssignmentMode {
  return value === "round_robin" || value === "least_active" || value === "manual" ? value : "manual";
}

function normalizeScope(value: unknown): QueueAssignmentScope {
  return value === "tenant" || value === "department" ? value : "department";
}

function normalizePresenceMode(value: unknown): QueueAssignmentPresenceMode | null {
  return value === "FRESH" || value === "AVAILABLE" || value === "IGNORE" ? value : null;
}

function resolvePresenceMode(value: Record<string, unknown>): {
  presenceMode: QueueAssignmentPresenceMode;
  presenceModeSource: QueueAssignmentPresenceModeSource;
} {
  const explicit = normalizePresenceMode(value.presenceMode);
  if (explicit) return { presenceMode: explicit, presenceModeSource: "explicit" };
  if (value.requireOnline === true) return { presenceMode: "FRESH", presenceModeSource: "legacy_require_online_true" };
  if (value.requireOnline === false) return { presenceMode: "IGNORE", presenceModeSource: "legacy_require_online_false" };
  return {
    presenceMode: DEFAULT_QUEUE_ASSIGNMENT_POLICY.presenceMode,
    presenceModeSource: DEFAULT_QUEUE_ASSIGNMENT_POLICY.presenceModeSource,
  };
}

function normalizePolicy(value: unknown): QueueAssignmentPolicy {
  if (!isRecord(value)) return DEFAULT_QUEUE_ASSIGNMENT_POLICY;
  const rawLast = isRecord(value.lastAssignedUserIdByScope) ? value.lastAssignedUserIdByScope : {};
  const lastAssignedUserIdByScope = Object.fromEntries(
    Object.entries(rawLast)
      .map(([key, userId]) => [key.trim(), typeof userId === "string" ? userId.trim() : ""])
      .filter(([key, userId]) => key && userId)
  );
  const rawMaxActive =
    typeof value.maxActivePerAgent === "number" && Number.isFinite(value.maxActivePerAgent)
      ? Math.floor(value.maxActivePerAgent)
      : null;
  const maxActive = rawMaxActive && rawMaxActive > 0 ? rawMaxActive : null;
  const presence = resolvePresenceMode(value);
  return {
    enabled: value.enabled === true,
    mode: normalizeMode(value.mode),
    scope: normalizeScope(value.scope),
    maxActivePerAgent: maxActive,
    includeSupervisors: value.includeSupervisors !== false,
    requireOnline: value.requireOnline === true,
    presenceMode: presence.presenceMode,
    presenceModeSource: presence.presenceModeSource,
    notifyAssignedOnly: value.notifyAssignedOnly === true,
    lastAssignedUserIdByScope,
  };
}

export function getDefaultQueueAssignmentPolicy() {
  return { ...DEFAULT_QUEUE_ASSIGNMENT_POLICY, lastAssignedUserIdByScope: {} };
}

export function toPublicQueueAssignmentPolicy(policy: QueueAssignmentPolicy): PublicQueueAssignmentPolicy {
  const effectiveMode = policy.enabled ? policy.mode : "manual";
  return {
    enabled: policy.enabled,
    mode: effectiveMode,
    scope: policy.scope,
    maxActivePerAgent: policy.maxActivePerAgent,
    includeSupervisors: policy.includeSupervisors,
    requireOnline: policy.requireOnline,
    presenceMode: policy.presenceMode,
    presenceModeSource: policy.presenceModeSource,
    notifyAssignedOnly: policy.notifyAssignedOnly,
  };
}

export function parseQueueAssignmentPolicyInput(input: unknown): QueueAssignmentPolicyValidationResult {
  if (!isRecord(input)) {
    return { ok: false, status: 400, code: "bad_request", message: "Queue assignment policy is required." };
  }

  const enabled = input.enabled === true;
  const mode = normalizeMode(input.mode);
  if (enabled && mode === "manual") {
    return {
      ok: false,
      status: 400,
      code: "invalid_assignment_mode",
      message: "Select round_robin or least_active when automatic assignment is enabled.",
    };
  }
  if (input.mode !== undefined && normalizeMode(input.mode) !== input.mode) {
    return {
      ok: false,
      status: 400,
      code: "invalid_assignment_mode",
      message: "Invalid queue assignment mode.",
    };
  }
  if (input.scope !== undefined && normalizeScope(input.scope) !== input.scope) {
    return {
      ok: false,
      status: 400,
      code: "invalid_assignment_scope",
      message: "Invalid queue assignment scope.",
    };
  }
  if (input.presenceMode !== undefined && normalizePresenceMode(input.presenceMode) === null) {
    return {
      ok: false,
      status: 400,
      code: "invalid_presence_mode",
      message: "Invalid presence mode.",
    };
  }
  const parsedPresenceMode = normalizePresenceMode(input.presenceMode);
  const requireOnline = parsedPresenceMode ? parsedPresenceMode === "FRESH" : input.requireOnline === true;

  let maxActivePerAgent: number | null = null;
  if (input.maxActivePerAgent !== undefined && input.maxActivePerAgent !== null && input.maxActivePerAgent !== "") {
    if (
      typeof input.maxActivePerAgent !== "number" ||
      !Number.isInteger(input.maxActivePerAgent) ||
      input.maxActivePerAgent < 1
    ) {
      return {
        ok: false,
        status: 400,
        code: "invalid_max_active",
        message: "maxActivePerAgent must be a positive integer or null.",
      };
    }
    maxActivePerAgent = input.maxActivePerAgent;
  }

  return {
    ok: true,
    policy: {
      enabled,
      mode: enabled ? mode : "manual",
      scope: normalizeScope(input.scope),
      maxActivePerAgent,
      includeSupervisors: input.includeSupervisors !== false,
      requireOnline,
      presenceMode: parsedPresenceMode ?? (input.requireOnline === true ? "FRESH" : "IGNORE"),
      presenceModeSource: parsedPresenceMode
        ? "explicit"
        : input.requireOnline === true
          ? "legacy_require_online_true"
          : "legacy_require_online_false",
      notifyAssignedOnly: input.notifyAssignedOnly === true,
    },
  };
}

export function getQueueAssignmentPolicyWarnings(policy: PublicQueueAssignmentPolicy): string[] {
  const warnings: string[] = [];
  return warnings;
}

function getScopeKey(policy: QueueAssignmentPolicy, departmentId?: string | null) {
  if (policy.scope === "department" && departmentId) return `department:${departmentId}`;
  return "tenant";
}

function getEventName(mode: "round_robin" | "least_active") {
  return mode === "round_robin"
    ? "queue.assignment.round_robin_applied"
    : "queue.assignment.least_active_applied";
}

function sanitizeDepartmentId(value?: string | null) {
  return value ?? null;
}

function shouldApplyAssignmentCapacity(
  config: Record<string, unknown> | null,
  policy: QueueAssignmentPolicy
) {
  return Boolean(config && policy.maxActivePerAgent !== null);
}

async function countActiveAssignmentsForUsers(params: {
  prisma: PrismaLike;
  clientId: string;
  userIds: string[];
  departmentId?: string | null;
  scope: QueueAssignmentScope;
}) {
  if (params.userIds.length === 0) return new Map<string, number>();
  const activeRows = await params.prisma.conversationRuntimeState.findMany({
    where: {
      clientId: params.clientId,
      assignedUserId: { in: params.userIds },
      status: { in: [ConversationOperationalStatus.IN_PROGRESS, ConversationOperationalStatus.WAITING] },
      ...(params.scope === "department" && params.departmentId ? { departmentId: params.departmentId } : {}),
    },
    select: { assignedUserId: true },
  });
  const activeByUser = new Map<string, number>();
  for (const row of activeRows) {
    if (!row.assignedUserId) continue;
    activeByUser.set(row.assignedUserId, (activeByUser.get(row.assignedUserId) ?? 0) + 1);
  }
  return activeByUser;
}

async function recordQueueAssignmentEvent(params: {
  prisma: PrismaLike;
  clientId: string;
  conversationId?: string | null;
  requestId: string;
  eventName: string;
  payload: Prisma.InputJsonObject;
}) {
  try {
    await params.prisma.event.create({
      data: {
        clientId: params.clientId,
        conversationId: params.conversationId ?? null,
        requestId: params.requestId,
        eventName: params.eventName,
        payloadJson: {
          action: params.eventName,
          ...params.payload,
        },
      },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
      throw error;
    }
  }
}

export async function resolveQueueAssignmentPolicy(params: {
  prisma: PrismaLike;
  clientId: string;
}): Promise<{ policy: QueueAssignmentPolicy; config: Record<string, unknown> | null }> {
  const prisma = params.prisma as PrismaLike & {
    tenantOperationalConfig?: PrismaClient["tenantOperationalConfig"];
  };
  if (!prisma.tenantOperationalConfig?.findUnique) {
    return {
      policy: getDefaultQueueAssignmentPolicy(),
      config: null,
    };
  }

  const record = await prisma.tenantOperationalConfig.findUnique({
    where: { clientId: params.clientId },
    select: { config: true },
  });
  const config = isRecord(record?.config) ? record.config : null;
  return {
    policy: normalizePolicy(config?.queueAssignmentPolicy),
    config,
  };
}

export async function assertQueueAssignmentUserEligible(params: {
  prisma: PrismaClient;
  clientId: string;
  userId: string;
  departmentId?: string | null;
  requireDepartment?: boolean;
  requireDepartmentMembership?: boolean;
  allowedRoles?: Array<"ADMIN" | "SUPERVISOR" | "AGENT">;
}): Promise<QueueAssignmentEligibilityResult> {
  const { policy, config } = await resolveQueueAssignmentPolicy({
    prisma: params.prisma,
    clientId: params.clientId,
  });
  if (!params.departmentId && params.requireDepartment !== false) {
    return {
      ok: false,
      status: 409,
      code: "conversation_department_required",
      message: "A conversa precisa estar vinculada a um setor para esta acao.",
      policy,
      capacityLimit: policy.maxActivePerAgent,
    };
  }

  const allowedRoles = params.allowedRoles ?? ["ADMIN", "SUPERVISOR", "AGENT"];
  const user = await params.prisma.user.findFirst({
    where: {
      id: params.userId,
      clientId: params.clientId,
      isActive: true,
      role: { in: allowedRoles },
    },
    select: { id: true, name: true, role: true },
  });
  if (!user) {
    return {
      ok: false,
      status: 404,
      code: "user_not_found",
      message: "Usuario de destino nao encontrado ou inativo.",
      policy,
      capacityLimit: policy.maxActivePerAgent,
    };
  }

  if (params.departmentId && params.requireDepartmentMembership !== false) {
    const memberships = await getUserDepartmentMemberships(params.prisma, {
      clientId: params.clientId,
      userId: user.id,
      fallbackToLegacy: true,
    });
    const hasDepartmentMembership = memberships.some(
      (membership) =>
        membership.isActive &&
        membership.departmentIsActive !== false &&
        membership.departmentId === params.departmentId
    );
    if (!hasDepartmentMembership) {
      return {
        ok: false,
        status: 409,
        code: "department_membership_required",
        message: "O usuario de destino nao pertence ao setor atual da conversa.",
        policy,
        capacityLimit: policy.maxActivePerAgent,
      };
    }
  }

  const activeByUser = await countActiveAssignmentsForUsers({
    prisma: params.prisma,
    clientId: params.clientId,
    userIds: [user.id],
    departmentId: params.departmentId,
    scope: policy.scope,
  });
  const activeCount = activeByUser.get(user.id) ?? 0;
  if (
    shouldApplyAssignmentCapacity(config, policy) &&
    policy.maxActivePerAgent !== null &&
    activeCount >= policy.maxActivePerAgent
  ) {
    return {
      ok: false,
      status: 409,
      code: "max_active_reached",
      message: "O usuario de destino atingiu o limite de atendimentos ativos.",
      policy,
      activeCount,
      capacityLimit: policy.maxActivePerAgent,
    };
  }

  return {
    ok: true,
    user,
    policy,
    activeCount,
    capacityLimit: policy.maxActivePerAgent,
  };
}

function queueAssignmentLockKey(params: {
  clientId: string;
  scope: QueueAssignmentScope;
  departmentId?: string | null;
}) {
  const scopeId = params.scope === "department" ? params.departmentId ?? "missing" : "tenant";
  const hash = crypto
    .createHash("sha256")
    .update(`queue-assignment:${params.clientId}:${params.scope}:${scopeId}`, "utf8")
    .digest();
  return hash.readBigInt64BE(0);
}

async function acquireQueueAssignmentTransactionLock(params: {
  prisma: PrismaLike;
  clientId: string;
  policy: QueueAssignmentPolicy;
  departmentId?: string | null;
}) {
  const key = queueAssignmentLockKey({
    clientId: params.clientId,
    scope: params.policy.scope,
    departmentId: params.departmentId,
  });
  await params.prisma.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${key})`);
}

export async function saveQueueAssignmentPolicy(params: {
  prisma: PrismaClient;
  clientId: string;
  actorUserId: string;
  requestId: string;
  policy: QueueAssignmentPolicyInput;
}): Promise<{ policy: QueueAssignmentPolicy; config: Record<string, unknown> }> {
  const { nextPolicy, config } = await withLockedTenantOperationalConfig(params.prisma, params.clientId, async (tx) => {
    const current = await resolveQueueAssignmentPolicy({
      prisma: tx as PrismaClient,
      clientId: params.clientId,
    });
    const previousConfig = current.config ?? {};
    const nextPolicy: QueueAssignmentPolicy = {
      ...params.policy,
      presenceModeSource: params.policy.presenceModeSource ?? "explicit",
      lastAssignedUserIdByScope: current.policy.lastAssignedUserIdByScope,
    };
    const config = {
      ...previousConfig,
      queueAssignmentPolicy: nextPolicy,
    } satisfies Prisma.InputJsonObject;

    await tx.tenantOperationalConfig.upsert({
      where: { clientId: params.clientId },
      create: { clientId: params.clientId, config },
      update: { config },
    });
    return { nextPolicy, config };
  });

  await recordQueueAssignmentEvent({
    prisma: params.prisma,
    clientId: params.clientId,
    requestId: `${params.requestId}:policy-updated`,
    eventName: "queue.assignment.policy_updated",
    payload: {
      actorUserId: params.actorUserId,
      enabled: nextPolicy.enabled,
      mode: nextPolicy.enabled ? nextPolicy.mode : "manual",
      scope: nextPolicy.scope,
      maxActivePerAgent: nextPolicy.maxActivePerAgent,
      includeSupervisors: nextPolicy.includeSupervisors,
      requireOnline: nextPolicy.requireOnline,
      presenceMode: nextPolicy.presenceMode,
      presenceModeSource: nextPolicy.presenceModeSource,
      notifyAssignedOnly: nextPolicy.notifyAssignedOnly,
    },
  });

  return { policy: nextPolicy, config };
}

export async function applyBalancedQueueAssignment(params: {
  prisma: PrismaClient;
  clientId: string;
  conversationId?: string | null;
  runtimeStateId: string;
  waId: string;
  waIdCanonical?: string | null;
  departmentId?: string | null;
  queueId?: string | null;
  status?: ConversationOperationalStatus | string | null;
  assignedUserId?: string | null;
  requestId?: string | null;
  source: string;
}): Promise<BalancedQueueAssignmentResult> {
  const { policy, config } = await resolveQueueAssignmentPolicy({
    prisma: params.prisma,
    clientId: params.clientId,
  });
  if (!config) return { applied: false, reason: "no_policy" };
  if (!policy.enabled || policy.mode === "manual") return { applied: false, reason: "manual" };
  return params.prisma.$transaction((tx) =>
    applyBalancedQueueAssignmentLocked({
      ...params,
      prisma: tx,
      availabilityPrisma: params.prisma,
      policy,
      config,
    })
  );
}

async function applyBalancedQueueAssignmentLocked(params: {
  prisma: Prisma.TransactionClient;
  availabilityPrisma: PrismaClient;
  clientId: string;
  conversationId?: string | null;
  runtimeStateId: string;
  waId: string;
  waIdCanonical?: string | null;
  departmentId?: string | null;
  queueId?: string | null;
  status?: ConversationOperationalStatus | string | null;
  assignedUserId?: string | null;
  requestId?: string | null;
  source: string;
  policy: QueueAssignmentPolicy;
  config: Record<string, unknown>;
}): Promise<BalancedQueueAssignmentResult> {
  await acquireQueueAssignmentTransactionLock({
    prisma: params.prisma,
    clientId: params.clientId,
    policy: params.policy,
    departmentId: params.departmentId,
  });

  // Keep queue advisory -> config row lock order. Re-read policy, cursor,
  // eligibility and load before selecting, while holding the config lock.
  return withLockedTenantOperationalConfig(params.prisma, params.clientId, async () => {
    const latestPolicy = await resolveQueueAssignmentPolicy({
      prisma: params.prisma,
      clientId: params.clientId,
    });
    if (!latestPolicy.config) return { applied: false, reason: "no_policy" };
    if (!latestPolicy.policy.enabled || latestPolicy.policy.mode === "manual") {
      return { applied: false, reason: "manual" };
    }

    const current = await params.prisma.conversationRuntimeState.findUnique({
      where: { id: params.runtimeStateId },
      select: {
        clientId: true,
        mode: true,
        handoffStatus: true,
        updatedAt: true,
        assignedUserId: true,
        status: true,
        departmentId: true,
        queueId: true,
      },
    });
    // WAITING also exists in BOT reentry. It is not by itself a human queue entry.
    // Legacy accepted handoff can still carry BOT; pending confirmation alone
    // remains automation (conversation.service.shouldAutoReply / handleHandoff).
    if (!current || current.clientId !== params.clientId) {
      return { applied: false, reason: "runtime_changed" };
    }
    if (current.mode !== "HUMAN" && current.handoffStatus !== "ACTIVE") {
      return { applied: false, reason: "automation_active" };
    }
    const assignedUserId = current?.assignedUserId ?? params.assignedUserId ?? null;
    const status = current?.status ?? params.status ?? null;
    const departmentId = current?.departmentId ?? params.departmentId ?? null;
    const queueId = current?.queueId ?? params.queueId ?? null;

    if (assignedUserId) return { applied: false, reason: "already_assigned" };
    if (status !== ConversationOperationalStatus.WAITING && status !== "WAITING") {
      return { applied: false, reason: "status_not_waiting" };
    }

    const { policy, config } = latestPolicy;
    const assignmentMode = policy.mode === "round_robin" || policy.mode === "least_active" ? policy.mode : null;
    if (!assignmentMode) return { applied: false, reason: "manual" };
    if (policy.scope === "department" && !departmentId) {
      await recordQueueAssignmentEvent({
        prisma: params.prisma,
        clientId: params.clientId,
        conversationId: params.conversationId,
        requestId: `${params.requestId ?? "queue-assignment"}:no-department:${params.runtimeStateId}`,
        eventName: "queue.assignment.no_eligible_agent",
        payload: {
          mode: assignmentMode,
          scope: policy.scope,
          departmentId: null,
          eligibleCount: 0,
          reason: "department_required",
          source: params.source,
        },
      });
      return { applied: false, reason: "no_eligible_agent" };
    }
    const users =
      departmentId
        ? await getEligibleUsersForDepartmentAssignment(params.prisma, {
            clientId: params.clientId,
            departmentId: departmentId as string,
            includeSupervisors: policy.includeSupervisors,
            fallbackToLegacy: true,
          })
        : await params.prisma.user.findMany({
            where: {
              clientId: params.clientId,
              isActive: true,
              role: policy.includeSupervisors ? { in: ["AGENT", "SUPERVISOR"] } : "AGENT",
            },
            select: { id: true, createdAt: true },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          });

    const activeByUser = await countActiveAssignmentsForUsers({
      prisma: params.prisma,
      clientId: params.clientId,
      userIds: users.map((user) => user.id),
      departmentId,
      scope: policy.scope,
    });

    const presenceEligibleUserIds =
      policy.presenceMode === "IGNORE"
        ? null
        : await getPresenceEligibleUserIds({
            prisma: params.availabilityPrisma,
            clientId: params.clientId,
            userIds: users.map((user) => user.id),
            mode: policy.presenceMode,
          });

    const eligible = users.filter((user) => {
      if (presenceEligibleUserIds && !presenceEligibleUserIds.has(user.id)) return false;
      const activeCount = activeByUser.get(user.id) ?? 0;
      return policy.maxActivePerAgent === null || activeCount < policy.maxActivePerAgent;
    });
    if (eligible.length === 0) {
      await recordQueueAssignmentEvent({
        prisma: params.prisma,
        clientId: params.clientId,
        conversationId: params.conversationId,
        requestId: `${params.requestId ?? "queue-assignment"}:no-eligible:${params.runtimeStateId}`,
        eventName: "queue.assignment.no_eligible_agent",
        payload: {
          mode: assignmentMode,
          scope: policy.scope,
          departmentId: sanitizeDepartmentId(departmentId),
          eligibleCount: 0,
          reason:
            users.length === 0
              ? "no_active_agents"
              : policy.presenceMode !== "IGNORE" && presenceEligibleUserIds?.size === 0
                ? "online_presence_unavailable"
                : "max_active_reached",
          source: params.source,
          requireOnline: policy.requireOnline,
          presenceMode: policy.presenceMode,
          presenceModeSource: policy.presenceModeSource,
        },
      });
      return { applied: false, reason: "no_eligible_agent" };
    }

    const selected =
      assignmentMode === "least_active"
        ? [...eligible].sort((a, b) => {
            const loadDiff = (activeByUser.get(a.id) ?? 0) - (activeByUser.get(b.id) ?? 0);
            if (loadDiff !== 0) return loadDiff;
            return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
          })[0]
        : selectRoundRobinUser(eligible, policy.lastAssignedUserIdByScope[getScopeKey(policy, departmentId)]);

    const assignedAt = new Date();
    const assignment = await params.prisma.conversationRuntimeState.updateMany({
      where: {
        id: params.runtimeStateId,
        clientId: params.clientId,
        updatedAt: current.updatedAt,
        assignedUserId: null,
        status: ConversationOperationalStatus.WAITING,
        OR: [{ mode: "HUMAN" }, { handoffStatus: "ACTIVE" }],
      },
      data: {
        assignedUserId: selected.id,
        assignedTo: `user:${selected.id}`,
        assignedAt,
        departmentId: departmentId ?? undefined,
        queueId: queueId ?? undefined,
        status: ConversationOperationalStatus.IN_PROGRESS,
      },
    });
    // A claim/transfer/close can occur while availability is being resolved.
    // Do not overwrite it or advance the cursor for an assignment not applied.
    if (assignment.count !== 1) return { applied: false, reason: "runtime_changed" };
    await params.prisma.conversationAssignment.create({
      data: {
        conversationId: params.runtimeStateId,
        fromUserId: null,
        toUserId: selected.id,
        assignedAt,
      },
    });

    if (assignmentMode === "round_robin") {
      const scopeKey = getScopeKey(policy, departmentId);
      await params.prisma.tenantOperationalConfig.update({
        where: { clientId: params.clientId },
        data: {
          config: {
            ...config,
            queueAssignmentPolicy: {
              ...policy,
              lastAssignedUserIdByScope: {
                ...policy.lastAssignedUserIdByScope,
                [scopeKey]: selected.id,
              },
            },
          } satisfies Prisma.InputJsonObject,
        },
      });
    }

    await recordQueueAssignmentEvent({
      prisma: params.prisma,
      clientId: params.clientId,
      conversationId: params.conversationId,
      requestId: `${params.requestId ?? "queue-assignment"}:${policy.mode}:${params.runtimeStateId}`,
      eventName: getEventName(assignmentMode),
      payload: {
        mode: assignmentMode,
        scope: policy.scope,
        departmentId: sanitizeDepartmentId(departmentId),
        selectedUserId: selected.id,
        eligibleCount: eligible.length,
        activeCount: activeByUser.get(selected.id) ?? 0,
        source: params.source,
        requireOnline: policy.requireOnline,
        presenceMode: policy.presenceMode,
        presenceModeSource: policy.presenceModeSource,
      },
    });

    return {
      applied: true,
      mode: assignmentMode,
      selectedUserId: selected.id,
      assignedAt,
      eligibleCount: eligible.length,
      activeCount: activeByUser.get(selected.id) ?? 0,
    };
  }, { createIfMissing: false, onMissing: () => ({ applied: false, reason: "no_policy" }) });
}

function selectRoundRobinUser<T extends { id: string }>(eligible: T[], lastAssignedUserId?: string | null) {
  if (!lastAssignedUserId) return eligible[0];
  const index = eligible.findIndex((user) => user.id === lastAssignedUserId);
  if (index < 0) return eligible[0];
  return eligible[(index + 1) % eligible.length];
}
