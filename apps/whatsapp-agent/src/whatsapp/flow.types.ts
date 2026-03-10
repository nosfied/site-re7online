import { ConversationState } from "../conversation/conversation.types.js";
import type { ParsedLeadFields } from "../conversation/conversation.service.js";
import { NormalizedMessage } from "../domain/whatsapp/types.js";

export type FlowContext = {
  tenantId: string;
  clientKey: string;
  requestId?: string;
  meta?: {
    route?: string;
    method?: string;
  };
  message: NormalizedMessage;
  conversation: ConversationState;
};

export type FlowMatch = {
  flowKey: "quote_site" | "lead_capture";
};

export type FlowResult = {
  flowKey?: FlowMatch["flowKey"];
  handled: boolean;
  stopPipeline?: boolean;
  state?: ConversationState;
  replyText?: string;
  leadAction?: "captured" | "requested";
  demoAction?: "requested" | "scheduled" | "quick_reply";
  demoStateUpdated?: boolean;
  scheduleExtract?: string;
  hasDemoSignal?: boolean;
  parsedLead?: ParsedLeadFields;
};

export type AppliedFlowResult = FlowResult;

export type PostDemoFlowContext = FlowContext & {
  nowMs: number;
  leadWindowMs: number;
  demoHandled: boolean;
  leadReplyText?: string;
  parsedLead?: ParsedLeadFields;
};

export type MidDemoFlowContext = FlowContext & {
  nowMs: number;
  demoHandled: boolean;
};
