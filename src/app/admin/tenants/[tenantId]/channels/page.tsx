"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAdminConsole } from "@/components/admin/AdminConsoleProvider";
import {
  Channel,
  authorizeTenantWebSessionNumber,
  getTenantChannelAccounts,
  Provider,
  releaseTenantWebSessionNumber,
  startTenantInstagramBusinessConnect,
  TenantChannelAccount,
  TenantWebSessionStatus,
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
const PROVIDER_OPTIONS: Provider[] = ["meta", "web_session"];
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
const NEW_TENANT_CHECKLIST = [
  "Cadastrar channelAccount e aliases tecnicos.",
  "Conectar/autenticar a conta do canal.",
  "Validar token, identidade e IDs exibidos.",
  "Validar webhook/subscription.",
  "Testar inbound real.",
  "Testar outbound manual antes de ativar Outbound.",
  "Ativar enabled, runtimeEnabled e inboundPersistenceEnabled.",
  "Manter IA, automacao e handoff desligados por padrao em Messenger/Instagram.",
  "Registrar a validacao segura sem expor tokens.",
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

function StatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "success" | "warning" | "danger" | "neutral";
}) {
  const classes =
    tone === "success"
      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
      : tone === "warning"
        ? "border-amber-300/30 bg-amber-500/15 text-amber-100"
        : tone === "danger"
          ? "border-red-400/30 bg-red-500/15 text-red-100"
          : "border-white/15 bg-white/5 text-white/70";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${classes}`}>{label}</span>;
}

function getFlagTone(active: boolean, positiveWhenActive = true) {
  if (positiveWhenActive) return active ? "success" : "warning";
  return active ? "warning" : "success";
}

function getTokenTone(status: ChannelAccountDraft["tokenStatus"], hasNewToken: boolean) {
  if (hasNewToken) return "success";
  if (status === "configured" || status === "not_required") return "success";
  if (status === "expired" || status === "missing") return "warning";
  return "neutral";
}

function getStatusTone(status: ChannelAccountDraft["status"], enabled: boolean) {
  if (status === "connected" && enabled) return "success";
  if (status === "error") return "danger";
  if (status === "pending") return "warning";
  return "neutral";
}

function getChannelModeNote(draft: ChannelAccountDraft) {
  if (draft.channel === "messenger" || draft.channel === "instagram") {
    return "Human-only recomendado: sem IA, sem automacao e sem handoff automatico.";
  }
  if (draft.channel === "whatsapp") return "WhatsApp usa o runtime operacional principal do tenant.";
  return "Canal multichannel.";
}

function getChannelWarnings(draft: ChannelAccountDraft, metadata: Record<string, string>) {
  const warnings: string[] = [];
  if ((draft.channel === "messenger" || draft.channel === "instagram") && draft.outboundEnabled) {
    warnings.push("Outbound ligado: confirme que houve smoke de envio manual antes de manter ativo.");
  }
  if ((draft.channel === "messenger" || draft.channel === "instagram") && (draft.aiEnabled || draft.automationEnabled || draft.handoffEnabled)) {
    warnings.push("Messenger/Instagram devem permanecer human-only por padrao.");
  }
  if (draft.tokenStatus === "configured" && !draft.pageAccessToken.trim()) {
    warnings.push("Token configurado no backend. O valor nao e exibido nem retornado pela API.");
  }
  if (draft.channel === "instagram" && metadata.source === "instagram_business_login" && !metadata.businessLoginUsername) {
    warnings.push("Instagram Business Login sem businessLoginUsername em metadata.");
  }
  return warnings;
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
  const [connectingInstagram, setConnectingInstagram] = useState(false);
  const [webSessionStatus, setWebSessionStatus] = useState<TenantWebSessionStatus | null>(null);
  const [authorizedNumber, setAuthorizedNumber] = useState("");
  const [webSessionWorking, setWebSessionWorking] = useState<string | null>(null);

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
        setWebSessionStatus(response.webSessionStatus ?? null);
        setAuthorizedNumber(response.webSessionStatus?.authorization.authorizedNumberCanonical ?? "");
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
      setWebSessionStatus(response.webSessionStatus ?? null);
      setAuthorizedNumber(response.webSessionStatus?.authorization.authorizedNumberCanonical ?? authorizedNumber);
      setBackupPath(response.backupPath ?? null);
      setToast("Canais conectados salvos.");
    } catch (err) {
      setError((err as Error).message || "Falha ao salvar canais.");
    } finally {
      setSaving(false);
    }
  };

  const handleConnectInstagram = async () => {
    setConnectingInstagram(true);
    setError(null);
    setToast(null);
    try {
      const response = await startTenantInstagramBusinessConnect(connection, tenantId);
      window.location.href = response.authUrl;
    } catch (err) {
      setError((err as Error).message || "Falha ao iniciar Instagram Business Login.");
      setConnectingInstagram(false);
    }
  };

  const handleAuthorizeWebSessionNumber = async () => {
    setWebSessionWorking("authorize");
    setError(null);
    setToast(null);
    try {
      const response = await authorizeTenantWebSessionNumber(connection, tenantId, authorizedNumber);
      setWebSessionStatus(response.status);
      setAuthorizedNumber(response.status.authorization.authorizedNumberCanonical ?? "");
      setToast("Número Web Session autorizado.");
    } catch (err) {
      setError((err as Error).message || "Falha ao autorizar número Web Session.");
    } finally {
      setWebSessionWorking(null);
    }
  };

  const handleReleaseWebSessionNumber = async () => {
    if (!window.confirm("Liberar este número remove sessão e ownership Web Session deste tenant. Use apenas para transferência controlada.")) return;
    setWebSessionWorking("release");
    setError(null);
    setToast(null);
    try {
      const response = await releaseTenantWebSessionNumber(connection, tenantId);
      setWebSessionStatus(response.status);
      setAuthorizedNumber(response.status.authorization.authorizedNumberCanonical ?? "");
      setToast("Número Web Session liberado.");
    } catch (err) {
      setError((err as Error).message || "Falha ao liberar número Web Session.");
    } finally {
      setWebSessionWorking(null);
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
          Envio manual por Messenger/Instagram exige Outbound e token configurado. Tokens nunca sao exibidos
          de volta no console.
        </section>

        <section className="rounded-xl border border-sky-400/25 bg-sky-950/30 p-4 text-sm text-sky-100">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p>
              Este console interno continua sendo a fonte tecnica para auditoria e flags de canal.
              A conexao OAuth do Instagram Business agora e gerenciada por este console interno.
            </p>
            <button
              type="button"
              onClick={handleConnectInstagram}
              disabled={connectingInstagram || !tenantId || !connection.baseUrl || !connection.adminToken}
              className="inline-flex shrink-0 items-center justify-center rounded-md border border-sky-300/40 bg-sky-400/10 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {connectingInstagram ? "Abrindo Business Login..." : "Connect/Reconnect Instagram Business"}
            </button>
          </div>
          <p className="mt-3 text-xs text-sky-100/65">
            A tela legacy de review em <code>/app/settings/channels/instagram</code> permanece acessivel
            diretamente apenas como fallback temporario, mas nao aparece mais no menu do app do cliente.
          </p>
        </section>

        <section className="rounded-xl border border-emerald-400/25 bg-emerald-950/20 p-4 text-sm text-emerald-100">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-100/80">
                  Web Session
                </h2>
                <p className="mt-1 text-emerald-100/70">
                  Autorize o número antes de permitir QR. Redefinir sessão não libera ownership; use Liberar número
                  apenas em transferência controlada.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge
                  label={webSessionStatus?.authorization.status ?? "RELEASED"}
                  tone={webSessionStatus?.authorization.status === "OWNED" ? "success" : webSessionStatus?.authorization.status === "AUTHORIZED" ? "warning" : "neutral"}
                />
                <StatusBadge
                  label={webSessionStatus?.lifecycle.observedState ?? "DISCONNECTED"}
                  tone={webSessionStatus?.lifecycle.observedState === "CONNECTED" ? "success" : webSessionStatus?.lifecycle.observedState === "ERROR" ? "danger" : "warning"}
                />
              </div>
            </div>

            <dl className="grid gap-2 md:grid-cols-3">
              <TechnicalValue label="Número autorizado" value={webSessionStatus?.authorization.authorizedNumberMasked ?? "Não autorizado"} />
              <TechnicalValue label="Número detectado" value={webSessionStatus?.detectedNumber?.masked ?? "-"} />
              <TechnicalValue label="Feature" value={webSessionStatus?.featureEnabled ? "enabled" : "disabled"} />
            </dl>

            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-72 flex-1 flex-col gap-1 text-sm">
                <span className="text-emerald-100/70">Número autorizado para pareamento</span>
                <input
                  value={authorizedNumber}
                  onChange={(event) => setAuthorizedNumber(event.target.value)}
                  className="rounded-md border border-white/10 bg-re7-navy px-3 py-2 font-mono text-white"
                  placeholder="+55..."
                />
              </label>
              <button
                type="button"
                onClick={handleAuthorizeWebSessionNumber}
                disabled={Boolean(webSessionWorking) || !authorizedNumber.trim()}
                className="rounded-md border border-emerald-300/40 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {webSessionWorking === "authorize" ? "Autorizando..." : "Autorizar número"}
              </button>
              <button
                type="button"
                onClick={handleReleaseWebSessionNumber}
                disabled={Boolean(webSessionWorking) || !webSessionStatus?.configured}
                className="rounded-md border border-amber-300/40 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {webSessionWorking === "release" ? "Liberando..." : "Liberar número"}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
                Checklist de novo tenant
              </h2>
              <p className="mt-1 text-sm text-white/65">
                Processo operacional para preparar canais sem expor token nem ativar outbound antes do smoke.
              </p>
            </div>
            <span className="rounded-full border border-white/15 bg-re7-navy/50 px-3 py-1 text-xs font-semibold text-white/70">
              Fonte tecnica: console interno
            </span>
          </div>
          <ol className="mt-3 grid gap-2 text-sm text-white/75 md:grid-cols-2">
            {NEW_TENANT_CHECKLIST.map((item, itemIndex) => (
              <li key={item} className="flex gap-2 rounded-lg border border-white/10 bg-re7-navy/35 px-3 py-2">
                <span className="font-mono text-xs text-re7-orange">{itemIndex + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
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
            const warnings = getChannelWarnings(draft, metadata);
            return (
            <section key={draft.id || index} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/60">
                    <span>Conta {index + 1}</span>
                    <StatusBadge label={draft.channel} />
                    <StatusBadge label={draft.status} tone={getStatusTone(draft.status, draft.enabled)} />
                  </h2>
                  <p className="mt-1 font-mono text-xs text-white/50">{draft.id}</p>
                  <p className="mt-2 text-sm text-white/65">{getChannelModeNote(draft)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeDraft(index)}
                  className="rounded-md border border-red-400/30 px-3 py-2 text-sm text-red-100 hover:bg-red-900/30"
                >
                  Remover
                </button>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <StatusBadge label={draft.enabled ? "enabled" : "disabled"} tone={getFlagTone(draft.enabled)} />
                <StatusBadge label={draft.runtimeEnabled ? "runtime on" : "runtime off"} tone={getFlagTone(draft.runtimeEnabled)} />
                <StatusBadge
                  label={draft.inboundPersistenceEnabled ? "inbound on" : "inbound off"}
                  tone={getFlagTone(draft.inboundPersistenceEnabled)}
                />
                <StatusBadge label={draft.outboundEnabled ? "outbound on" : "outbound off"} tone={getFlagTone(draft.outboundEnabled)} />
                <StatusBadge label={draft.aiEnabled ? "IA on" : "IA off"} tone={getFlagTone(draft.aiEnabled, false)} />
                <StatusBadge
                  label={draft.automationEnabled ? "automacao on" : "automacao off"}
                  tone={getFlagTone(draft.automationEnabled, false)}
                />
                <StatusBadge label={draft.handoffEnabled ? "handoff on" : "handoff off"} tone={getFlagTone(draft.handoffEnabled, false)} />
                <StatusBadge
                  label={`token ${formatLabel(draft.tokenStatus)}`}
                  tone={getTokenTone(draft.tokenStatus, Boolean(draft.pageAccessToken.trim()))}
                />
              </div>

              {warnings.length ? (
                <div className="mb-4 rounded-lg border border-amber-300/25 bg-amber-500/10 p-3 text-sm text-amber-100">
                  <p className="font-semibold">Avisos operacionais</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <dl className="mb-4 grid gap-2 md:grid-cols-3">
                <TechnicalValue label="channelAccountId" value={draft.channelAccountId} />
                <TechnicalValue label="externalAccountIds" value={draft.externalAccountIds} />
                <TechnicalValue label="graphAccountId" value={metadata.graphAccountId} />
                <TechnicalValue label="webhookAccountId" value={metadata.webhookAccountId} />
                <TechnicalValue label="facebookPageId" value={metadata.facebookPageId} />
                <TechnicalValue label="instagramBusinessLoginId" value={metadata.instagramBusinessLoginId} />
                <TechnicalValue label="username" value={metadata.username} />
                <TechnicalValue label="businessLoginUsername" value={metadata.businessLoginUsername} />
                <TechnicalValue label="tokenStatus" value={draft.tokenStatus} />
                <TechnicalValue label="source" value={source} />
              </dl>

              {draft.channel === "instagram" ? (
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleConnectInstagram}
                    disabled={connectingInstagram || !tenantId || !connection.baseUrl || !connection.adminToken}
                    className="rounded-md border border-sky-300/40 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-400/10"
                  >
                    {connectingInstagram ? "Abrindo Business Login..." : "Connect/Reconnect Instagram Business"}
                  </button>
                  <Link
                    href="/app/settings/channels/instagram"
                    className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/65 hover:bg-white/10"
                  >
                    Legacy review screen
                  </Link>
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard?.writeText(
                        "https://converta.re7online.com/agent-api/meta/instagram/oauth/callback"
                      )
                    }
                    className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                  >
                    Copy redirect URI
                  </button>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-white/70">Canal</span>
                  <select
                    value={draft.channel}
                    onChange={(event) => {
                      const channel = event.target.value as Channel;
                      updateDraft(index, "channel", channel);
                      if (channel !== "whatsapp" && draft.provider === "web_session") {
                        updateDraft(index, "provider", "meta");
                      }
                    }}
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
                    onChange={(event) => {
                      const provider = event.target.value as Provider;
                      updateDraft(index, "provider", provider);
                      if (provider === "web_session") {
                        updateDraft(index, "channel", "whatsapp");
                      }
                    }}
                    className="rounded-md border border-white/10 bg-re7-navy px-3 py-2 text-white"
                  >
                    {PROVIDER_OPTIONS.map((provider) => (
                      <option key={provider} value={provider}>
                        {provider}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-white/50">
                    WEB_SESSION e permitido somente para WhatsApp.
                  </span>
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
