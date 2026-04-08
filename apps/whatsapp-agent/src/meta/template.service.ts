import { getPrisma } from "../db.js";
import { logger } from "../logger/logger.js";

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
      | "meta_template_submit_invalid_json"
      | "meta_template_sync_not_found"
      | "meta_template_sync_invalid_json"
      | "meta_template_sync_failed",
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

function normalizeMetaTemplateSyncStatus(input: unknown): "approved" | "rejected" | null {
  if (typeof input !== "string") return null;
  const normalized = input.trim().toUpperCase();
  if (normalized === "APPROVED") return "approved";
  if (normalized === "REJECTED") return "rejected";
  return null;
}

function extractMetaRejectionReason(input: Record<string, unknown> | null) {
  if (!input) return null;
  const directFields = ["rejection_reason", "rejected_reason", "reason"];
  for (const field of directFields) {
    if (typeof input[field] === "string" && String(input[field]).trim()) {
      return String(input[field]).trim();
    }
  }
  if (
    input.rejection_reason != null &&
    typeof input.rejection_reason === "object" &&
    typeof (input.rejection_reason as Record<string, unknown>).reason === "string"
  ) {
    return String((input.rejection_reason as Record<string, unknown>).reason).trim();
  }
  return null;
}

export async function syncTemplateStatus(templateId: string) {
  const prisma = getPrisma();
  const template = await prisma.template.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      clientId: true,
      name: true,
      language: true,
      status: true,
      metaTemplateId: true,
      client: {
        select: {
          clientKey: true,
          metaConfig: {
            select: {
              businessToken: true,
              wabaId: true,
            },
          },
        },
      },
    },
  });

  if (!template) {
    throw new MetaTemplateServiceError("meta_template_sync_not_found", "meta_template_sync_not_found", 404);
  }

  const businessToken = normalizeOptionalString(template.client.metaConfig?.businessToken);
  const wabaId = normalizeOptionalString(template.client.metaConfig?.wabaId);
  if (!businessToken || !wabaId) {
    throw new MetaTemplateServiceError("meta_config_missing", "meta_config_missing", 400);
  }

  const params = new URLSearchParams({ name: template.name });
  const url = `https://graph.facebook.com/${META_TEMPLATE_API_VERSION}/${wabaId}/message_templates?${params.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${businessToken}`,
    },
  });

  const rawText = await response.text();
  let rawResponse: Record<string, unknown> | null = null;
  if (rawText) {
    try {
      rawResponse = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      throw new MetaTemplateServiceError(
        "meta_template_sync_invalid_json",
        "meta_template_sync_invalid_json",
        response.status,
        rawText.slice(0, 2000)
      );
    }
  }

  if (!response.ok) {
    throw new MetaTemplateServiceError(
      "meta_template_sync_failed",
      "meta_template_sync_failed",
      response.status,
      rawText.slice(0, 2000)
    );
  }

  const items = Array.isArray(rawResponse?.data) ? rawResponse.data : [];
  const matched =
    items.find((item) => {
      if (!item || typeof item !== "object") return false;
      const typed = item as Record<string, unknown>;
      if (template.metaTemplateId && typeof typed.id === "string" && typed.id === template.metaTemplateId) {
        return true;
      }
      return (
        typed.name === template.name &&
        (typeof typed.language === "string" ? typed.language === template.language : true)
      );
    }) ?? null;

  if (!matched || typeof matched !== "object") {
    logger.info({
      event: "template.status.not_found",
      templateId: template.id,
      clientKey: template.client.clientKey,
      templateName: template.name,
      wabaId,
    });
    return {
      ok: false as const,
      templateId: template.id,
      status: template.status,
      rejectionReason: null,
      updated: false,
    };
  }

  const typedMatch = matched as Record<string, unknown>;
  const nextStatus = normalizeMetaTemplateSyncStatus(typedMatch.status);
  const rejectionReason = extractMetaRejectionReason(typedMatch);

  if (!nextStatus) {
    return {
      ok: true as const,
      templateId: template.id,
      status: template.status,
      rejectionReason,
      updated: false,
    };
  }

  const updated = await prisma.template.update({
    where: { id: template.id },
    data: {
      status: nextStatus,
      rejectionReason: nextStatus === "rejected" ? rejectionReason ?? undefined : null,
    },
    select: {
      id: true,
      status: true,
      rejectionReason: true,
    },
  });

  logger.info({
    event: "template.status.synced",
    templateId: updated.id,
    clientKey: template.client.clientKey,
    previousStatus: template.status,
    nextStatus: updated.status,
  });

  return {
    ok: true as const,
    templateId: updated.id,
    status: updated.status,
    rejectionReason: updated.rejectionReason,
    updated: true,
  };
}
