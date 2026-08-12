export type InboxRealtimeMessage = {
  internalMessageId?: string | null;
  messageKind?: "inbound" | "outbound" | string | null;
  direction: "INBOUND";
  type: string;
  status: "RECEIVED";
  intent: null;
  bodyText: string | null;
  location?: unknown;
  media?: unknown;
  templateName: null;
  templateLang: null;
  requestId: string | null;
  messageId: string | null;
  metaMessageId: null;
  errorBody: null;
  createdAt: string;
  replyTo?: {
    kind: "inbound" | "outbound";
    id: string;
    previewType?: string | null;
    mode?: "reply" | "rectify";
    previewBody?: string | null;
  } | null;
};

export type InboxRealtimeEvent =
  | {
      type: "message.created";
      clientId: string;
      waId: string;
      waIdCanonical?: string | null;
      mode?: "BOT" | "HUMAN" | null;
      handoffStatus?: "none" | "pending" | "active" | null;
      assignedUserId?: string | null;
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
      assignedUserId?: string | null;
      departmentId?: string | null;
      updatedAt: string;
      reason?: "released_to_general" | null;
      notificationMessage?: {
        messageId: string | null;
        type: string;
        bodyText: string | null;
        createdAt: string;
      } | null;
    };
