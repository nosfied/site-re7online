import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { hasFeature } from "../features/clientFeatures.js";
import { logger } from "../logger/logger.js";
import { sendTemplate, type SendTemplateResult } from "../services/outboundTemplateService.js";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const ELIGIBLE_APPOINTMENT_STATUSES = new Set(["scheduled", "confirmed", "rescheduled"]);
const SUPPORTED_CHANNELS = new Set(["whatsapp"]);

export type SchedulingReminderSendReason =
  | "eligible"
  | "tenant_required"
  | "tenant_not_found"
  | "tenant_feature_disabled"
  | "send_feature_disabled"
  | "appointment_not_eligible"
  | "appointment_past"
  | "unsupported_channel"
  | "contact_missing"
  | "template_required"
  | "already_processed"
  | "provider_failed";

export type SchedulingReminderSendItem = {
  clientId: string;
  clientKey: string;
  reminderId: string;
  appointmentId: string;
  channel: string;
  scheduledAt: string;
  appointmentStartsAt: string | null;
  templateName: string | null;
  templateLang: string | null;
  action: "would_send" | "sent" | "failed" | "skipped";
  reason: SchedulingReminderSendReason;
  providerStatus?: number;
  metaMessageId?: string;
};

export type SchedulingReminderSendReport = {
  ok: boolean;
  dryRun: boolean;
  execute: boolean;
  runId: string;
  now: string;
  tenant: string | null;
  checkedTenants: number;
  scannedReminders: number;
  wouldSend: number;
  sent: number;
  failed: number;
  skipped: number;
  items: SchedulingReminderSendItem[];
  error?: SchedulingReminderSendReason;
};

type ReminderSender = (params: {
  toE164: string;
  waId: string;
  templateName: string;
  lang?: string;
  requestId: string;
  rid: string;
  messageId: string;
  clientId: string;
  clientKey: string;
}) => Promise<SendTemplateResult>;

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
  scheduledAt: Date;
  status: string;
  sentAt: Date | null;
  templateName: string | null;
  templateLang: string | null;
  requestId: string | null;
  metadata: Prisma.JsonValue | null;
  appointment: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    status: string;
    contact: { id: string; waId: string | null; name: string | null } | null;
    conversation: {
      id: string;
      waId: string;
      waIdCanonical: string | null;
      channel: string;
      windowIsOpen: boolean;
      windowExpiresAt: Date | null;
      lastInboundAt: Date | null;
    } | null;
  };
};

export function buildSchedulingReminderSendRunId() {
  return `scheduling-reminders-send:${Date.now().toString(36)}:${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value ?? DEFAULT_LIMIT)));
}

function normalizeWaId(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

function metadataObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? ({ ...(value as Record<string, unknown>) } as Record<string, unknown>)
    : {};
}

function readAttemptCount(value: Prisma.JsonValue | null | undefined) {
  const metadata = metadataObject(value);
  const raw = metadata.sendAttemptCount ?? metadata.attemptCount;
  return typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.trunc(raw)) : 0;
}

function buildMetadata(
  reminder: ReminderRow,
  patch: Record<string, unknown>
): Prisma.InputJsonObject {
  return {
    ...metadataObject(reminder.metadata),
    ...patch,
  } as Prisma.InputJsonObject;
}

function buildItem(params: {
  client: ClientRow;
  reminder: ReminderRow;
  action: SchedulingReminderSendItem["action"];
  reason: SchedulingReminderSendReason;
  providerStatus?: number;
  metaMessageId?: string;
}): SchedulingReminderSendItem {
  return {
    clientId: params.client.id,
    clientKey: params.client.clientKey,
    reminderId: params.reminder.id,
    appointmentId: params.reminder.appointmentId,
    channel: params.reminder.channel,
    scheduledAt: params.reminder.scheduledAt.toISOString(),
    appointmentStartsAt: params.reminder.appointment?.startsAt?.toISOString?.() ?? null,
    templateName: params.reminder.templateName,
    templateLang: params.reminder.templateLang,
    action: params.action,
    reason: params.reason,
    ...(params.providerStatus ? { providerStatus: params.providerStatus } : {}),
    ...(params.metaMessageId ? { metaMessageId: params.metaMessageId } : {}),
  };
}

function evaluateReminder(params: {
  client: ClientRow;
  reminder: ReminderRow;
  now: Date;
  sendFeatureEnabled: boolean;
}): { ok: true; waId: string } | { ok: false; reason: SchedulingReminderSendReason } {
  const { reminder, now } = params;
  if (!params.sendFeatureEnabled) return { ok: false, reason: "send_feature_disabled" };
  if (!ELIGIBLE_APPOINTMENT_STATUSES.has(reminder.appointment.status)) {
    return { ok: false, reason: "appointment_not_eligible" };
  }
  if (reminder.appointment.endsAt.getTime() < now.getTime()) {
    return { ok: false, reason: "appointment_past" };
  }
  if (!SUPPORTED_CHANNELS.has(String(reminder.channel ?? "").toLowerCase())) {
    return { ok: false, reason: "unsupported_channel" };
  }
  const waId = normalizeWaId(reminder.appointment.contact?.waId ?? reminder.appointment.conversation?.waId);
  if (!waId) return { ok: false, reason: "contact_missing" };
  if (!reminder.templateName || !reminder.templateLang) {
    return { ok: false, reason: "template_required" };
  }
  return { ok: true, waId };
}

async function recordReminderSendEvent(params: {
  prisma: PrismaClient;
  clientId: string;
  runId: string;
  eventName:
    | "appointment.reminder.send_started"
    | "appointment.reminder.sent"
    | "appointment.reminder.failed"
    | "appointment.reminder.skipped";
  reminderId: string;
  appointmentId: string;
  payload: Record<string, unknown>;
}) {
  await params.prisma.event
    .create({
      data: {
        clientId: params.clientId,
        eventName: params.eventName,
        requestId: `${params.runId}:${params.eventName}:${params.reminderId}`,
        payloadJson: {
          action: params.eventName,
          reminderId: params.reminderId,
          appointmentId: params.appointmentId,
          controlledSend: true,
          ...params.payload,
        },
      },
    })
    .catch((error: unknown) => {
      logger.warn({
        event: "appointment.reminder.send_audit_failed",
        clientId: params.clientId,
        eventName: params.eventName,
        runId: params.runId,
        reminderId: params.reminderId,
        message: (error as Error).message,
      });
    });
}

async function markSkipped(params: {
  prisma: PrismaClient;
  client: ClientRow;
  reminder: ReminderRow;
  runId: string;
  now: Date;
  reason: SchedulingReminderSendReason;
}) {
  await params.prisma.appointmentReminder.update({
    where: { id: params.reminder.id },
    data: {
      status: "skipped",
      requestId: params.runId,
      error: params.reason,
      metadata: buildMetadata(params.reminder, {
        sendRunId: params.runId,
        sendAttemptCount: readAttemptCount(params.reminder.metadata) + 1,
        skippedAt: params.now.toISOString(),
        skippedReason: params.reason,
      }),
    },
  });
  await recordReminderSendEvent({
    prisma: params.prisma,
    clientId: params.client.id,
    runId: params.runId,
    eventName: "appointment.reminder.skipped",
    reminderId: params.reminder.id,
    appointmentId: params.reminder.appointmentId,
    payload: { reason: params.reason },
  });
}

export async function sendSchedulingRemindersControlled(params: {
  prisma: PrismaClient;
  tenant?: string;
  reminderId?: string;
  limit?: number;
  execute?: boolean;
  now?: Date;
  runId?: string;
  sender?: ReminderSender;
}): Promise<SchedulingReminderSendReport> {
  const now = params.now ?? new Date();
  const runId = params.runId ?? buildSchedulingReminderSendRunId();
  const dryRun = params.execute !== true;
  const limit = normalizeLimit(params.limit);
  const tenant = params.tenant?.trim() || null;
  if (!tenant) {
    return {
      ok: false,
      dryRun,
      execute: !dryRun,
      runId,
      now: now.toISOString(),
      tenant,
      checkedTenants: 0,
      scannedReminders: 0,
      wouldSend: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      items: [],
      error: "tenant_required",
    };
  }

  const clients = await params.prisma.client.findMany({
    where: { status: "ACTIVE", clientKey: tenant },
    select: { id: true, clientKey: true, profile: true, features: true },
    take: 1,
  });
  if (clients.length === 0) {
    return {
      ok: false,
      dryRun,
      execute: !dryRun,
      runId,
      now: now.toISOString(),
      tenant,
      checkedTenants: 0,
      scannedReminders: 0,
      wouldSend: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      items: [],
      error: "tenant_not_found",
    };
  }

  const items: SchedulingReminderSendItem[] = [];
  let scannedReminders = 0;
  let wouldSend = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const sender = params.sender ?? ((input) => sendTemplate({ ...input, intent: undefined }));

  for (const client of clients as ClientRow[]) {
    const schedulingEnabled = hasFeature(client, "scheduling") && hasFeature(client, "schedulingReminders");
    const sendFeatureEnabled = schedulingEnabled && hasFeature(client, "schedulingRemindersSend");
    const reminders = await params.prisma.appointmentReminder.findMany({
      where: {
        clientId: client.id,
        status: "pending",
        scheduledAt: { lte: now },
        ...(params.reminderId ? { id: params.reminderId } : {}),
      },
      include: {
        appointment: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
            contact: { select: { id: true, waId: true, name: true } },
            conversation: {
              select: {
                id: true,
                waId: true,
                waIdCanonical: true,
                channel: true,
                windowIsOpen: true,
                windowExpiresAt: true,
                lastInboundAt: true,
              },
            },
          },
        },
      },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      take: limit,
    });
    scannedReminders += reminders.length;

    for (const reminder of reminders as ReminderRow[]) {
      if (!schedulingEnabled) {
        const item = buildItem({ client, reminder, action: "skipped", reason: "tenant_feature_disabled" });
        items.push(item);
        skipped += 1;
        continue;
      }

      const eligibility = evaluateReminder({ client, reminder, now, sendFeatureEnabled });
      if (!eligibility.ok) {
        const item = buildItem({ client, reminder, action: "skipped", reason: eligibility.reason });
        items.push(item);
        skipped += 1;
        if (!dryRun && eligibility.reason !== "send_feature_disabled") {
          await markSkipped({ prisma: params.prisma, client, reminder, runId, now, reason: eligibility.reason });
        }
        continue;
      }

      if (dryRun) {
        items.push(buildItem({ client, reminder, action: "would_send", reason: "eligible" }));
        wouldSend += 1;
        continue;
      }

      const lock = await params.prisma.appointmentReminder.updateMany({
        where: {
          id: reminder.id,
          clientId: client.id,
          status: "pending",
          sentAt: null,
          requestId: null,
        },
        data: {
          requestId: runId,
          metadata: buildMetadata(reminder, {
            sendRunId: runId,
            sendStartedAt: now.toISOString(),
            sendAttemptCount: readAttemptCount(reminder.metadata) + 1,
          }),
        },
      });
      if (lock.count !== 1) {
        const item = buildItem({ client, reminder, action: "skipped", reason: "already_processed" });
        items.push(item);
        skipped += 1;
        continue;
      }

      await recordReminderSendEvent({
        prisma: params.prisma,
        clientId: client.id,
        runId,
        eventName: "appointment.reminder.send_started",
        reminderId: reminder.id,
        appointmentId: reminder.appointmentId,
        payload: {
          channel: reminder.channel,
          templateConfigured: true,
        },
      });

      const result = await sender({
        toE164: eligibility.waId,
        waId: eligibility.waId,
        templateName: reminder.templateName ?? "",
        lang: reminder.templateLang ?? undefined,
        requestId: runId,
        rid: runId,
        messageId: `appointment.reminder.${reminder.id}`,
        clientId: client.id,
        clientKey: client.clientKey,
      });

      if (result.ok) {
        await params.prisma.appointmentReminder.update({
          where: { id: reminder.id },
          data: {
            status: "sent",
            sentAt: now,
            error: null,
            metadata: buildMetadata(reminder, {
              sendRunId: runId,
              sendAttemptCount: readAttemptCount(reminder.metadata) + 1,
              sentAt: now.toISOString(),
              metaMessageId: result.metaMessageId ?? null,
            }),
          },
        });
        await recordReminderSendEvent({
          prisma: params.prisma,
          clientId: client.id,
          runId,
          eventName: "appointment.reminder.sent",
          reminderId: reminder.id,
          appointmentId: reminder.appointmentId,
          payload: {
            channel: reminder.channel,
            providerStatus: result.status ?? null,
            metaMessageId: result.metaMessageId ?? null,
          },
        });
        items.push(
          buildItem({
            client,
            reminder,
            action: "sent",
            reason: "eligible",
            providerStatus: result.status,
            metaMessageId: result.metaMessageId,
          })
        );
        sent += 1;
      } else {
        const failureReason = result.errorBody || `provider_status_${result.status ?? "unknown"}`;
        await params.prisma.appointmentReminder.update({
          where: { id: reminder.id },
          data: {
            status: "failed",
            error: failureReason.slice(0, 1000),
            metadata: buildMetadata(reminder, {
              sendRunId: runId,
              sendAttemptCount: readAttemptCount(reminder.metadata) + 1,
              failedAt: now.toISOString(),
              failureReason: failureReason.slice(0, 500),
              providerStatus: result.status ?? null,
            }),
          },
        });
        await recordReminderSendEvent({
          prisma: params.prisma,
          clientId: client.id,
          runId,
          eventName: "appointment.reminder.failed",
          reminderId: reminder.id,
          appointmentId: reminder.appointmentId,
          payload: {
            channel: reminder.channel,
            providerStatus: result.status ?? null,
            reason: "provider_failed",
          },
        });
        items.push(
          buildItem({
            client,
            reminder,
            action: "failed",
            reason: "provider_failed",
            providerStatus: result.status,
          })
        );
        failed += 1;
      }
    }
  }

  return {
    ok: true,
    dryRun,
    execute: !dryRun,
    runId,
    now: now.toISOString(),
    tenant,
    checkedTenants: clients.length,
    scannedReminders,
    wouldSend,
    sent,
    failed,
    skipped,
    items,
  };
}
