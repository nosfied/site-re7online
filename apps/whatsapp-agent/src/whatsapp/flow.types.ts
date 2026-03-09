import { ConversationState } from "../conversation/conversation.types.js";
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
  flowKey: string;
};

export type FlowResult = {
  handled: boolean;
  stopPipeline?: boolean;
  state?: ConversationState;
  replyText?: string;
};

export type AppliedFlowResult = FlowResult;
