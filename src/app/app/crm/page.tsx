"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppCrmContactDetailResponse,
  AppCrmContactItem,
  AppCrmContactsResponse,
  AppSession,
  clearAppSession,
  fetchAppCrmContactDetail,
  fetchAppCrmContacts,
  fetchAppCrmStatuses,
  loadAppSession,
  recordAppCrmContactOptOut,
  revokeAppCrmContactOptOut,
  saveAppSession,
  updateAppCrmContactBasics,
  updateAppCrmContactStatus,
} from "@/lib/appClientApi";
import { hasCapability } from "@/lib/appFeatures";

const PAGE_LIMIT = 50;

const CHANNEL_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "messenger", label: "Messenger" },
  { value: "webchat", label: "Webchat" },
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
  if (error.status === 401) return "Sessao expirada. Faca login novamente.";
  if (error.status === 403) return "CRM indisponivel para este usuario ou tenant.";
  return error.message || fallback;
}

function getChannelLabel(channel: string | null) {
  switch ((channel ?? "").toLowerCase()) {
    case "whatsapp":
      return "WhatsApp";
    case "instagram":
      return "Instagram";
    case "messenger":
      return "Messenger";
    case "webchat":
      return "Webchat";
    case "telegram":
      return "Telegram";
    default:
      return channel || "Canal";
  }
}

function getConversationStatusLabel(status: string | null) {
  switch (status) {
    case "WAITING":
      return "Aguardando atendimento";
    case "IN_PROGRESS":
      return "Em atendimento";
    case "WAITING_USER":
      return "Aguardando cliente";
    case "CLOSED":
      return "Fechado";
    default:
      return status || "-";
  }
}

function getTemplateHint(item: AppCrmContactItem) {
  if (item.canStartWhatsappTemplateCandidate) return "Elegivel para template futuro";
  switch (item.templateSendBlockedReason) {
    case "not_whatsapp":
      return "Canal sem inicio ativo";
    case "missing_phone":
      return "Sem telefone valido";
    case "opt_out":
      return "Descadastrado";
    case "unsupported_channel":
      return "Canal nao suportado";
    default:
      return "Indisponivel";
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
  onOpenDetail,
  onOpenConversation,
  onCopyIdentifier,
}: {
  item: AppCrmContactItem;
  onOpenDetail: (item: AppCrmContactItem) => void;
  onOpenConversation: (item: AppCrmContactItem) => void;
  onCopyIdentifier: (item: AppCrmContactItem) => void;
}) {
  const identifier = item.phoneDisplay || item.identifierDisplay;
  const canOpenConversation = Boolean(item.lastConversationIdentity || item.lastConversationId);
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
        <div className="mt-2 text-xs theme-muted">{item.provider || "-"}</div>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm font-semibold text-white">{item.crmStatusLabel}</div>
        <div className="mt-1 text-xs theme-muted">{item.crmStatus}</div>
      </td>
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
          {item.conversationsCount ? `${item.conversationsCount} conversa(s)` : "Nenhum historico"}
        </div>
      </td>
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
          <ActionIconButton label="Copiar referencia" icon="#" onClick={() => onCopyIdentifier(item)} />
          <ActionIconButton
            label="Abrir conversa no Inbox"
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
      ? "Esta acao permitira novamente campanhas e templates aprovados para este contato, conforme as regras do canal e da Meta."
      : "Esta acao bloqueara campanhas e templates iniciados pela empresa para este contato. O atendimento receptivo continuara permitido.";
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
              <h3 className="text-base font-semibold text-white">Nao foi possivel carregar o cadastro</h3>
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
                      label="Copiar referencia"
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
                      {emailDraftInvalid ? <span className="text-xs text-amber-200">Informe um e-mail valido.</span> : null}
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
                  <DetailField label="Provider" value={item.provider} />
                  <DetailField label="Classificacao CRM" value={item.crmStatusLabel} />
                  <DetailField label="Codigo CRM" value={item.crmStatus} />
                  <DetailField label="Lead status" value={item.leadStatus} />
                  <DetailField label="Bloqueio de envio ativo" value={item.activeOptOut ? "Ativo" : "Inativo"} />
                  <DetailField label="Origem/importacao" value={item.importedSource} />
                  <DetailField label="Notas registradas" value={item.notesCount} />
                  <DetailField label="Elegibilidade template" value={getTemplateHint(item)} />
                  <DetailField label="Criado em" value={formatDateTime(item.createdAt)} />
                  <DetailField label="Atualizado em" value={formatDateTime(item.updatedAt)} />
                  <DetailField label="Lead ID" value={item.leadId} />
                  <DetailField label="Contact ID" value={item.contactId} />
                </div>
              </DetailSection>

              <DetailSection title="Preferencias e ciclo de vida">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <label className="grid gap-1.5 text-sm">
                    <span className="theme-soft text-[11px] font-semibold uppercase tracking-[0.12em]">Classificacao CRM</span>
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
                    Impede campanhas e envio de templates iniciados pela empresa. O contato ainda podera enviar mensagens e ser atendido normalmente.
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

              <DetailSection title="Conversas relacionadas">
                <p className="mt-1 text-sm theme-muted">
                  Abertura usa a identidade operacional esperada pelo Inbox, sempre no tenant da sessao.
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
                            {conversation.assignedUserName ? ` • ${conversation.assignedUserName}` : ""}
                          </div>
                          <div className="mt-1 text-xs theme-muted">
                            Atualizada em {formatDateTime(conversation.updatedAt)}
                          </div>
                        </div>
                        <ActionIconButton
                          label="Abrir conversa no Inbox"
                          icon=">"
                          onClick={() => onOpenInbox(conversation.conversationIdentity)}
                          variant="primary"
                        />
                      </div>
                    ))
                  )}
                </div>
              </DetailSection>
            </div>
          ) : null}
        </div>
      </aside>
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
  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || notice), () => {
    setError(null);
    setNotice(null);
  });

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
      hasConversation: hasConversation === "" ? null : hasConversation === "true",
      optOut: optOut === "" ? null : optOut === "true",
      page: targetPage,
      limit: PAGE_LIMIT,
    }),
    [channel, hasConversation, optOut, page, q, status]
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
      setError("CRM indisponivel para este tenant.");
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
        setError(normalizeAppErrorMessage(typed, "Nao foi possivel carregar contatos CRM."));
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
        setError(normalizeAppErrorMessage(typed, "Nao foi possivel aplicar filtros."));
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
        setError(normalizeAppErrorMessage(typed, "Nao foi possivel limpar filtros."));
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
          setError(normalizeAppErrorMessage(typed, "Nao foi possivel carregar a pagina."));
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
          setDetailError(normalizeAppErrorMessage(typed, "Nao foi possivel carregar o cadastro."));
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
            ? "A classificacao selecionada nao esta ativa em Config. CRM."
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
        "Nao foi possivel atualizar o cadastro."
      );
    },
    [mutateContactDetail, session]
  );

  const updateContactStatus = useCallback(
    async (leadId: string, nextStatus: string) => {
      if (!session) return;
      await mutateContactDetail(
        () => updateAppCrmContactStatus(session, leadId, nextStatus),
        "Classificacao atualizada.",
        "Nao foi possivel atualizar a classificacao."
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
        "Nao foi possivel bloquear envio ativo."
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
        "Nao foi possivel liberar envio ativo."
      );
    },
    [mutateContactDetail, session]
  );

  const copyIdentifier = useCallback(async (item: AppCrmContactItem) => {
    const value = item.phoneDisplay || item.identifierDisplay;
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Referencia segura copiada.");
    } catch {
      setError("Nao foi possivel copiar a referencia.");
    }
  }, []);

  const copyReference = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Referencia segura copiada.");
    } catch {
      setError("Nao foi possivel copiar a referencia.");
    }
  }, []);

  const emptyWithFilters = useMemo(
    () => Boolean(q || status || channel || hasConversation || optOut),
    [channel, hasConversation, optOut, q, status]
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
      subtitle="Lista operacional de contatos e leads CRM por tenant."
      titleSurface="strong"
    >
      <section className="grid min-h-0 gap-4">
        <div className="sticky top-[242px] z-30 grid gap-2 sm:top-[256px] lg:fixed lg:left-5 lg:right-5 lg:top-[156px] lg:mx-auto lg:w-[calc(100%-2.5rem)] lg:max-w-[1400px] min-[1441px]:top-[210px]">
          <div className="theme-surface-strong theme-shadow rounded-xl border p-4 backdrop-blur">
            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto_auto] lg:items-end">
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
              {contacts ? (
                <span>
                  Pagina {contacts.pagination.page} de {Math.max(contacts.pagination.totalPages, 1)}
                </span>
              ) : null}
            </div>
            {contacts ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goToPage(1)}
                  disabled={!contacts.pagination.hasPreviousPage || loading}
                  title="Primeira pagina"
                  aria-label="Primeira pagina"
                  className="theme-nav-link inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {"<<"}
                </button>
                <button
                  type="button"
                  onClick={() => goToPage(page - 1)}
                  disabled={!contacts.pagination.hasPreviousPage || loading}
                  title="Pagina anterior"
                  aria-label="Pagina anterior"
                  className="theme-nav-link inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {"<"}
                </button>
                <span className="text-xs theme-muted">
                  {formatNumber(contacts.items.length)} nesta pagina
                </span>
                <button
                  type="button"
                  onClick={() => goToPage(page + 1)}
                  disabled={!contacts.pagination.hasNextPage || loading}
                  title="Proxima pagina"
                  aria-label="Proxima pagina"
                  className="theme-nav-link inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {">"}
                </button>
                <button
                  type="button"
                  onClick={() => goToPage(Math.max(contacts.pagination.totalPages, 1))}
                  disabled={!contacts.pagination.hasNextPage || loading}
                  title="Ultima pagina"
                  aria-label="Ultima pagina"
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
            <h2 className="text-base font-semibold text-white">CRM indisponivel</h2>
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
              {emptyWithFilters ? "Nenhum contato encontrado" : "Nenhum contato CRM cadastrado"}
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm theme-muted">
              {emptyWithFilters
                ? "Revise os filtros aplicados ou limpe a busca para ver toda a base disponivel."
                : "Quando leads ou contatos forem criados pelo atendimento, importacao ou canais, eles aparecerao aqui."}
            </p>
          </div>
        ) : contacts ? (
          <div className="theme-surface overflow-hidden rounded-xl border shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-[1120px] w-full text-left text-sm">
                <thead className="border-b border-white/10 bg-white/[0.04] text-xs uppercase tracking-[0.12em] theme-soft">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Contato</th>
                    <th className="px-4 py-3 font-semibold">Empresa</th>
                    <th className="px-4 py-3 font-semibold">Canal</th>
                    <th className="px-4 py-3 font-semibold">Situacao</th>
                    <th className="px-4 py-3 font-semibold">Ultima conversa</th>
                    <th className="px-4 py-3 font-semibold">Atualizacao</th>
                    <th className="px-4 py-3 text-right font-semibold">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.items.map((item) => (
                    <CrmContactRow
                      key={item.leadId}
                      item={item}
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
      {selectedLeadId ? (
        <CrmContactDetailDrawer
          detail={contactDetail}
          loading={loadingDetail}
          error={detailError}
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
