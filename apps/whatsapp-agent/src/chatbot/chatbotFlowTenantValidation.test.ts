import assert from "node:assert/strict";
import test from "node:test";
import { validateChatbotFlowDefinition } from "./chatbotFlow.js";
import { validateChatbotFlowTenantReferences } from "./chatbotFlowTenantValidation.js";

function makePrismaMock() {
  const departments = [
    { id: "department_a", clientId: "tenant_a" },
    { id: "department_b", clientId: "tenant_b" },
  ];
  const queues = [
    { id: "queue_a", clientId: "tenant_a", departmentId: "department_a" },
    { id: "queue_a_other_department", clientId: "tenant_a", departmentId: "department_a_other" },
    { id: "queue_b", clientId: "tenant_b", departmentId: "department_b" },
  ];
  return {
    department: {
      findMany: async ({ where }: { where: { clientId: string; id: { in: string[] } } }) =>
        departments
          .filter((department) => department.clientId === where.clientId && where.id.in.includes(department.id))
          .map(({ id }) => ({ id })),
    },
    queue: {
      findMany: async ({ where }: { where: { clientId: string; id: { in: string[] } } }) =>
        queues
          .filter((queue) => queue.clientId === where.clientId && where.id.in.includes(queue.id))
          .map(({ id, departmentId }) => ({ id, departmentId })),
    },
  };
}

function validate(definition: unknown) {
  const validated = validateChatbotFlowDefinition(definition);
  if (!validated.ok) throw new Error("Invalid test flow definition");
  return validated.definition;
}

test("validateChatbotFlowTenantReferences accepts department and queue from acting tenant", async () => {
  const result = await validateChatbotFlowTenantReferences(makePrismaMock(), {
    clientId: "tenant_a",
    definition: validate({
      start: "menu",
      nodes: {
        menu: {
          type: "menu",
          text: "Escolha",
          options: [{ label: "Atendimento", next: "handoff", departmentId: "department_a", queueId: "queue_a" }],
        },
        handoff: { type: "handoff", text: "Encaminhando", departmentId: "department_a", queueId: "queue_a" },
      },
    }),
  });

  assert.equal(result.ok, true);
});

test("validateChatbotFlowTenantReferences rejects cross-tenant department and queue", async () => {
  const departmentResult = await validateChatbotFlowTenantReferences(makePrismaMock(), {
    clientId: "tenant_a",
    definition: validate({
      start: "handoff",
      nodes: {
        handoff: { type: "handoff", departmentId: "department_b" },
      },
    }),
  });
  assert.equal(departmentResult.ok, false);
  if (!departmentResult.ok) assert.equal(departmentResult.code, "invalid_chatbot_reference");

  const queueResult = await validateChatbotFlowTenantReferences(makePrismaMock(), {
    clientId: "tenant_a",
    definition: validate({
      start: "handoff",
      nodes: {
        handoff: { type: "handoff", queueId: "queue_b" },
      },
    }),
  });
  assert.equal(queueResult.ok, false);
  if (!queueResult.ok) assert.equal(queueResult.code, "invalid_chatbot_reference");
});

test("validateChatbotFlowTenantReferences rejects queue outside selected department", async () => {
  const result = await validateChatbotFlowTenantReferences(makePrismaMock(), {
    clientId: "tenant_a",
    definition: validate({
      start: "handoff",
      nodes: {
        handoff: { type: "handoff", departmentId: "department_a", queueId: "queue_a_other_department" },
      },
    }),
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /fila/);
});
