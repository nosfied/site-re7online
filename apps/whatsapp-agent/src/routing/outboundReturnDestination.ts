import type { Prisma, PrismaClient } from "@prisma/client";
import { validateChatbotFlowDefinition } from "../chatbot/chatbotFlow.js";
import { getUserDepartmentMemberships } from "../users/departmentMemberships.js";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export type OutboundReturnDestination =
  | {
      type: "human_department";
      departmentId: string;
      departmentName?: string | null;
      queueId: string;
      queueName?: string | null;
    }
  | {
      type: "automated_flow";
      flowId: string;
      flowName?: string | null;
    };

export type OutboundReturnDestinationInput =
  | {
      type?: unknown;
      departmentId?: unknown;
      queueId?: unknown;
      flowId?: unknown;
    }
  | null
  | undefined;

export type OutboundReturnDestinationError =
  | "return_destination_required"
  | "return_destination_invalid"
  | "department_not_found"
  | "department_inactive"
  | "queue_not_found"
  | "queue_required"
  | "queue_missing"
  | "flow_not_found"
  | "flow_inactive"
  | "flow_invalid_definition"
  | "primary_department_missing";

export type OutboundReturnDestinationResult =
  | { ok: true; destination: OutboundReturnDestination }
  | { ok: false; error: OutboundReturnDestinationError; status: number };

function normalizeId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseOutboundReturnDestination(value: unknown): OutboundReturnDestination | null {
  const record = getRecord(value);
  if (!record) return null;
  if (record.type === "human_department") {
    const departmentId = normalizeId(record.departmentId);
    const queueId = normalizeId(record.queueId);
    if (!departmentId || !queueId) return null;
    return {
      type: "human_department",
      departmentId,
      departmentName: normalizeId(record.departmentName),
      queueId,
      queueName: normalizeId(record.queueName),
    };
  }
  if (record.type === "automated_flow") {
    const flowId = normalizeId(record.flowId);
    if (!flowId) return null;
    return {
      type: "automated_flow",
      flowId,
      flowName: normalizeId(record.flowName),
    };
  }
  return null;
}

export function serializeOutboundReturnDestination(destination: OutboundReturnDestination | null) {
  if (!destination) return null;
  if (destination.type === "human_department") {
    return {
      type: destination.type,
      departmentId: destination.departmentId,
      departmentName: destination.departmentName ?? null,
      queueId: destination.queueId,
      queueName: destination.queueName ?? null,
    };
  }
  return {
    type: destination.type,
    flowId: destination.flowId,
    flowName: destination.flowName ?? null,
  };
}

export async function resolveHumanDepartmentReturnDestination(
  prisma: PrismaLike,
  params: {
    clientId: string;
    departmentId: string;
    queueId?: string | null;
  }
): Promise<OutboundReturnDestinationResult> {
  const department = await prisma.department.findFirst({
    where: { id: params.departmentId, clientId: params.clientId },
    select: {
      id: true,
      name: true,
      isActive: true,
      operationalQueue: {
        select: { id: true, name: true },
      },
      queues: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, name: true },
      },
    },
  });
  if (!department) return { ok: false, error: "department_not_found", status: 404 };
  if (!department.isActive) return { ok: false, error: "department_inactive", status: 400 };
  if (params.queueId) {
    const queue = department.queues.find((item) => item.id === params.queueId);
    if (!queue) return { ok: false, error: "queue_not_found", status: 404 };
    return {
      ok: true,
      destination: {
        type: "human_department",
        departmentId: department.id,
        departmentName: department.name,
        queueId: queue.id,
        queueName: queue.name,
      },
    };
  }
  const queue = department.operationalQueue;
  if (!queue) return { ok: false, error: "queue_missing", status: 409 };
  return {
    ok: true,
    destination: {
      type: "human_department",
      departmentId: department.id,
      departmentName: department.name,
      queueId: queue.id,
      queueName: queue.name,
    },
  };
}

export async function resolveAutomatedFlowReturnDestination(
  prisma: PrismaLike,
  params: {
    clientId: string;
    flowId: string;
  }
): Promise<OutboundReturnDestinationResult> {
  const flow = await prisma.chatbotFlow.findFirst({
    where: { id: params.flowId, clientId: params.clientId },
    select: { id: true, name: true, isActive: true, entryPoint: true, definition: true },
  });
  if (!flow) return { ok: false, error: "flow_not_found", status: 404 };
  if (!flow.isActive) return { ok: false, error: "flow_inactive", status: 400 };
  const validated = validateChatbotFlowDefinition(flow.definition);
  if (!validated.ok) return { ok: false, error: "flow_invalid_definition", status: 400 };
  return {
    ok: true,
    destination: {
      type: "automated_flow",
      flowId: flow.id,
      flowName: flow.name,
    },
  };
}

export async function resolveOutboundReturnDestinationInput(
  prisma: PrismaLike,
  params: {
    clientId: string;
    input: OutboundReturnDestinationInput;
  }
): Promise<OutboundReturnDestinationResult> {
  const type = params.input?.type;
  if (type === "human_department") {
    const departmentId = normalizeId(params.input?.departmentId);
    if (!departmentId) return { ok: false, error: "department_not_found", status: 400 };
    return resolveHumanDepartmentReturnDestination(prisma, {
      clientId: params.clientId,
      departmentId,
      queueId: normalizeId(params.input?.queueId),
    });
  }
  if (type === "automated_flow") {
    const flowId = normalizeId(params.input?.flowId);
    if (!flowId) return { ok: false, error: "flow_not_found", status: 400 };
    return resolveAutomatedFlowReturnDestination(prisma, {
      clientId: params.clientId,
      flowId,
    });
  }
  return { ok: false, error: "return_destination_required", status: 400 };
}

export async function revalidateOutboundReturnDestination(
  prisma: PrismaLike,
  params: {
    clientId: string;
    destination: OutboundReturnDestination | null;
  }
): Promise<OutboundReturnDestinationResult> {
  if (!params.destination) {
    return { ok: false, error: "return_destination_required", status: 400 };
  }
  if (params.destination.type === "human_department") {
    return resolveHumanDepartmentReturnDestination(prisma, {
      clientId: params.clientId,
      departmentId: params.destination.departmentId,
      queueId: params.destination.queueId,
    });
  }
  return resolveAutomatedFlowReturnDestination(prisma, {
    clientId: params.clientId,
    flowId: params.destination.flowId,
  });
}

export async function resolveUserPrimaryDepartmentReturnDestination(
  prisma: PrismaLike,
  params: {
    clientId: string;
    userId: string;
  }
): Promise<OutboundReturnDestinationResult> {
  const memberships = await getUserDepartmentMemberships(prisma, {
    clientId: params.clientId,
    userId: params.userId,
  });
  const primary = memberships.find(
    (membership) =>
      membership.isPrimary &&
      membership.isActive &&
      membership.departmentIsActive !== false
  );
  if (!primary) return { ok: false, error: "primary_department_missing", status: 409 };
  return resolveHumanDepartmentReturnDestination(prisma, {
    clientId: params.clientId,
    departmentId: primary.departmentId,
  });
}

export async function listOutboundReturnDestinationOptions(
  prisma: PrismaLike,
  params: {
    clientId: string;
    allowedDepartmentIds?: string[] | null;
  }
) {
  const departmentIdFilter =
    params.allowedDepartmentIds && params.allowedDepartmentIds.length > 0
      ? { id: { in: params.allowedDepartmentIds } }
      : {};
  const [departments, flows] = await Promise.all([
    prisma.department.findMany({
      where: {
        clientId: params.clientId,
        isActive: true,
        ...departmentIdFilter,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        operationalQueueId: true,
      },
    }),
    prisma.chatbotFlow.findMany({
      where: { clientId: params.clientId, isActive: true },
      orderBy: [{ entryPoint: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, name: true, entryPoint: true },
    }),
  ]);
  return {
    departments: departments.map((department) => ({
      id: department.id,
      name: department.name,
      operationalReady: Boolean(department.operationalQueueId),
    })),
    flows,
  };
}

export function getOutboundReturnDestinationErrorMessage(error: OutboundReturnDestinationError) {
  switch (error) {
    case "department_not_found":
      return "Selecione um setor válido para receber as respostas.";
    case "department_inactive":
      return "O setor selecionado está inativo.";
    case "queue_not_found":
    case "queue_required":
    case "queue_missing":
      return "Este setor ainda não está disponível para receber atendimentos.";
    case "flow_not_found":
      return "Selecione um fluxo automatizado válido para receber as respostas.";
    case "flow_inactive":
      return "O fluxo automatizado selecionado está inativo.";
    case "flow_invalid_definition":
      return "O fluxo automatizado selecionado possui definição inválida.";
    case "primary_department_missing":
      return "Seu usuário não possui um setor principal válido. Defina um setor principal antes de iniciar a conversa.";
    case "return_destination_invalid":
    case "return_destination_required":
    default:
      return "Defina o destino das respostas antes de continuar.";
  }
}
