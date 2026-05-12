import test from "node:test";
import assert from "node:assert/strict";
import { defaultEvaluationDataset } from "./evaluationDataset.js";
import { replayEvaluationCase, replayEvaluationDataset } from "./evaluationReplay.js";

test("replayEvaluationDataset runs the default dataset without outbound side effects", async () => {
  const result = await replayEvaluationDataset(defaultEvaluationDataset);
  assert.equal(result.score, "PASS");
  assert.equal(result.totals.fail, 0);
  assert.equal(result.cases.length >= 6, true);
});

test("replayEvaluationCase captures semantic confirmation flow", async () => {
  const testCase = defaultEvaluationDataset.cases.find(
    (item) => item.id === "tendencia-semantic-confirmation"
  );
  assert.ok(testCase);
  const result = await replayEvaluationCase(testCase, defaultEvaluationDataset);
  assert.equal(result.score, "PASS");
  assert.equal(result.turns[0]?.state.answers.aiQualification?.pendingSemanticConfirmation?.slotKey, "duvida_principal");
  assert.equal(result.turns[1]?.state.answers.aiQualification?.slots?.duvida_principal, "catálogo");
});

test("replayEvaluationCase preserves behavior for tenants without qualification", async () => {
  const testCase = defaultEvaluationDataset.cases.find(
    (item) => item.id === "no-qualification-handoff-regression"
  );
  assert.ok(testCase);
  const result = await replayEvaluationCase(testCase, defaultEvaluationDataset);
  assert.equal(result.score, "PASS");
  assert.equal(result.turns[0]?.state.answers.aiQualification, undefined);
  assert.equal(result.turns[0]?.state.answers.aiOrchestrator?.activePrompt?.type, "handoff_confirmation");
});
