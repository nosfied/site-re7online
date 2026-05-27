import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { getTenant } from "../src/config/tenantConfig.js";
import { defaultEvaluationDataset } from "../src/evaluation/evaluationDataset.js";
import { replayEvaluationDataset } from "../src/evaluation/evaluationReplay.js";
import {
  importReviewedCandidate,
  loadGeneratedEvaluationDataset,
  mergeEvaluationDatasets,
  readJsonFile,
  type ReviewedConversationCandidate,
} from "../src/evaluation/candidateReview.js";

function parseArgs(argv: string[]) {
  const options: { file?: string; dataset?: string; allowWarnings?: boolean; skipReplay?: boolean; json?: boolean } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current === "--allow-warnings") {
      options.allowWarnings = true;
      continue;
    }
    if (current === "--skip-replay") {
      options.skipReplay = true;
      continue;
    }
    if (current === "--json") {
      options.json = true;
      continue;
    }
    if (current === "--file" || current === "--dataset") {
      if (!next || next.startsWith("--")) throw new Error(`${current} exige um valor`);
      if (current === "--file") options.file = next;
      else options.dataset = next;
      index += 1;
      continue;
    }
    if (current === "--help") {
      console.log(
        "Uso: npm run evaluation:import-candidate -- --file .data/evaluation-candidates/case-reviewed.json --dataset apps/whatsapp-agent/src/evaluation/evaluationDataset.generated.json [--allow-warnings]"
      );
      process.exit(0);
    }
    throw new Error(`flag desconhecida: ${current}`);
  }
  if (!options.file) throw new Error("--file é obrigatório");
  options.dataset ??= path.join(process.cwd(), "src", "evaluation", "evaluationDataset.generated.json");
  return options;
}

function logEvent(event: string, payload: Record<string, unknown> = {}) {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), event, ...payload }));
}

async function restoreDataset(datasetPath: string, backupPath?: string) {
  if (backupPath) {
    await fs.copyFile(backupPath, datasetPath);
  } else {
    await fs.rm(datasetPath, { force: true });
  }
}

const options = parseArgs(process.argv.slice(2));
logEvent("evaluation.candidate.import.started", {
  file: options.file,
  dataset: options.dataset,
  allowWarnings: options.allowWarnings === true,
});

try {
  const candidate = (await readJsonFile(options.file)) as ReviewedConversationCandidate;
  const tenant = candidate.tenantKey ? await getTenant(candidate.tenantKey) : undefined;
  const result = await importReviewedCandidate({
    candidate,
    datasetPath: options.dataset,
    allowWarnings: options.allowWarnings === true,
    tenantExists: candidate.tenantKey ? Boolean(tenant) : undefined,
  });

  let replayScore: string | null = null;
  if (!options.skipReplay) {
    try {
      const generated = await loadGeneratedEvaluationDataset(options.dataset);
      const replay = await replayEvaluationDataset(mergeEvaluationDatasets(defaultEvaluationDataset, generated), {
        preferLiveTenants: true,
      });
      replayScore = replay.score;
      if (replay.score !== "PASS") {
        await restoreDataset(options.dataset, result.backupPath);
        throw new Error(`evaluation replay returned ${replay.score} after import; dataset restored`);
      }
    } catch (error) {
      await restoreDataset(options.dataset, result.backupPath);
      throw error;
    }
  }

  const output = {
    score: result.validation.score,
    warnings: result.validation.warnings,
    dataset: options.dataset,
    backupPath: result.backupPath,
    caseCount: result.dataset.cases.length,
    replayScore,
  };
  logEvent("evaluation.candidate.import.completed", output);
  if (options.json) console.log(JSON.stringify(output, null, 2));
  else {
    console.log("PASS");
    console.log(`dataset=${options.dataset}`);
    if (result.backupPath) console.log(`backup=${result.backupPath}`);
    console.log(`cases=${result.dataset.cases.length}`);
    if (replayScore) console.log(`replay=${replayScore}`);
    for (const warning of result.validation.warnings) console.log(`WARNING ${warning}`);
  }
} catch (error) {
  logEvent("evaluation.candidate.import.failed", {
    file: options.file,
    dataset: options.dataset,
    error: error instanceof Error ? error.message : "unknown_error",
  });
  throw error;
}
