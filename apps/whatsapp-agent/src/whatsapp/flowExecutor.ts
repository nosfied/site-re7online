import {
  advanceQuoteSiteFlow,
  shouldStartQuoteSite,
} from "../conversation/conversation.service.js";
import { AppliedFlowResult, FlowContext, FlowMatch, FlowResult } from "./flow.types.js";

function shouldMatchQuoteSite(ctx: FlowContext) {
  if (ctx.conversation.flow === "quote_site") {
    return true;
  }
  return shouldStartQuoteSite(ctx.message.text);
}

export function matchFlow(ctx: FlowContext): FlowMatch | null {
  if (shouldMatchQuoteSite(ctx)) {
    return { flowKey: "quote_site" };
  }
  return null;
}

export async function executeFlowStep(
  ctx: FlowContext,
  match: FlowMatch
): Promise<FlowResult> {
  if (match.flowKey === "quote_site") {
    const result = advanceQuoteSiteFlow(ctx.conversation, ctx.message.text);
    return {
      flowKey: match.flowKey,
      handled: result.handled,
      state: result.state,
      replyText: result.replyText,
    };
  }
  return { handled: false };
}

export async function runFlowExecutor(ctx: FlowContext): Promise<AppliedFlowResult> {
  const match = matchFlow(ctx);
  if (!match) {
    return { handled: false };
  }
  const result = await executeFlowStep(ctx, match);
  return {
    flowKey: match.flowKey,
    ...result,
  };
}
