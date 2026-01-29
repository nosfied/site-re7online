import { AIProvider } from "./ai.interface.js";

export const mockAI: AIProvider = {
  async reply() {
    return "Resposta padrão do agente (mock).";
  },
};
