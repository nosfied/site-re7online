import { getPrisma } from "../db.js";
import { getEnv } from "../config/env.js";
import { persistEvent } from "../db/persist.js";
import {
  isWhatsappTransportEnabledForRouting,
  resolveWhatsappTransportRoutingSettings,
} from "../config/tenantOperationalConfig.js";
import { logger } from "../logger/logger.js";
import {
  boundedMetaProviderTimeoutMs,
  sanitizeMetaDiagnosticMessage,
  uploadMetaTemplateExample,
  type MetaTemplateUploadDiagnostic,
} from "./metaTemplateMedia.js";
import { resolveTenantMetaAppId } from "./tenantMetaAppId.js";
import {
  mergeProviderTemplateComponents,
  normalizeTemplateHeaderType,
  readCanonicalTemplateComponents,
  type TemplateHeaderType,
} from "../templates/templateComponents.js";

type TenantMetaTemplateConfig = {
  businessToken?: string | null;
  wabaId?: string | null;
  appId?: string | null;
};

type MetaTemplateCredentials = {
  businessToken: string;
  wabaId: string;
  appId: string | null;
  source: "tenant_meta" | "env_matched_phone";
};

type TemplateForMeta = {
  name: string;
  category: string;
  language: string;
  content: string;
  variables?: unknown;
  headerType?: TemplateHeaderType;
  exampleMediaId?: string | null;
};

type MetaTemplateComponent =
  | { type: "HEADER"; format: "IMAGE" | "VIDEO"; example: { header_handle: string[] } }
  | { type: "BODY"; text: string; example?: { body_text: string[][] } };

type MetaTemplatePayload = {
  name: string;
  category: string;
  language: string;
  components: MetaTemplateComponent[];
};

export type MetaTemplateProviderError = {
  stage?: MetaTemplateUploadDiagnostic["stage"] | "template_submission" | null;
  httpStatus?: number | null;
  code: string | null;
  subcode: string | null;
  type: string | null;
  userTitle?: string | null;
  userMessage?: string | null;
  details?: string | null;
  traceId: string | null;
  message?: string | null;
};

type MetaTemplateSubmitSuccess = {
  ok: true;
  metaTemplateId: string | null;
  status: string | null;
  errorMessage: null;
  rawResponse: Record<string, unknown>;
  providerError: null;
  headerHandle: string | null;
};

type MetaTemplateSubmitFailure = {
  ok: false;
  metaTemplateId: null;
  status: string | null;
  errorMessage: string;
  rawResponse: Record<string, unknown> | null;
  providerError: MetaTemplateProviderError | null;
  headerHandle: null;
};

export type MetaTemplateSubmitResult =
  | MetaTemplateSubmitSuccess
  | MetaTemplateSubmitFailure;

export const META_TEMPLATE_PROVIDER_OPERATION_TIMEOUT_MS = 45_000;
export const META_TEMPLATE_PROVIDER_STAGE_TIMEOUT_MS = 20_000;

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
      | "meta_template_submit_uncertain"
      | "meta_template_submit_invalid_json"
      | "meta_template_sync_not_found"
      | "meta_template_sync_invalid_json"
      | "meta_template_sync_failed"
      | "meta_template_media_required"
      | "meta_template_media_invalid"
      | "meta_template_media_upload_failed"
      | "meta_template_media_upload_uncertain",
    public readonly status?: number,
    public readonly errorBody?: string,
    public readonly diagnostic?: MetaTemplateProviderError
  ) {
    super(message);
    this.name = "MetaTemplateServiceError";
  }
}

export function validateMetaTemplateSubmissionConfig(params: {
  tenantConfig: TenantMetaTemplateConfig;
  headerType: TemplateHeaderType;
}) {
  const businessToken = normalizeOptionalString(params.tenantConfig.businessToken);
  const wabaId = normalizeOptionalString(params.tenantConfig.wabaId);
  const appId = normalizeOptionalString(params.tenantConfig.appId);
  if (!businessToken || !wabaId || (params.headerType !== "NONE" && !appId)) {
    throw new MetaTemplateServiceError("meta_config_missing", "meta_config_missing", 400);
  }
  return { businessToken, wabaId, appId: appId || null };
}

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
        rawPayload: true,
      },
    }),
    resolveWhatsappTransportRoutingSettings({
      prisma,
      clientId: params.clientId,
    }),
  ]);
  const tenantBusinessToken = normalizeOptionalString(tenantMetaConfig?.businessToken);
  const tenantWabaId = normalizeOptionalString(tenantMetaConfig?.wabaId);
  const rawPayload = tenantMetaConfig?.rawPayload && typeof tenantMetaConfig.rawPayload === "object" && !Array.isArray(tenantMetaConfig.rawPayload)
    ? (tenantMetaConfig.rawPayload as Record<string, unknown>)
    : null;
  const currentEnv = getEnv();
  const tenantApp = resolveTenantMetaAppId({
    rawPayload,
    globalAppId: currentEnv.META_APP_ID,
    fallbackMode: currentEnv.META_APP_ID_FALLBACK_MODE,
  });
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
      appId: tenantApp.appId,
      source: "tenant_meta",
    };
  }

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
    appId: tenantApp.appId,
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

function buildMetaTemplatePayload(template: TemplateForMeta, headerHandle?: string | null): MetaTemplatePayload {
  const content = template.content.trim();
  const placeholderIndexes = extractPlaceholderIndexes(content);

  return {
    name: template.name.trim(),
    category: template.category.trim().toUpperCase(),
    language: template.language.trim(),
    components: [
      ...(normalizeTemplateHeaderType(template.headerType) !== "NONE" && headerHandle
        ? [{
            type: "HEADER" as const,
            format: normalizeTemplateHeaderType(template.headerType) as "IMAGE" | "VIDEO",
            example: { header_handle: [headerHandle] },
          }]
        : []),
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
    type: readSafeScalar(raw.type),
    userTitle: sanitizeMetaDiagnosticMessage(raw.error_user_title),
    userMessage: sanitizeMetaDiagnosticMessage(raw.error_user_msg),
    details: sanitizeMetaDiagnosticMessage(errorData?.details),
    traceId: readSafeScalar(raw.fbtrace_id),
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
  const headerType = normalizeTemplateHeaderType(template.headerType);
  if (headerType !== "NONE" && !normalizeOptionalString(template.exampleMediaId)) {
    throw new MetaTemplateValidationError("template_media_required");
  }
  if (headerType === "NONE" && normalizeOptionalString(template.exampleMediaId)) {
    throw new MetaTemplateValidationError("template_media_not_allowed");
  }
}

export async function submitTemplateToMeta(params: {
  tenantConfig: TenantMetaTemplateConfig;
  template: TemplateForMeta;
  exampleMedia?: { content: Buffer; mimeType: string; fileName: string; kind: "IMAGE" | "VIDEO" } | null;
}): Promise<MetaTemplateSubmitResult> {
  const providerDeadlineAtMs = Date.now() + META_TEMPLATE_PROVIDER_OPERATION_TIMEOUT_MS;
  validateTemplateForMeta(params.template);
  const headerType = normalizeTemplateHeaderType(params.template.headerType);
  const { businessToken, wabaId, appId } = validateMetaTemplateSubmissionConfig({
    tenantConfig: params.tenantConfig,
    headerType,
  });
  let headerHandle: string | null = null;
  if (headerType !== "NONE") {
    if (!params.exampleMedia || params.exampleMedia.kind !== headerType) {
      throw new MetaTemplateServiceError("meta_template_media_required", "meta_template_media_required", 400);
    }
    const uploaded = await uploadMetaTemplateExample({
      apiVersion: getEnv().WHATSAPP_API_VERSION,
      appId: appId!,
      accessToken: businessToken,
      content: params.exampleMedia.content,
      mimeType: params.exampleMedia.mimeType,
      fileName: params.exampleMedia.fileName,
      timeoutMs: META_TEMPLATE_PROVIDER_STAGE_TIMEOUT_MS,
      deadlineAtMs: providerDeadlineAtMs,
    });
    if (!uploaded.ok) {
      throw new MetaTemplateServiceError(
        uploaded.code,
        uploaded.code === "meta_upload_result_uncertain"
          ? "meta_template_media_upload_uncertain"
          : "meta_template_media_upload_failed",
        uploaded.status ?? 502,
        uploaded.diagnostic.message,
        uploaded.diagnostic
      );
    }
    headerHandle = uploaded.handle;
  }

  const payload = buildMetaTemplatePayload(params.template, headerHandle);
  const url = `https://graph.facebook.com/${getEnv().WHATSAPP_API_VERSION}/${wabaId}/message_templates`;

  const submitController = new AbortController();
  const submitTimeoutMs = boundedMetaProviderTimeoutMs({
    stageTimeoutMs: META_TEMPLATE_PROVIDER_STAGE_TIMEOUT_MS,
    deadlineAtMs: providerDeadlineAtMs,
  });
  const submitTimer = setTimeout(() => submitController.abort(), submitTimeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${businessToken}`,
      },
      body: JSON.stringify(payload),
      signal: submitController.signal,
    });
  } catch {
    clearTimeout(submitTimer);
    throw new MetaTemplateServiceError(
      "meta_template_submit_uncertain",
      "meta_template_submit_uncertain",
      502,
      undefined,
      {
        stage: "template_submission",
        httpStatus: null,
        code: null,
        subcode: null,
        type: null,
        userTitle: null,
        userMessage: null,
        details: null,
        traceId: null,
        message: "A submissao do template terminou sem resposta conclusiva da Meta.",
      }
    );
  }
  let rawText: string;
  try {
    rawText = await response.text();
  } catch {
    clearTimeout(submitTimer);
    throw new MetaTemplateServiceError(
      "meta_template_submit_uncertain",
      "meta_template_submit_uncertain",
      502,
      undefined,
      {
        stage: "template_submission",
        httpStatus: response.status,
        code: null,
        subcode: null,
        type: null,
        traceId: null,
        message: "A leitura da resposta da submissao foi interrompida.",
      }
    );
  }
  clearTimeout(submitTimer);
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
          "A Meta retornou uma resposta em formato invalido.",
          {
            stage: "template_submission",
            httpStatus: response.status,
            code: null,
            subcode: null,
            type: null,
            traceId: null,
            message: "A Meta retornou uma resposta em formato invalido.",
          }
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
      ? sanitizeMetaDiagnosticMessage((rawResponse.error as Record<string, unknown>).message)
      : null;

  if (!response.ok) {
    const extractedProviderError = extractMetaTemplateProviderError(rawResponse);
    const safeMessage =
      extractedProviderError?.userMessage ||
      extractedProviderError?.details ||
      errorMessage ||
      "A Meta recusou a submissao do template.";
    const providerError: MetaTemplateProviderError = {
      stage: "template_submission",
      httpStatus: response.status,
      code: extractedProviderError?.code ?? null,
      subcode: extractedProviderError?.subcode ?? null,
      type: extractedProviderError?.type ?? null,
      userTitle: extractedProviderError?.userTitle ?? null,
      userMessage: extractedProviderError?.userMessage ?? null,
      details: extractedProviderError?.details ?? null,
      traceId: extractedProviderError?.traceId ?? null,
      message: safeMessage,
    };
    return {
      ok: false,
      metaTemplateId: null,
      status,
      errorMessage: safeMessage,
      rawResponse,
      providerError,
      headerHandle: null,
    };
  }

  return {
    ok: true,
    metaTemplateId,
    status,
    errorMessage: null,
    rawResponse: rawResponse ?? {},
    providerError: null,
    headerHandle,
  };
}

export function normalizeMetaTemplateSyncStatus(input: unknown): "pending" | "approved" | "rejected" | null {
  if (typeof input !== "string") return null;
  const normalized = input.trim().toUpperCase();
  if (normalized === "PENDING") return "pending";
  if (normalized === "APPROVED") return "approved";
  if (normalized === "REJECTED") return "rejected";
  return null;
}

type MetaTemplateSyncMatch = {
  id: string;
  name: string;
  language: string;
  status: "pending" | "approved" | "rejected";
  raw: Record<string, unknown>;
};

export function selectMetaTemplateSyncMatch(params: {
  items: unknown;
  expectedName: string;
  expectedLanguage: string;
  expectedMetaTemplateId?: string | null;
}):
  | { ok: true; match: MetaTemplateSyncMatch }
  | { ok: false; reason: "invalid_response" | "not_found" | "ambiguous" | "identity_mismatch" | "unknown_status" } {
  if (!Array.isArray(params.items)) return { ok: false, reason: "invalid_response" };
  const named = params.items.filter((item): item is Record<string, unknown> => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    return item.name === params.expectedName && item.language === params.expectedLanguage;
  });
  const candidates = params.expectedMetaTemplateId
    ? named.filter((item) => item.id === params.expectedMetaTemplateId)
    : named;
  if (candidates.length === 0) {
    if (params.expectedMetaTemplateId && named.length > 0) {
      return { ok: false, reason: "identity_mismatch" };
    }
    return { ok: false, reason: "not_found" };
  }
  if (candidates.length !== 1) return { ok: false, reason: "ambiguous" };
  const raw = candidates[0];
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const status = normalizeMetaTemplateSyncStatus(raw.status);
  if (!id) return { ok: false, reason: "invalid_response" };
  if (!status) return { ok: false, reason: "unknown_status" };
  return {
    ok: true,
    match: {
      id,
      name: params.expectedName,
      language: params.expectedLanguage,
      status,
      raw,
    },
  };
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
      content: true,
      status: true,
      metaTemplateId: true,
      components: true,
      headerType: true,
      exampleMediaId: true,
      updatedAt: true,
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
  const url = `https://graph.facebook.com/${getEnv().WHATSAPP_API_VERSION}/${credentials.wabaId}/message_templates?${params.toString()}`;
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

  const selected = selectMetaTemplateSyncMatch({
    items: rawResponse?.data,
    expectedName: template.name,
    expectedLanguage: template.language,
    expectedMetaTemplateId: template.metaTemplateId,
  });

  if (!selected.ok) {
    logger.info({
      event: "template.status.not_confirmed",
      templateId: template.id,
      clientKey: template.client.clientKey,
      templateName: template.name,
      wabaId: credentials.wabaId,
      credentialSource: credentials.source,
      reason: selected.reason,
    });
    return {
      ok: false as const,
      templateId: template.id,
      status: template.status,
      rejectionReason: null,
      updated: false,
      reason: selected.reason,
    };
  }

  const typedMatch = selected.match.raw;
  const currentStatus = normalizeMetaTemplateSyncStatus(template.status);
  const nextStatus =
    selected.match.status === "pending" && (currentStatus === "approved" || currentStatus === "rejected")
      ? currentStatus
      : selected.match.status;
  const metaCategory = normalizeMetaTemplateCategory(typedMatch.category);
  const rejectionReason = extractMetaRejectionReason(typedMatch);
  const providerComponents = Array.isArray(typedMatch.components) ? typedMatch.components : null;
  const nextComponents = providerComponents
    ? mergeProviderTemplateComponents({
        current: template.components,
        fallback: {
          body: template.content,
          headerType: template.headerType,
          exampleMediaId: template.exampleMediaId,
        },
        providerComponents,
      })
    : readCanonicalTemplateComponents(template.components, {
        body: template.content,
        headerType: template.headerType,
        exampleMediaId: template.exampleMediaId,
      });
  const submittedCategory = normalizeMetaTemplateCategory(template.submittedCategory);
  const nextCategory = metaCategory ?? template.category;
  const nextWasRecategorized = Boolean(
    submittedCategory && metaCategory && metaCategory !== submittedCategory
  );

  if (
    template.metaTemplateId === selected.match.id &&
    normalizeMetaTemplateSyncStatus(template.status) === nextStatus &&
    !providerComponents &&
    nextCategory === template.category &&
    nextWasRecategorized === template.wasRecategorized
  ) {
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

  const claimed = await prisma.template.updateMany({
    where: { id: template.id, updatedAt: template.updatedAt },
    data: {
      metaTemplateId: selected.match.id,
      category: nextCategory,
      submittedCategory: submittedCategory ?? undefined,
      wasRecategorized: nextWasRecategorized,
      components: nextComponents as unknown as import("@prisma/client").Prisma.InputJsonValue,
      headerType: nextComponents.header.type,
      status: nextStatus,
      rejectionReason: nextStatus === "rejected" ? rejectionReason ?? undefined : null,
    },
  });
  const updated = await prisma.template.findUniqueOrThrow({
    where: { id: template.id },
    select: {
      id: true,
      metaTemplateId: true,
      category: true,
      submittedCategory: true,
      wasRecategorized: true,
      status: true,
      rejectionReason: true,
    },
  });
  if (claimed.count !== 1) {
    const alreadyReconciled =
      updated.metaTemplateId === selected.match.id &&
      normalizeMetaTemplateSyncStatus(updated.status) === nextStatus;
    return {
      ok: alreadyReconciled,
      templateId: updated.id,
      category: updated.category,
      submittedCategory: updated.submittedCategory,
      wasRecategorized: updated.wasRecategorized,
      status: updated.status,
      rejectionReason: updated.rejectionReason,
      updated: false,
      ...(!alreadyReconciled ? { reason: "concurrent_change" as const } : {}),
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
