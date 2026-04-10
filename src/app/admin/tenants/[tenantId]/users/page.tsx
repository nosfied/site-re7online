"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAdminConsole } from "@/components/admin/AdminConsoleProvider";
import { AdminUserItem, fetchTenantById, fetchUsers, formatDateTime } from "@/lib/whatsappAdminApi";

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
        if (!cancelled) setUsers(response.items);
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

        {loading ? <p className="text-sm text-white/70">Carregando usuarios...</p> : null}
        {error ? (
          <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}

        <section className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-white/10 text-left">
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Criado em</th>
              </tr>
            </thead>
            <tbody>
              {users.map((item) => (
                <tr key={item.id} className="border-t border-white/10">
                  <td className="px-3 py-2">{item.name}</td>
                  <td className="px-3 py-2">{item.email}</td>
                  <td className="px-3 py-2">{item.role}</td>
                  <td className="px-3 py-2">{formatDateTime(item.createdAt)}</td>
                </tr>
              ))}
              {users.length === 0 && !loading ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-white/70">
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
