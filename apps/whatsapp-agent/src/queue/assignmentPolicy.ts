import { ConversationOperationalStatus, Prisma, type PrismaClient } from "@prisma/client";
import {
  getEligibleUsersForDepartmentAssignment,
  getUserDepartmentMemberships,
} from "../users/departmentMemberships.js";

export type QueueAssignmentMode = "manual" | "round_robin" | "least_active";
export type QueueAssignmentScope = "tenant" | "department";

export type QueueAssignmentPolicy = {
  enabled: boolean;
  mode: QueueAssignmentMode;
  scope: QueueAssignmentScope;
  maxActivePerAgent: number | null;
  includeSupervisors: boolean;
  requireOnline: boolean;
  notifyAssignedOnly: boolean;
  lastAssignedUserIdByScope: Record<string, string>;
};

export type PublicQueueAssignmentPolicy = Omit<QueueAssignmentPolicy, "lastAssignedUserIdByScope">;

export type QueueAssignmentPolicyValidationResult =
  | { ok: true; policy: PublicQueueAssignmentPolicy }
  | { ok: false; status: number; code: string; message: string };

export type BalancedQueueAssignmentResult =
  | { applied: false; reason: "manual" | "already_assigned" | "status_not_waiting" | "no_policy" | "no_eligible_agent" }
  | {
      applied: true;
      mode: "round_robin" | "least_active";
      selectedUserId: string;
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
  notifyAssignedOnly: false,
  lastAssignedUserIdByScope: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeMode(value: unknown): QueueAssignmentMode {
  return value === "round_robin" || value === "least_active" || value === "manual" ? value : "manual";
}

function normalizeScope(value: unknown): QueueAssignmentScope {
  return value === "tenant" || value === "department" ? value : "department";
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
  return {
    enabled: value.enabled === true,
    mode: normalizeMode(value.mode),
    scope: normalizeScope(value.scope),
    maxActivePerAgent: maxActive,
    includeSupervisors: value.includeSupervisors !== false,
    requireOnline: value.requireOnline === true,
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
      requireOnline: input.requireOnline === true,
      notifyAssignedOnly: input.notifyAssignedOnly === true,
    },
  };
}

export function getQueueAssignmentPolicyWarnings(policy: PublicQueueAssignmentPolicy): string[] {
  const warnings: string[] = [];
  if (policy.enabled && policy.requireOnline) {
    warnings.push("Presenca online ainda nao e medida automaticamente. Com essa opcao ativa, a atribuicao automatica nao seleciona atendentes.");
  }
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
  prisma: PrismaClient;
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
  prisma: PrismaClient;
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
  prisma: PrismaClient;
  clientId: string;
}): Promise<{ policy: QueueAssignmentPolicy; config: Record<string, unknown> | null }> {
  const prisma = params.prisma as PrismaClient & {
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

  if (params.departmentId) {
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

  if (policy.requireOnline) {
    return {
      ok: false,
      status: 409,
      code: "online_presence_unavailable",
      message: "A politica exige presenca online, mas esse controle ainda nao esta disponivel.",
      policy,
      capacityLimit: policy.maxActivePerAgent,
    };
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

export async function saveQueueAssignmentPolicy(params: {
  prisma: PrismaClient;
  clientId: string;
  actorUserId: string;
  requestId: string;
  policy: PublicQueueAssignmentPolicy;
}): Promise<{ policy: QueueAssignmentPolicy; config: Record<string, unknown> }> {
  const current = await resolveQueueAssignmentPolicy({
    prisma: params.prisma,
    clientId: params.clientId,
  });
  const previousConfig = current.config ?? {};
  const nextPolicy: QueueAssignmentPolicy = {
    ...params.policy,
    lastAssignedUserIdByScope: current.policy.lastAssignedUserIdByScope,
  };
  const config = {
    ...previousConfig,
    queueAssignmentPolicy: nextPolicy,
  } satisfies Prisma.InputJsonObject;

  await params.prisma.tenantOperationalConfig.upsert({
    where: { clientId: params.clientId },
    create: { clientId: params.clientId, config },
    update: { config },
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
  if (params.assignedUserId) return { applied: false, reason: "already_assigned" };
  if (params.status !== ConversationOperationalStatus.WAITING && params.status !== "WAITING") {
    return { applied: false, reason: "status_not_waiting" };
  }

  const { policy, config } = await resolveQueueAssignmentPolicy({
    prisma: params.prisma,
    clientId: params.clientId,
  });
  if (!config) return { applied: false, reason: "no_policy" };
  if (!policy.enabled || policy.mode === "manual") return { applied: false, reason: "manual" };
  if (policy.scope === "department" && !params.departmentId) {
    await recordQueueAssignmentEvent({
      prisma: params.prisma,
      clientId: params.clientId,
      conversationId: params.conversationId,
      requestId: `${params.requestId ?? "queue-assignment"}:no-department:${params.runtimeStateId}`,
      eventName: "queue.assignment.no_eligible_agent",
      payload: {
        mode: policy.mode,
        scope: policy.scope,
        departmentId: null,
        eligibleCount: 0,
        reason: "department_required",
        source: params.source,
      },
    });
    return { applied: false, reason: "no_eligible_agent" };
  }
  if (policy.requireOnline) {
    await recordQueueAssignmentEvent({
      prisma: params.prisma,
      clientId: params.clientId,
      conversationId: params.conversationId,
      requestId: `${params.requestId ?? "queue-assignment"}:no-eligible:${params.runtimeStateId}`,
      eventName: "queue.assignment.no_eligible_agent",
      payload: {
        mode: policy.mode,
        scope: policy.scope,
        departmentId: sanitizeDepartmentId(params.departmentId),
        eligibleCount: 0,
        reason: "online_presence_unavailable",
        source: params.source,
      },
    });
    return { applied: false, reason: "no_eligible_agent" };
  }

  const users =
    policy.scope === "department"
      ? await getEligibleUsersForDepartmentAssignment(params.prisma, {
          clientId: params.clientId,
          departmentId: params.departmentId as string,
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
    departmentId: params.departmentId,
    scope: policy.scope,
  });

  const eligible = users.filter((user) => {
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
        mode: policy.mode,
        scope: policy.scope,
        departmentId: sanitizeDepartmentId(params.departmentId),
        eligibleCount: 0,
        reason: users.length === 0 ? "no_active_agents" : "max_active_reached",
        source: params.source,
      },
    });
    return { applied: false, reason: "no_eligible_agent" };
  }

  const selected =
    policy.mode === "least_active"
      ? [...eligible].sort((a, b) => {
          const loadDiff = (activeByUser.get(a.id) ?? 0) - (activeByUser.get(b.id) ?? 0);
          if (loadDiff !== 0) return loadDiff;
          return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
        })[0]
      : selectRoundRobinUser(eligible, policy.lastAssignedUserIdByScope[getScopeKey(policy, params.departmentId)]);

  const assignedAt = new Date();
  await params.prisma.conversationRuntimeState.update({
    where: { id: params.runtimeStateId },
    data: {
      assignedUserId: selected.id,
      assignedTo: `user:${selected.id}`,
      assignedAt,
      departmentId: params.departmentId ?? undefined,
      queueId: params.queueId ?? undefined,
    },
  });
  await params.prisma.conversationAssignment.create({
    data: {
      conversationId: params.runtimeStateId,
      fromUserId: null,
      toUserId: selected.id,
      assignedAt,
    },
  });

  if (policy.mode === "round_robin") {
    const scopeKey = getScopeKey(policy, params.departmentId);
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
    eventName: getEventName(policy.mode),
    payload: {
      mode: policy.mode,
      scope: policy.scope,
      departmentId: sanitizeDepartmentId(params.departmentId),
      selectedUserId: selected.id,
      eligibleCount: eligible.length,
      activeCount: activeByUser.get(selected.id) ?? 0,
      source: params.source,
    },
  });

  return {
    applied: true,
    mode: policy.mode,
    selectedUserId: selected.id,
    eligibleCount: eligible.length,
    activeCount: activeByUser.get(selected.id) ?? 0,
  };
}

function selectRoundRobinUser<T extends { id: string }>(eligible: T[], lastAssignedUserId?: string | null) {
  if (!lastAssignedUserId) return eligible[0];
  const index = eligible.findIndex((user) => user.id === lastAssignedUserId);
  if (index < 0) return eligible[0];
  return eligible[(index + 1) % eligible.length];
}
