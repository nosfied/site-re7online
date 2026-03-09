import { AppliedFlowResult, FlowContext, FlowMatch, FlowResult } from "./flow.types.js";

export function matchFlow(_ctx: FlowContext): FlowMatch | null {
  return null;
}

export async function executeFlowStep(
  _ctx: FlowContext,
  _match: FlowMatch
): Promise<FlowResult> {
  return { handled: false };
}

export async function runFlowExecutor(ctx: FlowContext): Promise<AppliedFlowResult> {
  const match = matchFlow(ctx);
  if (!match) {
    return { handled: false };
  }
  return executeFlowStep(ctx, match);
}
