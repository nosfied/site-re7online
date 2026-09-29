"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  fetchAutomationConversationsSettings,
  updateAutomationConversationsSettings,
  fetchOwnClosedConversationsSettings,
  updateOwnClosedConversationsSettings,
  AppAgentSignatureSettings,
  AppApiError,
  AppInboxVisibilityPolicy,
  AppServiceMessagePolicy,
  AppSession,
  clearAppSession,
  fetchAppAgentSignatureSettings,
  loadAppSession,
  saveAppSession,
  updateAppAgentSignatureSettings,
} from "@/lib/appClientApi";
import { getAppErrorUxMessage } from "@/lib/appUxLabels";

function canAccessInboxSettings(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function canManageInboxSettings(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function getDefaultSettings(): AppAgentSignatureSettings {
  return {
    enabled: false,
    mode: "user_name",
    format: "bold_line",
  };
}

function getDefaultInboxVisibilityPolicy(): AppInboxVisibilityPolicy {
  return "shared";
}

function getDefaultServiceMessages(): AppServiceMessagePolicy {
  return {
    protocolNotice: {
      enabled: true,
      text: null,
    },
    queuePositionNotice: {
      enabled: true,
      text: null,
    },
    closeNotice: {
      enabled: true,
      text: "Atendimento encerrado. Obrigado pelo contato.",
    },
  };
}

function normalizeSettingsError(error: AppApiError, fallback: string) {
  if (error.status === 401) return "Sessão expirada. Faça login novamente.";
  if (error.status === 403) return "Sem permissão para alterar configurações de atendimento.";
  return getAppErrorUxMessage({ ...error, fallback });
}

function SettingsBadge({ label, tone = "default" }: { label: string; tone?: "default" | "success" | "warning" }) {
  const className =
    tone === "success"
      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
      : tone === "warning"
        ? "border-amber-300/30 bg-amber-500/15 text-amber-100"
        : "border-white/15 bg-white/5 text-white/75";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

export default function AppSettingsInboxPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [allowAutomation, setAllowAutomation] = useState(false);
  const [canUpdateAutomation, setCanUpdateAutomation] = useState(false);
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [allowOwnClosed, setAllowOwnClosed] = useState(false);
  const [canUpdateOwnClosed, setCanUpdateOwnClosed] = useState(false);
  const [savingOwnClosed, setSavingOwnClosed] = useState(false);
  const [settings, setSettings] = useState<AppAgentSignatureSettings>(getDefaultSettings);
  const [inboxVisibilityPolicy, setInboxVisibilityPolicy] = useState<AppInboxVisibilityPolicy>(
    getDefaultInboxVisibilityPolicy
  );
  const [serviceMessages, setServiceMessages] = useState<AppServiceMessagePolicy>(getDefaultServiceMessages);
  const [canUpdate, setCanUpdate] = useState(false);
  const [canUpdateInboxVisibilityPolicy, setCanUpdateInboxVisibilityPolicy] = useState(false);
  const [canUpdateServiceMessages, setCanUpdateServiceMessages] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const applyResponse = useCallback((response: Awaited<ReturnType<typeof fetchAppAgentSignatureSettings>>) => {
    setSettings(response.settings);
    setInboxVisibilityPolicy(response.inboxVisibilityPolicy?.value ?? getDefaultInboxVisibilityPolicy());
    const nextServiceMessages = response.serviceMessages?.value ?? getDefaultServiceMessages();
    setServiceMessages({
      ...nextServiceMessages,
      closeNotice: {
        ...nextServiceMessages.closeNotice,
        text: response.serviceMessages?.closeMessage?.value ?? nextServiceMessages.closeNotice.text,
      },
    });
    setCanUpdate(response.permissions.canUpdate);
    setCanUpdateInboxVisibilityPolicy(response.permissions.canUpdateInboxVisibilityPolicy === true);
    setCanUpdateServiceMessages(response.permissions.canUpdateServiceMessages === true);
  }, []);

  const loadSettings = useCallback(
    async (activeSession: AppSession) => {
      const response = await fetchAppAgentSignatureSettings(activeSession);
      applyResponse(response);
      const automation = await fetchAutomationConversationsSettings(activeSession);
      setAllowAutomation(automation.allowAutomationConversationsInInbox);
      setCanUpdateAutomation(automation.permissions.canUpdate);
      const closed = await fetchOwnClosedConversationsSettings(activeSession);
      setAllowOwnClosed(closed.allowAgentOwnClosedConversations);
      setCanUpdateOwnClosed(closed.permissions.canUpdate);
    },
    [applyResponse]
  );

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    if (!canAccessInboxSettings(stored.user.role)) {
      router.replace("/app/inbox");
      return;
    }
    setSession(stored);
    saveAppSession(stored);
  }, [router]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadSettings(session)
      .catch((err) => {
        if (cancelled) return;
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        if (typed.status === 403) {
          router.replace("/app/inbox");
          return;
        }
        setError(normalizeSettingsError(typed, "Não foi possível carregar as configurações de atendimento."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, loadSettings, router, session]);

  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || success), () => {
    setError(null);
    setSuccess(null);
  });

  const readOnly = useMemo(() => !session || !canManageInboxSettings(session.user.role) || !canUpdate, [canUpdate, session]);
  const visibilityReadOnly = useMemo(
    () => !session || !canUpdateInboxVisibilityPolicy || saving,
    [canUpdateInboxVisibilityPolicy, saving, session]
  );
  const serviceMessagesVisible = session?.features.operationalServiceMessages === true;
  const serviceMessagesReadOnly = useMemo(
    () => !session || !canUpdateServiceMessages || saving,
    [canUpdateServiceMessages, saving, session]
  );

  const saveAutomation = async () => {
    if (!session || !canUpdateAutomation) return;
    setSavingAutomation(true); setError(null); setSuccess(null);
    try {
      const response = await updateAutomationConversationsSettings(session, allowAutomation);
      setAllowAutomation(response.allowAutomationConversationsInInbox);
      setSuccess("Acompanhamento de automação atualizado.");
    } catch (error) { setError(normalizeSettingsError(error as AppApiError, "Não foi possível atualizar o acompanhamento.")); }
    finally { setSavingAutomation(false); }
  };

  const saveOwnClosed = async () => {
    if (!session || !canUpdateOwnClosed) return;
    setSavingOwnClosed(true); setError(null); setSuccess(null);
    try {
      const response = await updateOwnClosedConversationsSettings(session, allowOwnClosed);
      setAllowOwnClosed(response.allowAgentOwnClosedConversations);
      setSuccess("Permissão de consulta atualizada.");
    } catch (error) { setError(normalizeSettingsError(error as AppApiError, "Não foi possível atualizar a permissão.")); }
    finally { setSavingOwnClosed(false); }
  };

  const handleSave = async () => {
    if (!session || readOnly) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await updateAppAgentSignatureSettings(session, {
        enabled: settings.enabled,
        mode: "user_name",
        format: "bold_line",
        ...(canUpdateInboxVisibilityPolicy ? { inboxVisibilityPolicy } : {}),
        ...(canUpdateServiceMessages ? { serviceMessages } : {}),
      });
      applyResponse(response);
      setSuccess("Configurações de atendimento salvas.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(normalizeSettingsError(typed, "Não foi possível salvar as configurações de atendimento."));
    } finally {
      setSaving(false);
    }
  };

  if (!session) {
    return (
      <main className="min-h-screen bg-re7-navy px-4 py-8 text-white md:px-8">
        <div className="mx-auto max-w-7xl rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm text-white/70">Carregando...</p>
        </div>
      </main>
    );
  }

  return (
    <AppShell
      session={session}
      title="Atendimento"
      subtitle="Configure como as mensagens humanas da caixa de entrada aparecem para o cliente."
    >
      <FeedbackToast message={success} {...toastHandlers} />
      <FeedbackToast message={error} variant="error" {...toastHandlers} />

      <div className="inbox-settings-theme grid gap-4">
        <section className="rounded-xl border border-white/10 p-4 space-y-3">
          <h2 className="font-semibold">Acompanhamento de automação</h2>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={allowAutomation} disabled={!canUpdateAutomation || loading || savingAutomation} onChange={event => setAllowAutomation(event.target.checked)} />
            Exibir conversas no filtro Automação
          </label>
          <p className="text-sm text-white/60">SUPERVISOR e ADMIN podem acompanhar a automação do próprio tenant. Não inclui conversas em Todas nem concede novas permissões para assumir, enviar ou transferir.</p>
          <button type="button" className="rounded-lg border border-white/20 px-4 py-2 disabled:opacity-50" disabled={!canUpdateAutomation || loading || savingAutomation} onClick={() => void saveAutomation()}>{savingAutomation ? "Salvando..." : "Salvar acompanhamento"}</button>
        </section>
        <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={allowOwnClosed} disabled={!canUpdateOwnClosed || loading || savingOwnClosed} onChange={event => setAllowOwnClosed(event.target.checked)} />
            Permitir consulta dos próprios atendimentos concluídos
          </label>
          <p className="text-sm text-white/70">Permite aos atendentes consultar conversas encerradas sob sua responsabilidade, respeitando as regras de acesso existentes. Não permite enviar mensagens, assumir, transferir ou reabrir.</p>
          <button type="button" className="rounded-lg border border-white/20 px-4 py-2 disabled:opacity-50" disabled={!canUpdateOwnClosed || loading || savingOwnClosed} onClick={() => void saveOwnClosed()}>{savingOwnClosed ? "Salvando..." : "Salvar permissão de consulta"}</button>
        </section>

        {loading ? (
          <section className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
            <p className="text-sm text-white/70">Carregando configuração...</p>
          </section>
        ) : (
          <>
            <section className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-re7-sky">Assinatura do atendente</p>
                      <h2 className="mt-1 text-lg font-semibold text-white">Nome visível ao cliente</h2>
                      <p className="mt-1 text-sm leading-relaxed text-white/65">
                        Quando ativa, adiciona o nome profissional do atendente no início de mensagens humanas de texto
                        e mensagens prontas enviadas pela caixa de entrada.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <SettingsBadge
                        label={settings.enabled ? "Ativa" : "Desativada"}
                        tone={settings.enabled ? "success" : "default"}
                      />
                      {readOnly ? <SettingsBadge label="Somente leitura" tone="warning" /> : null}
                    </div>
                  </div>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-re7-navy/35 px-3 py-3">
                    <span>
                      <span className="block text-sm font-semibold text-white">Mostrar nome do atendente ao cliente</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-white/60">
                        Vale para mensagens humanas de texto e mensagens prontas. Modelos Meta, bot, automações e
                        campanhas não recebem assinatura nesta etapa.
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setSettings((current) => ({ ...current, enabled: !current.enabled }))}
                      disabled={readOnly || saving}
                      aria-pressed={settings.enabled}
                      aria-label={settings.enabled ? "Desativar assinatura do atendente" : "Ativar assinatura do atendente"}
                      className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border transition ${
                        settings.enabled
                          ? "border-emerald-400/40 bg-emerald-500/25"
                          : "border-white/20 bg-white/10"
                      } ${readOnly || saving ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <span
                        className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white text-[9px] font-bold text-re7-navy transition ${
                          settings.enabled ? "translate-x-8" : "translate-x-1"
                        }`}
                      >
                        {settings.enabled ? "Sim" : "Não"}
                      </span>
                    </button>
                  </label>
                  <div className="text-sm leading-relaxed text-white/68">
                    <p className="font-semibold text-white">Escopo da assinatura</p>
                    <p className="mt-1">
                      A assinatura usa somente o nome cadastrado do atendente que enviou a mensagem. Não usa email,
                      cargo, telefone, organização técnica ou responsável atual da conversa.
                    </p>
                  </div>
                </div>

                <aside className="space-y-3 rounded-lg border border-white/10 bg-re7-navy/35 p-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Como o cliente verá</h3>
                    <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-50 px-3 py-2 text-sm leading-relaxed text-slate-900">
                      <p className="font-semibold">*Maria*</p>
                      <p>Olá, como posso ajudar?</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-amber-300/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
                    Nome de atendente é dado pessoal. Ative somente quando isso estiver alinhado com a política
                    operacional da organização.
                  </div>
                </aside>
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-re7-sky">Visibilidade das conversas</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">Quem enxerga atendimentos atribuídos</h2>
                  <p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/65">
                    Controla apenas a projeção da Inbox. Notificações, leitura, filas e permissões de ação seguem as
                    regras operacionais atuais.
                  </p>
                </div>
                {!canUpdateInboxVisibilityPolicy ? <SettingsBadge label="Somente leitura" tone="warning" /> : null}
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {[
                  {
                    value: "shared" as const,
                    title: "Compartilhada por setor",
                    description: "Atendentes do setor podem acompanhar conversas atribuídas a colegas.",
                  },
                  {
                    value: "assignee_only_after_assignment" as const,
                    title: "Individual após atribuição",
                    description:
                      "Sem responsável, a fila é compartilhada. Após atribuição, só o responsável, supervisores e administradores autorizados visualizam.",
                  },
                ].map((option) => {
                  const active = inboxVisibilityPolicy === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setInboxVisibilityPolicy(option.value)}
                      disabled={visibilityReadOnly}
                      className={`rounded-lg border p-3 text-left transition ${
                        active
                          ? "border-re7-orange bg-re7-orange/15 text-white"
                          : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10"
                      } ${visibilityReadOnly ? "cursor-not-allowed opacity-70" : ""}`}
                    >
                      <span className="block text-sm font-semibold">{option.title}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-white/60">{option.description}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {serviceMessagesVisible ? (
              <section className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-re7-sky">Mensagens operacionais</p>
                    <h2 className="mt-1 text-lg font-semibold text-white">Avisos automáticos do atendimento humano</h2>
                    <p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/65">
                      Controla avisos automáticos ao cliente. Desativar um aviso não altera protocolo, fila,
                      encerramento ou pesquisa de satisfação.
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-white/65">
                      A mensagem de encaminhamento humano é configurada no nó Atendimento humano do fluxo em{" "}
                      <Link href="/app/chatbot" className="font-semibold text-re7-sky hover:text-white">
                        Chatbot
                      </Link>
                      .
                    </p>
                  </div>
                  {serviceMessagesReadOnly ? <SettingsBadge label="Somente leitura" tone="warning" /> : null}
                </div>

                <div className="mt-3 grid gap-3">
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                      <span>
                        <span className="block text-sm font-semibold text-white">
                          Enviar número de protocolo ao iniciar atendimento humano
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-white/60">
                          O protocolo continua sendo gerado mesmo com este aviso desativado.
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setServiceMessages((current) => ({
                            ...current,
                            protocolNotice: {
                              ...current.protocolNotice,
                              enabled: !current.protocolNotice.enabled,
                            },
                          }))
                        }
                        disabled={serviceMessagesReadOnly}
                        aria-pressed={serviceMessages.protocolNotice.enabled}
                        className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border transition ${
                          serviceMessages.protocolNotice.enabled
                            ? "border-emerald-400/40 bg-emerald-500/25"
                            : "border-white/20 bg-white/10"
                        } ${serviceMessagesReadOnly ? "cursor-not-allowed opacity-50" : ""}`}
                      >
                        <span
                          className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white text-[9px] font-bold text-re7-navy transition ${
                            serviceMessages.protocolNotice.enabled ? "translate-x-8" : "translate-x-1"
                          }`}
                        >
                          {serviceMessages.protocolNotice.enabled ? "Sim" : "Não"}
                        </span>
                      </button>
                    </label>
                    <label className="grid gap-1 text-sm text-white/70">
                      Texto do protocolo
                      <textarea
                        value={serviceMessages.protocolNotice.text ?? ""}
                        onChange={(event) =>
                          setServiceMessages((current) => ({
                            ...current,
                            protocolNotice: {
                              ...current.protocolNotice,
                              text: event.target.value,
                            },
                          }))
                        }
                        disabled={serviceMessagesReadOnly}
                        className="min-h-20 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-50"
                        placeholder="Seu protocolo de atendimento é {{protocol}}. Guarde este número para acompanhamento."
                      />
                      <span className="text-xs text-white/50">Use {"{{protocol}}"} para inserir o número do protocolo.</span>
                    </label>

                    <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                      <span>
                        <span className="block text-sm font-semibold text-white">Informar posição na fila</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-white/60">
                          A fila e a distribuição continuam funcionando quando este aviso está desativado.
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setServiceMessages((current) => ({
                            ...current,
                            queuePositionNotice: {
                              ...current.queuePositionNotice,
                              enabled: !current.queuePositionNotice.enabled,
                            },
                          }))
                        }
                        disabled={serviceMessagesReadOnly}
                        aria-pressed={serviceMessages.queuePositionNotice.enabled}
                        className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border transition ${
                          serviceMessages.queuePositionNotice.enabled
                            ? "border-emerald-400/40 bg-emerald-500/25"
                            : "border-white/20 bg-white/10"
                        } ${serviceMessagesReadOnly ? "cursor-not-allowed opacity-50" : ""}`}
                      >
                        <span
                          className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white text-[9px] font-bold text-re7-navy transition ${
                            serviceMessages.queuePositionNotice.enabled ? "translate-x-8" : "translate-x-1"
                          }`}
                        >
                          {serviceMessages.queuePositionNotice.enabled ? "Sim" : "Não"}
                        </span>
                      </button>
                    </label>
                    <label className="grid gap-1 text-sm text-white/70">
                      Texto da posição na fila
                      <textarea
                        value={serviceMessages.queuePositionNotice.text ?? ""}
                        onChange={(event) =>
                          setServiceMessages((current) => ({
                            ...current,
                            queuePositionNotice: {
                              ...current.queuePositionNotice,
                              text: event.target.value,
                            },
                          }))
                        }
                        disabled={serviceMessagesReadOnly}
                        className="min-h-20 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-50"
                        placeholder="Você é o nº {position} da fila de atendimento."
                      />
                      <span className="text-xs text-white/50">Use {"{position}"} para inserir a posição atual.</span>
                    </label>

                    <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                      <span>
                        <span className="block text-sm font-semibold text-white">
                          Enviar mensagem ao finalizar atendimento
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-white/60">
                          O encerramento e a pesquisa de satisfação continuam independentes deste aviso.
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setServiceMessages((current) => ({
                            ...current,
                            closeNotice: {
                              enabled: !current.closeNotice.enabled,
                            },
                          }))
                        }
                        disabled={serviceMessagesReadOnly}
                        aria-pressed={serviceMessages.closeNotice.enabled}
                        className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border transition ${
                          serviceMessages.closeNotice.enabled
                            ? "border-emerald-400/40 bg-emerald-500/25"
                            : "border-white/20 bg-white/10"
                        } ${serviceMessagesReadOnly ? "cursor-not-allowed opacity-50" : ""}`}
                      >
                        <span
                          className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white text-[9px] font-bold text-re7-navy transition ${
                            serviceMessages.closeNotice.enabled ? "translate-x-8" : "translate-x-1"
                          }`}
                        >
                          {serviceMessages.closeNotice.enabled ? "Sim" : "Não"}
                        </span>
                      </button>
                    </label>
                    <label className="grid gap-1 text-sm text-white/70">
                      Texto de encerramento
                      <textarea
                        value={serviceMessages.closeNotice.text ?? ""}
                        onChange={(event) =>
                          setServiceMessages((current) => ({
                            ...current,
                            closeNotice: {
                              ...current.closeNotice,
                              text: event.target.value,
                            },
                          }))
                        }
                        disabled={serviceMessagesReadOnly}
                        className="min-h-20 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-50"
                        placeholder="Atendimento encerrado. Obrigado pelo contato."
                      />
                      <span className="text-xs text-white/50">
                        Placeholders disponíveis: {"{protocol}"}, {"{dataHora}"} e {"{contactName}"}.
                      </span>
                    </label>
                </div>
              </section>
            ) : null}

            <section className="rounded-xl border border-white/10 bg-white/5 p-3 md:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => session && void loadSettings(session)}
                  disabled={saving}
                  className="rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Atualizar
                </button>
                {readOnly ? (
                  <p className="text-xs text-white/55">Somente supervisores e administradores podem salvar alterações.</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Salvando..." : "Salvar configuração"}
                  </button>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
