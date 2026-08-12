import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../db.js";
import {
  DepartmentBusinessHoursValidationError,
  getDepartmentAvailability,
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
    { status: "OPEN", timezone: "America/Fortaleza" }
  );
  assert.deepEqual(
    await getDepartmentAvailability(prisma, {
      clientId: fixture.client.id,
      departmentId: fixture.department.id,
      at: new Date("2026-08-10T15:30:00.000Z"),
    }),
    { status: "CLOSED", timezone: "America/Fortaleza" }
  );
  assert.deepEqual(
    await getDepartmentAvailability(prisma, {
      clientId: fixture.client.id,
      departmentId: fixture.department.id,
      at: new Date("2026-08-10T17:00:00.000Z"),
    }),
    { status: "OPEN", timezone: "America/Fortaleza" }
  );
  assert.deepEqual(
    await getDepartmentAvailability(prisma, {
      clientId: fixture.client.id,
      departmentId: fixture.department.id,
      at: new Date("2026-08-09T12:00:00.000Z"),
    }),
    { status: "CLOSED", timezone: "America/Fortaleza" }
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
    { status: "NO_SCHEDULE", timezone: "America/Sao_Paulo" }
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
