"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useAdminConsole } from "@/components/admin/AdminConsoleProvider";
import {
  AdminUserItem,
  createUser,
  fetchTenantById,
  fetchUsers,
  formatDateTime,
  resetUserPassword,
  updateUserRole,
} from "@/lib/whatsappAdminApi";

const USER_ROLE_OPTIONS = ["AGENT", "SUPERVISOR", "ADMIN"] as const;

const EMPTY_USER_FORM = {
  name: "",
  email: "",
  password: "",
  role: "AGENT",
};

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
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});

  const loadUsers = async (activeClientKey: string) => {
    const response = await fetchUsers(connection, activeClientKey);
    setUsers(response.items);
    setRoleDrafts(
      Object.fromEntries(response.items.map((item) => [item.id, String(item.role || "AGENT").toUpperCase()]))
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
    fetchUsers(connection, clientKey)
      .then((response) => {
        if (!cancelled) {
          setUsers(response.items);
          setRoleDrafts(
            Object.fromEntries(
              response.items.map((item) => [item.id, String(item.role || "AGENT").toUpperCase()])
            )
          );
        }
      })
      .catch((err: { message?: string }) => {
        if (!cancelled) {
          setError(err.message || "Falha ao carregar usuarios.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientKey, connection]);

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
      });
      setUserForm(EMPTY_USER_FORM);
      await loadUsers(clientKey);
      setUserSuccess(`Usuario criado com sucesso. Email: ${emailUsed}`);
    } catch (err) {
      const typed = err as { message?: string; status?: number };
      const message = typed.message || "Nao foi possivel criar o usuario.";
      if (/user_already_exists|unique/i.test(message) || typed.status === 409) {
        setUserError("Ja existe um usuario com esse email.");
      } else if (/weak_password/i.test(message)) {
        setUserError("Senha deve ter pelo menos 6 caracteres.");
      } else if (/invalid_role/i.test(message)) {
        setUserError("Selecione um role valido.");
      } else {
        setUserError(message);
      }
    } finally {
      setCreatingUser(false);
    }
  };

  const handleUpdateRole = async (item: AdminUserItem) => {
    if (!clientKey) return;
    const nextRole = String(roleDrafts[item.id] ?? item.role).trim().toUpperCase();
    if (!USER_ROLE_OPTIONS.includes(nextRole as (typeof USER_ROLE_OPTIONS)[number])) {
      setActionError("Selecione um role valido.");
      return;
    }
    if (nextRole === item.role) return;
    setUpdatingRoleUserId(item.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      await updateUserRole(connection, item.id, clientKey, nextRole);
      setUsers((current) =>
        current.map((user) => (user.id === item.id ? { ...user, role: nextRole } : user))
      );
      setRoleDrafts((current) => ({ ...current, [item.id]: nextRole }));
      setActionSuccess("Role atualizado com sucesso.");
    } catch (err) {
      const typed = err as { message?: string };
      setActionError(typed.message || "Nao foi possivel atualizar o role.");
    } finally {
      setUpdatingRoleUserId(null);
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
          <div className="mt-4 grid gap-3 md:grid-cols-4">
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
              <span className="text-white/70">Role</span>
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

        <section className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
          {actionError ? (
            <p className="m-4 rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
              {actionError}
            </p>
          ) : null}
          {actionSuccess ? (
            <p className="m-4 rounded-md border border-emerald-400/30 bg-emerald-900/20 p-3 text-sm text-emerald-100">
              {actionSuccess}
            </p>
          ) : null}
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-white/10 text-left">
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Criado em</th>
                <th className="px-3 py-2">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {users.map((item) => (
                <Fragment key={item.id}>
                  <tr className="border-t border-white/10">
                    <td className="px-3 py-2">{item.name}</td>
                    <td className="px-3 py-2">{item.email}</td>
                    <td className="px-3 py-2">
                      <select
                        className="min-w-40 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky"
                        value={roleDrafts[item.id] ?? item.role}
                        onChange={(event) =>
                          setRoleDrafts((current) => ({ ...current, [item.id]: event.target.value }))
                        }
                      >
                        {USER_ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">{formatDateTime(item.createdAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={
                            updatingRoleUserId === item.id ||
                            (roleDrafts[item.id] ?? item.role) === item.role
                          }
                          onClick={() => handleUpdateRole(item)}
                          className="rounded-md border border-white/20 px-3 py-1 text-xs hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {updatingRoleUserId === item.id ? "Salvando role..." : "Salvar role"}
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
                          className="rounded-md border border-white/20 px-3 py-1 text-xs hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {resettingUserId === item.id ? "Resetando..." : "Resetar senha"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {resetUserId === item.id ? (
                    <tr className="border-t border-white/10 bg-white/[0.03]">
                      <td colSpan={5} className="px-3 py-3">
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
                              className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {resettingUserId === item.id ? "Salvando..." : "Confirmar reset"}
                            </button>
                            <button
                              type="button"
                              disabled={resettingUserId === item.id}
                              onClick={() => {
                                setResetUserId(null);
                                setResetPassword("");
                                setActionError(null);
                              }}
                              className="rounded-md border border-white/20 px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
              {users.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-white/70">
                    Nenhum usuario encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
