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
  externalBusinessId: string;
  enabled: boolean;
  automationEnabled: boolean;
  aiEnabled: boolean;
  handoffEnabled: boolean;
  status: NonNullable<TenantChannelAccount["status"]>;
  tokenStatus: NonNullable<TenantChannelAccount["tokenStatus"]>;
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
    externalBusinessId: "",
    enabled: false,
    automationEnabled: false,
    aiEnabled: false,
    handoffEnabled: false,
    status: "pending",
    tokenStatus: "missing",
  };
}

function toDraft(account: TenantChannelAccount): ChannelAccountDraft {
  return {
    id: account.id,
    channel: account.channel,
    provider: account.provider,
    displayName: account.displayName ?? "",
    channelAccountId: account.channelAccountId,
    externalBusinessId: account.externalBusinessId ?? "",
    enabled: account.enabled,
    automationEnabled: account.automationEnabled === true,
    aiEnabled: account.aiEnabled === true,
    handoffEnabled: account.handoffEnabled === true,
    status: account.status ?? (account.enabled ? "connected" : "disabled"),
    tokenStatus: account.tokenStatus ?? "missing",
  };
}

function toPayload(drafts: ChannelAccountDraft[], tenantId: string) {
  return drafts.map((draft) => ({
    id: draft.id,
    tenantKey: tenantId,
    channel: draft.channel,
    provider: draft.provider,
    displayName: draft.displayName.trim() || undefined,
    channelAccountId: draft.channelAccountId.trim(),
    externalBusinessId: draft.externalBusinessId.trim() || undefined,
    enabled: draft.enabled,
    automationEnabled: draft.automationEnabled,
    aiEnabled: draft.aiEnabled,
    handoffEnabled: draft.handoffEnabled,
    status: draft.status,
    tokenStatus: draft.tokenStatus,
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
          <strong>Configuração passiva.</strong> Esta tela prepara contas de canal para uso futuro.
          Ela nao ativa envio, recebimento, automacao, IA ou handoff em Instagram/Messenger nesta etapa.
          Nenhum token e exibido ou salvo por esta interface.
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

          {drafts.map((draft, index) => (
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
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-4">
                {[
                  ["enabled", "Ativo"],
                  ["automationEnabled", "Automação"],
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
                            "enabled" | "automationEnabled" | "aiEnabled" | "handoffEnabled"
                          >,
                          event.target.checked
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </section>
          ))}

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
