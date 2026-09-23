import type { CampaignItem } from "@/lib/whatsappAdminApi";

export function getFriendlyCampaignError(error: string | null) {
  if (!error) return null;

  const normalizedCode = error.trim().toLowerCase();
  const knownReasonLabels: Record<string, string> = {
    blocked: "Bloqueado para envio",
    opt_out: "Contato bloqueado para envios ativos",
    "opt-out": "Contato bloqueado para envios ativos",
    active_send_blocked: "Contato bloqueado para envios ativos",
    contact_operationally_excluded: "Contato excluído da operação",
    invalid_identity: "Número/identidade inválida para envio",
    blocked_identity: "Número/identidade inválida para envio",
    usage_blocked: "Bloqueado por limite de uso",
    missing_contact: "Contato atual não localizado",
    duplicate_identity: "Identidade duplicada no público",
    variable_missing_value: "Variável obrigatória sem valor",
  };
  if (knownReasonLabels[normalizedCode]) {
    return {
      summary: knownReasonLabels[normalizedCode],
      detail: null,
      raw: error,
    };
  }

  const parseJson = (input: string) => {
    try {
      return JSON.parse(input) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const parsed = parseJson(error);
  const parsedArrayItem =
    Array.isArray(parsed) && parsed.length > 0 && parsed[0] && typeof parsed[0] === "object"
      ? (parsed[0] as Record<string, unknown>)
      : null;
  const parsedObject =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  const errorNode =
    parsedObject && typeof parsedObject.error === "object" && parsedObject.error && !Array.isArray(parsedObject.error)
      ? (parsedObject.error as Record<string, unknown>)
      : parsedArrayItem;
  const code = typeof errorNode?.code === "number" ? errorNode.code : null;
  const message = typeof errorNode?.message === "string" ? errorNode.message : null;
  const errorData = errorNode && typeof errorNode.error_data === "object" && errorNode.error_data && !Array.isArray(errorNode.error_data)
    ? (errorNode.error_data as Record<string, unknown>)
    : null;
  const details = typeof errorData?.details === "string" ? errorData.details : null;

  if (code === 132000) {
    return {
      summary: "Quantidade de parâmetros do modelo não confere. Ref. 132000.",
      detail: details || message,
      raw: error,
    };
  }

  if (code === 131049) {
    return {
      summary: "A Meta bloqueou esta entrega para preservar a qualidade do ecossistema. Ref. 131049.",
      detail: details || message,
      raw: error,
    };
  }

  if (code === 131026) {
    return {
      summary: "A Meta informou que a mensagem não pôde ser entregue. Ref. 131026.",
      detail: details || message,
      raw: error,
    };
  }

  if (details || message) {
    return {
      summary: code ? `${message || details || error} Ref. ${code}.` : message || details || error,
      detail: details && details !== message ? details : null,
      raw: error,
    };
  }

  return {
    summary: error,
    detail: null,
    raw: error,
  };
}

export function fixLegacyBrazilDuplicateNinthDigitForDisplay(recipient: string) {
  const value = recipient.trim();
  if (!/^\d+$/.test(value)) return value;
  if (!value.startsWith("55") || value.length !== 14) return value;

  const country = value.slice(0, 2);
  const areaCode = value.slice(2, 4);
  const local = value.slice(4);

  // Display-only repair for old campaign seeds created before manualRecipientInput.
  // Sending still uses backend normalization/resolution; do not reuse this as send logic.
  if (!/^\d{2}$/.test(areaCode) || local.length !== 10 || !local.startsWith("99")) {
    return value;
  }

  return `${country}${areaCode}${local.slice(1)}`;
}

export function buildReplayFormFromCampaign(campaign: CampaignItem) {
  const seed = campaign.draftSeed;
  const recipients = seed?.manualRecipientInput?.length
    ? seed.manualRecipientInput
    : (seed?.recipients || []).map(fixLegacyBrazilDuplicateNinthDigitForDisplay);

  return {
    name: `Cópia de ${seed?.name || campaign.name || "campanha"}`,
    templateName: seed?.templateName || campaign.templateName || "",
    templateParamsInput: (seed?.templateParams || []).join("\n"),
    recipientsInput: recipients.join("\n"),
  };
}
