import { env } from "../config/env.js";
import { AgentBrain, AgentReply } from "./agent.types.js";
import { OpenAIBrain } from "./openai.brain.js";

class FallbackBrain implements AgentBrain {
  async generateReply(): Promise<AgentReply> {
    return { text: "", source: "fallback" };
  }
}

export function createAgentBrain(): AgentBrain {
  if (!env.WHATSAPP_AI_ENABLED || !env.OPENAI_API_KEY) {
    return new FallbackBrain();
  }
  return new OpenAIBrain();
}
