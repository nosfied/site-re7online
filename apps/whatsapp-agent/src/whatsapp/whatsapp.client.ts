import { env } from "../config/env.js";

type SendResult = {
  ok: boolean;
  status?: number;
  messageId?: string;
  errorBody?: string;
};

export async function sendTextMessage(to: string, body: string): Promise<SendResult> {
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
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
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
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
