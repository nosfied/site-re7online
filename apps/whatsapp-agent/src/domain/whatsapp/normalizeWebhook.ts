import { NormalizeResult, NormalizedMediaPayload, NormalizedMessage, MessageType } from "./types.js";

type IncomingPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{
          wa_id?: string;
          profile?: { name?: string };
        }>;
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
          location?: {
            latitude?: number;
            longitude?: number;
            name?: string;
            address?: string;
          };
          reaction?: {
            message_id?: string;
            emoji?: string;
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
  if (type === "location") return "location";
  return "unknown";
}

function isNonContentMessage(message: IncomingMessagePayload) {
  return message.type === "reaction";
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

function normalizeLocationPayload(message: IncomingMessagePayload) {
  const location = message.location;
  if (!location) return null;
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    name: typeof location.name === "string" && location.name.trim() ? location.name.trim().slice(0, 160) : null,
    address:
      typeof location.address === "string" && location.address.trim()
        ? location.address.trim().replace(/\s+/g, " ").slice(0, 300)
        : null,
  };
}

export function normalizeWebhook(payload: IncomingPayload): NormalizeResult {
  const value = payload.entry?.[0]?.changes?.[0]?.value;
  const messages = value?.messages;
  if (!messages || messages.length === 0) {
    return { messages: [], reason: "no_messages" };
  }
  const profileNameByWaId = new Map<string, string>();
  for (const contact of value?.contacts ?? []) {
    const waId = String(contact.wa_id ?? "").trim();
    const profileName = String(contact.profile?.name ?? "").replace(/\s+/g, " ").trim();
    if (waId && profileName) {
      profileNameByWaId.set(waId, profileName.slice(0, 120));
    }
  }

  const contentMessages = messages.filter((message) => !isNonContentMessage(message));
  if (contentMessages.length === 0) {
    return { messages: [], reason: "non_content_reaction" };
  }

  const normalized: NormalizedMessage[] = contentMessages.map((message) => {
    const timestamp = message.timestamp
      ? new Date(Number(message.timestamp) * 1000).toISOString()
      : new Date().toISOString();
    const type = mapType(message.type);
    const media = normalizeMediaPayload(message, type);
    const location = type === "location" ? normalizeLocationPayload(message) : null;

    return {
      messageId: message.id ?? "unknown",
      from: message.from ?? "unknown",
      profileName: profileNameByWaId.get(message.from ?? "") ?? null,
      timestamp,
      type,
      text: message.text?.body ?? null,
      raw: {
        id: message.id,
        type: message.type,
        ...(media ? { media } : {}),
        ...(location ? { location } : {}),
      },
    };
  });

  return { messages: normalized };
}
