import type { ConversationState } from "./conversation.types.js";

export type AcceptedHandoffTransitionResult = {
  state: ConversationState;
  persisted: boolean;
};

export function isPersistedHumanHandoff(state: ConversationState): boolean {
  const handoffReady =
    state.handoff.status === "pending" || state.handoff.status === "active";
  const operationalReady =
    state.status === "WAITING" || state.status === "IN_PROGRESS";
  return state.mode === "HUMAN" && handoffReady && operationalReady;
}

export async function persistAcceptedHandoffTransition(params: {
  sourceState: ConversationState;
  buildActivatedState: (state: ConversationState) => Promise<ConversationState>;
  persistActivation: (state: ConversationState) => Promise<ConversationState>;
}): Promise<AcceptedHandoffTransitionResult> {
  const activationCandidate = await params.buildActivatedState(
    params.sourceState
  );
  const activationPersisted = await params.persistActivation(
    activationCandidate
  );
  return {
    state: activationPersisted,
    persisted: isPersistedHumanHandoff(activationPersisted),
  };
}
