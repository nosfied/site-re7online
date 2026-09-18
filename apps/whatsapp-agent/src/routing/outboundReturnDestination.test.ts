import assert from "node:assert/strict";
import test from "node:test";
import {
  listOutboundReturnDestinationOptions,
  resolveAutomatedFlowReturnDestination,
  resolveHumanDepartmentReturnDestination,
} from "./outboundReturnDestination.js";

function prismaWithDepartment(department: unknown) {
  return {
    department: {
      findFirst: async () => department,
    },
  } as never;
}

function prismaWithFlow(flow: unknown) {
  return {
    chatbotFlow: {
      findFirst: async () => flow,
    },
  } as never;
}

function prismaWithOptions(flows: unknown[]) {
  return prismaWithOptionsSpy(flows).prisma;
}

function prismaWithOptionsSpy(flows: unknown[]) {
  const calls: Array<{ model: string; args: unknown }> = [];
  const prisma = {
    department: {
      findMany: async (args: unknown) => {
        calls.push({ model: "department", args });
        return [];
      },
    },
    chatbotFlow: {
      findMany: async (args: unknown) => {
        calls.push({ model: "chatbotFlow", args });
        return flows;
      },
    },
  } as never;
  return { prisma, calls };
}

function getWhere(args: unknown) {
  return args && typeof args === "object" && "where" in args
    ? (args as { where?: unknown }).where
    : null;
}

const validFlowDefinition = {
  start: "menu",
  nodes: {
    menu: {
      type: "menu",
      text: "Escolha",
      options: [{ label: "Atendimento", next: "text_1" }],
    },
    text_1: {
      type: "text",
      text: "Tudo certo",
    },
  },
};

test("human return destination resolves the single queue internally", async () => {
  const result = await resolveHumanDepartmentReturnDestination(
    prismaWithDepartment({
      id: "department-1",
      name: "Atendimento",
      isActive: true,
      operationalQueue: { id: "queue-1", name: "Fila Geral" },
      queues: [{ id: "queue-1", name: "Fila Geral" }],
    }),
    { clientId: "client-1", departmentId: "department-1" }
  );

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.destination.type === "human_department" ? result.destination.queueId : null, "queue-1");
});

test("human return destination uses the explicit operational queue when multiple queues exist", async () => {
  const result = await resolveHumanDepartmentReturnDestination(
    prismaWithDepartment({
      id: "department-1",
      name: "Atendimento",
      isActive: true,
      operationalQueue: { id: "queue-2", name: "Fila B" },
      queues: [
        { id: "queue-1", name: "Fila A" },
        { id: "queue-2", name: "Fila B" },
      ],
    }),
    { clientId: "client-1", departmentId: "department-1" }
  );

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.destination.type === "human_department" ? result.destination.queueId : null, "queue-2");
});

test("human return destination blocks departments without queues", async () => {
  const result = await resolveHumanDepartmentReturnDestination(
    prismaWithDepartment({
      id: "department-1",
      name: "Atendimento",
      isActive: true,
      operationalQueue: null,
      queues: [],
    }),
    { clientId: "client-1", departmentId: "department-1" }
  );

  assert.equal(result.ok, false);
  assert.equal(result.ok ? null : result.error, "queue_missing");
});

test("automated return destination accepts active entrypoint flows", async () => {
  const result = await resolveAutomatedFlowReturnDestination(
    prismaWithFlow({
      id: "flow-1",
      name: "Fluxo principal",
      isActive: true,
      entryPoint: true,
      definition: validFlowDefinition,
    }),
    { clientId: "client-1", flowId: "flow-1" }
  );

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.destination.type === "automated_flow" ? result.destination.flowId : null, "flow-1");
});

test("automated return destination accepts active non-entrypoint flows", async () => {
  const result = await resolveAutomatedFlowReturnDestination(
    prismaWithFlow({
      id: "flow-1",
      name: "Fluxo auxiliar",
      isActive: true,
      entryPoint: false,
      definition: validFlowDefinition,
    }),
    { clientId: "client-1", flowId: "flow-1" }
  );

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.destination.type === "automated_flow" ? result.destination.flowId : null, "flow-1");
});

test("automated return destination rejects inactive flows", async () => {
  const result = await resolveAutomatedFlowReturnDestination(
    prismaWithFlow({
      id: "flow-1",
      name: "Fluxo inativo",
      isActive: false,
      entryPoint: false,
      definition: validFlowDefinition,
    }),
    { clientId: "client-1", flowId: "flow-1" }
  );

  assert.equal(result.ok, false);
  assert.equal(result.ok ? null : result.error, "flow_inactive");
});

test("return destination options include all active flows in provided order", async () => {
  const options = await listOutboundReturnDestinationOptions(
    prismaWithOptions([
      { id: "flow-principal", name: "Principal", entryPoint: true },
      { id: "flow-secondary", name: "Campanha", entryPoint: false },
    ]),
    { clientId: "client-1" }
  );

  assert.deepEqual(options.flows, [
    { id: "flow-principal", name: "Principal", entryPoint: true },
    { id: "flow-secondary", name: "Campanha", entryPoint: false },
  ]);
});

test("return destination options scopes active flows by tenant without entrypoint filter", async () => {
  const { prisma, calls } = prismaWithOptionsSpy([]);
  await listOutboundReturnDestinationOptions(prisma, { clientId: "client-1" });

  const flowCall = calls.find((call) => call.model === "chatbotFlow");
  assert.deepEqual(getWhere(flowCall?.args), {
    clientId: "client-1",
    isActive: true,
  });
});
