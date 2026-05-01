"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAdminConsole } from "@/components/admin/AdminConsoleProvider";
import {
  createAdminClient,
  fetchAdminClients,
  fetchTenantsSummary,
  formatDateTime,
  formatPct,
  SummaryRange,
  TenantSummaryItem,
  updateTenantById,
} from "@/lib/whatsappAdminApi";

const ranges: SummaryRange[] = ["1h", "24h", "7d", "30d"];

function getTenantActivityStatus(lastMessageAt: string | null) {
  if (!lastMessageAt) {
    return {
      label: "inativo",
      className: "bg-white/10 text-white/70",
    };
  }

  const diff = Date.now() - new Date(lastMessageAt).getTime();
  if (diff < 1000 * 60 * 60) {
    return {
      label: "ativo",
      className: "bg-emerald-500/20 text-emerald-200",
    };
  }
  if (diff < 1000 * 60 * 60 * 24) {
    return {
      label: "recente",
      className: "bg-amber-500/20 text-amber-200",
    };
  }
  return {
    label: "inativo",
    className: "bg-white/10 text-white/70",
  };
}

function normalizeClientKeyInput(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

export default function TenantsSummaryPage() {
  const { connection } = useAdminConsole();
  const [range, setRange] = useState<SummaryRange>("24h");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<TenantSummaryItem[]>([]);
  const [existingClientKeys, setExistingClientKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedClientKey, setCopiedClientKey] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [createdTenant, setCreatedTenant] = useState<{ tenantId: string; clientKey: string } | null>(null);
  const [createForm, setCreateForm] = useState({
    name: "",
    clientKey: "",
    phoneNumberId: "",
  });

  useEffect(() => {
    if (!connection.baseUrl || !connection.adminToken) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([fetchTenantsSummary(connection, range), fetchAdminClients(connection)])
      .then(([summaryResult, clientsResult]) => {
        if (cancelled) return;
        setItems(summaryResult);
        setExistingClientKeys(
          clientsResult.items.map((item) => item.clientKey.trim().toLowerCase())
        );
      })
      .catch((err: { status?: number; message?: string }) => {
        if (cancelled) return;
        if (err.status === 403) {
          setError("Sem permissao para acessar summary.");
          return;
        }
        setError(err.message || "Falha ao carregar tenants.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [connection, range]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const haystack = `${item.name} ${item.tenantId} ${item.clientKey}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [items, search]);

  const reloadSummary = async () => {
    const [summaryResult, clientsResult] = await Promise.all([
      fetchTenantsSummary(connection, range),
      fetchAdminClients(connection),
    ]);
    setItems(summaryResult);
    setExistingClientKeys(
      clientsResult.items.map((item) => item.clientKey.trim().toLowerCase())
    );
  };

  const handleCreateTenant = async () => {
    const name = createForm.name.trim();
    const clientKey = normalizeClientKeyInput(createForm.clientKey);
    const phoneNumberId = createForm.phoneNumberId.trim();

    setCreateError(null);
    setCreateSuccess(null);
    setCreatedTenant(null);

    if (!name) {
      setCreateError("Informe o nome do cliente.");
      return;
    }
    if (!clientKey) {
      setCreateError("Informe o client key.");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(clientKey)) {
      setCreateError("Use apenas letras minusculas, numeros e hifen no client key.");
      return;
    }
    if (!phoneNumberId) {
      setCreateError("Informe o phoneNumberId inicial.");
      return;
    }
    if (existingClientKeys.includes(clientKey)) {
      setCreateError("Ja existe um tenant com esse client key.");
      return;
    }

    setCreating(true);
    try {
      await createAdminClient(connection, {
        name,
        clientKey,
        phoneNumberId,
      });

      try {
        await updateTenantById(connection, clientKey, {
          id: clientKey,
          name,
          metaPhoneNumberId: phoneNumberId,
          maxActiveAppUsers: 5,
          allowlist: [],
          handoffAttendantWaid: "",
          defaultLanguage: "pt_BR",
          templates: {
            manualHandoff: "re7_atendente_manual_v1",
          },
        });
      } catch {
        setCreatedTenant({ tenantId: clientKey, clientKey });
        setCreateError("Tenant criado, mas falha ao inicializar configuracao.");
        return;
      }

      await reloadSummary();
      setCreateSuccess("Tenant criado com sucesso. Prossiga para o onboarding.");
      setCreatedTenant({ tenantId: clientKey, clientKey });
      setCreateForm({ name: "", clientKey: "", phoneNumberId: "" });
      setShowCreateForm(false);
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 409 && typed.message === "phone_number_conflict") {
        setCreateError("Este phoneNumberId ja esta vinculado a outro tenant.");
        return;
      }
      if (typed.status === 409) {
        setCreateError("Ja existe um tenant com esse client key.");
        return;
      }
      if (typed.status && typed.status < 500) {
        setCreateError(typed.message || "Nao foi possivel criar o tenant.");
        return;
      }
      setCreateError("Nao foi possivel criar o tenant.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="px-4 py-8 text-white md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Tenants</h1>
            <p className="text-sm text-white/70">Hub operacional do console interno.</p>
          </div>
          <Link
            href="/"
            className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
          >
            Voltar ao site
          </Link>
        </header>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
                Criacao rapida
              </h2>
              <p className="mt-1 text-sm text-white/70">
                Crie o client relacional e o tenant base sem sair do hub.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm((current) => !current);
                setCreateError(null);
                setCreateSuccess(null);
              }}
              className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              {showCreateForm ? "Fechar" : "Novo tenant"}
            </button>
          </div>

          {showCreateForm ? (
            <div className="mt-4 grid gap-4 rounded-xl border border-white/10 bg-re7-navy/40 p-4 md:grid-cols-3">
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">Nome do cliente</span>
                <input
                  className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={createForm.name}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Justa Advocacia"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">Client key</span>
                <input
                  className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={createForm.clientKey}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      clientKey: normalizeClientKeyInput(event.target.value),
                    }))
                  }
                  placeholder="justa-advocacia"
                />
                <span className="text-xs text-white/50">
                  clientKey final: {normalizeClientKeyInput(createForm.clientKey) || "-"}
                </span>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">phoneNumberId inicial</span>
                <input
                  className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={createForm.phoneNumberId}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      phoneNumberId: event.target.value.trim(),
                    }))
                  }
                  placeholder="1052978311228316"
                />
              </label>
              <div className="md:col-span-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleCreateTenant}
                  disabled={creating}
                  className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating ? "Criando..." : "Criar tenant"}
                </button>
                <p className="text-xs text-white/50">
                  Contrato atual do backend exige: `name`, `clientKey` e `phone_number_id`.
                </p>
              </div>
            </div>
          ) : null}

          {createError ? (
            <p className="mt-4 rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
              {createError}
            </p>
          ) : null}
          {createSuccess ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-emerald-400/30 bg-emerald-900/20 p-3 text-sm text-emerald-100">
              <span>{createSuccess}</span>
              {createdTenant ? (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(createdTenant.clientKey);
                    }}
                    className="rounded-md border border-emerald-300/30 px-3 py-1 text-xs hover:bg-emerald-900/30"
                  >
                    Copiar clientKey
                  </button>
                  <Link
                    href={`/admin/tenants/${encodeURIComponent(createdTenant.tenantId)}`}
                    className="rounded-md border border-emerald-300/30 px-3 py-1 text-xs hover:bg-emerald-900/30"
                  >
                    Abrir tenant
                  </Link>
                  <Link
                    href={`/admin/tenants/${encodeURIComponent(createdTenant.tenantId)}/onboarding`}
                    className="rounded-md border border-emerald-300/30 px-3 py-1 text-xs hover:bg-emerald-900/30"
                  >
                    Ir para onboarding
                  </Link>
                </>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Range</span>
              <select
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2"
                value={range}
                onChange={(event) => setRange(event.target.value as SummaryRange)}
              >
                {ranges.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>

            <label className="md:col-span-2 grid gap-1 text-sm">
              <span className="text-white/70">Search (name, tenantId, clientKey)</span>
              <input
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="re7online"
              />
            </label>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/50">Tenants visiveis</p>
            <p className="mt-2 text-2xl font-semibold">{filtered.length}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/50">Com warning</p>
            <p className="mt-2 text-2xl font-semibold">
              {filtered.filter((item) => item.quota.warning).length}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/50">Sem atividade</p>
            <p className="mt-2 text-2xl font-semibold">
              {filtered.filter((item) => !item.lastMessageAt).length}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/50">Range atual</p>
            <p className="mt-2 text-2xl font-semibold">{range}</p>
          </div>
        </section>

        {loading ? <p className="text-sm text-white/70">Carregando...</p> : null}
        {error ? (
          <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}

        <section className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="bg-white/10 text-left">
              <tr>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">tenantId</th>
                <th className="px-3 py-2">clientKey</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Quota</th>
                <th className="px-3 py-2">Pct</th>
                <th className="px-3 py-2">Warning</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Last message</th>
                <th className="px-3 py-2">Inbound</th>
                <th className="px-3 py-2">Outbound text</th>
                <th className="px-3 py-2">Outbound tpl</th>
                <th className="px-3 py-2">Outbound failed</th>
                <th className="px-3 py-2 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.tenantId} className="border-t border-white/10 hover:bg-white/[0.03]">
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-xs text-white/50">Operacao do tenant</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{item.tenantId}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{item.clientKey}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(item.clientKey);
                          setCopiedClientKey(item.clientKey);
                          window.setTimeout(() => {
                            setCopiedClientKey((current) =>
                              current === item.clientKey ? null : current
                            );
                          }, 1500);
                        }}
                        className="rounded-md border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10"
                      >
                        {copiedClientKey === item.clientKey ? "copiado" : "copiar"}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {(() => {
                      const status = getTenantActivityStatus(item.lastMessageAt);
                      return (
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${status.className}`}>
                          {status.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        item.quota.warning
                          ? "bg-amber-500/20 text-amber-200"
                          : "bg-emerald-500/20 text-emerald-200"
                      }`}
                    >
                      {item.quota.warning ? "warning" : "ok"}
                    </span>
                  </td>
                  <td className="px-3 py-2">{item.quota.used} / {item.quota.limit ?? "-"}</td>
                  <td className="px-3 py-2">{formatPct(item.quota.pct)}</td>
                  <td className="px-3 py-2">{item.quota.period}</td>
                  <td className="px-3 py-2">{formatDateTime(item.lastMessageAt)}</td>
                  <td className="px-3 py-2">{item.counts.inbound.received}</td>
                  <td className="px-3 py-2">{item.counts.outbound.sent_text}</td>
                  <td className="px-3 py-2">{item.counts.outbound.sent_template}</td>
                  <td className="px-3 py-2">{item.counts.outbound.failed}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/admin/tenants/${encodeURIComponent(item.tenantId)}`}
                      className="inline-flex rounded-md border border-white/20 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
                    >
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading ? (
                <tr>
                  <td className="px-3 py-4 text-center text-white/70" colSpan={14}>
                    Nenhum tenant encontrado.
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
