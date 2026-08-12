import type { PrismaClient } from "@prisma/client";

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export type DepartmentBusinessHourInput = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export type DepartmentAvailabilityStatus = "OPEN" | "CLOSED" | "NO_SCHEDULE";

export type DepartmentAvailability = {
  status: DepartmentAvailabilityStatus;
  timezone: string;
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
    const sorted = [...group].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index].startMinute < sorted[index - 1].endMinute) {
        throw new DepartmentBusinessHoursValidationError(
          "overlapping_business_hours",
          "Business hour intervals cannot overlap."
        );
      }
    }
  }
}

export function getLocalWeekdayAndMinute(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
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
  return { weekday, minuteOfDay: hour * 60 + minute };
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
  const intervals = await prisma.departmentBusinessHour.findMany({
    where: { clientId: params.clientId, departmentId: params.departmentId },
    select: { weekday: true, startMinute: true, endMinute: true },
  });
  if (intervals.length === 0) return { status: "NO_SCHEDULE", timezone };

  const local = getLocalWeekdayAndMinute(params.at ?? new Date(), timezone);
  const isOpen = intervals.some(
    (interval) =>
      interval.weekday === local.weekday &&
      interval.startMinute <= local.minuteOfDay &&
      local.minuteOfDay < interval.endMinute
  );
  return { status: isOpen ? "OPEN" : "CLOSED", timezone };
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
