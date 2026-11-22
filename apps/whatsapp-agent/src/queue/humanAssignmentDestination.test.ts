import assert from "node:assert/strict";
import test from "node:test";
import { OperationalQueueUnavailableError } from "../departments/operationalQueue.js";
import { resolveHumanAssignmentDestination } from "./humanAssignmentDestination.js";

type Department = {
  id: string; clientId: string; name: string; slug: string; isActive: boolean;
  operationalQueue: { id: string; name: string; clientId: string; departmentId: string } | null;
};

function prismaFixture(departments: Department[]) {
  return { department: { async findFirst(args: { where: Record<string, unknown> }) {
    const where = args.where as { id?: string; clientId?: string; isActive?: boolean; OR?: Array<{ slug?: string; name?: string }> };
    return departments.find((item) =>
      (!where.id || item.id === where.id) && (!where.clientId || item.clientId === where.clientId) &&
      (where.isActive === undefined || item.isActive === where.isActive) &&
      (!where.OR || where.OR.some((candidate) => candidate.slug === item.slug || candidate.name === item.name))
    ) ?? null;
  } } } as never;
}

const tendenciaDefault: Department = {
  id: "dept-tendencia-geral", clientId: "tendencia-modas", name: "Atendimento Geral",
  slug: "atendimento-geral", isActive: true,
  operationalQueue: { id: "queue-tendencia-geral", name: "Atendimento interno",
    clientId: "tendencia-modas", departmentId: "dept-tendencia-geral" },
};

test("Tendencia BOT without destination resolves the tenant default operational queue", async () => {
  assert.deepEqual(await resolveHumanAssignmentDestination(prismaFixture([tendenciaDefault]), {
    clientId: "tendencia-modas", departmentId: null, queueId: null,
  }), { departmentId: "dept-tendencia-geral", queueId: "queue-tendencia-geral", source: "tenant_default" });
});

test("CRA-PR menu flow without explicit handoff uses only its own tenant default", async () => {
  const cra: Department = { ...tendenciaDefault, id: "dept-cra-geral", clientId: "cra-pr",
    operationalQueue: { ...tendenciaDefault.operationalQueue!, id: "queue-cra-geral",
      clientId: "cra-pr", departmentId: "dept-cra-geral" } };
  const result = await resolveHumanAssignmentDestination(prismaFixture([tendenciaDefault, cra]), { clientId: "cra-pr" });
  assert.equal(result.departmentId, "dept-cra-geral"); assert.equal(result.queueId, "queue-cra-geral");
});

test("Demo explicit handoff preserves the authenticated operational destination", async () => {
  const demo: Department = { ...tendenciaDefault, id: "dept-demo-explicit", clientId: "demo-converta",
    name: "Comercial", slug: "comercial", operationalQueue: { ...tendenciaDefault.operationalQueue!,
      id: "queue-demo-explicit", clientId: "demo-converta", departmentId: "dept-demo-explicit" } };
  assert.deepEqual(await resolveHumanAssignmentDestination(prismaFixture([demo]), {
    clientId: "demo-converta", departmentId: demo.id, queueId: demo.operationalQueue!.id,
  }), { departmentId: demo.id, queueId: demo.operationalQueue!.id, source: "conversation" });
});

for (const [name, departments, input] of [
  ["missing default", [], { clientId: "tendencia-modas" }],
  ["inactive default", [{ ...tendenciaDefault, isActive: false }], { clientId: "tendencia-modas" }],
  ["missing operational queue", [{ ...tendenciaDefault, operationalQueue: null }], { clientId: "tendencia-modas" }],
  ["queue from another department", [tendenciaDefault], { clientId: "tendencia-modas",
    departmentId: tendenciaDefault.id, queueId: "queue-other-department" }],
] as const) {
  test(`assignment denies ${name} before persistence`, async () => {
    await assert.rejects(resolveHumanAssignmentDestination(prismaFixture([...departments]), input), OperationalQueueUnavailableError);
  });
}

test("same identifier in another tenant is never accepted", async () => {
  await assert.rejects(resolveHumanAssignmentDestination(prismaFixture([tendenciaDefault]), {
    clientId: "cra-pr", departmentId: tendenciaDefault.id, queueId: tendenciaDefault.operationalQueue!.id,
  }), OperationalQueueUnavailableError);
});
