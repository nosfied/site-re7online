import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { hasFeature } from "../features/clientFeatures.js";
import { logger } from "../logger/logger.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const ELIGIBLE_APPOINTMENT_STATUSES = new Set(["scheduled", "confirmed", "rescheduled"]);

export type SchedulingReminderShadowCandidate = {
  clientId: string;
  clientKey: string;
  reminderId: string;
  appointmentId: string;
  channel: string;
  kind: string;
  scheduledAt: string;
  appointmentStartsAt: string;
  appointmentStatus: string;
  templateName: string | null;
  templateLang: string | null;
  wouldSend: true;
  reason: "eligible";
};

export type SchedulingReminderShadowSkipped = {
  clientId: string;
  clientKey: string;
  reminderId: string;
  appointmentId: string;
  scheduledAt: string;
  appointmentStatus: string | null;
  reason:
    | "tenant_feature_disabled"
    | "appointment_not_eligible"
    | "appointment_past";
};

export type SchedulingReminderShadowReport = {
  ok: boolean;
  dryRun: true;
  recordEvents: boolean;
  runId: string;
  now: string;
  tenant: string | null;
  checkedTenants: number;
  scannedReminders: number;
  eligible: number;
  skipped: number;
  eventWrites: number;
  candidates: SchedulingReminderShadowCandidate[];
  skippedItems: SchedulingReminderShadowSkipped[];
};

type ClientRow = {
  id: string;
  clientKey: string;
  profile: string | null;
  features: Prisma.JsonValue | null;
};

type ReminderRow = {
  id: string;
  clientId: string;
  appointmentId: string;
  channel: string;
  kind: string;
  scheduledAt: Date;
  status: string;
  templateName: string | null;
  templateLang: string | null;
  appointment: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    status: string;
  };
};

export function buildSchedulingReminderShadowRunId() {
  return `scheduling-reminders-shadow:${Date.now().toString(36)}:${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value ?? DEFAULT_LIMIT)));
}

function toCandidate(client: ClientRow, reminder: ReminderRow): SchedulingReminderShadowCandidate {
  return {
    clientId: client.id,
    clientKey: client.clientKey,
    reminderId: reminder.id,
    appointmentId: reminder.appointmentId,
    channel: reminder.channel,
    kind: reminder.kind,
    scheduledAt: reminder.scheduledAt.toISOString(),
    appointmentStartsAt: reminder.appointment.startsAt.toISOString(),
    appointmentStatus: reminder.appointment.status,
    templateName: reminder.templateName,
    templateLang: reminder.templateLang,
    wouldSend: true,
    reason: "eligible",
  };
}

function buildSkipped(
  client: ClientRow,
  reminder: ReminderRow,
  reason: SchedulingReminderShadowSkipped["reason"]
): SchedulingReminderShadowSkipped {
  return {
    clientId: client.id,
    clientKey: client.clientKey,
    reminderId: reminder.id,
    appointmentId: reminder.appointmentId,
    scheduledAt: reminder.scheduledAt.toISOString(),
    appointmentStatus: reminder.appointment?.status ?? null,
    reason,
  };
}

async function recordShadowEvent(params: {
  prisma: PrismaClient;
  clientId: string;
  runId: string;
  eventName: "appointment.reminder.shadow_eligible" | "appointment.reminder.shadow_run";
  payload: Record<string, unknown>;
}) {
  await params.prisma.event
    .create({
      data: {
        clientId: params.clientId,
        eventName: params.eventName,
        requestId: `${params.runId}:${params.eventName}:${String(params.payload.reminderId ?? "summary")}`,
        payloadJson: {
          action: params.eventName,
          shadow: true,
          dryRun: true,
          ...params.payload,
        },
      },
    })
    .catch((error: unknown) => {
      logger.warn({
        event: "appointment.reminder.shadow_audit_failed",
        clientId: params.clientId,
        eventName: params.eventName,
        runId: params.runId,
        message: (error as Error).message,
      });
    });
}

export async function findSchedulingReminderShadowCandidates(params: {
  prisma: PrismaClient;
  now?: Date;
  tenant?: string;
  limit?: number;
  recordEvents?: boolean;
  runId?: string;
}): Promise<SchedulingReminderShadowReport> {
  const now = params.now ?? new Date();
  const runId = params.runId ?? buildSchedulingReminderShadowRunId();
  const limit = normalizeLimit(params.limit);
  const clients = await params.prisma.client.findMany({
    where: {
      status: "ACTIVE",
      ...(params.tenant ? { clientKey: params.tenant } : {}),
    },
    select: {
      id: true,
      clientKey: true,
      profile: true,
      features: true,
    },
    orderBy: { clientKey: "asc" },
  });

  const candidates: SchedulingReminderShadowCandidate[] = [];
  const skippedItems: SchedulingReminderShadowSkipped[] = [];
  let scannedReminders = 0;
  let eventWrites = 0;

  for (const client of clients) {
    const enabled =
      hasFeature(client, "scheduling") &&
      hasFeature(client, "schedulingReminders") &&
      hasFeature(client, "schedulingRemindersShadow");
    const reminders = await params.prisma.appointmentReminder.findMany({
      where: {
        clientId: client.id,
        status: "pending",
        scheduledAt: { lte: now },
      },
      include: {
        appointment: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
          },
        },
      },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      take: limit,
    });
    scannedReminders += reminders.length;
    for (const reminder of reminders as ReminderRow[]) {
      if (!enabled) {
        skippedItems.push(buildSkipped(client, reminder, "tenant_feature_disabled"));
        continue;
      }
      if (!ELIGIBLE_APPOINTMENT_STATUSES.has(reminder.appointment.status)) {
        skippedItems.push(buildSkipped(client, reminder, "appointment_not_eligible"));
        continue;
      }
      if (reminder.appointment.endsAt.getTime() < now.getTime()) {
        skippedItems.push(buildSkipped(client, reminder, "appointment_past"));
        continue;
      }
      const candidate = toCandidate(client, reminder);
      candidates.push(candidate);
      logger.info({
        event: "appointment.reminder.shadow_eligible",
        clientId: client.id,
        clientKey: client.clientKey,
        runId,
        reminderId: candidate.reminderId,
        appointmentId: candidate.appointmentId,
        channel: candidate.channel,
        kind: candidate.kind,
        scheduledAt: candidate.scheduledAt,
      });
      if (params.recordEvents) {
        await recordShadowEvent({
          prisma: params.prisma,
          clientId: client.id,
          runId,
          eventName: "appointment.reminder.shadow_eligible",
          payload: {
            reminderId: candidate.reminderId,
            appointmentId: candidate.appointmentId,
            channel: candidate.channel,
            kind: candidate.kind,
            scheduledAt: candidate.scheduledAt,
            templateConfigured: Boolean(candidate.templateName),
          },
        });
        eventWrites += 1;
      }
    }
  }

  const report: SchedulingReminderShadowReport = {
    ok: true,
    dryRun: true,
    recordEvents: params.recordEvents === true,
    runId,
    now: now.toISOString(),
    tenant: params.tenant ?? null,
    checkedTenants: clients.length,
    scannedReminders,
    eligible: candidates.length,
    skipped: skippedItems.length,
    eventWrites,
    candidates,
    skippedItems,
  };

  logger.info({
    event: "appointment.reminder.shadow_run",
    runId,
    tenant: report.tenant,
    checkedTenants: report.checkedTenants,
    scannedReminders: report.scannedReminders,
    eligible: report.eligible,
    skipped: report.skipped,
    recordEvents: report.recordEvents,
  });

  if (params.recordEvents) {
    for (const client of clients) {
      await recordShadowEvent({
        prisma: params.prisma,
        clientId: client.id,
        runId,
        eventName: "appointment.reminder.shadow_run",
        payload: {
          tenant: client.clientKey,
          scannedReminders: skippedItems.filter((item) => item.clientId === client.id).length +
            candidates.filter((item) => item.clientId === client.id).length,
          eligible: candidates.filter((item) => item.clientId === client.id).length,
          skipped: skippedItems.filter((item) => item.clientId === client.id).length,
        },
      });
      eventWrites += 1;
    }
    report.eventWrites = eventWrites;
  }

  return report;
}
