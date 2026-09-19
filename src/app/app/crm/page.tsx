"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppCrmContactDetailResponse,
  AppHiddenBlockingConversation,
  AppCrmContactImportConfirmResponse,
  AppCrmContactImportPreviewResponse,
  AppCrmExistingContactResolution,
  AppCrmCampaignRelationshipHistoryItem,
  AppCrmCampaignRelationshipStatus,
  AppCrmContactItem,
  AppCrmContactsResponse,
  AppSession,
  clearAppSession,
  confirmAppCrmContactCsvImport,
  createAppCrmContact,
  fetchAppCrmContactDetail,
  fetchAppCrmContacts,
  fetchAppCrmStatuses,
  excludeAppCrmContactFromOperation,
  loadAppSession,
  previewAppCrmContactCsvImport,
  reactivateAppCrmContactForOperation,
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
const PERSISTENT_CRM_NOTICES = new Set([
  "Contato excluído da operação. O histórico foi preservado.",
  "Conversa retirada da operação. O histórico foi preservado.",
  "Contato restaurado para a operação.",
]);

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

function getBlockingConversation(error: AppApiError): AppHiddenBlockingConversation | null {
  if (error.errorCode !== "hidden_active_conversation_exists" && error.errorCode !== "active_conversation_exists") return null;
  const payload = error.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const blockingConversation = (payload as { blockingConversation?: unknown }).blockingConversation;
  if (!blockingConversation || typeof blockingConversation !== "object" || Array.isArray(blockingConversation)) return null;
  const record = blockingConversation as Partial<AppHiddenBlockingConversation>;
  const conversationId = typeof record.conversationId === "string" ? record.conversationId.trim() : "";
  const conversationIdentity = typeof record.conversationIdentity === "string" ? record.conversationIdentity.trim() : "";
  if (!conversationId || !conversationIdentity) return null;
  return {
    conversationId,
    conversationIdentity,
    visibility: record.visibility === "hidden" ? "hidden" : "visible",
    status: typeof record.status === "string" ? record.status : null,
    mode: typeof record.mode === "string" ? record.mode : null,
    handoffStatus: typeof record.handoffStatus === "string" ? record.handoffStatus : null,
    departmentId: typeof record.departmentId === "string" ? record.departmentId : null,
    departmentName: typeof record.departmentName === "string" ? record.departmentName : null,
    queueId: typeof record.queueId === "string" ? record.queueId : null,
    queueName: typeof record.queueName === "string" ? record.queueName : null,
    assignedUserId: typeof record.assignedUserId === "string" ? record.assignedUserId : null,
    assignedUserName: typeof record.assignedUserName === "string" ? record.assignedUserName : null,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
  };
}

function getChannelLabel(channel: string | null) {
  return getChannelUxLabel(channel);
}

function getConversationStatusLabel(status: string | null) {
  return status ? getConversationStatusUxLabel(status as never) : "-";
}

function getCampaignRelationshipStatusLabel(status: AppCrmCampaignRelationshipStatus | null) {
  switch (status) {
    case "PENDING":
      return "Pendente";
    case "SENT":
      return "Enviada";
    case "ACCEPTED":
      return "Aceita";
    case "DELIVERED":
      return "Entregue";
    case "READ":
      return "Lida";
    case "FAILED":
      return "Falhou";
    case "BLOCKED":
      return "Bloqueada";
    case "OPT_OUT":
      return "Bloqueada por opt-out";
    case "SKIPPED":
      return "Ignorada";
    case "IDENTITY_CONFLICT":
      return "Conflito de contato";
    default:
      return "Sem campanha";
  }
}

function getCampaignRelationshipReasonLabel(reason: string | null | undefined) {
  switch (reason) {
    case "opt_out":
      return "Bloqueio por opt-out";
    case "import_blocked":
      return "Bloqueio na importação";
    case "identity_conflict":
      return "Conflito de contato";
    case "send_failed":
      return "Falha no envio";
    case "provider_failed":
      return "Falha informada pelo provedor";
    case "provider_rejected":
      return "Rejeitada pelo provedor";
    default:
      return reason || null;
  }
}

function getCampaignRelationshipBadgeClass(status: AppCrmCampaignRelationshipStatus | null) {
  switch (status) {
    case "DELIVERED":
    case "READ":
      return "border-emerald-300/30 bg-emerald-400/10 text-emerald-100";
    case "SENT":
    case "ACCEPTED":
      return "border-re7-sky/30 bg-re7-sky/10 text-re7-sky";
    case "FAILED":
    case "BLOCKED":
    case "OPT_OUT":
    case "IDENTITY_CONFLICT":
      return "border-rose-300/30 bg-rose-400/10 text-rose-100";
    case "SKIPPED":
      return "border-amber-300/30 bg-amber-400/10 text-amber-100";
    default:
      return "border-white/10 bg-white/[0.05] text-white/70";
  }
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
  return item.displayName || item.phoneDisplay || "Contato";
}

function getContactPhoneLabel(item: AppCrmContactItem) {
  return item.phoneDisplay || "Telefone não informado";
}

function canOpenOrStartConversation(item: AppCrmContactItem, canViewHistory: boolean) {
  return canViewHistory && (Boolean(item.lastConversationIdentity || item.lastConversationId) || item.canStartConversation === true);
}

function getConversationActionLabel(item: AppCrmContactItem) {
  return item.lastConversationIdentity || item.lastConversationId ? "Abrir conversa" : "Iniciar conversa";
}

function getStartBlockedLabel(reason: AppCrmContactItem["startConversationBlockedReason"]) {
  switch (reason) {
    case "contact_operationally_excluded":
      return "Contato fora da operação";
    case "contact_not_active":
      return "Contato indisponível";
    case "active_send_blocked":
      return "Envio ativo bloqueado";
    case "new_freeform_requires_model":
      return "Use um modelo aprovado";
    case "channel_unavailable":
      return "Canal indisponível";
    case "invalid_identity":
      return "Número inválido";
    default:
      return "Início indisponível";
  }
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
  variant?: "neutral" | "primary" | "destructive";
}) {
  const classes = {
    neutral: "border-[#d4c7b5] bg-white/70 text-slate-800 shadow-sm hover:bg-white",
    primary: "border-emerald-500/25 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
    destructive: "border-red-500/25 bg-red-50 text-red-900 hover:bg-red-100",
  }[variant];
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-base transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-50 max-[1366px]:h-8 max-[1366px]:w-8 max-md:h-10 max-md:w-10 ${classes}`}
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
  onDelete,
  canDelete,
}: {
  item: AppCrmContactItem;
  canViewHistory: boolean;
  onOpenDetail: (item: AppCrmContactItem) => void;
  onOpenConversation: (item: AppCrmContactItem) => void;
  onDelete: (item: AppCrmContactItem) => void;
  canDelete: boolean;
}) {
  const phoneLabel = getContactPhoneLabel(item);
  const canOpenConversation = canOpenOrStartConversation(item, canViewHistory);
  const campaign = item.campaignRelationship;
  const hasCampaign = campaign.campaignCount > 0;
  const openFromKeyboard = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpenDetail(item);
  };
  return (
    <tr
      role="button"
      tabIndex={0}
      aria-label={`Abrir cadastro de ${getDisplayName(item)}`}
      onClick={() => onOpenDetail(item)}
      onKeyDown={openFromKeyboard}
      className="cursor-pointer border-b border-white/10 align-top transition hover:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-re7-sky/60"
    >
      <td className="px-4 py-3">
        <div className="font-semibold text-white">{getDisplayName(item)}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs theme-muted">
          <span>{phoneLabel}</span>
          {item.activeOptOut ? (
            <span className="rounded-full border border-rose-300/30 bg-rose-400/10 px-2 py-0.5 text-rose-100">
              Envio ativo bloqueado
            </span>
          ) : null}
          {item.isOperationallyExcluded ? (
            <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-amber-100">
              Excluído da operação
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
      <td className="px-4 py-3">
        {hasCampaign ? (
          <div className="grid gap-1">
            <div className="text-sm font-semibold text-white">
              {formatNumber(campaign.campaignCount)} campanha(s)
            </div>
            <div className="max-w-[220px] truncate text-xs theme-muted" title={campaign.latestCampaignName ?? undefined}>
              {campaign.latestCampaignName || "Campanha sem nome"}
            </div>
            <div className="text-xs theme-muted">{formatDateTime(campaign.latestCampaignAt)}</div>
            <span
              className={`w-fit rounded-full border px-2 py-0.5 text-xs font-semibold ${getCampaignRelationshipBadgeClass(
                campaign.latestRecipientStatus
              )}`}
            >
              {getCampaignRelationshipStatusLabel(campaign.latestRecipientStatus)}
            </span>
          </div>
        ) : (
          <span className="text-sm theme-muted">Sem campanhas</span>
        )}
      </td>
      {canViewHistory ? (
        <td className="px-4 py-3">
          {canOpenConversation ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenConversation(item);
              }}
              className="text-left text-sm font-semibold text-re7-sky transition hover:brightness-125"
            >
              {item.lastProtocol || getConversationActionLabel(item)}
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
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex shrink-0 items-center justify-end gap-2 max-[1440px]:gap-1.5">
          <ActionIconButton label="Abrir contato" icon="↗" onClick={() => onOpenDetail(item)} />
          <ActionIconButton
            label="Excluir contato"
            icon="×"
            onClick={() => onDelete(item)}
            disabled={!canDelete || item.isOperationallyExcluded}
            variant="destructive"
          />
        </div>
      </td>
    </tr>
  );
}

function CampaignHistoryRow({ campaign }: { campaign: AppCrmCampaignRelationshipHistoryItem }) {
  const router = useRouter();
  const reason = getCampaignRelationshipReasonLabel(campaign.resultReason);
  return (
    <div className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 md:grid-cols-[1fr_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-white">{campaign.campaignName}</span>
          <span
            className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${getCampaignRelationshipBadgeClass(
              campaign.recipientStatus
            )}`}
          >
            {getCampaignRelationshipStatusLabel(campaign.recipientStatus)}
          </span>
        </div>
        <div className="mt-2 text-xs theme-muted">
          {formatDateTime(campaign.campaignAt)}
          {campaign.templateName ? ` • Modelo: ${campaign.templateName}` : ""}
          {campaign.deliveredAt ? ` • Entregue em ${formatDateTime(campaign.deliveredAt)}` : ""}
        </div>
        {reason ? <div className="mt-1 text-xs theme-muted">{reason}</div> : null}
      </div>
      <button
        type="button"
        onClick={() => router.push(campaign.campaignHref)}
        className="inline-flex h-9 items-center justify-center rounded-md bg-re7-sky px-3 text-xs font-semibold text-slate-950 transition hover:brightness-110"
      >
        Abrir campanha
      </button>
    </div>
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
  onOpenContactStart,
  onCopyReference,
  onUpdateBasics,
  onUpdateStatus,
  onRecordOptOut,
  onRevokeOptOut,
  onReactivateFromOperation,
  canExcludeFromOperation,
}: {
  detail: AppCrmContactDetailResponse | null;
  loading: boolean;
  error: string | null;
  canViewHistory: boolean;
  statuses: Array<{ id: string; label: string; isActive?: boolean }>;
  onClose: () => void;
  onRefresh: () => void;
  onOpenInbox: (conversationIdentity: string) => void;
  onOpenContactStart: (item: AppCrmContactItem) => void;
  onCopyReference: (value: string) => void;
  onUpdateBasics: (
    leadId: string,
    payload: { displayName: string | null; companyName: string | null; email: string | null; city: string | null }
  ) => Promise<void>;
  onUpdateStatus: (leadId: string, status: string) => Promise<void>;
  onRecordOptOut: (leadId: string) => Promise<void>;
  onRevokeOptOut: (leadId: string) => Promise<void>;
  onReactivateFromOperation: (leadId: string) => Promise<void>;
  canExcludeFromOperation: boolean;
}) {
  const item = detail?.item ?? null;
  const conversations = detail?.conversations ?? [];
  const campaignHistory = detail?.campaignRelationshipHistory?.items ?? [];
  const [editingBasics, setEditingBasics] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [campaignsExpanded, setCampaignsExpanded] = useState(false);
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
    setCampaignsExpanded(false);
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

  const reactivateFromOperation = async () => {
    if (!item) return;
    const confirmed = window.confirm("Este contato voltará a aparecer no CRM operacional e poderá ser usado conforme as regras atuais.");
    if (!confirmed) return;
    setActionLoading("reactivate");
    try {
      await onReactivateFromOperation(item.leadId);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleBasicsEditing = () => {
    if (!item) return;
    if (editingBasics) {
      setDraft({
        displayName: item.displayName || "",
        companyName: item.companyName || "",
        email: item.email || "",
        city: item.city || "",
      });
    }
    setEditingBasics((current) => !current);
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
        <button
          type="button"
          title="Fechar"
          aria-label="Fechar"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/20 text-base font-semibold text-white/75 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-re7-sky/70"
        >
          ×
        </button>
        <header className="theme-surface-strong theme-shadow border-b p-4 pr-14">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="theme-soft text-xs font-semibold uppercase tracking-[0.14em]">Cadastro CRM</p>
              <h2 className="mt-1 truncate text-lg font-bold text-white">
                {item ? getDisplayName(item) : "Carregando contato"}
              </h2>
              <p className="mt-1 text-sm theme-muted">
                {item ? item.companyName || getContactPhoneLabel(item) : "Detalhe operacional do contato"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 max-[1440px]:gap-1.5">
              <ActionIconButton label="Atualizar cadastro" icon="↺" onClick={onRefresh} disabled={loading} />
              {item ? (
                <>
                  <ActionIconButton
                    label={editingBasics ? "Cancelar edicao" : "Editar dados"}
                    icon={editingBasics ? "x" : "✎"}
                    onClick={toggleBasicsEditing}
                    disabled={actionLoading === "basics"}
                  />
                </>
              ) : null}
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
                      label="Copiar telefone"
                      icon="#"
                      onClick={() => onCopyReference(item.phoneDisplay || "")}
                      disabled={!item.phoneDisplay}
                    />
                  </div>
                }
              >
                <p className="text-sm theme-muted">Dados principais usados para atendimento e relacionamento.</p>
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
                        className="inline-flex h-9 items-center justify-center rounded-md bg-re7-sky px-3 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
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
                        className="theme-nav-link inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-semibold"
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
                  <DetailField label="Telefone" value={getContactPhoneLabel(item)} />
                  <DetailField label="Canal principal" value={getChannelLabel(item.channel)} />
                  <DetailField label="Origem" value={item.importedSource} />
                  <DetailField label="Notas registradas" value={item.notesCount} />
                  <DetailField label="Criado em" value={formatDateTime(item.createdAt)} />
                  <DetailField label="Atualizado em" value={formatDateTime(item.updatedAt)} />
                </div>
              </DetailSection>

              <DetailSection title="Preferências e ciclo de vida">
                <div className="grid gap-3">
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
                </div>
                <div className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Bloquear envio ativo</p>
                      <p className="mt-1 text-xs theme-muted">
                        ON bloqueia campanhas e modelos iniciados pela empresa. OFF libera conforme canal, telefone e regras da Meta.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={item.activeOptOut}
                      onClick={toggleOptOut}
                      disabled={Boolean(actionLoading)}
                      className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-re7-sky/60 disabled:cursor-not-allowed disabled:opacity-50 ${
                        item.activeOptOut
                          ? "border-rose-300/50 bg-rose-500/40"
                          : "border-emerald-300/45 bg-emerald-500/25"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white text-[8px] font-bold text-re7-navy transition ${
                          item.activeOptOut ? "translate-x-7" : "translate-x-1"
                        }`}
                      >
                        {item.activeOptOut ? "ON" : "OFF"}
                      </span>
                    </button>
                  </div>
                </div>
                {canExcludeFromOperation && item.isOperationallyExcluded ? (
                  <div className="grid gap-2 rounded-lg border border-emerald-300/30 bg-emerald-500/10 p-3">
                    <p className="text-sm text-emerald-100">
                      Este contato está excluído da operação. Restaure apenas se a base cadastral estiver correta.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={reactivateFromOperation}
                        disabled={Boolean(actionLoading)}
                        className="rounded-md bg-re7-sky px-3 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {actionLoading === "reactivate" ? "Restaurando..." : "Restaurar contato"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </DetailSection>

              <DetailSection title="Histórico">
                <article className="theme-list-row theme-list-row-even overflow-hidden rounded-xl border border-white/10 transition-colors">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setCampaignsExpanded((current) => !current)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setCampaignsExpanded((current) => !current);
                    }}
                    aria-expanded={campaignsExpanded}
                    aria-controls={`contact-campaign-panel-${item.leadId}`}
                    className="departments-settings-department-header grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-white/10 bg-white/[0.075] px-3 py-3 text-left transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-re7-sky/70 md:px-4"
                  >
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-white">Campanhas relacionadas</span>
                        <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs theme-muted">
                          {formatNumber(item.campaignRelationship.campaignCount)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs theme-muted">
                        {item.campaignRelationship.latestCampaignName
                          ? `${item.campaignRelationship.latestCampaignName} · ${getCampaignRelationshipStatusLabel(item.campaignRelationship.latestRecipientStatus)}`
                          : "Nenhuma campanha vinculada a este contato."}
                      </p>
                    </div>
                    <div className="expand-row-action-slot flex min-w-max shrink-0 items-center justify-end gap-3 justify-self-end whitespace-nowrap">
                      <button
                        type="button"
                        aria-expanded={campaignsExpanded}
                        aria-controls={`contact-campaign-panel-${item.leadId}`}
                        aria-label={campaignsExpanded ? "Recolher linha" : "Expandir linha"}
                        title={campaignsExpanded ? "Recolher linha" : "Expandir linha"}
                        onClick={(event) => {
                          event.stopPropagation();
                          setCampaignsExpanded((current) => !current);
                        }}
                        className={`grid h-8 w-8 place-items-center rounded-full border text-base font-semibold leading-none transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-re7-sky/70 disabled:cursor-not-allowed disabled:opacity-60 ${campaignsExpanded ? "rotate-90 border-re7-sky/50 bg-re7-sky/20 text-sky-50" : "border-white/15 text-white/70"}`}
                      >
                        ›
                      </button>
                    </div>
                  </div>
                  {campaignsExpanded ? (
                    <div
                      id={`contact-campaign-panel-${item.leadId}`}
                      className="departments-settings-department-body grid gap-2 bg-black/10 px-3 py-3 md:px-4"
                    >
                      {campaignHistory.length === 0 ? (
                        <div className="rounded-lg border border-white/10 p-4 text-sm theme-muted">
                          Nenhuma campanha vinculada a este contato.
                        </div>
                      ) : (
                        campaignHistory.map((campaign) => (
                          <CampaignHistoryRow key={`${campaign.campaignId}:${campaign.campaignAt}`} campaign={campaign} />
                        ))
                      )}
                      {detail?.campaignRelationshipHistory.pagination.hasMore ? (
                        <div className="rounded-lg border border-white/10 p-3 text-xs theme-muted">
                          Há mais registros. Abra campanhas para consultar o histórico completo.
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              </DetailSection>

              {canViewHistory ? (
                <DetailSection title="Atendimento">
                  <div className="mt-4 grid gap-2">
                    {conversations.length === 0 ? (
                      <div className="grid gap-3 rounded-lg border border-white/10 p-4 text-sm theme-muted md:grid-cols-[1fr_auto] md:items-center">
                        <span>
                          {item.canStartConversation
                            ? "Este contato ainda não possui atendimento."
                            : getStartBlockedLabel(item.startConversationBlockedReason)}
                        </span>
                        {item.canStartConversation ? (
                          <ActionIconButton
                            label="Iniciar conversa na caixa de entrada"
                            icon=">"
                            onClick={() => onOpenContactStart(item)}
                            variant="primary"
                          />
                        ) : null}
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
  onOpenExisting,
  onRestoreExisting,
  canRestoreExisting,
}: {
  onClose: () => void;
  onSubmit: (payload: { name: string | null; phone: string }) => Promise<void>;
  onOpenExisting: (match: AppCrmExistingContactResolution) => void;
  onRestoreExisting: (leadId: string) => Promise<void>;
  canRestoreExisting: boolean;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [existingContact, setExistingContact] = useState<AppCrmExistingContactResolution | null>(null);
  const phoneValid = phone.trim().length > 0;

  const submit = async () => {
    if (!phoneValid) return;
    setSubmitting(true);
    setLocalError(null);
    setExistingContact(null);
    try {
      await onSubmit({ name: name.trim() || null, phone: phone.trim() });
      onClose();
    } catch (err) {
      const typed = err as AppApiError;
      const payload = typed.payload && typeof typed.payload === "object" && !Array.isArray(typed.payload)
        ? typed.payload as { existingContact?: AppCrmExistingContactResolution | null }
        : null;
      const match = payload?.existingContact ?? null;
      if (match?.leadId) {
        setExistingContact(match);
        setLocalError(
          match.state === "excluded"
            ? "Este contato está fora da operação."
            : match.state === "provisional"
              ? "Este número já possui um contato associado."
              : "Este contato já está cadastrado."
        );
      } else {
        setLocalError(normalizeAppErrorMessage(typed, "Não foi possível salvar o contato."));
      }
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
            <div className="grid gap-3 rounded-lg border border-rose-300/30 bg-rose-400/10 p-3 text-sm text-rose-100">
              <p>{localError}</p>
              {existingContact?.leadId ? (
                <div className="flex flex-wrap gap-2">
                  {existingContact.state === "excluded" && canRestoreExisting ? (
                    <button
                      type="button"
                      onClick={async () => {
                        setSubmitting(true);
                        try {
                          await onRestoreExisting(existingContact.leadId as string);
                          onClose();
                        } finally {
                          setSubmitting(false);
                        }
                      }}
                      disabled={submitting}
                      className="rounded-md bg-re7-sky px-3 py-2 text-xs font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submitting ? "Restaurando..." : "Restaurar contato"}
                    </button>
                  ) : null}
                  {existingContact.state === "active" || (existingContact.state === "excluded" && canRestoreExisting) ? (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenExisting(existingContact);
                        onClose();
                      }}
                      className="theme-nav-link rounded-md border px-3 py-2 text-xs font-semibold"
                    >
                      Ver contato
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
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
	  onPreview: (payload: { csvText: string; mapping: { phoneColumn: string | null; nameColumn: string | null; crmSituationColumn: string | null } }) => Promise<AppCrmContactImportPreviewResponse>;
	  onConfirm: (payload: { csvText: string; mapping: { phoneColumn: string | null; nameColumn: string | null; crmSituationColumn: string | null } }) => Promise<AppCrmContactImportConfirmResponse>;
	}) {
	  const [csvText, setCsvText] = useState("");
	  const [phoneColumn, setPhoneColumn] = useState("");
	  const [nameColumn, setNameColumn] = useState("");
	  const [crmSituationColumn, setCrmSituationColumn] = useState("");
  const [preview, setPreview] = useState<AppCrmContactImportPreviewResponse | null>(null);
  const [summary, setSummary] = useState<AppCrmContactImportConfirmResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
	  const previewRequestSeq = useRef(0);
	  const headers = preview?.headers ?? [];
	  const mapping = { phoneColumn: phoneColumn || null, nameColumn: nameColumn || null, crmSituationColumn: crmSituationColumn || null };
	  const loading = previewLoading || importLoading;

  const readFile = async (file: File | null) => {
    if (!file) return;
    setPreview(null);
    setSummary(null);
    setLocalError(null);
    setCsvText(await file.text());
  };

  const runPreview = async () => {
    if (!csvText.trim()) return;
    const requestSeq = previewRequestSeq.current + 1;
    previewRequestSeq.current = requestSeq;
    setPreviewLoading(true);
    setLocalError(null);
    setSummary(null);
    try {
      const response = await onPreview({ csvText, mapping });
      if (requestSeq !== previewRequestSeq.current) return;
      setPreview(response);
      if (!phoneColumn && response.headers.length > 0) {
        const guessed = response.headers.find((header) => /^(numero|número|telefone|phone|whatsapp)$/i.test(header.trim()));
        if (guessed) setPhoneColumn(guessed);
      }
	      if (!nameColumn && response.headers.length > 0) {
	        const guessed = response.headers.find((header) => /^(nome|name)$/i.test(header.trim()));
	        if (guessed) setNameColumn(guessed);
	      }
	      if (!crmSituationColumn && response.headers.length > 0) {
	        const guessed = response.headers.find((header) =>
	          /^(situa[cç][aã]o no crm|situa[cç][aã]o crm|status crm|crm status)$/i.test(header.trim())
	        );
	        if (guessed) setCrmSituationColumn(guessed);
	      }
    } catch (err) {
      if (requestSeq !== previewRequestSeq.current) return;
      const typed = err as AppApiError;
      setLocalError(normalizeAppErrorMessage(typed, "Não foi possível pré-visualizar o CSV."));
    } finally {
      if (requestSeq === previewRequestSeq.current) setPreviewLoading(false);
    }
  };

  const runConfirm = async () => {
    if (!csvText.trim() || !preview) return;
    setImportLoading(true);
    setLocalError(null);
    try {
      const response = await onConfirm({ csvText, mapping });
      setSummary(response);
    } catch (err) {
      const typed = err as AppApiError;
      setLocalError(normalizeAppErrorMessage(typed, "Não foi possível importar o CSV."));
    } finally {
      setImportLoading(false);
    }
  };

  const errorRows = summary?.errors ?? preview?.sampleErrors ?? [];
	  const reportLines = errorRows.map((error) => [
	    `Linha ${error.rowNumber}`,
	    error.inputPhone ? `Entrada: ${error.inputPhone}` : null,
	    error.normalizedPhoneDisplay ? `Normalizado: ${error.normalizedPhoneDisplay}` : null,
	    error.crmSituationInput ? `Situação CRM: ${error.crmSituationInput}` : null,
	    error.code ?? error.reason,
	    error.label,
	  ].filter(Boolean).join(" | "));

  const copyErrorReport = async () => {
    if (reportLines.length === 0) return;
    try {
      await navigator.clipboard.writeText(reportLines.join("\n"));
    } catch {
      setLocalError("Não foi possível copiar o relatório.");
    }
  };

  const downloadErrorReport = () => {
    if (errorRows.length === 0) return;
	    const header = "linha,entrada,normalizado,situacao_crm,codigo,motivo";
    const csvEscape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const body = errorRows.map((error) => [
      error.rowNumber,
	      error.inputPhone ?? "",
	      error.normalizedPhoneDisplay ?? "",
	      error.crmSituationInput ?? "",
	      error.code ?? error.reason,
	      error.label,
	    ].map(csvEscape).join(","));
    const blob = new Blob([[header, ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "relatorio-importacao-contatos.csv";
    link.click();
    URL.revokeObjectURL(url);
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
	                <div className="grid gap-3 sm:grid-cols-3">
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
	                  <label className="grid gap-1.5 text-sm">
	                    <span className="theme-soft text-[11px] font-semibold uppercase tracking-[0.12em]">Situação no CRM</span>
	                    <select value={crmSituationColumn} onChange={(event) => setCrmSituationColumn(event.target.value)} className="theme-input h-10 rounded-md border px-3 text-sm">
	                      <option value="">Preservar/default</option>
	                      {headers.map((header) => <option key={header} value={header}>{header}</option>)}
	                    </select>
	                  </label>
	                </div>
	                <div className="grid gap-2 text-sm theme-muted sm:grid-cols-3">
	                  <DetailField label="Linhas" value={preview.totalRows} />
	                  <DetailField label="Prontas" value={preview.readyToImport} />
	                  <DetailField label="Já cadastradas" value={preview.existingContacts} />
	                  <DetailField label="Inválidas" value={preview.invalidRows} />
	                  <DetailField label="Status inválido" value={preview.invalidCrmStatuses ?? 0} />
	                  <DetailField label="Duplicadas" value={preview.duplicatesInFile} />
	                  <DetailField label="Novos" value={preview.created ?? 0} />
	                  <DetailField label="Atualizações" value={preview.updated ?? 0} />
	                  <DetailField label="Sem alteração" value={preview.unchanged ?? 0} />
	                  <DetailField label="Excluídas" value={preview.excludedContacts ?? 0} />
	                  <DetailField label="Já associadas" value={preview.provisionalContacts ?? 0} />
	                  <DetailField label="Conflitos" value={preview.identityConflicts ?? 0} />
	                  <DetailField label="Delimitador" value={preview.delimiter} />
	                </div>
	                {preview.rows?.length ? (
	                  <div className="overflow-x-auto rounded-lg border border-white/10">
	                    <table className="min-w-[760px] w-full text-left text-xs">
	                      <thead className="bg-white/10 text-white">
	                        <tr>
	                          <th className="px-3 py-2">Linha</th>
	                          <th className="px-3 py-2">Nome</th>
	                          <th className="px-3 py-2">Telefone</th>
	                          <th className="px-3 py-2">Situação no CRM</th>
	                          <th className="px-3 py-2">Operação</th>
	                        </tr>
	                      </thead>
	                      <tbody>
	                        {preview.rows.slice(0, 8).map((row) => (
	                          <tr key={`${row.rowNumber}:${row.normalizedPhone}`} className="border-t border-white/10">
	                            <td className="px-3 py-2">{row.rowNumber}</td>
	                            <td className="px-3 py-2 text-white">{row.name || "-"}</td>
	                            <td className="px-3 py-2">{row.phoneDisplay ?? row.normalizedPhone}</td>
	                            <td className="px-3 py-2">
	                              {row.crmSituation.label ?? row.crmSituation.input ?? row.crmSituation.previousLabel ?? "-"}
	                            </td>
	                            <td className="px-3 py-2">{row.operation}</td>
	                          </tr>
	                        ))}
	                      </tbody>
	                    </table>
	                  </div>
	                ) : null}
                {preview.sampleErrors.length > 0 ? (
                  <div className="grid gap-3 rounded-lg border border-amber-300/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">Erros da prévia</span>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={copyErrorReport} className="rounded-md border border-amber-100/30 px-2 py-1 text-xs font-semibold">
                          Copiar
                        </button>
                        <button type="button" onClick={downloadErrorReport} className="rounded-md border border-amber-100/30 px-2 py-1 text-xs font-semibold">
                          Baixar CSV
                        </button>
                      </div>
                    </div>
                    {preview.sampleErrors.slice(0, 5).map((error) => (
                      <div key={`${error.rowNumber}:${error.reason}`}>
	                        Linha {error.rowNumber}: {error.code ?? error.reason} · {error.label}
	                        {error.inputPhone ? ` · Entrada: ${error.inputPhone}` : ""}
	                        {error.normalizedPhoneDisplay ? ` · Normalizado: ${error.normalizedPhoneDisplay}` : ""}
	                        {error.crmSituationInput ? ` · Situação CRM: ${error.crmSituationInput}` : ""}
	                      </div>
                    ))}
                    {preview.truncatedErrors ? <div>Há mais erros no arquivo.</div> : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {summary ? (
              <div className="grid gap-3 rounded-lg border border-emerald-300/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">
                <div className="font-semibold">Relatório da importação</div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <DetailField label="Linhas" value={summary.received} />
	                  <DetailField label="Criados" value={summary.created} />
	                  <DetailField label="Atualizados" value={summary.updated} />
	                  <DetailField label="Sem alteração" value={summary.unchanged ?? 0} />
	                  <DetailField label="Prontos" value={summary.readyToImport} />
	                  <DetailField label="Ignorados" value={summary.skipped ?? summary.duplicates} />
	                  <DetailField label="Falhas" value={(summary.failed ?? 0) + summary.invalid + (summary.invalidCrmStatuses ?? 0)} />
                </div>
                <div className="text-xs text-emerald-50/80">
	                  Duplicados: {summary.duplicates} · Status inválido: {summary.invalidCrmStatuses ?? 0} · Fora da operação: {summary.excludedContacts ?? 0} · Já associados: {summary.provisionalContacts ?? 0} · Conflitos: {summary.identityConflicts ?? 0}
                </div>
                {summary.errors?.length ? (
                  <div className="grid gap-2 rounded-md border border-emerald-100/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">Erros detalhados</span>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={copyErrorReport} className="rounded-md border border-emerald-100/30 px-2 py-1 text-xs font-semibold">
                          Copiar
                        </button>
                        <button type="button" onClick={downloadErrorReport} className="rounded-md border border-emerald-100/30 px-2 py-1 text-xs font-semibold">
                          Baixar CSV
                        </button>
                      </div>
                    </div>
                    {summary.errors.slice(0, 8).map((error) => (
                      <div key={`${error.rowNumber}:${error.reason}:${error.inputPhone ?? ""}`} className="text-xs">
	                        Linha {error.rowNumber} | {error.inputPhone ?? "-"} | {error.normalizedPhoneDisplay ?? "-"} | {error.crmSituationInput ?? "-"} | {error.code ?? error.reason} | {error.label}
                      </div>
                    ))}
                    {summary.truncatedErrors ? <div className="text-xs">Há mais erros no arquivo.</div> : null}
                  </div>
                ) : null}
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
                disabled={!csvText.trim() || previewLoading || importLoading}
                className="theme-nav-link rounded-md border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {previewLoading ? "Gerando prévia..." : "Pré-visualizar"}
              </button>
              <button
                type="button"
                onClick={runConfirm}
                disabled={!preview || previewLoading || importLoading || preview.readyToImport === 0}
                className="rounded-md bg-re7-sky px-4 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importLoading ? "Importando..." : "Confirmar importação"}
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
  const [operationalStatus, setOperationalStatus] = useState<"active" | "excluded">("active");
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
  const noticeIsPersistent = Boolean(notice && PERSISTENT_CRM_NOTICES.has(notice));
  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || (notice && !noticeIsPersistent)), () => {
    setError(null);
    setNotice(null);
  });
  const canViewCrmHistory = String(session?.user.role ?? "").trim().toUpperCase() !== "AGENT";
  const canManageCrmContacts = canViewCrmHistory;
  const canExcludeCrmContacts = String(session?.user.role ?? "").trim().toUpperCase() === "ADMIN";

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
      operationalStatus: canExcludeCrmContacts ? operationalStatus : "active",
      page: targetPage,
      limit: PAGE_LIMIT,
    }),
    [canExcludeCrmContacts, canViewCrmHistory, channel, hasConversation, operationalStatus, optOut, page, q, status]
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
    setOperationalStatus("active");
    setPage(1);
    if (!session) return;
    setLoading(true);
    setError(null);
    fetchAppCrmContacts(session, { page: 1, limit: PAGE_LIMIT, operationalStatus: "active" })
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
    (leadId: string, overrideOperationalStatus?: "active" | "excluded") => {
      if (!session) return;
      setLoadingDetail(true);
      setDetailError(null);
      const detailOperationalStatus = overrideOperationalStatus ?? (canExcludeCrmContacts ? operationalStatus : "active");
      fetchAppCrmContactDetail(session, leadId, { operationalStatus: detailOperationalStatus })
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
    [canExcludeCrmContacts, handleUnauthorized, operationalStatus, session]
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
      if (!conversationIdentity) {
        if (item.canStartConversation === true) {
          router.push(`/app/inbox?crmContact=${encodeURIComponent(item.leadId)}`);
        }
        return;
      }
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

  const excludeContactFromOperation = useCallback(
    async (leadId: string) => {
      if (!session) return null;
      try {
        await excludeAppCrmContactFromOperation(session, leadId);
        setContactDetail(null);
        setSelectedLeadId(null);
        setNotice("Contato excluído da operação. O histórico foi preservado.");
        setOperationalStatus("active");
        await loadContacts(session, page);
        return null;
      } catch (err) {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return null;
        }
        const blockingConversation = getBlockingConversation(typed);
        if (blockingConversation) {
          const message =
            blockingConversation.visibility === "hidden"
              ? "Existe uma conversa pendente associada a este contato que precisa ser retirada da operação antes da exclusão."
              : "Este contato possui uma conversa em andamento. Resolva a conversa antes de excluir o contato da operação.";
          setError(message);
          return blockingConversation;
        }
        setError(normalizeAppErrorMessage(typed, "Não foi possível excluir o contato da operação."));
        return null;
      }
    },
    [handleUnauthorized, loadContacts, page, session]
  );

  const requestContactExclusion = useCallback(
    async (item: AppCrmContactItem) => {
      if (!canExcludeCrmContacts || item.isOperationallyExcluded) return;
      const confirmed = window.confirm(
        "Este contato deixará de aparecer no CRM e não poderá ser usado em novos atendimentos ou campanhas. O histórico existente será preservado."
      );
      if (!confirmed) return;
      const blockingConversation = await excludeContactFromOperation(item.leadId);
      if (blockingConversation) {
        return;
      }
    },
    [canExcludeCrmContacts, excludeContactFromOperation]
  );

  const reactivateContactFromOperation = useCallback(
    async (leadId: string) => {
      if (!session) return;
      await mutateContactDetail(
        () => reactivateAppCrmContactForOperation(session, leadId),
        "Contato restaurado para a operação.",
        "Não foi possível restaurar o contato."
      );
      await loadContacts(session, page);
    },
    [loadContacts, mutateContactDetail, page, session]
  );

  const createContact = useCallback(
    async (payload: { name: string | null; phone: string }) => {
      if (!session) return;
      try {
        const response = await createAppCrmContact(session, payload);
        replaceContactFromDetail(response);
        setSelectedLeadId(response.item.leadId);
        setNotice(
          response.createStatus === "existing_active"
            ? "Este contato já está cadastrado."
            : response.item.displayName
              ? "Contato salvo."
              : "Contato salvo sem nome."
        );
        try {
          await loadContacts(session, 1);
        } catch (err) {
          const typed = err as AppApiError;
          console.warn("crm.contact_create.refresh_failed", {
            status: typed.status,
            errorCode: typed.errorCode,
          });
          setError("Contato cadastrado. Não foi possível atualizar a tela agora.");
        }
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
	    async (payload: { csvText: string; mapping: { phoneColumn: string | null; nameColumn: string | null; crmSituationColumn: string | null } }) => {
	      if (!session) throw new Error("Sessão indisponível.");
	      return previewAppCrmContactCsvImport(session, payload);
	    },
    [session]
  );

	  const confirmCsvImport = useCallback(
	    async (payload: { csvText: string; mapping: { phoneColumn: string | null; nameColumn: string | null; crmSituationColumn: string | null } }) => {
	      if (!session) throw new Error("Sessão indisponível.");
	      const response = await confirmAppCrmContactCsvImport(session, payload);
	      setNotice(`Importação concluída: ${response.created} criado(s), ${response.updated} atualizado(s), ${response.unchanged ?? 0} sem alteração.`);
      setPage(1);
      await loadContacts(session, 1);
      return response;
    },
    [loadContacts, session]
  );

  const copyReference = useCallback(async (value: string) => {
    if (!value) {
      setError("Este contato não possui telefone para copiar.");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Telefone copiado.");
    } catch {
      setError("Não foi possível copiar o telefone.");
    }
  }, []);

  const emptyWithFilters = useMemo(
    () => Boolean(q || status || channel || (canViewCrmHistory && hasConversation) || optOut || operationalStatus !== "active"),
    [canViewCrmHistory, channel, hasConversation, operationalStatus, optOut, q, status]
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
                  ? canExcludeCrmContacts
                    ? "lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr_auto_auto]"
                    : "lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto_auto]"
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
              {canExcludeCrmContacts ? (
                <label className="grid gap-1.5 text-sm">
                  <span className="theme-soft text-xs font-semibold uppercase tracking-[0.14em]">Operação</span>
                  <select
                    value={operationalStatus}
                    onChange={(event) => setOperationalStatus(event.target.value === "excluded" ? "excluded" : "active")}
                    className="theme-input h-10 rounded-md border px-3 text-sm"
                  >
                    <option value="active">Ativos</option>
                    <option value="excluded">Excluídos</option>
                  </select>
                </label>
              ) : null}
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
              <table className={`${canViewCrmHistory ? "min-w-[1280px]" : "min-w-[1080px]"} w-full text-left text-sm`}>
                <thead className="border-b border-white/10 bg-white/[0.04] text-xs uppercase tracking-[0.12em] theme-soft">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Contato</th>
                    <th className="px-4 py-3 font-semibold">Empresa</th>
                    <th className="px-4 py-3 font-semibold">Canal</th>
                    <th className="px-4 py-3 font-semibold">Situação</th>
                    <th className="px-4 py-3 font-semibold">Campanhas</th>
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
                      onDelete={requestContactExclusion}
                      canDelete={canExcludeCrmContacts}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
      {error && contacts ? (
        <FeedbackToast variant="error" message={error} {...toastHandlers} onClose={() => setError(null)} />
      ) : null}
      {notice ? (
        <FeedbackToast
          variant="success"
          message={notice}
          {...(noticeIsPersistent ? {} : toastHandlers)}
          onClose={noticeIsPersistent ? () => setNotice(null) : undefined}
        />
      ) : null}
      {createModalOpen && canManageCrmContacts ? (
        <CreateContactModal
          onClose={() => setCreateModalOpen(false)}
          onSubmit={createContact}
          onOpenExisting={(match) => {
            if (!match.leadId) return;
            const operationalStatusForDetail = match.state === "excluded" ? "excluded" : "active";
            setSelectedLeadId(match.leadId);
            setContactDetail(null);
            loadContactDetail(match.leadId, operationalStatusForDetail);
          }}
          onRestoreExisting={reactivateContactFromOperation}
          canRestoreExisting={canExcludeCrmContacts}
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
          onOpenContactStart={openConversation}
          onCopyReference={copyReference}
          onUpdateBasics={updateContactBasics}
          onUpdateStatus={updateContactStatus}
          onRecordOptOut={recordContactOptOut}
          onRevokeOptOut={revokeContactOptOut}
          onReactivateFromOperation={reactivateContactFromOperation}
          canExcludeFromOperation={canExcludeCrmContacts}
        />
      ) : null}
    </AppShell>
  );
}
