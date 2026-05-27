import { NormalizeResult, NormalizedMediaPayload, NormalizedMessage, MessageType } from "./types.js";

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
          image?: {
            id?: string;
            mime_type?: string;
            caption?: string;
            sha256?: string;
          };
          audio?: {
            id?: string;
            mime_type?: string;
            sha256?: string;
          };
          video?: {
            id?: string;
            mime_type?: string;
            caption?: string;
            sha256?: string;
          };
          document?: {
            id?: string;
            mime_type?: string;
            caption?: string;
            sha256?: string;
            filename?: string;
          };
        }>;
      };
    }>;
  }>;
};

type IncomingMessagePayload = NonNullable<
  NonNullable<NonNullable<NonNullable<IncomingPayload["entry"]>[number]["changes"]>[number]["value"]>["messages"]
>[number];

function mapType(type?: string): MessageType {
  if (type === "text") return "text";
  if (type === "image") return "image";
  if (type === "audio") return "audio";
  if (type === "video") return "video";
  if (type === "document") return "document";
  return "unknown";
}

function normalizeMediaPayload(message: IncomingMessagePayload, type: MessageType): NormalizedMediaPayload | null {
  if (type === "image") {
    const image = message.image;
    if (!image) return null;
    return {
      mediaId: image.id,
      mimeType: image.mime_type,
      caption: image.caption,
      sha256: image.sha256,
    };
  }
  if (type === "audio") {
    const audio = message.audio;
    if (!audio) return null;
    return {
      mediaId: audio.id,
      mimeType: audio.mime_type,
      sha256: audio.sha256,
    };
  }
  if (type === "video") {
    const video = message.video;
    if (!video) return null;
    return {
      mediaId: video.id,
      mimeType: video.mime_type,
      caption: video.caption,
      sha256: video.sha256,
    };
  }
  if (type === "document") {
    const document = message.document;
    if (!document) return null;
    return {
      mediaId: document.id,
      mimeType: document.mime_type,
      fileName: document.filename,
      caption: document.caption,
      sha256: document.sha256,
    };
  }
  return null;
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
    const type = mapType(message.type);
    const media = normalizeMediaPayload(message, type);

    return {
      messageId: message.id ?? "unknown",
      from: message.from ?? "unknown",
      timestamp,
      type,
      text: message.text?.body ?? null,
      raw: {
        id: message.id,
        type: message.type,
        ...(media ? { media } : {}),
      },
    };
  });

  return { messages: normalized };
}
