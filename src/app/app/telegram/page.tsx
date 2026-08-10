"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppSession,
  AppTelegramAccount,
  AppTelegramAccountStatus,
  clearAppSession,
  createAppTelegramAccount,
  fetchAppTelegram,
  fetchAppTelegramDiagnostics,
  loadAppSession,
  rotateAppTelegramToken,
  saveAppSession,
  updateAppTelegramAccount,
} from "@/lib/appClientApi";
import { hasCapability } from "@/lib/appFeatures";
import { getAppErrorUxMessage, getConnectionStatusUxLabel } from "@/lib/appUxLabels";
import { formatDateTime } from "@/lib/whatsappAdminApi";

type TelegramForm = {
  id: string;
  displayName: string;
  channelAccountId: string;
  botUsername: string;
  botId: string;
  token: string;
  enabled: boolean;
  runtimeEnabled: boolean;
  inboundPersistenceEnabled: boolean;
  outboundEnabled: boolean;
  handoffEnabled: boolean;
  status: AppTelegramAccountStatus;
};

const EMPTY_FORM: TelegramForm = {
  id: "",
  displayName: "",
  channelAccountId: "",
  botUsername: "",
  botId: "",
  token: "",
  enabled: false,
  runtimeEnabled: false,
  inboundPersistenceEnabled: false,
  outboundEnabled: false,
  handoffEnabled: true,
  status: "pending",
};

function canManageTelegram(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function normalizeError(error: AppApiError, fallback: string) {
  if (error.status === 401) return "Sessão expirada. Faça login novamente.";
  if (error.status === 403) return "Seu perfil não tem permissão para gerenciar Telegram.";
  if (error.errorCode === "feature_not_enabled") return "Telegram não está habilitado para esta organização.";
  if (error.errorCode === "duplicate_telegram_account") return "Já existe uma conta Telegram com estes dados.";
  if (error.errorCode === "channel_account_secret_key_missing") {
    return "A chave de criptografia dos acessos não está configurada no servidor.";
  }
  if (error.errorCode?.endsWith("_not_found")) return "A conta selecionada não pertence a esta organização ou não existe.";
  return getAppErrorUxMessage({ ...error, fallback });
}

function accountToForm(account: AppTelegramAccount): TelegramForm {
  return {
    id: account.id,
    displayName: account.displayName ?? "",
    channelAccountId: account.channelAccountId,
    botUsername: account.botUsername ?? "",
    botId: account.botId ?? "",
    token: "",
    enabled: account.enabled,
    runtimeEnabled: account.runtimeEnabled,
    inboundPersistenceEnabled: account.inboundPersistenceEnabled,
    outboundEnabled: account.outboundEnabled,
    handoffEnabled: account.handoffEnabled,
    status: account.status,
  };
}

function StatusPill({ account }: { account: AppTelegramAccount }) {
  const tone =
    account.enabled && account.tokenConfigured
      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
      : account.enabled
        ? "border-amber-300/30 bg-amber-500/15 text-amber-100"
        : "border-white/15 bg-white/5 text-white/60";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {account.enabled ? "Configurado" : "Inativo"}
    </span>
  );
}

function TokenPill({ configured }: { configured: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
        configured
          ? "border-sky-300/30 bg-sky-500/15 text-sky-100"
          : "border-amber-300/30 bg-amber-500/15 text-amber-100"
      }`}
    >
      {configured ? "Acesso criptografado" : "Acesso pendente"}
    </span>
  );
}

export default function TelegramPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [accounts, setAccounts] = useState<AppTelegramAccount[]>([]);
  const [form, setForm] = useState<TelegramForm>(EMPTY_FORM);
  const [rotateTokenById, setRotateTokenById] = useState<Record<string, string>>({});
  const [diagnostics, setDiagnostics] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || success), () => {
    setError(null);
    setSuccess(null);
  });

  const editing = Boolean(form.id);
  const activeAccounts = useMemo(() => accounts.filter((account) => account.enabled), [accounts]);

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const loadTelegram = useCallback(
    async (activeSession: AppSession) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchAppTelegram(activeSession);
        setAccounts(response.accounts);
      } catch (err) {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        if (typed.status === 403) {
          router.replace("/app/inbox");
          return;
        }
      setError(normalizeError(typed, "Não foi possível carregar o Telegram."));
      } finally {
        setLoading(false);
      }
    },
    [handleUnauthorized, router]
  );

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    if (!canManageTelegram(stored.user.role) || !hasCapability(stored, "telegram")) {
      router.replace("/app/inbox");
      return;
    }
    setSession(stored);
    saveAppSession(stored);
  }, [router]);

  useEffect(() => {
    if (!session) return;
    void loadTelegram(session);
  }, [loadTelegram, session]);

  const handleSave = async () => {
    if (!session) return;
    if (!form.displayName.trim()) {
      setError("Informe um nome para o bot.");
      return;
    }
    if (!form.channelAccountId.trim() && !form.botUsername.trim() && !form.botId.trim()) {
      setError("Informe usuário, ID do bot ou código interno do canal.");
      return;
    }
    if (!editing && !form.token.trim()) {
      setError("Informe o acesso do bot na criação.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    setDiagnostics(null);
    try {
      const payload = {
        displayName: form.displayName,
        channelAccountId: form.channelAccountId || null,
        botUsername: form.botUsername || null,
        botId: form.botId || null,
        token: editing ? null : form.token,
        enabled: form.enabled,
        runtimeEnabled: form.runtimeEnabled,
        inboundPersistenceEnabled: form.inboundPersistenceEnabled,
        outboundEnabled: form.outboundEnabled,
        handoffEnabled: form.handoffEnabled,
        status: form.status,
      };
      const response = editing
        ? await updateAppTelegramAccount(session, form.id, payload)
        : await createAppTelegramAccount(session, payload);
      setAccounts((current) => [response.account, ...current.filter((account) => account.id !== response.account.id)]);
      setForm(EMPTY_FORM);
      setSuccess(editing ? "Conta Telegram atualizada." : "Conta Telegram criada.");
    } catch (err) {
      setError(normalizeError(err as AppApiError, "Não foi possível salvar o Telegram."));
    } finally {
      setSaving(false);
    }
  };

  const handleRotate = async (account: AppTelegramAccount) => {
    if (!session) return;
    const token = rotateTokenById[account.id]?.trim() ?? "";
    if (!token) {
      setError("Informe o novo acesso antes de trocar.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await rotateAppTelegramToken(session, account.id, token);
      setAccounts((current) => current.map((item) => (item.id === response.account.id ? response.account : item)));
      setRotateTokenById((current) => ({ ...current, [account.id]: "" }));
      setSuccess("Acesso do Telegram trocado.");
    } catch (err) {
      setError(normalizeError(err as AppApiError, "Não foi possível trocar o acesso."));
    } finally {
      setSaving(false);
    }
  };

  const handleDiagnostics = async (account: AppTelegramAccount) => {
    if (!session) return;
    setError(null);
    setSuccess(null);
    setDiagnostics(null);
    try {
      const response = await fetchAppTelegramDiagnostics(session, account.id);
      setDiagnostics(response.diagnostics.message);
    } catch (err) {
      setError(normalizeError(err as AppApiError, "Não foi possível carregar o diagnóstico."));
    }
  };

  if (!session) return null;

  return (
    <AppShell
      session={session}
      title="Telegram"
      subtitle="Cadastro de bots por organização. Recebimento, envio e mensagens ainda não fazem parte deste módulo."
    >
      <FeedbackToast variant={error ? "error" : "success"} message={error || success || ""} {...toastHandlers} />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pb-8">
        <section className="theme-card rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Bots cadastrados</h2>
              <p className="theme-muted text-sm">
                {activeAccounts.length} ativo(s). Tokens ficam criptografados e não são exibidos depois de salvos.
              </p>
            </div>
            <button
              type="button"
              className="theme-button-secondary rounded-md px-3 py-2 text-sm"
              onClick={() => void loadTelegram(session)}
              disabled={loading}
            >
              Atualizar
            </button>
          </div>
          <div className="mt-4 grid gap-3">
            {loading ? (
              <p className="theme-muted text-sm">Carregando Telegram...</p>
            ) : accounts.length === 0 ? (
              <p className="theme-muted text-sm">Nenhum bot Telegram configurado nesta organização.</p>
            ) : (
              accounts.map((account) => (
                <article key={account.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{account.displayName || account.channelAccountId}</h3>
                      <p className="theme-muted text-sm">
                        {account.botUsername ? `@${account.botUsername}` : "usuário não informado"} ·{" "}
                        {account.botId || account.channelAccountId}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusPill account={account} />
                      <TokenPill configured={account.tokenConfigured} />
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                    <span className="theme-muted">Integração de recebimento: {getConnectionStatusUxLabel(account.webhookStatus)}</span>
                    <span className="theme-muted">Recebimento: {account.inboundPersistenceEnabled ? "preparado" : "inativo"}</span>
                    <span className="theme-muted">Envio: {account.outboundEnabled ? "preparado" : "inativo"}</span>
                    <span className="theme-muted">Atualizado: {formatDateTime(account.updatedAt)}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="theme-button-secondary rounded-md px-3 py-2 text-sm"
                      onClick={() => setForm(accountToForm(account))}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="theme-button-secondary rounded-md px-3 py-2 text-sm"
                      onClick={() => void handleDiagnostics(account)}
                    >
                      Diagnóstico
                    </button>
                    <input
                      type="password"
                      className="theme-input min-w-[220px] rounded-md px-3 py-2 text-sm"
                      placeholder="Novo acesso do bot"
                      value={rotateTokenById[account.id] ?? ""}
                      onChange={(event) =>
                        setRotateTokenById((current) => ({ ...current, [account.id]: event.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="theme-button-primary rounded-md px-3 py-2 text-sm"
                      onClick={() => void handleRotate(account)}
                      disabled={saving}
                    >
                      Trocar token
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
          {diagnostics ? (
            <div className="mt-4 rounded-lg border border-sky-300/20 bg-sky-500/10 p-3 text-sm text-sky-100">
              {diagnostics}
            </div>
          ) : null}
        </section>

        <section className="theme-card rounded-lg border p-4">
          <h2 className="text-base font-semibold">{editing ? "Editar bot" : "Novo bot"}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              Nome
              <input
                className="theme-input mt-1 w-full rounded-md px-3 py-2"
                value={form.displayName}
                onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
              />
            </label>
            <label className="text-sm">
              Username
              <input
                className="theme-input mt-1 w-full rounded-md px-3 py-2"
                placeholder="ex: converta_bot"
                value={form.botUsername}
                onChange={(event) => setForm((current) => ({ ...current, botUsername: event.target.value }))}
              />
            </label>
            <label className="text-sm">
              Bot ID
              <input
                className="theme-input mt-1 w-full rounded-md px-3 py-2"
                value={form.botId}
                onChange={(event) => setForm((current) => ({ ...current, botId: event.target.value }))}
              />
            </label>
            <label className="text-sm">
              Código interno do canal
              <input
                className="theme-input mt-1 w-full rounded-md px-3 py-2"
                value={form.channelAccountId}
                onChange={(event) => setForm((current) => ({ ...current, channelAccountId: event.target.value }))}
              />
            </label>
            <label className="text-sm md:col-span-2">
              {editing ? "Acesso apenas por troca" : "Acesso do bot"}
              <input
                className="theme-input mt-1 w-full rounded-md px-3 py-2"
                type="password"
                disabled={editing}
                value={form.token}
                onChange={(event) => setForm((current) => ({ ...current, token: event.target.value }))}
              />
            </label>
            <label className="text-sm">
              Situação
              <select
                className="theme-input mt-1 w-full rounded-md px-3 py-2"
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({ ...current, status: event.target.value as AppTelegramAccountStatus }))
                }
              >
                <option value="pending">Pendente</option>
                <option value="connected">Conectado</option>
                <option value="disabled">Inativo</option>
                <option value="error">Com problema</option>
              </select>
            </label>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["enabled", "Ativo"],
              ["runtimeEnabled", "Atendimento preparado"],
              ["inboundPersistenceEnabled", "Recebimento preparado"],
              ["outboundEnabled", "Envio preparado"],
              ["handoffEnabled", "Encaminhamento para humano"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(form[key as keyof TelegramForm])}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, [key]: event.target.checked }))
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              className="theme-button-primary rounded-md px-4 py-2 text-sm"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {editing ? "Salvar alterações" : "Criar bot"}
            </button>
            <button
              type="button"
              className="theme-button-secondary rounded-md px-4 py-2 text-sm"
              onClick={() => setForm(EMPTY_FORM)}
            >
              Limpar
            </button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
