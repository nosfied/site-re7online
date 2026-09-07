import assert from "node:assert/strict";
import test from "node:test";
import { getAppChatbotAiMissingLabels } from "./appChatbotAiStatus";

test("maps all AI configuration keys to tenant-facing labels", () => {
  assert.deepEqual(
    getAppChatbotAiMissingLabels([
      "aiBusinessContext",
      "aiAssistantAllowedTopics",
      "aiAssistantFallbackMessage",
      "aiAssistantHandoffPrompt",
    ]),
    [
      "Contexto do negócio",
      "Assuntos que a IA pode atender",
      "Mensagem quando a IA não puder responder",
      "Mensagem para encaminhamento ao atendimento humano",
    ]
  );
});

test("shows only missing AI labels and never leaks unknown raw keys", () => {
  assert.deepEqual(
    getAppChatbotAiMissingLabels(["aiAssistantAllowedTopics", "futureInternalKey"]),
    ["Assuntos que a IA pode atender", "Configuração adicional da IA"]
  );
});

test("returns an empty list when AI configuration has no pending fields", () => {
  assert.deepEqual(getAppChatbotAiMissingLabels([]), []);
});
