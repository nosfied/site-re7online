import { getPrisma } from "../db.js";
import { getEnv } from "../config/env.js";
import { persistEvent } from "../db/persist.js";
import {
  isWhatsappTransportEnabledForRouting,
  resolveWhatsappTransportRoutingSettings,
} from "../config/tenantOperationalConfig.js";
import { logger } from "../logger/logger.js";

type TenantMetaTemplateConfig = {
  businessToken?: string | null;
  wabaId?: string | null;
};

type MetaTemplateCredentials = {
  businessToken: string;
  wabaId: string;
  source: "tenant_meta" | "env_matched_phone";
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

export type MetaTemplateProviderError = {
  code: string | null;
  subcode: string | null;
  type: string | null;
  userTitle: string | null;
  userMessage: string | null;
  details: string | null;
  traceId: string | null;
};

type MetaTemplateSubmitSuccess = {
  ok: true;
  metaTemplateId: string | null;
  status: string | null;
  errorMessage: null;
  rawResponse: Record<string, unknown>;
  providerError: null;
};

type MetaTemplateSubmitFailure = {
  ok: false;
  metaTemplateId: null;
  status: string | null;
  errorMessage: string;
  rawResponse: Record<string, unknown> | null;
  providerError: MetaTemplateProviderError | null;
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

export async function resolveMetaTemplateCredentialsForClient(params: {
  clientId: string;
}): Promise<MetaTemplateCredentials | null> {
  const prisma = getPrisma();
  const [tenantMetaConfig, routingSettings] = await Promise.all([
    prisma.tenantMetaConfig.findUnique({
      where: { clientId: params.clientId },
      select: {
        businessToken: true,
        wabaId: true,
      },
    }),
    resolveWhatsappTransportRoutingSettings({
      prisma,
      clientId: params.clientId,
    }),
  ]);
  const tenantBusinessToken = normalizeOptionalString(tenantMetaConfig?.businessToken);
  const tenantWabaId = normalizeOptionalString(tenantMetaConfig?.wabaId);
  if (
    !isWhatsappTransportEnabledForRouting(
      routingSettings.settings,
      "meta",
      true
    )
  ) {
    return null;
  }
  if (tenantBusinessToken && tenantWabaId) {
    return {
      businessToken: tenantBusinessToken,
      wabaId: tenantWabaId,
      source: "tenant_meta",
    };
  }

  const currentEnv = getEnv();
  const envBusinessToken = normalizeOptionalString(currentEnv.WHATSAPP_ACCESS_TOKEN);
  const envWabaId = normalizeOptionalString(currentEnv.WHATSAPP_BUSINESS_ACCOUNT_ID);
  const envPhoneNumberId = normalizeOptionalString(currentEnv.WHATSAPP_PHONE_NUMBER_ID);
  if (!envBusinessToken || !envWabaId || !envPhoneNumberId) {
    return null;
  }

  const matchingPhone = await prisma.waPhoneNumber.findFirst({
    where: {
      clientId: params.clientId,
      phoneNumberId: envPhoneNumberId,
    },
    select: { id: true },
  });
  if (!matchingPhone) {
    return null;
  }

  return {
    businessToken: envBusinessToken,
    wabaId: envWabaId,
    source: "env_matched_phone",
  };
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

function hasMalformedPlaceholders(content: string) {
  const withoutValidPlaceholders = content.replace(/{{\s*\d+\s*}}/g, "");
  return /{{|}}/.test(withoutValidPlaceholders);
}

function hasDanglingPlaceholder(content: string) {
  const trimmed = content.trim();
  return /^{{\s*\d+\s*}}/.test(trimmed) || /{{\s*\d+\s*}}[\s.,;:!?]*$/.test(trimmed);
}

function resolveVariableCount(variables: unknown) {
  if (variables == null) return 0;
  if (typeof variables === "number" && Number.isInteger(variables) && variables >= 0) {
    return variables;
  }
  if (Array.isArray(variables)) return variables.length;
  if (typeof variables === "object") {
    const raw = variables as Record<string, unknown>;
    if (Array.isArray(raw.variableDetails)) return raw.variableDetails.length;
    if (Array.isArray(raw.variables)) return raw.variables.length;
    return Object.keys(raw).filter((key) => /^\d+$/.test(key)).length;
  }
  return 0;
}

function normalizeVariableExampleDetails(variables: unknown): Array<{ key: string; example: string }> {
  const normalizeList = (input: unknown) => {
    if (!Array.isArray(input)) return [];
    return input
      .map((item, index) => {
        if (typeof item === "string") {
          return { key: String(index + 1), example: item.trim() };
        }
        if (!item || typeof item !== "object") return null;
        const raw = item as Record<string, unknown>;
        return {
          key: String(raw.key ?? index + 1).trim(),
          example: String(raw.example ?? "").trim(),
        };
      })
      .filter((item): item is { key: string; example: string } => Boolean(item?.key));
  };

  if (Array.isArray(variables)) return normalizeList(variables);
  if (variables && typeof variables === "object") {
    const raw = variables as Record<string, unknown>;
    return normalizeList(raw.variableDetails ?? raw.variables);
  }
  return [];
}

function buildMetaExamples(content: string, variables: unknown) {
  const placeholderIndexes = extractPlaceholderIndexes(content);
  if (placeholderIndexes.length <= 0) return undefined;
  const details = normalizeVariableExampleDetails(variables);
  const examples = placeholderIndexes.map((index) => {
    const detail = details.find((item) => Number(item.key) === index);
    return detail?.example || `example_${index}`;
  });
  return {
    body_text: [examples],
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
          ? { example: buildMetaExamples(content, template.variables) }
          : {}),
      },
    ],
  };
}

function readSafeString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 1000) : null;
}

function readSafeScalar(value: unknown) {
  if (typeof value === "string" || typeof value === "number") {
    const normalized = String(value).trim();
    return normalized ? normalized.slice(0, 120) : null;
  }
  return null;
}

export function extractMetaTemplateProviderError(payload: unknown): MetaTemplateProviderError | null {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as Record<string, unknown>).error;
  if (!error || typeof error !== "object") return null;
  const raw = error as Record<string, unknown>;
  const errorData = raw.error_data && typeof raw.error_data === "object"
    ? (raw.error_data as Record<string, unknown>)
    : null;
  const providerError = {
    code: readSafeScalar(raw.code),
    subcode: readSafeScalar(raw.error_subcode),
    type: readSafeString(raw.type),
    userTitle: readSafeString(raw.error_user_title),
    userMessage: readSafeString(raw.error_user_msg),
    details: readSafeString(errorData?.details),
    traceId: readSafeString(raw.fbtrace_id),
  };
  return Object.values(providerError).some(Boolean) ? providerError : null;
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
  if (category === "AUTHENTICATION") {
    throw new MetaTemplateValidationError("template_authentication_unsupported");
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
  if (hasMalformedPlaceholders(content)) {
    throw new MetaTemplateValidationError("template_variables_invalid");
  }
  if (hasDanglingPlaceholder(content)) {
    throw new MetaTemplateValidationError("template_variable_at_edge");
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

  const variableExamples = normalizeVariableExampleDetails(template.variables);
  if (placeholderIndexes.length > 0 && variableExamples.length > 0) {
    for (const index of placeholderIndexes) {
      const detail = variableExamples.find((item) => Number(item.key) === index);
      if (!detail?.example) {
        throw new MetaTemplateValidationError("template_variable_example_required");
      }
    }
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
    const providerError = extractMetaTemplateProviderError(rawResponse);
    return {
      ok: false,
      metaTemplateId: null,
      status,
      errorMessage:
        providerError?.userMessage ||
        providerError?.details ||
        errorMessage ||
        rawText.slice(0, 2000) ||
        "meta_template_submit_failed",
      rawResponse,
      providerError,
    };
  }

  return {
    ok: true,
    metaTemplateId,
    status,
    errorMessage: null,
    rawResponse: rawResponse ?? {},
    providerError: null,
  };
}

function normalizeMetaTemplateSyncStatus(input: unknown): "approved" | "rejected" | null {
  if (typeof input !== "string") return null;
  const normalized = input.trim().toUpperCase();
  if (normalized === "APPROVED") return "approved";
  if (normalized === "REJECTED") return "rejected";
  return null;
}

function normalizeMetaTemplateCategory(input: unknown) {
  if (typeof input !== "string") return null;
  const normalized = input.trim().toUpperCase();
  return normalized || null;
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
      category: true,
      submittedCategory: true,
      wasRecategorized: true,
      language: true,
      status: true,
      metaTemplateId: true,
      client: {
        select: {
          clientKey: true,
        },
      },
    },
  });

  if (!template) {
    throw new MetaTemplateServiceError("meta_template_sync_not_found", "meta_template_sync_not_found", 404);
  }

  const credentials = await resolveMetaTemplateCredentialsForClient({ clientId: template.clientId });
  if (!credentials) {
    throw new MetaTemplateServiceError("meta_config_missing", "meta_config_missing", 400);
  }

  const params = new URLSearchParams({ name: template.name });
  const url = `https://graph.facebook.com/${META_TEMPLATE_API_VERSION}/${credentials.wabaId}/message_templates?${params.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credentials.businessToken}`,
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
      wabaId: credentials.wabaId,
      credentialSource: credentials.source,
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
  const metaCategory = normalizeMetaTemplateCategory(typedMatch.category);
  const rejectionReason = extractMetaRejectionReason(typedMatch);
  const submittedCategory = normalizeMetaTemplateCategory(template.submittedCategory);
  const nextCategory = metaCategory ?? template.category;
  const nextWasRecategorized = Boolean(
    submittedCategory && metaCategory && metaCategory !== submittedCategory
  );

  if (!nextStatus && nextCategory === template.category && nextWasRecategorized === template.wasRecategorized) {
    return {
      ok: true as const,
      templateId: template.id,
      category: template.category,
      submittedCategory,
      wasRecategorized: template.wasRecategorized,
      status: template.status,
      rejectionReason,
      updated: false,
    };
  }

  if (metaCategory && metaCategory !== template.category) {
    logger.info({
      event: "template.sync.recategorized",
      templateId: template.id,
      clientId: template.clientId,
      clientKey: template.client.clientKey,
      templateName: template.name,
      previousCategory: template.category,
      metaCategory,
    });
    await persistEvent({
      clientId: template.clientId,
      messageId: template.id,
      requestId: `template-category-changed:${template.id}:${Date.now()}`,
      eventName: "whatsapp.template.category_changed",
      payloadJson: {
        templateId: template.id,
        templateName: template.name,
        previousCategory: template.category,
        newCategory: metaCategory,
        submittedCategory,
        source: "meta_sync",
        timestamp: new Date().toISOString(),
      },
    });
  }

  const updated = await prisma.template.update({
    where: { id: template.id },
    data: {
      category: nextCategory,
      submittedCategory: submittedCategory ?? undefined,
      wasRecategorized: nextWasRecategorized,
      status: nextStatus ?? template.status,
      rejectionReason: nextStatus === "rejected" ? rejectionReason ?? undefined : null,
    },
    select: {
      id: true,
      category: true,
      submittedCategory: true,
      wasRecategorized: true,
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
    previousCategory: template.category,
    nextCategory: updated.category,
  });

  return {
    ok: true as const,
    templateId: updated.id,
    category: updated.category,
    submittedCategory: updated.submittedCategory,
    wasRecategorized: updated.wasRecategorized,
    status: updated.status,
    rejectionReason: updated.rejectionReason,
    updated: true,
  };
}
