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
                : null);
  switch (inferredCode) {
    case "session_replaced":
      return "Sua sessão foi encerrada porque houve um novo login em outro dispositivo.";
    case "session_revoked":
      return "Sua sessão foi encerrada. Entre novamente.";
    case "session_expired":
    case "token_expired":
      return "Sua sessão expirou. Entre novamente.";
    case "window_closed":
      return "A janela de atendimento está fechada. Use um modelo aprovado para continuar a conversa.";
    case "feature_disabled":
    case "feature_not_enabled":
      return "Este recurso não está disponível para seu perfil.";
    case "template_locally_disabled":
      return "Este modelo está inativo no Converta.";
    case "anonymized_contact":
      return "Este contato foi anonimizado e não pode ser usado em atendimentos ou envios.";
    case "reply_context_unavailable":
      return "A mensagem marcada não está mais disponível. Escolha outra mensagem ou envie sem marcação.";
    case "unsupported_media_type":
      return "Este tipo de arquivo não pode ser enviado por aqui.";
    case "internal_server_error":
      return "Não foi possível concluir esta ação. Tente novamente.";
  }

  if (input.status === 401) return "Sua sessão expirou. Entre novamente.";
  if (input.status === 403) return "Você não tem permissão para fazer esta ação.";
  if (input.status && input.status >= 500) return "Não foi possível concluir esta ação. Tente novamente.";
  return rawMessage || input.fallback || "Não foi possível concluir esta ação. Tente novamente.";
}
