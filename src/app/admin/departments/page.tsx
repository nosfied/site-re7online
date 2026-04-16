"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAdminConsole } from "@/components/admin/AdminConsoleProvider";
import {
  AdminClientItem,
  AdminDepartmentItem,
  createDepartment,
  fetchAdminClients,
  fetchDepartments,
  formatDateTime,
  updateDepartment,
} from "@/lib/whatsappAdminApi";

export default function AdminDepartmentsPage() {
  const { connection } = useAdminConsole();
  const [clients, setClients] = useState<AdminClientItem[]>([]);
  const [clientKey, setClientKey] = useState("");
  const [departments, setDepartments] = useState<AdminDepartmentItem[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connection.baseUrl || !connection.adminToken) return;
    let cancelled = false;
    fetchAdminClients(connection)
      .then((response) => {
        if (cancelled) return;
        setClients(response.items);
        setClientKey((current) => current || response.items[0]?.clientKey || "");
      })
      .catch((err: { message?: string }) => {
        if (cancelled) return;
        setError(err.message || "Falha ao carregar tenants.");
      });
    return () => {
      cancelled = true;
    };
  }, [connection]);

  const loadItems = async (activeClientKey: string) => {
    const response = await fetchDepartments(connection, activeClientKey, {
      includeInactive: true,
    });
    setDepartments(response.items);
  };

  useEffect(() => {
    if (!connection.baseUrl || !connection.adminToken || !clientKey) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDepartments(connection, clientKey, {
      includeInactive: true,
    })
      .then((response) => {
        if (cancelled) return;
        setDepartments(response.items);
      })
      .catch((err: { message?: string }) => {
        if (cancelled) return;
        setError(err.message || "Falha ao carregar setores.");
        setDepartments([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientKey, connection]);

  const sortedDepartments = useMemo(
    () =>
      [...departments].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return a.name.localeCompare(b.name, "pt-BR");
      }),
    [departments]
  );

  const handleCreate = async () => {
    if (!clientKey) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Informe o nome do setor.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createDepartment(connection, clientKey, { name: trimmedName });
      setName("");
      await loadItems(clientKey);
    } catch (err) {
      const typed = err as { message?: string };
      setError(typed.message || "Falha ao criar setor.");
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (item: AdminDepartmentItem) => {
    if (!clientKey) return;
    setTogglingId(item.id);
    setError(null);
    try {
      await updateDepartment(connection, clientKey, item.id, { isActive: !item.isActive });
      await loadItems(clientKey);
    } catch (err) {
      const typed = err as { message?: string };
      setError(typed.message || "Falha ao atualizar setor.");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="px-4 py-8 text-white md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Departments</h1>
            <p className="text-sm text-white/70">Gestao minima de setores por tenant.</p>
          </div>
          <Link
            href="/admin/tenants"
            className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
          >
            Voltar
          </Link>
        </header>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)_auto]">
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Tenant</span>
              <select
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={clientKey}
                onChange={(event) => setClientKey(event.target.value)}
              >
                <option value="">Selecione...</option>
                {clients.map((item) => (
                  <option key={item.clientKey} value={item.clientKey}>
                    {item.name} ({item.clientKey})
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Novo setor</span>
              <input
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Atendimento Geral"
              />
            </label>

            <div className="flex items-end">
              <button
                type="button"
                onClick={handleCreate}
                disabled={!clientKey || creating}
                className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "Criando..." : "Criar setor"}
              </button>
            </div>
          </div>
        </section>

        {loading ? <p className="text-sm text-white/70">Carregando setores...</p> : null}
        {error ? (
          <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}

        <section className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold">Setores do tenant</h2>
          </div>
          {sortedDepartments.length ? (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-white/10 text-left">
                <tr>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Criado em</th>
                  <th className="px-3 py-2">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {sortedDepartments.map((item) => (
                  <tr key={item.id} className="border-t border-white/10">
                    <td className="px-3 py-2">{item.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{item.id}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          item.isActive
                            ? "bg-emerald-500/20 text-emerald-100"
                            : "bg-white/10 text-white/70"
                        }`}
                      >
                        {item.isActive ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-3 py-2">{formatDateTime(item.createdAt)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => handleToggle(item)}
                        disabled={togglingId === item.id}
                        aria-label={item.isActive ? "Desativar setor" : "Ativar setor"}
                        className={`relative inline-flex h-7 w-14 items-center rounded-full border transition ${
                          item.isActive
                            ? "border-emerald-400/50 bg-emerald-500/30"
                            : "border-white/20 bg-white/10"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        <span className="sr-only">
                          {togglingId === item.id
                            ? "Salvando alteracao do setor"
                            : item.isActive
                              ? "Desativar setor"
                              : "Ativar setor"}
                        </span>
                        <span
                          className={`absolute left-1 text-[10px] font-semibold uppercase tracking-wide ${
                            item.isActive ? "text-emerald-100" : "text-white/60"
                          }`}
                        >
                          {togglingId === item.id ? "..." : item.isActive ? "On" : "Off"}
                        </span>
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
                            item.isActive ? "translate-x-8" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-4 text-sm text-white/70">Nenhum setor cadastrado para este tenant.</p>
          )}
        </section>
      </div>
    </div>
  );
}
