import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../db.js";
import {
  DepartmentBusinessHoursValidationError,
  getDepartmentAvailability,
  getNextDepartmentOpenAt,
  replaceDepartmentBusinessHourExceptions,
  replaceDepartmentBusinessHours,
} from "./businessHours.js";

const prisma = getPrisma();
const prefix = `business-hours-${process.pid}-${Date.now()}`;

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { clientKey: { startsWith: prefix } },
    select: { id: true },
  });
  const clientIds = clients.map((client) => client.id);
  if (clientIds.length === 0) return;
  await prisma.departmentBusinessHour.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.departmentBusinessHourException.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.tenantOperationalConfig.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.department.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
}

async function createDepartment(suffix: string, timezone = "America/Fortaleza") {
  const client = await prisma.client.create({
    data: { clientKey: `${prefix}-${suffix}`, name: `Hours ${suffix}`, features: {} },
    select: { id: true },
  });
  await prisma.tenantOperationalConfig.create({
    data: { clientId: client.id, config: { timezone } as Prisma.InputJsonObject },
  });
  const department = await prisma.department.create({
    data: { clientId: client.id, name: `Atendimento ${suffix}`, slug: `atendimento-${suffix}` },
    select: { id: true },
  });
  return { client, department };
}

test.before(async () => {
  await cleanup();
});

test.after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("evaluates multiple intervals, lunch break and closed day in tenant timezone", async () => {
  const fixture = await createDepartment("main", "America/Fortaleza");
  await replaceDepartmentBusinessHours(prisma, {
    clientId: fixture.client.id,
    departmentId: fixture.department.id,
    intervals: [
      { weekday: 1, startMinute: 480, endMinute: 720 },
      { weekday: 1, startMinute: 780, endMinute: 1020 },
    ],
  });

  assert.deepEqual(
    await getDepartmentAvailability(prisma, {
      clientId: fixture.client.id,
      departmentId: fixture.department.id,
      at: new Date("2026-08-10T12:00:00.000Z"),
    }),
    { status: "OPEN", timezone: "America/Fortaleza", reason: "REGULAR_SCHEDULE", exception: null }
  );
  assert.deepEqual(
    await getDepartmentAvailability(prisma, {
      clientId: fixture.client.id,
      departmentId: fixture.department.id,
      at: new Date("2026-08-10T15:30:00.000Z"),
    }),
    { status: "CLOSED", timezone: "America/Fortaleza", reason: "REGULAR_SCHEDULE", exception: null }
  );
  assert.deepEqual(
    await getDepartmentAvailability(prisma, {
      clientId: fixture.client.id,
      departmentId: fixture.department.id,
      at: new Date("2026-08-10T17:00:00.000Z"),
    }),
    { status: "OPEN", timezone: "America/Fortaleza", reason: "REGULAR_SCHEDULE", exception: null }
  );
  assert.deepEqual(
    await getDepartmentAvailability(prisma, {
      clientId: fixture.client.id,
      departmentId: fixture.department.id,
      at: new Date("2026-08-09T12:00:00.000Z"),
    }),
    { status: "CLOSED", timezone: "America/Fortaleza", reason: "REGULAR_SCHEDULE", exception: null }
  );
});

test("returns NO_SCHEDULE when department has no configured intervals", async () => {
  const fixture = await createDepartment("empty", "America/Sao_Paulo");
  assert.deepEqual(
    await getDepartmentAvailability(prisma, {
      clientId: fixture.client.id,
      departmentId: fixture.department.id,
      at: new Date("2026-08-10T12:00:00.000Z"),
    }),
    { status: "NO_SCHEDULE", timezone: "America/Sao_Paulo", reason: "NO_SCHEDULE", exception: null }
  );
});

test("rejects overlapping and overnight intervals", async () => {
  const fixture = await createDepartment("invalid");
  await assert.rejects(
    replaceDepartmentBusinessHours(prisma, {
      clientId: fixture.client.id,
      departmentId: fixture.department.id,
      intervals: [
        { weekday: 1, startMinute: 480, endMinute: 720 },
        { weekday: 1, startMinute: 700, endMinute: 780 },
      ],
    }),
    (error) =>
      error instanceof DepartmentBusinessHoursValidationError &&
      error.code === "overlapping_business_hours"
  );
  await assert.rejects(
    replaceDepartmentBusinessHours(prisma, {
      clientId: fixture.client.id,
      departmentId: fixture.department.id,
      intervals: [{ weekday: 1, startMinute: 1320, endMinute: 360 }],
    }),
    (error) =>
      error instanceof DepartmentBusinessHoursValidationError &&
      error.code === "invalid_business_hour_interval"
  );
});

test("closed exception overrides regular weekday hours", async () => {
  const fixture = await createDepartment("holiday", "America/Recife");
  await replaceDepartmentBusinessHours(prisma, {
    clientId: fixture.client.id,
    departmentId: fixture.department.id,
    intervals: [{ weekday: 1, startMinute: 480, endMinute: 1020 }],
  });
  await replaceDepartmentBusinessHourExceptions(prisma, {
    clientId: fixture.client.id,
    departmentId: fixture.department.id,
    exceptions: [{ date: "2026-08-10", type: "CLOSED", reason: "Feriado de teste" }],
  });

  const availability = await getDepartmentAvailability(prisma, {
    clientId: fixture.client.id,
    departmentId: fixture.department.id,
    at: new Date("2026-08-10T12:00:00.000Z"),
  });
  assert.equal(availability.status, "CLOSED");
  assert.equal(availability.reason, "EXCEPTION");
  assert.equal(availability.exception?.type, "CLOSED");
});

test("custom hours exception overrides regular hours and can open Saturday", async () => {
  const fixture = await createDepartment("custom", "America/Recife");
  await replaceDepartmentBusinessHours(prisma, {
    clientId: fixture.client.id,
    departmentId: fixture.department.id,
    intervals: [{ weekday: 1, startMinute: 480, endMinute: 1020 }],
  });
  await replaceDepartmentBusinessHourExceptions(prisma, {
    clientId: fixture.client.id,
    departmentId: fixture.department.id,
    exceptions: [
      { date: "2026-08-10", type: "CUSTOM_HOURS", intervals: [{ startMinute: 540, endMinute: 720 }] },
      { date: "2026-08-15", type: "CUSTOM_HOURS", intervals: [{ startMinute: 540, endMinute: 780 }] },
    ],
  });

  assert.equal((await getDepartmentAvailability(prisma, {
    clientId: fixture.client.id,
    departmentId: fixture.department.id,
    at: new Date("2026-08-10T13:00:00.000Z"),
  })).status, "OPEN");
  assert.equal((await getDepartmentAvailability(prisma, {
    clientId: fixture.client.id,
    departmentId: fixture.department.id,
    at: new Date("2026-08-10T17:00:00.000Z"),
  })).status, "CLOSED");
  assert.equal((await getDepartmentAvailability(prisma, {
    clientId: fixture.client.id,
    departmentId: fixture.department.id,
    at: new Date("2026-08-15T13:00:00.000Z"),
  })).status, "OPEN");
});

test("next open skips closed exception and preserves tenant and department isolation", async () => {
  const fixtureA = await createDepartment("next-a", "America/Recife");
  const fixtureB = await createDepartment("next-b", "America/Recife");
  const departmentA2 = await prisma.department.create({
    data: { clientId: fixtureA.client.id, name: "Outro setor", slug: "outro-setor" },
    select: { id: true },
  });
  for (const departmentId of [fixtureA.department.id, fixtureB.department.id, departmentA2.id]) {
    await replaceDepartmentBusinessHours(prisma, {
      clientId: departmentId === fixtureB.department.id ? fixtureB.client.id : fixtureA.client.id,
      departmentId,
      intervals: [
        { weekday: 1, startMinute: 480, endMinute: 1020 },
        { weekday: 2, startMinute: 480, endMinute: 1020 },
      ],
    });
  }
  await replaceDepartmentBusinessHourExceptions(prisma, {
    clientId: fixtureA.client.id,
    departmentId: fixtureA.department.id,
    exceptions: [{ date: "2026-08-17", type: "CLOSED", reason: "Feriado A" }],
  });

  const nextA = await getNextDepartmentOpenAt(prisma, {
    clientId: fixtureA.client.id,
    departmentId: fixtureA.department.id,
    after: new Date("2026-08-14T21:00:00.000Z"),
  });
  assert.equal(nextA?.date, "2026-08-18");

  const nextB = await getNextDepartmentOpenAt(prisma, {
    clientId: fixtureB.client.id,
    departmentId: fixtureB.department.id,
    after: new Date("2026-08-14T21:00:00.000Z"),
  });
  assert.equal(nextB?.date, "2026-08-17");

  const nextA2 = await getNextDepartmentOpenAt(prisma, {
    clientId: fixtureA.client.id,
    departmentId: departmentA2.id,
    after: new Date("2026-08-14T21:00:00.000Z"),
  });
  assert.equal(nextA2?.date, "2026-08-17");
});
