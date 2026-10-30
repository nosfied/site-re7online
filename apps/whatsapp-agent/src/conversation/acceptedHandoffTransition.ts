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
  confirmationState: ConversationState;
  persistConfirmation: (state: ConversationState) => Promise<ConversationState>;
  buildActivatedState: (state: ConversationState) => Promise<ConversationState>;
  persistActivation: (state: ConversationState) => Promise<ConversationState>;
}): Promise<AcceptedHandoffTransitionResult> {
  const confirmationPersisted = await params.persistConfirmation(
    params.confirmationState
  );
  const activationCandidate = await params.buildActivatedState(
    confirmationPersisted
  );
  const activationPersisted = await params.persistActivation(
    activationCandidate
  );
  return {
    state: activationPersisted,
    persisted: isPersistedHumanHandoff(activationPersisted),
  };
}
