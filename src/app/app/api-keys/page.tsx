"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppPublicApiKey,
  AppPublicApiScope,
  AppSession,
  clearAppSession,
  createAppPublicApiKey,
  fetchAppPublicApiKeys,
  loadAppSession,
  revokeAppPublicApiKey,
  saveAppSession,
} from "@/lib/appClientApi";
import { getAppErrorUxMessage } from "@/lib/appUxLabels";
import { formatDateTime } from "@/lib/whatsappAdminApi";

const DEFAULT_SCOPES: AppPublicApiScope[] = ["read", "contacts", "conversations", "messages"];

function canManageApiKeys(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "ADMIN";
}

function StatusPill({ status }: { status: string }) {
  const active = status === "active";
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
        active
          ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
          : "border-white/15 bg-white/5 text-white/60"
      }`}
    >
      {active ? "Ativa" : "Revogada"}
    </span>
  );
}

function ScopeBadge({ scope }: { scope: string }) {
  return (
    <span className="inline-flex rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-white/80">
      {scope}
    </span>
  );
}

export default function AppApiKeysPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [keys, setKeys] = useState<AppPublicApiKey[]>([]);
  const [availableScopes, setAvailableScopes] = useState<AppPublicApiScope[]>([]);
  const [publicBasePath, setPublicBasePath] = useState("/public-api/v1");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<AppPublicApiScope[]>(DEFAULT_SCOPES);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || success), () => {
    setError(null);
    setSuccess(null);
  });

  const activeKeys = useMemo(() => keys.filter((item) => item.status === "active"), [keys]);

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const loadKeys = useCallback(async (activeSession: AppSession) => {
    const response = await fetchAppPublicApiKeys(activeSession);
    setKeys(response.keys);
    setAvailableScopes(response.availableScopes);
    setPublicBasePath(response.publicBasePath);
  }, []);

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    if (!canManageApiKeys(stored.user.role)) {
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
    loadKeys(session)
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
        setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível carregar as chaves de integração." }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, loadKeys, router, session]);

  const toggleScope = (scope: AppPublicApiScope) => {
    setSelectedScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]
    );
  };

  const handleCreate = async () => {
    if (!session) return;
    if (!name.trim()) {
      setError("Informe um nome para identificar a integração.");
      return;
    }
    if (selectedScopes.length === 0) {
      setError("Selecione ao menos um escopo.");
      return;
    }
    setCreating(true);
    setError(null);
    setSuccess(null);
    setCreatedSecret(null);
    try {
      const response = await createAppPublicApiKey(session, {
        name: name.trim(),
        scopes: selectedScopes,
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
      });
      setCreatedSecret(response.secret);
      setName("");
      setExpiresAt("");
      setSelectedScopes(DEFAULT_SCOPES);
      await loadKeys(session);
      setSuccess("Chave criada. Guarde o segredo agora; ele não será exibido novamente.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível criar a chave." }));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!session) return;
    setRevokingId(keyId);
    setError(null);
    setSuccess(null);
    try {
      await revokeAppPublicApiKey(session, keyId);
      await loadKeys(session);
      setSuccess("Chave revogada.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(getAppErrorUxMessage({ status: typed.status, message: typed.message, fallback: "Não foi possível revogar a chave." }));
    } finally {
      setRevokingId(null);
    }
  };

  const copySecret = async () => {
    if (!createdSecret) return;
    try {
      await navigator.clipboard.writeText(createdSecret);
      setSuccess("Chave copiada.");
    } catch {
      setError("Não foi possível copiar automaticamente.");
    }
  };

  if (!session) {
    return <main className="min-h-screen bg-re7-navy" />;
  }

  return (
    <AppShell
      session={session}
      title="Chaves de integração"
      subtitle="Credenciais da organização para integrações externas autorizadas. A versão atual libera apenas verificação autenticada."
    >
      <FeedbackToast
        message={error || success}
        variant={error ? "error" : "success"}
        onMouseEnter={toastHandlers.onMouseEnter}
        onMouseLeave={toastHandlers.onMouseLeave}
        onFocus={toastHandlers.onFocus}
        onBlur={toastHandlers.onBlur}
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <article className="theme-surface min-w-0 rounded-xl border p-4">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white">Nova chave</h2>
              <p className="mt-1 text-sm text-white/60">
                O segredo será exibido uma única vez. Armazenamos somente a versão protegida.
              </p>
            </div>
            <span className="rounded-full border border-re7-sky/30 bg-re7-sky/10 px-3 py-1 text-xs font-semibold text-re7-sky">
              {publicBasePath}
            </span>
          </div>

          {createdSecret ? (
            <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-500/15 p-3">
              <p className="text-sm font-semibold text-amber-100">Copie agora</p>
              <p className="mt-1 text-xs text-amber-100/80">
                Esta chave não será exibida novamente após sair desta tela.
              </p>
              <code className="mt-3 block max-w-full overflow-x-auto rounded-md bg-black/30 px-3 py-2 text-xs text-white">
                {createdSecret}
              </code>
              <button className="theme-nav-link mt-3 rounded-md border px-3 py-1.5 text-xs font-semibold" onClick={copySecret}>
                Copiar chave
              </button>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold text-white/80">Nome da integração</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: ERP Prefeitura"
                className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
              />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold text-white/80">Expira em</span>
              <input
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
              />
            </label>

            <div className="grid gap-2">
              <p className="text-sm font-semibold text-white/80">Escopos</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {availableScopes.map((scope) => (
                  <label
                    key={scope}
                    className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80"
                  >
                    <input
                      type="checkbox"
                      checked={selectedScopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                      className="h-4 w-4 rounded border-white/30 bg-re7-navy"
                    />
                    {scope}
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={creating}
              className="theme-nav-link-active mt-2 rounded-md border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Criando..." : "Criar chave"}
            </button>
          </div>
        </article>

        <article className="theme-surface min-w-0 rounded-xl border p-4">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">Chaves existentes</h2>
              <p className="mt-1 text-sm text-white/60">
                {activeKeys.length} ativa{activeKeys.length === 1 ? "" : "s"}. Use revogacao imediata em caso de troca de fornecedor.
              </p>
            </div>
          </div>

          {loading ? (
            <p className="mt-6 text-sm text-white/60">Carregando chaves...</p>
          ) : keys.length === 0 ? (
            <p className="mt-6 text-sm text-white/60">Nenhuma chave criada para esta organização.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {keys.map((key) => (
                <div key={key.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words text-sm font-semibold text-white">{key.name}</h3>
                        <StatusPill status={key.status} />
                      </div>
                      <p className="mt-1 font-mono text-xs text-white/55">{key.keyPrefix}</p>
                    </div>
                    {key.status === "active" ? (
                      <button
                        onClick={() => handleRevoke(key.id)}
                        disabled={revokingId === key.id}
                        className="theme-nav-link rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        {revokingId === key.id ? "Revogando..." : "Revogar"}
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {key.scopes.map((scope) => (
                      <ScopeBadge key={scope} scope={scope} />
                    ))}
                  </div>
                  <dl className="mt-3 grid gap-2 text-xs text-white/60 sm:grid-cols-2">
                    <div>
                      <dt className="font-semibold text-white/45">Criada</dt>
                      <dd>{formatDateTime(key.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-white/45">Ultimo uso</dt>
                      <dd>{key.lastUsedAt ? formatDateTime(key.lastUsedAt) : "-"}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-white/45">Expira</dt>
                      <dd>{key.expiresAt ? formatDateTime(key.expiresAt) : "Sem expiracao"}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-white/45">Revogada</dt>
                      <dd>{key.revokedAt ? formatDateTime(key.revokedAt) : "-"}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </AppShell>
  );
}
