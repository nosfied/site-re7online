"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAdminConsole } from "@/components/admin/AdminConsoleProvider";
import {
  enterPlatformSupportTenant,
  loadAppSession,
  saveAppSession,
  saveSupportReturnSession,
  type AppSession,
} from "@/lib/appClientApi";
import {
  fetchTenantById,
  normalizeWaIdList,
  TenantConfigResponse,
  updateTenantById,
  updateTenantFeatures,
} from "@/lib/whatsappAdminApi";

type TenantFormState = {
  profile: "business" | "government";
  displayPhoneNumber: string;
  companyLegalName: string;
  companyTradeName: string;
  companyTaxId: string;
  companyStateRegistration: string;
  companyMunicipalRegistration: string;
  companyWebsite: string;
  companyIndustry: string;
  companyAddressStreet: string;
  companyAddressNumber: string;
  companyAddressComplement: string;
  companyAddressDistrict: string;
  companyAddressCity: string;
  companyAddressState: string;
  companyAddressZip: string;
  companyAddressCountry: string;
  legalRepresentativeName: string;
  legalRepresentativeCpf: string;
  legalRepresentativeEmail: string;
  legalRepresentativePhone: string;
  billingContactName: string;
  billingContactEmail: string;
  billingContactPhone: string;
  billingEmail: string;
  financialContactName: string;
  financialContactEmail: string;
  financialContactPhone: string;
  technicalContactName: string;
  technicalContactEmail: string;
  technicalContactPhone: string;
  contractPlanName: string;
  contractStartDate: string;
  contractEndDate: string;
  contractBillingDay: string;
  contractPaymentMethod: string;
  contractNotes: string;
  maxActiveAppUsers: string;
  allowlistInput: string;
  quotaMonthlyConversations: string;
  quotaWarnAtPct: string;
  quotaExcludeWaIdsInput: string;
  quotaBlockedReplyText: string;
};

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function SaveNotice({ error, toast }: { error: string | null; toast: string | null }) {
  if (!error && !toast) return null;
  return (
    <p
      className={`rounded-md border p-3 text-sm ${
        error
          ? "border-red-400/30 bg-red-900/80 text-red-100"
          : "border-emerald-400/30 bg-emerald-900/80 text-emerald-100"
      }`}
    >
      {error || toast}
    </p>
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
  const [supportAccessSnapshot, setSupportAccessSnapshot] = useState<TenantConfigResponse["supportAccess"] | null>(null);
  const [featureEntitlements, setFeatureEntitlements] = useState<
    NonNullable<TenantConfigResponse["featureEntitlements"]>
  >([]);
  const [supportAppSession, setSupportAppSession] = useState<AppSession | null>(null);
  const [enteringSupport, setEnteringSupport] = useState(false);
  const [savingFeatureKey, setSavingFeatureKey] = useState<string | null>(null);
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
  const chatbotHref = clientSnapshot?.clientKey
    ? `/admin/tenants/${encodeURIComponent(tenantId)}/chatbot?clientKey=${encodeURIComponent(clientSnapshot.clientKey)}`
    : `/admin/tenants/${encodeURIComponent(tenantId)}/chatbot`;

  useEffect(() => {
    setSupportAppSession(loadAppSession());
  }, []);

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
        setSupportAccessSnapshot(response.supportAccess ?? null);
        setFeatureEntitlements(response.featureEntitlements ?? []);
        setForm({
          profile: response.client?.profile === "government" ? "government" : "business",
          displayPhoneNumber: tenant.displayPhoneNumber ?? "",
          companyLegalName: tenant.companyLegalName ?? "",
          companyTradeName: tenant.companyTradeName ?? "",
          companyTaxId: tenant.companyTaxId ?? "",
          companyStateRegistration: tenant.companyStateRegistration ?? "",
          companyMunicipalRegistration: tenant.companyMunicipalRegistration ?? "",
          companyWebsite: tenant.companyWebsite ?? "",
          companyIndustry: tenant.companyIndustry ?? "",
          companyAddressStreet: tenant.companyAddressStreet ?? "",
          companyAddressNumber: tenant.companyAddressNumber ?? "",
          companyAddressComplement: tenant.companyAddressComplement ?? "",
          companyAddressDistrict: tenant.companyAddressDistrict ?? "",
          companyAddressCity: tenant.companyAddressCity ?? "",
          companyAddressState: tenant.companyAddressState ?? "",
          companyAddressZip: tenant.companyAddressZip ?? "",
          companyAddressCountry: tenant.companyAddressCountry ?? "Brasil",
          legalRepresentativeName: tenant.legalRepresentativeName ?? "",
          legalRepresentativeCpf: tenant.legalRepresentativeCpf ?? "",
          legalRepresentativeEmail: tenant.legalRepresentativeEmail ?? "",
          legalRepresentativePhone: tenant.legalRepresentativePhone ?? "",
          billingContactName: tenant.billingContactName ?? "",
          billingContactEmail: tenant.billingContactEmail ?? "",
          billingContactPhone: tenant.billingContactPhone ?? "",
          billingEmail: tenant.billingEmail ?? "",
          financialContactName: tenant.financialContactName ?? "",
          financialContactEmail: tenant.financialContactEmail ?? "",
          financialContactPhone: tenant.financialContactPhone ?? "",
          technicalContactName: tenant.technicalContactName ?? "",
          technicalContactEmail: tenant.technicalContactEmail ?? "",
          technicalContactPhone: tenant.technicalContactPhone ?? "",
          contractPlanName: tenant.contractPlanName ?? "",
          contractStartDate: tenant.contractStartDate ?? "",
          contractEndDate: tenant.contractEndDate ?? "",
          contractBillingDay:
            typeof tenant.contractBillingDay === "number"
              ? String(tenant.contractBillingDay)
              : "",
          contractPaymentMethod: tenant.contractPaymentMethod ?? "",
          contractNotes: tenant.contractNotes ?? "",
          maxActiveAppUsers:
            typeof tenant.maxActiveAppUsers === "number"
              ? String(tenant.maxActiveAppUsers)
              : "5",
          allowlistInput: (tenant.allowlist ?? []).join("\n"),
          quotaMonthlyConversations:
            typeof tenant.quotaMonthlyConversations === "number"
              ? String(tenant.quotaMonthlyConversations)
              : "",
          quotaWarnAtPct:
            typeof tenant.quotaWarnAtPct === "number" ? String(tenant.quotaWarnAtPct) : "",
          quotaExcludeWaIdsInput: (tenant.quotaExcludeWaIds ?? []).join("\n"),
          quotaBlockedReplyText: tenant.quotaBlockedReplyText ?? "",
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

  const updateFormField = (field: keyof TenantFormState, value: string) => {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleEnterSupportMode = async () => {
    if (!supportAppSession || !tenantId) return;
    setEnteringSupport(true);
    setError(null);
    try {
      saveSupportReturnSession(supportAppSession);
      const supportSession = await enterPlatformSupportTenant(supportAppSession, tenantId);
      saveAppSession(supportSession);
      window.location.href = "/app/inbox";
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      setError(typed.message || "Nao foi possivel acessar o tenant em modo suporte.");
    } finally {
      setEnteringSupport(false);
    }
  };

  const handleToggleFeature = async (key: string, enabled: boolean) => {
    if (savingFeatureKey) return;
    setSavingFeatureKey(key);
    setError(null);
    setToast(null);
    try {
      const result = await updateTenantFeatures(connection, tenantId, { [key]: enabled });
      setClientSnapshot(result.client);
      setFeatureEntitlements(result.featureEntitlements);
      setDebugInfo({ fieldsChanged: result.fieldsChanged });
      setToast(enabled ? "Funcionalidade ativada." : "Funcionalidade desativada.");
      window.setTimeout(() => setToast(null), 5000);
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      setError(typed.message || "Falha ao atualizar funcionalidade.");
    } finally {
      setSavingFeatureKey(null);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;

    const payload: Record<string, unknown> = {
      ...(tenantSnapshot ?? {}),
      profile: form.profile,
      displayPhoneNumber: form.displayPhoneNumber.trim() || undefined,
      companyLegalName: optionalText(form.companyLegalName),
      companyTradeName: optionalText(form.companyTradeName),
      companyTaxId: optionalText(form.companyTaxId),
      companyStateRegistration: optionalText(form.companyStateRegistration),
      companyMunicipalRegistration: optionalText(form.companyMunicipalRegistration),
      companyWebsite: optionalText(form.companyWebsite),
      companyIndustry: optionalText(form.companyIndustry),
      companyAddressStreet: optionalText(form.companyAddressStreet),
      companyAddressNumber: optionalText(form.companyAddressNumber),
      companyAddressComplement: optionalText(form.companyAddressComplement),
      companyAddressDistrict: optionalText(form.companyAddressDistrict),
      companyAddressCity: optionalText(form.companyAddressCity),
      companyAddressState: optionalText(form.companyAddressState),
      companyAddressZip: optionalText(form.companyAddressZip),
      companyAddressCountry: optionalText(form.companyAddressCountry),
      legalRepresentativeName: optionalText(form.legalRepresentativeName),
      legalRepresentativeCpf: optionalText(form.legalRepresentativeCpf),
      legalRepresentativeEmail: optionalText(form.legalRepresentativeEmail),
      legalRepresentativePhone: optionalText(form.legalRepresentativePhone),
      billingContactName: optionalText(form.billingContactName),
      billingContactEmail: optionalText(form.billingContactEmail),
      billingContactPhone: optionalText(form.billingContactPhone),
      billingEmail: optionalText(form.billingEmail),
      financialContactName: optionalText(form.financialContactName),
      financialContactEmail: optionalText(form.financialContactEmail),
      financialContactPhone: optionalText(form.financialContactPhone),
      technicalContactName: optionalText(form.technicalContactName),
      technicalContactEmail: optionalText(form.technicalContactEmail),
      technicalContactPhone: optionalText(form.technicalContactPhone),
      contractPlanName: optionalText(form.contractPlanName),
      contractStartDate: optionalText(form.contractStartDate),
      contractEndDate: optionalText(form.contractEndDate),
      contractPaymentMethod: optionalText(form.contractPaymentMethod),
      contractNotes: optionalText(form.contractNotes),
      allowlist: normalizeWaIdList(form.allowlistInput),
      quotaExcludeWaIds: normalizeWaIdList(form.quotaExcludeWaIdsInput),
    };

    const maxActiveAppUsers = Number(form.maxActiveAppUsers);
    if (
      !Number.isInteger(maxActiveAppUsers) ||
      maxActiveAppUsers < 0
    ) {
      setError("Limite de usuarios ativos deve ser um numero inteiro >= 0.");
      return;
    }
    payload.maxActiveAppUsers = maxActiveAppUsers;

    if (form.contractBillingDay.trim()) {
      const value = Number(form.contractBillingDay);
      if (!Number.isInteger(value) || value < 1 || value > 31) {
        setError("Dia de vencimento deve ser um numero inteiro entre 1 e 31.");
        return;
      }
      payload.contractBillingDay = value;
    }

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
      setClientSnapshot((prev) => (prev ? { ...prev, profile: form.profile } : prev));
      setForm((prev) =>
        prev
          ? {
              ...prev,
              maxActiveAppUsers:
                typeof result.tenant.maxActiveAppUsers === "number"
                  ? String(result.tenant.maxActiveAppUsers)
                  : prev.maxActiveAppUsers,
              contractBillingDay:
                typeof result.tenant.contractBillingDay === "number"
                  ? String(result.tenant.contractBillingDay)
                  : prev.contractBillingDay,
            }
          : prev
      );
      setDebugInfo({ fieldsChanged: result.fieldsChanged, backupPath: result.backupPath });
      setToast("Tenant salvo com sucesso.");
      window.setTimeout(() => setToast(null), 5000);
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

  const featureCategories: Array<{
    key: NonNullable<TenantConfigResponse["featureEntitlements"]>[number]["category"];
    label: string;
  }> = [
    { key: "attendance", label: "Atendimento" },
    { key: "communication", label: "Comunicacao" },
    { key: "automation", label: "Automacao" },
    { key: "management", label: "Gestao" },
    { key: "security", label: "Seguranca" },
  ];

  return (
    <div className="px-4 py-8 text-white md:px-8">
      {error || toast ? (
        <div className="fixed left-1/2 top-4 z-50 w-[min(92vw,720px)] -translate-x-1/2 shadow-2xl">
          <SaveNotice error={error} toast={toast} />
        </div>
      ) : null}
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Tenant</h1>
            <p className="text-sm font-mono text-white/70">{tenantId}</p>
          </div>
          <div className="flex items-center gap-2">
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
        <SaveNotice error={error} toast={toast} />

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
                <p className="text-xs uppercase tracking-wide text-white/50">Perfil do portal</p>
                <p className="mt-2 text-sm font-medium">
                  {clientSnapshot?.profile === "government" ? "Governo / edital" : "Empresa privada"}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/50">Idioma padrao</p>
                <p className="mt-2 text-sm font-medium">{tenantSnapshot?.defaultLanguage ?? "-"}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/50">Empresa</p>
                <p className="mt-2 text-sm font-medium">
                  {tenantSnapshot?.companyLegalName || tenantSnapshot?.companyTradeName || "-"}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/50">Usuarios ativos contratados</p>
                <p className="mt-2 text-sm font-medium">{tenantSnapshot?.maxActiveAppUsers ?? 5}</p>
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
                href={chatbotHref}
                className="rounded-lg border border-white/10 bg-re7-navy/40 px-4 py-3 text-sm hover:border-re7-sky/40 hover:bg-white/5"
              >
                Chatbot e automacao
              </Link>
              <Link
                href={`/admin/tenants/${encodeURIComponent(tenantId)}/channels`}
                className="rounded-lg border border-white/10 bg-re7-navy/40 px-4 py-3 text-sm hover:border-re7-sky/40 hover:bg-white/5"
              >
                Canais conectados
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
              <div className="rounded-lg border border-amber-300/20 bg-amber-950/20 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-amber-100">Acesso de suporte</p>
                    <p className="mt-1 text-xs text-amber-100/70">
                      Entrada temporaria auditada. A autorizacao deve ser feita por ADMIN no proprio tenant.
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      supportAccessSnapshot?.active
                        ? "bg-emerald-500/15 text-emerald-100"
                        : "bg-white/10 text-white/70"
                    }`}
                  >
                    {supportAccessSnapshot?.active ? "Autorizado" : "Desativado"}
                  </span>
                </div>
                {supportAccessSnapshot?.active ? (
                  <dl className="mt-3 grid gap-2 text-xs text-amber-50/80">
                    <div>
                      <dt className="uppercase tracking-wide text-amber-100/50">Expira em</dt>
                      <dd>{new Date(supportAccessSnapshot.expiresAt).toLocaleString("pt-BR")}</dd>
                    </div>
                    {supportAccessSnapshot.reason ? (
                      <div>
                        <dt className="uppercase tracking-wide text-amber-100/50">Motivo</dt>
                        <dd>{supportAccessSnapshot.reason}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : (
                  <p className="mt-3 text-xs text-white/60">
                    Sem autorizacao ativa para suporte da plataforma neste momento.
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleEnterSupportMode}
                  disabled={!supportAccessSnapshot?.active || !supportAppSession || enteringSupport}
                  className="mt-3 w-full rounded-md border border-amber-200/30 bg-amber-400/15 px-3 py-2 text-sm font-semibold text-amber-50 transition hover:bg-amber-400/25 disabled:cursor-not-allowed disabled:opacity-50"
                  title={
                    supportAppSession
                      ? "Acessar tenant em modo suporte"
                      : "Entre no Converta com sua conta de suporte antes de usar esta acao"
                  }
                >
                  {enteringSupport ? "Entrando..." : "Acessar em modo suporte"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
                Funcionalidades
              </h2>
              <p className="mt-1 text-sm text-white/65">
                Controle contratual por tenant. Configuracoes operacionais continuam nas telas
                proprias.
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-re7-navy/50 px-3 py-1 text-xs text-white/65">
              Fonte: Client.features
            </span>
          </div>

          <div className="mt-4 grid gap-4">
            {featureCategories.map((category) => {
              const items = featureEntitlements.filter((item) => item.category === category.key);
              if (items.length === 0) return null;
              return (
                <div key={category.key} className="rounded-lg border border-white/10 bg-re7-navy/35 p-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">
                    {category.label}
                  </h3>
                  <div className="mt-3 grid gap-2">
                    {items.map((item) => {
                      const unavailable = item.status === "unavailable";
                      const savingThis = savingFeatureKey === item.key;
                      return (
                        <div
                          key={item.key}
                          className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 lg:grid-cols-[minmax(0,1fr)_auto]"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-white">{item.label}</p>
                              <span
                                className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                  unavailable
                                    ? "bg-amber-500/15 text-amber-100"
                                    : item.enabled
                                      ? "bg-emerald-500/15 text-emerald-100"
                                      : "bg-white/10 text-white/65"
                                }`}
                              >
                                {unavailable ? "Indisponivel" : item.enabled ? "Ativo" : "Desativado"}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-white/65">{item.description}</p>
                            <details className="mt-2 text-xs text-white/50">
                              <summary className="cursor-pointer text-white/60">Detalhes tecnicos</summary>
                              <dl className="mt-2 grid gap-1">
                                <div>
                                  <dt className="font-semibold text-white/55">Chave</dt>
                                  <dd className="font-mono">{item.key}</dd>
                                </div>
                                <div>
                                  <dt className="font-semibold text-white/55">Capacidade tecnica</dt>
                                  <dd>{item.technicalCapabilitySource}</dd>
                                </div>
                                <div>
                                  <dt className="font-semibold text-white/55">Dependencia operacional</dt>
                                  <dd>{item.runtimeDependency}</dd>
                                </div>
                                <div>
                                  <dt className="font-semibold text-white/55">Guards</dt>
                                  <dd>
                                    Frontend: {item.frontendVisibilityGuard}. Backend: {item.backendGuard}.
                                  </dd>
                                </div>
                              </dl>
                            </details>
                            {item.unavailableReasons.length > 0 ? (
                              <p className="mt-2 rounded-md border border-amber-400/20 bg-amber-950/30 p-2 text-xs text-amber-100">
                                {item.unavailableReasons.join("; ")}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex items-start justify-end">
                            <button
                              type="button"
                              onClick={() => handleToggleFeature(item.key, !item.enabled)}
                              disabled={savingThis || (unavailable && !item.enabled)}
                              className={`min-w-28 rounded-md border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                item.enabled
                                  ? "border-red-300/30 bg-red-900/20 text-red-100 hover:bg-red-900/30"
                                  : "border-emerald-300/30 bg-emerald-900/20 text-emerald-100 hover:bg-emerald-900/30"
                              }`}
                            >
                              {savingThis ? "Salvando..." : item.enabled ? "Desativar" : "Ativar"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
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
                <p className="mt-2 text-sm">
                  {tenantSnapshot?.disableAiFallback ? "Bloqueada" : "Liberada"}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/50">Contexto da IA</p>
                <p className="mt-2 text-sm">{tenantSnapshot?.aiBusinessContext?.trim() ? "Configurado" : "Ausente"}</p>
                <Link
                  href={chatbotHref}
                  className="mt-2 inline-flex text-xs font-semibold text-re7-sky hover:text-white"
                >
                  Ajustar em Chatbot
                </Link>
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

            <section className="grid gap-3 rounded-lg border border-white/10 bg-re7-navy/30 p-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
                  Limites contratados
                </h2>
                <p className="mt-1 text-xs text-white/50">
                  Controle comercial aplicado na criacao e ativacao de usuarios do /app.
                </p>
              </div>
              <label className="grid gap-1 text-sm md:max-w-xs">
                <span className="text-white/70">Usuarios ativos contratados</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={form.maxActiveAppUsers}
                  onChange={(event) => updateFormField("maxActiveAppUsers", event.target.value)}
                />
                <span className="text-xs text-white/50">
                  Padrao: 5. Use 0 para bloquear novos usuarios ativos.
                </span>
              </label>
            </section>

            <section className="grid gap-3 rounded-lg border border-white/10 bg-re7-navy/30 p-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
                  Perfil do portal
                </h2>
                <p className="mt-1 text-xs text-white/50">
                  Define labels e organizacao do menu no /app sem bloquear rotas ou modulos.
                </p>
              </div>
              <label className="grid gap-1 text-sm md:max-w-sm">
                <span className="text-white/70">Tipo de experiencia</span>
                <select
                  className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={form.profile}
                  onChange={(event) =>
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            profile:
                              event.target.value === "government" ? "government" : "business",
                          }
                        : prev
                    )
                  }
                >
                  <option value="business">Empresa privada</option>
                  <option value="government">Governo / edital</option>
                </select>
              </label>
            </section>

            <section className="grid gap-3 rounded-lg border border-white/10 bg-re7-navy/30 p-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
                  Dados da empresa
                </h2>
                <p className="mt-1 text-xs text-white/50">
                  Dados usados para contrato, proposta, faturamento e suporte interno.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Razao social</span>
                  <input
                    className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                    value={form.companyLegalName}
                    onChange={(event) => updateFormField("companyLegalName", event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Nome fantasia</span>
                  <input
                    className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                    value={form.companyTradeName}
                    onChange={(event) => updateFormField("companyTradeName", event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">CNPJ/CPF</span>
                  <input
                    className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                    value={form.companyTaxId}
                    onChange={(event) => updateFormField("companyTaxId", event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Ramo de atividade</span>
                  <input
                    className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                    value={form.companyIndustry}
                    onChange={(event) => updateFormField("companyIndustry", event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Inscricao estadual</span>
                  <input
                    className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                    value={form.companyStateRegistration}
                    onChange={(event) => updateFormField("companyStateRegistration", event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Inscricao municipal</span>
                  <input
                    className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                    value={form.companyMunicipalRegistration}
                    onChange={(event) => updateFormField("companyMunicipalRegistration", event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm md:col-span-2">
                  <span className="text-white/70">Site</span>
                  <input
                    className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                    value={form.companyWebsite}
                    onChange={(event) => updateFormField("companyWebsite", event.target.value)}
                  />
                </label>
              </div>
            </section>

            <section className="grid gap-3 rounded-lg border border-white/10 bg-re7-navy/30 p-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
                Endereco
              </h2>
              <div className="grid gap-3 md:grid-cols-4">
                <label className="grid gap-1 text-sm md:col-span-3">
                  <span className="text-white/70">Logradouro</span>
                  <input
                    className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                    value={form.companyAddressStreet}
                    onChange={(event) => updateFormField("companyAddressStreet", event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Numero</span>
                  <input
                    className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                    value={form.companyAddressNumber}
                    onChange={(event) => updateFormField("companyAddressNumber", event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Complemento</span>
                  <input
                    className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                    value={form.companyAddressComplement}
                    onChange={(event) => updateFormField("companyAddressComplement", event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Bairro</span>
                  <input
                    className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                    value={form.companyAddressDistrict}
                    onChange={(event) => updateFormField("companyAddressDistrict", event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Cidade</span>
                  <input
                    className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                    value={form.companyAddressCity}
                    onChange={(event) => updateFormField("companyAddressCity", event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">UF</span>
                  <input
                    className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                    value={form.companyAddressState}
                    onChange={(event) => updateFormField("companyAddressState", event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">CEP</span>
                  <input
                    className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                    value={form.companyAddressZip}
                    onChange={(event) => updateFormField("companyAddressZip", event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Pais</span>
                  <input
                    className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                    value={form.companyAddressCountry}
                    onChange={(event) => updateFormField("companyAddressCountry", event.target.value)}
                  />
                </label>
              </div>
            </section>

            <section className="grid gap-3 rounded-lg border border-white/10 bg-re7-navy/30 p-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
                Contatos e contrato
              </h2>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Representante legal</span>
                  <input className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky" value={form.legalRepresentativeName} onChange={(event) => updateFormField("legalRepresentativeName", event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">CPF representante</span>
                  <input className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky" value={form.legalRepresentativeCpf} onChange={(event) => updateFormField("legalRepresentativeCpf", event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Email representante</span>
                  <input className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky" value={form.legalRepresentativeEmail} onChange={(event) => updateFormField("legalRepresentativeEmail", event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Telefone representante</span>
                  <input className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky" value={form.legalRepresentativePhone} onChange={(event) => updateFormField("legalRepresentativePhone", event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Contato de cobranca</span>
                  <input className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky" value={form.billingContactName} onChange={(event) => updateFormField("billingContactName", event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Email cobranca</span>
                  <input className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky" value={form.billingContactEmail} onChange={(event) => updateFormField("billingContactEmail", event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Telefone cobranca</span>
                  <input className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky" value={form.billingContactPhone} onChange={(event) => updateFormField("billingContactPhone", event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Email financeiro/NF</span>
                  <input className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky" value={form.billingEmail} onChange={(event) => updateFormField("billingEmail", event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Contato financeiro</span>
                  <input className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky" value={form.financialContactName} onChange={(event) => updateFormField("financialContactName", event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Email financeiro</span>
                  <input className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky" value={form.financialContactEmail} onChange={(event) => updateFormField("financialContactEmail", event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Telefone financeiro</span>
                  <input className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky" value={form.financialContactPhone} onChange={(event) => updateFormField("financialContactPhone", event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Contato tecnico</span>
                  <input className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky" value={form.technicalContactName} onChange={(event) => updateFormField("technicalContactName", event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Email tecnico</span>
                  <input className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky" value={form.technicalContactEmail} onChange={(event) => updateFormField("technicalContactEmail", event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Telefone tecnico</span>
                  <input className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky" value={form.technicalContactPhone} onChange={(event) => updateFormField("technicalContactPhone", event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Plano contratado</span>
                  <input className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky" value={form.contractPlanName} onChange={(event) => updateFormField("contractPlanName", event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Inicio do contrato</span>
                  <input type="date" className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky" value={form.contractStartDate} onChange={(event) => updateFormField("contractStartDate", event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Fim/renovacao</span>
                  <input type="date" className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky" value={form.contractEndDate} onChange={(event) => updateFormField("contractEndDate", event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Dia de vencimento</span>
                  <input type="number" min={1} max={31} className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky" value={form.contractBillingDay} onChange={(event) => updateFormField("contractBillingDay", event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-white/70">Forma de pagamento</span>
                  <input className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky" value={form.contractPaymentMethod} onChange={(event) => updateFormField("contractPaymentMethod", event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm md:col-span-3">
                  <span className="text-white/70">Observacoes contratuais</span>
                  <textarea className="min-h-20 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky" value={form.contractNotes} onChange={(event) => updateFormField("contractNotes", event.target.value)} />
                </label>
              </div>
            </section>

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
            <SaveNotice error={error} toast={toast} />
          </form>
        ) : null}
      </div>
    </div>
  );
}
