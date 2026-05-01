"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Fragment, ReactNode, useEffect, useMemo, useState } from "react";
import { useAdminConsole } from "@/components/admin/AdminConsoleProvider";
import { FeedbackToast } from "@/components/ui/FeedbackToast";
import { isSelectableDepartment } from "@/lib/departments";
import {
  AdminDepartmentItem,
  AdminUserItem,
  createUser,
  fetchDepartments,
  fetchTenantById,
  fetchUsers,
  formatDateTime,
  resetUserPassword,
  updateUser,
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

function ActionIcon({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center text-sm leading-none">
      {children}
    </span>
  );
}

export default function TenantUsersPage() {
  const params = useParams<{ tenantId: string }>();
  const searchParams = useSearchParams();
  const { connection } = useAdminConsole();
  const tenantId = useMemo(() => {
    const rawTenantId = params?.tenantId;
    if (Array.isArray(rawTenantId)) {
      return rawTenantId[0] ? decodeURIComponent(rawTenantId[0]) : "";
    }
    return rawTenantId ? decodeURIComponent(rawTenantId) : "";
  }, [params]);
  const [clientKey, setClientKey] = useState(searchParams.get("clientKey")?.trim() ?? "");
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [departments, setDepartments] = useState<AdminDepartmentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
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

  const loadUsers = async (activeClientKey: string) => {
    const response = await fetchUsers(connection, activeClientKey);
    setUsers(response.items);
    setUserDrafts(
      Object.fromEntries(
        response.items.map((item) => [
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
  };

  useEffect(() => {
    if (!tenantId || clientKey || !connection.baseUrl || !connection.adminToken) return;
    let cancelled = false;
    fetchTenantById(connection, tenantId)
      .then((response) => {
        if (!cancelled) {
          setClientKey(response.client?.clientKey ?? "");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Nao foi possivel resolver o clientKey deste tenant.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clientKey, connection, tenantId]);

  useEffect(() => {
    if (!clientKey || !connection.baseUrl || !connection.adminToken) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchUsers(connection, clientKey),
      fetchDepartments(connection, clientKey, { includeInactive: true }),
    ])
      .then(([usersResponse, departmentsResponse]) => {
        if (cancelled) return;
        setUsers(usersResponse.items);
        setDepartments(departmentsResponse.items);
        setUserDrafts(
          Object.fromEntries(
            usersResponse.items.map((item) => [
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
      })
      .catch((err: { message?: string }) => {
        if (!cancelled) {
          setError(err.message || "Falha ao carregar usuarios e setores.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientKey, connection]);

  const departmentNameById = useMemo(
    () => Object.fromEntries(departments.map((item) => [item.id, item.name])),
    [departments]
  );
  const selectableDepartments = useMemo(
    () => departments.filter(isSelectableDepartment),
    [departments]
  );

  const isDepartmentRequired = (role: string) => role === "AGENT" || role === "SUPERVISOR";

  useEffect(() => {
    if (!userSuccess && !actionSuccess) return;
    const timer = window.setTimeout(() => {
      setUserSuccess(null);
      setActionSuccess(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [actionSuccess, userSuccess]);

  const handleCreateUser = async () => {
    if (!clientKey) return;
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
      await createUser(connection, clientKey, {
        name: userForm.name.trim(),
        email: emailUsed,
        password: userForm.password,
        role: userForm.role,
        departmentId: userForm.departmentId || null,
        isActive: userForm.isActive,
      });
      setUserForm(EMPTY_USER_FORM);
      await loadUsers(clientKey);
      setUserSuccess(`Usuario criado com sucesso. Email: ${emailUsed}`);
    } catch (err) {
      const typed = err as { message?: string; status?: number };
      const message = typed.message || "Nao foi possivel criar o usuario.";
      if (/user_limit_exceeded/i.test(message)) {
        setUserError("Limite de usuarios ativos contratado para este tenant foi atingido.");
      } else if (/user_already_exists|unique/i.test(message) || typed.status === 409) {
        setUserError("Ja existe um usuario com esse email.");
      } else if (/weak_password/i.test(message)) {
        setUserError("Senha deve ter pelo menos 6 caracteres.");
      } else if (/invalid_role/i.test(message)) {
        setUserError("Selecione um role valido.");
      } else if (/department_required/i.test(message)) {
        setUserError("Selecione um setor para AGENT ou SUPERVISOR.");
      } else if (/department_not_found/i.test(message)) {
        setUserError("Setor invalido para este tenant.");
      } else {
        setUserError(message);
      }
    } finally {
      setCreatingUser(false);
    }
  };

  const handleUpdateUser = async (item: AdminUserItem) => {
    if (!clientKey) return;
    const draft = userDrafts[item.id];
    if (!draft) return;
    const nextRole = String(draft.role ?? item.role).trim().toUpperCase();
    if (!USER_ROLE_OPTIONS.includes(nextRole as (typeof USER_ROLE_OPTIONS)[number])) {
      setActionError("Selecione um role valido.");
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
      const response = await updateUser(connection, item.id, clientKey, {
        name: draft.name.trim(),
        email: draft.email.trim().toLowerCase(),
        role: nextRole,
        departmentId: draft.departmentId || null,
        isActive: draft.isActive,
      });
      setUsers((current) =>
        current.map((user) => (user.id === item.id ? response.user : user))
      );
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
      const typed = err as { message?: string; status?: number };
      const message = typed.message || "Nao foi possivel atualizar o usuario.";
      if (/user_limit_exceeded/i.test(message)) {
        setActionError("Limite de usuarios ativos contratado para este tenant foi atingido.");
      } else if (/user_already_exists|unique/i.test(message) || typed.status === 409) {
        setActionError("Ja existe um usuario com esse email.");
      } else if (/department_required/i.test(message)) {
        setActionError("Selecione um setor para AGENT ou SUPERVISOR.");
      } else if (/department_not_found/i.test(message)) {
        setActionError("Setor invalido para este tenant.");
      } else {
        setActionError(message);
      }
    } finally {
      setSavingUserId(null);
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!clientKey) return;
    if (!resetPassword.trim() || resetPassword.trim().length < 6) {
      setActionError("Senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setResettingUserId(userId);
    setActionError(null);
    setActionSuccess(null);
    try {
      await resetUserPassword(connection, userId, clientKey, resetPassword);
      setActionSuccess("Senha resetada com sucesso.");
      setResetUserId(null);
      setResetPassword("");
      await loadUsers(clientKey);
    } catch (err) {
      const typed = err as { message?: string; status?: number };
      const message = typed.message || "Nao foi possivel resetar a senha.";
      if (/weak_password/i.test(message)) {
        setActionError("Senha deve ter pelo menos 6 caracteres.");
      } else {
        setActionError(message);
      }
    } finally {
      setResettingUserId(null);
    }
  };

  return (
    <div className="px-4 py-8 text-white md:px-8">
      <FeedbackToast message={userSuccess ?? actionSuccess} />
      <FeedbackToast message={actionError ?? userError ?? error} variant="error" />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Usuarios do tenant</h1>
            <p className="text-sm font-mono text-white/70">{tenantId}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/tenants/${encodeURIComponent(tenantId)}`}
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Voltar ao tenant
            </Link>
            <Link
              href={`/admin/tenants/${encodeURIComponent(tenantId)}/onboarding`}
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Onboarding
            </Link>
          </div>
        </header>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
            Gestao de usuarios deste tenant
          </h2>
          <p className="mt-2 text-sm text-white/70">
            Esta tela reaproveita o endpoint admin ja existente para listar usuarios por tenant.
          </p>
          <p className="mt-2 text-xs text-white/50">clientKey: {clientKey || "-"}</p>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
            Novo usuario
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Nome</span>
              <input
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={userForm.name}
                onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Email</span>
              <input
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={userForm.email}
                onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Senha</span>
              <input
                type="password"
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={userForm.password}
                onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Perfil</span>
              <select
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={userForm.role}
                onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value }))}
              >
                {USER_ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Setor</span>
              <select
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={userForm.departmentId}
                onChange={(event) =>
                  setUserForm((current) => ({ ...current, departmentId: event.target.value }))
                }
              >
                <option value="">-</option>
                {selectableDepartments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Status</span>
              <select
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={userForm.isActive ? "true" : "false"}
                onChange={(event) =>
                  setUserForm((current) => ({ ...current, isActive: event.target.value === "true" }))
                }
              >
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </label>
          </div>
          {userError ? (
            <p className="mt-3 rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
              {userError}
            </p>
          ) : null}
          {userSuccess ? (
            <p className="mt-3 rounded-md border border-emerald-400/30 bg-emerald-900/20 p-3 text-sm text-emerald-100">
              {userSuccess}
            </p>
          ) : null}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={creatingUser}
              onClick={handleCreateUser}
              className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creatingUser ? "Criando..." : "Criar usuario"}
            </button>
          </div>
        </section>

        {loading ? <p className="text-sm text-white/70">Carregando usuarios...</p> : null}
        {error ? (
          <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}

        <section className="rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-4 py-3 text-sm text-white/70">
            Edite os dados na linha do usuario e clique em <span className="font-semibold text-white">Salvar</span>.
          </div>
          {actionError ? (
            <p className="m-4 rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
              {actionError}
            </p>
          ) : null}
          <div className="grid gap-3 p-4">
            {users.map((item) => (
              <Fragment key={item.id}>
                <article className="rounded-xl border border-white/10 bg-re7-navy/30 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{item.name}</h3>
                        <p className="text-sm text-white/60">{item.email}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <InfoBadge label={item.role} />
                        <InfoBadge
                          label={item.departmentId ? departmentNameById[item.departmentId] ?? item.departmentId : "Sem setor"}
                          tone={item.departmentId ? "default" : "warning"}
                        />
                        <InfoBadge
                          label={(item.isActive ?? true) ? "Ativo" : "Inativo"}
                          tone={(item.isActive ?? true) ? "success" : "warning"}
                        />
                      </div>
                      <p className="text-xs text-white/45">Criado em {formatDateTime(item.createdAt)}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={savingUserId === item.id}
                        onClick={() => handleUpdateUser(item)}
                        className="inline-flex items-center gap-2 rounded-md border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <ActionIcon>💾</ActionIcon>
                        <span>{savingUserId === item.id ? "Salvando..." : "Salvar"}</span>
                      </button>
                      <button
                        type="button"
                        disabled={resettingUserId === item.id}
                        onClick={() => {
                          setActionError(null);
                          setActionSuccess(null);
                          setResetUserId((current) => (current === item.id ? null : item.id));
                          setResetPassword("");
                        }}
                        className="inline-flex items-center gap-2 rounded-md border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <ActionIcon>🔑</ActionIcon>
                        <span>{resettingUserId === item.id ? "Resetando..." : "Senha"}</span>
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <label className="grid gap-1 text-sm">
                      <span className="text-white/65">Nome</span>
                      <input
                        aria-label={`Nome do usuario ${item.name}`}
                        className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                        value={userDrafts[item.id]?.name ?? item.name}
                        onChange={(event) =>
                          setUserDrafts((current) => ({
                            ...current,
                            [item.id]: {
                              ...(current[item.id] ?? {
                                name: item.name,
                                email: item.email,
                                role: item.role,
                                departmentId: item.departmentId ?? "",
                                isActive: item.isActive ?? true,
                              }),
                              name: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="text-white/65">Email</span>
                      <input
                        aria-label={`Email do usuario ${item.name}`}
                        className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                        value={userDrafts[item.id]?.email ?? item.email}
                        onChange={(event) =>
                          setUserDrafts((current) => ({
                            ...current,
                            [item.id]: {
                              ...(current[item.id] ?? {
                                name: item.name,
                                email: item.email,
                                role: item.role,
                                departmentId: item.departmentId ?? "",
                                isActive: item.isActive ?? true,
                              }),
                              email: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="text-white/65">Perfil</span>
                      <select
                        aria-label={`Perfil do usuario ${item.name}`}
                        className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                        value={userDrafts[item.id]?.role ?? item.role}
                        onChange={(event) =>
                          setUserDrafts((current) => ({
                            ...current,
                            [item.id]: {
                              ...(current[item.id] ?? {
                                name: item.name,
                                email: item.email,
                                role: item.role,
                                departmentId: item.departmentId ?? "",
                                isActive: item.isActive ?? true,
                              }),
                              role: event.target.value,
                            },
                          }))
                        }
                      >
                        {USER_ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="text-white/65">Setor</span>
                      <select
                        aria-label={`Setor do usuario ${item.name}`}
                        className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                        value={userDrafts[item.id]?.departmentId ?? item.departmentId ?? ""}
                        onChange={(event) =>
                          setUserDrafts((current) => ({
                            ...current,
                            [item.id]: {
                              ...(current[item.id] ?? {
                                name: item.name,
                                email: item.email,
                                role: item.role,
                                departmentId: item.departmentId ?? "",
                                isActive: item.isActive ?? true,
                              }),
                              departmentId: event.target.value,
                            },
                          }))
                        }
                      >
                        <option value="">-</option>
                        {selectableDepartments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="text-white/65">Status</span>
                      <select
                        aria-label={`Status do usuario ${item.name}`}
                        className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                        value={(userDrafts[item.id]?.isActive ?? item.isActive ?? true) ? "true" : "false"}
                        onChange={(event) =>
                          setUserDrafts((current) => ({
                            ...current,
                            [item.id]: {
                              ...(current[item.id] ?? {
                                name: item.name,
                                email: item.email,
                                role: item.role,
                                departmentId: item.departmentId ?? "",
                                isActive: item.isActive ?? true,
                              }),
                              isActive: event.target.value === "true",
                            },
                          }))
                        }
                      >
                        <option value="true">Ativo</option>
                        <option value="false">Inativo</option>
                      </select>
                    </label>
                  </div>
                </article>

                {resetUserId === item.id ? (
                  <div className="mt-[-4px] rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end">
                      <label className="grid flex-1 gap-1 text-sm">
                        <span className="text-white/70">Nova senha</span>
                        <input
                          type="password"
                          className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                          value={resetPassword}
                          onChange={(event) => setResetPassword(event.target.value)}
                        />
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={resettingUserId === item.id}
                          onClick={() => handleResetPassword(item.id)}
                          className="inline-flex items-center gap-2 rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <ActionIcon>✅</ActionIcon>
                          <span>{resettingUserId === item.id ? "Salvando..." : "Confirmar"}</span>
                        </button>
                        <button
                          type="button"
                          disabled={resettingUserId === item.id}
                          onClick={() => {
                            setResetUserId(null);
                            setResetPassword("");
                            setActionError(null);
                          }}
                          className="inline-flex items-center gap-2 rounded-md border border-white/20 px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <ActionIcon>✕</ActionIcon>
                          <span>Cancelar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </Fragment>
            ))}
            {users.length === 0 && !loading ? (
              <p className="rounded-md border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-white/70">
                Nenhum usuario encontrado.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
