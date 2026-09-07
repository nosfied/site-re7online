const AI_MISSING_LABELS: Record<string, string> = {
  aiBusinessContext: "Contexto do negócio",
  aiAssistantAllowedTopics: "Assuntos que a IA pode atender",
  aiAssistantFallbackMessage: "Mensagem quando a IA não puder responder",
  aiAssistantHandoffPrompt: "Mensagem para encaminhamento ao atendimento humano",
};

export function getAppChatbotAiMissingLabels(missing: string[] | null | undefined) {
  return (missing ?? []).map((key) => AI_MISSING_LABELS[key] ?? "Configuração adicional da IA");
}
