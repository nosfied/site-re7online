import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../db.js";
import {
  createDepartmentWithOperationalQueue,
  OperationalQueueUnavailableError,
  replaceDepartmentOperationalQueue,
  resolveDepartmentOperationalQueue,
  updateDepartmentWithOperationalQueueLifecycle,
} from "./operationalQueue.js";

const prisma = getPrisma();
const prefix = `operational-queue-${process.pid}-${Date.now()}`;

async function createClient(suffix: string) {
  return prisma.client.create({
    data: { clientKey: `${prefix}-${suffix}`, name: `Queue ${suffix}`, features: {} },
    select: { id: true },
  });
}

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { clientKey: { startsWith: prefix } },
    select: { id: true },
  });
  const clientIds = clients.map((client) => client.id);
  if (clientIds.length === 0) return;
  await prisma.department.updateMany({
    where: { clientId: { in: clientIds } },
    data: { operationalQueueId: null },
  });
  await prisma.queue.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.department.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
}

test.before(cleanup);
test.after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("active department creation atomically creates and links one internal queue", async () => {
  const client = await createClient("create-active");
  const department = await createDepartmentWithOperationalQueue(prisma, {
    clientId: client.id,
    name: "Atendimento",
    slug: "atendimento",
  });
  assert.equal(department.isActive, true);
  const resolved = await resolveDepartmentOperationalQueue(prisma, {
    clientId: client.id,
    departmentId: department.id,
  });
  assert.equal(resolved.queue.departmentId, department.id);
  assert.equal(resolved.queue.clientId, client.id);
  assert.equal(await prisma.queue.count({ where: { departmentId: department.id } }), 1);
});

test("inactive department may remain without an operational queue and activation provisions it", async () => {
  const client = await createClient("activate");
  const department = await createDepartmentWithOperationalQueue(prisma, {
    clientId: client.id,
    name: "Rascunho",
    slug: "rascunho",
    isActive: false,
  });
  assert.equal(department.isActive, false);
  assert.equal(await prisma.queue.count({ where: { departmentId: department.id } }), 0);
  const activated = await updateDepartmentWithOperationalQueueLifecycle(prisma, {
    clientId: client.id,
    departmentId: department.id,
    isActive: true,
  });
  assert.equal(activated?.isActive, true);
  assert.equal(await prisma.queue.count({ where: { departmentId: department.id } }), 1);
  await resolveDepartmentOperationalQueue(prisma, {
    clientId: client.id,
    departmentId: department.id,
  });
});

test("queue creation failure rolls back department creation", async () => {
  const client = await createClient("rollback");
  await assert.rejects(
    createDepartmentWithOperationalQueue(prisma, {
      clientId: client.id,
      name: "Falha",
      slug: "falha",
      testHooks: { beforeQueueCreate: () => { throw new Error("forced_queue_failure"); } },
    }),
    /forced_queue_failure/
  );
  assert.equal(await prisma.department.count({ where: { clientId: client.id } }), 0);
  assert.equal(await prisma.queue.count({ where: { clientId: client.id } }), 0);
});

test("database rejects cross-tenant and other-department operational queues", async () => {
  const firstClient = await createClient("integrity-a");
  const secondClient = await createClient("integrity-b");
  const first = await createDepartmentWithOperationalQueue(prisma, {
    clientId: firstClient.id,
    name: "Primeiro",
    slug: "primeiro",
  });
  const sibling = await createDepartmentWithOperationalQueue(prisma, {
    clientId: firstClient.id,
    name: "Segundo",
    slug: "segundo",
  });
  const foreign = await createDepartmentWithOperationalQueue(prisma, {
    clientId: secondClient.id,
    name: "Externo",
    slug: "externo",
  });
  const siblingQueue = await prisma.queue.findFirstOrThrow({ where: { departmentId: sibling.id } });
  const foreignQueue = await prisma.queue.findFirstOrThrow({ where: { departmentId: foreign.id } });
  for (const queueId of [siblingQueue.id, foreignQueue.id]) {
    await assert.rejects(
      prisma.department.update({ where: { id: first.id }, data: { operationalQueueId: queueId } }),
      (error) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003"
    );
  }
});

test("active department without explicit mapping is blocked and multi-queue activation is not inferred", async () => {
  const client = await createClient("blocked");
  const active = await prisma.department.create({
    data: { clientId: client.id, name: "Legado ativo", slug: "legado-ativo", isActive: true },
  });
  await assert.rejects(
    resolveDepartmentOperationalQueue(prisma, {
      clientId: client.id,
      departmentId: active.id,
    }),
    OperationalQueueUnavailableError
  );
  await assert.rejects(
    updateDepartmentWithOperationalQueueLifecycle(prisma, {
      clientId: client.id,
      departmentId: active.id,
      name: "Legado ainda ativo",
    }),
    OperationalQueueUnavailableError
  );
  const inactive = await prisma.department.create({
    data: { clientId: client.id, name: "Legado ambiguo", slug: "legado-ambiguo", isActive: false },
  });
  await prisma.queue.createMany({
    data: [
      { clientId: client.id, departmentId: inactive.id, name: "A" },
      { clientId: client.id, departmentId: inactive.id, name: "B" },
    ],
  });
  await assert.rejects(
    updateDepartmentWithOperationalQueueLifecycle(prisma, {
      clientId: client.id,
      departmentId: inactive.id,
      isActive: true,
    }),
    OperationalQueueUnavailableError
  );
  assert.equal((await prisma.department.findUniqueOrThrow({ where: { id: inactive.id } })).isActive, false);
});

test("deactivation preserves the explicit queue and metadata edits preserve the relation", async () => {
  const client = await createClient("preserve");
  const department = await createDepartmentWithOperationalQueue(prisma, {
    clientId: client.id,
    name: "Original",
    slug: "original",
  });
  const before = await prisma.department.findUniqueOrThrow({ where: { id: department.id } });
  await updateDepartmentWithOperationalQueueLifecycle(prisma, {
    clientId: client.id,
    departmentId: department.id,
    name: "Renomeado",
    slug: "renomeado",
  });
  await updateDepartmentWithOperationalQueueLifecycle(prisma, {
    clientId: client.id,
    departmentId: department.id,
    isActive: false,
  });
  const after = await prisma.department.findUniqueOrThrow({ where: { id: department.id } });
  assert.equal(after.name, "Renomeado");
  assert.equal(after.isActive, false);
  assert.equal(after.operationalQueueId, before.operationalQueueId);
  assert.equal(await prisma.queue.count({ where: { departmentId: department.id } }), 1);
});

test("reactivation reuses the preserved operational queue without creating duplicates", async () => {
  const client = await createClient("reactivate-reuse");
  const department = await createDepartmentWithOperationalQueue(prisma, {
    clientId: client.id,
    name: "Atendimento",
    slug: "atendimento-reuse",
  });
  const before = await prisma.department.findUniqueOrThrow({ where: { id: department.id } });
  await updateDepartmentWithOperationalQueueLifecycle(prisma, {
    clientId: client.id,
    departmentId: department.id,
    isActive: false,
  });
  await updateDepartmentWithOperationalQueueLifecycle(prisma, {
    clientId: client.id,
    departmentId: department.id,
    isActive: true,
  });
  const after = await prisma.department.findUniqueOrThrow({ where: { id: department.id } });
  assert.equal(after.isActive, true);
  assert.equal(after.operationalQueueId, before.operationalQueueId);
  assert.equal(await prisma.queue.count({ where: { departmentId: department.id } }), 1);
});

test("explicit queue replacement validates same tenant and same department", async () => {
  const client = await createClient("replace-a");
  const otherClient = await createClient("replace-b");
  const department = await createDepartmentWithOperationalQueue(prisma, {
    clientId: client.id,
    name: "Origem",
    slug: "origem",
  });
  const sibling = await createDepartmentWithOperationalQueue(prisma, {
    clientId: client.id,
    name: "Irmao",
    slug: "irmao",
  });
  const foreign = await createDepartmentWithOperationalQueue(prisma, {
    clientId: otherClient.id,
    name: "Externo",
    slug: "externo-replace",
  });
  const original = await prisma.department.findUniqueOrThrow({ where: { id: department.id } });
  const replacement = await prisma.queue.create({
    data: { clientId: client.id, departmentId: department.id, name: "Fila operacional revisada" },
  });
  const siblingQueue = await prisma.queue.findFirstOrThrow({ where: { departmentId: sibling.id } });
  const foreignQueue = await prisma.queue.findFirstOrThrow({ where: { departmentId: foreign.id } });

  await assert.rejects(
    replaceDepartmentOperationalQueue(prisma, {
      clientId: client.id,
      departmentId: department.id,
      queueId: siblingQueue.id,
    }),
    OperationalQueueUnavailableError
  );
  await assert.rejects(
    replaceDepartmentOperationalQueue(prisma, {
      clientId: client.id,
      departmentId: department.id,
      queueId: foreignQueue.id,
    }),
    OperationalQueueUnavailableError
  );

  const updated = await replaceDepartmentOperationalQueue(prisma, {
    clientId: client.id,
    departmentId: department.id,
    queueId: replacement.id,
  });
  assert.equal(updated?.operationalQueueId, replacement.id);
  assert.equal(await prisma.queue.count({ where: { departmentId: department.id } }), 2);
  assert.ok(original.operationalQueueId);
  assert.ok(await prisma.queue.findUnique({ where: { id: original.operationalQueueId } }));
});
