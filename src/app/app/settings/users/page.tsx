"use client";

import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppSession,
  clearAppSession,
  createAppUser,
  fetchAppDepartments,
  fetchAppUsers,
  loadAppSession,
  saveAppSession,
  updateAppUser,
} from "@/lib/appClientApi";
import {
  AdminDepartmentItem,
  AdminUserItem,
  formatDateTime,
} from "@/lib/whatsappAdminApi";

const USER_ROLE_OPTIONS = ["AGENT", "SUPERVISOR", "ADMIN"] as const;

const EMPTY_USER_FORM = {
  name: "",
  email: "",
  password: "",
  role: "AGENT",
  departmentId: "",
  isActive: true,
};

function canManageUsers(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function isDepartmentRequired(role: string) {
  return role === "AGENT" || role === "SUPERVISOR";
}

function InfoBadge({
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
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center text-sm leading-none">
      {children}
    </span>
  );
}

function normalizeAppErrorMessage(error: AppApiError, fallback: string) {
  if (error.errorCode === "user_limit_exceeded") {
    return "Limite de usuarios ativos contratado para este tenant foi atingido.";
  }
  if (error.errorCode === "user_already_exists" || error.status === 409) {
    return "Ja existe um usuario com esse email.";
  }
  if (error.errorCode === "department_required") {
    return "Selecione um setor para AGENT ou SUPERVISOR.";
  }
  if (error.errorCode === "department_not_found") {
    return "Setor invalido para este tenant.";
  }
  if (error.errorCode === "invalid_role") {
    return "Selecione um perfil valido.";
  }
  if (error.errorCode === "weak_password") {
    return "Senha deve ter pelo menos 6 caracteres.";
  }
  if (error.status === 403) {
    return "Sem permissao para gerenciar usuarios.";
  }
  return error.message || fallback;
}

export default function AppSettingsUsersPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [departments, setDepartments] = useState<AdminDepartmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [userDrafts, setUserDrafts] = useState<
    Record<
      string,
      {
        name: string;
        email: string;
        role: string;
        departmentId: string;
        isActive: boolean;
      }
    >
  >({});

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const hydrateUsers = useCallback((items: AdminUserItem[]) => {
    setUsers(items);
    setUserDrafts(
      Object.fromEntries(
        items.map((item) => [
          item.id,
          {
            name: item.name,
            email: item.email,
            role: String(item.role || "AGENT").toUpperCase(),
            departmentId: item.departmentId ?? "",
            isActive: item.isActive ?? true,
          },
        ])
      )
    );
  }, []);

  const loadPageData = useCallback(
    async (activeSession: AppSession) => {
      const [usersResponse, departmentsResponse] = await Promise.all([
        fetchAppUsers(activeSession),
        fetchAppDepartments(activeSession),
      ]);
      hydrateUsers(usersResponse.items);
      setDepartments(departmentsResponse.items);
    },
    [hydrateUsers]
  );

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    if (!canManageUsers(stored.user.role)) {
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
    loadPageData(session)
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
        setError(typed.message || "Falha ao carregar usuarios e setores.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, loadPageData, router, session]);

  const toastHandlers = usePausableFeedbackAutoDismiss(
    Boolean(userSuccess || actionSuccess || userError || actionError),
    () => {
      setUserSuccess(null);
      setActionSuccess(null);
      setUserError(null);
      setActionError(null);
    }
  );

  const departmentNameById = useMemo(
    () => Object.fromEntries(departments.map((item) => [item.id, item.name])),
    [departments]
  );

  const handleCreateUser = async () => {
    if (!session) return;
    if (!userForm.name.trim() || !userForm.email.trim() || !userForm.password.trim()) {
      setUserError("Preencha nome, email e senha.");
      return;
    }
    const emailUsed = userForm.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(emailUsed)) {
      setUserError("Informe um email valido.");
      return;
    }
    if (isDepartmentRequired(userForm.role) && !userForm.departmentId) {
      setUserError("Selecione um setor para AGENT ou SUPERVISOR.");
      return;
    }
    setCreatingUser(true);
    setUserError(null);
    setUserSuccess(null);
    setActionError(null);
    setActionSuccess(null);
    try {
      await createAppUser(session, {
        name: userForm.name.trim(),
        email: emailUsed,
        password: userForm.password,
        role: userForm.role,
        departmentId: userForm.departmentId || null,
        isActive: userForm.isActive,
      });
      setUserForm(EMPTY_USER_FORM);
      await loadPageData(session);
      setUserSuccess(`Usuario criado com sucesso. Email: ${emailUsed}`);
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setUserError(normalizeAppErrorMessage(typed, "Nao foi possivel criar o usuario."));
    } finally {
      setCreatingUser(false);
    }
  };

  const handleUpdateUser = async (item: AdminUserItem) => {
    if (!session) return;
    const draft = userDrafts[item.id];
    if (!draft) return;
    const nextRole = String(draft.role ?? item.role).trim().toUpperCase();
    if (!USER_ROLE_OPTIONS.includes(nextRole as (typeof USER_ROLE_OPTIONS)[number])) {
      setActionError("Selecione um perfil valido.");
      return;
    }
    if (!draft.name.trim() || !draft.email.trim()) {
      setActionError("Nome e email sao obrigatorios.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(draft.email.trim().toLowerCase())) {
      setActionError("Informe um email valido.");
      return;
    }
    if (isDepartmentRequired(nextRole) && !draft.departmentId) {
      setActionError("Selecione um setor para AGENT ou SUPERVISOR.");
      return;
    }
    setSavingUserId(item.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      const response = await updateAppUser(session, item.id, {
        name: draft.name.trim(),
        email: draft.email.trim().toLowerCase(),
        role: nextRole,
        departmentId: draft.departmentId || null,
        isActive: draft.isActive,
      });
      setUsers((current) => current.map((user) => (user.id === item.id ? response.user : user)));
      setUserDrafts((current) => ({
        ...current,
        [item.id]: {
          name: response.user.name,
          email: response.user.email,
          role: response.user.role,
          departmentId: response.user.departmentId ?? "",
          isActive: response.user.isActive ?? true,
        },
      }));
      setActionSuccess("Usuario atualizado com sucesso.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setActionError(normalizeAppErrorMessage(typed, "Nao foi possivel atualizar o usuario."));
    } finally {
      setSavingUserId(null);
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

  return (
    <AppShell
      session={session}
      title="Usuarios"
      subtitle="Cadastre e organize quem atende no portal do cliente."
    >
      <FeedbackToast message={userSuccess || actionSuccess} variant="success" {...toastHandlers} />
      <FeedbackToast message={userError || actionError} variant="error" {...toastHandlers} />

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <div className="mb-5 flex flex-col gap-2">
          <span className="w-fit rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70">
            Novo usuario
          </span>
          <p className="text-sm text-white/65">
            Crie usuarios do tenant. O backend aplica automaticamente o escopo de supervisor e admin.
          </p>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="flex flex-col gap-2 text-sm text-white/75">
            <span>Nome</span>
            <input
              value={userForm.name}
              onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-white/75">
            <span>Email</span>
            <input
              value={userForm.email}
              onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))}
              className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-white/75">
            <span>Senha</span>
            <input
              type="password"
              value={userForm.password}
              onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
              className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-white/75">
            <span>Perfil</span>
            <select
              value={userForm.role}
              onChange={(event) =>
                setUserForm((current) => ({
                  ...current,
                  role: event.target.value,
                  departmentId: isDepartmentRequired(event.target.value) ? current.departmentId : "",
                }))
              }
              className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0"
            >
              {USER_ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-white/75">
            <span>Setor</span>
            <select
              value={userForm.departmentId}
              onChange={(event) =>
                setUserForm((current) => ({ ...current, departmentId: event.target.value }))
              }
              className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0"
            >
              <option value="">-</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                  {department.isActive ? "" : " (inativo)"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-white/75">
            <span>Status</span>
            <select
              value={userForm.isActive ? "active" : "inactive"}
              onChange={(event) =>
                setUserForm((current) => ({
                  ...current,
                  isActive: event.target.value === "active",
                }))
              }
              className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0"
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-white/55">
            Reset de senha ainda nao existe no /app. A rota equivalente precisa ser criada no backend antes da UI.
          </p>
          <button
            type="button"
            onClick={handleCreateUser}
            disabled={creatingUser}
            className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creatingUser ? "Criando..." : "Criar usuario"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Usuarios do tenant</h2>
            <p className="mt-1 text-sm text-white/65">
              Edite os dados na linha do usuario e clique em Salvar.
            </p>
          </div>
          <InfoBadge label={`${users.length} usuarios`} />
        </div>

        {loading ? (
          <p className="text-sm text-white/70">Carregando usuarios...</p>
        ) : error ? (
          <p className="rounded-md border border-red-400/30 bg-red-900/20 p-3 text-sm text-red-100">
            {error}
          </p>
        ) : users.length === 0 ? (
          <p className="text-sm text-white/70">Nenhum usuario encontrado.</p>
        ) : (
          <div className="space-y-4">
            {users.map((item, index) => {
              const draft = userDrafts[item.id];
              if (!draft) return null;
              const departmentLabel = draft.departmentId
                ? `${departmentNameById[draft.departmentId] || draft.departmentId}`
                : "-";
              return (
                <article
                  key={item.id}
                  className={`rounded-xl border p-4 ${
                    index % 2 === 0
                      ? "border-white/10 bg-re7-navy/45"
                      : "border-white/15 bg-white/[0.075]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-white">{item.name}</h3>
                      <p className="text-sm text-white/60">{item.email}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <InfoBadge label={`Perfil: ${draft.role}`} />
                        <InfoBadge label={`Setor: ${departmentLabel}`} />
                        <InfoBadge
                          label={draft.isActive ? "Ativo" : "Inativo"}
                          tone={draft.isActive ? "success" : "warning"}
                        />
                      </div>
                    </div>
                    <div className="text-sm text-white/55">Criado em {formatDateTime(item.createdAt)}</div>
                  </div>

                  <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <label className="flex flex-col gap-2 text-sm text-white/75">
                      <span>Nome</span>
                      <input
                        value={draft.name}
                        onChange={(event) =>
                          setUserDrafts((current) => ({
                            ...current,
                            [item.id]: {
                              ...current[item.id],
                              name: event.target.value,
                            },
                          }))
                        }
                        className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm text-white/75">
                      <span>Email</span>
                      <input
                        value={draft.email}
                        onChange={(event) =>
                          setUserDrafts((current) => ({
                            ...current,
                            [item.id]: {
                              ...current[item.id],
                              email: event.target.value,
                            },
                          }))
                        }
                        className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm text-white/75">
                      <span>Perfil</span>
                      <select
                        value={draft.role}
                        onChange={(event) =>
                          setUserDrafts((current) => ({
                            ...current,
                            [item.id]: {
                              ...current[item.id],
                              role: event.target.value,
                              departmentId: isDepartmentRequired(event.target.value)
                                ? current[item.id].departmentId
                                : "",
                            },
                          }))
                        }
                        className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0"
                      >
                        {USER_ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-2 text-sm text-white/75">
                      <span>Setor</span>
                      <select
                        value={draft.departmentId}
                        onChange={(event) =>
                          setUserDrafts((current) => ({
                            ...current,
                            [item.id]: {
                              ...current[item.id],
                              departmentId: event.target.value,
                            },
                          }))
                        }
                        className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0"
                      >
                        <option value="">-</option>
                        {departments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                            {department.isActive ? "" : " (inativo)"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-2 text-sm text-white/75">
                      <span>Status</span>
                      <select
                        value={draft.isActive ? "active" : "inactive"}
                        onChange={(event) =>
                          setUserDrafts((current) => ({
                            ...current,
                            [item.id]: {
                              ...current[item.id],
                              isActive: event.target.value === "active",
                            },
                          }))
                        }
                        className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-white outline-none ring-0"
                      >
                        <option value="active">Ativo</option>
                        <option value="inactive">Inativo</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-white/55">
                      Reset de senha ainda indisponivel no /app.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleUpdateUser(item)}
                      disabled={savingUserId === item.id}
                      className="inline-flex items-center gap-2 rounded-md border border-white/20 px-3 py-2 text-sm text-white/85 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <ActionIcon>✓</ActionIcon>
                      {savingUserId === item.id ? "Salvando..." : "Salvar"}
                    </button>
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
