export type InboxRealtimeMessage = {
  inboxVisibility: "human_timeline" | "management_only";
  protocol?: string | null;
  cycleId?: string | null;
  internalMessageId?: string | null;
  messageKind?: "inbound" | "outbound" | string | null;
  direction: "INBOUND" | "OUTBOUND";
  type: string;
  status: "RECEIVED" | "SENT" | "DELIVERED" | "READ" | "FAILED";
  intent: string | null;
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
      humanInboxVisible: boolean;
      assignedUserId?: string | null;
      departmentId?: string | null;
      protocol?: string | null;
      cycleId?: string | null;
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
      mode?: "BOT" | "HUMAN" | null;
      handoffStatus?: "none" | "pending" | "active" | null;
      status?: string | null;
      humanInboxVisible?: boolean;
      assignedUserId?: string | null;
      assignedUserName?: string | null;
      assignedAt?: string | null;
      departmentId?: string | null;
      departmentName?: string | null;
      queueId?: string | null;
      queueName?: string | null;
      protocol?: string | null;
      cycleId?: string | null;
      closedAt?: string | null;
      lastInboundAt?: string | null;
      updatedAt: string;
      reason?: string | null;
      notificationMessage?: {
        messageId: string | null;
        type: string;
        bodyText: string | null;
        createdAt: string;
      } | null;
    }
  | {
      type: "conversation.read_state.updated";
      clientId: string;
      waId: string;
      waIdCanonical?: string | null;
      readState: {
        lastReadAtByConversationKey: Record<string, string>;
        manuallyUnreadByConversationKey: Record<string, boolean>;
      };
      unread: boolean;
      activityAt?: string | null;
      updatedAt: string;
    };
