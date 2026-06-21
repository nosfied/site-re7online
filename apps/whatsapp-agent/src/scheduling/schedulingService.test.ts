import test from "node:test";
import assert from "node:assert/strict";
import {
  createAppointment,
  createSchedulingService,
  listScheduling,
  updateSchedulingService,
} from "./schedulingService.js";

function makeDate(value: string) {
  return new Date(value);
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  const base = {
    schedulingService: {
      findMany: async () => [],
      findFirst: async () => ({ id: "svc_1" }),
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "svc_1",
        departmentId: null,
        description: null,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        requiresApproval: false,
        status: "active",
        createdAt: makeDate("2026-06-20T10:00:00.000Z"),
        updatedAt: makeDate("2026-06-20T10:00:00.000Z"),
        ...data,
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "svc_1",
        departmentId: null,
        description: null,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        requiresApproval: false,
        status: "active",
        createdAt: makeDate("2026-06-20T10:00:00.000Z"),
        updatedAt: makeDate("2026-06-20T10:00:00.000Z"),
        name: "Consulta",
        durationMinutes: 30,
        ...data,
      }),
    },
    schedulingResource: {
      findMany: async () => [],
      findFirst: async () => null,
    },
    schedulingAvailability: {
      findMany: async () => [],
    },
    appointment: {
      findMany: async () => [],
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "apt_1",
        serviceId: null,
        resourceId: null,
        departmentId: null,
        contactId: null,
        leadId: null,
        conversationId: null,
        description: null,
        timezone: "America/Fortaleza",
        status: "scheduled",
        source: "manual",
        createdByUserId: null,
        updatedByUserId: null,
        createdAt: makeDate("2026-06-20T10:00:00.000Z"),
        updatedAt: makeDate("2026-06-20T10:00:00.000Z"),
        ...data,
      }),
    },
    department: {
      findFirst: async () => null,
    },
    user: {
      findFirst: async () => null,
    },
    contact: {
      findFirst: async () => null,
    },
    lead: {
      findFirst: async () => null,
    },
    conversation: {
      findFirst: async () => null,
    },
  };
  return { ...base, ...overrides } as never;
}

test("listScheduling filters every collection by clientId", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const prisma = makePrisma({
    schedulingService: { findMany: async (args: Record<string, unknown>) => (calls.push(args), []) },
    schedulingResource: { findMany: async (args: Record<string, unknown>) => (calls.push(args), []) },
    schedulingAvailability: { findMany: async (args: Record<string, unknown>) => (calls.push(args), []) },
    appointment: { findMany: async (args: Record<string, unknown>) => (calls.push(args), []) },
  });
  await listScheduling({ prisma, clientId: "tenant_a" });
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.deepEqual(call.where, { clientId: "tenant_a" });
  }
});

test("createSchedulingService writes the current clientId", async () => {
  let created: { clientId?: unknown; name?: unknown } | null = null;
  const prisma = makePrisma({
    schedulingService: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created = data;
        return {
          id: "svc_1",
          departmentId: null,
          description: null,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
          requiresApproval: false,
          status: "active",
          createdAt: makeDate("2026-06-20T10:00:00.000Z"),
          updatedAt: makeDate("2026-06-20T10:00:00.000Z"),
          ...data,
        };
      },
    },
  });
  const result = await createSchedulingService({
    prisma,
    clientId: "tenant_a",
    input: { name: "Atendimento", durationMinutes: 45 },
  });
  assert.equal(result.ok, true);
  assert.ok(created);
  const createdPayload = created as { clientId?: unknown; name?: unknown };
  assert.equal(createdPayload.clientId, "tenant_a");
  assert.equal(createdPayload.name, "Atendimento");
});

test("updateSchedulingService does not update cross-tenant records", async () => {
  let updateCalled = false;
  const prisma = makePrisma({
    schedulingService: {
      findFirst: async () => null,
      update: async () => {
        updateCalled = true;
        return null;
      },
    },
  });
  const result = await updateSchedulingService({
    prisma,
    clientId: "tenant_a",
    serviceId: "svc_other",
    input: { name: "Atendimento" },
  });
  assert.deepEqual(result, { ok: false, error: "service_not_found" });
  assert.equal(updateCalled, false);
});

test("createAppointment validates tenant-scoped service reference", async () => {
  const prisma = makePrisma({
    schedulingService: {
      findFirst: async (args: { where: Record<string, unknown> }) =>
        args.where.clientId === "tenant_a" && args.where.id === "svc_1" ? { id: "svc_1" } : null,
    },
  });
  const result = await createAppointment({
    prisma,
    clientId: "tenant_a",
    userId: "user_1",
    input: {
      serviceId: "svc_other",
      title: "Visita",
      startsAt: "2026-06-20T11:00:00.000Z",
      endsAt: "2026-06-20T11:30:00.000Z",
    },
  });
  assert.deepEqual(result, { ok: false, error: "service_not_found" });
});
