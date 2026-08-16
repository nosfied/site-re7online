"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useAdminConsole } from "@/components/admin/AdminConsoleProvider";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AdminClientItem,
  AdminDepartmentItem,
  consolidateDepartment,
  createDepartment,
  fetchAdminClients,
  fetchDepartments,
  formatDateTime,
  updateDepartment,
} from "@/lib/whatsappAdminApi";

function getDepartmentSlugBase(item: AdminDepartmentItem) {
  const slug = (item.slug ?? item.name).trim().toLowerCase();
  return slug.replace(/-\d+$/, "");
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
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>
      {label}
    </span>
  );
}

function ActionIcon({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-4 w-4 items-center justify-center text-sm">{children}</span>;
}

const WEEKDAY_SHORT_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type BusinessHourExceptionDraft = {
  date: string;
  type: "CLOSED" | "CUSTOM_HOURS";
  reason: string;
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

function getIntervalsForWeekday(
  hours: NonNullable<AdminDepartmentItem["businessHours"]>,
  weekday: number
) {
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
  return intervals.map((hour) => `${minutesToTime(hour.startMinute)}-${minutesToTime(hour.endMinute)}`).join(" / ");
}

function formatWeekdayGroup(days: number[]) {
  const sorted = [...days].sort((a, b) => a - b);
  return sorted.map((day) => WEEKDAY_SHORT_LABELS[day] ?? String(day)).join(", ");
}

function buildBusinessHourGroups(hours: AdminDepartmentItem["businessHours"] = []) {
  const groups = new Map<string, { weekdays: number[]; intervals: Array<{ startMinute: number; endMinute: number }> }>();
  for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
    const intervals = getIntervalsForWeekday(hours, weekday);
    const signature = getIntervalSignature(intervals);
    const current = groups.get(signature);
    if (current) current.weekdays.push(weekday);
    else groups.set(signature, { weekdays: [weekday], intervals });
  }
  return [...groups.values()].sort((a, b) => a.weekdays[0] - b.weekdays[0]);
}

function buildExceptionDrafts(items: AdminDepartmentItem[]) {
  return Object.fromEntries(
    items.map((item) => [
      item.id,
      (item.businessHourExceptions ?? []).map((exception) => ({
        date: exception.date,
        type: exception.type === "CUSTOM_HOURS" ? "CUSTOM_HOURS" : "CLOSED",
        reason: exception.reason ?? "",
        intervals: exception.type === "CUSTOM_HOURS" ? exception.intervals ?? [] : [],
      })),
    ])
  ) as Record<string, BusinessHourExceptionDraft[]>;
}

export default function AdminDepartmentsPage() {
  const { connection } = useAdminConsole();
  const searchParams = useSearchParams();
  const clientKeyParam = searchParams.get("clientKey")?.trim() ?? "";
  const tenantIdParam = searchParams.get("tenantId")?.trim() ?? "";
  const [clients, setClients] = useState<AdminClientItem[]>([]);
  const [clientKey, setClientKey] = useState(clientKeyParam);
  const [departments, setDepartments] = useState<AdminDepartmentItem[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [consolidatingId, setConsolidatingId] = useState<string | null>(null);
  const [consolidationTargets, setConsolidationTargets] = useState<Record<string, string>>({});
  const [timezone, setTimezone] = useState("America/Fortaleza");
  const [exceptionDrafts, setExceptionDrafts] = useState<Record<string, BusinessHourExceptionDraft[]>>({});
  const [savingExceptionsId, setSavingExceptionsId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || success), () => {
      setError(null);
      setSuccess(null);
    });

  useEffect(() => {
    if (!connection.baseUrl || !connection.adminToken) return;
    let cancelled = false;
    fetchAdminClients(connection)
      .then((response) => {
        if (cancelled) return;
        setClients(response.items);
        setClientKey((current) => current || clientKeyParam || response.items[0]?.clientKey || "");
      })
      .catch((err: { message?: string }) => {
        if (cancelled) return;
        setError(err.message || "Falha ao carregar tenants.");
      });
    return () => {
      cancelled = true;
    };
  }, [clientKeyParam, connection]);

  const loadItems = async (activeClientKey: string) => {
    const response = await fetchDepartments(connection, activeClientKey, {
      includeInactive: true,
    });
    setDepartments(response.items);
    if (response.timezone) setTimezone(response.timezone);
    setExceptionDrafts(buildExceptionDrafts(response.items));
  };

  useEffect(() => {
    if (!connection.baseUrl || !connection.adminToken || !clientKey) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDepartments(connection, clientKey, {
      includeInactive: true,
    })
      .then((response) => {
        if (cancelled) return;
        setDepartments(response.items);
        if (response.timezone) setTimezone(response.timezone);
        setExceptionDrafts(buildExceptionDrafts(response.items));
      })
      .catch((err: { message?: string }) => {
        if (cancelled) return;
        setError(err.message || "Falha ao carregar setores.");
        setDepartments([]);
        setExceptionDrafts({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientKey, connection]);

  const sortedDepartments = useMemo(
    () =>
      [...departments].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return a.name.localeCompare(b.name, "pt-BR");
      }),
    [departments]
  );

  const duplicateGroups = useMemo(() => {
    const grouped = new Map<string, AdminDepartmentItem[]>();
    for (const item of sortedDepartments) {
      const baseSlug = getDepartmentSlugBase(item);
      const current = grouped.get(baseSlug) ?? [];
      current.push(item);
      grouped.set(baseSlug, current);
    }
    return Array.from(grouped.entries())
      .map(([baseSlug, items]) => ({
        baseSlug,
        items,
        activeCount: items.filter((item) => item.isActive).length,
      }))
      .filter((group) => group.items.length > 1 && group.activeCount > 1)
      .sort((a, b) => a.items[0]!.name.localeCompare(b.items[0]!.name, "pt-BR"));
  }, [sortedDepartments]);

  const handleCreate = async () => {
    if (!clientKey) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Informe o nome do setor.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createDepartment(connection, clientKey, { name: trimmedName });
      setName("");
      await loadItems(clientKey);
      setSuccess(`Setor "${trimmedName}" criado com sucesso.`);
    } catch (err) {
      const typed = err as { message?: string };
      setError(typed.message || "Falha ao criar setor.");
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (item: AdminDepartmentItem) => {
    if (!clientKey) return;
    setTogglingId(item.id);
    setError(null);
    try {
      await updateDepartment(connection, clientKey, item.id, { isActive: !item.isActive });
      await loadItems(clientKey);
      setSuccess(`Setor ${item.isActive ? "desativado" : "ativado"} com sucesso.`);
    } catch (err) {
      const typed = err as { message?: string };
      setError(typed.message || "Falha ao atualizar setor.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleConsolidate = async (item: AdminDepartmentItem) => {
    if (!clientKey) return;
    const targetDepartmentId =
      consolidationTargets[item.id]?.trim() ||
      duplicateGroups
        .find((group) => group.items.some((candidate) => candidate.id === item.id))
        ?.items.find((candidate) => candidate.id !== item.id && candidate.isActive)
        ?.id ||
      "";
    if (!targetDepartmentId) {
      setError("Selecione o setor de destino para consolidar.");
      return;
    }
    setConsolidatingId(item.id);
    setError(null);
    try {
      const response = await consolidateDepartment(
        connection,
        clientKey,
        item.id,
        targetDepartmentId
      );
      const targetName = response.targetDepartment.name;
      await loadItems(clientKey);
      setSuccess(`Setor "${item.name}" consolidado em "${targetName}".`);
      setConsolidationTargets((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } catch (err) {
      const typed = err as { message?: string };
      setError(typed.message || "Falha ao consolidar setor.");
    } finally {
      setConsolidatingId(null);
    }
  };

  const updateExceptionDraft = (
    departmentId: string,
    index: number,
    patch: Partial<BusinessHourExceptionDraft>
  ) => {
    setExceptionDrafts((current) => {
      const items = current[departmentId] ?? [];
      return {
        ...current,
        [departmentId]: items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
      };
    });
  };

  const addExceptionDraft = (departmentId: string) => {
    const today = new Date().toISOString().slice(0, 10);
    setExceptionDrafts((current) => ({
      ...current,
      [departmentId]: [
        ...(current[departmentId] ?? []),
        { date: today, type: "CLOSED", reason: "", intervals: [] },
      ],
    }));
  };

  const removeExceptionDraft = (departmentId: string, index: number) => {
    setExceptionDrafts((current) => ({
      ...current,
      [departmentId]: (current[departmentId] ?? []).filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const saveExceptions = async (item: AdminDepartmentItem) => {
    if (!clientKey) return;
    const exceptions = exceptionDrafts[item.id] ?? [];
    setSavingExceptionsId(item.id);
    setError(null);
    try {
      await updateDepartment(connection, clientKey, item.id, {
        businessHourExceptions: exceptions.map((exception) => ({
          date: exception.date,
          type: exception.type,
          reason: exception.reason.trim() || null,
          intervals: exception.type === "CUSTOM_HOURS" ? exception.intervals : [],
        })),
      });
      await loadItems(clientKey);
      setSuccess(`Exceções de horário de "${item.name}" salvas.`);
    } catch (err) {
      const typed = err as { message?: string };
      setError(typed.message || "Falha ao salvar exceções de horário.");
    } finally {
      setSavingExceptionsId(null);
    }
  };

  return (
    <div className="px-4 py-8 text-white md:px-8">
      <FeedbackToast message={success} {...toastHandlers} />
      <FeedbackToast message={error} variant="error" {...toastHandlers} />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Departments</h1>
            <p className="text-sm text-white/70">Gestao minima de setores por tenant.</p>
            {tenantIdParam || clientKeyParam ? (
              <p className="mt-1 text-xs text-white/50">
                Tenant filtrado: {tenantIdParam || clientKeyParam}
              </p>
            ) : null}
          </div>
          <Link
            href="/admin/tenants"
            className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
          >
            Voltar
          </Link>
        </header>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
              Novo setor
            </h2>
            <p className="mt-1 text-sm text-white/65">
              Escolha o tenant e informe um nome claro. O sistema normaliza o setor automaticamente.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)_auto]">
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Tenant</span>
              <select
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={clientKey}
                onChange={(event) => setClientKey(event.target.value)}
              >
                <option value="">Selecione...</option>
                {clients.map((item) => (
                  <option key={item.clientKey} value={item.clientKey}>
                    {item.name} ({item.clientKey})
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Novo setor</span>
              <input
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <div className="flex items-end">
              <button
                type="button"
                onClick={handleCreate}
                disabled={!clientKey || creating}
                className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "Criando..." : "Criar setor"}
              </button>
            </div>
          </div>
        </section>

        {loading ? <p className="text-sm text-white/70">Carregando setores...</p> : null}
        {duplicateGroups.length ? (
          <section className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-amber-100">
                Possiveis duplicidades semanticas
              </h2>
              <p className="text-sm text-amber-50/80">
                Consolide setores duplicados com seguranca. O setor de origem sera desativado.
              </p>
            </div>
            <div className="grid gap-3">
              {duplicateGroups.map((group) => (
                <div
                  key={group.baseSlug}
                  className="rounded-lg border border-white/10 bg-re7-navy/40 p-3"
                >
                  <p className="mb-2 text-xs uppercase tracking-wide text-white/60">
                    Grupo {group.baseSlug}
                  </p>
                  <div className="grid gap-3">
                    {group.items.map((item) => {
                      const targetOptions = group.items.filter(
                        (candidate) => candidate.id !== item.id && candidate.isActive
                      );
                      return (
                        <div
                          key={item.id}
                          className="grid gap-3 rounded-md border border-white/10 px-3 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,240px)_auto]"
                        >
                          <div>
                            <p className="font-medium text-white">{item.name}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <DepartmentBadge
                                label={item.isActive ? "Ativo" : "Inativo"}
                                tone={item.isActive ? "success" : "warning"}
                              />
                              <DepartmentBadge label={item.slug ?? "-"} />
                            </div>
                          </div>
                          <select
                            className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:cursor-not-allowed disabled:opacity-60"
                            value={consolidationTargets[item.id] ?? targetOptions[0]?.id ?? ""}
                            onChange={(event) =>
                              setConsolidationTargets((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                            disabled={!targetOptions.length || consolidatingId === item.id}
                          >
                            <option value="">Escolha destino...</option>
                            {targetOptions.map((target) => (
                              <option key={target.id} value={target.id}>
                                {target.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleConsolidate(item)}
                            disabled={!targetOptions.length || consolidatingId === item.id}
                            className="rounded-md border border-amber-300/30 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {consolidatingId === item.id ? "Consolidando..." : "Consolidar"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <section className="rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold">Setores do tenant</h2>
            <p className="mt-1 text-sm text-white/65">
              Visual mais simples: nome grande, status claro, horário regular e exceções por data.
            </p>
            <p className="mt-1 text-xs text-white/45">Fuso aplicado: {timezone}</p>
          </div>
          {sortedDepartments.length ? (
            <div className="grid gap-3 p-4">
              {sortedDepartments.map((item) => {
                const exceptions = exceptionDrafts[item.id] ?? [];
                return (
                <article key={item.id} className="rounded-xl border border-white/10 bg-re7-navy/30 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{item.name}</h3>
                        <p className="font-mono text-xs text-white/45">{item.id}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <DepartmentBadge
                          label={item.isActive ? "Ativo" : "Inativo"}
                          tone={item.isActive ? "success" : "warning"}
                        />
                        <DepartmentBadge label={item.slug ? `slug: ${item.slug}` : "slug: -"} />
                      </div>
                      <p className="text-xs text-white/45">Criado em {formatDateTime(item.createdAt)}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleToggle(item)}
                        disabled={togglingId === item.id}
                        aria-label={item.isActive ? "Desativar setor" : "Ativar setor"}
                        className={`relative inline-flex h-8 w-16 items-center rounded-full border transition ${
                          item.isActive
                            ? "border-emerald-400/50 bg-emerald-500/30"
                            : "border-white/20 bg-white/10"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        <span className="sr-only">
                          {togglingId === item.id
                            ? "Salvando alteracao do setor"
                            : item.isActive
                              ? "Desativar setor"
                              : "Ativar setor"}
                        </span>
                        <span
                          className={`absolute left-1.5 text-[10px] font-semibold uppercase tracking-wide ${
                            item.isActive ? "text-emerald-100" : "text-white/60"
                          }`}
                        >
                          {togglingId === item.id ? "..." : item.isActive ? "On" : "Off"}
                        </span>
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
                            item.isActive ? "translate-x-9" : "translate-x-1.5"
                          }`}
                        />
                      </button>
                      <span className="text-sm text-white/70">
                        {item.isActive ? "Setor visivel na operacao" : "Setor fora da operacao"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-4 border-t border-white/10 pt-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
                    <div>
                      <h4 className="text-sm font-semibold text-white">Horário regular</h4>
                      <div className="mt-2 grid gap-2 text-sm text-white/70">
                        {item.businessHours?.length ? (
                          buildBusinessHourGroups(item.businessHours).map((group) => (
                            <div key={`${group.weekdays.join("-")}-${formatIntervals(group.intervals)}`} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                              <span className="font-medium text-white/85">{formatWeekdayGroup(group.weekdays)}</span>
                              <span className="ml-2">{formatIntervals(group.intervals)}</span>
                            </div>
                          ))
                        ) : (
                          <p className="rounded-lg border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-amber-100">
                            Sem horário regular configurado.
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-semibold text-white">Exceções e feriados</h4>
                          <p className="mt-1 text-xs text-white/50">
                            A exceção da data prevalece sobre o horário regular. Não há feriados automáticos.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => addExceptionDraft(item.id)}
                          className="rounded-md border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                        >
                          Adicionar exceção
                        </button>
                      </div>
                      <div className="mt-3 grid gap-3">
                        {exceptions.length ? exceptions.map((exception, index) => (
                          <div key={`${item.id}-${index}`} className="grid gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
                            <div className="grid gap-3 md:grid-cols-[140px_180px_minmax(0,1fr)_auto]">
                              <label className="grid gap-1 text-xs text-white/65">
                                Data
                                <input
                                  type="date"
                                  value={exception.date}
                                  onChange={(event) => updateExceptionDraft(item.id, index, { date: event.target.value })}
                                  className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                                />
                              </label>
                              <label className="grid gap-1 text-xs text-white/65">
                                Situação
                                <select
                                  value={exception.type}
                                  onChange={(event) => updateExceptionDraft(item.id, index, {
                                    type: event.target.value === "CUSTOM_HOURS" ? "CUSTOM_HOURS" : "CLOSED",
                                    intervals: event.target.value === "CUSTOM_HOURS" && exception.intervals.length === 0
                                      ? [{ startMinute: 8 * 60, endMinute: 12 * 60 }]
                                      : exception.intervals,
                                  })}
                                  className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                                >
                                  <option value="CLOSED">Fechado o dia inteiro</option>
                                  <option value="CUSTOM_HOURS">Horário especial</option>
                                </select>
                              </label>
                              <label className="grid gap-1 text-xs text-white/65">
                                Motivo
                                <input
                                  value={exception.reason}
                                  onChange={(event) => updateExceptionDraft(item.id, index, { reason: event.target.value })}
                                  className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                                  placeholder="Opcional"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => removeExceptionDraft(item.id, index)}
                                className="self-end rounded-md border border-red-300/30 px-3 py-2 text-xs font-semibold text-red-100 hover:bg-red-500/10"
                              >
                                Excluir
                              </button>
                            </div>
                            {exception.type === "CUSTOM_HOURS" ? (
                              <div className="grid gap-2">
                                {exception.intervals.map((interval, intervalIndex) => (
                                  <div key={intervalIndex} className="grid gap-2 sm:grid-cols-[140px_140px_auto]">
                                    <input
                                      type="time"
                                      value={minutesToTime(interval.startMinute)}
                                      onChange={(event) => updateExceptionDraft(item.id, index, {
                                        intervals: exception.intervals.map((candidate, candidateIndex) =>
                                          candidateIndex === intervalIndex
                                            ? { ...candidate, startMinute: timeToMinutes(event.target.value) }
                                            : candidate
                                        ),
                                      })}
                                      className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                                    />
                                    <input
                                      type="time"
                                      value={minutesToTime(interval.endMinute)}
                                      onChange={(event) => updateExceptionDraft(item.id, index, {
                                        intervals: exception.intervals.map((candidate, candidateIndex) =>
                                          candidateIndex === intervalIndex
                                            ? { ...candidate, endMinute: timeToMinutes(event.target.value) }
                                            : candidate
                                        ),
                                      })}
                                      className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => updateExceptionDraft(item.id, index, {
                                        intervals: exception.intervals.filter((_, candidateIndex) => candidateIndex !== intervalIndex),
                                      })}
                                      className="rounded-md border border-white/20 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
                                    >
                                      Remover período
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => updateExceptionDraft(item.id, index, {
                                    intervals: [...exception.intervals, { startMinute: 13 * 60, endMinute: 17 * 60 }],
                                  })}
                                  className="w-fit rounded-md border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                                >
                                  Adicionar período
                                </button>
                              </div>
                            ) : null}
                          </div>
                        )) : (
                          <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/60">
                            Nenhuma exceção cadastrada.
                          </p>
                        )}
                      </div>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => saveExceptions(item)}
                          disabled={savingExceptionsId === item.id}
                          className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingExceptionsId === item.id ? "Salvando..." : "Salvar exceções"}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );})}
            </div>
          ) : (
            <p className="p-4 text-sm text-white/70">Nenhum setor cadastrado para este tenant.</p>
          )}
        </section>
      </div>
    </div>
  );
}
