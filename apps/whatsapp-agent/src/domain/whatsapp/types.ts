export type MessageType = "text" | "image" | "audio" | "video" | "document" | "unknown" | "template";

export type NormalizedMediaPayload = {
  mediaId?: string;
  mimeType?: string;
  fileName?: string;
  caption?: string;
  sha256?: string;
};

export type NormalizedMessage = {
  messageId: string;
  from: string;
  profileName?: string | null;
  timestamp: string;
  type: MessageType;
  text: string | null;
  raw?: Record<string, unknown>;
};

export type NormalizeResult = {
  messages: NormalizedMessage[];
  reason?: string;
};
