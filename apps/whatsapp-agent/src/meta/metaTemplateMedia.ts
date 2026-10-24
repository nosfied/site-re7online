export type MetaTemplateUploadStage =
  | "session_creation"
  | "session_creation_not_started"
  | "session_response_read"
  | "session_response_validation"
  | "binary_upload"
  | "binary_upload_not_started"
  | "binary_response_read"
  | "binary_response_validation";

export type MetaTemplateUploadDiagnostic = {
  stage: MetaTemplateUploadStage;
  httpStatus: number | null;
  code: string | null;
  subcode: string | null;
  type: string | null;
  traceId: string | null;
  message: string;
};

export type MetaResumableUploadResult =
  | { ok: true; handle: string }
  | {
      ok: false;
      code: "meta_upload_failed" | "meta_upload_invalid_response" | "meta_upload_result_uncertain" | "meta_upload_budget_exhausted";
      status: number | null;
      diagnostic: MetaTemplateUploadDiagnostic;
    };

const MAX_DIAGNOSTIC_MESSAGE_LENGTH = 500;

function safeScalar(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const normalized = String(value).trim();
  return /^[A-Za-z0-9_.-]{1,120}$/.test(normalized) ? normalized : null;
}

export function sanitizeMetaDiagnosticMessage(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/https?:\/\/\S+/gi, "[URL removida]")
    .replace(/\b(Bearer|OAuth)\s+\S+/gi, "$1 [credencial removida]")
    .replace(/\b(access[_ -]?token|app[_ -]?secret|authorization|session[_ -]?id|media[_ -]?handle)\b\s*[:=]\s*\S+/gi, "$1=[removido]")
    .replace(/\bupload:[^\s,;]+/gi, "[sessao removida]")
    .replace(/\b[A-Za-z0-9_=-]{32,}\b/g, "[identificador removido]")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  return normalized.slice(0, MAX_DIAGNOSTIC_MESSAGE_LENGTH);
}

function diagnosticFromPayload(params: {
  stage: MetaTemplateUploadStage;
  status: number | null;
  payload: unknown;
  fallbackMessage: string;
}): MetaTemplateUploadDiagnostic {
  const root = params.payload && typeof params.payload === "object" && !Array.isArray(params.payload)
    ? params.payload as Record<string, unknown>
    : null;
  const error = root?.error && typeof root.error === "object" && !Array.isArray(root.error)
    ? root.error as Record<string, unknown>
    : null;
  const errorData = error?.error_data && typeof error.error_data === "object" && !Array.isArray(error.error_data)
    ? error.error_data as Record<string, unknown>
    : null;
  const message = sanitizeMetaDiagnosticMessage(
    error?.error_user_msg ?? errorData?.details ?? error?.message ?? root?.message
  ) ?? params.fallbackMessage;
  return {
    stage: params.stage,
    httpStatus: params.status,
    code: safeScalar(error?.code),
    subcode: safeScalar(error?.error_subcode),
    type: safeScalar(error?.type),
    traceId: safeScalar(error?.fbtrace_id),
    message,
  };
}

async function readProviderResponse(
  response: Response,
  operation: "session" | "binary"
): Promise<
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; kind: "read" | "empty" | "invalid"; diagnostic: MetaTemplateUploadDiagnostic }
> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return {
      ok: false,
      kind: "read",
      diagnostic: diagnosticFromPayload({
        stage: operation === "session" ? "session_response_read" : "binary_response_read",
        status: response.status,
        payload: null,
        fallbackMessage: "A leitura da resposta da Meta foi interrompida.",
      }),
    };
  }
  if (!text.trim()) {
    return {
      ok: false,
      kind: "empty",
      diagnostic: diagnosticFromPayload({
        stage: operation === "session" ? "session_response_validation" : "binary_response_validation",
        status: response.status,
        payload: null,
        fallbackMessage: "A Meta retornou uma resposta vazia.",
      }),
    };
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_payload");
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      kind: "invalid",
      diagnostic: diagnosticFromPayload({
        stage: operation === "session" ? "session_response_validation" : "binary_response_validation",
        status: response.status,
        payload: null,
        fallbackMessage: "A Meta retornou uma resposta em formato invalido.",
      }),
    };
  }
}

function timeoutDiagnostic(stage: "session_creation" | "binary_upload"): MetaTemplateUploadDiagnostic {
  return {
    stage,
    httpStatus: null,
    code: null,
    subcode: null,
    type: null,
    traceId: null,
    message: "A operacao com a Meta terminou sem resposta conclusiva.",
  };
}

const META_GRAPH_ORIGIN = "https://graph.facebook.com";
const META_API_VERSION_PATTERN = /^v[0-9]+\.[0-9]+$/;
const UPLOAD_SESSION_PATH_PATTERN = /^upload:[A-Za-z0-9._~!$'()*+,;=:@%-]+$/;
const UPLOAD_SESSION_SIGNATURE_PATTERN = /^sig=[A-Za-z0-9._~!$'()*+,;=:@\/%+-]+$/;

function hasInvalidPercentEscape(value: string) {
  return /%(?![0-9A-Fa-f]{2})/.test(value);
}

function uploadSessionUrl(apiVersion: string, sessionId: string) {
  if (!META_API_VERSION_PATTERN.test(apiVersion)) return null;
  if (sessionId !== sessionId.trim() || /[\\#\u0000-\u001f\u007f]/.test(sessionId)) return null;

  const querySeparator = sessionId.indexOf("?");
  const sessionPath = querySeparator === -1 ? sessionId : sessionId.slice(0, querySeparator);
  const signatureQuery = querySeparator === -1 ? null : sessionId.slice(querySeparator + 1);
  if (
    !UPLOAD_SESSION_PATH_PATTERN.test(sessionPath)
    || hasInvalidPercentEscape(sessionPath)
    || (signatureQuery !== null && (
      !UPLOAD_SESSION_SIGNATURE_PATTERN.test(signatureQuery)
      || hasInvalidPercentEscape(signatureQuery)
    ))
  ) {
    return null;
  }

  return `${META_GRAPH_ORIGIN}/${apiVersion}/${sessionPath}${signatureQuery === null ? "" : `?${signatureQuery}`}`;
}

export function boundedMetaProviderTimeoutMs(params: {
  stageTimeoutMs: number;
  deadlineAtMs?: number;
  nowMs?: number;
}) {
  const remainingMs = params.deadlineAtMs == null
    ? params.stageTimeoutMs
    : params.deadlineAtMs - (params.nowMs ?? Date.now());
  if (remainingMs <= 0) return null;
  return Math.min(params.stageTimeoutMs, remainingMs);
}

function budgetExhaustedDiagnostic(
  stage: "session_creation_not_started" | "binary_upload_not_started"
): MetaTemplateUploadDiagnostic {
  return {
    stage,
    httpStatus: null,
    code: null,
    subcode: null,
    type: null,
    traceId: null,
    message: "A etapa nao foi iniciada porque o prazo da operacao se esgotou.",
  };
}

export async function uploadMetaTemplateExample(params: {
  apiVersion: string;
  appId: string;
  accessToken: string;
  content: Buffer;
  mimeType: string;
  fileName: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  deadlineAtMs?: number;
  nowMs?: () => number;
}): Promise<MetaResumableUploadResult> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const timeoutMs = params.timeoutMs ?? 20_000;
  const stageTimeoutMs = () => boundedMetaProviderTimeoutMs({
    stageTimeoutMs: timeoutMs,
    deadlineAtMs: params.deadlineAtMs,
    nowMs: params.nowMs?.(),
  });
  const sessionTimeoutMs = stageTimeoutMs();
  if (sessionTimeoutMs === null) {
    return {
      ok: false,
      code: "meta_upload_budget_exhausted",
      status: null,
      diagnostic: budgetExhaustedDiagnostic("session_creation_not_started"),
    };
  }
  const sessionController = new AbortController();
  const sessionTimer = setTimeout(() => sessionController.abort(), sessionTimeoutMs);
  let sessionResponse: Response;
  try {
    const query = new URLSearchParams({
      file_length: String(params.content.length),
      file_type: params.mimeType,
      file_name: params.fileName,
    });
    sessionResponse = await fetchImpl(
      `https://graph.facebook.com/${params.apiVersion}/${encodeURIComponent(params.appId)}/uploads?${query.toString()}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${params.accessToken}` },
        signal: sessionController.signal,
      }
    );
  } catch {
    clearTimeout(sessionTimer);
    return {
      ok: false,
      code: "meta_upload_result_uncertain",
      status: null,
      diagnostic: timeoutDiagnostic("session_creation"),
    };
  }
  const sessionBody = await readProviderResponse(sessionResponse, "session");
  clearTimeout(sessionTimer);
  if (!sessionBody.ok) {
    return {
      ok: false,
      code: sessionBody.kind === "read" ? "meta_upload_result_uncertain" : sessionResponse.ok ? "meta_upload_invalid_response" : "meta_upload_failed",
      status: sessionResponse.status,
      diagnostic: sessionBody.diagnostic,
    };
  }
  if (!sessionResponse.ok) {
    return {
      ok: false,
      code: "meta_upload_failed",
      status: sessionResponse.status,
      diagnostic: diagnosticFromPayload({
        stage: "session_creation",
        status: sessionResponse.status,
        payload: sessionBody.value,
        fallbackMessage: "A Meta recusou a criacao da sessao de upload.",
      }),
    };
  }
  const sessionId = typeof sessionBody.value.id === "string" ? sessionBody.value.id : "";
  if (!sessionId.trim()) {
    return {
      ok: false,
      code: "meta_upload_invalid_response",
      status: sessionResponse.status,
      diagnostic: diagnosticFromPayload({
        stage: "session_response_validation",
        status: sessionResponse.status,
        payload: sessionBody.value,
        fallbackMessage: "A resposta da Meta nao informou uma sessao de upload valida.",
      }),
    };
  }
  const sessionUrl = uploadSessionUrl(params.apiVersion, sessionId);
  if (!sessionUrl) {
    return {
      ok: false,
      code: "meta_upload_invalid_response",
      status: sessionResponse.status,
      diagnostic: diagnosticFromPayload({
        stage: "session_response_validation",
        status: sessionResponse.status,
        payload: null,
        fallbackMessage: "A resposta da Meta informou uma sessao de upload incompatível.",
      }),
    };
  }

  const uploadTimeoutMs = stageTimeoutMs();
  if (uploadTimeoutMs === null) {
    return {
      ok: false,
      code: "meta_upload_budget_exhausted",
      status: null,
      diagnostic: budgetExhaustedDiagnostic("binary_upload_not_started"),
    };
  }
  const uploadController = new AbortController();
  const uploadTimer = setTimeout(() => uploadController.abort(), uploadTimeoutMs);
  let uploadResponse: Response;
  try {
    uploadResponse = await fetchImpl(sessionUrl, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${params.accessToken}`,
        "Content-Type": params.mimeType,
        file_offset: "0",
      },
      body: new Uint8Array(params.content),
      signal: uploadController.signal,
    });
  } catch {
    clearTimeout(uploadTimer);
    return {
      ok: false,
      code: "meta_upload_result_uncertain",
      status: null,
      diagnostic: timeoutDiagnostic("binary_upload"),
    };
  }
  const uploadBody = await readProviderResponse(uploadResponse, "binary");
  clearTimeout(uploadTimer);
  if (!uploadBody.ok) {
    return {
      ok: false,
      code: uploadBody.kind === "read" ? "meta_upload_result_uncertain" : uploadResponse.ok ? "meta_upload_invalid_response" : "meta_upload_failed",
      status: uploadResponse.status,
      diagnostic: uploadBody.diagnostic,
    };
  }
  if (!uploadResponse.ok) {
    return {
      ok: false,
      code: "meta_upload_failed",
      status: uploadResponse.status,
      diagnostic: diagnosticFromPayload({
        stage: "binary_upload",
        status: uploadResponse.status,
        payload: uploadBody.value,
        fallbackMessage: "A Meta recusou o envio dos bytes da midia.",
      }),
    };
  }
  const handle = typeof uploadBody.value.h === "string" ? uploadBody.value.h.trim() : "";
  if (!handle) {
    return {
      ok: false,
      code: "meta_upload_invalid_response",
      status: uploadResponse.status,
      diagnostic: diagnosticFromPayload({
        stage: "binary_response_validation",
        status: uploadResponse.status,
        payload: uploadBody.value,
        fallbackMessage: "A resposta da Meta nao informou um identificador de midia valido.",
      }),
    };
  }
  return { ok: true, handle };
}
