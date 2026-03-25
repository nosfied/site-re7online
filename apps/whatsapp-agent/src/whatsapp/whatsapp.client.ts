import { env } from "../config/env.js";

type SendResult = {
  ok: boolean;
  status?: number;
  messageId?: string;
  errorBody?: string;
};

type TenantSendCredentials = {
  accessToken?: string;
  phoneNumberId?: string;
};

export async function sendTextMessage(
  to: string,
  body: string,
  credentials?: TenantSendCredentials
): Promise<SendResult> {
  const phoneNumberId = credentials?.phoneNumberId?.trim() || env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = credentials?.accessToken?.trim() || env.WHATSAPP_ACCESS_TOKEN;
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
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
