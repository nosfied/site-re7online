import type { ChatbotFlowDefinition } from "./chatbotFlow.js";

export type ChatbotFlowTenantValidationResult =
  | { ok: true }
  | {
      ok: false;
      code: "invalid_chatbot_reference";
      message: string;
    };

type PrismaLike = {
  department: {
    findMany(args: {
      where: { clientId: string; id: { in: string[] } };
      select: { id: true };
    }): Promise<Array<{ id: string }>>;
  };
  queue: {
    findMany(args: {
      where: { clientId: string; id: { in: string[] } };
      select: { id: true; departmentId: true };
    }): Promise<Array<{ id: string; departmentId: string }>>;
  };
};

type RoutingReference = {
  path: string;
  departmentId: string | null;
  queueId: string | null;
};

function asRoutingId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function collectRoutingReferences(definition: ChatbotFlowDefinition): RoutingReference[] {
  const references: RoutingReference[] = [];
  for (const [nodeId, node] of Object.entries(definition.nodes)) {
    references.push({
      path: `etapa "${nodeId}"`,
      departmentId: asRoutingId(node.departmentId),
      queueId: asRoutingId(node.queueId),
    });
    if (node.type !== "menu") continue;
    node.options.forEach((option, index) => {
      references.push({
        path: `opção ${index + 1} da etapa "${nodeId}"`,
        departmentId: asRoutingId(option.departmentId),
        queueId: asRoutingId(option.queueId),
      });
    });
  }
  return references.filter((item) => item.departmentId || item.queueId);
}

export async function validateChatbotFlowTenantReferences(
  prisma: PrismaLike,
  params: {
    clientId: string;
    definition: ChatbotFlowDefinition;
  }
): Promise<ChatbotFlowTenantValidationResult> {
  const references = collectRoutingReferences(params.definition);
  if (references.length === 0) return { ok: true };

  const departmentIds = Array.from(
    new Set(references.map((item) => item.departmentId).filter((value): value is string => Boolean(value)))
  );
  const queueIds = Array.from(
    new Set(references.map((item) => item.queueId).filter((value): value is string => Boolean(value)))
  );

  const [departments, queues] = await Promise.all([
    departmentIds.length > 0
      ? prisma.department.findMany({
          where: { clientId: params.clientId, id: { in: departmentIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
    queueIds.length > 0
      ? prisma.queue.findMany({
          where: { clientId: params.clientId, id: { in: queueIds } },
          select: { id: true, departmentId: true },
        })
      : Promise.resolve([]),
  ]);

  const departmentIdsForTenant = new Set(departments.map((department) => department.id));
  const queuesForTenant = new Map(queues.map((queue) => [queue.id, queue]));

  for (const reference of references) {
    if (reference.departmentId && !departmentIdsForTenant.has(reference.departmentId)) {
      return {
        ok: false,
        code: "invalid_chatbot_reference",
        message: `${reference.path} usa um setor que não pertence a esta organização.`,
      };
    }
    if (reference.queueId && !queuesForTenant.has(reference.queueId)) {
      return {
        ok: false,
        code: "invalid_chatbot_reference",
        message: `${reference.path} usa uma fila que não pertence a esta organização.`,
      };
    }
    const queue = reference.queueId ? queuesForTenant.get(reference.queueId) : null;
    if (reference.departmentId && queue && queue.departmentId !== reference.departmentId) {
      return {
        ok: false,
        code: "invalid_chatbot_reference",
        message: `${reference.path} usa uma fila que não pertence ao setor selecionado.`,
      };
    }
  }

  return { ok: true };
}
