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
  displayPhoneNumber: string;
  allowlistInput: string;
  quotaMonthlyConversations: string;
  quotaWarnAtPct: string;
  quotaExcludeWaIdsInput: string;
  quotaBlockedReplyText: string;
  disableChatbot: boolean;
  disableChatbotFlowEditing: boolean;
  disableLegacyFlows: boolean;
  disableAiFallback: boolean;
  aiBusinessContext: string;
};

function TogglePill({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex min-w-16 items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
        checked
          ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
          : "border-white/15 bg-white/5 text-white/70"
      }`}
    >
      {checked ? "On" : "Off"}
    </button>
  );
}

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
  const departmentsHref = clientSnapshot?.clientKey
    ? `/admin/departments?tenantId=${encodeURIComponent(tenantId)}&clientKey=${encodeURIComponent(clientSnapshot.clientKey)}`
    : "/admin/departments";
  const reportsHref = clientSnapshot?.clientKey
    ? `/admin/reports?tenantId=${encodeURIComponent(tenantId)}&clientKey=${encodeURIComponent(clientSnapshot.clientKey)}`
    : "/admin/reports";

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
          displayPhoneNumber: tenant.displayPhoneNumber ?? "",
          allowlistInput: (tenant.allowlist ?? []).join("\n"),
          quotaMonthlyConversations:
            typeof tenant.quotaMonthlyConversations === "number"
              ? String(tenant.quotaMonthlyConversations)
              : "",
          quotaWarnAtPct:
            typeof tenant.quotaWarnAtPct === "number" ? String(tenant.quotaWarnAtPct) : "",
          quotaExcludeWaIdsInput: (tenant.quotaExcludeWaIds ?? []).join("\n"),
          quotaBlockedReplyText: tenant.quotaBlockedReplyText ?? "",
          disableChatbot: tenant.disableChatbot ?? false,
          disableChatbotFlowEditing: tenant.disableChatbotFlowEditing ?? false,
          disableLegacyFlows: tenant.disableLegacyFlows ?? true,
          disableAiFallback: tenant.disableAiFallback ?? false,
          aiBusinessContext: tenant.aiBusinessContext ?? "",
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
      displayPhoneNumber: form.displayPhoneNumber.trim() || undefined,
      allowlist: normalizeWaIdList(form.allowlistInput),
      quotaExcludeWaIds: normalizeWaIdList(form.quotaExcludeWaIdsInput),
      disableChatbot: form.disableChatbot,
      disableChatbotFlowEditing: form.disableChatbotFlowEditing,
      disableLegacyFlows: form.disableLegacyFlows,
      disableAiFallback: form.disableAiFallback,
      aiBusinessContext: form.aiBusinessContext.trim() || undefined,
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
      setTenantSnapshot(result.tenant);
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
              href={departmentsHref}
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Setores
            </Link>
            <Link
              href={reportsHref}
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Relatorios
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
                href={departmentsHref}
                className="rounded-lg border border-white/10 bg-re7-navy/40 px-4 py-3 text-sm hover:border-re7-sky/40 hover:bg-white/5"
              >
                Setores do tenant
              </Link>
              <Link
                href={`/admin/tenants/${encodeURIComponent(tenantId)}/users${clientSnapshot?.clientKey ? `?clientKey=${encodeURIComponent(clientSnapshot.clientKey)}` : ""}`}
                className="rounded-lg border border-white/10 bg-re7-navy/40 px-4 py-3 text-sm hover:border-re7-sky/40 hover:bg-white/5"
              >
                Usuarios do tenant
              </Link>
              <Link
                href={reportsHref}
                className="rounded-lg border border-white/10 bg-re7-navy/40 px-4 py-3 text-sm hover:border-re7-sky/40 hover:bg-white/5"
              >
                Relatorios do tenant
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
                <p className="text-xs uppercase tracking-wide text-white/50">Telefone exibido</p>
                <p className="mt-2 text-sm">{tenantSnapshot?.displayPhoneNumber ?? "-"}</p>
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
                <p className="text-xs uppercase tracking-wide text-white/50">Fluxo configuravel</p>
                <p className="mt-2 text-sm">{tenantSnapshot?.disableChatbot ? "Desligado" : "Ligado"}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/50">Edicao de flows</p>
                <p className="mt-2 text-sm">
                  {tenantSnapshot?.disableChatbotFlowEditing ? "Bloqueada no /app" : "Liberada no /app"}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/50">Fluxos prontos</p>
                <p className="mt-2 text-sm">{tenantSnapshot?.disableLegacyFlows ? "Desligados" : "Ligados"}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/50">IA conversacional</p>
                <p className="mt-2 text-sm">{tenantSnapshot?.disableAiFallback ? "Desligada" : "Ligada"}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/50">Contexto da IA</p>
                <p className="mt-2 text-sm">{tenantSnapshot?.aiBusinessContext?.trim() ? "Configurado" : "Ausente"}</p>
              </div>
            </div>
          </div>
        </section>

        {form ? (
          <form className="grid gap-4 rounded-xl border border-white/10 bg-white/5 p-4" onSubmit={handleSubmit}>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Telefone de contato do WhatsApp</span>
              <input
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={form.displayPhoneNumber}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, displayPhoneNumber: event.target.value } : prev
                  )
                }
                placeholder="55 84 9459-6848"
              />
              <span className="text-xs text-white/50">
                Exibido no portal do cliente. No onboarding, este campo é preenchido com
                display_phone_number quando a Meta retornar essa informação.
              </span>
            </label>

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
              <div className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-re7-navy/40 p-3 text-sm">
                <span className="space-y-1">
                  <span className="block font-medium text-white">Fluxo configuravel</span>
                  <span className="block text-white/60">Controla os flows personalizados disponiveis no /app/chatbot.</span>
                </span>
                <TogglePill
                  checked={!form.disableChatbot}
                  onToggle={() =>
                    setForm((prev) => (prev ? { ...prev, disableChatbot: !prev.disableChatbot } : prev))
                  }
                />
              </div>
              <div className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-re7-navy/40 p-3 text-sm">
                <span className="space-y-1">
                  <span className="block font-medium text-white">Fluxos prontos</span>
                  <span className="block text-white/60">Camada interna da plataforma. Fica desligada por padrao para tenants.</span>
                </span>
                <TogglePill
                  checked={!form.disableLegacyFlows}
                  onToggle={() =>
                    setForm((prev) => (prev ? { ...prev, disableLegacyFlows: !prev.disableLegacyFlows } : prev))
                  }
                />
              </div>
              <div className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-re7-navy/40 p-3 text-sm">
                <span className="space-y-1">
                  <span className="block font-medium text-white">Edicao de flows no /app</span>
                  <span className="block text-white/60">
                    Controla se o ADMIN do tenant pode criar ou editar fluxos em /app/chatbot.
                  </span>
                </span>
                <TogglePill
                  checked={!form.disableChatbotFlowEditing}
                  onToggle={() =>
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            disableChatbotFlowEditing: !prev.disableChatbotFlowEditing,
                          }
                        : prev
                    )
                  }
                />
              </div>
              <div className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-re7-navy/40 p-3 text-sm md:col-span-2">
                <span className="space-y-1">
                  <span className="block font-medium text-white">IA conversacional</span>
                  <span className="block text-white/60">Use junto com um contexto de negocio abaixo. O tenant admin so consegue ligar no /app quando esse contexto existe.</span>
                </span>
                <TogglePill
                  checked={!form.disableAiFallback}
                  onToggle={() =>
                    setForm((prev) => (prev ? { ...prev, disableAiFallback: !prev.disableAiFallback } : prev))
                  }
                />
              </div>
            </div>

            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Contexto de negocio da IA</span>
              <textarea
                className="min-h-28 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={form.aiBusinessContext}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, aiBusinessContext: event.target.value } : prev
                  )
                }
                placeholder="Descreva a empresa, servicos, tom de voz, publico e limites da IA para este tenant."
              />
              <span className="text-xs text-white/50">
                Sem esse contexto, a IA conversacional permanece indisponivel no /app.
              </span>
            </label>

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
