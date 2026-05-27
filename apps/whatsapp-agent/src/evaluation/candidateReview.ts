import fs from "node:fs/promises";
import path from "node:path";
import type {
  ConversationEvaluationCase,
  ConversationEvaluationDataset,
  ConversationEvaluationExpected,
} from "./evaluation.types.js";

export type CandidateValidationScore = "PASS" | "WARNING" | "FAIL";

export type CandidateValidationResult = {
  score: CandidateValidationScore;
  errors: string[];
  warnings: string[];
};

export type ReviewedConversationCandidate = ConversationEvaluationCase & {
  requiresHumanReview?: boolean;
  expectationsDraft?: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  source?: {
    type?: string;
    anonymized?: boolean;
    sourceTenantKey?: string;
    sourceConversationRef?: string;
    exportedAt?: string;
  };
  observedFinalState?: unknown;
};

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
const RG_RE = /\b\d{1,2}\.?\d{3}\.?\d{3}-?[0-9Xx]\b/;
const PHONE_RE = /\b(?:\+?55\s?)?\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}\b/;
const LONG_DIGITS_RE = /\b\d{8,}\b/;
const URL_RE = /https?:\/\/\S+/i;
const ANONYMIZED_MESSAGE = "[mensagem anonimizada]";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, output));
  else if (isRecord(value)) Object.values(value).forEach((item) => collectStrings(item, output));
  return output;
}

function hasUsefulExpectation(expected: ConversationEvaluationExpected | undefined) {
  if (!expected || !isRecord(expected)) return false;
  return Object.values(expected).some((value) => {
    if (value === undefined || value === null) return false;
    if (typeof value === "boolean") return true;
    if (typeof value === "string") return value.trim().length > 0;
    if (isRecord(value)) return Object.keys(value).length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  });
}

export function validateEvaluationCandidate(
  candidate: unknown,
  options: { tenantExists?: boolean } = {}
): CandidateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(candidate)) {
    return { score: "FAIL", errors: ["candidate must be an object"], warnings };
  }

  const tenantKey = normalizeText(candidate.tenantKey);
  if (!tenantKey) errors.push("tenantKey is required");
  if (options.tenantExists === false) errors.push(`tenant not found: ${tenantKey || "unknown"}`);
  if (candidate.requiresHumanReview !== false) errors.push("requiresHumanReview must be false");
  if (candidate.expectationsDraft !== false) errors.push("expectationsDraft must be false");
  if (!normalizeText(candidate.reviewedBy)) errors.push("reviewedBy is required");
  const reviewedAt = normalizeText(candidate.reviewedAt);
  if (!reviewedAt || Number.isNaN(new Date(reviewedAt).getTime())) errors.push("reviewedAt must be a valid date");

  const source = isRecord(candidate.source) ? candidate.source : null;
  if (!source) errors.push("source is required");
  if (source?.anonymized !== true) errors.push("source.anonymized must be true");
  if (!normalizeText(source?.sourceConversationRef)) errors.push("source.sourceConversationRef is required");

  const turns = Array.isArray(candidate.turns) ? candidate.turns : [];
  if (!turns.length) errors.push("turns must not be empty");
  const inboundTexts = turns.map((turn) => (isRecord(turn) ? normalizeText(turn.inbound) : ""));
  if (inboundTexts.some((text) => !text)) errors.push("all turns must have inbound text");
  if (inboundTexts.length && inboundTexts.every((text) => text === ANONYMIZED_MESSAGE)) {
    errors.push("turns contain only anonymized placeholders");
  } else if (inboundTexts.some((text) => text === ANONYMIZED_MESSAGE)) {
    warnings.push("candidate contains anonymized placeholder turns");
  }
  const hasExpectation = turns.some((turn) => isRecord(turn) && hasUsefulExpectation(turn.expected as never));
  if (!hasExpectation) errors.push("at least one useful expectation is required");

  const allText = collectStrings(candidate).join("\n");
  if (EMAIL_RE.test(allText)) errors.push("candidate contains email-like text");
  if (CPF_RE.test(allText)) errors.push("candidate contains CPF-like text");
  if (RG_RE.test(allText)) errors.push("candidate contains RG-like text");
  if (PHONE_RE.test(allText)) errors.push("candidate contains phone-like text");
  if (LONG_DIGITS_RE.test(allText)) errors.push("candidate contains long numeric identifier");
  if (URL_RE.test(allText)) errors.push("candidate contains URL-like text");

  return {
    score: errors.length ? "FAIL" : warnings.length ? "WARNING" : "PASS",
    errors,
    warnings,
  };
}

export function candidateToEvaluationCase(candidate: ReviewedConversationCandidate): ConversationEvaluationCase {
  return {
    id: candidate.id,
    tenantKey: candidate.tenantKey,
    description: candidate.description,
    initialState: candidate.initialState,
    turns: candidate.turns,
    ...("source" in candidate ? { source: candidate.source } : {}),
    reviewedBy: candidate.reviewedBy,
    reviewedAt: candidate.reviewedAt,
    reviewNotes: candidate.reviewNotes,
  } as ConversationEvaluationCase;
}

export async function readJsonFile(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf-8"));
}

export async function loadGeneratedEvaluationDataset(datasetPath: string): Promise<ConversationEvaluationDataset | null> {
  try {
    const raw = await readJsonFile(datasetPath);
    if (!isRecord(raw)) return null;
    return {
      id: normalizeText(raw.id) || "generated-evaluation-dataset",
      description: normalizeText(raw.description) || "Generated reviewed evaluation dataset.",
      cases: Array.isArray(raw.cases) ? (raw.cases as ConversationEvaluationCase[]) : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function mergeEvaluationDatasets(
  base: ConversationEvaluationDataset,
  generated: ConversationEvaluationDataset | null
): ConversationEvaluationDataset {
  if (!generated?.cases?.length) return base;
  return {
    ...base,
    id: `${base.id}+${generated.id}`,
    description: `${base.description ?? base.id} + generated reviewed cases.`,
    cases: [...base.cases, ...generated.cases],
  };
}

export async function importReviewedCandidate(params: {
  candidate: ReviewedConversationCandidate;
  datasetPath: string;
  allowWarnings?: boolean;
  tenantExists?: boolean;
}): Promise<{ dataset: ConversationEvaluationDataset; backupPath?: string; validation: CandidateValidationResult }> {
  const validation = validateEvaluationCandidate(params.candidate, { tenantExists: params.tenantExists });
  if (validation.score === "FAIL") {
    throw new Error(`candidate validation failed: ${validation.errors.join("; ")}`);
  }
  if (validation.score === "WARNING" && !params.allowWarnings) {
    throw new Error(`candidate validation warnings require --allow-warnings: ${validation.warnings.join("; ")}`);
  }

  const existing = await loadGeneratedEvaluationDataset(params.datasetPath);
  let backupPath: string | undefined;
  if (existing) {
    const stamp = new Date().toISOString().replace(/[-:.]/g, "").replace("T", "-").slice(0, 15);
    backupPath = `${params.datasetPath}.bak.${stamp}`;
    await fs.copyFile(params.datasetPath, backupPath);
  }

  const importedCase = candidateToEvaluationCase(params.candidate);
  const dataset: ConversationEvaluationDataset = existing ?? {
    id: "generated-evaluation-dataset",
    description: "Generated reviewed evaluation dataset. Cases must be anonymized and manually approved.",
    cases: [],
  };
  const caseIndex = dataset.cases.findIndex((item) => item.id === importedCase.id);
  if (caseIndex >= 0) dataset.cases[caseIndex] = importedCase;
  else dataset.cases.push(importedCase);

  await fs.mkdir(path.dirname(params.datasetPath), { recursive: true });
  await fs.writeFile(params.datasetPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf-8");
  return { dataset, backupPath, validation };
}
