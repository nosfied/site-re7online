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
import { formatUserDisplayName } from "@/lib/userDisplayName";

const USER_ROLE_OPTIONS = ["AGENT", "SUPERVISOR", "ADMIN"] as const;
type UserStatusFilter = "" | "active" | "inactive";
type UserDraft = {
  name: string;
  email: string;
  role: string;
  departmentIds: string[];
  primaryDepartmentId: string;
  isActive: boolean;
};

const EMPTY_USER_FORM = {
  name: "",
  email: "",
  password: "",
  role: "AGENT",
  departmentIds: [] as string[],
  primaryDepartmentId: "",
  isActive: true,
};

function canManageUsers(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function isAdminRole(role: string | null | undefined) {
  return String(role ?? "").trim().toUpperCase() === "ADMIN";
}

function isSupervisorRole(role: string | null | undefined) {
  return String(role ?? "").trim().toUpperCase() === "SUPERVISOR";
}

function getCreateRoleOptions(actorRole: string) {
  return isSupervisorRole(actorRole) ? ["AGENT"] : USER_ROLE_OPTIONS;
}

function canEditUserForActor(actorRole: string, targetRole: string) {
  if (isAdminRole(actorRole)) return true;
  if (isSupervisorRole(actorRole)) return targetRole.trim().toUpperCase() === "AGENT";
  return false;
}

function getUpdateRoleOptions(actorRole: string) {
  return isSupervisorRole(actorRole) ? ["AGENT", "SUPERVISOR"] : USER_ROLE_OPTIONS;
}

function isDepartmentRequired(role: string) {
  return role === "AGENT" || role === "SUPERVISOR";
}

function getUserDepartmentIds(item: AdminUserItem) {
  if (Array.isArray(item.departmentIds) && item.departmentIds.length > 0) return item.departmentIds;
  return item.departmentId ? [item.departmentId] : [];
}

function getPrimaryDepartmentId(item: AdminUserItem, departmentIds = getUserDepartmentIds(item)) {
  return item.primaryDepartmentId ?? item.departmentId ?? departmentIds[0] ?? "";
}

function buildUserDraft(item: AdminUserItem): UserDraft {
  const departmentIds = getUserDepartmentIds(item);
  return {
    name: item.name,
    email: item.email,
    role: String(item.role || "AGENT").toUpperCase(),
    departmentIds,
    primaryDepartmentId: getPrimaryDepartmentId(item, departmentIds),
    isActive: item.isActive ?? true,
  };
}

function toggleDepartmentId(current: string[], departmentId: string) {
  return current.includes(departmentId)
    ? current.filter((item) => item !== departmentId)
    : [...current, departmentId];
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
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneClass}`}>
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
    return "Limite de usuários ativos contratado para esta organização foi atingido.";
  }
  if (error.errorCode === "user_has_active_conversations") {
    return "Não é possível inativar este usuário enquanto houver atendimentos ativos atribuídos. Transfira ou encerre os atendimentos antes de continuar.";
  }
  if (error.errorCode === "user_already_exists" || error.status === 409) {
    return "Já existe um usuário com esse email.";
  }
  if (error.errorCode === "department_required") {
    return "Selecione um setor para AGENT ou SUPERVISOR.";
  }
  if (error.errorCode === "primary_department_required") {
    return "Selecione o setor principal.";
  }
  if (error.errorCode === "department_not_found") {
    return "Setor inválido para esta organização.";
  }
  if (error.errorCode === "invalid_role") {
    return "Selecione um perfil válido.";
  }
  if (error.errorCode === "weak_password") {
    return "Senha deve ter pelo menos 6 caracteres.";
  }
  if (error.status === 403) {
    return "Sem permissão para gerenciar usuários.";
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
  const [showCreateUserForm, setShowCreateUserForm] = useState(false);
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [activeUserCapacity, setActiveUserCapacity] = useState<{
    activeUsers: number | null;
    maxActiveAppUsers: number | null;
  }>({ activeUsers: null, maxActiveAppUsers: null });
  const [userDrafts, setUserDrafts] = useState<Record<string, UserDraft>>({});

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const hydrateUsers = useCallback((items: AdminUserItem[]) => {
    setUsers(items);
    setUserDrafts(Object.fromEntries(items.map((item) => [item.id, buildUserDraft(item)])));
  }, []);

  const loadPageData = useCallback(
    async (activeSession: AppSession) => {
      const [usersResponse, departmentsResponse] = await Promise.all([
        fetchAppUsers(activeSession, "all"),
        fetchAppDepartments(activeSession),
      ]);
      hydrateUsers(usersResponse.items);
      setActiveUserCapacity({
        activeUsers: typeof usersResponse.activeUsers === "number" ? usersResponse.activeUsers : null,
        maxActiveAppUsers:
          typeof usersResponse.maxActiveAppUsers === "number" ? usersResponse.maxActiveAppUsers : null,
      });
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
  const createRoleOptions = useMemo(
    () => (session ? getCreateRoleOptions(session.user.role) : USER_ROLE_OPTIONS),
    [session]
  );
  const updateRoleOptions = useMemo(
    () => (session ? getUpdateRoleOptions(session.user.role) : USER_ROLE_OPTIONS),
    [session]
  );
  const filteredUsers = useMemo(() => {
    const search = userSearch.trim().toLowerCase();
    return users.filter((item) => {
      const role = String(item.role ?? "").toUpperCase();
      const isActive = item.isActive ?? true;
      const departmentIds = getUserDepartmentIds(item);
      const departmentLabel = departmentIds
        .map((departmentId) => departmentNameById[departmentId] || departmentId)
        .join(" ");
      const searchable = [
        item.name,
        item.email,
        role,
        departmentLabel,
        getPrimaryDepartmentId(item, departmentIds),
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch = !search || searchable.includes(search);
      const matchesRole = !roleFilter || role === roleFilter;
      const matchesStatus =
        !statusFilter ||
        (statusFilter === "active" && isActive) ||
        (statusFilter === "inactive" && !isActive);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [departmentNameById, roleFilter, statusFilter, userSearch, users]);

  const resetDraftForUser = useCallback((userId: string) => {
    const persisted = users.find((item) => item.id === userId);
    if (!persisted) return;
    setUserDrafts((current) => ({ ...current, [userId]: buildUserDraft(persisted) }));
  }, [users]);

  const collapseExpandedUser = useCallback(() => {
    if (!expandedUserId) return;
    resetDraftForUser(expandedUserId);
    setExpandedUserId(null);
  }, [expandedUserId, resetDraftForUser]);

  const openUserRow = useCallback((item: AdminUserItem) => {
    setExpandedUserId((current) => {
      setUserDrafts((drafts) => {
        const nextDrafts = { ...drafts, [item.id]: buildUserDraft(item) };
        if (current && current !== item.id) {
          const previous = users.find((user) => user.id === current);
          if (previous) nextDrafts[current] = buildUserDraft(previous);
        }
        return nextDrafts;
      });
      if (current === item.id) return null;
      window.requestAnimationFrame(() => {
        document.getElementById(`user-row-${item.id}`)?.scrollIntoView({ block: "nearest" });
      });
      return item.id;
    });
  }, [users]);

  useEffect(() => {
    if (expandedUserId && !filteredUsers.some((item) => item.id === expandedUserId)) {
      resetDraftForUser(expandedUserId);
      setExpandedUserId(null);
    }
  }, [expandedUserId, filteredUsers, resetDraftForUser]);

  const handleCreateUser = async () => {
    if (!session) return;
    if (isSupervisorRole(session.user.role) && userForm.role !== "AGENT") {
      setUserError("Supervisor pode criar apenas usuários AGENT.");
      return;
    }
    if (!userForm.name.trim() || !userForm.email.trim() || !userForm.password.trim()) {
      setUserError("Preencha nome, email e senha.");
      return;
    }
    const emailUsed = userForm.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(emailUsed)) {
      setUserError("Informe um email válido.");
      return;
    }
    if (isDepartmentRequired(userForm.role) && userForm.departmentIds.length === 0) {
      setUserError("Selecione pelo menos um setor para AGENT ou SUPERVISOR.");
      return;
    }
    if (userForm.departmentIds.length > 0 && !userForm.primaryDepartmentId) {
      setUserError("Selecione o setor principal.");
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
        departmentId: userForm.primaryDepartmentId || null,
        departmentIds: userForm.departmentIds,
        primaryDepartmentId: userForm.primaryDepartmentId || null,
        isActive: userForm.isActive,
      });
      setUserForm(EMPTY_USER_FORM);
      setShowCreateUserForm(false);
      await loadPageData(session);
      setUserSuccess(`Usuário criado com sucesso. Email: ${emailUsed}`);
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setUserError(normalizeAppErrorMessage(typed, "Não foi possível criar o usuário."));
    } finally {
      setCreatingUser(false);
    }
  };

  const handleUpdateUser = async (item: AdminUserItem) => {
    if (!session) return;
    if (!canEditUserForActor(session.user.role, item.role)) {
      setActionError("Sem permissão para alterar este usuário.");
      return;
    }
    const draft = userDrafts[item.id];
    if (!draft) return;
    const nextRole = String(draft.role ?? item.role).trim().toUpperCase();
    if (!USER_ROLE_OPTIONS.includes(nextRole as (typeof USER_ROLE_OPTIONS)[number])) {
      setActionError("Selecione um perfil válido.");
      return;
    }
    if (!draft.name.trim() || !draft.email.trim()) {
      setActionError("Nome e email são obrigatórios.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(draft.email.trim().toLowerCase())) {
      setActionError("Informe um email válido.");
      return;
    }
    if (isDepartmentRequired(nextRole) && draft.departmentIds.length === 0) {
      setActionError("Selecione pelo menos um setor para AGENT ou SUPERVISOR.");
      return;
    }
    if (draft.departmentIds.length > 0 && !draft.primaryDepartmentId) {
      setActionError("Selecione o setor principal.");
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
        departmentId: draft.primaryDepartmentId || null,
        departmentIds: draft.departmentIds,
        primaryDepartmentId: draft.primaryDepartmentId || null,
        isActive: draft.isActive,
      });
      setUsers((current) => current.map((user) => (user.id === item.id ? response.user : user)));
      setActiveUserCapacity((current) => {
        const wasActive = item.isActive ?? true;
        const nextActive = response.user.isActive ?? true;
        if (current.activeUsers === null || wasActive === nextActive) return current;
        return {
          ...current,
          activeUsers: Math.max(0, current.activeUsers + (nextActive ? 1 : -1)),
        };
      });
      setUserDrafts((current) => ({
        ...current,
        [item.id]: {
          name: response.user.name,
          email: response.user.email,
          role: response.user.role,
          departmentIds: getUserDepartmentIds(response.user),
          primaryDepartmentId: getPrimaryDepartmentId(response.user),
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
      setActionError(normalizeAppErrorMessage(typed, "Não foi possível atualizar o usuário."));
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

      <div className="users-settings-theme grid gap-4">
      <section className="users-settings-section users-settings-create rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="w-fit rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/70">
              Novo usuario
            </span>
            <p className="text-xs text-white/65 sm:text-sm">
              Crie usuários desta organização apenas quando necessário.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateUserForm((current) => !current)}
            className="rounded-md bg-re7-orange px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 sm:text-sm"
          >
            {showCreateUserForm ? "Fechar" : "Adicionar usuario"}
          </button>
        </div>

        {showCreateUserForm ? (
          <>
            <div className="users-settings-form mt-4 grid max-w-5xl min-w-0 gap-3 border-t border-white/10 pt-4 sm:grid-cols-2 xl:grid-cols-3">
              <label className="flex flex-col gap-2 text-sm text-white/75">
                <span>Nome</span>
                <input
                  value={userForm.name}
                  onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none ring-0"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-white/75">
                <span>Email</span>
                <input
                  value={userForm.email}
                  onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))}
                  className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none ring-0"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-white/75">
                <span>Senha</span>
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
                  className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none ring-0"
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
                      departmentIds: isDepartmentRequired(event.target.value) ? current.departmentIds : [],
                      primaryDepartmentId: isDepartmentRequired(event.target.value) ? current.primaryDepartmentId : "",
                    }))
                  }
                  className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none ring-0"
                >
                  {createRoleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col gap-2 text-sm text-white/75 xl:col-span-2">
                <span>Departamentos operacionais</span>
                <div className="users-settings-field-group grid min-w-0 gap-2 rounded-md border border-white/15 bg-re7-navy/70 p-2 sm:grid-cols-2">
                  {departments.map((department) => {
                    const checked = userForm.departmentIds.includes(department.id);
                    return (
                      <div key={department.id} className="users-settings-department-row flex min-w-0 items-center justify-between gap-2 rounded border border-white/10 px-2 py-1.5">
                        <label className="flex min-w-0 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setUserForm((current) => {
                                const nextDepartmentIds = toggleDepartmentId(current.departmentIds, department.id);
                                const nextPrimary =
                                  nextDepartmentIds.length === 0
                                    ? ""
                                    : nextDepartmentIds.includes(current.primaryDepartmentId)
                                      ? current.primaryDepartmentId
                                      : nextDepartmentIds[0];
                                return {
                                  ...current,
                                  departmentIds: nextDepartmentIds,
                                  primaryDepartmentId: nextPrimary,
                                };
                              })
                            }
                          />
                          <span className="truncate">
                            {department.name}
                            {department.isActive ? "" : " (inativo)"}
                          </span>
                        </label>
                        <label className="flex shrink-0 items-center gap-1 text-xs text-white/60">
                          <input
                            type="radio"
                            name="new-user-primary-department"
                            checked={checked && userForm.primaryDepartmentId === department.id}
                            disabled={!checked}
                            onChange={() =>
                              setUserForm((current) => ({ ...current, primaryDepartmentId: department.id }))
                            }
                          />
                          Principal
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
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
                  className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none ring-0"
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-white/55">
                Redefinição de senha ainda não existe no app. A rota equivalente precisa ser criada no backend antes da interface.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setUserForm(EMPTY_USER_FORM);
                    setShowCreateUserForm(false);
                    setUserError(null);
                  }}
                  disabled={creatingUser}
                  className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateUser}
                  disabled={creatingUser}
                  className="rounded-md bg-re7-orange px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
                >
                  {creatingUser ? "Criando..." : "Criar usuario"}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </section>

      <section className="users-settings-section users-settings-list rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Usuários da organização</h2>
            <p className="mt-0.5 text-xs text-white/65 sm:text-sm">
              Edite os dados na linha do usuario e clique em Salvar.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <InfoBadge label={`${filteredUsers.length}/${users.length} usuarios`} />
            <InfoBadge
              label={
                activeUserCapacity.activeUsers !== null && activeUserCapacity.maxActiveAppUsers !== null
                  ? `${activeUserCapacity.activeUsers}/${activeUserCapacity.maxActiveAppUsers} usuários ativos`
                  : "usuarios ativos"
              }
              tone="success"
            />
          </div>
        </div>

        <div className="users-settings-filter-panel mb-3 grid min-w-0 gap-3 rounded-lg border border-white/15 bg-re7-navy/55 p-3 shadow-inner shadow-black/10 ring-1 ring-white/5 sm:grid-cols-[minmax(220px,1fr)_180px_180px_auto]">
          <label className="grid gap-1 text-sm text-white/75">
            <span>Buscar</span>
            <input
              value={userSearch}
              onChange={(event) => {
                collapseExpandedUser();
                setUserSearch(event.target.value);
              }}
              placeholder="Nome, email ou setor"
              className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none ring-0"
            />
          </label>
          <label className="grid gap-1 text-sm text-white/75">
            <span>Perfil</span>
            <select
              value={roleFilter}
              onChange={(event) => {
                collapseExpandedUser();
                setRoleFilter(event.target.value);
              }}
              className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none ring-0"
            >
              <option value="">Todos</option>
              {USER_ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-white/75">
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => {
                collapseExpandedUser();
                setStatusFilter(event.target.value as UserStatusFilter);
              }}
              className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none ring-0"
            >
              <option value="">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                collapseExpandedUser();
                setUserSearch("");
                setRoleFilter("");
                setStatusFilter("");
              }}
              disabled={!userSearch && !roleFilter && !statusFilter}
              className="w-full rounded-md border border-white/20 px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Limpar
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-white/70">Carregando usuarios...</p>
        ) : error ? (
          <p className="rounded-md border border-red-400/30 bg-red-900/20 p-3 text-sm text-red-100">
            {error}
          </p>
        ) : users.length === 0 ? (
          <p className="text-sm text-white/70">Nenhum usuario encontrado.</p>
        ) : filteredUsers.length === 0 ? (
          <p className="rounded-md border border-white/10 bg-white/5 p-3 text-sm text-white/70">
            Nenhum usuario encontrado com os filtros atuais.
          </p>
        ) : (
          <div className="space-y-2.5">
            {filteredUsers.map((item, index) => {
              const draft = userDrafts[item.id];
              if (!draft) return null;
              const canEditThisUser = canEditUserForActor(session.user.role, item.role);
              const departmentLabel =
                getUserDepartmentIds(item).length > 0
                  ? getUserDepartmentIds(item)
                      .map((departmentId) => departmentNameById[departmentId] || departmentId)
                      .join(", ")
                  : "-";
              const persistedPrimaryDepartmentId = getPrimaryDepartmentId(item);
              const primaryDepartmentLabel = persistedPrimaryDepartmentId
                ? departmentNameById[persistedPrimaryDepartmentId] || persistedPrimaryDepartmentId
                : "-";
              const isExpanded = expandedUserId === item.id;
              return (
                <article
                  key={item.id}
                  id={`user-row-${item.id}`}
                  className={`theme-list-row ${
                    index % 2 === 0 ? "theme-list-row-even" : "theme-list-row-odd"
                  } users-settings-user-card overflow-hidden rounded-xl border ${
                    index % 2 === 0
                      ? "border-white/10 bg-re7-navy/45"
                      : "border-white/15 bg-white/[0.075]"
                  }`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    aria-controls={`user-panel-${item.id}`}
                    onClick={() => openUserRow(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openUserRow(item);
                      }
                    }}
                    className="users-settings-user-header grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 bg-white/[0.075] px-3 py-3 text-left transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-re7-sky/70"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-white/90">{formatUserDisplayName(item.name, item.email)}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <InfoBadge label={`Perfil: ${item.role}`} />
                        <InfoBadge label={`Setor: ${departmentLabel}`} />
                        <InfoBadge
                          label={`Principal: ${primaryDepartmentLabel}`}
                          tone={persistedPrimaryDepartmentId ? "success" : "warning"}
                        />
                        <InfoBadge
                          label={(item.isActive ?? true) ? "Ativo" : "Inativo"}
                          tone={(item.isActive ?? true) ? "success" : "warning"}
                        />
                      </div>
                    </div>
                    <div className="expand-row-action-slot flex min-w-max shrink-0 items-center justify-end gap-3 justify-self-end whitespace-nowrap">
                      <div className="hidden text-right text-xs text-white/55 sm:block">
                        <div>Criado em {formatDateTime(item.createdAt)}</div>
                      </div>
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-controls={`user-panel-${item.id}`}
                        aria-label={isExpanded ? "Recolher linha" : "Expandir linha"}
                        title={isExpanded ? "Recolher linha" : "Expandir linha"}
                        onClick={(event) => {
                          event.stopPropagation();
                          openUserRow(item);
                        }}
                        className={`grid h-8 w-8 place-items-center rounded-full border text-base font-semibold leading-none transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-re7-sky/70 disabled:cursor-not-allowed disabled:opacity-60 ${isExpanded ? "rotate-90 border-re7-sky/50 bg-re7-sky/20 text-sky-50" : "border-white/15 text-white/70"}`}
                      >
                        ›
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <>
                  <div id={`user-panel-${item.id}`} className="users-settings-user-body space-y-3 bg-black/10 px-3 py-3">
                    <div className="grid max-w-4xl min-w-0 gap-3 lg:grid-cols-[minmax(260px,0.9fr)_minmax(320px,1.1fr)]">
                      <label className="flex min-w-0 flex-col text-sm text-white/75">
                        <input
                          aria-label="Nome"
                          value={draft.name}
                          disabled={!canEditThisUser}
                          onChange={(event) =>
                            setUserDrafts((current) => ({
                              ...current,
                              [item.id]: {
                                ...current[item.id],
                                name: event.target.value,
                              },
                            }))
                          }
                          className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none ring-0 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </label>
                      <label className="flex min-w-0 flex-col text-sm text-white/75">
                        <input
                          aria-label="Email"
                          value={draft.email}
                          disabled={!canEditThisUser}
                          onChange={(event) =>
                            setUserDrafts((current) => ({
                              ...current,
                              [item.id]: {
                                ...current[item.id],
                                email: event.target.value,
                              },
                            }))
                          }
                          className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none ring-0 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </label>
                    </div>

                    <div className="grid max-w-3xl min-w-0 gap-3 sm:grid-cols-[180px_minmax(220px,1fr)_160px]">
                      <label className="flex flex-col gap-2 text-sm text-white/75">
                        <span>Perfil</span>
                        <select
                          value={draft.role}
                          disabled={!canEditThisUser}
                          onChange={(event) =>
                            setUserDrafts((current) => ({
                              ...current,
                              [item.id]: {
                                ...current[item.id],
                                role: event.target.value,
                                departmentIds: isDepartmentRequired(event.target.value)
                                  ? current[item.id].departmentIds
                                  : [],
                                primaryDepartmentId: isDepartmentRequired(event.target.value)
                                  ? current[item.id].primaryDepartmentId
                                  : "",
                              },
                            }))
                          }
                          className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none ring-0 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {updateRoleOptions.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="flex flex-col gap-2 text-sm text-white/75">
                        <span>Departamentos</span>
                        <div className="users-settings-field-group grid min-w-0 gap-2 rounded-md border border-white/15 bg-re7-navy/70 p-2">
                          {departments.map((department) => {
                            const checked = draft.departmentIds.includes(department.id);
                            return (
                              <div key={department.id} className="users-settings-department-row flex min-w-0 items-center justify-between gap-2 rounded border border-white/10 px-2 py-1.5">
                                <label className="flex min-w-0 items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={!canEditThisUser}
                                    onChange={() =>
                                      setUserDrafts((current) => {
                                        const currentDraft = current[item.id];
                                        const nextDepartmentIds = toggleDepartmentId(currentDraft.departmentIds, department.id);
                                        const nextPrimary =
                                          nextDepartmentIds.length === 0
                                            ? ""
                                            : nextDepartmentIds.includes(currentDraft.primaryDepartmentId)
                                              ? currentDraft.primaryDepartmentId
                                              : nextDepartmentIds[0];
                                        return {
                                          ...current,
                                          [item.id]: {
                                            ...currentDraft,
                                            departmentIds: nextDepartmentIds,
                                            primaryDepartmentId: nextPrimary,
                                          },
                                        };
                                      })
                                    }
                                  />
                                  <span className="truncate">
                                    {department.name}
                                    {department.isActive ? "" : " (inativo)"}
                                  </span>
                                </label>
                                <label className="flex shrink-0 items-center gap-1 text-xs text-white/60">
                                  <input
                                    type="radio"
                                    name={`primary-department-${item.id}`}
                                    checked={checked && draft.primaryDepartmentId === department.id}
                                    disabled={!checked || !canEditThisUser}
                                    onChange={() =>
                                      setUserDrafts((current) => ({
                                        ...current,
                                        [item.id]: {
                                          ...current[item.id],
                                          primaryDepartmentId: department.id,
                                        },
                                      }))
                                    }
                                  />
                                  Principal
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <label className="flex flex-col gap-2 text-sm text-white/75">
                        <span>Status</span>
                        <select
                          value={draft.isActive ? "active" : "inactive"}
                          disabled={!canEditThisUser}
                          onChange={(event) =>
                            setUserDrafts((current) => ({
                              ...current,
                              [item.id]: {
                                ...current[item.id],
                                isActive: event.target.value === "active",
                              },
                            }))
                          }
                          className="w-full min-w-0 rounded-md border border-white/15 bg-re7-navy px-3 py-2 text-sm text-white outline-none ring-0 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <option value="active">Ativo</option>
                          <option value="inactive">Inativo</option>
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="users-settings-card-actions flex flex-wrap items-center justify-between gap-2 bg-black/10 px-3 pb-3">
                    <p className="text-xs text-white/55">
                      Reset de senha ainda indisponivel no /app.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleUpdateUser(item)}
                      disabled={savingUserId === item.id || !canEditThisUser}
                      className="inline-flex items-center gap-1.5 rounded-md bg-re7-orange px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-black/10 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-re7-sky disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/45 disabled:shadow-none sm:text-sm"
                    >
                      <ActionIcon>✓</ActionIcon>
                      {savingUserId === item.id ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                    </>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
      </div>
    </AppShell>
  );
}
