import { env } from "../config/env.js";

type SendResult = {
  ok: boolean;
  status?: number;
  messageId?: string;
  errorBody?: string;
  requestDiagnostic?: WhatsAppTextMessageRequestDiagnostic;
};

type TenantSendCredentials = {
  accessToken?: string;
  phoneNumberId?: string;
};

export type TenantMediaCredentials = {
  accessToken?: string;
  phoneNumberId?: string;
};

export type FetchMediaResult =
  | {
      ok: true;
      response: Response;
      contentType: string | null;
      contentLength: string | null;
      fileName: string | null;
    }
  | { ok: false; status?: number; errorBody?: string };

export type UploadMediaResult =
  | {
      ok: true;
      status?: number;
      mediaId: string;
    }
  | { ok: false; status?: number; errorBody?: string };

export type SendMediaKind = "image" | "document" | "audio" | "video";

type WhatsAppTextMessagePayload = {
  messaging_product: "whatsapp";
  to: string;
  context?: { message_id: string };
  type: "text";
  text: { body: string };
};

export type WhatsAppTextMessageRequestDiagnostic = {
  messageType: "text";
  contextPresent: boolean;
  contextMessageIdPresent: boolean;
  replyToOriginalType: string | null;
};

export function buildWhatsAppTextMessagePayload(
  to: string,
  body: string,
  options?: { replyToMetaMessageId?: string | null }
): WhatsAppTextMessagePayload {
  return {
    messaging_product: "whatsapp",
    to,
    ...(options?.replyToMetaMessageId
      ? { context: { message_id: options.replyToMetaMessageId } }
      : {}),
    type: "text",
    text: { body },
  };
}

export function buildWhatsAppTextMessageRequestDiagnostic(
  payload: WhatsAppTextMessagePayload,
  options?: { replyToOriginalType?: string | null }
): WhatsAppTextMessageRequestDiagnostic {
  return {
    messageType: payload.type,
    contextPresent: Boolean(payload.context),
    contextMessageIdPresent: Boolean(payload.context?.message_id),
    replyToOriginalType: options?.replyToOriginalType ?? null,
  };
}

export async function sendTextMessage(
  to: string,
  body: string,
  credentials?: TenantSendCredentials,
  options?: { replyToMetaMessageId?: string | null; replyToOriginalType?: string | null }
): Promise<SendResult> {
  const phoneNumberId = credentials?.phoneNumberId?.trim() || env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = credentials?.accessToken?.trim() || env.WHATSAPP_ACCESS_TOKEN;
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;
  const payload = buildWhatsAppTextMessagePayload(to, body, options);
  const requestDiagnostic = buildWhatsAppTextMessageRequestDiagnostic(payload, {
    replyToOriginalType: options?.replyToOriginalType ?? null,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      let messageId: string | undefined;
      try {
        const json = (await response.json()) as { messages?: Array<{ id?: string }> };
        messageId = json.messages?.[0]?.id;
      } catch {
        // ignore parse errors
      }

      return { ok: true, status: response.status, messageId, requestDiagnostic };
    }

    const errorText = await response.text().catch(() => "");
    return { ok: false, status: response.status, errorBody: errorText.slice(0, 500), requestDiagnostic };
  } catch {
    clearTimeout(timeout);
    return { ok: false, requestDiagnostic };
  }
}

export async function sendTemplateMessage(
  to: string,
  templateName: string,
  languageCode = "en_US",
  credentials?: TenantSendCredentials
): Promise<SendResult> {
  const phoneNumberId = credentials?.phoneNumberId?.trim() || env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = credentials?.accessToken?.trim() || env.WHATSAPP_ACCESS_TOKEN;
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      let messageId: string | undefined;
      try {
        const json = (await response.json()) as { messages?: Array<{ id?: string }> };
        messageId = json.messages?.[0]?.id;
      } catch {
        // ignore parse errors
      }

      return { ok: true, status: response.status, messageId };
    }

    const errorText = await response.text().catch(() => "");
    return { ok: false, status: response.status, errorBody: errorText.slice(0, 500) };
  } catch {
    clearTimeout(timeout);
    return { ok: false };
  }
}

export async function uploadMedia(
  file: Blob,
  mimeType: string,
  credentials?: TenantMediaCredentials,
  fileName?: string | null
): Promise<UploadMediaResult> {
  const phoneNumberId = credentials?.phoneNumberId?.trim() || env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = credentials?.accessToken?.trim() || env.WHATSAPP_ACCESS_TOKEN;
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${phoneNumberId}/media`;
  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append("type", mimeType);
  const normalizedFileName = String(fileName ?? "").trim() || `upload.${mimeType.includes("ogg") ? "ogg" : "bin"}`;
  formData.append("file", new File([file], normalizedFileName, { type: mimeType }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const json = (await response.json()) as { id?: string };
      const mediaId = String(json.id ?? "").trim();
      if (!mediaId) {
        return { ok: false, status: 502, errorBody: "media_id_missing" };
      }
      return { ok: true, status: response.status, mediaId };
    }

    const errorText = await response.text().catch(() => "");
    return { ok: false, status: response.status, errorBody: errorText.slice(0, 500) };
  } catch {
    clearTimeout(timeout);
    return { ok: false };
  }
}

export async function sendMediaMessage(params: {
  to: string;
  kind: SendMediaKind;
  mediaId: string;
  caption?: string | null;
  fileName?: string | null;
  credentials?: TenantSendCredentials;
}): Promise<SendResult> {
  const phoneNumberId = params.credentials?.phoneNumberId?.trim() || env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = params.credentials?.accessToken?.trim() || env.WHATSAPP_ACCESS_TOKEN;
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;
  const payload =
    params.kind === "image"
      ? {
          messaging_product: "whatsapp",
          to: params.to,
          type: "image",
          image: {
            id: params.mediaId,
            ...(params.caption ? { caption: params.caption } : {}),
          },
        }
      : params.kind === "document"
        ? {
            messaging_product: "whatsapp",
            to: params.to,
            type: "document",
            document: {
              id: params.mediaId,
              ...(params.fileName ? { filename: params.fileName } : {}),
              ...(params.caption ? { caption: params.caption } : {}),
            },
          }
        : params.kind === "audio"
          ? {
              messaging_product: "whatsapp",
              to: params.to,
              type: "audio",
              audio: {
                id: params.mediaId,
              },
            }
          : {
              messaging_product: "whatsapp",
              to: params.to,
              type: "video",
              video: {
                id: params.mediaId,
                ...(params.caption ? { caption: params.caption } : {}),
              },
            };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      let messageId: string | undefined;
      try {
        const json = (await response.json()) as { messages?: Array<{ id?: string }> };
        messageId = json.messages?.[0]?.id;
      } catch {
        // ignore parse errors
      }
      return { ok: true, status: response.status, messageId };
    }

    const errorText = await response.text().catch(() => "");
    return { ok: false, status: response.status, errorBody: errorText.slice(0, 500) };
  } catch {
    clearTimeout(timeout);
    return { ok: false };
  }
}

export async function fetchMediaContent(
  mediaId: string,
  credentials?: TenantMediaCredentials
): Promise<FetchMediaResult> {
  const accessToken = credentials?.accessToken?.trim() || env.WHATSAPP_ACCESS_TOKEN;
  const metadataUrl = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${encodeURIComponent(mediaId)}`;
  const metadataController = new AbortController();
  const metadataTimeout = setTimeout(() => metadataController.abort(), 10000);

  try {
    const metadataResponse = await fetch(metadataUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: metadataController.signal,
    });
    clearTimeout(metadataTimeout);

    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text().catch(() => "");
      return { ok: false, status: metadataResponse.status, errorBody: errorText.slice(0, 500) };
    }

    const metadata = (await metadataResponse.json()) as {
      url?: string;
      mime_type?: string;
      file_size?: number;
    };
    const mediaUrl = String(metadata.url ?? "").trim();
    if (!mediaUrl) {
      return { ok: false, status: 502, errorBody: "media_url_missing" };
    }

    const mediaController = new AbortController();
    const mediaTimeout = setTimeout(() => mediaController.abort(), 20000);
    const mediaResponse = await fetch(mediaUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: mediaController.signal,
    });
    clearTimeout(mediaTimeout);

    if (!mediaResponse.ok) {
      const errorText = await mediaResponse.text().catch(() => "");
      return { ok: false, status: mediaResponse.status, errorBody: errorText.slice(0, 500) };
    }

    const contentDisposition = mediaResponse.headers.get("content-disposition");
    const fileNameMatch = contentDisposition?.match(/filename\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?/i);
    const encodedFileName = fileNameMatch?.[1] ?? fileNameMatch?.[2] ?? null;

    return {
      ok: true,
      response: mediaResponse,
      contentType: mediaResponse.headers.get("content-type") || metadata.mime_type || null,
      contentLength: mediaResponse.headers.get("content-length"),
      fileName: encodedFileName ? decodeURIComponent(encodedFileName) : null,
    };
  } catch {
    clearTimeout(metadataTimeout);
    return { ok: false };
  }
}
