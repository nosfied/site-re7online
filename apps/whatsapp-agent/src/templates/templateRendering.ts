import type { CampaignTemplateComponents } from "../campaigns/campaignService.js";

export function extractTemplateBodyContent(content: string | null | undefined) {
  const raw = String(content ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const components = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).components)
        ? ((parsed as Record<string, unknown>).components as unknown[])
        : null;
    const body = components?.find((component) => {
      if (!component || typeof component !== "object" || Array.isArray(component)) return false;
      const type = String((component as Record<string, unknown>).type ?? "").toLowerCase();
      return type === "body";
    });
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const text = (body as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) return text.trim();
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const key of ["body", "bodyText", "text", "content"]) {
        const value = (parsed as Record<string, unknown>)[key];
        if (typeof value === "string" && value.trim()) return value.trim();
      }
    }
  } catch {
    // Template content is commonly stored as plain text in the local catalog.
  }
  return raw;
}

export function extractTemplatePlaceholderKeys(content: string | null | undefined) {
  const body = extractTemplateBodyContent(content) ?? "";
  return Array.from(
    new Set(
      Array.from(body.matchAll(/\{\{\s*(\d+)\s*\}\}/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );
}

function extractBodyTemplateParameterValues(components: CampaignTemplateComponents | undefined) {
  const body = components?.find((component) => component.type === "body");
  return body?.parameters.map((parameter) => parameter.text) ?? [];
}

export function buildTemplateComponentsFromVariables(params: {
  requiredKeys: string[];
  variables: Record<string, unknown>;
}): CampaignTemplateComponents | undefined {
  if (params.requiredKeys.length === 0) return undefined;
  return [
    {
      type: "body",
      parameters: params.requiredKeys.map((key) => ({
        type: "text",
        text: String(params.variables[key] ?? "").trim(),
      })),
    },
  ];
}

export function renderTemplateBody(content: string | null | undefined, components: CampaignTemplateComponents | undefined) {
  const body = extractTemplateBodyContent(content);
  if (!body) return null;
  const values = extractBodyTemplateParameterValues(components);
  if (values.length === 0) return body;
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, index: string) => {
    const value = values[Number(index) - 1];
    return value && value.trim() ? value : match;
  });
}
