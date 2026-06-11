"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAdminConsole } from "@/components/admin/AdminConsoleProvider";
import {
  Channel,
  getTenantChannelAccounts,
  Provider,
  TenantChannelAccount,
  updateTenantChannelAccounts,
} from "@/lib/whatsappAdminApi";

type ChannelAccountDraft = {
  id: string;
  channel: Channel;
  provider: Provider;
  displayName: string;
  channelAccountId: string;
  externalAccountIds: string;
  externalBusinessId: string;
  metadata: string;
  enabled: boolean;
  automationEnabled: boolean;
  runtimeEnabled: boolean;
  inboundPersistenceEnabled: boolean;
  outboundEnabled: boolean;
  aiEnabled: boolean;
  handoffEnabled: boolean;
  status: NonNullable<TenantChannelAccount["status"]>;
  tokenStatus: NonNullable<TenantChannelAccount["tokenStatus"]>;
  pageAccessToken: string;
};

const CHANNEL_OPTIONS: Channel[] = ["whatsapp", "instagram", "messenger"];
const STATUS_OPTIONS: Array<NonNullable<TenantChannelAccount["status"]>> = [
  "connected",
  "disabled",
  "pending",
  "error",
];
const TOKEN_STATUS_OPTIONS: Array<NonNullable<TenantChannelAccount["tokenStatus"]>> = [
  "not_required",
  "configured",
  "expired",
  "missing",
];

function createDraft(): ChannelAccountDraft {
  return {
    id: `channel_${Date.now()}`,
    channel: "instagram",
    provider: "meta",
    displayName: "",
    channelAccountId: "",
    externalAccountIds: "",
    externalBusinessId: "",
    metadata: "",
    enabled: false,
    automationEnabled: false,
    runtimeEnabled: false,
    inboundPersistenceEnabled: false,
    outboundEnabled: false,
    aiEnabled: false,
    handoffEnabled: false,
    status: "pending",
    tokenStatus: "missing",
    pageAccessToken: "",
  };
}

function toDraft(account: TenantChannelAccount): ChannelAccountDraft {
  return {
    id: account.id,
    channel: account.channel,
    provider: account.provider,
    displayName: account.displayName ?? "",
    channelAccountId: account.channelAccountId,
    externalAccountIds: account.externalAccountIds?.join(", ") ?? "",
    externalBusinessId: account.externalBusinessId ?? "",
    metadata: account.metadata ? JSON.stringify(account.metadata, null, 2) : "",
    enabled: account.enabled,
    automationEnabled: account.automationEnabled === true,
    runtimeEnabled: account.runtimeEnabled === true,
    inboundPersistenceEnabled: account.inboundPersistenceEnabled === true,
    outboundEnabled: account.outboundEnabled === true,
    aiEnabled: account.aiEnabled === true,
    handoffEnabled: account.handoffEnabled === true,
    status: account.status ?? (account.enabled ? "connected" : "disabled"),
    tokenStatus: account.tokenStatus ?? "missing",
    pageAccessToken: "",
  };
}

function parseMetadata(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("metadata precisa ser um objeto JSON.");
  }
  return parsed as Record<string, string>;
}

function parseMetadataPreview(value: string) {
  try {
    return parseMetadata(value) ?? {};
  } catch {
    return {};
  }
}

function toPayload(drafts: ChannelAccountDraft[], tenantId: string) {
  return drafts.map((draft) => ({
    id: draft.id,
    tenantKey: tenantId,
    channel: draft.channel,
    provider: draft.provider,
    displayName: draft.displayName.trim() || undefined,
    channelAccountId: draft.channelAccountId.trim(),
    externalAccountIds: draft.externalAccountIds
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    externalBusinessId: draft.externalBusinessId.trim() || undefined,
    metadata: parseMetadata(draft.metadata),
    enabled: draft.enabled,
    automationEnabled: draft.automationEnabled,
    runtimeEnabled: draft.runtimeEnabled,
    inboundPersistenceEnabled: draft.inboundPersistenceEnabled,
    outboundEnabled: draft.outboundEnabled,
    aiEnabled: draft.aiEnabled,
    handoffEnabled: draft.handoffEnabled,
    status: draft.status,
    tokenStatus: draft.pageAccessToken.trim() ? "configured" : draft.tokenStatus,
    pageAccessToken: draft.pageAccessToken.trim() || undefined,
  }));
}

function getValidationError(drafts: ChannelAccountDraft[]) {
  for (const [index, draft] of drafts.entries()) {
    const label = `Conta ${index + 1}`;
    if (!draft.channel) return `${label}: informe o canal.`;
    if (!draft.provider) return `${label}: informe o provider.`;
    if (!draft.channelAccountId.trim()) return `${label}: informe o channelAccountId.`;
  }
  return null;
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function TechnicalValue({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-white/10 bg-re7-navy/40 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-white/45">{label}</dt>
      <dd className="mt-1 break-all font-mono text-xs text-white/80">{value?.trim() || "-"}</dd>
    </div>
  );
}

export default function TenantChannelsPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = useMemo(() => {
    const rawTenantId = params?.tenantId;
    if (Array.isArray(rawTenantId)) return rawTenantId[0] ? decodeURIComponent(rawTenantId[0]) : "";
    return rawTenantId ? decodeURIComponent(rawTenantId) : "";
  }, [params]);
  const { connection } = useAdminConsole();
  const [drafts, setDrafts] = useState<ChannelAccountDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [backupPath, setBackupPath] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || !connection.baseUrl || !connection.adminToken) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setToast(null);

    getTenantChannelAccounts(connection, tenantId)
      .then((response) => {
        if (cancelled) return;
        setDrafts(response.channelAccounts.map(toDraft));
      })
      .catch((err: { status?: number; message?: string }) => {
        if (cancelled) return;
        if (err.status === 403) {
          setError("Sem permissao para gerenciar canais conectados.");
          return;
        }
        if (err.status === 404) {
          setError("Tenant nao encontrado.");
          return;
        }
        setError(err.message || "Falha ao carregar canais.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [connection, tenantId]);

  const updateDraft = <K extends keyof ChannelAccountDraft>(
    index: number,
    field: K,
    value: ChannelAccountDraft[K]
  ) => {
    setDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, [field]: value } : draft
      )
    );
  };

  const removeDraft = (index: number) => {
    setDrafts((current) => current.filter((_, draftIndex) => draftIndex !== index));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = getValidationError(drafts);
    if (validationError) {
      setError(validationError);
      setToast(null);
      return;
    }

    setSaving(true);
    setError(null);
    setToast(null);
    setBackupPath(null);
    try {
      const response = await updateTenantChannelAccounts(connection, tenantId, toPayload(drafts, tenantId));
      setDrafts(response.channelAccounts.map(toDraft));
      setBackupPath(response.backupPath ?? null);
      setToast("Canais conectados salvos.");
    } catch (err) {
      setError((err as Error).message || "Falha ao salvar canais.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 py-8 text-white md:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Canais conectados</h1>
            <p className="font-mono text-sm text-white/70">{tenantId}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/tenants/${encodeURIComponent(tenantId)}`}
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Voltar ao tenant
            </Link>
            <Link
              href="/admin/tenants"
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Tenants
            </Link>
          </div>
        </header>

        <section className="rounded-xl border border-amber-400/30 bg-amber-900/20 p-4 text-sm text-amber-100">
          <strong>Ativação controlada.</strong> Runtime real exige Ativo e Runtime ligados.
          Envio manual por Messenger exige Outbound e token configurado. Tokens nunca sao exibidos
          de volta no console.
        </section>

        <section className="rounded-xl border border-sky-400/25 bg-sky-950/30 p-4 text-sm text-sky-100">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p>
              Este console interno continua sendo a fonte tecnica para auditoria e flags de canal.
              A conexao OAuth do Instagram Business deve ser feita pela tela simplificada do app.
            </p>
            <Link
              href="/app/settings/channels/instagram"
              className="inline-flex shrink-0 items-center justify-center rounded-md border border-sky-300/40 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-400/10"
            >
              Abrir onboarding Instagram
            </Link>
          </div>
        </section>

        {error ? (
          <p className="rounded-md border border-red-400/30 bg-red-900/70 p-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}
        {toast ? (
          <p className="rounded-md border border-emerald-400/30 bg-emerald-900/70 p-3 text-sm text-emerald-100">
            {toast}
            {backupPath ? <span className="ml-2 font-mono text-xs text-emerald-100/70">{backupPath}</span> : null}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-white/70">
              {loading ? "Carregando..." : `${drafts.length} conta(s) configurada(s).`}
            </p>
            <button
              type="button"
              onClick={() => setDrafts((current) => [...current, createDraft()])}
              className="rounded-md border border-re7-sky/40 bg-re7-sky/20 px-3 py-2 text-sm text-re7-sky hover:bg-re7-sky/30"
            >
              Adicionar conta
            </button>
          </div>

          {drafts.length === 0 && !loading ? (
            <section className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
              Nenhum canal conectado foi cadastrado para este tenant.
            </section>
          ) : null}

          {drafts.map((draft, index) => {
            const metadata = parseMetadataPreview(draft.metadata);
            const source = metadata.source;
            return (
            <section key={draft.id || index} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
                    Conta {index + 1}
                  </h2>
                  <p className="mt-1 font-mono text-xs text-white/50">{draft.id}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeDraft(index)}
                  className="rounded-md border border-red-400/30 px-3 py-2 text-sm text-red-100 hover:bg-red-900/30"
                >
                  Remover
                </button>
              </div>

              <dl className="mb-4 grid gap-2 md:grid-cols-3">
                <TechnicalValue label="channelAccountId" value={draft.channelAccountId} />
                <TechnicalValue label="externalAccountIds" value={draft.externalAccountIds} />
                <TechnicalValue label="graphAccountId" value={metadata.graphAccountId} />
                <TechnicalValue label="webhookAccountId" value={metadata.webhookAccountId} />
                <TechnicalValue label="facebookPageId" value={metadata.facebookPageId} />
                <TechnicalValue label="username" value={metadata.username} />
                <TechnicalValue label="tokenStatus" value={draft.tokenStatus} />
                <TechnicalValue label="source" value={source} />
              </dl>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-white/70">Canal</span>
                  <select
                    value={draft.channel}
                    onChange={(event) => updateDraft(index, "channel", event.target.value as Channel)}
                    className="rounded-md border border-white/10 bg-re7-navy px-3 py-2 text-white"
                  >
                    {CHANNEL_OPTIONS.map((channel) => (
                      <option key={channel} value={channel}>
                        {formatLabel(channel)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-white/70">Provider</span>
                  <select
                    value={draft.provider}
                    onChange={(event) => updateDraft(index, "provider", event.target.value as Provider)}
                    className="rounded-md border border-white/10 bg-re7-navy px-3 py-2 text-white"
                  >
                    <option value="meta">meta</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-white/70">Nome exibido</span>
                  <input
                    value={draft.displayName}
                    onChange={(event) => updateDraft(index, "displayName", event.target.value)}
                    className="rounded-md border border-white/10 bg-re7-navy px-3 py-2 text-white"
                    placeholder="Instagram principal"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-white/70">channelAccountId</span>
                  <input
                    value={draft.channelAccountId}
                    onChange={(event) => updateDraft(index, "channelAccountId", event.target.value)}
                    className="rounded-md border border-white/10 bg-re7-navy px-3 py-2 font-mono text-white"
                    placeholder="phone/page/ig account id"
                    required
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-white/70">externalBusinessId</span>
                  <input
                    value={draft.externalBusinessId}
                    onChange={(event) => updateDraft(index, "externalBusinessId", event.target.value)}
                    className="rounded-md border border-white/10 bg-re7-navy px-3 py-2 font-mono text-white"
                    placeholder="business id opcional"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm md:col-span-2">
                  <span className="text-white/70">Aliases / externalAccountIds</span>
                  <input
                    value={draft.externalAccountIds}
                    onChange={(event) => updateDraft(index, "externalAccountIds", event.target.value)}
                    className="rounded-md border border-white/10 bg-re7-navy px-3 py-2 font-mono text-white"
                    placeholder="id alternativo recebido no webhook, separado por virgula"
                  />
                  <span className="text-xs text-white/50">
                    Usado quando a Meta envia um ID de webhook diferente do ID Graph principal.
                  </span>
                </label>

                <label className="flex flex-col gap-1 text-sm md:col-span-2">
                  <span className="text-white/70">Metadata JSON</span>
                  <textarea
                    value={draft.metadata}
                    onChange={(event) => updateDraft(index, "metadata", event.target.value)}
                    className="min-h-24 rounded-md border border-white/10 bg-re7-navy px-3 py-2 font-mono text-white"
                    placeholder='{"graphAccountId":"...","webhookAccountId":"..."}'
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-white/70">Status</span>
                  <select
                    value={draft.status}
                    onChange={(event) =>
                      updateDraft(index, "status", event.target.value as ChannelAccountDraft["status"])
                    }
                    className="rounded-md border border-white/10 bg-re7-navy px-3 py-2 text-white"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {formatLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-white/70">Token status</span>
                  <select
                    value={draft.tokenStatus}
                    onChange={(event) =>
                      updateDraft(index, "tokenStatus", event.target.value as ChannelAccountDraft["tokenStatus"])
                    }
                    className="rounded-md border border-white/10 bg-re7-navy px-3 py-2 text-white"
                  >
                    {TOKEN_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {formatLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm md:col-span-2">
                  <span className="text-white/70">Page access token</span>
                  <input
                    type="password"
                    value={draft.pageAccessToken}
                    onChange={(event) => updateDraft(index, "pageAccessToken", event.target.value)}
                    className="rounded-md border border-white/10 bg-re7-navy px-3 py-2 font-mono text-white"
                    placeholder={
                      draft.tokenStatus === "configured"
                        ? "Token configurado. Preencha apenas para substituir."
                        : "Cole o PAGE_ACCESS_TOKEN da pagina"
                    }
                    autoComplete="off"
                  />
                  <span className="text-xs text-white/50">
                    O valor e salvo somente no backend e nao retorna pela API. Para Instagram Business,
                    prefira a tela de onboarding OAuth do app.
                  </span>
                </label>
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-3">
                {[
                  ["enabled", "Ativo"],
                  ["automationEnabled", "Automação"],
                  ["runtimeEnabled", "Runtime"],
                  ["inboundPersistenceEnabled", "Inbound"],
                  ["outboundEnabled", "Outbound"],
                  ["aiEnabled", "IA"],
                  ["handoffEnabled", "Handoff"],
                ].map(([field, label]) => (
                  <label
                    key={field}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-re7-navy/40 px-3 py-2 text-sm"
                  >
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(draft[field as keyof ChannelAccountDraft])}
                      onChange={(event) =>
                        updateDraft(
                          index,
                          field as keyof Pick<
                            ChannelAccountDraft,
                            | "enabled"
                            | "automationEnabled"
                            | "runtimeEnabled"
                            | "inboundPersistenceEnabled"
                            | "outboundEnabled"
                            | "aiEnabled"
                            | "handoffEnabled"
                          >,
                          event.target.checked
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </section>
            );
          })}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || loading}
              className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar canais"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
