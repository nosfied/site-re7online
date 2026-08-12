import assert from "node:assert/strict";
import test from "node:test";
import { getPrisma } from "../db.js";
import {
  DepartmentMembershipValidationError,
  getUserDepartmentMemberships,
  syncUserDepartmentMemberships,
} from "./departmentMemberships.js";

const prisma = getPrisma();
const prefix = `membership-${process.pid}-${Date.now()}`;

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { clientKey: { startsWith: prefix } },
    select: { id: true },
  });
  const clientIds = clients.map((client) => client.id);
  if (clientIds.length === 0) return;
  await prisma.userDepartmentMembership.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.user.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.queue.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.department.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
}

async function createFixture(suffix: string) {
  const client = await prisma.client.create({
    data: { clientKey: `${prefix}-${suffix}`, name: `Membership ${suffix}`, features: {} },
    select: { id: true },
  });
  const [first, second, third] = await Promise.all(
    ["geral", "eventos", "fomento"].map((slug) =>
      prisma.department.create({
        data: { clientId: client.id, name: `${suffix} ${slug}`, slug: `${suffix}-${slug}` },
        select: { id: true },
      })
    )
  );
  const user = await prisma.user.create({
    data: {
      clientId: client.id,
      name: `User ${suffix}`,
      email: `${prefix}-${suffix}@example.test`,
      role: "AGENT",
      departmentId: first.id,
    },
    select: { id: true },
  });
  return { client, departments: [first, second, third], user };
}

test.before(async () => {
  await cleanup();
});

test.after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("supports zero, one and multiple active memberships with a primary department", async () => {
  const fixture = await createFixture("multi");
  await syncUserDepartmentMemberships(prisma, {
    clientId: fixture.client.id,
    userId: fixture.user.id,
    departmentIds: [],
    primaryDepartmentId: null,
  });
  assert.deepEqual(await getUserDepartmentMemberships(prisma, {
    clientId: fixture.client.id,
    userId: fixture.user.id,
    fallbackToLegacy: false,
  }), []);

  await syncUserDepartmentMemberships(prisma, {
    clientId: fixture.client.id,
    userId: fixture.user.id,
    departmentIds: [fixture.departments[0].id],
    primaryDepartmentId: fixture.departments[0].id,
  });
  let memberships = await getUserDepartmentMemberships(prisma, {
    clientId: fixture.client.id,
    userId: fixture.user.id,
    fallbackToLegacy: false,
  });
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].isPrimary, true);

  await syncUserDepartmentMemberships(prisma, {
    clientId: fixture.client.id,
    userId: fixture.user.id,
    departmentIds: fixture.departments.map((department) => department.id),
    primaryDepartmentId: fixture.departments[1].id,
  });
  memberships = await getUserDepartmentMemberships(prisma, {
    clientId: fixture.client.id,
    userId: fixture.user.id,
    fallbackToLegacy: false,
  });
  assert.equal(memberships.length, 3);
  assert.equal(memberships.filter((item) => item.isPrimary).length, 1);
  assert.equal(memberships.find((item) => item.isPrimary)?.departmentId, fixture.departments[1].id);
  const user = await prisma.user.findUnique({ where: { id: fixture.user.id }, select: { departmentId: true } });
  assert.equal(user?.departmentId, fixture.departments[1].id);
});

test("legacy departmentId is used only when no memberships exist", async () => {
  const fixture = await createFixture("legacy");
  const memberships = await getUserDepartmentMemberships(prisma, {
    clientId: fixture.client.id,
    userId: fixture.user.id,
  });
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].source, "legacy");
  assert.equal(memberships[0].departmentId, fixture.departments[0].id);
});

test("rejects cross-tenant department membership", async () => {
  const fixture = await createFixture("guard");
  const other = await createFixture("other");
  await assert.rejects(
    syncUserDepartmentMemberships(prisma, {
      clientId: fixture.client.id,
      userId: fixture.user.id,
      departmentIds: [other.departments[0].id],
      primaryDepartmentId: other.departments[0].id,
    }),
    (error) =>
      error instanceof DepartmentMembershipValidationError &&
      error.code === "department_not_found"
  );
});
