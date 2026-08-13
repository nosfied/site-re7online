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
  return role.trim().toUpperCase() === "ADMIN";
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
      await loadDepartments(session);
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
      await loadDepartments(session);
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
            O nome informado gera o slug automaticamente. Supervisores acessam esta tela apenas em leitura.
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
            className="rounded-md bg-re7-orange px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
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
                ? "Visualizacao em leitura para supervisores."
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
          <div className="space-y-2.5">
            {sortedDepartments.map((item, index) => {
              const draft = drafts[item.id];
              if (!draft) return null;
              return (
                <article
                  key={item.id}
                  className={`theme-list-row ${
                    index % 2 === 0 ? "theme-list-row-even" : "theme-list-row-odd"
                  } rounded-xl border p-2.5 md:p-3 ${
                    index % 2 === 0
                      ? "border-white/10 bg-re7-navy/40"
                      : "border-white/15 bg-white/[0.075]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1.5">
                      <h3 className="text-base font-semibold text-white">{item.name}</h3>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <DepartmentBadge label={item.slug || "-"} />
                        <DepartmentBadge
                          label={item.isActive ? "Ativo" : "Inativo"}
                          tone={item.isActive ? "success" : "warning"}
                        />
                      </div>
                    </div>
                    <div className="text-xs text-white/55">Criado em {formatDateTime(item.createdAt)}</div>
                  </div>

                  <div className="mt-2.5 grid min-w-0 grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,170px)]">
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
                        <span className="text-xs text-white/65">{draft.isActive ? "Ativo" : "Inativo"}</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (readOnly || togglingId === item.id || savingId === item.id) return;
                            void handleUpdate(item, !draft.isActive);
                          }}
                          disabled={readOnly || togglingId === item.id || savingId === item.id}
                          aria-label={draft.isActive ? "Desativar setor" : "Ativar setor"}
                          className={`relative inline-flex h-6 w-12 items-center rounded-full border transition ${
                            draft.isActive
                              ? "border-emerald-400/40 bg-emerald-500/20"
                              : "border-white/20 bg-white/10"
                          } ${readOnly || togglingId === item.id || savingId === item.id ? "cursor-not-allowed opacity-50" : ""}`}
                        >
                          <span
                            className={`inline-flex h-4 w-4 transform items-center justify-center rounded-full bg-white text-[8px] font-bold text-re7-navy transition ${
                              draft.isActive ? "translate-x-7" : "translate-x-1"
                            }`}
                          >
                            {draft.isActive ? "ON" : "OFF"}
                          </span>
                        </button>
                      </div>
                    </label>
                  </div>

                  <div className="mt-3 rounded-lg border border-white/10 bg-re7-navy/35 p-2.5">
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
                          className="rounded-md border border-white/20 px-2.5 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/10"
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
                              className="rounded-md bg-re7-orange px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
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

                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-white/55">Slug atual: {item.slug || "-"}</p>
                    {readOnly ? (
                      <p className="text-xs text-white/55">Somente leitura.</p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleUpdate(item)}
                          disabled={savingId === item.id || togglingId === item.id}
                          className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-2.5 py-1.5 text-xs text-white/85 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
                        >
                          <ActionIcon>✓</ActionIcon>
                          {savingId === item.id ? "Salvando..." : "Salvar"}
                        </button>
                      </div>
                    )}
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
