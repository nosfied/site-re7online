"use client";

import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppSession,
  clearAppSession,
  createAppDepartment,
  fetchAppDepartments,
  loadAppSession,
  saveAppSession,
  updateAppDepartment,
} from "@/lib/appClientApi";
import { AdminDepartmentItem, formatDateTime } from "@/lib/whatsappAdminApi";

function canAccessDepartments(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function canManageDepartments(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

const WEEKDAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
];

const WEEKDAY_SHORT_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DEFAULT_BUSINESS_HOUR_INTERVAL = { startMinute: 8 * 60, endMinute: 17 * 60 };

type BusinessHourDraft = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

type BusinessHourExceptionDraft = {
  date: string;
  type: "CLOSED" | "CUSTOM_HOURS";
  reason: string;
  intervals: Array<{ startMinute: number; endMinute: number }>;
  departmentIds: string[];
  originalDate?: string;
};

type HoursEditorDraft = {
  departmentId: string;
  weekdays: number[];
  intervals: Array<{ startMinute: number; endMinute: number }>;
};

function minutesToTime(value: number) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map((item) => Number(item));
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return 0;
  return Math.max(0, Math.min(1440, hour * 60 + minute));
}

function getIntervalsForWeekday(hours: BusinessHourDraft[], weekday: number) {
  return hours
    .filter((hour) => hour.weekday === weekday)
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute)
    .map((hour) => ({ startMinute: hour.startMinute, endMinute: hour.endMinute }));
}

function getIntervalSignature(intervals: Array<{ startMinute: number; endMinute: number }>) {
  if (intervals.length === 0) return "closed";
  return intervals.map((hour) => `${hour.startMinute}-${hour.endMinute}`).join("|");
}

function formatIntervals(intervals: Array<{ startMinute: number; endMinute: number }>) {
  if (intervals.length === 0) return "Fechado";
  return intervals.map((hour) => `${minutesToTime(hour.startMinute)} — ${minutesToTime(hour.endMinute)}`).join(" / ");
}

function formatExceptionType(type: string) {
  return type === "CUSTOM_HOURS" ? "Horário especial" : "Fechado o dia inteiro";
}

function normalizeExceptionIntervals(
  intervals: Array<{ startMinute: number; endMinute: number }> | null | undefined
) {
  return Array.isArray(intervals)
    ? intervals.map((interval) => ({
        startMinute: Number(interval.startMinute),
        endMinute: Number(interval.endMinute),
      }))
    : [];
}

function normalizeExceptionPayload(
  item: NonNullable<AdminDepartmentItem["businessHourExceptions"]>[number]
): {
  date: string;
  type: "CLOSED" | "CUSTOM_HOURS";
  reason?: string | null;
  intervals?: Array<{ startMinute: number; endMinute: number }> | null;
} {
  const type = item.type === "CUSTOM_HOURS" ? "CUSTOM_HOURS" : "CLOSED";
  return {
    date: item.date,
    type,
    reason: item.reason ?? null,
    intervals: type === "CUSTOM_HOURS" ? normalizeExceptionIntervals(item.intervals) : [],
  };
}

function formatWeekdayGroup(days: number[]) {
  const sorted = [...days].sort((a, b) => a - b);
  const ranges: string[] = [];
  let index = 0;
  while (index < sorted.length) {
    const start = sorted[index];
    let end = start;
    while (index + 1 < sorted.length && sorted[index + 1] === end + 1) {
      index += 1;
      end = sorted[index];
    }
    ranges.push(start === end ? WEEKDAY_SHORT_LABELS[start] : `${WEEKDAY_SHORT_LABELS[start]}–${WEEKDAY_SHORT_LABELS[end]}`);
    index += 1;
  }
  return ranges.join(", ");
}

function buildBusinessHourGroups(hours: BusinessHourDraft[]) {
  const groups = new Map<string, { weekdays: number[]; intervals: Array<{ startMinute: number; endMinute: number }> }>();
  for (const weekday of WEEKDAYS.map((item) => item.value)) {
    const intervals = getIntervalsForWeekday(hours, weekday);
    const signature = getIntervalSignature(intervals);
    const current = groups.get(signature);
    if (current) {
      current.weekdays.push(weekday);
    } else {
      groups.set(signature, { weekdays: [weekday], intervals });
    }
  }
  return [...groups.values()].sort((a, b) => a.weekdays[0] - b.weekdays[0]);
}

function validateEditorIntervals(intervals: Array<{ startMinute: number; endMinute: number }>) {
  const sorted = [...intervals].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
  for (const interval of sorted) {
    if (interval.startMinute < 0 || interval.endMinute > 1440 || interval.startMinute >= interval.endMinute) {
      return "Cada período precisa ter início antes do fim.";
    }
  }
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].startMinute < sorted[index - 1].endMinute) {
      return "Os períodos do mesmo dia não podem se sobrepor.";
    }
  }
  return null;
}

function validateExceptionDraft(draft: BusinessHourExceptionDraft) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
    return "Informe a data da exceção.";
  }
  const uniqueDepartments = new Set(draft.departmentIds);
  if (uniqueDepartments.size === 0) {
    return "Selecione pelo menos um setor.";
  }
  if (uniqueDepartments.size !== draft.departmentIds.length) {
    return "Remova setores repetidos antes de salvar.";
  }
  if (draft.type === "CUSTOM_HOURS") {
    if (draft.intervals.length === 0) return "Adicione pelo menos um intervalo para horário especial.";
    return validateEditorIntervals(draft.intervals);
  }
  return null;
}

function DepartmentBadge({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
      : tone === "warning"
        ? "border-amber-300/30 bg-amber-500/15 text-amber-100"
        : "border-white/15 bg-white/5 text-white/80";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneClass}`}>
      {label}
    </span>
  );
}

function ActionIcon({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-4 w-4 items-center justify-center text-sm">{children}</span>;
}

function normalizeDepartmentError(error: AppApiError, fallback: string) {
  if (error.errorCode === "department_slug_conflict" || error.status === 409) {
    return "Já existe um setor equivalente nesta organização.";
  }
  if (error.errorCode === "bad_request") {
    return error.message || fallback;
  }
  if (
    error.errorCode === "invalid_business_hour_exceptions" ||
    error.errorCode === "invalid_business_hour_exception" ||
    error.errorCode === "invalid_exception_date"
  ) {
    return "Confira a data e os dados da exceção de horário.";
  }
  if (error.errorCode === "duplicate_exception_date") {
    return "Já existe uma exceção para esta data neste setor.";
  }
  if (
    error.errorCode === "invalid_exception_type" ||
    error.errorCode === "closed_exception_with_hours" ||
    error.errorCode === "custom_hours_without_intervals"
  ) {
    return "Escolha se o dia ficará fechado ou se terá horário especial.";
  }
  if (
    error.errorCode === "invalid_business_hour_interval" ||
    error.errorCode === "overlapping_business_hours"
  ) {
    return "Confira os intervalos: o início precisa ser antes do fim e os horários não podem se sobrepor.";
  }
  if (error.status === 403) {
    return "Sem permissão para gerenciar setores.";
  }
  return error.message || fallback;
}

export default function AppSettingsDepartmentsPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [departments, setDepartments] = useState<AdminDepartmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("America/Fortaleza");
  const [drafts, setDrafts] = useState<
    Record<string, { name: string; isActive: boolean; businessHours: BusinessHourDraft[] }>
  >({});
  const [hoursEditor, setHoursEditor] = useState<HoursEditorDraft | null>(null);
  const [exceptionEditor, setExceptionEditor] = useState<BusinessHourExceptionDraft | null>(null);
  const [savingExceptions, setSavingExceptions] = useState(false);

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const hydrateDepartments = useCallback((items: AdminDepartmentItem[]) => {
    setDepartments(items);
    setDrafts(
      Object.fromEntries(
        items.map((item) => [
          item.id,
          {
            name: item.name,
            isActive: item.isActive,
            businessHours: (item.businessHours ?? []).map((hour) => ({
              weekday: hour.weekday,
              startMinute: hour.startMinute,
              endMinute: hour.endMinute,
            })),
          },
        ])
      )
    );
  }, []);

  const loadDepartments = useCallback(
    async (activeSession: AppSession) => {
      const response = await fetchAppDepartments(activeSession, {
        includeInactive: canManageDepartments(activeSession.user.role),
      });
      if (response.timezone) setTimezone(response.timezone);
      hydrateDepartments(response.items);
    },
    [hydrateDepartments]
  );

  const loadDepartmentsPreservingContext = useCallback(
    async (activeSession: AppSession, departmentId?: string | null) => {
      const anchorId = departmentId ? `department-card-${departmentId}` : "";
      const anchorBefore = anchorId ? document.getElementById(anchorId) : null;
      const topBefore = anchorBefore?.getBoundingClientRect().top ?? null;
      const scrollBefore = window.scrollY;
      await loadDepartments(activeSession);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const anchorAfter = anchorId ? document.getElementById(anchorId) : null;
          if (anchorAfter && topBefore !== null) {
            const topAfter = anchorAfter.getBoundingClientRect().top;
            window.scrollTo({ top: window.scrollY + topAfter - topBefore });
            return;
          }
          window.scrollTo({ top: scrollBefore });
        });
      });
    },
    [loadDepartments]
  );

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    if (!canAccessDepartments(stored.user.role)) {
      router.replace("/app/inbox");
      return;
    }
    setSession(stored);
    saveAppSession(stored);
  }, [router]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadDepartments(session)
      .catch((err) => {
        if (cancelled) return;
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        if (typed.status === 403) {
          router.replace("/app/inbox");
          return;
        }
        setError(normalizeDepartmentError(typed, "Não foi possível carregar os setores."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, loadDepartments, router, session]);

  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || success), () => {
      setError(null);
      setSuccess(null);
    });

  const sortedDepartments = useMemo(
    () =>
      [...departments].sort((a, b) => {
        const createdDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (createdDiff !== 0) return createdDiff;
        return a.name.localeCompare(b.name, "pt-BR");
      }),
    [departments]
  );
  const activeDepartmentCount = useMemo(
    () => departments.filter((item) => item.isActive).length,
    [departments]
  );
  const inactiveDepartmentCount = departments.length - activeDepartmentCount;

  const handleCreate = async () => {
    if (!session) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Informe o nome do setor.");
      return;
    }
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      await createAppDepartment(session, { name: trimmedName, isActive: true });
      setName("");
      await loadDepartmentsPreservingContext(session);
      setSuccess(`Setor "${trimmedName}" criado com sucesso.`);
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(normalizeDepartmentError(typed, "Não foi possível criar o setor."));
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (item: AdminDepartmentItem, nextIsActive?: boolean) => {
    if (!session) return;
    const draft = drafts[item.id];
    if (!draft) return;
    const nextName = draft.name.trim();
    if (!nextName) {
      setError("Informe o nome do setor.");
      return;
    }
    if (typeof nextIsActive === "boolean") {
      setTogglingId(item.id);
    } else {
      setSavingId(item.id);
    }
    setError(null);
    setSuccess(null);
    try {
      await updateAppDepartment(session, item.id, {
        name: nextName,
        isActive: typeof nextIsActive === "boolean" ? nextIsActive : draft.isActive,
        businessHours: draft.businessHours,
      });
      await loadDepartmentsPreservingContext(session, item.id);
      if (typeof nextIsActive === "boolean") {
        setSuccess(`Setor ${nextIsActive ? "ativado" : "desativado"} com sucesso.`);
      } else {
        setSuccess("Setor atualizado com sucesso.");
      }
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(
        normalizeDepartmentError(
          typed,
          typeof nextIsActive === "boolean" ? "Não foi possível atualizar o setor." : "Não foi possível salvar o setor."
        )
      );
    } finally {
      setSavingId(null);
      setTogglingId(null);
    }
  };

  const openHoursEditor = (
    departmentId: string,
    options?: { weekdays?: number[]; intervals?: Array<{ startMinute: number; endMinute: number }> }
  ) => {
    const draft = drafts[departmentId];
    if (!draft) return;
    setHoursEditor({
      departmentId,
      weekdays: options?.weekdays?.length ? [...options.weekdays] : [1, 2, 3, 4, 5],
      intervals: options?.intervals
        ? options.intervals.map((interval) => ({ ...interval }))
        : [{ ...DEFAULT_BUSINESS_HOUR_INTERVAL }],
    });
  };

  const updateHoursEditorInterval = (
    index: number,
    field: "startMinute" | "endMinute",
    value: number
  ) => {
    setHoursEditor((current) => {
      if (!current) return current;
      const intervals = [...current.intervals];
      intervals[index] = { ...intervals[index], [field]: value };
      return { ...current, intervals };
    });
  };

  const applyHoursEditor = () => {
    if (!hoursEditor) return;
    if (hoursEditor.weekdays.length === 0) {
      setError("Selecione pelo menos um dia.");
      return;
    }
    const validationError = validateEditorIntervals(hoursEditor.intervals);
    if (validationError) {
      setError(validationError);
      return;
    }
    setDrafts((current) => {
      const draft = current[hoursEditor.departmentId];
      if (!draft) return current;
      const selected = new Set(hoursEditor.weekdays);
      const preserved = draft.businessHours.filter((hour) => !selected.has(hour.weekday));
      const applied = hoursEditor.weekdays.flatMap((weekday) =>
        hoursEditor.intervals.map((interval) => ({
          weekday,
          startMinute: interval.startMinute,
          endMinute: interval.endMinute,
        }))
      );
      return {
        ...current,
        [hoursEditor.departmentId]: {
          ...draft,
          businessHours: [...preserved, ...applied].sort(
            (a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute || a.endMinute - b.endMinute
          ),
        },
      };
    });
    setError(null);
    setHoursEditor(null);
  };

  const openExceptionEditor = (
    departmentId: string,
    exception?: NonNullable<AdminDepartmentItem["businessHourExceptions"]>[number]
  ) => {
    const type = exception?.type === "CUSTOM_HOURS" ? "CUSTOM_HOURS" : "CLOSED";
    setExceptionEditor({
      date: exception?.date ?? "",
      originalDate: exception?.date,
      type,
      reason: exception?.reason ?? "",
      intervals:
        type === "CUSTOM_HOURS"
          ? normalizeExceptionIntervals(exception?.intervals)
          : [{ startMinute: 8 * 60, endMinute: 17 * 60 }],
      departmentIds: [departmentId],
    });
  };

  const updateExceptionInterval = (
    index: number,
    field: "startMinute" | "endMinute",
    value: number
  ) => {
    setExceptionEditor((current) => {
      if (!current) return current;
      const intervals = [...current.intervals];
      intervals[index] = { ...intervals[index], [field]: value };
      return { ...current, intervals };
    });
  };

  const buildNextExceptions = (
    item: AdminDepartmentItem,
    draft: BusinessHourExceptionDraft
  ): Array<{
    date: string;
    type: "CLOSED" | "CUSTOM_HOURS";
    reason?: string | null;
    intervals?: Array<{ startMinute: number; endMinute: number }> | null;
  }> => {
    const replacement = {
      date: draft.date,
      type: draft.type,
      reason: draft.reason.trim() || null,
      intervals: draft.type === "CUSTOM_HOURS" ? draft.intervals : [],
    };
    return [
      ...(item.businessHourExceptions ?? [])
        .filter((exception) => exception.date !== (draft.originalDate ?? draft.date))
        .map(normalizeExceptionPayload),
      replacement,
    ].sort((a, b) => a.date.localeCompare(b.date));
  };

  const saveExceptionEditor = async () => {
    if (!session || !exceptionEditor) return;
    const validationError = validateExceptionDraft(exceptionEditor);
    if (validationError) {
      setError(validationError);
      return;
    }
    const uniqueDepartmentIds = [...new Set(exceptionEditor.departmentIds)];
    const selectedDepartments = uniqueDepartmentIds
      .map((departmentId) => departments.find((item) => item.id === departmentId))
      .filter(Boolean) as AdminDepartmentItem[];
    if (selectedDepartments.length !== uniqueDepartmentIds.length) {
      setError("Selecione apenas setores desta organização.");
      return;
    }
    setSavingExceptions(true);
    setError(null);
    setSuccess(null);
    try {
      for (const department of selectedDepartments) {
        await updateAppDepartment(session, department.id, {
          businessHourExceptions: buildNextExceptions(department, exceptionEditor),
        });
      }
      setExceptionEditor(null);
      await loadDepartmentsPreservingContext(session, uniqueDepartmentIds[0]);
      setSuccess("Exceção de horário salva.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(normalizeDepartmentError(typed, "Não foi possível salvar a exceção de horário."));
    } finally {
      setSavingExceptions(false);
    }
  };

  const deleteException = async (
    item: AdminDepartmentItem,
    exception: NonNullable<AdminDepartmentItem["businessHourExceptions"]>[number]
  ) => {
    if (!session) return;
    setSavingExceptions(true);
    setError(null);
    setSuccess(null);
    try {
      await updateAppDepartment(session, item.id, {
        businessHourExceptions: (item.businessHourExceptions ?? [])
          .filter((candidate) => candidate.date !== exception.date)
          .map(normalizeExceptionPayload),
      });
      await loadDepartmentsPreservingContext(session, item.id);
      setSuccess("Exceção removida.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(normalizeDepartmentError(typed, "Não foi possível remover a exceção."));
    } finally {
      setSavingExceptions(false);
    }
  };

  const renderExceptionEditor = (hostDepartmentId: string) => {
    if (!exceptionEditor || exceptionEditor.departmentIds[0] !== hostDepartmentId) return null;
    return (
      <div className="department-inline-editor mt-3 rounded-lg border border-re7-sky/35 bg-re7-sky/10 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h5 className="text-sm font-semibold text-white">
              {exceptionEditor.originalDate ? "Editar exceção de horário" : "Adicionar exceção de horário"}
            </h5>
            <p className="text-xs text-white/60">
              A exceção será aplicada aos setores selecionados e passa a valer imediatamente.
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[180px_220px_minmax(0,1fr)]">
          <label className="flex flex-col gap-1.5 text-xs text-white/75">
            <span>Data</span>
            <input
              type="date"
              value={exceptionEditor.date}
              onChange={(event) =>
                setExceptionEditor((current) => current ? { ...current, date: event.target.value } : current)
              }
              className="min-w-0 rounded-md border border-white/15 bg-re7-navy px-2 py-1.5 text-xs text-white outline-none focus:border-re7-sky"
            />
          </label>

          <div className="flex flex-col gap-1.5 text-xs text-white/75">
            <span>Funcionamento</span>
            <label className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1.5">
              <input
                type="radio"
                checked={exceptionEditor.type === "CLOSED"}
                onChange={() =>
                  setExceptionEditor((current) => current ? { ...current, type: "CLOSED" } : current)
                }
                className="accent-re7-orange"
              />
              Fechado o dia inteiro
            </label>
            <label className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1.5">
              <input
                type="radio"
                checked={exceptionEditor.type === "CUSTOM_HOURS"}
                onChange={() =>
                  setExceptionEditor((current) => current ? { ...current, type: "CUSTOM_HOURS" } : current)
                }
                className="accent-re7-orange"
              />
              Horário especial
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-xs text-white/75">
            <span>Motivo opcional</span>
            <input
              value={exceptionEditor.reason}
              onChange={(event) =>
                setExceptionEditor((current) => current ? { ...current, reason: event.target.value } : current)
              }
              placeholder="Ex.: Feriado municipal"
              className="min-w-0 rounded-md border border-white/15 bg-re7-navy px-2 py-1.5 text-xs text-white outline-none focus:border-re7-sky"
            />
          </label>
        </div>

        {exceptionEditor.type === "CUSTOM_HOURS" ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold text-white/80">Intervalos do horário especial</p>
            {exceptionEditor.intervals.map((interval, intervalIndex) => (
              <div
                key={intervalIndex}
                className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 sm:max-w-md"
              >
                <input
                  type="time"
                  value={minutesToTime(interval.startMinute)}
                  onChange={(event) =>
                    updateExceptionInterval(intervalIndex, "startMinute", timeToMinutes(event.target.value))
                  }
                  className="min-w-0 rounded-md border border-white/15 bg-re7-navy px-2 py-1.5 text-xs text-white"
                />
                <span className="text-xs text-white/45">até</span>
                <input
                  type="time"
                  value={minutesToTime(interval.endMinute)}
                  onChange={(event) =>
                    updateExceptionInterval(intervalIndex, "endMinute", timeToMinutes(event.target.value))
                  }
                  className="min-w-0 rounded-md border border-white/15 bg-re7-navy px-2 py-1.5 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() =>
                    setExceptionEditor((current) =>
                      current
                        ? {
                            ...current,
                            intervals: current.intervals.filter((_, index) => index !== intervalIndex),
                          }
                        : current
                    )
                  }
                  disabled={exceptionEditor.intervals.length <= 1}
                  className="rounded-md border border-white/20 px-2 py-1.5 text-xs text-white/75 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Remover
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setExceptionEditor((current) =>
                  current
                    ? {
                        ...current,
                        intervals: [...current.intervals, { startMinute: 13 * 60, endMinute: 17 * 60 }],
                      }
                    : current
                )
              }
              className="rounded-md border border-white/20 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10"
            >
              + Adicionar intervalo
            </button>
          </div>
        ) : null}

        <div className="mt-3">
          <p className="mb-2 text-xs font-semibold text-white/80">Aplicar aos setores</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {sortedDepartments.map((department) => {
              const checked = exceptionEditor.departmentIds.includes(department.id);
              return (
                <label
                  key={department.id}
                  className={`flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${
                    checked
                      ? "border-re7-sky/55 bg-re7-sky/20 text-white"
                      : "border-white/15 bg-white/5 text-white/70"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      setExceptionEditor((current) => {
                        if (!current) return current;
                        const departmentIds = event.target.checked
                          ? [...current.departmentIds, department.id]
                          : current.departmentIds.filter((value) => value !== department.id);
                        return { ...current, departmentIds: [...new Set(departmentIds)] };
                      })
                    }
                    className="h-3.5 w-3.5 accent-re7-sky"
                  />
                  <span className="min-w-0 truncate">{department.name}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={saveExceptionEditor}
            disabled={savingExceptions}
            className="rounded-md bg-re7-orange px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-re7-orange/20 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-re7-orange disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingExceptions ? "Salvando..." : "Salvar"}
          </button>
          <button
            type="button"
            onClick={() => setExceptionEditor(null)}
            disabled={savingExceptions}
            className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  };

  const clearSelectedEditorDays = () => {
    if (!hoursEditor) return;
    if (hoursEditor.weekdays.length === 0) {
      setError("Selecione pelo menos um dia.");
      return;
    }
    setDrafts((current) => {
      const draft = current[hoursEditor.departmentId];
      if (!draft) return current;
      const selected = new Set(hoursEditor.weekdays);
      return {
        ...current,
        [hoursEditor.departmentId]: {
          ...draft,
          businessHours: draft.businessHours.filter((hour) => !selected.has(hour.weekday)),
        },
      };
    });
    setError(null);
    setHoursEditor(null);
  };

  if (!session) {
    return (
      <main className="min-h-screen bg-re7-navy px-4 py-8 text-white md:px-8">
        <div className="mx-auto max-w-7xl rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm text-white/70">Carregando...</p>
        </div>
      </main>
    );
  }

  const readOnly = !canManageDepartments(session.user.role);

  return (
    <AppShell
      session={session}
      title="Setores"
      subtitle="Organize as conversas por setor dentro do portal do cliente."
    >
      <FeedbackToast message={success} {...toastHandlers} />
      <FeedbackToast message={error} variant="error" {...toastHandlers} />

      <section className="rounded-xl border border-white/10 bg-white/5 p-2.5 md:p-3">
        <div className="mb-3 flex flex-col gap-1.5">
          <span className="w-fit rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/70">
            Novo setor
          </span>
          <p className="text-xs text-white/65 sm:text-sm">
            O nome informado gera o slug automaticamente. Supervisores e administradores podem ajustar a operação.
          </p>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <input
            className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-2.5 py-1.5 text-xs text-white outline-none focus:border-re7-sky disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={readOnly || creating}
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={readOnly || creating}
            className="rounded-md bg-re7-orange px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-re7-orange/20 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-re7-orange disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
          >
            {creating ? "Criando..." : "Criar setor"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-2.5 md:p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Setores da organização</h2>
            <p className="mt-0.5 text-xs text-white/65 sm:text-sm">
              {readOnly
                ? "Visualização em leitura."
                : "Edite o nome, ative ou desative setores conforme a operação."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <DepartmentBadge label={`${activeDepartmentCount} ativos`} tone="success" />
            {!readOnly ? (
              <DepartmentBadge label={`${inactiveDepartmentCount} inativos`} tone="warning" />
            ) : null}
            <DepartmentBadge label={`${departments.length} setores`} />
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-white/70">Carregando setores...</p>
        ) : sortedDepartments.length === 0 ? (
          <p className="text-sm text-white/70">Nenhum setor encontrado.</p>
        ) : (
          <div className="space-y-5">
            {sortedDepartments.map((item, index) => {
              const draft = drafts[item.id];
              if (!draft) return null;
              const isDraftActive = draft.isActive;
              const cardToneClass = isDraftActive
                ? index % 2 === 0
                  ? "department-card-active-a border-re7-sky/45 bg-re7-sky/[0.13] shadow-re7-sky/10"
                  : "department-card-active-b border-re7-sky/35 bg-re7-sky/[0.09] shadow-re7-sky/10"
                : "department-card-inactive border-white/15 bg-white/[0.035] shadow-black/10 opacity-85";
              const cardHeaderToneClass = isDraftActive
                ? "department-card-header-active border-re7-sky/25 bg-re7-sky/[0.16]"
                : "department-card-header-inactive border-white/10 bg-white/[0.035]";
              const sectionToneClass = isDraftActive
                ? "department-card-section-active border-re7-sky/20 bg-re7-navy/55"
                : "department-card-section-inactive border-white/10 bg-re7-navy/35";
              const footerToneClass = isDraftActive
                ? "department-card-footer-active border-re7-sky/20 bg-re7-navy/60"
                : "department-card-footer-inactive border-white/10 bg-re7-navy/40";
              return (
                <article
                  id={`department-card-${item.id}`}
                  key={item.id}
                  className={`theme-list-row ${
                    index % 2 === 0 ? "theme-list-row-even" : "theme-list-row-odd"
                  } scroll-mt-24 overflow-hidden rounded-xl border shadow-lg transition-colors ${cardToneClass}`}
                >
                  <div className={`border-b px-3 py-3 md:px-4 ${cardHeaderToneClass}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1.5">
                        <h3 className="text-base font-semibold text-white">{item.name}</h3>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <DepartmentBadge label={item.slug || "-"} />
                          <DepartmentBadge
                            label={isDraftActive ? "Ativo" : "Inativo"}
                            tone={isDraftActive ? "success" : "warning"}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="text-xs text-white/55">Criado em {formatDateTime(item.createdAt)}</span>
                        {!readOnly ? (
                          <button
                            type="button"
                            onClick={() => handleUpdate(item)}
                            disabled={savingId === item.id || togglingId === item.id}
                            className="inline-flex items-center gap-1.5 rounded-md bg-re7-orange px-4 py-2 text-xs font-semibold text-white shadow-md shadow-re7-orange/25 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-re7-orange disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
                          >
                            <ActionIcon>✓</ActionIcon>
                            {savingId === item.id ? "Salvando..." : "Salvar"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="grid min-w-0 grid-cols-1 gap-2 border-b border-white/10 px-3 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,170px)] md:px-4">
                    <label className="flex flex-col gap-1.5 text-xs text-white/75">
                      <span>Nome</span>
                      <input
                        value={draft.name}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [item.id]: {
                              ...current[item.id],
                              name: event.target.value,
                            },
                          }))
                        }
                        disabled={readOnly}
                        className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-2.5 py-1.5 text-xs text-white outline-none ring-0 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
                      />
                    </label>

                    <label className="flex flex-col gap-1.5 text-xs text-white/75">
                      <span>Status</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/65">{isDraftActive ? "Ativo" : "Inativo"}</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (readOnly || togglingId === item.id || savingId === item.id) return;
                            void handleUpdate(item, !isDraftActive);
                          }}
                          disabled={readOnly || togglingId === item.id || savingId === item.id}
                          aria-label={isDraftActive ? "Desativar setor" : "Ativar setor"}
                          className={`relative inline-flex h-6 w-12 items-center rounded-full border transition ${
                            isDraftActive
                              ? "border-emerald-400/40 bg-emerald-500/20"
                              : "border-white/20 bg-white/10"
                          } ${readOnly || togglingId === item.id || savingId === item.id ? "cursor-not-allowed opacity-50" : ""}`}
                        >
                          <span
                            className={`inline-flex h-4 w-4 transform items-center justify-center rounded-full bg-white text-[8px] font-bold text-re7-navy transition ${
                              isDraftActive ? "translate-x-7" : "translate-x-1"
                            }`}
                          >
                            {isDraftActive ? "ON" : "OFF"}
                          </span>
                        </button>
                      </div>
                    </label>
                  </div>

                  <div className={`mx-3 mt-3 rounded-lg border p-3 md:mx-4 ${sectionToneClass}`}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold text-white">Horário de funcionamento</h4>
                        <p className="text-xs text-white/55">Fuso horário: {timezone}</p>
                      </div>
                      {draft.businessHours.length === 0 ? (
                        <DepartmentBadge label="Sem horário configurado" />
                      ) : (
                        <DepartmentBadge label={`${draft.businessHours.length} períodos`} tone="success" />
                      )}
                    </div>
                    <div className="space-y-2">
                      {draft.businessHours.length === 0 ? (
                        <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/60">
                          Sem horário configurado. Quando houver períodos salvos, dias sem período aparecem como fechados.
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-lg border border-white/10">
                          {buildBusinessHourGroups(draft.businessHours).map((group) => (
                            <div
                              key={`${group.weekdays.join("-")}-${getIntervalSignature(group.intervals)}`}
                              className="grid grid-cols-1 items-center gap-2 border-b border-white/10 px-3 py-2 last:border-b-0 sm:grid-cols-[110px_minmax(0,1fr)_auto]"
                            >
                              <span className="text-xs font-semibold text-white/85">
                                {formatWeekdayGroup(group.weekdays)}
                              </span>
                              <span className={group.intervals.length ? "text-sm text-white" : "text-sm text-white/55"}>
                                {formatIntervals(group.intervals)}
                              </span>
                              <button
                                type="button"
                                disabled={readOnly}
                                onClick={() =>
                                  openHoursEditor(item.id, {
                                    weekdays: group.weekdays,
                                    intervals: group.intervals.length
                                      ? group.intervals
                                      : [{ ...DEFAULT_BUSINESS_HOUR_INTERVAL }],
                                  })
                                }
                                className="w-fit rounded-md border border-white/20 px-2 py-1 text-xs text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Editar
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {!readOnly ? (
                        <button
                          type="button"
                          onClick={() => openHoursEditor(item.id)}
                          className="rounded-md border border-white/25 bg-white/[0.04] px-2.5 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/10"
                        >
                          Definir horário para vários dias
                        </button>
                      ) : null}

                      {hoursEditor?.departmentId === item.id ? (
                        <div className="rounded-lg border border-re7-sky/35 bg-re7-sky/10 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h5 className="text-sm font-semibold text-white">Editar dias selecionados</h5>
                              <p className="text-xs text-white/60">
                                Os períodos abaixo serão aplicados a todos os dias marcados.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setHoursEditor(null)}
                              className="rounded-md border border-white/20 px-2 py-1 text-xs text-white/75 hover:bg-white/10"
                            >
                              Fechar
                            </button>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {WEEKDAYS.map((weekday) => {
                              const checked = hoursEditor.weekdays.includes(weekday.value);
                              return (
                                <label
                                  key={weekday.value}
                                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                                    checked
                                      ? "border-re7-sky/60 bg-re7-sky/20 text-white"
                                      : "border-white/15 bg-white/5 text-white/70"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) =>
                                      setHoursEditor((current) => {
                                        if (!current) return current;
                                        const weekdays = event.target.checked
                                          ? [...current.weekdays, weekday.value]
                                          : current.weekdays.filter((value) => value !== weekday.value);
                                        return { ...current, weekdays: [...new Set(weekdays)].sort((a, b) => a - b) };
                                      })
                                    }
                                    className="h-3.5 w-3.5 accent-re7-sky"
                                  />
                                  {WEEKDAY_SHORT_LABELS[weekday.value]}
                                </label>
                              );
                            })}
                          </div>

                          <div className="mt-3 space-y-2">
                            {hoursEditor.intervals.map((interval, intervalIndex) => (
                              <div
                                key={intervalIndex}
                                className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 sm:max-w-md"
                              >
                                <input
                                  type="time"
                                  value={minutesToTime(interval.startMinute)}
                                  onChange={(event) =>
                                    updateHoursEditorInterval(intervalIndex, "startMinute", timeToMinutes(event.target.value))
                                  }
                                  className="min-w-0 rounded-md border border-white/15 bg-re7-navy px-2 py-1.5 text-xs text-white"
                                />
                                <span className="text-xs text-white/45">até</span>
                                <input
                                  type="time"
                                  value={minutesToTime(interval.endMinute)}
                                  onChange={(event) =>
                                    updateHoursEditorInterval(intervalIndex, "endMinute", timeToMinutes(event.target.value))
                                  }
                                  className="min-w-0 rounded-md border border-white/15 bg-re7-navy px-2 py-1.5 text-xs text-white"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setHoursEditor((current) =>
                                      current
                                        ? {
                                            ...current,
                                            intervals: current.intervals.filter((_, index) => index !== intervalIndex),
                                          }
                                        : current
                                    )
                                  }
                                  disabled={hoursEditor.intervals.length <= 1}
                                  className="rounded-md border border-white/20 px-2 py-1.5 text-xs text-white/75 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
                                >
                                  Remover
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() =>
                                setHoursEditor((current) =>
                                  current
                                    ? {
                                        ...current,
                                        intervals: [...current.intervals, { startMinute: 13 * 60, endMinute: 17 * 60 }],
                                      }
                                    : current
                                )
                              }
                              className="rounded-md border border-white/20 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10"
                            >
                              + Adicionar período
                            </button>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={applyHoursEditor}
                              className="rounded-md bg-re7-orange px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-re7-orange/20 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-re7-orange"
                            >
                              Aplicar aos dias selecionados
                            </button>
                            <button
                              type="button"
                              onClick={clearSelectedEditorDays}
                              className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
                            >
                              Marcar selecionados como fechado
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className={`mx-3 mt-3 rounded-lg border p-3 md:mx-4 ${sectionToneClass}`}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold text-white">Exceções, feriados e expedientes especiais</h4>
                        <p className="text-xs text-white/55">Essas datas substituem o horário regular deste setor.</p>
                      </div>
                      {!readOnly ? (
	                        <button
	                          type="button"
	                          onClick={() => openExceptionEditor(item.id)}
	                          disabled={savingExceptions}
	                          className="department-secondary-action rounded-md border border-white/25 bg-white/[0.04] px-2.5 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
	                        >
	                          + Adicionar exceção
	                        </button>
                      ) : null}
                    </div>
                    {(item.businessHourExceptions ?? []).length === 0 ? (
                      <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/60">
                        Nenhuma exceção cadastrada.
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-lg border border-white/10">
                        <div className="hidden grid-cols-[120px_160px_minmax(0,1fr)_auto] gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold uppercase text-white/55 sm:grid">
                          <span>Data</span>
                          <span>Funcionamento</span>
                          <span>Motivo</span>
                          <span>Ações</span>
                        </div>
                        {(item.businessHourExceptions ?? []).map((exception) => {
                          const intervals = normalizeExceptionIntervals(exception.intervals);
                          return (
                            <div
                              key={`${item.id}-${exception.date}`}
                              className="grid grid-cols-1 gap-2 border-b border-white/10 px-3 py-2 last:border-b-0 sm:grid-cols-[120px_160px_minmax(0,1fr)_auto]"
                            >
                              <span className="text-xs font-semibold text-white/85">{exception.date}</span>
                              <span className="text-xs text-white/75">
                                {formatExceptionType(exception.type)}
                                {exception.type === "CUSTOM_HOURS" ? `: ${formatIntervals(intervals)}` : ""}
                              </span>
                              <span className="min-w-0 text-xs text-white/65">{exception.reason || "-"}</span>
                              {readOnly ? (
                                <span className="text-xs text-white/45">Somente leitura</span>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openExceptionEditor(item.id, exception)}
                                    disabled={savingExceptions}
                                    className="rounded-md border border-white/20 px-2 py-1 text-xs text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void deleteException(item, exception)}
                                    disabled={savingExceptions}
                                    className="rounded-md border border-red-300/30 px-2 py-1 text-xs text-red-100 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Excluir
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
	                      </div>
	                    )}
	                    {renderExceptionEditor(item.id)}
	                  </div>

	                  <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 border-t px-3 py-3 md:px-4 ${footerToneClass}`}>
                    <p className="text-xs text-white/55">Slug atual: {item.slug || "-"}</p>
                    {readOnly ? (
                      <p className="text-xs text-white/55">Somente leitura.</p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}
