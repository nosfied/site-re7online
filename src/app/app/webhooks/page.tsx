"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppSession,
  AppWebhookAttempt,
  AppWebhookDelivery,
  AppWebhookEndpoint,
  clearAppSession,
  createAppWebhookEndpoint,
  fetchAppWebhooks,
  loadAppSession,
  rotateAppWebhookEndpointSecret,
  saveAppSession,
  updateAppWebhookEndpoint,
} from "@/lib/appClientApi";
import { formatDateTime } from "@/lib/whatsappAdminApi";

function canManageWebhooks(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function EndpointStatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
        active
          ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
          : "border-white/15 bg-white/5 text-white/60"
      }`}
    >
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}

function SecretStatusPill({ status }: { status?: string }) {
  const encrypted = status === "encrypted";
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
        encrypted
          ? "border-sky-300/30 bg-sky-500/15 text-sky-100"
          : "border-amber-300/30 bg-amber-500/15 text-amber-100"
      }`}
    >
      {encrypted ? "Segredo criptografado" : "Legado"}
    </span>
  );
}

function DeliveryStatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone =
    normalized === "sent" || normalized === "delivered"
      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
      : normalized === "failed" || normalized === "dead_letter"
        ? "border-rose-400/30 bg-rose-500/15 text-rose-100"
        : "border-amber-300/30 bg-amber-500/15 text-amber-100";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>{status}</span>;
}

export default function AppWebhooksPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [endpoints, setEndpoints] = useState<AppWebhookEndpoint[]>([]);
  const [deliveries, setDeliveries] = useState<AppWebhookDelivery[]>([]);
  const [attempts, setAttempts] = useState<AppWebhookAttempt[]>([]);
  const [supportedEvents, setSupportedEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingUrl, setEditingUrl] = useState("");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || success), () => {
    setError(null);
    setSuccess(null);
  });

  const activeEndpoints = useMemo(() => endpoints.filter((item) => item.active), [endpoints]);

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const loadWebhooks = useCallback(async (activeSession: AppSession) => {
    const response = await fetchAppWebhooks(activeSession);
    setEndpoints(response.endpoints);
    setDeliveries(response.deliveries);
    setAttempts(response.attempts);
    setSupportedEvents(response.supportedEvents);
  }, []);

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    if (!canManageWebhooks(stored.user.role) || !stored.features.webhooks) {
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
    loadWebhooks(session)
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
        setError(typed.message || "Nao foi possivel carregar webhooks.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, loadWebhooks, router, session]);

  const handleCreate = async () => {
    if (!session) return;
    if (!name.trim()) {
      setError("Informe um nome para o endpoint.");
      return;
    }
    if (!url.trim()) {
      setError("Informe uma URL HTTPS para o endpoint.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    setCreatedSecret(null);
    try {
      const response = await createAppWebhookEndpoint(session, { name, url });
      setEndpoints((current) => [response.endpoint, ...current.filter((item) => item.id !== response.endpoint.id)]);
      setCreatedSecret(response.secret);
      setName("");
      setUrl("");
      setSuccess("Endpoint criado.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(typed.message || "Nao foi possivel criar o webhook.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (endpoint: AppWebhookEndpoint) => {
    if (!session) return;
    setUpdatingId(endpoint.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await updateAppWebhookEndpoint(session, endpoint.id, { active: !endpoint.active });
      setEndpoints((current) => current.map((item) => (item.id === response.endpoint.id ? response.endpoint : item)));
      setSuccess(response.endpoint.active ? "Endpoint ativado." : "Endpoint desativado.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(typed.message || "Nao foi possivel atualizar o webhook.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRotateSecret = async (endpoint: AppWebhookEndpoint) => {
    if (!session) return;
    setUpdatingId(endpoint.id);
    setError(null);
    setSuccess(null);
    setCreatedSecret(null);
    try {
      const response = await rotateAppWebhookEndpointSecret(session, endpoint.id);
      setEndpoints((current) => current.map((item) => (item.id === response.endpoint.id ? response.endpoint : item)));
      setCreatedSecret(response.secret);
      setSuccess("Segredo rotacionado.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(typed.message || "Nao foi possivel rotacionar o segredo.");
    } finally {
      setUpdatingId(null);
    }
  };

  const startEdit = (endpoint: AppWebhookEndpoint) => {
    setEditingId(endpoint.id);
    setEditingName(endpoint.name);
    setEditingUrl(endpoint.url);
    setError(null);
    setSuccess(null);
  };

  const handleSaveEdit = async (endpoint: AppWebhookEndpoint) => {
    if (!session) return;
    if (!editingName.trim() || !editingUrl.trim()) {
      setError("Informe nome e URL para atualizar o endpoint.");
      return;
    }
    setUpdatingId(endpoint.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await updateAppWebhookEndpoint(session, endpoint.id, {
        name: editingName,
        url: editingUrl,
      });
      setEndpoints((current) => current.map((item) => (item.id === response.endpoint.id ? response.endpoint : item)));
      setEditingId(null);
      setSuccess("Endpoint atualizado.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(typed.message || "Nao foi possivel atualizar o webhook.");
    } finally {
      setUpdatingId(null);
    }
  };

  const copySecret = async () => {
    if (!createdSecret) return;
    await navigator.clipboard.writeText(createdSecret);
    setSuccess("Segredo copiado.");
  };

  if (!session) {
    return <main className="min-h-screen bg-re7-navy" />;
  }

  return (
    <AppShell
      session={session}
      title="Webhooks"
      subtitle="Endpoints tenant-scoped para integracoes externas. Entregas automaticas ainda nao estao habilitadas."
    >
      <FeedbackToast
        message={error || success}
        variant={error ? "error" : "success"}
        onMouseEnter={toastHandlers.onMouseEnter}
        onMouseLeave={toastHandlers.onMouseLeave}
        onFocus={toastHandlers.onFocus}
        onBlur={toastHandlers.onBlur}
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <article className="theme-surface min-w-0 rounded-xl border p-4">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white">Novo endpoint</h2>
              <p className="mt-1 text-sm text-white/60">Use URL HTTPS publica. O segredo e exibido uma unica vez.</p>
            </div>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70">
              {activeEndpoints.length} ativo{activeEndpoints.length === 1 ? "" : "s"}
            </span>
          </div>

          {createdSecret ? (
            <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-500/15 p-3">
              <p className="text-sm font-semibold text-amber-100">Copie agora</p>
              <p className="mt-1 text-xs text-amber-100/80">
                Este segredo nao sera exibido novamente apos sair desta tela.
              </p>
              <code className="mt-3 block max-w-full overflow-x-auto rounded-md bg-black/30 px-3 py-2 text-xs text-white">
                {createdSecret}
              </code>
              <button className="theme-nav-link mt-3 rounded-md border px-3 py-1.5 text-xs font-semibold" onClick={copySecret}>
                Copiar segredo
              </button>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold text-white/80">Nome</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Barramento municipal"
                className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
              />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold text-white/80">URL</span>
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://integracao.exemplo.gov.br/webhooks/converta"
                className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
              />
            </label>

            <button
              onClick={handleCreate}
              disabled={saving}
              className="theme-nav-link-active mt-2 rounded-md border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Criando..." : "Criar endpoint"}
            </button>
          </div>
        </article>

        <article className="theme-surface min-w-0 rounded-xl border p-4">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">Endpoints</h2>
              <p className="mt-1 text-sm text-white/60">
                {supportedEvents.length} evento{supportedEvents.length === 1 ? "" : "s"} planejado
                {supportedEvents.length === 1 ? "" : "s"} para disparo futuro.
              </p>
            </div>
          </div>

          {loading ? (
            <p className="mt-6 text-sm text-white/60">Carregando webhooks...</p>
          ) : endpoints.length === 0 ? (
            <p className="mt-6 text-sm text-white/60">Nenhum endpoint configurado para este tenant.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {endpoints.map((endpoint) => (
                <div key={endpoint.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  {editingId === endpoint.id ? (
                    <div className="grid gap-2">
                      <label className="grid gap-1 text-xs text-white/70">
                        Nome
                        <input
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                        />
                      </label>
                      <label className="grid gap-1 text-xs text-white/70">
                        URL
                        <input
                          value={editingUrl}
                          onChange={(event) => setEditingUrl(event.target.value)}
                          className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleSaveEdit(endpoint)}
                          disabled={updatingId === endpoint.id}
                          className="theme-nav-link-active rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                        >
                          Salvar
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="theme-nav-link rounded-md border px-3 py-1.5 text-xs font-semibold"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="break-words text-sm font-semibold text-white">{endpoint.name}</h3>
                            <EndpointStatusPill active={endpoint.active} />
                            <SecretStatusPill status={endpoint.secretStatus} />
                          </div>
                          <p className="mt-1 break-all font-mono text-xs text-white/55">{endpoint.url}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => startEdit(endpoint)}
                            className="theme-nav-link rounded-md border px-3 py-1.5 text-xs font-semibold"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleToggle(endpoint)}
                            disabled={updatingId === endpoint.id}
                            className="theme-nav-link rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                          >
                            {endpoint.active ? "Desativar" : "Ativar"}
                          </button>
                          <button
                            onClick={() => handleRotateSecret(endpoint)}
                            disabled={updatingId === endpoint.id}
                            className="theme-nav-link rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                          >
                            Rotacionar segredo
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-1 text-xs text-white/45 sm:grid-cols-2">
                        <span>Criado em {formatDateTime(endpoint.createdAt)}</span>
                        <span>
                          {endpoint.signingSecretRotatedAt
                            ? `Segredo rotacionado em ${formatDateTime(endpoint.signingSecretRotatedAt)}`
                            : `Atualizado em ${formatDateTime(endpoint.updatedAt)}`}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <article className="theme-surface min-w-0 rounded-xl border p-4">
          <h2 className="text-base font-semibold text-white">Deliveries</h2>
          {deliveries.length === 0 ? (
            <p className="mt-4 text-sm text-white/60">Nenhuma entrega registrada.</p>
          ) : (
            <div className="mt-4 grid gap-2">
              {deliveries.map((delivery) => (
                <div key={delivery.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-white/60">{delivery.eventType}</span>
                    <DeliveryStatusPill status={delivery.status} />
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-white/45">payloadHash {delivery.payloadHash}</p>
                  <p className="mt-1 text-xs text-white/45">{formatDateTime(delivery.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="theme-surface min-w-0 rounded-xl border p-4">
          <h2 className="text-base font-semibold text-white">Attempts</h2>
          {attempts.length === 0 ? (
            <p className="mt-4 text-sm text-white/60">Nenhuma tentativa registrada.</p>
          ) : (
            <div className="mt-4 grid gap-2">
              {attempts.map((attempt) => (
                <div key={attempt.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-white/60">#{attempt.attemptNumber}</span>
                    <DeliveryStatusPill status={attempt.status} />
                  </div>
                  <p className="mt-2 text-xs text-white/45">
                    HTTP {attempt.responseCode ?? "-"} · {formatDateTime(attempt.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </AppShell>
  );
}
