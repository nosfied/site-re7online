import OpenAI from "openai";
import { env } from "../config/env.js";
import { AgentBrain, AgentInput, AgentReply } from "./agent.types.js";

const DEFAULT_SYSTEM_PROMPT =
  "Você é um agente de atendimento da Re7Online. Responda em PT-BR, curto e direto. " +
  "Não prometa ações que não possam ser cumpridas e não peça dados sensíveis. " +
  "Se faltar contexto, faça uma pergunta objetiva.";

function buildUserPrompt(input: AgentInput) {
  const lastMessages = input.lastMessages.slice(-5).join("\n");
  const intent = input.intent ?? "unknown";
  return [
    `Contexto do negócio: ${input.businessContext ?? "não informado"}`,
    `Intent detectada: ${intent}`,
    `Últimas mensagens:`,
    lastMessages || "(sem histórico)",
    `Mensagem atual: ${input.inboundText}`,
    `Agora: ${input.nowIso}`,
  ].join("\n");
}

function sanitizeOutput(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.slice(0, 800);
}

export class OpenAIBrain implements AgentBrain {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  async generateReply(input: AgentInput): Promise<AgentReply> {
    const systemPrompt = env.WHATSAPP_AI_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;
    const userPrompt = buildUserPrompt(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.WHATSAPP_AI_TIMEOUT_MS);

    try {
      const response = await this.client.responses.create(
        {
          model: env.WHATSAPP_AI_MODEL,
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: systemPrompt }],
            },
            {
              role: "user",
              content: [{ type: "input_text", text: userPrompt }],
            },
          ],
          max_output_tokens: env.WHATSAPP_AI_MAX_OUTPUT_TOKENS,
          temperature: env.WHATSAPP_AI_TEMPERATURE,
        },
        { signal: controller.signal }
      );
      const outputText =
        typeof response.output_text === "string" ? response.output_text : "";
      const sanitized = sanitizeOutput(outputText);
      if (!sanitized) {
        return { text: "", source: "fallback", model: env.WHATSAPP_AI_MODEL };
      }
      return {
        text: sanitized,
        source: "ai",
        model: env.WHATSAPP_AI_MODEL,
        usage: response.usage,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
