"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAdminConsole } from "@/components/admin/AdminConsoleProvider";
import {
  fetchTenantById,
  normalizeWaIdList,
  TenantConfigResponse,
  updateTenantById,
} from "@/lib/whatsappAdminApi";

type TenantFormState = {
  allowlistInput: string;
  quotaMonthlyConversations: string;
  quotaWarnAtPct: string;
  quotaExcludeWaIdsInput: string;
  quotaBlockedReplyText: string;
  disableAutoReply: boolean;
  disableChatbot: boolean;
};

export default function TenantEditPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = useMemo(() => {
    const rawTenantId = params?.tenantId;
    if (Array.isArray(rawTenantId)) {
      return rawTenantId[0] ? decodeURIComponent(rawTenantId[0]) : "";
    }
    return rawTenantId ? decodeURIComponent(rawTenantId) : "";
  }, [params]);

  const { connection } = useAdminConsole();
  const [form, setForm] = useState<TenantFormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientSnapshot, setClientSnapshot] = useState<TenantConfigResponse["client"] | null>(null);
  const [tenantSnapshot, setTenantSnapshot] = useState<TenantConfigResponse["tenant"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<{ fieldsChanged?: string[]; backupPath?: string } | null>(null);
  const templatesHref = clientSnapshot?.clientKey
    ? `/admin/templates/manage?tenantId=${encodeURIComponent(tenantId)}&clientKey=${encodeURIComponent(clientSnapshot.clientKey)}`
    : "/admin/templates/manage";

  useEffect(() => {
    if (!tenantId) return;
    if (!connection.baseUrl || !connection.adminToken) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchTenantById(connection, tenantId)
      .then((response) => {
        if (cancelled) return;
        const tenant = response.tenant;
        setClientSnapshot(response.client ?? null);
        setTenantSnapshot(tenant);
        setForm({
          allowlistInput: (tenant.allowlist ?? []).join("\n"),
          quotaMonthlyConversations:
            typeof tenant.quotaMonthlyConversations === "number"
              ? String(tenant.quotaMonthlyConversations)
              : "",
          quotaWarnAtPct:
            typeof tenant.quotaWarnAtPct === "number" ? String(tenant.quotaWarnAtPct) : "",
          quotaExcludeWaIdsInput: (tenant.quotaExcludeWaIds ?? []).join("\n"),
          quotaBlockedReplyText: tenant.quotaBlockedReplyText ?? "",
          disableAutoReply: tenant.disableAutoReply ?? false,
          disableChatbot: tenant.disableChatbot ?? false,
        });
      })
      .catch((err: { status?: number; message?: string }) => {
        if (cancelled) return;
        if (err.status === 403) {
          setError("Sem permissao para editar tenants.");
          return;
        }
        if (err.status === 404) {
          setError("Tenant nao encontrado.");
          return;
        }
        setError(err.message || "Falha ao carregar tenant.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [connection, tenantId]);

  const hasValidWarnAtPct = useMemo(() => {
    if (!form || !form.quotaWarnAtPct.trim()) return true;
    const value = Number(form.quotaWarnAtPct);
    return Number.isFinite(value) && value >= 0 && value <= 1;
  }, [form]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;

    const payload: Record<string, unknown> = {
      ...(tenantSnapshot ?? {}),
      allowlist: normalizeWaIdList(form.allowlistInput),
      quotaExcludeWaIds: normalizeWaIdList(form.quotaExcludeWaIdsInput),
      disableAutoReply: form.disableAutoReply,
      disableChatbot: form.disableChatbot,
    };

    if (form.quotaMonthlyConversations.trim()) {
      const value = Number(form.quotaMonthlyConversations);
      if (!Number.isFinite(value) || value < 0) {
        setError("quotaMonthlyConversations deve ser numero >= 0.");
        return;
      }
      payload.quotaMonthlyConversations = value;
    }

    if (form.quotaWarnAtPct.trim()) {
      const value = Number(form.quotaWarnAtPct);
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        setError("quotaWarnAtPct deve ficar entre 0 e 1.");
        return;
      }
      payload.quotaWarnAtPct = value;
    }

    if (form.quotaBlockedReplyText.trim()) {
      payload.quotaBlockedReplyText = form.quotaBlockedReplyText;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await updateTenantById(connection, tenantId, payload);
      setDebugInfo({ fieldsChanged: result.fieldsChanged, backupPath: result.backupPath });
      setToast("Tenant salvo com sucesso.");
      window.setTimeout(() => setToast(null), 3000);
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 403) {
        setError("Sem permissao para salvar tenant.");
      } else {
        setError(typed.message || "Falha ao salvar tenant.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 py-8 text-white md:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Tenant</h1>
            <p className="text-sm font-mono text-white/70">{tenantId}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/tenants/${encodeURIComponent(tenantId)}/onboarding`}
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Onboarding Meta
            </Link>
            <Link
              href={`/admin/tenants/${encodeURIComponent(tenantId)}/users${clientSnapshot?.clientKey ? `?clientKey=${encodeURIComponent(clientSnapshot.clientKey)}` : ""}`}
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Usuarios
            </Link>
            <Link
              href={`/admin/tenants/${encodeURIComponent(tenantId)}/campaigns`}
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Campanhas
            </Link>
            <Link
              href={templatesHref}
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Templates
            </Link>
            <Link
              href="/admin/tenants"
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Voltar
            </Link>
          </div>
        </header>

        {!tenantId ? <p className="text-sm text-white/70">Carregando tenant...</p> : null}
        {loading ? <p className="text-sm text-white/70">Carregando...</p> : null}
        {error ? (
          <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">{error}</p>
        ) : null}
        {toast ? (
          <p className="rounded-md border border-emerald-400/30 bg-emerald-900/30 p-3 text-sm text-emerald-100">{toast}</p>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Resumo do tenant</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/50">Nome</p>
                <p className="mt-2 text-sm font-medium">{tenantSnapshot?.name ?? "-"}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/50">Client key</p>
                <p className="mt-2 font-mono text-xs">{clientSnapshot?.clientKey ?? "-"}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/50">Client status</p>
                <p className="mt-2 text-sm font-medium">{clientSnapshot?.status ?? "-"}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/50">Idioma padrao</p>
                <p className="mt-2 text-sm font-medium">{tenantSnapshot?.defaultLanguage ?? "-"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Operacao</h2>
            <div className="mt-4 flex flex-col gap-3">
              <Link
                href={`/admin/tenants/${encodeURIComponent(tenantId)}/onboarding`}
                className="rounded-lg border border-white/10 bg-re7-navy/40 px-4 py-3 text-sm hover:border-re7-sky/40 hover:bg-white/5"
              >
                Conexao Meta e onboarding
              </Link>
              <Link
                href={`/admin/tenants/${encodeURIComponent(tenantId)}/campaigns`}
                className="rounded-lg border border-white/10 bg-re7-navy/40 px-4 py-3 text-sm hover:border-re7-sky/40 hover:bg-white/5"
              >
                Campanhas do tenant
              </Link>
              <Link
                href={templatesHref}
                className="rounded-lg border border-white/10 bg-re7-navy/40 px-4 py-3 text-sm hover:border-re7-sky/40 hover:bg-white/5"
              >
                Templates por tenant
              </Link>
              <Link
                href={`/admin/tenants/${encodeURIComponent(tenantId)}/users${clientSnapshot?.clientKey ? `?clientKey=${encodeURIComponent(clientSnapshot.clientKey)}` : ""}`}
                className="rounded-lg border border-white/10 bg-re7-navy/40 px-4 py-3 text-sm hover:border-re7-sky/40 hover:bg-white/5"
              >
                Usuarios do tenant
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Conexao Meta</h2>
            <div className="mt-4 grid gap-3">
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/50">Phone number id</p>
                <p className="mt-2 font-mono text-xs">{tenantSnapshot?.metaPhoneNumberId ?? "-"}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/50">Template manual handoff</p>
                <p className="mt-2 text-sm">{tenantSnapshot?.templates?.manualHandoff ?? "-"}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Configuracoes</h2>
            <div className="mt-4 grid gap-3">
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/50">Allowlist</p>
                <p className="mt-2 text-sm">{tenantSnapshot?.allowlist?.length ?? 0} itens</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/50">Quota mensal</p>
                <p className="mt-2 text-sm">{tenantSnapshot?.quotaMonthlyConversations ?? "-"}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/50">Auto reply</p>
                <p className="mt-2 text-sm">{tenantSnapshot?.disableAutoReply ? "Desligado" : "Ligado"}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/50">Chatbot</p>
                <p className="mt-2 text-sm">{tenantSnapshot?.disableChatbot ? "Desligado" : "Ligado"}</p>
              </div>
            </div>
          </div>
        </section>

        {form ? (
          <form className="grid gap-4 rounded-xl border border-white/10 bg-white/5 p-4" onSubmit={handleSubmit}>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Allowlist (um waId por linha)</span>
              <textarea
                className="min-h-24 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={form.allowlistInput}
                onChange={(event) => setForm((prev) => prev ? { ...prev, allowlistInput: event.target.value } : prev)}
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">quotaMonthlyConversations</span>
                <input
                  type="number"
                  min={0}
                  className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2"
                  value={form.quotaMonthlyConversations}
                  onChange={(event) =>
                    setForm((prev) =>
                      prev ? { ...prev, quotaMonthlyConversations: event.target.value } : prev
                    )
                  }
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">quotaWarnAtPct (0..1)</span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step="0.01"
                  className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2"
                  value={form.quotaWarnAtPct}
                  onChange={(event) =>
                    setForm((prev) =>
                      prev ? { ...prev, quotaWarnAtPct: event.target.value } : prev
                    )
                  }
                />
              </label>
            </div>

            {!hasValidWarnAtPct ? (
              <p className="text-sm text-amber-300">quotaWarnAtPct deve estar entre 0 e 1.</p>
            ) : null}

            <label className="grid gap-1 text-sm">
              <span className="text-white/70">quotaExcludeWaIds (um waId por linha)</span>
              <textarea
                className="min-h-20 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={form.quotaExcludeWaIdsInput}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, quotaExcludeWaIdsInput: event.target.value } : prev
                  )
                }
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-white/70">quotaBlockedReplyText</span>
              <textarea
                className="min-h-28 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={form.quotaBlockedReplyText}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, quotaBlockedReplyText: event.target.value } : prev
                  )
                }
                placeholder="Use placeholders: {tenantName} {period} {used} {limit} {attendantWaidMasked}"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={form.disableAutoReply}
                  onChange={(event) =>
                    setForm((prev) =>
                      prev ? { ...prev, disableAutoReply: event.target.checked } : prev
                    )
                  }
                />
                <span>Desligar respostas automaticas</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={form.disableChatbot}
                  onChange={(event) =>
                    setForm((prev) =>
                      prev ? { ...prev, disableChatbot: event.target.checked } : prev
                    )
                  }
                />
                <span>Desligar chatbot</span>
              </label>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving || !hasValidWarnAtPct}
                className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
              {debugInfo ? (
                <p className="text-xs text-white/70">
                  fieldsChanged: {(debugInfo.fieldsChanged ?? []).join(", ") || "-"} | backupPath: {debugInfo.backupPath ?? "-"}
                </p>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
