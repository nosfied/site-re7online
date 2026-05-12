import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  importReviewedCandidate,
  validateEvaluationCandidate,
  type ReviewedConversationCandidate,
} from "./candidateReview.js";

function validCandidate(overrides: Partial<ReviewedConversationCandidate> = {}): ReviewedConversationCandidate {
  return {
    id: "reviewed-varejo-catalogo",
    tenantKey: "tenant-a",
    description: "Reviewed anonymized case",
    requiresHumanReview: false,
    expectationsDraft: false,
    reviewedBy: "deifson",
    reviewedAt: "2026-05-12T12:00:00.000Z",
    source: {
      type: "conversation_export",
      anonymized: true,
      sourceTenantKey: "tenant-a",
      sourceConversationRef: "abc123def456",
      exportedAt: "2026-05-12T11:00:00.000Z",
    },
    turns: [
      { inbound: "oi" },
      { inbound: "varejo", expected: { qualificationSlots: { tipo_atendimento: "varejo" } } },
    ],
    ...overrides,
  };
}

test("reviewed valid candidate passes", () => {
  const result = validateEvaluationCandidate(validCandidate(), { tenantExists: true });
  assert.equal(result.score, "PASS");
  assert.deepEqual(result.errors, []);
});

test("requiresHumanReview=true fails", () => {
  const result = validateEvaluationCandidate(validCandidate({ requiresHumanReview: true }), {
    tenantExists: true,
  });
  assert.equal(result.score, "FAIL");
  assert.match(result.errors.join("\n"), /requiresHumanReview/);
});

test("expectationsDraft=true fails", () => {
  const result = validateEvaluationCandidate(validCandidate({ expectationsDraft: true }), {
    tenantExists: true,
  });
  assert.equal(result.score, "FAIL");
  assert.match(result.errors.join("\n"), /expectationsDraft/);
});

test("candidate with email fails", () => {
  const result = validateEvaluationCandidate(
    validCandidate({ turns: [{ inbound: "falar com pessoa@example.com", expected: { expectedMode: "BOT" } }] }),
    { tenantExists: true }
  );
  assert.equal(result.score, "FAIL");
  assert.match(result.errors.join("\n"), /email/);
});

test("candidate with phone fails", () => {
  const result = validateEvaluationCandidate(
    validCandidate({ turns: [{ inbound: "me chama no 558499049614", expected: { expectedMode: "BOT" } }] }),
    { tenantExists: true }
  );
  assert.equal(result.score, "FAIL");
  assert.match(result.errors.join("\n"), /phone|numeric/);
});

test("candidate with only anonymized placeholders fails", () => {
  const result = validateEvaluationCandidate(
    validCandidate({
      turns: [
        { inbound: "[mensagem anonimizada]", expected: { expectedMode: "BOT" } },
        { inbound: "[mensagem anonimizada]" },
      ],
    }),
    { tenantExists: true }
  );
  assert.equal(result.score, "FAIL");
  assert.match(result.errors.join("\n"), /anonymized placeholders/);
});

test("missing tenantKey fails", () => {
  const candidate = validCandidate({ tenantKey: "" });
  const result = validateEvaluationCandidate(candidate, { tenantExists: false });
  assert.equal(result.score, "FAIL");
  assert.match(result.errors.join("\n"), /tenantKey|tenant not found/);
});

test("import creates backup when dataset exists", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "candidate-review-"));
  const datasetPath = path.join(tempDir, "evaluationDataset.generated.json");
  await fs.writeFile(
    datasetPath,
    JSON.stringify(
      {
        id: "generated-evaluation-dataset",
        cases: [validCandidate({ id: "existing-case" })],
      },
      null,
      2
    )
  );

  const result = await importReviewedCandidate({
    candidate: validCandidate({ id: "new-case" }),
    datasetPath,
    tenantExists: true,
  });
  assert.equal(result.dataset.cases.length, 2);
  assert.ok(result.backupPath);
  await assert.doesNotReject(() => fs.stat(result.backupPath!));
});

test("import does not write invalid candidate", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "candidate-review-invalid-"));
  const datasetPath = path.join(tempDir, "evaluationDataset.generated.json");
  await assert.rejects(
    () =>
      importReviewedCandidate({
        candidate: validCandidate({ expectationsDraft: true }),
        datasetPath,
        tenantExists: true,
      }),
    /candidate validation failed/
  );
  await assert.rejects(() => fs.stat(datasetPath), /ENOENT/);
});
