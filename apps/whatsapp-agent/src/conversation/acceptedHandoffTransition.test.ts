import test from "node:test";
import assert from "node:assert/strict";
import type { ConversationState } from "./conversation.types.js";
import {
  isPersistedHumanHandoff,
  persistAcceptedHandoffTransition,
} from "./acceptedHandoffTransition.js";

function baseState(): ConversationState {
  return {
    waId: "5584999999999",
    firstSeenAt: "2026-10-29T00:00:00.000Z",
    lastInboundAt: "2026-10-29T00:01:00.000Z",
    window: {
      isOpen: true,
      expiresAt: "2026-10-30T00:01:00.000Z",
    },
    mode: "BOT",
    handoff: { status: "none" },
    status: null,
    runtimeWriteToken: {
      revision: 1,
      updatedAt: "2026-10-29T00:01:00.000Z",
    },
  };
}

test("accepted handoff carries the fresh runtime token into the activation write", async () => {
  const seenRevisions: number[] = [];
  const result = await persistAcceptedHandoffTransition({
    confirmationState: baseState(),
    persistConfirmation: async (state) => ({
      ...state,
      runtimeWriteToken: {
        revision: 2,
        updatedAt: "2026-10-29T00:01:01.000Z",
      },
    }),
    buildActivatedState: async (state) => {
      seenRevisions.push(state.runtimeWriteToken?.revision ?? -1);
      return {
        ...state,
        mode: "HUMAN",
        handoff: { status: "active", activatedAt: "2026-10-29T00:01:02.000Z" },
        status: "WAITING",
        departmentId: null,
        queueId: null,
      };
    },
    persistActivation: async (state) => {
      seenRevisions.push(state.runtimeWriteToken?.revision ?? -1);
      return {
        ...state,
        runtimeWriteToken: {
          revision: 3,
          updatedAt: "2026-10-29T00:01:02.000Z",
        },
      };
    },
  });

  assert.deepEqual(seenRevisions, [2, 2]);
  assert.equal(result.persisted, true);
  assert.equal(result.state.mode, "HUMAN");
  assert.equal(result.state.handoff.status, "active");
  assert.equal(result.state.status, "WAITING");
  assert.equal(result.state.runtimeWriteToken?.revision, 3);
});

test("missing department or queue does not return a confirmed handoff to the bot", () => {
  const state: ConversationState = {
    ...baseState(),
    mode: "HUMAN",
    handoff: { status: "pending" },
    status: "WAITING",
    departmentId: null,
    queueId: null,
  };
  assert.equal(isPersistedHumanHandoff(state), true);
});

test("BOT/NONE cannot be reported as an activated handoff", async () => {
  const result = await persistAcceptedHandoffTransition({
    confirmationState: baseState(),
    persistConfirmation: async (state) => state,
    buildActivatedState: async (state) => ({
      ...state,
      mode: "HUMAN",
      handoff: { status: "active" },
      status: "WAITING",
    }),
    persistActivation: async (state) => ({
      ...state,
      mode: "BOT",
      handoff: { status: "none" },
      status: null,
    }),
  });

  assert.equal(result.persisted, false);
  assert.equal(result.state.mode, "BOT");
  assert.equal(result.state.handoff.status, "none");
});
