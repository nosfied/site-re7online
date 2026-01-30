import { NormalizeResult, NormalizedMessage, MessageType } from "./types.js";

type IncomingPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
};

function mapType(type?: string): MessageType {
  if (type === "text") return "text";
  if (type === "image") return "image";
  if (type === "audio") return "audio";
  if (type === "video") return "video";
  if (type === "document") return "document";
  return "unknown";
}

export function normalizeWebhook(payload: IncomingPayload): NormalizeResult {
  const messages = payload.entry?.[0]?.changes?.[0]?.value?.messages;
  if (!messages || messages.length === 0) {
    return { messages: [], reason: "no_messages" };
  }

  const normalized: NormalizedMessage[] = messages.map((message) => {
    const timestamp = message.timestamp
      ? new Date(Number(message.timestamp) * 1000).toISOString()
      : new Date().toISOString();

    return {
      messageId: message.id ?? "unknown",
      from: message.from ?? "unknown",
      timestamp,
      type: mapType(message.type),
      text: message.text?.body ?? null,
      raw: {
        id: message.id,
        type: message.type,
      },
    };
  });

  return { messages: normalized };
}
