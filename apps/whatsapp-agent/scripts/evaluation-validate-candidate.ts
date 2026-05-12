import process from "node:process";
import { getTenant } from "../src/config/tenantConfig.js";
import { readJsonFile, validateEvaluationCandidate } from "../src/evaluation/candidateReview.js";

function parseArgs(argv: string[]) {
  const options: { file?: string; json?: boolean } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current === "--json") {
      options.json = true;
      continue;
    }
    if (current === "--file") {
      if (!next || next.startsWith("--")) throw new Error("--file exige um valor");
      options.file = next;
      index += 1;
      continue;
    }
    if (current === "--help") {
      console.log("Uso: npm run evaluation:validate-candidate -- --file .data/evaluation-candidates/case-reviewed.json [--json]");
      process.exit(0);
    }
    throw new Error(`flag desconhecida: ${current}`);
  }
  if (!options.file) throw new Error("--file é obrigatório");
  return options;
}

function logEvent(event: string, payload: Record<string, unknown> = {}) {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), event, ...payload }));
}

const options = parseArgs(process.argv.slice(2));
logEvent("evaluation.candidate.validation.started", { file: options.file });

try {
  const candidate = await readJsonFile(options.file);
  const tenantKey =
    candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? String((candidate as { tenantKey?: unknown }).tenantKey ?? "")
      : "";
  const tenant = tenantKey ? await getTenant(tenantKey) : undefined;
  const result = validateEvaluationCandidate(candidate, { tenantExists: tenantKey ? Boolean(tenant) : undefined });
  logEvent("evaluation.candidate.validation.completed", {
    file: options.file,
    tenantKey,
    score: result.score,
    errorCount: result.errors.length,
    warningCount: result.warnings.length,
  });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.score);
    for (const error of result.errors) console.log(`ERROR ${error}`);
    for (const warning of result.warnings) console.log(`WARNING ${warning}`);
  }
  if (result.score === "FAIL") process.exitCode = 1;
} catch (error) {
  logEvent("evaluation.candidate.validation.failed", {
    file: options.file,
    error: error instanceof Error ? error.message : "unknown_error",
  });
  throw error;
}
