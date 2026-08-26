"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppCrmContactDetailResponse,
  AppCrmContactImportConfirmResponse,
  AppCrmContactImportPreviewResponse,
  AppCrmContactItem,
  AppCrmContactsResponse,
  AppSession,
  clearAppSession,
  confirmAppCrmContactCsvImport,
  createAppCrmContact,
  fetchAppCrmContactDetail,
  fetchAppCrmContacts,
  fetchAppCrmStatuses,
  loadAppSession,
  previewAppCrmContactCsvImport,
  recordAppCrmContactOptOut,
  revokeAppCrmContactOptOut,
  saveAppSession,
  updateAppCrmContactBasics,
  updateAppCrmContactStatus,
} from "@/lib/appClientApi";
import { hasCapability } from "@/lib/appFeatures";
import { getAppErrorUxMessage, getChannelUxLabel, getConversationStatusUxLabel } from "@/lib/appUxLabels";
import { formatUserDisplayName } from "@/lib/userDisplayName";

const PAGE_LIMIT = 50;

const CHANNEL_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "messenger", label: "Messenger" },
  { value: "webchat", label: "Chat do site" },
  { value: "telegram", label: "Telegram" },
];

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatNumber(value: number | undefined) {
  return new Intl.NumberFormat("pt-BR").format(value ?? 0);
}

function normalizeAppErrorMessage(error: AppApiError, fallback: string) {
  return getAppErrorUxMessage({
    status: error.status,
    errorCode: error.errorCode,
    message: error.message,
    fallback,
  });
}

function getChannelLabel(channel: string | null) {
  return getChannelUxLabel(channel);
}

function getConversationStatusLabel(status: string | null) {
  return status ? getConversationStatusUxLabel(status as never) : "-";
}

function getTemplateHint(item: AppCrmContactItem) {
  if (item.canStartWhatsappTemplateCandidate) return "Pode receber modelo aprovado";
  switch (item.templateSendBlockedReason) {
    case "not_whatsapp":
      return "Canal sem envio ativo";
    case "missing_phone":
      return "Sem telefone válido";
    case "opt_out":
      return "Bloqueado para comunicações";
    case "unsupported_channel":
      return "Canal não suportado";
    default:
      return "Indisponível";
  }
}

function getDisplayName(item: AppCrmContactItem) {
  return item.displayName || item.identifierDisplay || "Contato";
}

function ActionIconButton({
  label,
  icon,
  onClick,
  disabled,
  variant = "neutral",
}: {
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "neutral" | "primary";
}) {
  const classes =
    variant === "primary"
      ? "border-re7-sky/40 bg-re7-sky text-slate-950 hover:brightness-110"
      : "theme-nav-link border-white/10 hover:bg-white/10";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md border text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${classes}`}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}

function CrmContactsSkeleton() {
  return (
    <div className="theme-surface rounded-xl border shadow-sm">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="grid gap-3 border-b border-white/10 p-4 last:border-b-0 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <div className="h-4 w-40 animate-pulse rounded bg-white/20" />
            <div className="mt-2 h-3 w-28 animate-pulse rounded bg-white/10" />
          </div>
          <div className="h-4 w-24 animate-pulse rounded bg-white/15" />
          <div className="h-4 w-28 animate-pulse rounded bg-white/15" />
          <div className="h-4 w-32 animate-pulse rounded bg-white/15" />
        </div>
      ))}
    </div>
  );
}

function CrmContactRow({
  item,
  canViewHistory,
  onOpenDetail,
  onOpenConversation,
  onCopyIdentifier,
}: {
  item: AppCrmContactItem;
  canViewHistory: boolean;
  onOpenDetail: (item: AppCrmContactItem) => void;
  onOpenConversation: (item: AppCrmContactItem) => void;
  onCopyIdentifier: (item: AppCrmContactItem) => void;
}) {
  const identifier = item.phoneDisplay || item.identifierDisplay;
  const canOpenConversation = canViewHistory && Boolean(item.lastConversationIdentity || item.lastConversationId);
  return (
    <tr className="border-b border-white/10 align-top transition hover:bg-white/[0.04]">
      <td className="px-4 py-3">
        <div className="font-semibold text-white">{getDisplayName(item)}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs theme-muted">
          <span>{identifier}</span>
          {item.activeOptOut ? (
            <span className="rounded-full border border-rose-300/30 bg-rose-400/10 px-2 py-0.5 text-rose-100">
              Envio ativo bloqueado
            </span>
          ) : null}
        </div>
        {item.email ? <div className="mt-1 text-xs theme-muted">{item.email}</div> : null}
      </td>
      <td className="px-4 py-3">
        <div className="text-sm text-white">{item.companyName || "-"}</div>
        {item.city ? <div className="mt-1 text-xs theme-muted">{item.city}</div> : null}
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex rounded-full border border-white/10 bg-white/7 px-2 py-1 text-xs font-semibold text-white/80">
          {getChannelLabel(item.channel)}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm font-semibold text-white">{item.crmStatusLabel}</div>
      </td>
      {canViewHistory ? (
        <td className="px-4 py-3">
          {canOpenConversation ? (
            <button
              type="button"
              onClick={() => onOpenConversation(item)}
              className="text-left text-sm font-semibold text-re7-sky transition hover:brightness-125"
            >
              {item.lastProtocol || "Abrir conversa"}
            </button>
          ) : (
            <span className="text-sm theme-muted">Sem conversa</span>
          )}
          <div className="mt-1 text-xs theme-muted">
            {getConversationStatusLabel(item.lastConversationStatus)}
          </div>
          <div className="mt-1 text-xs theme-muted">
            {item.conversationsCount ? `${item.conversationsCount} conversa(s)` : "Nenhum histórico"}
          </div>
        </td>
      ) : null}
      <td className="px-4 py-3">
        <div className="text-sm text-white">{formatDateTime(item.updatedAt)}</div>
        {item.importedSource ? (
          <div className="mt-1 text-xs theme-muted">Origem: {item.importedSource}</div>
        ) : null}
        <div className="mt-1 text-xs theme-muted">{getTemplateHint(item)}</div>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-2">
          <ActionIconButton label="Abrir cadastro" icon="i" onClick={() => onOpenDetail(item)} />
          <ActionIconButton label="Copiar referência" icon="#" onClick={() => onCopyIdentifier(item)} />
          <ActionIconButton
            label="Abrir conversa na caixa de entrada"
            icon=">"
            onClick={() => onOpenConversation(item)}
            disabled={!canOpenConversation}
            variant="primary"
          />
        </div>
      </td>
    </tr>
  );
}

function DetailSection({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-2">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="min-w-0">
      <div className="theme-soft text-[11px] font-semibold uppercase tracking-[0.12em]">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-white">{value ?? "-"}</div>
    </div>
  );
}

function CrmContactDetailDrawer({
  detail,
  loading,
  error,
  canViewHistory,
  statuses,
  onClose,
  onRefresh,
  onOpenInbox,
  onCopyReference,
  onUpdateBasics,
  onUpdateStatus,
  onRecordOptOut,
  onRevokeOptOut,
}: {
  detail: AppCrmContactDetailResponse | null;
  loading: boolean;
  error: string | null;
  canViewHistory: boolean;
  statuses: Array<{ id: string; label: string; isActive?: boolean }>;
  onClose: () => void;
  onRefresh: () => void;
  onOpenInbox: (conversationIdentity: string) => void;
  onCopyReference: (value: string) => void;
  onUpdateBasics: (
    leadId: string,
    payload: { displayName: string | null; companyName: string | null; email: string | null; city: string | null }
  ) => Promise<void>;
  onUpdateStatus: (leadId: string, status: string) => Promise<void>;
  onRecordOptOut: (leadId: string) => Promise<void>;
  onRevokeOptOut: (leadId: string) => Promise<void>;
}) {
  const item = detail?.item ?? null;
  const conversations = detail?.conversations ?? [];
  const [editingBasics, setEditingBasics] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    displayName: "",
    companyName: "",
    email: "",
    city: "",
  });

  useEffect(() => {
    if (!item) return;
    setEditingBasics(false);
    setDraft({
      displayName: item.displayName || "",
      companyName: item.companyName || "",
      email: item.email || "",
      city: item.city || "",
    });
    setActionLoading(null);
  }, [item?.leadId]);

  const saveBasics = async () => {
    if (!item) return;
    const email = draft.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return;
    }
    setActionLoading("basics");
    try {
      await onUpdateBasics(item.leadId, {
        displayName: draft.displayName.trim() || null,
        companyName: draft.companyName.trim() || null,
        email: email || null,
        city: draft.city.trim() || null,
      });
      setEditingBasics(false);
    } finally {
      setActionLoading(null);
    }
  };

  const changeStatus = async (status: string) => {
    if (!item || !status || status === item.crmStatus) return;
    setActionLoading("status");
    try {
      await onUpdateStatus(item.leadId, status);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleOptOut = async () => {
    if (!item) return;
    const message = item.activeOptOut
          ? "Esta ação permitirá novamente campanhas e modelos aprovados para este contato, conforme as regras do canal e da Meta."
          : "Esta ação bloqueará campanhas e modelos iniciados pela empresa para este contato. O atendimento receptivo continuará permitido.";
    if (!window.confirm(message)) return;
    setActionLoading("opt-out");
    try {
      if (item.activeOptOut) {
        await onRevokeOptOut(item.leadId);
      } else {
        await onRecordOptOut(item.leadId);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const emailDraftInvalid = Boolean(
    draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())
  );

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-3 py-4 backdrop-blur-sm sm:px-6"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Fechar cadastro"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <aside
        className="theme-bg relative grid max-h-[calc(100vh-2rem)] w-full max-w-[880px] grid-rows-[auto_1fr] overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="theme-surface-strong theme-shadow border-b p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="theme-soft text-xs font-semibold uppercase tracking-[0.14em]">Cadastro CRM</p>
              <h2 className="mt-1 truncate text-lg font-bold text-white">
                {item ? getDisplayName(item) : "Carregando contato"}
              </h2>
              <p className="mt-1 text-sm theme-muted">
                {item?.companyName || item?.identifierDisplay || "Detalhe operacional do contato"}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <ActionIconButton label="Atualizar cadastro" icon="↺" onClick={onRefresh} disabled={loading} />
              <ActionIconButton label="Fechar cadastro" icon="x" onClick={onClose} />
            </div>
          </div>
        </header>

        <div className="min-h-0 overflow-y-auto p-4">
          {loading && !detail ? (
            <div className="theme-surface rounded-xl border p-8 text-center text-sm theme-muted">
              Carregando cadastro...
            </div>
          ) : error && !detail ? (
            <div className="theme-surface rounded-xl border p-8 text-center">
              <h3 className="text-base font-semibold text-white">Não foi possível carregar o cadastro</h3>
              <p className="mt-2 text-sm theme-muted">{error}</p>
              <button
                type="button"
                onClick={onRefresh}
                className="mt-4 rounded-md bg-re7-sky px-4 py-2 text-sm font-semibold text-slate-950"
              >
                Tentar novamente
              </button>
            </div>
          ) : item ? (
            <div className="grid gap-4">
              {error ? (
                <div className="rounded-lg border border-amber-300/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                  {error}
                </div>
              ) : null}
              <DetailSection
                title="Dados do contato"
                action={
                  <div className="flex items-center gap-2">
                    <ActionIconButton
                      label="Copiar referência"
                      icon="#"
                      onClick={() => onCopyReference(item.phoneDisplay || item.identifierDisplay)}
                    />
                    <ActionIconButton
                      label={editingBasics ? "Cancelar edicao" : "Editar dados"}
                      icon={editingBasics ? "x" : "✎"}
                      onClick={() => {
                        if (editingBasics) {
                          setDraft({
                            displayName: item.displayName || "",
                            companyName: item.companyName || "",
                            email: item.email || "",
                            city: item.city || "",
                          });
                        }
                        setEditingBasics((current) => !current);
                      }}
                      disabled={actionLoading === "basics"}
                    />
                  </div>
                }
              >
                <p className="text-sm theme-muted">Identificadores tecnicos de canal permanecem protegidos.</p>
                {editingBasics ? (
                  <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-sm">
                      <span className="theme-soft text-[11px] font-semibold uppercase tracking-[0.12em]">Nome</span>
                      <input
                        value={draft.displayName}
                        onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
                        className="theme-input h-10 rounded-md border px-3 text-sm"
                        maxLength={120}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <span className="theme-soft text-[11px] font-semibold uppercase tracking-[0.12em]">Empresa</span>
                      <input
                        value={draft.companyName}
                        onChange={(event) => setDraft((current) => ({ ...current, companyName: event.target.value }))}
                        className="theme-input h-10 rounded-md border px-3 text-sm"
                        maxLength={160}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <span className="theme-soft text-[11px] font-semibold uppercase tracking-[0.12em]">E-mail</span>
                      <input
                        value={draft.email}
                        onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                        className="theme-input h-10 rounded-md border px-3 text-sm"
                        maxLength={180}
                      />
                      {emailDraftInvalid ? <span className="text-xs text-amber-200">Informe um e-mail válido.</span> : null}
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <span className="theme-soft text-[11px] font-semibold uppercase tracking-[0.12em]">Cidade</span>
                      <input
                        value={draft.city}
                        onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))}
                        className="theme-input h-10 rounded-md border px-3 text-sm"
                        maxLength={120}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <button
                        type="button"
                        onClick={saveBasics}
                        disabled={actionLoading === "basics" || emailDraftInvalid}
                        className="rounded-md bg-re7-sky px-4 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {actionLoading === "basics" ? "Salvando..." : "Salvar dados"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDraft({
                            displayName: item.displayName || "",
                            companyName: item.companyName || "",
                            email: item.email || "",
                            city: item.city || "",
                          });
                          setEditingBasics(false);
                        }}
                        className="theme-nav-link rounded-md border px-4 py-2 text-sm font-semibold"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
                    <DetailField label="Nome" value={getDisplayName(item)} />
                    <DetailField label="Empresa" value={item.companyName} />
                    <DetailField label="E-mail" value={item.email} />
                    <DetailField label="Cidade" value={item.city} />
                  </div>
                )}
                <div className="grid gap-x-5 gap-y-3 border-t border-white/10 pt-3 sm:grid-cols-2">
                  <DetailField label="Telefone/identificador" value={item.phoneDisplay || item.identifierDisplay} />
                  <DetailField label="Canal principal" value={getChannelLabel(item.channel)} />
                  <DetailField label="Situação no CRM" value={item.crmStatusLabel} />
                  <DetailField label="Código interno da situação" value={item.crmStatus} />
                  <DetailField label="Andamento interno" value={item.leadStatus} />
                  <DetailField label="Bloqueio de envio ativo" value={item.activeOptOut ? "Ativo" : "Inativo"} />
                  <DetailField label="Origem/importação" value={item.importedSource} />
                  <DetailField label="Notas registradas" value={item.notesCount} />
                  <DetailField label="Uso com modelo aprovado" value={getTemplateHint(item)} />
                  <DetailField label="Criado em" value={formatDateTime(item.createdAt)} />
                  <DetailField label="Atualizado em" value={formatDateTime(item.updatedAt)} />
                  <DetailField label="ID interno do cadastro" value={item.leadId} />
                  <DetailField label="ID interno do contato" value={item.contactId} />
                </div>
              </DetailSection>

              <DetailSection title="Preferências e ciclo de vida">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <label className="grid gap-1.5 text-sm">
                    <span className="theme-soft text-[11px] font-semibold uppercase tracking-[0.12em]">Situação no CRM</span>
                    <select
                      value={item.crmStatus}
                      onChange={(event) => changeStatus(event.target.value)}
                      disabled={Boolean(actionLoading)}
                      className="theme-input h-10 rounded-md border px-3 text-sm"
                    >
                      {statuses.map((status) => (
                        <option key={status.id} value={status.id}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="text-sm font-semibold text-white">{item.crmStatusLabel}</span>
                </div>
                <div className="grid gap-2 rounded-lg border border-white/10 p-3">
                  <p className="text-sm theme-muted">
                    Impede campanhas e envio de modelos iniciados pela empresa. O contato ainda poderá enviar mensagens e ser atendido normalmente.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={toggleOptOut}
                      disabled={Boolean(actionLoading)}
                      className="theme-nav-link rounded-md border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {actionLoading === "opt-out"
                        ? "Atualizando..."
                        : item.activeOptOut
                          ? "Liberar envio ativo"
                          : "Bloquear envio ativo"}
                    </button>
                  </div>
                </div>
              </DetailSection>

              {canViewHistory ? (
                <DetailSection title="Conversas relacionadas">
                  <p className="mt-1 text-sm theme-muted">
                    Abertura usa a identidade operacional esperada pela caixa de entrada, sempre na organização da sessão.
                  </p>
                  <div className="mt-4 grid gap-2">
                    {conversations.length === 0 ? (
                      <div className="rounded-lg border border-white/10 p-4 text-sm theme-muted">
                        Nenhuma conversa relacionada encontrada.
                      </div>
                    ) : (
                      conversations.map((conversation) => (
                        <div
                          key={conversation.conversationId}
                          className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 md:grid-cols-[1fr_auto] md:items-center"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-white">{conversation.protocol}</span>
                              <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs theme-muted">
                                {getChannelLabel(conversation.channel)}
                              </span>
                              <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs theme-muted">
                                {getConversationStatusLabel(conversation.status)}
                              </span>
                            </div>
                            <div className="mt-2 text-xs theme-muted">
                              {conversation.departmentName || "Sem setor"}
                              {conversation.queueName ? ` / ${conversation.queueName}` : ""}
                              {conversation.assignedUserName
                                ? ` • ${formatUserDisplayName(conversation.assignedUserName, conversation.assignedUserName)}`
                                : ""}
                            </div>
                            <div className="mt-1 text-xs theme-muted">
                              Atualizada em {formatDateTime(conversation.updatedAt)}
                            </div>
                          </div>
                          <ActionIconButton
                            label="Abrir conversa na caixa de entrada"
                            icon=">"
                            onClick={() => onOpenInbox(conversation.conversationIdentity)}
                            variant="primary"
                          />
                        </div>
                      ))
                    )}
                  </div>
                </DetailSection>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function CreateContactModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (payload: { name: string | null; phone: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const phoneValid = phone.trim().length > 0;

  const submit = async () => {
    if (!phoneValid) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      await onSubmit({ name: name.trim() || null, phone: phone.trim() });
      onClose();
    } catch (err) {
      const typed = err as AppApiError;
      setLocalError(normalizeAppErrorMessage(typed, "Não foi possível salvar o contato."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 px-3 py-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <button type="button" aria-label="Fechar novo contato" className="absolute inset-0 cursor-default" onClick={onClose} />
      <section className="theme-bg relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
        <header className="theme-surface-strong border-b p-4">
          <h2 className="text-lg font-bold text-white">Novo contato</h2>
          <p className="mt-1 text-sm theme-muted">Cadastro operacional no CRM. Nenhuma mensagem será enviada.</p>
        </header>
        <div className="grid gap-4 p-4">
          <label className="grid gap-1.5 text-sm">
            <span className="theme-soft text-[11px] font-semibold uppercase tracking-[0.12em]">Nome opcional</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="theme-input h-10 rounded-md border px-3 text-sm"
              maxLength={120}
              autoFocus
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="theme-soft text-[11px] font-semibold uppercase tracking-[0.12em]">Número do WhatsApp</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="theme-input h-10 rounded-md border px-3 text-sm"
              placeholder="Ex.: 5541999999999"
            />
          </label>
          {localError ? (
            <div className="rounded-lg border border-rose-300/30 bg-rose-400/10 p-3 text-sm text-rose-100">{localError}</div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className="theme-nav-link rounded-md border px-4 py-2 text-sm font-semibold">
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!phoneValid || submitting}
              className="rounded-md bg-re7-sky px-4 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Salvando..." : "Salvar contato"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function CsvImportModal({
  onClose,
  onPreview,
  onConfirm,
}: {
  onClose: () => void;
  onPreview: (payload: { csvText: string; mapping: { phoneColumn: string | null; nameColumn: string | null } }) => Promise<AppCrmContactImportPreviewResponse>;
  onConfirm: (payload: { csvText: string; mapping: { phoneColumn: string | null; nameColumn: string | null } }) => Promise<AppCrmContactImportConfirmResponse>;
}) {
  const [csvText, setCsvText] = useState("");
  const [phoneColumn, setPhoneColumn] = useState("");
  const [nameColumn, setNameColumn] = useState("");
  const [preview, setPreview] = useState<AppCrmContactImportPreviewResponse | null>(null);
  const [summary, setSummary] = useState<AppCrmContactImportConfirmResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const headers = preview?.headers ?? [];
  const mapping = { phoneColumn: phoneColumn || null, nameColumn: nameColumn || null };

  const readFile = async (file: File | null) => {
    if (!file) return;
    setPreview(null);
    setSummary(null);
    setLocalError(null);
    setCsvText(await file.text());
  };

  const runPreview = async () => {
    if (!csvText.trim()) return;
    setLoading(true);
    setLocalError(null);
    setSummary(null);
    try {
      const response = await onPreview({ csvText, mapping });
      setPreview(response);
      if (!phoneColumn && response.headers.length > 0) {
        const guessed = response.headers.find((header) => /^(numero|número|telefone|phone|whatsapp)$/i.test(header.trim()));
        if (guessed) setPhoneColumn(guessed);
      }
      if (!nameColumn && response.headers.length > 0) {
        const guessed = response.headers.find((header) => /^(nome|name)$/i.test(header.trim()));
        if (guessed) setNameColumn(guessed);
      }
    } catch (err) {
      const typed = err as AppApiError;
      setLocalError(normalizeAppErrorMessage(typed, "Não foi possível pré-visualizar o CSV."));
    } finally {
      setLoading(false);
    }
  };

  const runConfirm = async () => {
    if (!csvText.trim() || !preview) return;
    setLoading(true);
    setLocalError(null);
    try {
      const response = await onConfirm({ csvText, mapping });
      setSummary(response);
    } catch (err) {
      const typed = err as AppApiError;
      setLocalError(normalizeAppErrorMessage(typed, "Não foi possível importar o CSV."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 px-3 py-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <button type="button" aria-label="Fechar importação" className="absolute inset-0 cursor-default" onClick={onClose} />
      <section className="theme-bg relative grid max-h-[calc(100vh-2rem)] w-full max-w-3xl grid-rows-[auto_1fr] overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
        <header className="theme-surface-strong border-b p-4">
          <h2 className="text-lg font-bold text-white">Importar CSV</h2>
          <p className="mt-1 text-sm theme-muted">Importação cadastra contatos no CRM sem criar conversas ou enviar mensagens.</p>
        </header>
        <div className="min-h-0 overflow-y-auto p-4">
          <div className="grid gap-4">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void readFile(event.target.files?.[0] ?? null)}
              className="theme-input rounded-md border p-2 text-sm"
            />
            {preview ? (
              <div className="grid gap-3 rounded-lg border border-white/10 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm">
                    <span className="theme-soft text-[11px] font-semibold uppercase tracking-[0.12em]">Coluna do telefone</span>
                    <select value={phoneColumn} onChange={(event) => setPhoneColumn(event.target.value)} className="theme-input h-10 rounded-md border px-3 text-sm">
                      <option value="">Detectar automaticamente</option>
                      {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="theme-soft text-[11px] font-semibold uppercase tracking-[0.12em]">Coluna do nome</span>
                    <select value={nameColumn} onChange={(event) => setNameColumn(event.target.value)} className="theme-input h-10 rounded-md border px-3 text-sm">
                      <option value="">Sem nome</option>
                      {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                    </select>
                  </label>
                </div>
                <div className="grid gap-2 text-sm theme-muted sm:grid-cols-3">
                  <DetailField label="Linhas" value={preview.totalRows} />
                  <DetailField label="Prontas" value={preview.readyToImport} />
                  <DetailField label="Já cadastradas" value={preview.existingContacts} />
                  <DetailField label="Inválidas" value={preview.invalidRows} />
                  <DetailField label="Duplicadas" value={preview.duplicatesInFile} />
                  <DetailField label="Delimitador" value={preview.delimiter} />
                </div>
                {preview.sampleErrors.length > 0 ? (
                  <div className="rounded-lg border border-amber-300/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                    {preview.sampleErrors.slice(0, 5).map((error) => (
                      <div key={`${error.rowNumber}:${error.reason}`}>Linha {error.rowNumber}: {error.label}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {summary ? (
              <div className="rounded-lg border border-emerald-300/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">
                Importação concluída: {summary.created} criado(s), {summary.reused} reutilizado(s), {summary.invalid} inválido(s), {summary.duplicates} duplicado(s).
              </div>
            ) : null}
            {localError ? (
              <div className="rounded-lg border border-rose-300/30 bg-rose-400/10 p-3 text-sm text-rose-100">{localError}</div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={onClose} className="theme-nav-link rounded-md border px-4 py-2 text-sm font-semibold">
                Fechar
              </button>
              <button
                type="button"
                onClick={runPreview}
                disabled={!csvText.trim() || loading}
                className="theme-nav-link rounded-md border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading && !preview ? "Lendo..." : "Pré-visualizar"}
              </button>
              <button
                type="button"
                onClick={runConfirm}
                disabled={!preview || loading || preview.readyToImport === 0}
                className="rounded-md bg-re7-sky px-4 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading && preview ? "Importando..." : "Confirmar importação"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function AppCrmContactsPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [contacts, setContacts] = useState<AppCrmContactsResponse | null>(null);
  const [statuses, setStatuses] = useState<Array<{ id: string; label: string; isActive?: boolean }>>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [hasConversation, setHasConversation] = useState("");
  const [optOut, setOptOut] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [contactDetail, setContactDetail] = useState<AppCrmContactDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || notice), () => {
    setError(null);
    setNotice(null);
  });
  const canViewCrmHistory = String(session?.user.role ?? "").trim().toUpperCase() !== "AGENT";
  const canManageCrmContacts = canViewCrmHistory;

  useEffect(() => {
    if (!selectedLeadId) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [selectedLeadId]);

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const buildFilters = useCallback(
    (targetPage = page) => ({
      q: q || null,
      status: status || null,
      channel: channel || null,
      hasConversation: canViewCrmHistory && hasConversation !== "" ? hasConversation === "true" : null,
      optOut: optOut === "" ? null : optOut === "true",
      page: targetPage,
      limit: PAGE_LIMIT,
    }),
    [canViewCrmHistory, channel, hasConversation, optOut, page, q, status]
  );

  const loadContacts = useCallback(
    async (activeSession: AppSession, targetPage = page) => {
      const response = await fetchAppCrmContacts(activeSession, buildFilters(targetPage));
      setContacts(response);
    },
    [buildFilters, page]
  );

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    saveAppSession(stored);
    setSession(stored);
    if (!hasCapability(stored, "crm")) {
      setLoading(false);
      setError("CRM indisponível para esta organização.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchAppCrmStatuses(stored), fetchAppCrmContacts(stored, { page: 1, limit: PAGE_LIMIT })])
      .then(([statusesResponse, contactsResponse]) => {
        if (cancelled) return;
        setStatuses(statusesResponse.settings.crmBusinessStatuses.filter((item) => item.isActive !== false));
        setContacts(contactsResponse);
      })
      .catch((err) => {
        if (cancelled) return;
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(normalizeAppErrorMessage(typed, "Não foi possível carregar os contatos."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, router]);

  const applyFilters = useCallback(() => {
    if (!session) return;
    setLoading(true);
    setError(null);
    setPage(1);
    loadContacts(session, 1)
      .catch((err) => {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(normalizeAppErrorMessage(typed, "Não foi possível aplicar os filtros."));
      })
      .finally(() => setLoading(false));
  }, [handleUnauthorized, loadContacts, session]);

  const clearFilters = useCallback(() => {
    setQ("");
    setStatus("");
    setChannel("");
    setHasConversation("");
    setOptOut("");
    setPage(1);
    if (!session) return;
    setLoading(true);
    setError(null);
    fetchAppCrmContacts(session, { page: 1, limit: PAGE_LIMIT })
      .then(setContacts)
      .catch((err) => {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(normalizeAppErrorMessage(typed, "Não foi possível limpar os filtros."));
      })
      .finally(() => setLoading(false));
  }, [handleUnauthorized, session]);

  const goToPage = useCallback(
    (targetPage: number) => {
      if (!session) return;
      const safePage = Math.max(1, targetPage);
      setLoading(true);
      setError(null);
      setPage(safePage);
      loadContacts(session, safePage)
        .catch((err) => {
          const typed = err as AppApiError;
          if (typed.status === 401) {
            handleUnauthorized();
            return;
          }
          setError(normalizeAppErrorMessage(typed, "Não foi possível carregar a página."));
        })
        .finally(() => setLoading(false));
    },
    [handleUnauthorized, loadContacts, session]
  );

  const loadContactDetail = useCallback(
    (leadId: string) => {
      if (!session) return;
      setLoadingDetail(true);
      setDetailError(null);
      fetchAppCrmContactDetail(session, leadId)
        .then((response) => {
          setContactDetail(response);
          setSelectedLeadId(leadId);
        })
        .catch((err) => {
          const typed = err as AppApiError;
          if (typed.status === 401) {
            handleUnauthorized();
            return;
          }
          setDetailError(normalizeAppErrorMessage(typed, "Não foi possível carregar o cadastro."));
        })
        .finally(() => setLoadingDetail(false));
    },
    [handleUnauthorized, session]
  );

  const openContactDetail = useCallback(
    (item: AppCrmContactItem) => {
      setSelectedLeadId(item.leadId);
      setContactDetail(null);
      loadContactDetail(item.leadId);
    },
    [loadContactDetail]
  );

  const openConversation = useCallback(
    (item: AppCrmContactItem) => {
      const conversationIdentity = item.lastConversationIdentity || item.lastConversationId;
      if (!conversationIdentity) return;
      router.push(`/app/inbox?conversation=${encodeURIComponent(conversationIdentity)}`);
    },
    [router]
  );

  const openConversationIdentity = useCallback(
    (conversationIdentity: string) => {
      if (!conversationIdentity) return;
      router.push(`/app/inbox?conversation=${encodeURIComponent(conversationIdentity)}`);
    },
    [router]
  );

  const replaceContactFromDetail = useCallback((detail: AppCrmContactDetailResponse) => {
    setContactDetail(detail);
    setContacts((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item) => (item.leadId === detail.item.leadId ? detail.item : item)),
      };
    });
  }, []);

  const mutateContactDetail = useCallback(
    async (
      action: () => Promise<AppCrmContactDetailResponse>,
      successMessage: string,
      fallbackMessage: string
    ) => {
      try {
        const response = await action();
        replaceContactFromDetail(response);
        setNotice(successMessage);
      } catch (err) {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        const message = normalizeAppErrorMessage(typed, fallbackMessage);
        setDetailError(
          typed.errorCode === "status_not_configured"
            ? "A situação selecionada não está ativa nas configurações do CRM."
            : message
        );
        setError(message);
      }
    },
    [handleUnauthorized, replaceContactFromDetail]
  );

  const updateContactBasics = useCallback(
    async (
      leadId: string,
      payload: { displayName: string | null; companyName: string | null; email: string | null; city: string | null }
    ) => {
      if (!session) return;
      await mutateContactDetail(
        () => updateAppCrmContactBasics(session, leadId, payload),
        "Cadastro atualizado.",
        "Não foi possível atualizar o cadastro."
      );
    },
    [mutateContactDetail, session]
  );

  const updateContactStatus = useCallback(
    async (leadId: string, nextStatus: string) => {
      if (!session) return;
      await mutateContactDetail(
        () => updateAppCrmContactStatus(session, leadId, nextStatus),
        "Situação atualizada.",
        "Não foi possível atualizar a situação."
      );
    },
    [mutateContactDetail, session]
  );

  const recordContactOptOut = useCallback(
    async (leadId: string) => {
      if (!session) return;
      await mutateContactDetail(
        () => recordAppCrmContactOptOut(session, leadId),
        "Envio ativo bloqueado.",
        "Não foi possível bloquear o envio ativo."
      );
    },
    [mutateContactDetail, session]
  );

  const revokeContactOptOut = useCallback(
    async (leadId: string) => {
      if (!session) return;
      await mutateContactDetail(
        () => revokeAppCrmContactOptOut(session, leadId),
        "Envio ativo liberado.",
        "Não foi possível liberar o envio ativo."
      );
    },
    [mutateContactDetail, session]
  );

  const createContact = useCallback(
    async (payload: { name: string | null; phone: string }) => {
      if (!session) return;
      try {
        const response = await createAppCrmContact(session, payload);
        replaceContactFromDetail(response);
        setSelectedLeadId(response.item.leadId);
        setNotice(response.item.displayName ? "Contato salvo." : "Contato salvo sem nome.");
        await loadContacts(session, 1);
        setPage(1);
      } catch (err) {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        throw typed;
      }
    },
    [handleUnauthorized, loadContacts, replaceContactFromDetail, session]
  );

  const previewCsvImport = useCallback(
    async (payload: { csvText: string; mapping: { phoneColumn: string | null; nameColumn: string | null } }) => {
      if (!session) throw new Error("Sessão indisponível.");
      return previewAppCrmContactCsvImport(session, payload);
    },
    [session]
  );

  const confirmCsvImport = useCallback(
    async (payload: { csvText: string; mapping: { phoneColumn: string | null; nameColumn: string | null } }) => {
      if (!session) throw new Error("Sessão indisponível.");
      const response = await confirmAppCrmContactCsvImport(session, payload);
      setNotice(`Importação concluída: ${response.created} criado(s), ${response.reused} reutilizado(s).`);
      setPage(1);
      await loadContacts(session, 1);
      return response;
    },
    [loadContacts, session]
  );

  const copyIdentifier = useCallback(async (item: AppCrmContactItem) => {
    const value = item.phoneDisplay || item.identifierDisplay;
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Referencia segura copiada.");
    } catch {
      setError("Não foi possível copiar a referência.");
    }
  }, []);

  const copyReference = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Referencia segura copiada.");
    } catch {
      setError("Não foi possível copiar a referência.");
    }
  }, []);

  const emptyWithFilters = useMemo(
    () => Boolean(q || status || channel || (canViewCrmHistory && hasConversation) || optOut),
    [canViewCrmHistory, channel, hasConversation, optOut, q, status]
  );

  if (!session) {
    return (
      <main className="theme-bg flex min-h-screen items-center justify-center">
        <p className="theme-muted text-sm">Carregando...</p>
      </main>
    );
  }

  return (
    <AppShell
      session={session}
      title="Contatos"
      subtitle="Lista operacional de contatos por organização."
      titleSurface="strong"
    >
      <section className="grid min-h-0 gap-4">
        <div className="sticky top-[242px] z-30 grid gap-2 sm:top-[256px] lg:fixed lg:left-5 lg:right-5 lg:top-[156px] lg:mx-auto lg:w-[calc(100%-2.5rem)] lg:max-w-[1400px] min-[1441px]:top-[210px]">
          <div className="theme-surface-strong theme-shadow rounded-xl border p-4 backdrop-blur">
            <div
              className={`grid gap-3 ${
                canViewCrmHistory
                  ? "lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto_auto]"
                  : "lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto_auto]"
              } lg:items-end`}
            >
              <label className="grid gap-1.5 text-sm">
                <span className="theme-soft text-xs font-semibold uppercase tracking-[0.14em]">Busca</span>
                <input
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") applyFilters();
                  }}
                  className="theme-input h-10 rounded-md border px-3 text-sm"
                  placeholder="Nome, empresa, email ou telefone"
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="theme-soft text-xs font-semibold uppercase tracking-[0.14em]">Situacao</span>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="theme-input h-10 rounded-md border px-3 text-sm"
                >
                  <option value="">Todas</option>
                  {statuses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="theme-soft text-xs font-semibold uppercase tracking-[0.14em]">Canal</span>
                <select
                  value={channel}
                  onChange={(event) => setChannel(event.target.value)}
                  className="theme-input h-10 rounded-md border px-3 text-sm"
                >
                  {CHANNEL_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              {canViewCrmHistory ? (
                <label className="grid gap-1.5 text-sm">
                  <span className="theme-soft text-xs font-semibold uppercase tracking-[0.14em]">Historico</span>
                  <select
                    value={hasConversation}
                    onChange={(event) => setHasConversation(event.target.value)}
                    className="theme-input h-10 rounded-md border px-3 text-sm"
                  >
                    <option value="">Todos</option>
                    <option value="true">Com conversa</option>
                    <option value="false">Sem conversa</option>
                  </select>
                </label>
              ) : null}
              <label className="grid gap-1.5 text-sm">
                <span className="theme-soft text-xs font-semibold uppercase tracking-[0.14em]">Bloqueio envio</span>
                <select
                  value={optOut}
                  onChange={(event) => setOptOut(event.target.value)}
                  className="theme-input h-10 rounded-md border px-3 text-sm"
                >
                  <option value="">Todos</option>
                  <option value="true">Bloqueado</option>
                  <option value="false">Liberado</option>
                </select>
              </label>
              <button
                type="button"
                onClick={applyFilters}
                disabled={loading}
                className="h-10 rounded-md bg-re7-sky px-4 text-sm font-semibold text-slate-950 shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Atualizando..." : "Aplicar"}
              </button>
              <button
                type="button"
                onClick={clearFilters}
                disabled={loading}
                className="theme-nav-link h-10 rounded-md border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                Limpar
              </button>
            </div>
          </div>

          <div className="theme-surface-strong theme-shadow flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm theme-muted backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                {contacts
                  ? `${formatNumber(contacts.pagination.total)} contato(s) encontrados`
                  : "Carregando contatos"}
              </span>
              <span className="text-xs theme-soft">Registros anonimizados ficam ocultos por padrão.</span>
              {contacts ? (
                <span>
                  Página {contacts.pagination.page} de {Math.max(contacts.pagination.totalPages, 1)}
                </span>
              ) : null}
            </div>
            {contacts ? (
              <div className="flex flex-wrap items-center gap-2">
                {canManageCrmContacts ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setCreateModalOpen(true)}
                      className="rounded-md bg-re7-sky px-3 py-2 text-xs font-semibold text-slate-950 transition hover:brightness-110"
                    >
                      Novo contato
                    </button>
                    <button
                      type="button"
                      onClick={() => setCsvModalOpen(true)}
                      className="theme-nav-link rounded-md border px-3 py-2 text-xs font-semibold"
                    >
                      Importar CSV
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => goToPage(1)}
                  disabled={!contacts.pagination.hasPreviousPage || loading}
                  title="Primeira página"
                  aria-label="Primeira página"
                  className="theme-nav-link inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {"<<"}
                </button>
                <button
                  type="button"
                  onClick={() => goToPage(page - 1)}
                  disabled={!contacts.pagination.hasPreviousPage || loading}
                  title="Página anterior"
                  aria-label="Página anterior"
                  className="theme-nav-link inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {"<"}
                </button>
                <span className="text-xs theme-muted">
                  {formatNumber(contacts.items.length)} nesta página
                </span>
                <button
                  type="button"
                  onClick={() => goToPage(page + 1)}
                  disabled={!contacts.pagination.hasNextPage || loading}
                  title="Próxima página"
                  aria-label="Próxima página"
                  className="theme-nav-link inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {">"}
                </button>
                <button
                  type="button"
                  onClick={() => goToPage(Math.max(contacts.pagination.totalPages, 1))}
                  disabled={!contacts.pagination.hasNextPage || loading}
                  title="Última página"
                  aria-label="Última página"
                  className="theme-nav-link inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {">>"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div aria-hidden="true" className="hidden h-[170px] min-[1441px]:h-[180px] lg:block" />

        {loading && !contacts ? (
          <CrmContactsSkeleton />
        ) : error && !contacts ? (
          <div className="theme-surface rounded-xl border p-8 text-center">
            <h2 className="text-base font-semibold text-white">CRM indisponível</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm theme-muted">{error}</p>
            <button
              type="button"
              onClick={applyFilters}
              className="mt-4 rounded-md bg-re7-sky px-4 py-2 text-sm font-semibold text-slate-950"
            >
              Tentar novamente
            </button>
          </div>
        ) : contacts && contacts.items.length === 0 ? (
          <div className="theme-surface rounded-xl border p-8 text-center">
            <h2 className="text-base font-semibold text-white">
              {emptyWithFilters ? "Nenhum contato encontrado" : "Nenhum contato cadastrado"}
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm theme-muted">
              {emptyWithFilters
                ? "Revise os filtros aplicados ou limpe a busca para ver toda a base disponível."
                : "Quando contatos forem criados pelo atendimento, importação ou canais, eles aparecerão aqui."}
            </p>
          </div>
        ) : contacts ? (
          <div className="theme-surface overflow-hidden rounded-xl border shadow-sm">
            <div className="overflow-x-auto">
              <table className={`${canViewCrmHistory ? "min-w-[1120px]" : "min-w-[960px]"} w-full text-left text-sm`}>
                <thead className="border-b border-white/10 bg-white/[0.04] text-xs uppercase tracking-[0.12em] theme-soft">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Contato</th>
                    <th className="px-4 py-3 font-semibold">Empresa</th>
                    <th className="px-4 py-3 font-semibold">Canal</th>
                    <th className="px-4 py-3 font-semibold">Situação</th>
                    {canViewCrmHistory ? <th className="px-4 py-3 font-semibold">Última conversa</th> : null}
                    <th className="px-4 py-3 font-semibold">Atualização</th>
                    <th className="px-4 py-3 text-right font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.items.map((item) => (
                    <CrmContactRow
                      key={item.leadId}
                      item={item}
                      canViewHistory={canViewCrmHistory}
                      onOpenDetail={openContactDetail}
                      onOpenConversation={openConversation}
                      onCopyIdentifier={copyIdentifier}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
      {error && contacts ? (
        <FeedbackToast variant="error" message={error} {...toastHandlers} />
      ) : null}
      {notice ? <FeedbackToast variant="success" message={notice} {...toastHandlers} /> : null}
      {createModalOpen && canManageCrmContacts ? (
        <CreateContactModal
          onClose={() => setCreateModalOpen(false)}
          onSubmit={createContact}
        />
      ) : null}
      {csvModalOpen && canManageCrmContacts ? (
        <CsvImportModal
          onClose={() => setCsvModalOpen(false)}
          onPreview={previewCsvImport}
          onConfirm={confirmCsvImport}
        />
      ) : null}
      {selectedLeadId ? (
        <CrmContactDetailDrawer
          detail={contactDetail}
          loading={loadingDetail}
          error={detailError}
          canViewHistory={canViewCrmHistory}
          onClose={() => {
            setSelectedLeadId(null);
            setContactDetail(null);
            setDetailError(null);
          }}
          statuses={statuses}
          onRefresh={() => loadContactDetail(selectedLeadId)}
          onOpenInbox={openConversationIdentity}
          onCopyReference={copyReference}
          onUpdateBasics={updateContactBasics}
          onUpdateStatus={updateContactStatus}
          onRecordOptOut={recordContactOptOut}
          onRevokeOptOut={revokeContactOptOut}
        />
      ) : null}
    </AppShell>
  );
}
