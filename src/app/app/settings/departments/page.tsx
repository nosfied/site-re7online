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

function normalizeDepartmentError(error: AppApiError, fallback: string) {
  if (error.errorCode === "department_slug_conflict" || error.status === 409) {
    return "Ja existe um setor equivalente neste tenant.";
  }
  if (error.errorCode === "bad_request") {
    return error.message || fallback;
  }
  if (error.status === 403) {
    return "Sem permissao para gerenciar setores.";
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
  const [drafts, setDrafts] = useState<Record<string, { name: string; isActive: boolean }>>({});

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
        setError(typed.message || "Falha ao carregar setores.");
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
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
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
      setError(normalizeDepartmentError(typed, "Falha ao criar setor."));
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
          typeof nextIsActive === "boolean" ? "Falha ao atualizar setor." : "Falha ao salvar setor."
        )
      );
    } finally {
      setSavingId(null);
      setTogglingId(null);
    }
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

      <section className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
        <div className="mb-3 flex flex-col gap-1.5">
          <span className="w-fit rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70">
            Novo setor
          </span>
          <p className="text-sm text-white/65">
            O nome informado gera o slug automaticamente. Supervisores acessam esta tela apenas em leitura.
          </p>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <input
            className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:cursor-not-allowed disabled:opacity-60"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={readOnly || creating}
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={readOnly || creating}
            className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? "Criando..." : "Criar setor"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Setores do tenant</h2>
            <p className="mt-1 text-sm text-white/65">
              {readOnly
                ? "Visualizacao em leitura para supervisores."
                : "Edite o nome, ative ou desative setores conforme a operacao."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
          <div className="space-y-4">
            {sortedDepartments.map((item, index) => {
              const draft = drafts[item.id];
              if (!draft) return null;
              return (
                <article
                  key={item.id}
                  className={`theme-list-row ${
                    index % 2 === 0 ? "theme-list-row-even" : "theme-list-row-odd"
                  } rounded-xl border p-3 md:p-4 ${
                    index % 2 === 0
                      ? "border-white/10 bg-re7-navy/40"
                      : "border-white/15 bg-white/[0.075]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-white">{item.name}</h3>
                      <div className="flex flex-wrap items-center gap-2">
                        <DepartmentBadge label={item.slug || "-"} />
                        <DepartmentBadge
                          label={item.isActive ? "Ativo" : "Inativo"}
                          tone={item.isActive ? "success" : "warning"}
                        />
                      </div>
                    </div>
                    <div className="text-sm text-white/55">Criado em {formatDateTime(item.createdAt)}</div>
                  </div>

                  <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
                    <label className="flex flex-col gap-2 text-sm text-white/75">
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
                        className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm text-white/75">
                      <span>Status</span>
                      <div className="flex items-center gap-3">
                        <span className="text-white/65">{draft.isActive ? "Ativo" : "Inativo"}</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (readOnly || togglingId === item.id || savingId === item.id) return;
                            void handleUpdate(item, !draft.isActive);
                          }}
                          disabled={readOnly || togglingId === item.id || savingId === item.id}
                          aria-label={draft.isActive ? "Desativar setor" : "Ativar setor"}
                          className={`relative inline-flex h-7 w-14 items-center rounded-full border transition ${
                            draft.isActive
                              ? "border-emerald-400/40 bg-emerald-500/20"
                              : "border-white/20 bg-white/10"
                          } ${readOnly || togglingId === item.id || savingId === item.id ? "cursor-not-allowed opacity-50" : ""}`}
                        >
                          <span
                            className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white text-[10px] font-bold text-re7-navy transition ${
                              draft.isActive ? "translate-x-7" : "translate-x-1"
                            }`}
                          >
                            {draft.isActive ? "ON" : "OFF"}
                          </span>
                        </button>
                      </div>
                    </label>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-white/55">Slug atual: {item.slug || "-"}</p>
                    {readOnly ? (
                      <p className="text-sm text-white/55">Somente leitura.</p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleUpdate(item)}
                          disabled={savingId === item.id || togglingId === item.id}
                          className="inline-flex items-center gap-2 rounded-md border border-white/20 px-3 py-2 text-sm text-white/85 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
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
