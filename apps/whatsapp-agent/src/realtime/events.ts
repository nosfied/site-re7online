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
      departmentId?: string | null;
      message: InboxRealtimeMessage;
    }
  | {
      type: "message.status.updated";
      clientId: string;
      waId?: string | null;
      waIdCanonical?: string | null;
      messageId?: string | null;
      metaMessageId?: string | null;
      status: "SENT" | "DELIVERED" | "READ" | "FAILED";
      errorBody?: string | null;
      updatedAt: string;
    }
  | {
      type: "conversation.handoff.updated";
      clientId: string;
      waId: string;
      waIdCanonical?: string | null;
      mode: "HUMAN";
      handoffStatus: "pending" | "active";
      departmentId?: string | null;
      updatedAt: string;
    };
