import type { CampaignItem } from "@/lib/whatsappAdminApi";

export function getFriendlyCampaignError(error: string | null) {
  if (!error) return null;

  const parseJson = (input: string) => {
    try {
      return JSON.parse(input) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const parsed = parseJson(error);
  const errorNode = parsed && typeof parsed.error === "object" && parsed.error && !Array.isArray(parsed.error)
    ? (parsed.error as Record<string, unknown>)
    : null;
  const code = typeof errorNode?.code === "number" ? errorNode.code : null;
  const message = typeof errorNode?.message === "string" ? errorNode.message : null;
  const errorData = errorNode && typeof errorNode.error_data === "object" && errorNode.error_data && !Array.isArray(errorNode.error_data)
    ? (errorNode.error_data as Record<string, unknown>)
    : null;
  const details = typeof errorData?.details === "string" ? errorData.details : null;

  if (code === 132000) {
    return {
      summary: "Quantidade de parametros do template nao confere.",
      detail: details || message,
      raw: error,
    };
  }

  if (code === 131049) {
    return {
      summary: "A Meta bloqueou esta entrega por politica de qualidade e engajamento.",
      detail: details || message,
      raw: error,
    };
  }

  if (details || message) {
    return {
      summary: message || details || error,
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

export function buildReplayFormFromCampaign(campaign: CampaignItem) {
  const seed = campaign.draftSeed;
  return {
    name: seed?.name ? `${seed.name}-replay` : `${campaign.name || "campanha"}-replay`,
    templateName: seed?.templateName || campaign.templateName || "",
    templateParamsInput: (seed?.templateParams || []).join("\n"),
    recipientsInput: (seed?.recipients || []).join("\n"),
  };
}
