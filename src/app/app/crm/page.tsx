"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppCrmContactItem,
  AppCrmContactsResponse,
  AppSession,
  clearAppSession,
  fetchAppCrmContacts,
  fetchAppCrmStatuses,
  loadAppSession,
  saveAppSession,
} from "@/lib/appClientApi";
import { hasCapability } from "@/lib/appFeatures";

const PAGE_LIMIT = 50;

const CHANNEL_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "messenger", label: "Messenger" },
  { value: "webchat", label: "Webchat" },
  { value: "telegram", label: "Telegram" },
];

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatNumber(value: number | undefined) {
  return new Intl.NumberFormat("pt-BR").format(value ?? 0);
}

function normalizeAppErrorMessage(error: AppApiError, fallback: string) {
  if (error.status === 401) return "Sessao expirada. Faca login novamente.";
  if (error.status === 403) return "CRM indisponivel para este usuario ou tenant.";
  return error.message || fallback;
}

function getChannelLabel(channel: string | null) {
  switch ((channel ?? "").toLowerCase()) {
    case "whatsapp":
      return "WhatsApp";
    case "instagram":
      return "Instagram";
    case "messenger":
      return "Messenger";
    case "webchat":
      return "Webchat";
    case "telegram":
      return "Telegram";
    default:
      return channel || "Canal";
  }
}

function getConversationStatusLabel(status: string | null) {
  switch (status) {
    case "WAITING":
      return "Aguardando atendimento";
    case "IN_PROGRESS":
      return "Em atendimento";
    case "WAITING_USER":
      return "Aguardando cliente";
    case "CLOSED":
      return "Fechado";
    default:
      return status || "-";
  }
}

function getTemplateHint(item: AppCrmContactItem) {
  if (item.canStartWhatsappTemplateCandidate) return "Elegivel para template futuro";
  switch (item.templateSendBlockedReason) {
    case "not_whatsapp":
      return "Canal sem inicio ativo";
    case "missing_phone":
      return "Sem telefone valido";
    case "opt_out":
      return "Descadastrado";
    case "unsupported_channel":
      return "Canal nao suportado";
    default:
      return "Indisponivel";
  }
}

function getDisplayName(item: AppCrmContactItem) {
  return item.displayName || item.identifierDisplay || "Contato";
}

function CrmContactsSkeleton() {
  return (
    <div className="theme-surface rounded-xl border shadow-sm">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="grid gap-3 border-b border-white/10 p-4 last:border-b-0 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <div className="h-4 w-40 animate-pulse rounded bg-white/20" />
            <div className="mt-2 h-3 w-28 animate-pulse rounded bg-white/10" />
          </div>
          <div className="h-4 w-24 animate-pulse rounded bg-white/15" />
          <div className="h-4 w-28 animate-pulse rounded bg-white/15" />
          <div className="h-4 w-32 animate-pulse rounded bg-white/15" />
        </div>
      ))}
    </div>
  );
}

function CrmContactRow({
  item,
  onOpenConversation,
  onCopyIdentifier,
}: {
  item: AppCrmContactItem;
  onOpenConversation: (item: AppCrmContactItem) => void;
  onCopyIdentifier: (item: AppCrmContactItem) => void;
}) {
  const identifier = item.phoneDisplay || item.identifierDisplay;
  const canOpenConversation = Boolean(item.lastConversationIdentity || item.lastConversationId);
  return (
    <tr className="border-b border-white/10 align-top transition hover:bg-white/[0.04]">
      <td className="px-4 py-3">
        <div className="font-semibold text-white">{getDisplayName(item)}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs theme-muted">
          <span>{identifier}</span>
          {item.activeOptOut ? (
            <span className="rounded-full border border-rose-300/30 bg-rose-400/10 px-2 py-0.5 text-rose-100">
              Opt-out
            </span>
          ) : null}
        </div>
        {item.email ? <div className="mt-1 text-xs theme-muted">{item.email}</div> : null}
      </td>
      <td className="px-4 py-3">
        <div className="text-sm text-white">{item.companyName || "-"}</div>
        {item.city ? <div className="mt-1 text-xs theme-muted">{item.city}</div> : null}
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex rounded-full border border-white/10 bg-white/7 px-2 py-1 text-xs font-semibold text-white/80">
          {getChannelLabel(item.channel)}
        </span>
        <div className="mt-2 text-xs theme-muted">{item.provider || "-"}</div>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm font-semibold text-white">{item.crmStatusLabel}</div>
        <div className="mt-1 text-xs theme-muted">{item.crmStatus}</div>
      </td>
      <td className="px-4 py-3">
        {canOpenConversation ? (
          <button
            type="button"
            onClick={() => onOpenConversation(item)}
            className="text-left text-sm font-semibold text-re7-sky transition hover:brightness-125"
          >
            {item.lastProtocol || "Abrir conversa"}
          </button>
        ) : (
          <span className="text-sm theme-muted">Sem conversa</span>
        )}
        <div className="mt-1 text-xs theme-muted">
          {getConversationStatusLabel(item.lastConversationStatus)}
        </div>
        <div className="mt-1 text-xs theme-muted">
          {item.conversationsCount ? `${item.conversationsCount} conversa(s)` : "Nenhum historico"}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm text-white">{formatDateTime(item.updatedAt)}</div>
        {item.importedSource ? (
          <div className="mt-1 text-xs theme-muted">Origem: {item.importedSource}</div>
        ) : null}
        <div className="mt-1 text-xs theme-muted">{getTemplateHint(item)}</div>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onCopyIdentifier(item)}
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-semibold theme-nav-link transition"
          >
            Copiar ID seguro
          </button>
          <button
            type="button"
            onClick={() => onOpenConversation(item)}
            disabled={!canOpenConversation}
            className="rounded-md bg-re7-sky px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Abrir no Inbox
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function AppCrmContactsPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [contacts, setContacts] = useState<AppCrmContactsResponse | null>(null);
  const [statuses, setStatuses] = useState<Array<{ id: string; label: string; isActive?: boolean }>>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [hasConversation, setHasConversation] = useState("");
  const [optOut, setOptOut] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || notice), () => {
    setError(null);
    setNotice(null);
  });

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const buildFilters = useCallback(
    (targetPage = page) => ({
      q: q || null,
      status: status || null,
      channel: channel || null,
      hasConversation: hasConversation === "" ? null : hasConversation === "true",
      optOut: optOut === "" ? null : optOut === "true",
      page: targetPage,
      limit: PAGE_LIMIT,
    }),
    [channel, hasConversation, optOut, page, q, status]
  );

  const loadContacts = useCallback(
    async (activeSession: AppSession, targetPage = page) => {
      const response = await fetchAppCrmContacts(activeSession, buildFilters(targetPage));
      setContacts(response);
    },
    [buildFilters, page]
  );

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    saveAppSession(stored);
    setSession(stored);
    if (!hasCapability(stored, "crm")) {
      setLoading(false);
      setError("CRM indisponivel para este tenant.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchAppCrmStatuses(stored), fetchAppCrmContacts(stored, { page: 1, limit: PAGE_LIMIT })])
      .then(([statusesResponse, contactsResponse]) => {
        if (cancelled) return;
        setStatuses(statusesResponse.settings.crmBusinessStatuses.filter((item) => item.isActive !== false));
        setContacts(contactsResponse);
      })
      .catch((err) => {
        if (cancelled) return;
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(normalizeAppErrorMessage(typed, "Nao foi possivel carregar contatos CRM."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, router]);

  const applyFilters = useCallback(() => {
    if (!session) return;
    setLoading(true);
    setError(null);
    setPage(1);
    loadContacts(session, 1)
      .catch((err) => {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(normalizeAppErrorMessage(typed, "Nao foi possivel aplicar filtros."));
      })
      .finally(() => setLoading(false));
  }, [handleUnauthorized, loadContacts, session]);

  const clearFilters = useCallback(() => {
    setQ("");
    setStatus("");
    setChannel("");
    setHasConversation("");
    setOptOut("");
    setPage(1);
    if (!session) return;
    setLoading(true);
    setError(null);
    fetchAppCrmContacts(session, { page: 1, limit: PAGE_LIMIT })
      .then(setContacts)
      .catch((err) => {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(normalizeAppErrorMessage(typed, "Nao foi possivel limpar filtros."));
      })
      .finally(() => setLoading(false));
  }, [handleUnauthorized, session]);

  const goToPage = useCallback(
    (targetPage: number) => {
      if (!session) return;
      const safePage = Math.max(1, targetPage);
      setLoading(true);
      setError(null);
      setPage(safePage);
      loadContacts(session, safePage)
        .catch((err) => {
          const typed = err as AppApiError;
          if (typed.status === 401) {
            handleUnauthorized();
            return;
          }
          setError(normalizeAppErrorMessage(typed, "Nao foi possivel carregar a pagina."));
        })
        .finally(() => setLoading(false));
    },
    [handleUnauthorized, loadContacts, session]
  );

  const openConversation = useCallback(
    (item: AppCrmContactItem) => {
      const conversationIdentity = item.lastConversationIdentity || item.lastConversationId;
      if (!conversationIdentity) return;
      router.push(`/app/inbox?conversation=${encodeURIComponent(conversationIdentity)}`);
    },
    [router]
  );

  const copyIdentifier = useCallback(async (item: AppCrmContactItem) => {
    const value = item.phoneDisplay || item.identifierDisplay;
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Identificador seguro copiado.");
    } catch {
      setError("Nao foi possivel copiar o identificador.");
    }
  }, []);

  const emptyWithFilters = useMemo(
    () => Boolean(q || status || channel || hasConversation || optOut),
    [channel, hasConversation, optOut, q, status]
  );

  if (!session) {
    return (
      <main className="theme-bg flex min-h-screen items-center justify-center">
        <p className="theme-muted text-sm">Carregando...</p>
      </main>
    );
  }

  return (
    <AppShell
      session={session}
      title="Contatos"
      subtitle="Lista operacional de contatos e leads CRM por tenant."
    >
      <section className="grid min-h-0 gap-4">
        <div className="sticky top-[230px] z-30 grid gap-3 sm:top-[244px] lg:top-[144px] min-[1441px]:top-[196px]">
          <div className="theme-surface-strong rounded-xl border p-4 shadow-sm">
            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto_auto] lg:items-end">
              <label className="grid gap-1.5 text-sm">
                <span className="theme-soft text-xs font-semibold uppercase tracking-[0.14em]">Busca</span>
                <input
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") applyFilters();
                  }}
                  className="theme-input h-10 rounded-md border px-3 text-sm"
                  placeholder="Nome, empresa, email ou telefone"
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="theme-soft text-xs font-semibold uppercase tracking-[0.14em]">Situacao</span>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="theme-input h-10 rounded-md border px-3 text-sm"
                >
                  <option value="">Todas</option>
                  {statuses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="theme-soft text-xs font-semibold uppercase tracking-[0.14em]">Canal</span>
                <select
                  value={channel}
                  onChange={(event) => setChannel(event.target.value)}
                  className="theme-input h-10 rounded-md border px-3 text-sm"
                >
                  {CHANNEL_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="theme-soft text-xs font-semibold uppercase tracking-[0.14em]">Historico</span>
                <select
                  value={hasConversation}
                  onChange={(event) => setHasConversation(event.target.value)}
                  className="theme-input h-10 rounded-md border px-3 text-sm"
                >
                  <option value="">Todos</option>
                  <option value="true">Com conversa</option>
                  <option value="false">Sem conversa</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="theme-soft text-xs font-semibold uppercase tracking-[0.14em]">Opt-out</span>
                <select
                  value={optOut}
                  onChange={(event) => setOptOut(event.target.value)}
                  className="theme-input h-10 rounded-md border px-3 text-sm"
                >
                  <option value="">Todos</option>
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </label>
              <button
                type="button"
                onClick={applyFilters}
                disabled={loading}
                className="h-10 rounded-md bg-re7-sky px-4 text-sm font-semibold text-slate-950 shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Atualizando..." : "Aplicar"}
              </button>
              <button
                type="button"
                onClick={clearFilters}
                disabled={loading}
                className="theme-nav-link h-10 rounded-md border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                Limpar
              </button>
            </div>
          </div>

          <div className="theme-surface flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm theme-muted shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                {contacts
                  ? `${formatNumber(contacts.pagination.total)} contato(s) encontrados`
                  : "Carregando contatos"}
              </span>
              {contacts ? (
                <span>
                  Pagina {contacts.pagination.page} de {Math.max(contacts.pagination.totalPages, 1)}
                </span>
              ) : null}
            </div>
            {contacts ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goToPage(page - 1)}
                  disabled={!contacts.pagination.hasPreviousPage || loading}
                  className="theme-nav-link rounded-md border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>
                <span className="text-xs theme-muted">
                  {formatNumber(contacts.items.length)} nesta pagina
                </span>
                <button
                  type="button"
                  onClick={() => goToPage(page + 1)}
                  disabled={!contacts.pagination.hasNextPage || loading}
                  className="theme-nav-link rounded-md border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Proxima
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {loading && !contacts ? (
          <CrmContactsSkeleton />
        ) : error && !contacts ? (
          <div className="theme-surface rounded-xl border p-8 text-center">
            <h2 className="text-base font-semibold text-white">CRM indisponivel</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm theme-muted">{error}</p>
            <button
              type="button"
              onClick={applyFilters}
              className="mt-4 rounded-md bg-re7-sky px-4 py-2 text-sm font-semibold text-slate-950"
            >
              Tentar novamente
            </button>
          </div>
        ) : contacts && contacts.items.length === 0 ? (
          <div className="theme-surface rounded-xl border p-8 text-center">
            <h2 className="text-base font-semibold text-white">
              {emptyWithFilters ? "Nenhum contato encontrado" : "Nenhum contato CRM cadastrado"}
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm theme-muted">
              {emptyWithFilters
                ? "Revise os filtros aplicados ou limpe a busca para ver toda a base disponivel."
                : "Quando leads ou contatos forem criados pelo atendimento, importacao ou canais, eles aparecerao aqui."}
            </p>
          </div>
        ) : contacts ? (
          <div className="theme-surface overflow-hidden rounded-xl border shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-[1120px] w-full text-left text-sm">
                <thead className="border-b border-white/10 bg-white/[0.04] text-xs uppercase tracking-[0.12em] theme-soft">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Contato</th>
                    <th className="px-4 py-3 font-semibold">Empresa</th>
                    <th className="px-4 py-3 font-semibold">Canal</th>
                    <th className="px-4 py-3 font-semibold">Situacao</th>
                    <th className="px-4 py-3 font-semibold">Ultima conversa</th>
                    <th className="px-4 py-3 font-semibold">Atualizacao</th>
                    <th className="px-4 py-3 text-right font-semibold">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.items.map((item) => (
                    <CrmContactRow
                      key={item.leadId}
                      item={item}
                      onOpenConversation={openConversation}
                      onCopyIdentifier={copyIdentifier}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
      {error && contacts ? (
        <FeedbackToast variant="error" message={error} {...toastHandlers} />
      ) : null}
      {notice ? <FeedbackToast variant="success" message={notice} {...toastHandlers} /> : null}
    </AppShell>
  );
}
