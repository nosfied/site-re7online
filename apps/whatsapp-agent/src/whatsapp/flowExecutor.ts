import {
  applyDemoRequestedTransition,
  applyDemoScheduledTransition,
  advanceQuoteSiteFlow,
  getDemoScheduledQuickReply,
  hasDemoContextSignal,
  isWindowOpen,
  maybeCaptureLeadFromReply,
  maybeRequestLeadCapture,
  parseDemoIntent,
  shouldStartLeadCapture,
  shouldStartQuoteSite,
} from "../conversation/conversation.service.js";
import {
  AppliedFlowResult,
  FlowContext,
  FlowMatch,
  FlowResult,
  MidDemoFlowContext,
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

export async function runMidDemoFlowExecutor(
  ctx: MidDemoFlowContext
): Promise<AppliedFlowResult> {
  if (!ctx.message.text || ctx.demoHandled) {
    return { handled: false, hasDemoSignal: false };
  }

  const hasDemoContext = hasDemoContextSignal(ctx.message.text);
  const isDemoContinuation = (ctx.conversation.demoStatus ?? "none") === "requested";
  const demoResult =
    hasDemoContext || isDemoContinuation
      ? parseDemoIntent(ctx.message.text, !isDemoContinuation)
      : null;
  const canProcessDemo =
    hasDemoContext ||
    isDemoContinuation ||
    ctx.conversation.intent === "pricing" ||
    Boolean(ctx.conversation.leadRequestedAt) ||
    (ctx.conversation.demoStatus ?? "none") !== "none";

  if (demoResult && canProcessDemo) {
    const nowIso = new Date(ctx.nowMs).toISOString();
    if (demoResult.type === "scheduled") {
      const scheduled = applyDemoScheduledTransition({
        state: ctx.conversation,
        nowIso,
        scheduleExtract: demoResult.scheduleExtract,
      });
      if (scheduled.updated) {
        return {
          handled: true,
          state: scheduled.state,
          replyText: scheduled.replyText,
          demoAction: "scheduled",
          demoStateUpdated: true,
          scheduleExtract: demoResult.scheduleExtract,
          stopPipeline: true,
          hasDemoSignal: hasDemoContext,
        };
      }
    }

    if (demoResult.type === "requested") {
      if (
        isDemoContinuation &&
        !hasDemoContext &&
        Boolean(ctx.conversation.leadRequestedAt)
      ) {
        return { handled: false, hasDemoSignal: hasDemoContext };
      }
      const requested = applyDemoRequestedTransition(ctx.conversation, nowIso);
      return {
        handled: true,
        state: requested.state,
        replyText: requested.replyText,
        demoAction: "requested",
        demoStateUpdated: requested.updated,
        scheduleExtract: demoResult.scheduleExtract,
        hasDemoSignal: hasDemoContext,
      };
    }
  }

  const shortReply = getDemoScheduledQuickReply({
    state: ctx.conversation,
    inboundText: ctx.message.text,
    nowMs: ctx.nowMs,
  });
  if (shortReply) {
    return {
      handled: true,
      state: ctx.conversation,
      replyText: shortReply,
      demoAction: "quick_reply",
      hasDemoSignal: hasDemoContext,
    };
  }

  return { handled: false, hasDemoSignal: hasDemoContext };
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
