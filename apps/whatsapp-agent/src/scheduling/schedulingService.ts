import type { PrismaClient } from "@prisma/client";

export const SCHEDULING_ENTITY_STATUSES = ["active", "inactive", "archived"] as const;
export const APPOINTMENT_STATUSES = [
  "scheduled",
  "confirmed",
  "rescheduled",
  "cancelled",
  "completed",
  "no_show",
] as const;
export const APPOINTMENT_REMINDER_STATUSES = [
  "pending",
  "sent",
  "skipped",
  "failed",
  "cancelled",
  "expired",
] as const;
export const APPOINTMENT_REMINDER_KINDS = [
  "24h",
  "2h",
  "custom",
  "manual",
  "confirmation",
] as const;

export type SchedulingEntityStatus = (typeof SCHEDULING_ENTITY_STATUSES)[number];
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export type AppointmentReminderStatus = (typeof APPOINTMENT_REMINDER_STATUSES)[number];
export type AppointmentReminderKind = (typeof APPOINTMENT_REMINDER_KINDS)[number];

type JsonInput = Record<string, unknown>;

const MAX_NAME_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_TYPE_LENGTH = 60;
const MAX_TIMEZONE_LENGTH = 80;

function normalizeText(input: unknown, maxLength: number) {
  if (typeof input !== "string") return "";
  return input.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n").slice(0, maxLength);
}

function normalizeOptionalText(input: unknown, maxLength: number) {
  const value = normalizeText(input, maxLength);
  return value || null;
}

function normalizeOptionalId(input: unknown) {
  return typeof input === "string" && input.trim() ? input.trim() : null;
}

function normalizeInt(input: unknown, fallback: number, min: number, max: number) {
  const value = typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function normalizeBoolean(input: unknown, fallback = false) {
  return typeof input === "boolean" ? input : fallback;
}

function normalizeEntityStatus(input: unknown): SchedulingEntityStatus {
  return input === "inactive" || input === "archived" ? input : "active";
}

function normalizeAppointmentStatus(input: unknown): AppointmentStatus {
  return input === "confirmed" ||
    input === "rescheduled" ||
    input === "cancelled" ||
    input === "completed" ||
    input === "no_show"
    ? input
    : "scheduled";
}

function normalizeAppointmentReminderStatus(input: unknown): AppointmentReminderStatus {
  return input === "sent" ||
    input === "skipped" ||
    input === "failed" ||
    input === "cancelled" ||
    input === "expired"
    ? input
    : "pending";
}

function normalizeAppointmentReminderKind(input: unknown): AppointmentReminderKind {
  return input === "24h" ||
    input === "2h" ||
    input === "custom" ||
    input === "manual" ||
    input === "confirmation"
    ? input
    : "manual";
}

function normalizeWeekday(input: unknown) {
  return normalizeInt(input, 1, 0, 6);
}

function normalizeLocalTime(input: unknown) {
  const value = normalizeText(input, 8);
  return /^\d{2}:\d{2}$/.test(value) ? value : "";
}

function normalizeTimezone(input: unknown) {
  return normalizeText(input, MAX_TIMEZONE_LENGTH) || "America/Fortaleza";
}

function normalizeDate(input: unknown) {
  if (typeof input !== "string" && !(input instanceof Date)) return null;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

function serializeDate(date: Date | null | undefined) {
  return date ? date.toISOString() : null;
}

function serializeService(item: {
  id: string;
  departmentId: string | null;
  name: string;
  description: string | null;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  requiresApproval: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    departmentId: item.departmentId,
    name: item.name,
    description: item.description,
    durationMinutes: item.durationMinutes,
    bufferBeforeMinutes: item.bufferBeforeMinutes,
    bufferAfterMinutes: item.bufferAfterMinutes,
    requiresApproval: item.requiresApproval,
    status: normalizeEntityStatus(item.status),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function serializeResource(item: {
  id: string;
  departmentId: string | null;
  userId: string | null;
  name: string;
  description: string | null;
  type: string;
  capacity: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    departmentId: item.departmentId,
    userId: item.userId,
    name: item.name,
    description: item.description,
    type: item.type,
    capacity: item.capacity,
    status: normalizeEntityStatus(item.status),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function serializeAvailability(item: {
  id: string;
  serviceId: string | null;
  resourceId: string | null;
  weekday: number;
  startsAtLocal: string;
  endsAtLocal: string;
  timezone: string;
  status: string;
  effectiveFrom: Date | null;
  effectiveUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    serviceId: item.serviceId,
    resourceId: item.resourceId,
    weekday: item.weekday,
    startsAtLocal: item.startsAtLocal,
    endsAtLocal: item.endsAtLocal,
    timezone: item.timezone,
    status: normalizeEntityStatus(item.status),
    effectiveFrom: serializeDate(item.effectiveFrom),
    effectiveUntil: serializeDate(item.effectiveUntil),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function serializeAppointment(item: {
  id: string;
  serviceId: string | null;
  resourceId: string | null;
  departmentId: string | null;
  contactId: string | null;
  leadId: string | null;
  conversationId: string | null;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  status: string;
  source: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    serviceId: item.serviceId,
    resourceId: item.resourceId,
    departmentId: item.departmentId,
    contactId: item.contactId,
    leadId: item.leadId,
    conversationId: item.conversationId,
    title: item.title,
    description: item.description,
    startsAt: item.startsAt.toISOString(),
    endsAt: item.endsAt.toISOString(),
    timezone: item.timezone,
    status: normalizeAppointmentStatus(item.status),
    source: item.source,
    createdByUserId: item.createdByUserId,
    updatedByUserId: item.updatedByUserId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function serializeAppointmentReminder(item: {
  id: string;
  appointmentId: string;
  channel: string;
  kind: string;
  scheduledAt: Date;
  sentAt: Date | null;
  status: string;
  templateName: string | null;
  templateLang: string | null;
  requestId: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    appointmentId: item.appointmentId,
    channel: item.channel,
    kind: normalizeAppointmentReminderKind(item.kind),
    scheduledAt: item.scheduledAt.toISOString(),
    sentAt: serializeDate(item.sentAt),
    status: normalizeAppointmentReminderStatus(item.status),
    templateName: item.templateName,
    templateLang: item.templateLang,
    requestId: item.requestId,
    error: item.error,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

async function validateOptionalDepartment(prisma: PrismaClient, clientId: string, departmentId: string | null) {
  if (!departmentId) return true;
  const department = await prisma.department.findFirst({
    where: { id: departmentId, clientId },
    select: { id: true },
  });
  return Boolean(department);
}

async function validateOptionalUser(prisma: PrismaClient, clientId: string, userId: string | null) {
  if (!userId) return true;
  const user = await prisma.user.findFirst({
    where: { id: userId, clientId },
    select: { id: true },
  });
  return Boolean(user);
}

async function validateOptionalService(prisma: PrismaClient, clientId: string, serviceId: string | null) {
  if (!serviceId) return true;
  const service = await prisma.schedulingService.findFirst({
    where: { id: serviceId, clientId },
    select: { id: true },
  });
  return Boolean(service);
}

async function validateOptionalResource(prisma: PrismaClient, clientId: string, resourceId: string | null) {
  if (!resourceId) return true;
  const resource = await prisma.schedulingResource.findFirst({
    where: { id: resourceId, clientId },
    select: { id: true },
  });
  return Boolean(resource);
}

async function validateOptionalContact(prisma: PrismaClient, clientId: string, contactId: string | null) {
  if (!contactId) return true;
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, clientId },
    select: { id: true },
  });
  return Boolean(contact);
}

async function validateOptionalLead(prisma: PrismaClient, clientId: string, leadId: string | null) {
  if (!leadId) return true;
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, tenantId: clientId },
    select: { id: true },
  });
  return Boolean(lead);
}

async function validateOptionalConversation(prisma: PrismaClient, clientId: string, conversationId: string | null) {
  if (!conversationId) return true;
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, clientId },
    select: { id: true },
  });
  return Boolean(conversation);
}

async function validateAppointment(prisma: PrismaClient, clientId: string, appointmentId: string | null) {
  if (!appointmentId) return false;
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, clientId },
    select: { id: true },
  });
  return Boolean(appointment);
}

export async function listScheduling(params: { prisma: PrismaClient; clientId: string; includeReminders?: boolean }) {
  const [services, resources, availabilities, appointments, reminders] = await Promise.all([
    params.prisma.schedulingService.findMany({
      where: { clientId: params.clientId },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      take: 200,
    }),
    params.prisma.schedulingResource.findMany({
      where: { clientId: params.clientId },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      take: 200,
    }),
    params.prisma.schedulingAvailability.findMany({
      where: { clientId: params.clientId },
      orderBy: [{ status: "asc" }, { weekday: "asc" }, { startsAtLocal: "asc" }],
      take: 300,
    }),
    params.prisma.appointment.findMany({
      where: { clientId: params.clientId },
      orderBy: [{ startsAt: "desc" }],
      take: 200,
    }),
    params.includeReminders
      ? params.prisma.appointmentReminder.findMany({
          where: { clientId: params.clientId },
          orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
          take: 300,
        })
      : Promise.resolve([]),
  ]);
  return {
    services: services.map(serializeService),
    resources: resources.map(serializeResource),
    availabilities: availabilities.map(serializeAvailability),
    appointments: appointments.map(serializeAppointment),
    reminders: reminders.map(serializeAppointmentReminder),
  };
}

function buildServiceData(input: JsonInput) {
  const name = normalizeText(input.name, MAX_NAME_LENGTH);
  if (!name) return { ok: false as const, error: "service_name_required" };
  return {
    ok: true as const,
    data: {
      departmentId: normalizeOptionalId(input.departmentId),
      name,
      description: normalizeOptionalText(input.description, MAX_DESCRIPTION_LENGTH),
      durationMinutes: normalizeInt(input.durationMinutes, 30, 5, 1440),
      bufferBeforeMinutes: normalizeInt(input.bufferBeforeMinutes, 0, 0, 240),
      bufferAfterMinutes: normalizeInt(input.bufferAfterMinutes, 0, 0, 240),
      requiresApproval: normalizeBoolean(input.requiresApproval, false),
      status: normalizeEntityStatus(input.status),
    },
  };
}

export async function createSchedulingService(params: {
  prisma: PrismaClient;
  clientId: string;
  input: JsonInput;
}) {
  const normalized = buildServiceData(params.input);
  if (!normalized.ok) return normalized;
  if (!(await validateOptionalDepartment(params.prisma, params.clientId, normalized.data.departmentId))) {
    return { ok: false as const, error: "department_not_found" };
  }
  const service = await params.prisma.schedulingService.create({
    data: { clientId: params.clientId, ...normalized.data },
  });
  return { ok: true as const, service: serializeService(service) };
}

export async function updateSchedulingService(params: {
  prisma: PrismaClient;
  clientId: string;
  serviceId: string;
  input: JsonInput;
}) {
  const existing = await params.prisma.schedulingService.findFirst({
    where: { id: params.serviceId, clientId: params.clientId },
    select: { id: true },
  });
  if (!existing) return { ok: false as const, error: "service_not_found" };
  const normalized = buildServiceData(params.input);
  if (!normalized.ok) return normalized;
  if (!(await validateOptionalDepartment(params.prisma, params.clientId, normalized.data.departmentId))) {
    return { ok: false as const, error: "department_not_found" };
  }
  const service = await params.prisma.schedulingService.update({
    where: { id: existing.id },
    data: normalized.data,
  });
  return { ok: true as const, service: serializeService(service) };
}

function buildResourceData(input: JsonInput) {
  const name = normalizeText(input.name, MAX_NAME_LENGTH);
  if (!name) return { ok: false as const, error: "resource_name_required" };
  return {
    ok: true as const,
    data: {
      departmentId: normalizeOptionalId(input.departmentId),
      userId: normalizeOptionalId(input.userId),
      name,
      description: normalizeOptionalText(input.description, MAX_DESCRIPTION_LENGTH),
      type: normalizeText(input.type, MAX_TYPE_LENGTH) || "person",
      capacity: normalizeInt(input.capacity, 1, 1, 999),
      status: normalizeEntityStatus(input.status),
    },
  };
}

export async function createSchedulingResource(params: {
  prisma: PrismaClient;
  clientId: string;
  input: JsonInput;
}) {
  const normalized = buildResourceData(params.input);
  if (!normalized.ok) return normalized;
  if (!(await validateOptionalDepartment(params.prisma, params.clientId, normalized.data.departmentId))) {
    return { ok: false as const, error: "department_not_found" };
  }
  if (!(await validateOptionalUser(params.prisma, params.clientId, normalized.data.userId))) {
    return { ok: false as const, error: "user_not_found" };
  }
  const resource = await params.prisma.schedulingResource.create({
    data: { clientId: params.clientId, ...normalized.data },
  });
  return { ok: true as const, resource: serializeResource(resource) };
}

export async function updateSchedulingResource(params: {
  prisma: PrismaClient;
  clientId: string;
  resourceId: string;
  input: JsonInput;
}) {
  const existing = await params.prisma.schedulingResource.findFirst({
    where: { id: params.resourceId, clientId: params.clientId },
    select: { id: true },
  });
  if (!existing) return { ok: false as const, error: "resource_not_found" };
  const normalized = buildResourceData(params.input);
  if (!normalized.ok) return normalized;
  if (!(await validateOptionalDepartment(params.prisma, params.clientId, normalized.data.departmentId))) {
    return { ok: false as const, error: "department_not_found" };
  }
  if (!(await validateOptionalUser(params.prisma, params.clientId, normalized.data.userId))) {
    return { ok: false as const, error: "user_not_found" };
  }
  const resource = await params.prisma.schedulingResource.update({
    where: { id: existing.id },
    data: normalized.data,
  });
  return { ok: true as const, resource: serializeResource(resource) };
}

function buildAvailabilityData(input: JsonInput) {
  const startsAtLocal = normalizeLocalTime(input.startsAtLocal);
  const endsAtLocal = normalizeLocalTime(input.endsAtLocal);
  if (!startsAtLocal || !endsAtLocal) return { ok: false as const, error: "availability_time_required" };
  if (startsAtLocal >= endsAtLocal) return { ok: false as const, error: "availability_time_invalid" };
  return {
    ok: true as const,
    data: {
      serviceId: normalizeOptionalId(input.serviceId),
      resourceId: normalizeOptionalId(input.resourceId),
      weekday: normalizeWeekday(input.weekday),
      startsAtLocal,
      endsAtLocal,
      timezone: normalizeTimezone(input.timezone),
      status: normalizeEntityStatus(input.status),
      effectiveFrom: normalizeDate(input.effectiveFrom),
      effectiveUntil: normalizeDate(input.effectiveUntil),
    },
  };
}

export async function createSchedulingAvailability(params: {
  prisma: PrismaClient;
  clientId: string;
  input: JsonInput;
}) {
  const normalized = buildAvailabilityData(params.input);
  if (!normalized.ok) return normalized;
  if (!(await validateOptionalService(params.prisma, params.clientId, normalized.data.serviceId))) {
    return { ok: false as const, error: "service_not_found" };
  }
  if (!(await validateOptionalResource(params.prisma, params.clientId, normalized.data.resourceId))) {
    return { ok: false as const, error: "resource_not_found" };
  }
  const availability = await params.prisma.schedulingAvailability.create({
    data: { clientId: params.clientId, ...normalized.data },
  });
  return { ok: true as const, availability: serializeAvailability(availability) };
}

export async function updateSchedulingAvailability(params: {
  prisma: PrismaClient;
  clientId: string;
  availabilityId: string;
  input: JsonInput;
}) {
  const existing = await params.prisma.schedulingAvailability.findFirst({
    where: { id: params.availabilityId, clientId: params.clientId },
    select: { id: true },
  });
  if (!existing) return { ok: false as const, error: "availability_not_found" };
  const normalized = buildAvailabilityData(params.input);
  if (!normalized.ok) return normalized;
  if (!(await validateOptionalService(params.prisma, params.clientId, normalized.data.serviceId))) {
    return { ok: false as const, error: "service_not_found" };
  }
  if (!(await validateOptionalResource(params.prisma, params.clientId, normalized.data.resourceId))) {
    return { ok: false as const, error: "resource_not_found" };
  }
  const availability = await params.prisma.schedulingAvailability.update({
    where: { id: existing.id },
    data: normalized.data,
  });
  return { ok: true as const, availability: serializeAvailability(availability) };
}

function buildAppointmentData(input: JsonInput) {
  const title = normalizeText(input.title, MAX_NAME_LENGTH);
  if (!title) return { ok: false as const, error: "appointment_title_required" };
  const startsAt = normalizeDate(input.startsAt);
  const endsAt = normalizeDate(input.endsAt);
  if (!startsAt || !endsAt) return { ok: false as const, error: "appointment_time_required" };
  if (startsAt.getTime() >= endsAt.getTime()) return { ok: false as const, error: "appointment_time_invalid" };
  return {
    ok: true as const,
    data: {
      serviceId: normalizeOptionalId(input.serviceId),
      resourceId: normalizeOptionalId(input.resourceId),
      departmentId: normalizeOptionalId(input.departmentId),
      contactId: normalizeOptionalId(input.contactId),
      leadId: normalizeOptionalId(input.leadId),
      conversationId: normalizeOptionalId(input.conversationId),
      title,
      description: normalizeOptionalText(input.description, MAX_DESCRIPTION_LENGTH),
      startsAt,
      endsAt,
      timezone: normalizeTimezone(input.timezone),
      status: normalizeAppointmentStatus(input.status),
      source: normalizeText(input.source, MAX_TYPE_LENGTH) || "manual",
    },
  };
}

async function validateAppointmentReferences(prisma: PrismaClient, clientId: string, data: {
  serviceId: string | null;
  resourceId: string | null;
  departmentId: string | null;
  contactId: string | null;
  leadId: string | null;
  conversationId: string | null;
}) {
  if (!(await validateOptionalService(prisma, clientId, data.serviceId))) return "service_not_found";
  if (!(await validateOptionalResource(prisma, clientId, data.resourceId))) return "resource_not_found";
  if (!(await validateOptionalDepartment(prisma, clientId, data.departmentId))) return "department_not_found";
  if (!(await validateOptionalContact(prisma, clientId, data.contactId))) return "contact_not_found";
  if (!(await validateOptionalLead(prisma, clientId, data.leadId))) return "lead_not_found";
  if (!(await validateOptionalConversation(prisma, clientId, data.conversationId))) return "conversation_not_found";
  return null;
}

export async function createAppointment(params: {
  prisma: PrismaClient;
  clientId: string;
  userId: string;
  input: JsonInput;
}) {
  const normalized = buildAppointmentData(params.input);
  if (!normalized.ok) return normalized;
  const referenceError = await validateAppointmentReferences(params.prisma, params.clientId, normalized.data);
  if (referenceError) return { ok: false as const, error: referenceError };
  const appointment = await params.prisma.appointment.create({
    data: {
      clientId: params.clientId,
      ...normalized.data,
      createdByUserId: params.userId,
      updatedByUserId: params.userId,
    },
  });
  return { ok: true as const, appointment: serializeAppointment(appointment) };
}

export async function updateAppointment(params: {
  prisma: PrismaClient;
  clientId: string;
  userId: string;
  appointmentId: string;
  input: JsonInput;
}) {
  const existing = await params.prisma.appointment.findFirst({
    where: { id: params.appointmentId, clientId: params.clientId },
    select: { id: true },
  });
  if (!existing) return { ok: false as const, error: "appointment_not_found" };
  const normalized = buildAppointmentData(params.input);
  if (!normalized.ok) return normalized;
  const referenceError = await validateAppointmentReferences(params.prisma, params.clientId, normalized.data);
  if (referenceError) return { ok: false as const, error: referenceError };
  const appointment = await params.prisma.appointment.update({
    where: { id: existing.id },
    data: {
      ...normalized.data,
      updatedByUserId: params.userId,
    },
  });
  return { ok: true as const, appointment: serializeAppointment(appointment) };
}

function buildAppointmentReminderData(input: JsonInput) {
  const appointmentId = normalizeOptionalId(input.appointmentId);
  if (!appointmentId) return { ok: false as const, error: "appointment_required" };
  const scheduledAt = normalizeDate(input.scheduledAt);
  if (!scheduledAt) return { ok: false as const, error: "reminder_scheduled_at_required" };
  const sentAt = normalizeDate(input.sentAt);
  return {
    ok: true as const,
    data: {
      appointmentId,
      channel: normalizeText(input.channel, MAX_TYPE_LENGTH) || "whatsapp",
      kind: normalizeAppointmentReminderKind(input.kind),
      scheduledAt,
      sentAt,
      status: normalizeAppointmentReminderStatus(input.status),
      templateName: normalizeOptionalText(input.templateName, MAX_NAME_LENGTH),
      templateLang: normalizeOptionalText(input.templateLang, 16),
      requestId: normalizeOptionalText(input.requestId, 160),
      error: normalizeOptionalText(input.error, 1000),
    },
  };
}

export async function createAppointmentReminder(params: {
  prisma: PrismaClient;
  clientId: string;
  input: JsonInput;
}) {
  const normalized = buildAppointmentReminderData(params.input);
  if (!normalized.ok) return normalized;
  if (!(await validateAppointment(params.prisma, params.clientId, normalized.data.appointmentId))) {
    return { ok: false as const, error: "appointment_not_found" };
  }
  const reminder = await params.prisma.appointmentReminder.create({
    data: {
      clientId: params.clientId,
      ...normalized.data,
    },
  });
  return { ok: true as const, reminder: serializeAppointmentReminder(reminder) };
}

export async function updateAppointmentReminder(params: {
  prisma: PrismaClient;
  clientId: string;
  reminderId: string;
  input: JsonInput;
}) {
  const existing = await params.prisma.appointmentReminder.findFirst({
    where: { id: params.reminderId, clientId: params.clientId },
    select: { id: true },
  });
  if (!existing) return { ok: false as const, error: "reminder_not_found" };
  const normalized = buildAppointmentReminderData(params.input);
  if (!normalized.ok) return normalized;
  if (!(await validateAppointment(params.prisma, params.clientId, normalized.data.appointmentId))) {
    return { ok: false as const, error: "appointment_not_found" };
  }
  const reminder = await params.prisma.appointmentReminder.update({
    where: { id: existing.id },
    data: normalized.data,
  });
  return { ok: true as const, reminder: serializeAppointmentReminder(reminder) };
}
