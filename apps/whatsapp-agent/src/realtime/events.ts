export type InboxRealtimeMessage = {
  direction: "INBOUND";
  type: string;
  status: "RECEIVED";
  intent: null;
  bodyText: string | null;
  media?: unknown;
  templateName: null;
  templateLang: null;
  requestId: string | null;
  messageId: string | null;
  metaMessageId: null;
  errorBody: null;
  createdAt: string;
};

export type InboxRealtimeEvent =
  | {
      type: "message.created";
      clientId: string;
      waId: string;
      waIdCanonical?: string | null;
      mode?: "BOT" | "HUMAN" | null;
      handoffStatus?: "none" | "pending" | "active" | null;
      message: InboxRealtimeMessage;
    };
