"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppSearchIndex,
  AppSession,
  clearAppSession,
  fetchAppSearch,
  loadAppSession,
  saveAppSession,
} from "@/lib/appClientApi";
import { formatDateTime } from "@/lib/whatsappAdminApi";

function canViewAdvancedSearch(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function normalizeError(error: AppApiError) {
  if (error.status === 401) return "Sessao expirada. Faca login novamente.";
  if (error.errorCode === "advanced_search_runtime_disabled") {
    return "Busca textual ainda nao esta habilitada para este tenant. A tela permanece em modo diagnostico.";
  }
  if (error.status === 403 || error.errorCode === "feature_not_enabled") {
    return "Busca avancada nao esta habilitada para este tenant.";
  }
  return error.message || "Nao foi possivel carregar busca avancada.";
}

type SearchFilters = {
  query: string;
  entityType: string;
  channel: string;
  source: string;
  language: string;
};

const initialFilters: SearchFilters = {
  query: "",
  entityType: "",
  channel: "",
  source: "",
  language: "",
};

export default function SearchPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const [indexes, setIndexes] = useState<AppSearchIndex[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [runtimeEnabled, setRuntimeEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error), () => setError(null));

  const stats = useMemo(() => {
    const entityTypes = new Set(indexes.map((item) => item.entityType)).size;
    const channels = new Set(indexes.map((item) => item.channel).filter(Boolean)).size;
    return {
      total: indexes.length,
      entityTypes,
      channels,
    };
  }, [indexes]);

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const loadSearch = useCallback(
    async (activeSession: AppSession, nextFilters: SearchFilters, cursor: string | null = null) => {
      const append = Boolean(cursor);
      setLoading(true);
      setError(null);
      try {
        const response = await fetchAppSearch(activeSession, {
          query: nextFilters.query,
          entityType: nextFilters.entityType,
          channel: nextFilters.channel,
          source: nextFilters.source,
          language: nextFilters.language,
          cursor: cursor ?? undefined,
          limit: 50,
        });
        setRuntimeEnabled(response.runtimeEnabled);
        setNextCursor(response.pageInfo.nextCursor);
        setIndexes((current) => (append ? [...current, ...response.indexes] : response.indexes));
      } catch (err) {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        if (typed.status === 403 && typed.errorCode !== "advanced_search_runtime_disabled") {
          router.replace("/app/inbox");
          return;
        }
        setError(normalizeError(typed));
      } finally {
        setLoading(false);
      }
    },
    [handleUnauthorized, router]
  );

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored) {
      router.replace("/app/login");
      return;
    }
    if (!canViewAdvancedSearch(stored.user.role) || !stored.features.advancedSearch) {
      router.replace("/app/inbox");
      return;
    }
    saveAppSession(stored);
    setSession(stored);
    void loadSearch(stored, initialFilters);
  }, [loadSearch, router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    void loadSearch(session, filters);
  }

  function handleLoadMore() {
    if (!session || !nextCursor) return;
    void loadSearch(session, filters, nextCursor);
  }

  if (!session) return null;

  return (
    <AppShell
      session={session}
      title="Busca avancada"
      subtitle="Busca tenant-scoped sobre o indice operacional. Sem IA, sem semantica e sem indexacao automatica."
    >
      {error ? <FeedbackToast variant="error" message={error} {...toastHandlers} /> : null}

      <section className="grid gap-3 md:grid-cols-3">
        <Metric label="Registros" value={stats.total} />
        <Metric label="Entidades" value={stats.entityTypes} />
        <Metric label="Canais" value={stats.channels} />
      </section>

      {!runtimeEnabled ? (
        <div className="mt-5 rounded-lg border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          Modo diagnostico ativo. A busca textual sera liberada para tenants piloto; filtros sem texto continuam
          disponiveis para validacao do indice.
        </div>
      ) : null}

      <section className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <form className="grid gap-3 md:grid-cols-6" onSubmit={handleSubmit}>
          <label className="md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide theme-muted">Texto</span>
            <input
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-cyan-300"
              placeholder="Nome, telefone, mensagem"
            />
          </label>
          <FilterInput
            label="Entidade"
            value={filters.entityType}
            placeholder="message"
            onChange={(value) => setFilters((current) => ({ ...current, entityType: value }))}
          />
          <FilterInput
            label="Canal"
            value={filters.channel}
            placeholder="whatsapp"
            onChange={(value) => setFilters((current) => ({ ...current, channel: value }))}
          />
          <FilterInput
            label="Fonte"
            value={filters.source}
            placeholder="inbound_message"
            onChange={(value) => setFilters((current) => ({ ...current, source: value }))}
          />
          <FilterInput
            label="Idioma"
            value={filters.language}
            placeholder="pt-BR"
            onChange={(value) => setFilters((current) => ({ ...current, language: value }))}
          />
          <div className="flex items-end gap-2 md:col-span-6">
            <button
              type="submit"
              className="rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200"
            >
              Buscar
            </button>
            <button
              type="button"
              onClick={() => {
                setFilters(initialFilters);
                setNextCursor(null);
                void loadSearch(session, initialFilters);
              }}
              className="rounded-md border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
            >
              Limpar
            </button>
          </div>
        </form>
      </section>

      <section className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Indice</h2>
            <p className="mt-1 text-sm theme-muted">Resultados do SearchIndex com filtros e snippet limitado.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadSearch(session, filters)}
            className="rounded-md border border-white/15 px-3 py-2 text-sm hover:bg-white/10"
          >
            Atualizar
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="theme-muted">
              <tr className="border-b border-white/10">
                <th className="px-3 py-2 font-medium">Entidade</th>
                <th className="px-3 py-2 font-medium">Canal</th>
                <th className="px-3 py-2 font-medium">Fonte</th>
                <th className="px-3 py-2 font-medium">Titulo</th>
                <th className="px-3 py-2 font-medium">Corpo</th>
                <th className="px-3 py-2 font-medium">Criado em</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center theme-muted">
                    Carregando indice...
                  </td>
                </tr>
              ) : indexes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center theme-muted">
                    Nenhum registro de busca encontrado.
                  </td>
                </tr>
              ) : (
                indexes.map((item) => (
                  <tr key={item.id} className="border-b border-white/5 align-top">
                    <td className="px-3 py-3">
                      <p className="font-medium">{item.entityType}</p>
                      <p className="mt-1 text-xs theme-muted">{item.entityId}</p>
                    </td>
                    <td className="px-3 py-3">{item.channel ?? "Nao definido"}</td>
                    <td className="px-3 py-3">{item.source ?? "Nao definido"}</td>
                    <td className="px-3 py-3">{item.title ?? "Sem titulo"}</td>
                    <td className="max-w-lg px-3 py-3">
                      <p className="line-clamp-3">{item.snippet ?? item.body ?? "Sem corpo indexado."}</p>
                      {item.language ? <p className="mt-1 text-xs theme-muted">{item.language}</p> : null}
                    </td>
                    <td className="px-3 py-3">{formatDateTime(item.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {nextCursor && !loading ? (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleLoadMore}
              className="rounded-md border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
            >
              Carregar mais
            </button>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

function FilterInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-xs font-semibold uppercase tracking-wide theme-muted">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-cyan-300"
        placeholder={placeholder}
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide theme-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
