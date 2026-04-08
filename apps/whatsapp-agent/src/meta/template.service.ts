type TenantMetaTemplateConfig = {
  businessToken?: string | null;
  wabaId?: string | null;
};

type TemplateForMeta = {
  name: string;
  category: string;
  language: string;
  content: string;
  variables?: unknown;
};

type MetaTemplateComponent = {
  type: "BODY";
  text: string;
  example?: {
    body_text: string[][];
  };
};

type MetaTemplatePayload = {
  name: string;
  category: string;
  language: string;
  components: MetaTemplateComponent[];
};

type MetaTemplateSubmitSuccess = {
  ok: true;
  metaTemplateId: string | null;
  status: string | null;
  errorMessage: null;
  rawResponse: Record<string, unknown>;
};

type MetaTemplateSubmitFailure = {
  ok: false;
  metaTemplateId: null;
  status: string | null;
  errorMessage: string;
  rawResponse: Record<string, unknown> | null;
};

export type MetaTemplateSubmitResult =
  | MetaTemplateSubmitSuccess
  | MetaTemplateSubmitFailure;

export class MetaTemplateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaTemplateValidationError";
  }
}

export class MetaTemplateServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "meta_config_missing"
      | "meta_template_submit_failed"
      | "meta_template_submit_invalid_json",
    public readonly status?: number,
    public readonly errorBody?: string
  ) {
    super(message);
    this.name = "MetaTemplateServiceError";
  }
}

const META_TEMPLATE_API_VERSION = "v18.0";
const TEMPLATE_NAME_PATTERN = /^[a-z0-9_]+$/;
const TEMPLATE_LANGUAGE_PATTERN = /^[a-z]{2}_[A-Z]{2}$/;
const META_ALLOWED_CATEGORIES = new Set(["MARKETING", "UTILITY", "AUTHENTICATION"]);
const META_TEMPLATE_BODY_MAX_LENGTH = 1024;

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function extractPlaceholderIndexes(content: string) {
  const matches = content.matchAll(/{{\s*(\d+)\s*}}/g);
  const indexes = new Set<number>();

  for (const match of matches) {
    const parsed = Number(match[1]);
    if (Number.isInteger(parsed) && parsed > 0) {
      indexes.add(parsed);
    }
  }

  return Array.from(indexes).sort((a, b) => a - b);
}

function resolveVariableCount(variables: unknown) {
  if (variables == null) return 0;
  if (typeof variables === "number" && Number.isInteger(variables) && variables >= 0) {
    return variables;
  }
  if (Array.isArray(variables)) return variables.length;
  if (typeof variables === "object") return Object.keys(variables as Record<string, unknown>).length;
  return 0;
}

function buildMetaExamples(variableCount: number) {
  if (variableCount <= 0) return undefined;
  return {
    body_text: [Array.from({ length: variableCount }, (_, index) => `example_${index + 1}`)],
  };
}

function buildMetaTemplatePayload(template: TemplateForMeta): MetaTemplatePayload {
  const content = template.content.trim();
  const placeholderIndexes = extractPlaceholderIndexes(content);

  return {
    name: template.name.trim(),
    category: template.category.trim().toUpperCase(),
    language: template.language.trim(),
    components: [
      {
        type: "BODY",
        text: content,
        ...(placeholderIndexes.length > 0
          ? { example: buildMetaExamples(placeholderIndexes.length) }
          : {}),
      },
    ],
  };
}

export function validateTemplateForMeta(template: TemplateForMeta) {
  const name = normalizeOptionalString(template.name);
  const category = normalizeOptionalString(template.category).toUpperCase();
  const language = normalizeOptionalString(template.language);
  const content = normalizeOptionalString(template.content);
  const placeholderIndexes = extractPlaceholderIndexes(content);
  const variableCount = resolveVariableCount(template.variables);

  if (!name) {
    throw new MetaTemplateValidationError("template_name_required");
  }
  if (!TEMPLATE_NAME_PATTERN.test(name)) {
    throw new MetaTemplateValidationError("template_name_invalid");
  }
  if (!category || !META_ALLOWED_CATEGORIES.has(category)) {
    throw new MetaTemplateValidationError("template_category_invalid");
  }
  if (!language) {
    throw new MetaTemplateValidationError("template_language_required");
  }
  if (!TEMPLATE_LANGUAGE_PATTERN.test(language)) {
    throw new MetaTemplateValidationError("template_language_invalid");
  }
  if (!content) {
    throw new MetaTemplateValidationError("template_content_required");
  }
  if (content.length > META_TEMPLATE_BODY_MAX_LENGTH) {
    throw new MetaTemplateValidationError("template_content_too_long");
  }

  for (let index = 0; index < placeholderIndexes.length; index += 1) {
    const expected = index + 1;
    if (placeholderIndexes[index] !== expected) {
      throw new MetaTemplateValidationError("template_variables_invalid");
    }
  }

  if (placeholderIndexes.length === 0 && variableCount > 0) {
    throw new MetaTemplateValidationError("template_variables_invalid");
  }

  if (placeholderIndexes.length > 0 && variableCount > 0 && variableCount !== placeholderIndexes.length) {
    throw new MetaTemplateValidationError("template_variables_invalid");
  }
}

export async function submitTemplateToMeta(params: {
  tenantConfig: TenantMetaTemplateConfig;
  template: TemplateForMeta;
}): Promise<MetaTemplateSubmitResult> {
  const businessToken = normalizeOptionalString(params.tenantConfig.businessToken);
  const wabaId = normalizeOptionalString(params.tenantConfig.wabaId);

  if (!businessToken || !wabaId) {
    throw new MetaTemplateServiceError("meta_config_missing", "meta_config_missing", 400);
  }

  validateTemplateForMeta(params.template);

  const payload = buildMetaTemplatePayload(params.template);
  const url = `https://graph.facebook.com/${META_TEMPLATE_API_VERSION}/${wabaId}/message_templates`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${businessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  let rawResponse: Record<string, unknown> | null = null;

  if (rawText) {
    try {
      rawResponse = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      if (!response.ok) {
        throw new MetaTemplateServiceError(
          "meta_template_submit_invalid_json",
          "meta_template_submit_invalid_json",
          response.status,
          rawText.slice(0, 2000)
        );
      }
    }
  }

  const metaTemplateId =
    typeof rawResponse?.id === "string"
      ? rawResponse.id
      : typeof rawResponse?.template_id === "string"
        ? rawResponse.template_id
        : null;
  const status =
    typeof rawResponse?.status === "string"
      ? rawResponse.status
      : typeof rawResponse?.message_status === "string"
        ? rawResponse.message_status
        : null;
  const errorMessage =
    typeof rawResponse?.error === "object" &&
    rawResponse.error !== null &&
    typeof (rawResponse.error as Record<string, unknown>).message === "string"
      ? String((rawResponse.error as Record<string, unknown>).message)
      : null;

  if (!response.ok) {
    return {
      ok: false,
      metaTemplateId: null,
      status,
      errorMessage: errorMessage || rawText.slice(0, 2000) || "meta_template_submit_failed",
      rawResponse,
    };
  }

  return {
    ok: true,
    metaTemplateId,
    status,
    errorMessage: null,
    rawResponse: rawResponse ?? {},
  };
}
