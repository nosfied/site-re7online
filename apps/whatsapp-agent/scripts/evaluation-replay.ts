import { defaultEvaluationDataset } from "../src/evaluation/evaluationDataset.js";
import { replayEvaluationDataset } from "../src/evaluation/evaluationReplay.js";

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function logEvent(event: string, payload: Record<string, unknown> = {}) {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), event, ...payload }));
}

const json = hasFlag("--json");
const preferLiveTenants = hasFlag("--live-tenants");

logEvent("evaluation.replay.started", {
  datasetId: defaultEvaluationDataset.id,
  caseCount: defaultEvaluationDataset.cases.length,
  preferLiveTenants,
});

try {
  for (const testCase of defaultEvaluationDataset.cases) {
    logEvent("evaluation.replay.case_started", {
      caseId: testCase.id,
      tenantKey: testCase.tenantKey,
    });
  }
  const result = await replayEvaluationDataset(defaultEvaluationDataset, { preferLiveTenants });
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
