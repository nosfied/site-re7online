export type MetaResumableUploadResult =
  | { ok: true; handle: string; sessionId: string }
  | {
      ok: false;
      code: "meta_upload_failed" | "meta_upload_invalid_response" | "meta_upload_result_uncertain";
      status: number | null;
      details: string | null;
      sessionId: string | null;
    };

function safeProviderDetails(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const error = (value as Record<string, unknown>).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  const raw = error as Record<string, unknown>;
  const code = typeof raw.code === "number" || typeof raw.code === "string" ? String(raw.code) : null;
  const subcode = typeof raw.error_subcode === "number" || typeof raw.error_subcode === "string"
    ? String(raw.error_subcode)
    : null;
  const message = typeof raw.error_user_msg === "string"
    ? raw.error_user_msg
    : typeof raw.message === "string"
      ? raw.message
      : null;
  return [code && `code=${code}`, subcode && `subcode=${subcode}`, message?.slice(0, 500)].filter(Boolean).join("; ") || null;
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
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
}): Promise<MetaResumableUploadResult> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const timeoutMs = params.timeoutMs ?? 20_000;
  const sessionController = new AbortController();
  const sessionTimer = setTimeout(() => sessionController.abort(), timeoutMs);
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
    return { ok: false, code: "meta_upload_result_uncertain", status: null, details: null, sessionId: null };
  }
  clearTimeout(sessionTimer);
  const sessionJson = await readJson(sessionResponse);
  const sessionId = typeof sessionJson?.id === "string" ? sessionJson.id.trim() : "";
  if (!sessionResponse.ok) {
    return {
      ok: false,
      code: "meta_upload_failed",
      status: sessionResponse.status,
      details: safeProviderDetails(sessionJson),
      sessionId: null,
    };
  }
  if (!sessionId) {
    return { ok: false, code: "meta_upload_invalid_response", status: sessionResponse.status, details: null, sessionId: null };
  }

  const uploadController = new AbortController();
  const uploadTimer = setTimeout(() => uploadController.abort(), timeoutMs);
  let uploadResponse: Response;
  try {
    uploadResponse = await fetchImpl(
      `https://graph.facebook.com/${params.apiVersion}/${encodeURIComponent(sessionId)}`,
      {
        method: "POST",
        headers: {
          Authorization: `OAuth ${params.accessToken}`,
          "Content-Type": params.mimeType,
          file_offset: "0",
        },
        body: new Uint8Array(params.content),
        signal: uploadController.signal,
      }
    );
  } catch {
    clearTimeout(uploadTimer);
    return { ok: false, code: "meta_upload_result_uncertain", status: null, details: null, sessionId };
  }
  clearTimeout(uploadTimer);
  const uploadJson = await readJson(uploadResponse);
  const handle = typeof uploadJson?.h === "string" ? uploadJson.h.trim() : "";
  if (!uploadResponse.ok) {
    return {
      ok: false,
      code: "meta_upload_failed",
      status: uploadResponse.status,
      details: safeProviderDetails(uploadJson),
      sessionId,
    };
  }
  if (!handle) {
    return { ok: false, code: "meta_upload_invalid_response", status: uploadResponse.status, details: null, sessionId };
  }
  return { ok: true, handle, sessionId };
}
