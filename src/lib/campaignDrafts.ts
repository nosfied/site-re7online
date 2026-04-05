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
      summary: "Quantidade de parametros do template nao confere. Ref. 132000.",
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

export function buildReplayFormFromCampaign(campaign: CampaignItem) {
  const seed = campaign.draftSeed;
  return {
    name: seed?.name ? `${seed.name}-replay` : `${campaign.name || "campanha"}-replay`,
    templateName: seed?.templateName || campaign.templateName || "",
    templateParamsInput: (seed?.templateParams || []).join("\n"),
    recipientsInput: (seed?.recipients || []).join("\n"),
  };
}
