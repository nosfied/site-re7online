import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export type DepartmentBusinessHourInput = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export type DepartmentBusinessHourExceptionType = "CLOSED" | "CUSTOM_HOURS";

export type DepartmentBusinessHourExceptionInput = {
  date: string;
  type: DepartmentBusinessHourExceptionType;
  reason?: string | null;
  intervals?: Array<{ startMinute: number; endMinute: number }> | null;
};

export type DepartmentAvailabilityStatus = "OPEN" | "CLOSED" | "NO_SCHEDULE";

export type DepartmentAvailability = {
  status: DepartmentAvailabilityStatus;
  timezone: string;
  reason: "REGULAR_SCHEDULE" | "EXCEPTION" | "NO_SCHEDULE";
  exception?: {
    date: string;
    type: DepartmentBusinessHourExceptionType;
    reason: string | null;
  } | null;
};

export class DepartmentBusinessHoursValidationError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "DepartmentBusinessHoursValidationError";
    this.code = code;
    this.status = status;
  }
}

export function normalizeTenantTimezone(value: unknown) {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : "America/Fortaleza";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "America/Fortaleza";
  }
}

export function parseDepartmentBusinessHoursInput(value: unknown): DepartmentBusinessHourInput[] {
  if (!Array.isArray(value)) {
    throw new DepartmentBusinessHoursValidationError("invalid_business_hours", "Business hours must be a list.");
  }
  const intervals = value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new DepartmentBusinessHoursValidationError("invalid_business_hours", "Invalid business hour interval.");
    }
    const record = item as Record<string, unknown>;
    const weekday = Number(record.weekday);
    const startMinute = Number(record.startMinute);
    const endMinute = Number(record.endMinute);
    return { weekday, startMinute, endMinute };
  });
  validateDepartmentBusinessHours(intervals);
  return intervals;
}

function parseTimeIntervals(value: unknown): Array<{ startMinute: number; endMinute: number }> {
  if (!Array.isArray(value)) return [];
  const intervals = value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new DepartmentBusinessHoursValidationError("invalid_business_hour_exception", "Invalid exception interval.");
    }
    const record = item as Record<string, unknown>;
    return {
      startMinute: Number(record.startMinute),
      endMinute: Number(record.endMinute),
    };
  });
  validateSingleDayIntervals(intervals);
  return intervals;
}

export function parseDepartmentBusinessHourExceptionsInput(value: unknown): DepartmentBusinessHourExceptionInput[] {
  if (!Array.isArray(value)) {
    throw new DepartmentBusinessHoursValidationError(
      "invalid_business_hour_exceptions",
      "Business hour exceptions must be a list."
    );
  }
  const exceptions = value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new DepartmentBusinessHoursValidationError(
        "invalid_business_hour_exception",
        "Invalid business hour exception."
      );
    }
    const record = item as Record<string, unknown>;
    const date = typeof record.date === "string" ? record.date.trim() : "";
    const type = typeof record.type === "string" ? record.type.trim().toUpperCase() : "";
    const reason = typeof record.reason === "string" && record.reason.trim()
      ? record.reason.trim().slice(0, 160)
      : null;
    const intervals = parseTimeIntervals(record.intervals);
    return { date, type, reason, intervals } as DepartmentBusinessHourExceptionInput;
  });
  validateDepartmentBusinessHourExceptions(exceptions);
  return exceptions;
}

export function validateDepartmentBusinessHours(intervals: DepartmentBusinessHourInput[]) {
  const byWeekday = new Map<number, DepartmentBusinessHourInput[]>();
  for (const interval of intervals) {
    if (!Number.isInteger(interval.weekday) || interval.weekday < 0 || interval.weekday > 6) {
      throw new DepartmentBusinessHoursValidationError("invalid_weekday", "Weekday must be between 0 and 6.");
    }
    if (
      !Number.isInteger(interval.startMinute) ||
      !Number.isInteger(interval.endMinute) ||
      interval.startMinute < 0 ||
      interval.endMinute > 1440 ||
      interval.startMinute >= interval.endMinute
    ) {
      throw new DepartmentBusinessHoursValidationError(
        "invalid_business_hour_interval",
        "Business hour intervals must be inside one day and start before end."
      );
    }
    const group = byWeekday.get(interval.weekday) ?? [];
    group.push(interval);
    byWeekday.set(interval.weekday, group);
  }

  for (const group of byWeekday.values()) {
    validateSingleDayIntervals(group);
  }
}

function validateSingleDayIntervals(intervals: Array<{ startMinute: number; endMinute: number }>) {
  const sorted = [...intervals].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
  for (const interval of sorted) {
    if (
      !Number.isInteger(interval.startMinute) ||
      !Number.isInteger(interval.endMinute) ||
      interval.startMinute < 0 ||
      interval.endMinute > 1440 ||
      interval.startMinute >= interval.endMinute
    ) {
      throw new DepartmentBusinessHoursValidationError(
        "invalid_business_hour_interval",
        "Business hour intervals must be inside one day and start before end."
      );
    }
  }
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].startMinute < sorted[index - 1].endMinute) {
      throw new DepartmentBusinessHoursValidationError(
        "overlapping_business_hours",
        "Business hour intervals cannot overlap."
      );
    }
  }
}

export function validateDepartmentBusinessHourExceptions(exceptions: DepartmentBusinessHourExceptionInput[]) {
  const seenDates = new Set<string>();
  for (const exception of exceptions) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exception.date)) {
      throw new DepartmentBusinessHoursValidationError("invalid_exception_date", "Exception date must use YYYY-MM-DD.");
    }
    if (seenDates.has(exception.date)) {
      throw new DepartmentBusinessHoursValidationError(
        "duplicate_exception_date",
        "Only one exception is allowed per department and date."
      );
    }
    seenDates.add(exception.date);
    if (exception.type !== "CLOSED" && exception.type !== "CUSTOM_HOURS") {
      throw new DepartmentBusinessHoursValidationError(
        "invalid_exception_type",
        "Exception type must be CLOSED or CUSTOM_HOURS."
      );
    }
    const intervals = exception.intervals ?? [];
    if (exception.type === "CLOSED" && intervals.length > 0) {
      throw new DepartmentBusinessHoursValidationError(
        "closed_exception_with_hours",
        "Closed-day exceptions cannot include intervals."
      );
    }
    if (exception.type === "CUSTOM_HOURS" && intervals.length === 0) {
      throw new DepartmentBusinessHoursValidationError(
        "custom_hours_without_intervals",
        "Custom-hours exceptions must include at least one interval."
      );
    }
    validateSingleDayIntervals(intervals);
  }
}

export function getLocalWeekdayAndMinute(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayNames: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayNames[value.weekday ?? ""] ?? 0;
  const hour = Number(value.hour === "24" ? "0" : value.hour);
  const minute = Number(value.minute);
  const dateKey = `${value.year}-${value.month}-${value.day}`;
  return { weekday, minuteOfDay: hour * 60 + minute, dateKey };
}

export async function resolveTenantOperationalTimezone(prisma: PrismaClient, clientId: string) {
  const record = await prisma.tenantOperationalConfig.findUnique({
    where: { clientId },
    select: { config: true },
  });
  const config = record?.config && typeof record.config === "object" && !Array.isArray(record.config) ? record.config as Record<string, unknown> : {};
  return normalizeTenantTimezone(config.timezone);
}

export async function getDepartmentAvailability(
  prisma: PrismaClient,
  params: {
    clientId: string;
    departmentId: string;
    at?: Date;
  }
): Promise<DepartmentAvailability> {
  const timezone = await resolveTenantOperationalTimezone(prisma, params.clientId);
  const local = getLocalWeekdayAndMinute(params.at ?? new Date(), timezone);
  const exceptionDelegate = (prisma as unknown as { departmentBusinessHourException?: {
    findUnique: (args: {
      where: {
        clientId_departmentId_date: {
          clientId: string;
          departmentId: string;
          date: string;
        };
      };
      select: { date: true; type: true; reason: true; intervals: true };
    }) => Promise<{ date: string; type: string; reason: string | null; intervals: unknown } | null>;
  } }).departmentBusinessHourException;
  const exception = exceptionDelegate
    ? await exceptionDelegate.findUnique({
      where: {
        clientId_departmentId_date: {
          clientId: params.clientId,
          departmentId: params.departmentId,
          date: local.dateKey,
        },
      },
      select: { date: true, type: true, reason: true, intervals: true },
    })
    : null;
  if (exception) {
    const type = exception.type === "CUSTOM_HOURS" ? "CUSTOM_HOURS" : "CLOSED";
    const intervals = type === "CUSTOM_HOURS" ? parseTimeIntervals(exception.intervals) : [];
    const isOpen = intervals.some(
      (interval) => interval.startMinute <= local.minuteOfDay && local.minuteOfDay < interval.endMinute
    );
    return {
      status: isOpen ? "OPEN" : "CLOSED",
      timezone,
      reason: "EXCEPTION",
      exception: { date: exception.date, type, reason: exception.reason },
    };
  }

  const intervals = await prisma.departmentBusinessHour.findMany({
    where: { clientId: params.clientId, departmentId: params.departmentId },
    select: { weekday: true, startMinute: true, endMinute: true },
  });
  if (intervals.length === 0) return { status: "NO_SCHEDULE", timezone, reason: "NO_SCHEDULE", exception: null };

  const isOpen = intervals.some(
    (interval) =>
      interval.weekday === local.weekday &&
      interval.startMinute <= local.minuteOfDay &&
      local.minuteOfDay < interval.endMinute
  );
  return { status: isOpen ? "OPEN" : "CLOSED", timezone, reason: "REGULAR_SCHEDULE", exception: null };
}

export async function replaceDepartmentBusinessHours(
  prisma: PrismaClient,
  params: {
    clientId: string;
    departmentId: string;
    intervals: DepartmentBusinessHourInput[];
  }
) {
  validateDepartmentBusinessHours(params.intervals);
  const department = await prisma.department.findFirst({
    where: { id: params.departmentId, clientId: params.clientId },
    select: { id: true },
  });
  if (!department) {
    throw new DepartmentBusinessHoursValidationError("department_not_found", "Department not found.", 404);
  }
  return prisma.$transaction(async (tx) => {
    await tx.departmentBusinessHour.deleteMany({
      where: { clientId: params.clientId, departmentId: params.departmentId },
    });
    if (params.intervals.length > 0) {
      await tx.departmentBusinessHour.createMany({
        data: params.intervals.map((interval) => ({
          clientId: params.clientId,
          departmentId: params.departmentId,
          weekday: interval.weekday,
          startMinute: interval.startMinute,
          endMinute: interval.endMinute,
        })),
      });
    }
    return tx.departmentBusinessHour.findMany({
      where: { clientId: params.clientId, departmentId: params.departmentId },
      orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
      select: { id: true, weekday: true, startMinute: true, endMinute: true },
    });
  });
}

export async function replaceDepartmentBusinessHourExceptions(
  prisma: PrismaClient,
  params: {
    clientId: string;
    departmentId: string;
    exceptions: DepartmentBusinessHourExceptionInput[];
  }
) {
  validateDepartmentBusinessHourExceptions(params.exceptions);
  const department = await prisma.department.findFirst({
    where: { id: params.departmentId, clientId: params.clientId },
    select: { id: true },
  });
  if (!department) {
    throw new DepartmentBusinessHoursValidationError("department_not_found", "Department not found.", 404);
  }
  return prisma.$transaction(async (tx) => {
    await tx.departmentBusinessHourException.deleteMany({
      where: { clientId: params.clientId, departmentId: params.departmentId },
    });
    if (params.exceptions.length > 0) {
      await tx.departmentBusinessHourException.createMany({
        data: params.exceptions.map((exception) => ({
          clientId: params.clientId,
          departmentId: params.departmentId,
          date: exception.date,
          type: exception.type,
          reason: exception.reason ?? null,
          intervals: exception.type === "CUSTOM_HOURS"
            ? (exception.intervals ?? []) as Prisma.InputJsonValue
            : Prisma.JsonNull,
        })),
      });
    }
    return tx.departmentBusinessHourException.findMany({
      where: { clientId: params.clientId, departmentId: params.departmentId },
      orderBy: [{ date: "asc" }],
      select: { id: true, date: true, type: true, reason: true, intervals: true },
    });
  });
}

function addDaysUtc(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map((item) => Number(item));
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function getWeekdayForDateKey(dateKey: string, timezone: string) {
  return getLocalWeekdayAndMinute(localDateMinuteToUtc(dateKey, 720, timezone), timezone).weekday;
}

function getTimezoneOffsetMs(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(value.year),
    Number(value.month) - 1,
    Number(value.day),
    Number(value.hour === "24" ? "0" : value.hour),
    Number(value.minute),
    Number(value.second)
  );
  return asUtc - date.getTime();
}

export function localDateMinuteToUtc(dateKey: string, minuteOfDay: number, timezone: string) {
  const [year, month, day] = dateKey.split("-").map((item) => Number(item));
  const utcGuess = new Date(Date.UTC(year, month - 1, day, Math.floor(minuteOfDay / 60), minuteOfDay % 60));
  const offset = getTimezoneOffsetMs(utcGuess, timezone);
  const adjusted = new Date(utcGuess.getTime() - offset);
  const adjustedOffset = getTimezoneOffsetMs(adjusted, timezone);
  return new Date(utcGuess.getTime() - adjustedOffset);
}

export async function getNextDepartmentOpenAt(
  prisma: PrismaClient,
  params: {
    clientId: string;
    departmentId: string;
    after: Date;
    maxDays?: number;
  }
) {
  const timezone = await resolveTenantOperationalTimezone(prisma, params.clientId);
  const local = getLocalWeekdayAndMinute(params.after, timezone);
  const weeklyIntervals = await prisma.departmentBusinessHour.findMany({
    where: { clientId: params.clientId, departmentId: params.departmentId },
    select: { weekday: true, startMinute: true, endMinute: true },
  });
  const horizon = params.maxDays ?? 45;
  const dateKeys = Array.from({ length: horizon + 1 }, (_, index) => addDaysUtc(local.dateKey, index));
  const exceptions = await prisma.departmentBusinessHourException.findMany({
    where: { clientId: params.clientId, departmentId: params.departmentId, date: { in: dateKeys } },
    select: { date: true, type: true, intervals: true },
  });
  const exceptionByDate = new Map(exceptions.map((exception) => [exception.date, exception]));

  for (let dayOffset = 0; dayOffset <= horizon; dayOffset += 1) {
    const dateKey = dateKeys[dayOffset];
    const exception = exceptionByDate.get(dateKey);
    const intervals = exception
      ? exception.type === "CUSTOM_HOURS"
        ? parseTimeIntervals(exception.intervals)
        : []
      : weeklyIntervals
          .filter((interval) => interval.weekday === getWeekdayForDateKey(dateKey, timezone))
          .map((interval) => ({ startMinute: interval.startMinute, endMinute: interval.endMinute }));
    const sorted = intervals.sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
    for (const interval of sorted) {
      if (dayOffset === 0 && interval.endMinute <= local.minuteOfDay) continue;
      const startMinute = dayOffset === 0 && interval.startMinute < local.minuteOfDay
        ? local.minuteOfDay
        : interval.startMinute;
      return {
        at: localDateMinuteToUtc(dateKey, startMinute, timezone),
        date: dateKey,
        startMinute,
        timezone,
        source: exception ? "EXCEPTION" as const : "REGULAR_SCHEDULE" as const,
      };
    }
  }
  return null;
}
