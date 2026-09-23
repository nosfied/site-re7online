import type { ConversationOperationalStatus, InboxChannel } from "@/lib/whatsappAdminApi";

export function getConversationStatusUxLabel(status: ConversationOperationalStatus | null | undefined) {
  switch (status) {
    case "WAITING":
      return "Aguardando atendimento";
    case "IN_PROGRESS":
      return "Em atendimento";
    case "WAITING_USER":
      return "Aguardando resposta do cliente";
    case "CLOSED":
      return "Encerrado";
    default:
      return "Sem andamento";
  }
}

export function getChannelUxLabel(channel: InboxChannel | string | null | undefined) {
  switch (String(channel ?? "").trim().toLowerCase()) {
    case "messenger":
      return "Messenger";
    case "instagram":
      return "Instagram";
    case "webchat":
      return "Chat do site";
    case "telegram":
      return "Telegram";
    case "support":
      return "Suporte";
    case "whatsapp":
    default:
      return "WhatsApp";
  }
}

export function getChannelFallbackContactLabel(channel: InboxChannel | string | null | undefined) {
  return `Contato ${getChannelUxLabel(channel)}`;
}

export function getAppErrorUxMessage(input: {
  status?: number;
  errorCode?: string;
  message?: string;
  fallback?: string;
}) {
  const code = input.errorCode?.trim();
  const rawMessage = input.message?.trim() ?? "";
  const normalizedMessage = rawMessage.toLowerCase();
  const inferredCode =
    code ||
    (normalizedMessage === "internal server error" || normalizedMessage === "erro no servidor (5xx)"
      ? "internal_server_error"
      : normalizedMessage.includes("window_closed")
        ? "window_closed"
        : normalizedMessage.includes("anonymized_contact")
          ? "anonymized_contact"
          : normalizedMessage.includes("reply_context_unavailable")
            ? "reply_context_unavailable"
            : normalizedMessage.includes("unsupported_media_type")
              ? "unsupported_media_type"
              : normalizedMessage.includes("template_locally_disabled")
                ? "template_locally_disabled"
                : normalizedMessage.includes("template_category_not_allowed")
                  ? "template_category_not_allowed"
                  : null);
  switch (inferredCode) {
    case "session_replaced":
      return "Sua sessão foi encerrada porque houve um novo login em outro dispositivo.";
    case "session_revoked":
      return "Sua sessão foi encerrada. Entre novamente.";
    case "session_expired":
    case "token_expired":
      return "Sua sessão expirou. Entre novamente.";
    case "support_access_expired":
      return "O acesso temporário de suporte expirou.";
    case "support_access_revoked":
      return "O acesso temporário de suporte foi encerrado.";
    case "window_closed":
      return "A janela de atendimento está fechada. Use um modelo aprovado para continuar a conversa.";
    case "user_inactive":
      return "Esta conta está inativa. Fale com um administrador para recuperar o acesso.";
    case "feature_disabled":
    case "feature_not_enabled":
      return "Este recurso não está disponível para seu perfil.";
    case "template_locally_disabled":
      return "Este modelo está inativo no Converta.";
    case "template_category_not_allowed":
      return "Categoria não habilitada para este tenant.";
    case "anonymized_contact":
      return "Este contato foi anonimizado e não pode ser usado em atendimentos ou envios.";
    case "reply_context_unavailable":
      return "A mensagem marcada não está mais disponível. Escolha outra mensagem ou envie sem marcação.";
    case "unsupported_media_type":
      return "Este tipo de arquivo não pode ser enviado por aqui.";
    case "contact_operationally_excluded":
      return "Este contato foi retirado da operação.";
    case "active_send_blocked":
      return "Este contato optou por não receber envios ativos.";
    case "invalid_phone":
      return "Informe um número de WhatsApp válido com código do país 55 e DDD.";
    case "campaign_name_conflict":
      return "Já existe uma campanha com este nome. Use outro nome para continuar.";
    case "contact_already_provisional":
      return "Este número já possui um contato associado.";
    case "crm_contact_created_read_model_unavailable":
      return "Contato cadastrado. Não foi possível atualizar a tela agora.";
    case "max_active_reached":
      return "Você atingiu o limite de atendimentos simultâneos. Encerre um atendimento antes de assumir outro.";
    case "internal_server_error":
      return "Não foi possível concluir esta ação. Tente novamente.";
  }

  if (input.status === 401) return "Sua sessão expirou. Entre novamente.";
  if (input.status === 403) return "Você não tem permissão para fazer esta ação.";
  if (input.status && input.status >= 500) return "Não foi possível concluir esta ação. Tente novamente.";
  return input.fallback || rawMessage || "Não foi possível concluir esta ação. Tente novamente.";
}

export function getMetaTemplateCategoryUxLabel(category: string | null | undefined) {
  const normalized = String(category ?? "").trim().toUpperCase();
  switch (normalized) {
    case "MARKETING":
      return "Marketing";
    case "UTILITY":
      return "Utilidade";
    case "AUTHENTICATION":
      return "Autenticação";
    case "SERVICE":
      return "Atendimento";
    default:
      return normalized || "-";
  }
}

export function getMetaTemplateStatusUxLabel(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toLowerCase();
  switch (normalized) {
    case "requested":
    case "review_started":
      return "Em análise pela Re7online";
    case "adjustment_requested":
      return "Ajustes solicitados";
    case "internal_approved":
      return "Aprovado internamente";
    case "submitted_to_meta":
      return "Enviado para a Meta";
    case "approved_meta":
    case "meta_approved":
      return "Aprovado pela Meta";
    case "rejected_meta":
    case "meta_rejected":
      return "Rejeitado pela Meta";
    case "submitting":
    case "pending":
    case "meta_pending":
      return "Em análise";
    case "approved":
      return "Aprovado";
    case "rejected":
      return "Rejeitado";
    case "failed":
      return "Falha";
    case "cancelled":
      return "Cancelado";
    case "paused":
      return "Pausado";
    case "disabled":
      return "Desativado";
    case "in_appeal":
      return "Em recurso";
    case "draft":
      return "Rascunho";
    default:
      return status?.trim() || "-";
  }
}

export function getCampaignStatusUxLabel(status: string | null | undefined) {
  switch (String(status ?? "").trim().toLowerCase()) {
    case "draft":
      return "Rascunho em revisão";
    case "scheduled":
      return "Agendada";
    case "sending":
      return "Enviando...";
    case "paused":
      return "Pausada";
    case "completed":
      return "Concluída";
    case "blocked":
      return "Bloqueada por limite";
    case "cancelled":
      return "Descartada";
    case "failed":
      return "Falha";
    default:
      return "Situação desconhecida";
  }
}

export function getBooleanUxLabel(value: boolean | null | undefined) {
  if (value === null || value === undefined) return "-";
  return value ? "Sim" : "Não";
}

export function getUserRoleUxLabel(role: string | null | undefined) {
  switch (String(role ?? "").trim().toUpperCase()) {
    case "ADMIN":
      return "Administrador";
    case "SUPERVISOR":
      return "Supervisor";
    case "AGENT":
      return "Atendente";
    case "SUPERADMIN":
      return "Administrador interno";
    default:
      return role?.trim() || "-";
  }
}

export function getSessionAuditStatusUxLabel(status: string | null | undefined) {
  switch (String(status ?? "").trim().toUpperCase()) {
    case "OPEN":
      return "Aberta";
    case "CLOSED":
      return "Encerrada";
    case "EXPIRED":
      return "Expirada";
    default:
      return status?.trim() || "-";
  }
}

export function getSessionEndReasonUxLabel(reason: string | null | undefined, fallback?: string | null) {
  switch (String(reason ?? "").trim().toLowerCase()) {
    case "logout":
      return "Saída";
    case "session_expired":
    case "expired":
      return "Sessão expirada";
    case "replaced_by_new_login":
      return "Substituída por novo acesso";
    case "session_renewed":
    case "renewal":
      return "Renovada";
    case "revoked":
    case "session_revoked":
      return "Revogada";
    case "admin_revoked":
      return "Revogada por administrador";
    case "":
      return fallback?.trim() || "Em aberto";
    default:
      return fallback?.trim() || reason?.trim() || "Em aberto";
  }
}

export function getQueueAssignmentModeUxLabel(mode: string | null | undefined) {
  switch (String(mode ?? "").trim().toLowerCase()) {
    case "round_robin":
      return "Distribuição alternada";
    case "least_active":
      return "Menor carga";
    case "manual":
    default:
      return "Manual";
  }
}

export function getQueueAssignmentScopeUxLabel(scope: string | null | undefined) {
  switch (String(scope ?? "").trim().toLowerCase()) {
    case "department":
      return "Por setor";
    case "tenant":
      return "Organização inteira";
    default:
      return scope?.trim() || "-";
  }
}

export function getConnectionStatusUxLabel(status: string | boolean | null | undefined) {
  if (typeof status === "boolean") return status ? "Ativo" : "Inativo";
  switch (String(status ?? "").trim().toLowerCase()) {
    case "active":
    case "enabled":
      return "Ativo";
    case "inactive":
    case "disabled":
      return "Inativo";
    case "connected":
      return "Conectado";
    case "configured":
      return "Configurado";
    case "disconnected":
      return "Desconectado";
    case "pending":
    case "loading":
      return "Pendente";
    case "error":
    case "failed":
      return "Com problema";
    case "ready":
    case "available":
      return "Pronto";
    case "blocked":
    case "incompatible_token_or_review_blocked":
      return "Bloqueado";
    case "missing":
      return "Pendente";
    case "unknown":
      return "Não confirmado";
    default:
      return status?.trim() || "-";
  }
}
