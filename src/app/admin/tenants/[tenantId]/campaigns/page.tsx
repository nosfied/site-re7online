"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import AdminConfigPanel from "@/components/admin/AdminConfigPanel";
import {
  AdminConnection,
  CampaignItem,
  cancelCampaign,
  createCampaign,
  fetchTenantsSummary,
  formatDateTime,
  getCampaign,
  listCampaigns,
  loadAdminConnection,
  normalizeWaIdList,
  saveAdminConnection,
  testAdminConnection,
} from "@/lib/whatsappAdminApi";

type CampaignFormState = {
  name: string;
  templateName: string;
  templateParamsInput: string;
  recipientsInput: string;
};

const EMPTY_FORM: CampaignFormState = {
  name: "",
  templateName: "",
  templateParamsInput: "",
  recipientsInput: "",
};

function normalizeTemplateParams(input: string) {
  return input
    .split(/\n+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export default function TenantCampaignsPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = useMemo(() => {
    const rawTenantId = params?.tenantId;
    if (Array.isArray(rawTenantId)) {
      return rawTenantId[0] ? decodeURIComponent(rawTenantId[0]) : "";
    }
    return rawTenantId ? decodeURIComponent(rawTenantId) : "";
  }, [params]);

  const [connection, setConnection] = useState<AdminConnection>({
    baseUrl: "",
    adminToken: "",
    rememberToken: false,
  });
  const [clientKey, setClientKey] = useState(tenantId);
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignItem | null>(null);
  const [form, setForm] = useState<CampaignFormState>(EMPTY_FORM);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setConnection(loadAdminConnection());
  }, []);

  useEffect(() => {
    if (!connection.baseUrl && !connection.adminToken) return;
    saveAdminConnection(connection);
  }, [connection]);

  const refreshCampaigns = useCallback(
    async (resolvedClientKey: string, keepSelectedId?: string | null) => {
      const response = await listCampaigns(connection, resolvedClientKey, { limit: 100 });
      setCampaigns(response.items);
      const nextSelectedId =
        keepSelectedId && response.items.some((item) => item.id === keepSelectedId)
          ? keepSelectedId
          : response.items[0]?.id ?? null;
      setSelectedCampaignId(nextSelectedId);
      return response.items;
    },
    [connection]
  );

  useEffect(() => {
    if (!tenantId) return;
    if (!connection.baseUrl || !connection.adminToken) return;

    let cancelled = false;
    setLoadingList(true);
    setError(null);

    (async () => {
      try {
        const summary = await fetchTenantsSummary(connection, "24h");
        const resolvedClientKey =
          summary.find((item) => item.tenantId === tenantId)?.clientKey ?? tenantId;
        if (cancelled) return;
        setClientKey(resolvedClientKey);
        await refreshCampaigns(resolvedClientKey);
      } catch (err) {
        if (cancelled) return;
        const typed = err as { status?: number; message?: string };
        if (typed.status === 403) {
          setError("Sem permissao para acessar campanhas.");
          return;
        }
        if (typed.status === 404) {
          setError("Tenant nao encontrado para campanhas.");
          return;
        }
        setError(typed.message || "Falha ao carregar campanhas.");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connection, refreshCampaigns, tenantId]);

  useEffect(() => {
    if (!selectedCampaignId) {
      setSelectedCampaign(null);
      setDetailError(null);
      return;
    }
    if (!connection.baseUrl || !connection.adminToken) return;

    let cancelled = false;
    setLoadingDetail(true);
    setDetailError(null);

    getCampaign(connection, clientKey, selectedCampaignId)
      .then((response) => {
        if (cancelled) return;
        setSelectedCampaign(response.campaign);
        setCampaigns((prev) =>
          prev.map((item) => (item.id === response.campaign.id ? response.campaign : item))
        );
      })
      .catch((err: { message?: string }) => {
        if (cancelled) return;
        setDetailError(err.message || "Falha ao carregar detalhe da campanha.");
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clientKey, connection, selectedCampaignId]);

  const shouldPoll = useMemo(() => {
    if (selectedCampaign?.status === "sending") return true;
    return campaigns.some((item) => item.status === "sending");
  }, [campaigns, selectedCampaign?.status]);

  useEffect(() => {
    if (!shouldPoll || !connection.baseUrl || !connection.adminToken || !clientKey) return;

    const interval = window.setInterval(async () => {
      try {
        const items = await refreshCampaigns(clientKey, selectedCampaignId);
        if (selectedCampaignId && items.some((item) => item.id === selectedCampaignId)) {
          const detail = await getCampaign(connection, clientKey, selectedCampaignId);
          setSelectedCampaign(detail.campaign);
          setCampaigns((prev) =>
            prev.map((item) => (item.id === detail.campaign.id ? detail.campaign : item))
          );
        }
      } catch {
        // noop: polling opportunistic
      }
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [clientKey, connection, refreshCampaigns, selectedCampaignId, shouldPoll]);

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setError(null);
    try {
      await testAdminConnection(connection);
    } catch (err) {
      const typed = err as { message?: string };
      setError(typed.message || "Falha ao testar conexao.");
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();
    const templateName = form.templateName.trim();
    const recipients = normalizeWaIdList(form.recipientsInput);
    const templateParams = normalizeTemplateParams(form.templateParamsInput);

    if (!name) {
      setFormError("Informe o nome da campanha.");
      return;
    }
    if (!templateName) {
      setFormError("Informe o template.");
      return;
    }
    if (recipients.length === 0) {
      setFormError("Informe ao menos um destinatario valido.");
      return;
    }

    setCreating(true);
    setFormError(null);
    setError(null);
    try {
      const created = await createCampaign(connection, clientKey, {
        name,
        templateName,
        recipients,
        ...(templateParams.length > 0 ? { templateParams } : {}),
      });
      await refreshCampaigns(clientKey, created.campaignId);
      const detail = await getCampaign(connection, clientKey, created.campaignId);
      setSelectedCampaignId(created.campaignId);
      setSelectedCampaign(detail.campaign);
      setForm(EMPTY_FORM);
      setToast("Campanha criada com sucesso.");
      window.setTimeout(() => setToast(null), 3000);
    } catch (err) {
      const typed = err as { message?: string };
      setFormError(typed.message || "Falha ao criar campanha.");
    } finally {
      setCreating(false);
    }
  };

  const handleCancelCampaign = async () => {
    if (!selectedCampaign) return;
    setCancelling(true);
    setDetailError(null);
    try {
      const response = await cancelCampaign(connection, clientKey, selectedCampaign.id);
      setSelectedCampaign(response.campaign);
      await refreshCampaigns(clientKey, response.campaign.id);
      setToast("Campanha cancelada.");
      window.setTimeout(() => setToast(null), 3000);
    } catch (err) {
      const typed = err as { message?: string };
      setDetailError(typed.message || "Falha ao cancelar campanha.");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <main className="min-h-screen bg-re7-navy px-4 py-8 text-white md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Campanhas</h1>
            <p className="text-sm text-white/70 font-mono">{tenantId}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/tenants/${encodeURIComponent(tenantId)}/inbox`}
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Inbox
            </Link>
            <Link
              href={`/admin/tenants/${encodeURIComponent(tenantId)}`}
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Config tenant
            </Link>
            <Link
              href="/admin/tenants"
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Voltar
            </Link>
          </div>
        </header>

        <AdminConfigPanel
          connection={connection}
          onChange={setConnection}
          onTestConnection={handleTestConnection}
          testingConnection={testingConnection}
        />

        {!tenantId ? <p className="text-sm text-white/70">Carregando tenant...</p> : null}

        {error ? (
          <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}
        {toast ? (
          <p className="rounded-md border border-emerald-400/30 bg-emerald-900/30 p-3 text-sm text-emerald-100">
            {toast}
          </p>
        ) : null}

        <section className="grid gap-4 md:grid-cols-[340px_1fr]">
          <aside className="rounded-xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 px-4 py-3">
              <h2 className="text-sm font-semibold">Criar campanha</h2>
            </div>
            <form className="grid gap-3 p-4" onSubmit={handleSubmit}>
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">Nome</span>
                <input
                  className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="campanha-marco-01"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">Template</span>
                <input
                  className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={form.templateName}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, templateName: event.target.value }))
                  }
                  placeholder="re7_atendente_manual_v1"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">Template params (um por linha)</span>
                <textarea
                  className="min-h-24 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={form.templateParamsInput}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, templateParamsInput: event.target.value }))
                  }
                  placeholder={"Cliente teste\nCampanha marco\nHoje 15h"}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-white/70">Recipients (um waId por linha)</span>
                <textarea
                  className="min-h-32 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={form.recipientsInput}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, recipientsInput: event.target.value }))
                  }
                  placeholder={"558499049614\n558494786787"}
                />
              </label>
              {formError ? (
                <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
                  {formError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={creating}
                className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? "Criando..." : "Criar campanha"}
              </button>
            </form>
          </aside>

          <div className="grid gap-4">
            <section className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <h2 className="text-sm font-semibold">Campanhas</h2>
                <button
                  type="button"
                  onClick={() => refreshCampaigns(clientKey, selectedCampaignId)}
                  className="rounded-md border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
                >
                  Atualizar
                </button>
              </div>
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-white/10 text-left">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Sent</th>
                    <th className="px-3 py-2">Total</th>
                    <th className="px-3 py-2">Template</th>
                    <th className="px-3 py-2">Criada em</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingList ? (
                    <tr>
                      <td className="px-3 py-4 text-white/70" colSpan={6}>
                        Carregando campanhas...
                      </td>
                    </tr>
                  ) : null}
                  {!loadingList && campaigns.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-white/70" colSpan={6}>
                        Nenhuma campanha para este tenant.
                      </td>
                    </tr>
                  ) : null}
                  {campaigns.map((campaign) => {
                    const isSelected = campaign.id === selectedCampaignId;
                    return (
                      <tr
                        key={campaign.id}
                        className={`cursor-pointer border-t border-white/10 ${
                          isSelected ? "bg-re7-sky/10" : "hover:bg-white/5"
                        }`}
                        onClick={() => setSelectedCampaignId(campaign.id)}
                      >
                        <td className="px-3 py-2">{campaign.name}</td>
                        <td className="px-3 py-2">{campaign.status}</td>
                        <td className="px-3 py-2">{campaign.sentCount}</td>
                        <td className="px-3 py-2">{campaign.totalRecipients}</td>
                        <td className="px-3 py-2">{campaign.templateName}</td>
                        <td className="px-3 py-2">{formatDateTime(campaign.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/5">
              <div className="border-b border-white/10 px-4 py-3">
                <h2 className="text-sm font-semibold">Detalhe da campanha</h2>
              </div>
              <div className="grid gap-3 p-4 text-sm">
                {!selectedCampaignId ? (
                  <p className="text-white/70">Selecione uma campanha para ver o detalhe.</p>
                ) : null}
                {selectedCampaignId && loadingDetail ? (
                  <p className="text-white/70">Carregando detalhe...</p>
                ) : null}
                {detailError ? (
                  <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-red-100">
                    {detailError}
                  </p>
                ) : null}
                {selectedCampaign ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-md border border-white/10 bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-wide text-white/60">Status</p>
                        <p className="mt-1 font-semibold">{selectedCampaign.status}</p>
                      </div>
                      <div className="rounded-md border border-white/10 bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-wide text-white/60">Sent</p>
                        <p className="mt-1 font-semibold">{selectedCampaign.sentCount}</p>
                      </div>
                      <div className="rounded-md border border-white/10 bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-wide text-white/60">Blocked</p>
                        <p className="mt-1 font-semibold">{selectedCampaign.blockedCount}</p>
                      </div>
                      <div className="rounded-md border border-white/10 bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-wide text-white/60">Pending</p>
                        <p className="mt-1 font-semibold">{selectedCampaign.progress.pendingCount}</p>
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                      <p>
                        <span className="text-white/70">Nome:</span> {selectedCampaign.name}
                      </p>
                      <p>
                        <span className="text-white/70">Template:</span> {selectedCampaign.templateName}
                      </p>
                      <p>
                        <span className="text-white/70">Total recipients:</span>{" "}
                        {selectedCampaign.totalRecipients}
                      </p>
                      <p>
                        <span className="text-white/70">Atualizada em:</span>{" "}
                        {formatDateTime(selectedCampaign.updatedAt)}
                      </p>
                      <p>
                        <span className="text-white/70">Criada em:</span>{" "}
                        {formatDateTime(selectedCampaign.createdAt)}
                      </p>
                    </div>

                    {selectedCampaign.status === "sending" ? (
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          disabled={cancelling}
                          onClick={handleCancelCampaign}
                          className="rounded-md border border-red-400/40 px-3 py-2 text-sm text-red-100 hover:bg-red-900/30 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {cancelling ? "Cancelando..." : "Cancelar campanha"}
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
