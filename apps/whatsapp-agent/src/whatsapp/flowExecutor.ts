import {
  advanceQuoteSiteFlow,
  isWindowOpen,
  maybeCaptureLeadFromReply,
  maybeRequestLeadCapture,
  shouldStartLeadCapture,
  shouldStartQuoteSite,
} from "../conversation/conversation.service.js";
import {
  AppliedFlowResult,
  FlowContext,
  FlowMatch,
  FlowResult,
  PostDemoFlowContext,
} from "./flow.types.js";

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

export async function runPostDemoFlowExecutor(
  ctx: PostDemoFlowContext
): Promise<AppliedFlowResult> {
  const capture = maybeCaptureLeadFromReply({
    state: ctx.conversation,
    inboundText: ctx.message.text,
    parsedLead: ctx.parsedLead ?? {},
    nowMs: ctx.nowMs,
    nowIso: new Date(ctx.nowMs).toISOString(),
    demoHandled: ctx.demoHandled,
    leadWindowMs: ctx.leadWindowMs,
  });

  if (capture.captured) {
    return {
      flowKey: "lead_capture",
      handled: true,
      state: capture.state,
      replyText: capture.replyText,
      leadAction: "captured",
      parsedLead: capture.parsedLead,
    };
  }

  const shouldRequest = shouldStartLeadCapture({
    demoHandled: ctx.demoHandled,
    leadReplyText: ctx.leadReplyText,
    intent: ctx.conversation.intent,
    windowOpen: isWindowOpen(ctx.conversation, ctx.nowMs),
    hasRecentRequest: Boolean(
      ctx.conversation.leadRequestedAt &&
        ctx.nowMs - Date.parse(ctx.conversation.leadRequestedAt) <= ctx.leadWindowMs
    ),
  });

  if (!shouldRequest) {
    return { handled: false };
  }

  const request = maybeRequestLeadCapture({
    state: ctx.conversation,
    nowIso: new Date(ctx.nowMs).toISOString(),
    shouldRequest: true,
  });

  if (!request.requested) {
    return { handled: false };
  }

  return {
    flowKey: "lead_capture",
    handled: true,
    state: request.state,
    replyText: request.replyText,
    leadAction: "requested",
  };
}
