import test from "node:test";
import assert from "node:assert/strict";
import {
  createAppointment,
  createAppointmentReminder,
  createSchedulingService,
  listScheduling,
  updateAppointmentReminder,
  updateSchedulingService,
} from "./schedulingService.js";
import { findSchedulingReminderShadowCandidates } from "./schedulingReminderShadow.js";

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
      findFirst: async () => ({ id: "apt_1" }),
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
    appointmentReminder: {
      findMany: async () => [],
      findFirst: async () => ({ id: "rem_1" }),
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "rem_1",
        sentAt: null,
        status: "pending",
        templateName: null,
        templateLang: null,
        requestId: null,
        error: null,
        createdAt: makeDate("2026-06-20T10:00:00.000Z"),
        updatedAt: makeDate("2026-06-20T10:00:00.000Z"),
        ...data,
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "rem_1",
        appointmentId: "apt_1",
        channel: "whatsapp",
        kind: "manual",
        scheduledAt: makeDate("2026-06-20T10:00:00.000Z"),
        sentAt: null,
        status: "pending",
        templateName: null,
        templateLang: null,
        requestId: null,
        error: null,
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
    appointmentReminder: { findMany: async (args: Record<string, unknown>) => (calls.push(args), []) },
  });
  await listScheduling({ prisma, clientId: "tenant_a", includeReminders: true });
  assert.equal(calls.length, 5);
  for (const call of calls) {
    assert.deepEqual(call.where, { clientId: "tenant_a" });
  }
});

test("createAppointmentReminder writes clientId and validates appointment tenant", async () => {
  let created: { clientId?: unknown; appointmentId?: unknown; templateName?: unknown } | null = null;
  const prisma = makePrisma({
    appointment: {
      findFirst: async (args: { where: Record<string, unknown> }) =>
        args.where.clientId === "tenant_a" && args.where.id === "apt_1" ? { id: "apt_1" } : null,
    },
    appointmentReminder: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created = data;
        return {
          id: "rem_1",
          sentAt: null,
          status: "pending",
          requestId: null,
          error: null,
          createdAt: makeDate("2026-06-20T10:00:00.000Z"),
          updatedAt: makeDate("2026-06-20T10:00:00.000Z"),
          ...data,
        };
      },
    },
  });
  const result = await createAppointmentReminder({
    prisma,
    clientId: "tenant_a",
    input: {
      appointmentId: "apt_1",
      kind: "24h",
      scheduledAt: "2026-06-21T10:00:00.000Z",
      templateName: "appointment_reminder_24h",
      templateLang: "pt_BR",
    },
  });
  assert.equal(result.ok, true);
  assert.ok(created);
  assert.equal((created as { clientId?: unknown }).clientId, "tenant_a");
  assert.equal((created as { appointmentId?: unknown }).appointmentId, "apt_1");
  assert.equal((created as { templateName?: unknown }).templateName, "appointment_reminder_24h");
});

test("updateAppointmentReminder does not update cross-tenant records", async () => {
  let updateCalled = false;
  const prisma = makePrisma({
    appointmentReminder: {
      findFirst: async () => null,
      update: async () => {
        updateCalled = true;
        return null;
      },
    },
  });
  const result = await updateAppointmentReminder({
    prisma,
    clientId: "tenant_a",
    reminderId: "rem_other",
    input: {
      appointmentId: "apt_1",
      scheduledAt: "2026-06-21T10:00:00.000Z",
    },
  });
  assert.deepEqual(result, { ok: false, error: "reminder_not_found" });
  assert.equal(updateCalled, false);
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

test("scheduling reminder shadow only reports eligible tenants and does not mutate reminders", async () => {
  let updateCalled = false;
  let createdEventCount = 0;
  const prisma = makePrisma({
    client: {
      findMany: async () => [
        {
          id: "tenant_a",
          clientKey: "tenant-a",
          profile: "government",
          features: {
            scheduling: true,
            schedulingReminders: true,
            schedulingRemindersShadow: true,
          },
        },
        {
          id: "tenant_b",
          clientKey: "tenant-b",
          profile: "government",
          features: {
            scheduling: true,
            schedulingReminders: true,
            schedulingRemindersShadow: false,
          },
        },
      ],
    },
    appointmentReminder: {
      findMany: async ({ where }: { where: { clientId: string } }) => [
        {
          id: `rem_${where.clientId}`,
          clientId: where.clientId,
          appointmentId: `apt_${where.clientId}`,
          channel: "whatsapp",
          kind: "manual",
          scheduledAt: makeDate("2026-06-20T09:00:00.000Z"),
          status: "pending",
          templateName: "appointment_reminder_manual",
          templateLang: "pt_BR",
          appointment: {
            id: `apt_${where.clientId}`,
            startsAt: makeDate("2026-06-21T12:00:00.000Z"),
            endsAt: makeDate("2026-06-21T13:00:00.000Z"),
            status: "scheduled",
          },
        },
      ],
      update: async () => {
        updateCalled = true;
        return null;
      },
    },
    event: {
      create: async () => {
        createdEventCount += 1;
        return {};
      },
    },
  });

  const report = await findSchedulingReminderShadowCandidates({
    prisma,
    now: makeDate("2026-06-20T10:00:00.000Z"),
    runId: "test-run",
    recordEvents: true,
  });

  assert.equal(report.ok, true);
  assert.equal(report.dryRun, true);
  assert.equal(report.checkedTenants, 2);
  assert.equal(report.scannedReminders, 2);
  assert.equal(report.eligible, 1);
  assert.equal(report.skipped, 1);
  assert.equal(report.candidates[0]?.clientId, "tenant_a");
  assert.equal(report.skippedItems[0]?.reason, "tenant_feature_disabled");
  assert.equal(createdEventCount, 3);
  assert.equal(updateCalled, false);
});

test("scheduling reminder shadow skips completed or past appointments", async () => {
  const prisma = makePrisma({
    client: {
      findMany: async () => [
        {
          id: "tenant_a",
          clientKey: "tenant-a",
          profile: "government",
          features: {
            scheduling: true,
            schedulingReminders: true,
            schedulingRemindersShadow: true,
          },
        },
      ],
    },
    appointmentReminder: {
      findMany: async () => [
        {
          id: "rem_completed",
          clientId: "tenant_a",
          appointmentId: "apt_completed",
          channel: "whatsapp",
          kind: "manual",
          scheduledAt: makeDate("2026-06-20T09:00:00.000Z"),
          status: "pending",
          templateName: null,
          templateLang: null,
          appointment: {
            id: "apt_completed",
            startsAt: makeDate("2026-06-21T12:00:00.000Z"),
            endsAt: makeDate("2026-06-21T13:00:00.000Z"),
            status: "completed",
          },
        },
        {
          id: "rem_past",
          clientId: "tenant_a",
          appointmentId: "apt_past",
          channel: "whatsapp",
          kind: "manual",
          scheduledAt: makeDate("2026-06-20T09:00:00.000Z"),
          status: "pending",
          templateName: null,
          templateLang: null,
          appointment: {
            id: "apt_past",
            startsAt: makeDate("2026-06-20T07:00:00.000Z"),
            endsAt: makeDate("2026-06-20T08:00:00.000Z"),
            status: "scheduled",
          },
        },
      ],
    },
  });

  const report = await findSchedulingReminderShadowCandidates({
    prisma,
    now: makeDate("2026-06-20T10:00:00.000Z"),
    runId: "test-run",
  });

  assert.equal(report.eligible, 0);
  assert.equal(report.skipped, 2);
  assert.deepEqual(
    report.skippedItems.map((item) => item.reason),
    ["appointment_not_eligible", "appointment_past"]
  );
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
