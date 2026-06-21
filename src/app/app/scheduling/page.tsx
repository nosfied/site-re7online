"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppAppointment,
  AppSchedulingAvailability,
  AppSchedulingResource,
  AppSchedulingService,
  AppSession,
  clearAppSession,
  createAppAppointment,
  createAppSchedulingAvailability,
  createAppSchedulingResource,
  createAppSchedulingService,
  fetchAppScheduling,
  loadAppSession,
  saveAppSession,
  updateAppAppointment,
  updateAppSchedulingAvailability,
  updateAppSchedulingResource,
  updateAppSchedulingService,
} from "@/lib/appClientApi";

type TabKey = "services" | "resources" | "availability" | "appointments";

const SERVICE_EMPTY = {
  id: "",
  name: "",
  description: "",
  durationMinutes: 30,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  requiresApproval: false,
  status: "active",
};

const RESOURCE_EMPTY = {
  id: "",
  name: "",
  description: "",
  type: "person",
  capacity: 1,
  status: "active",
};

const AVAILABILITY_EMPTY = {
  id: "",
  serviceId: "",
  resourceId: "",
  weekday: 1,
  startsAtLocal: "08:00",
  endsAtLocal: "12:00",
  timezone: "America/Fortaleza",
  status: "active",
};

const APPOINTMENT_EMPTY = {
  id: "",
  serviceId: "",
  resourceId: "",
  title: "",
  description: "",
  startsAt: "",
  endsAt: "",
  timezone: "America/Fortaleza",
  status: "scheduled",
};

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

function canManageScheduling(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function normalizeError(error: AppApiError, fallback: string) {
  if (error.status === 401) return "Sessao expirada. Faca login novamente.";
  if (error.status === 403) return "Seu perfil nao tem permissao para gerenciar agendamentos.";
  if (error.errorCode === "feature_not_enabled") return "Agendamento nao esta habilitado para este tenant.";
  if (error.errorCode?.endsWith("_not_found")) return "O vinculo selecionado nao pertence a este tenant ou nao existe.";
  return error.message || fallback;
}

function toLocalDateTimeInput(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function fromLocalDateTimeInput(value: string) {
  return value ? new Date(value).toISOString() : "";
}

function StatusPill({ status }: { status: string }) {
  const label =
    status === "active"
      ? "Ativo"
      : status === "inactive"
        ? "Inativo"
        : status === "archived"
          ? "Arquivado"
          : status === "cancelled"
            ? "Cancelado"
            : status === "completed"
              ? "Concluido"
              : status === "confirmed"
                ? "Confirmado"
                : "Agendado";
  return <span className="rounded-full border px-2 py-0.5 text-[11px] theme-muted">{label}</span>;
}

export default function SchedulingPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [tab, setTab] = useState<TabKey>("services");
  const [services, setServices] = useState<AppSchedulingService[]>([]);
  const [resources, setResources] = useState<AppSchedulingResource[]>([]);
  const [availabilities, setAvailabilities] = useState<AppSchedulingAvailability[]>([]);
  const [appointments, setAppointments] = useState<AppAppointment[]>([]);
  const [serviceForm, setServiceForm] = useState(SERVICE_EMPTY);
  const [resourceForm, setResourceForm] = useState(RESOURCE_EMPTY);
  const [availabilityForm, setAvailabilityForm] = useState(AVAILABILITY_EMPTY);
  const [appointmentForm, setAppointmentForm] = useState(APPOINTMENT_EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || success), () => {
    setError(null);
    setSuccess(null);
  });

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const loadScheduling = useCallback(
    async (activeSession: AppSession) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchAppScheduling(activeSession);
        setServices(response.services);
        setResources(response.resources);
        setAvailabilities(response.availabilities);
        setAppointments(response.appointments);
      } catch (err) {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(normalizeError(typed, "Nao foi possivel carregar a agenda."));
      } finally {
        setLoading(false);
      }
    },
    [handleUnauthorized]
  );

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored) {
      router.replace("/app/login");
      return;
    }
    if (!canManageScheduling(stored.user.role)) {
      router.replace("/app/inbox");
      return;
    }
    saveAppSession(stored);
    setSession(stored);
    void loadScheduling(stored);
  }, [loadScheduling, router]);

  const activeServices = useMemo(() => services.filter((item) => item.status === "active"), [services]);
  const activeResources = useMemo(() => resources.filter((item) => item.status === "active"), [resources]);
  const futureAppointments = useMemo(
    () => appointments.filter((item) => item.status !== "cancelled" && item.status !== "completed").length,
    [appointments]
  );

  const saveService = async () => {
    if (!session || !serviceForm.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: serviceForm.name,
        description: serviceForm.description || null,
        durationMinutes: serviceForm.durationMinutes,
        bufferBeforeMinutes: serviceForm.bufferBeforeMinutes,
        bufferAfterMinutes: serviceForm.bufferAfterMinutes,
        requiresApproval: serviceForm.requiresApproval,
        status: serviceForm.status as "active" | "inactive" | "archived",
      };
      if (serviceForm.id) {
        await updateAppSchedulingService(session, serviceForm.id, payload);
        setSuccess("Servico atualizado.");
      } else {
        await createAppSchedulingService(session, payload);
        setSuccess("Servico criado.");
      }
      setServiceForm(SERVICE_EMPTY);
      await loadScheduling(session);
    } catch (err) {
      setError(normalizeError(err as AppApiError, "Nao foi possivel salvar o servico."));
    } finally {
      setSaving(false);
    }
  };

  const saveResource = async () => {
    if (!session || !resourceForm.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: resourceForm.name,
        description: resourceForm.description || null,
        type: resourceForm.type,
        capacity: resourceForm.capacity,
        status: resourceForm.status as "active" | "inactive" | "archived",
      };
      if (resourceForm.id) {
        await updateAppSchedulingResource(session, resourceForm.id, payload);
        setSuccess("Recurso atualizado.");
      } else {
        await createAppSchedulingResource(session, payload);
        setSuccess("Recurso criado.");
      }
      setResourceForm(RESOURCE_EMPTY);
      await loadScheduling(session);
    } catch (err) {
      setError(normalizeError(err as AppApiError, "Nao foi possivel salvar o recurso."));
    } finally {
      setSaving(false);
    }
  };

  const saveAvailability = async () => {
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        serviceId: availabilityForm.serviceId || null,
        resourceId: availabilityForm.resourceId || null,
        weekday: availabilityForm.weekday,
        startsAtLocal: availabilityForm.startsAtLocal,
        endsAtLocal: availabilityForm.endsAtLocal,
        timezone: availabilityForm.timezone,
        status: availabilityForm.status as "active" | "inactive" | "archived",
      };
      if (availabilityForm.id) {
        await updateAppSchedulingAvailability(session, availabilityForm.id, payload);
        setSuccess("Disponibilidade atualizada.");
      } else {
        await createAppSchedulingAvailability(session, payload);
        setSuccess("Disponibilidade criada.");
      }
      setAvailabilityForm(AVAILABILITY_EMPTY);
      await loadScheduling(session);
    } catch (err) {
      setError(normalizeError(err as AppApiError, "Nao foi possivel salvar a disponibilidade."));
    } finally {
      setSaving(false);
    }
  };

  const saveAppointment = async () => {
    if (!session || !appointmentForm.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        serviceId: appointmentForm.serviceId || null,
        resourceId: appointmentForm.resourceId || null,
        title: appointmentForm.title,
        description: appointmentForm.description || null,
        startsAt: fromLocalDateTimeInput(appointmentForm.startsAt),
        endsAt: fromLocalDateTimeInput(appointmentForm.endsAt),
        timezone: appointmentForm.timezone,
        status: appointmentForm.status as AppAppointment["status"],
        source: "manual",
      };
      if (appointmentForm.id) {
        await updateAppAppointment(session, appointmentForm.id, payload);
        setSuccess("Compromisso atualizado.");
      } else {
        await createAppAppointment(session, payload);
        setSuccess("Compromisso criado.");
      }
      setAppointmentForm(APPOINTMENT_EMPTY);
      await loadScheduling(session);
    } catch (err) {
      setError(normalizeError(err as AppApiError, "Nao foi possivel salvar o compromisso."));
    } finally {
      setSaving(false);
    }
  };

  if (!session) return <main className="min-h-screen bg-slate-950" />;

  return (
    <AppShell
      session={session}
      title="Agendamentos"
      subtitle="Servicos, recursos, disponibilidade e compromissos por tenant."
    >
      <div className="space-y-4">
        <FeedbackToast message={success} variant="success" {...toastHandlers} />
        <FeedbackToast message={error} variant="error" {...toastHandlers} />

        <section className="grid gap-3 md:grid-cols-4">
          <Metric label="Servicos" value={services.length} />
          <Metric label="Recursos" value={resources.length} />
          <Metric label="Disponibilidades" value={availabilities.length} />
          <Metric label="Compromissos ativos" value={futureAppointments} />
        </section>

        <section className="rounded-lg border theme-surface p-2">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              ["services", "Servicos"],
              ["resources", "Recursos"],
              ["availability", "Disponibilidade"],
              ["appointments", "Compromissos"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={`rounded-md px-3 py-2 text-sm ${tab === key ? "theme-nav-link-active" : "theme-nav-link"}`}
                onClick={() => setTab(key as TabKey)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {loading ? <p className="theme-muted">Carregando agenda...</p> : null}

        {tab === "services" ? (
          <TwoColumn>
            <Panel title={serviceForm.id ? "Editar servico" : "Novo servico"}>
              <TextInput label="Nome" value={serviceForm.name} onChange={(name) => setServiceForm((prev) => ({ ...prev, name }))} />
              <TextArea label="Descricao" value={serviceForm.description} onChange={(description) => setServiceForm((prev) => ({ ...prev, description }))} />
              <NumberInput label="Duracao em minutos" value={serviceForm.durationMinutes} onChange={(durationMinutes) => setServiceForm((prev) => ({ ...prev, durationMinutes }))} />
              <StatusSelect value={serviceForm.status} onChange={(status) => setServiceForm((prev) => ({ ...prev, status }))} />
              <label className="flex items-center gap-2 text-sm theme-text">
                <input
                  type="checkbox"
                  checked={serviceForm.requiresApproval}
                  onChange={(event) => setServiceForm((prev) => ({ ...prev, requiresApproval: event.target.checked }))}
                />
                Requer aprovacao
              </label>
              <FormActions saving={saving} onNew={() => setServiceForm(SERVICE_EMPTY)} onSave={saveService} />
            </Panel>
            <ListPanel title="Servicos cadastrados">
              {services.map((item) => (
                <ListItem key={item.id} title={item.name} subtitle={`${item.durationMinutes} min`} status={item.status} onEdit={() => setServiceForm({
                  id: item.id,
                  name: item.name,
                  description: item.description ?? "",
                  durationMinutes: item.durationMinutes,
                  bufferBeforeMinutes: item.bufferBeforeMinutes,
                  bufferAfterMinutes: item.bufferAfterMinutes,
                  requiresApproval: item.requiresApproval,
                  status: item.status,
                })} />
              ))}
            </ListPanel>
          </TwoColumn>
        ) : null}

        {tab === "resources" ? (
          <TwoColumn>
            <Panel title={resourceForm.id ? "Editar recurso" : "Novo recurso"}>
              <TextInput label="Nome" value={resourceForm.name} onChange={(name) => setResourceForm((prev) => ({ ...prev, name }))} />
              <TextInput label="Tipo" value={resourceForm.type} onChange={(type) => setResourceForm((prev) => ({ ...prev, type }))} />
              <TextArea label="Descricao" value={resourceForm.description} onChange={(description) => setResourceForm((prev) => ({ ...prev, description }))} />
              <NumberInput label="Capacidade" value={resourceForm.capacity} onChange={(capacity) => setResourceForm((prev) => ({ ...prev, capacity }))} />
              <StatusSelect value={resourceForm.status} onChange={(status) => setResourceForm((prev) => ({ ...prev, status }))} />
              <FormActions saving={saving} onNew={() => setResourceForm(RESOURCE_EMPTY)} onSave={saveResource} />
            </Panel>
            <ListPanel title="Recursos cadastrados">
              {resources.map((item) => (
                <ListItem key={item.id} title={item.name} subtitle={`${item.type} · capacidade ${item.capacity}`} status={item.status} onEdit={() => setResourceForm({
                  id: item.id,
                  name: item.name,
                  description: item.description ?? "",
                  type: item.type,
                  capacity: item.capacity,
                  status: item.status,
                })} />
              ))}
            </ListPanel>
          </TwoColumn>
        ) : null}

        {tab === "availability" ? (
          <TwoColumn>
            <Panel title={availabilityForm.id ? "Editar disponibilidade" : "Nova disponibilidade"}>
              <SelectInput label="Servico" value={availabilityForm.serviceId} onChange={(serviceId) => setAvailabilityForm((prev) => ({ ...prev, serviceId }))} options={[["", "Qualquer servico"], ...activeServices.map((item) => [item.id, item.name] as [string, string])]} />
              <SelectInput label="Recurso" value={availabilityForm.resourceId} onChange={(resourceId) => setAvailabilityForm((prev) => ({ ...prev, resourceId }))} options={[["", "Qualquer recurso"], ...activeResources.map((item) => [item.id, item.name] as [string, string])]} />
              <SelectInput label="Dia da semana" value={String(availabilityForm.weekday)} onChange={(weekday) => setAvailabilityForm((prev) => ({ ...prev, weekday: Number(weekday) }))} options={WEEKDAYS.map((label, index) => [String(index), label] as [string, string])} />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput label="Inicio" value={availabilityForm.startsAtLocal} onChange={(startsAtLocal) => setAvailabilityForm((prev) => ({ ...prev, startsAtLocal }))} type="time" />
                <TextInput label="Fim" value={availabilityForm.endsAtLocal} onChange={(endsAtLocal) => setAvailabilityForm((prev) => ({ ...prev, endsAtLocal }))} type="time" />
              </div>
              <StatusSelect value={availabilityForm.status} onChange={(status) => setAvailabilityForm((prev) => ({ ...prev, status }))} />
              <FormActions saving={saving} onNew={() => setAvailabilityForm(AVAILABILITY_EMPTY)} onSave={saveAvailability} />
            </Panel>
            <ListPanel title="Janelas cadastradas">
              {availabilities.map((item) => (
                <ListItem key={item.id} title={`${WEEKDAYS[item.weekday]} ${item.startsAtLocal}-${item.endsAtLocal}`} subtitle={`${services.find((service) => service.id === item.serviceId)?.name ?? "Qualquer servico"} · ${resources.find((resource) => resource.id === item.resourceId)?.name ?? "Qualquer recurso"}`} status={item.status} onEdit={() => setAvailabilityForm({
                  id: item.id,
                  serviceId: item.serviceId ?? "",
                  resourceId: item.resourceId ?? "",
                  weekday: item.weekday,
                  startsAtLocal: item.startsAtLocal,
                  endsAtLocal: item.endsAtLocal,
                  timezone: item.timezone,
                  status: item.status,
                })} />
              ))}
            </ListPanel>
          </TwoColumn>
        ) : null}

        {tab === "appointments" ? (
          <TwoColumn>
            <Panel title={appointmentForm.id ? "Editar compromisso" : "Novo compromisso"}>
              <TextInput label="Titulo" value={appointmentForm.title} onChange={(title) => setAppointmentForm((prev) => ({ ...prev, title }))} />
              <SelectInput label="Servico" value={appointmentForm.serviceId} onChange={(serviceId) => setAppointmentForm((prev) => ({ ...prev, serviceId }))} options={[["", "Sem servico"], ...activeServices.map((item) => [item.id, item.name] as [string, string])]} />
              <SelectInput label="Recurso" value={appointmentForm.resourceId} onChange={(resourceId) => setAppointmentForm((prev) => ({ ...prev, resourceId }))} options={[["", "Sem recurso"], ...activeResources.map((item) => [item.id, item.name] as [string, string])]} />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput label="Inicio" value={appointmentForm.startsAt} onChange={(startsAt) => setAppointmentForm((prev) => ({ ...prev, startsAt }))} type="datetime-local" />
                <TextInput label="Fim" value={appointmentForm.endsAt} onChange={(endsAt) => setAppointmentForm((prev) => ({ ...prev, endsAt }))} type="datetime-local" />
              </div>
              <TextArea label="Descricao" value={appointmentForm.description} onChange={(description) => setAppointmentForm((prev) => ({ ...prev, description }))} />
              <SelectInput label="Status" value={appointmentForm.status} onChange={(status) => setAppointmentForm((prev) => ({ ...prev, status }))} options={[
                ["scheduled", "Agendado"],
                ["confirmed", "Confirmado"],
                ["rescheduled", "Remarcado"],
                ["cancelled", "Cancelado"],
                ["completed", "Concluido"],
                ["no_show", "Nao compareceu"],
              ]} />
              <FormActions saving={saving} onNew={() => setAppointmentForm(APPOINTMENT_EMPTY)} onSave={saveAppointment} />
            </Panel>
            <ListPanel title="Compromissos">
              {appointments.map((item) => (
                <ListItem key={item.id} title={item.title} subtitle={`${new Date(item.startsAt).toLocaleString("pt-BR")} · ${services.find((service) => service.id === item.serviceId)?.name ?? "sem servico"}`} status={item.status} onEdit={() => setAppointmentForm({
                  id: item.id,
                  serviceId: item.serviceId ?? "",
                  resourceId: item.resourceId ?? "",
                  title: item.title,
                  description: item.description ?? "",
                  startsAt: toLocalDateTimeInput(item.startsAt),
                  endsAt: toLocalDateTimeInput(item.endsAt),
                  timezone: item.timezone,
                  status: item.status,
                })} />
              ))}
            </ListPanel>
          </TwoColumn>
        ) : null}
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border theme-surface p-4">
      <p className="text-xs uppercase tracking-wide theme-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold theme-text">{value}</p>
    </div>
  );
}

function TwoColumn({ children }: { children: ReactNode }) {
  return <section className="grid gap-4 xl:grid-cols-[minmax(300px,420px)_1fr]">{children}</section>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border theme-surface p-4">
      <h2 className="text-sm font-semibold theme-text">{title}</h2>
      {children}
    </div>
  );
}

function ListPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border theme-surface">
      <div className="border-b theme-border px-4 py-3">
        <h2 className="text-sm font-semibold theme-text">{title}</h2>
      </div>
      <div className="max-h-[640px] overflow-y-auto p-2">{children}</div>
    </div>
  );
}

function ListItem({
  title,
  subtitle,
  status,
  onEdit,
}: {
  title: string;
  subtitle: string;
  status: string;
  onEdit: () => void;
}) {
  return (
    <button
      className="mb-2 w-full rounded-lg border p-3 text-left theme-nav-link"
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold theme-text">{title}</p>
          <p className="mt-1 truncate text-xs theme-muted">{subtitle}</p>
        </div>
        <StatusPill status={status} />
      </div>
    </button>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm theme-text">
      <span className="mb-1 block text-xs font-medium theme-muted">{label}</span>
      <input
        className="h-10 w-full rounded-md border theme-select px-3 text-sm"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-sm theme-text">
      <span className="mb-1 block text-xs font-medium theme-muted">{label}</span>
      <input
        className="h-10 w-full rounded-md border theme-select px-3 text-sm"
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm theme-text">
      <span className="mb-1 block text-xs font-medium theme-muted">{label}</span>
      <textarea
        className="min-h-20 w-full rounded-md border theme-select px-3 py-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block text-sm theme-text">
      <span className="mb-1 block text-xs font-medium theme-muted">{label}</span>
      <select
        className="h-10 w-full rounded-md border theme-select px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <SelectInput
      label="Status"
      value={value}
      onChange={onChange}
      options={[
        ["active", "Ativo"],
        ["inactive", "Inativo"],
        ["archived", "Arquivado"],
      ]}
    />
  );
}

function FormActions({
  saving,
  onNew,
  onSave,
}: {
  saving: boolean;
  onNew: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <button className="h-10 rounded-md border px-4 text-sm theme-nav-link" type="button" onClick={onNew}>
        Limpar
      </button>
      <button
        className="h-10 rounded-md border px-4 text-sm theme-nav-link-active"
        type="button"
        onClick={onSave}
        disabled={saving}
      >
        {saving ? "Salvando..." : "Salvar"}
      </button>
    </div>
  );
}
