import type { CampaignItem } from "@/lib/whatsappAdminApi";

type CampaignApiErrorLike = {
  status?: number;
  errorCode?: string;
  message?: string;
  payload?: unknown;
};

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
    excluded_contact: "Contato excluído da operação",
    provisional_contact: "Contato ainda não está pronto para campanha",
    identity_conflict: "Identidade do contato precisa de revisão",
    recipient_blocked: "Destinatário bloqueado antes do envio",
    no_eligible_recipients: "Nenhum destinatário está elegível para esta campanha.",
    template_variables_required: "Preencha todas as variáveis obrigatórias do modelo antes de enviar.",
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

export function getCampaignStatusResultLabel(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toLowerCase();
  const labels: Record<string, string> = {
    sent: "Enviada/aceita",
    accepted: "Enviada/aceita",
    delivered: "Entregue",
    read: "Lida",
    failed: "Falha",
    blocked: "Bloqueada",
    opt_out: "Bloqueada",
    "opt-out": "Bloqueada",
    skipped: "Ignorada",
    pending: "Pendente",
  };
  return labels[normalized] ?? status ?? "-";
}

export function getCampaignUserFacingError(error: CampaignApiErrorLike, fallback: string) {
  const code = String(error.errorCode ?? "").trim().toLowerCase();
  const payload =
    error.payload && typeof error.payload === "object" && !Array.isArray(error.payload)
      ? (error.payload as Record<string, unknown>)
      : null;
  const nestedError =
    payload && typeof payload.error === "object" && payload.error && !Array.isArray(payload.error)
      ? (payload.error as Record<string, unknown>)
      : null;
  const nestedCode = String(nestedError?.code ?? "").trim().toLowerCase();
  const normalizedCode = code || nestedCode;
  const details = nestedError?.details && typeof nestedError.details === "object" && !Array.isArray(nestedError.details)
    ? (nestedError.details as Record<string, unknown>)
    : null;
  const summary = details?.summary && typeof details.summary === "object" && !Array.isArray(details.summary)
    ? (details.summary as Record<string, unknown>)
    : null;
  const blockedByReason = Array.isArray(summary?.blockedByReason)
    ? summary.blockedByReason as Array<{ reason?: unknown; label?: unknown; count?: unknown }>
    : [];
  const messages: Record<string, string> = {
    no_eligible_recipients: "Nenhum destinatário está elegível para esta campanha.",
    template_variables_required: "Preencha todas as variáveis obrigatórias do modelo antes de enviar.",
    invalid_template_variable_mapping: "Revise o mapeamento das variáveis do modelo.",
    template_required: "Selecione um modelo aprovado antes de continuar.",
    template_not_found: "Modelo aprovado não encontrado.",
    template_locally_disabled: "Este modelo está desativado localmente no Converta.",
    campaign_not_draft: "A campanha precisa estar em rascunho para esta ação.",
    campaign_not_found: "Campanha não encontrada.",
    invalid_recipient: "Revise os destinatários informados.",
    invalid_recipients: "Selecione ao menos um contato elegível.",
    return_destination_required: "Defina o destino das respostas antes de continuar.",
    return_destination_invalid: "Revise o destino das respostas antes de continuar.",
    crm_status_not_found: "Situação no CRM não encontrada para este tenant.",
    invalid_dynamic_filter: "Selecione uma Situação no CRM para o filtro dinâmico.",
    campaign_name_conflict: "Já existe uma campanha com este nome.",
  };
  if (messages[normalizedCode]) {
    if (normalizedCode === "no_eligible_recipients" && blockedByReason.length > 0) {
      const reasonLines = blockedByReason
        .map((item) => {
          const count = Number(item.count);
          const reason = typeof item.reason === "string" ? item.reason : "";
          const label = getFriendlyCampaignError(reason)?.summary ||
            (typeof item.label === "string" ? getFriendlyCampaignError(item.label)?.summary || item.label : "");
          if (!Number.isFinite(count) || count <= 0 || !label) return null;
          return `${count} contato${count === 1 ? "" : "s"}: ${label}.`;
        })
        .filter((line): line is string => Boolean(line));
      if (reasonLines.length > 0) return [messages[normalizedCode], ...reasonLines].join("\n");
    }
    return messages[normalizedCode];
  }

  const friendly = getFriendlyCampaignError(error.message ?? null);
  if (friendly?.summary && friendly.summary !== error.message) return friendly.summary;

  const rawMessage = String(error.message ?? "").trim();
  const englishMessageMap: Record<string, string> = {
    "no eligible recipients for this campaign": messages.no_eligible_recipients,
    "no eligible recipients for this campaign draft": messages.no_eligible_recipients,
    "campaign must be draft before sending": messages.campaign_not_draft,
    "only draft campaigns can be discarded": messages.campaign_not_draft,
    "approved template is required": messages.template_required,
    "approved template not found": messages.template_not_found,
    "campaign not found": messages.campaign_not_found,
    "select at least one eligible contact": messages.invalid_recipients,
  };
  const lowerRaw = rawMessage.toLowerCase().replace(/\.$/, "");
  return englishMessageMap[lowerRaw] ?? (rawMessage || fallback);
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

export type CampaignReuseMode = "manual" | "crm_static" | "crm_dynamic" | "csv";

export type CampaignReuseRecipientOverride = {
  mode: "filtered_results";
  recipients: Array<{
    leadId?: string | null;
    waId: string;
    phoneDisplay?: string | null;
    contactName?: string | null;
    crmStatus?: string | null;
    crmStatusLabel?: string | null;
  }>;
};

export function resolveCampaignReuseMode(campaign: CampaignItem): CampaignReuseMode {
  const seed = campaign.draftSeed;
  const source = String(seed?.source ?? "");
  if (seed?.selectionMode === "DYNAMIC_CRM_FILTER") return "crm_dynamic";
  if (source.startsWith("recipient_import:")) return "csv";
  if (source === "crm_audience_preview") return "crm_static";
  if (source === "dynamic_crm_filter") return "crm_dynamic";
  return "manual";
}

export function buildCampaignReuseState(
  campaign: CampaignItem,
  options: { recipientOverride?: CampaignReuseRecipientOverride } = {}
) {
  const seed = campaign.draftSeed;
  const recipients = seed?.manualRecipientInput?.length
    ? seed.manualRecipientInput
    : (seed?.recipients || []).map(fixLegacyBrazilDuplicateNinthDigitForDisplay);
  const originalMode = resolveCampaignReuseMode(campaign);
  const filteredRecipients = options.recipientOverride?.recipients ?? null;
  const filteredLeadIds = filteredRecipients
    ? Array.from(new Set(filteredRecipients.map((item) => item.leadId).filter((id): id is string => Boolean(id))))
    : [];
  const filteredRecipientInput = filteredRecipients
    ? Array.from(new Set(filteredRecipients.map((item) => item.phoneDisplay || item.waId).filter(Boolean))).join("\n")
    : "";
  const recipientOverrideMode =
    options.recipientOverride?.mode === "filtered_results"
      ? originalMode === "manual"
        ? "manual"
        : "crm_static"
      : null;
  const mode = recipientOverrideMode ?? originalMode;
  const warnings: string[] = [];
  if (options.recipientOverride?.mode === "filtered_results") {
    if (originalMode === "crm_dynamic") {
      warnings.push("Os destinatários filtrados foram congelados para esta nova campanha.");
    }
    if (originalMode === "csv") {
      warnings.push("O arquivo CSV original não foi restaurado; os destinatários filtrados foram congelados.");
    }
  } else if (originalMode === "csv") {
    warnings.push("Carregue o CSV novamente para criar um novo rascunho.");
  }

  return {
    mode,
    originalMode,
    filteredLeadIds,
    warnings,
    form: {
      name: `Cópia de ${seed?.name || campaign.name || "campanha"}`,
      templateName: seed?.templateName || campaign.templateName || "",
      templateParamsInput: (seed?.templateParams || []).join("\n"),
      recipientsInput: filteredRecipientInput || recipients.join("\n"),
    },
  };
}

export function buildReplayFormFromCampaign(campaign: CampaignItem) {
  return buildCampaignReuseState(campaign).form;
}
