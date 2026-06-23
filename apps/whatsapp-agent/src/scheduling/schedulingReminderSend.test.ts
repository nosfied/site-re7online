import test from "node:test";
import assert from "node:assert/strict";
import { sendSchedulingRemindersControlled } from "./schedulingReminderSend.js";

const now = new Date("2026-06-22T12:00:00.000Z");

function makeClient(features: Record<string, boolean> = {}) {
  return {
    id: "client-1",
    clientKey: "demo-prefeitura",
    profile: "government",
    features: {
      scheduling: true,
      schedulingReminders: true,
      schedulingRemindersSend: true,
      ...features,
    },
  };
}

function makeReminder(overrides: Record<string, unknown> = {}) {
  return {
    id: "reminder-1",
    clientId: "client-1",
    appointmentId: "appointment-1",
    channel: "whatsapp",
    scheduledAt: new Date("2026-06-22T11:55:00.000Z"),
    status: "pending",
    sentAt: null,
    templateName: "appointment_reminder",
    templateLang: "pt_BR",
    requestId: null,
    metadata: null,
    appointment: {
      id: "appointment-1",
      startsAt: new Date("2026-06-23T12:00:00.000Z"),
      endsAt: new Date("2026-06-23T13:00:00.000Z"),
      status: "scheduled",
      contact: { id: "contact-1", waId: "558499999999", name: "Maria" },
      conversation: null,
    },
    ...overrides,
  };
}

function makePrisma(params: {
  client?: Record<string, unknown> | null;
  reminders?: Array<Record<string, unknown>>;
  lockCount?: number;
} = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const updateManyCalls: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  const prisma = {
    client: {
      findMany: async () => (params.client === null ? [] : [params.client ?? makeClient()]),
    },
    appointmentReminder: {
      findMany: async () => params.reminders ?? [makeReminder()],
      updateMany: async (input: Record<string, unknown>) => {
        updateManyCalls.push(input);
        return { count: params.lockCount ?? 1 };
      },
      update: async (input: Record<string, unknown>) => {
        updates.push(input);
        return input;
      },
    },
    event: {
      create: async (input: Record<string, unknown>) => {
        events.push(input);
        return input;
      },
    },
  };
  return { prisma, updates, updateManyCalls, events };
}

test("dry-run lists eligible reminders without mutating or sending", async () => {
  const { prisma, updates, updateManyCalls, events } = makePrisma();
  let sent = 0;
  const report = await sendSchedulingRemindersControlled({
    prisma: prisma as never,
    tenant: "demo-prefeitura",
    now,
    sender: async () => {
      sent += 1;
      return { ok: true };
    },
  });

  assert.equal(report.ok, true);
  assert.equal(report.dryRun, true);
  assert.equal(report.wouldSend, 1);
  assert.equal(sent, 0);
  assert.equal(updates.length, 0);
  assert.equal(updateManyCalls.length, 0);
  assert.equal(events.length, 0);
});

test("execute is blocked when schedulingRemindersSend is disabled", async () => {
  const { prisma, updates, updateManyCalls } = makePrisma({
    client: makeClient({ schedulingRemindersSend: false }),
  });
  let sent = 0;
  const report = await sendSchedulingRemindersControlled({
    prisma: prisma as never,
    tenant: "demo-prefeitura",
    now,
    execute: true,
    sender: async () => {
      sent += 1;
      return { ok: true };
    },
  });

  assert.equal(report.sent, 0);
  assert.equal(report.skipped, 1);
  assert.equal(report.items[0]?.reason, "send_feature_disabled");
  assert.equal(sent, 0);
  assert.equal(updates.length, 0);
  assert.equal(updateManyCalls.length, 0);
});

test("execute sends eligible WhatsApp reminder and marks it sent", async () => {
  const { prisma, updates, updateManyCalls, events } = makePrisma();
  const report = await sendSchedulingRemindersControlled({
    prisma: prisma as never,
    tenant: "demo-prefeitura",
    now,
    execute: true,
    sender: async (params) => {
      assert.equal(params.waId, "558499999999");
      assert.equal(params.templateName, "appointment_reminder");
      assert.equal(params.lang, "pt_BR");
      return { ok: true, status: 200, metaMessageId: "wamid.test" };
    },
  });

  assert.equal(report.sent, 1);
  assert.equal(report.failed, 0);
  assert.equal(updateManyCalls.length, 1);
  const lastUpdate = updates[updates.length - 1];
  assert.equal(lastUpdate?.["data"] && (lastUpdate?.["data"] as Record<string, unknown>).status, "sent");
  assert.equal(events.length, 2);
});

test("execute skips missing template without calling provider", async () => {
  const { prisma, updates } = makePrisma({
    reminders: [makeReminder({ templateName: null, templateLang: null })],
  });
  let sent = 0;
  const report = await sendSchedulingRemindersControlled({
    prisma: prisma as never,
    tenant: "demo-prefeitura",
    now,
    execute: true,
    sender: async () => {
      sent += 1;
      return { ok: true };
    },
  });

  assert.equal(report.sent, 0);
  assert.equal(report.skipped, 1);
  assert.equal(report.items[0]?.reason, "template_required");
  assert.equal(sent, 0);
  assert.equal((updates[0]?.data as Record<string, unknown>).status, "skipped");
});

test("execute does not resend when idempotency lock is not acquired", async () => {
  const { prisma, updates } = makePrisma({ lockCount: 0 });
  let sent = 0;
  const report = await sendSchedulingRemindersControlled({
    prisma: prisma as never,
    tenant: "demo-prefeitura",
    now,
    execute: true,
    sender: async () => {
      sent += 1;
      return { ok: true };
    },
  });

  assert.equal(report.sent, 0);
  assert.equal(report.skipped, 1);
  assert.equal(report.items[0]?.reason, "already_processed");
  assert.equal(sent, 0);
  assert.equal(updates.length, 0);
});

test("provider failure marks reminder failed", async () => {
  const { prisma, updates } = makePrisma();
  const report = await sendSchedulingRemindersControlled({
    prisma: prisma as never,
    tenant: "demo-prefeitura",
    now,
    execute: true,
    sender: async () => ({ ok: false, status: 500, errorBody: "provider_down" }),
  });

  assert.equal(report.sent, 0);
  assert.equal(report.failed, 1);
  const lastUpdate = updates[updates.length - 1];
  assert.equal((lastUpdate?.data as Record<string, unknown>).status, "failed");
  assert.equal((lastUpdate?.data as Record<string, unknown>).error, "provider_down");
});

test("tenant is required and cross-tenant lookup returns no send", async () => {
  const missingTenant = await sendSchedulingRemindersControlled({
    prisma: makePrisma().prisma as never,
    now,
  });
  assert.equal(missingTenant.ok, false);
  assert.equal(missingTenant.error, "tenant_required");

  const { prisma } = makePrisma({ client: null });
  const report = await sendSchedulingRemindersControlled({
    prisma: prisma as never,
    tenant: "other-tenant",
    now,
    execute: true,
  });
  assert.equal(report.ok, false);
  assert.equal(report.error, "tenant_not_found");
});
