export type MessageType = "text" | "image" | "audio" | "video" | "document" | "unknown" | "template";

export type NormalizedMessage = {
  messageId: string;
  from: string;
  timestamp: string;
  type: MessageType;
  text: string | null;
  raw?: Record<string, unknown>;
};

export type NormalizeResult = {
  messages: NormalizedMessage[];
  reason?: string;
};
