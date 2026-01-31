import { ConversationIntent } from "../conversation/conversation.types.js";

export type AgentInput = {
  waId: string;
  intent: ConversationIntent;
  lastMessages: string[];
  inboundText: string;
  nowIso: string;
  businessContext?: string;
};

export type AgentReply = {
  text: string;
  source: "ai" | "rule" | "fallback";
  model?: string;
  usage?: unknown;
};

export interface AgentBrain {
  generateReply(input: AgentInput): Promise<AgentReply>;
}
