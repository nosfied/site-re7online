import { defaultEvaluationDataset } from "../src/evaluation/evaluationDataset.js";
import { replayEvaluationDataset } from "../src/evaluation/evaluationReplay.js";
import {
  loadGeneratedEvaluationDataset,
  mergeEvaluationDatasets,
} from "../src/evaluation/candidateReview.js";

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function logEvent(event: string, payload: Record<string, unknown> = {}) {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), event, ...payload }));
}

const json = hasFlag("--json");
const preferLiveTenants = hasFlag("--live-tenants");
const generatedDataset = await loadGeneratedEvaluationDataset(
  new URL("../src/evaluation/evaluationDataset.generated.json", import.meta.url).pathname
);
const dataset = mergeEvaluationDatasets(defaultEvaluationDataset, generatedDataset);

logEvent("evaluation.replay.started", {
  datasetId: dataset.id,
  caseCount: dataset.cases.length,
  preferLiveTenants,
  generatedCaseCount: generatedDataset?.cases.length ?? 0,
});

try {
  for (const testCase of dataset.cases) {
    logEvent("evaluation.replay.case_started", {
      caseId: testCase.id,
      tenantKey: testCase.tenantKey,
    });
  }
  const result = await replayEvaluationDataset(dataset, { preferLiveTenants });
  for (const testCase of result.cases) {
    logEvent(`evaluation.replay.case_${testCase.score === "PASS" ? "passed" : "failed"}`, {
      caseId: testCase.id,
      tenantKey: testCase.tenantKey,
      score: testCase.score,
      failureCount: testCase.failures.length,
    });
  }
  logEvent("evaluation.replay.completed", {
    datasetId: result.datasetId,
    score: result.score,
    totals: result.totals,
  });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const testCase of result.cases) {
      console.log(`${testCase.score} case ${testCase.id}`);
      for (const failure of testCase.failures) {
        console.log(`  - ${failure}`);
      }
    }
    console.log(
      `Completed ${result.cases.length} cases: ${result.totals.pass} PASS, ${result.totals.partial} PARTIAL, ${result.totals.fail} FAIL`
    );
  }

  if (result.totals.fail > 0) process.exitCode = 1;
} catch (error) {
  logEvent("evaluation.replay.failed", {
    error: error instanceof Error ? error.message : "unknown_error",
  });
  logEvent("evaluation.replay.completed", { score: "FAIL" });
  throw error;
}
