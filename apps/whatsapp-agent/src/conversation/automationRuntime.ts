import { ConversationOperationalStatus } from "./conversation.types.js";

type AutomationAnswers = Record<string, unknown>;

const AUTOMATION_RUNTIME_KEYS = new Set([
  "aiAssistant",
  "aiMemory",
  "aiOrchestrator",
  "aiQualification",
  "flowTags",
]);

export function clearAutomationRuntimeAnswers<T extends AutomationAnswers | null | undefined>(
  answers: T
): AutomationAnswers {
  if (!answers || typeof answers !== "object") return {};
  const next: AutomationAnswers = {};
  for (const [key, value] of Object.entries(answers)) {
    if (AUTOMATION_RUNTIME_KEYS.has(key)) continue;
    if (key === "flowContext" && value && typeof value === "object" && !Array.isArray(value)) {
      const flowContext = { ...(value as AutomationAnswers) };
      delete flowContext.qualification;
      if (Object.keys(flowContext).length > 0) next.flowContext = flowContext;
      continue;
    }
    next[key] = value;
  }
  return next;
}

export function shouldResetClosedConversationForBotReentry(input: {
  status?: ConversationOperationalStatus | string | null;
  closedAt?: string | null;
  inboundAt: Date;
}) {
  if (input.status !== "CLOSED") return false;
  if (!input.closedAt) return true;
  const closedAt = Date.parse(input.closedAt);
  if (!Number.isFinite(closedAt)) return true;
  return input.inboundAt.getTime() >= closedAt;
}
