import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { exportConversationCandidates } from "../src/evaluation/conversationExport.js";

type Options = {
  tenantKey: string;
  waId?: string;
  out?: string;
  fromDate?: Date;
  toDate?: Date;
  limit: number;
  anonymize: boolean;
  format: "json";
};

function parseBoolean(value: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("boolean value must be true or false");
}

function parseDateFlag(name: string, value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${name} inválida`);
  return date;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { tenantKey: "", limit: 1, anonymize: true, format: "json" };
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    const requireValue = () => {
      if (!next || next.startsWith("--")) throw new Error(`${current} exige um valor`);
      index += 1;
      return next;
    };
    switch (current) {
      case "--tenant":
      case "--client-key":
        options.tenantKey = requireValue();
        break;
      case "--waid":
        options.waId = requireValue();
        break;
      case "--out":
        options.out = requireValue();
        break;
      case "--from-date":
        options.fromDate = parseDateFlag(current, requireValue());
        break;
      case "--to-date":
        options.toDate = parseDateFlag(current, requireValue());
        break;
      case "--limit": {
        const parsed = Number(requireValue());
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
          throw new Error("--limit deve ser inteiro entre 1 e 100");
        }
        options.limit = parsed;
        break;
      }
      case "--anonymize":
        options.anonymize = parseBoolean(requireValue());
        break;
      case "--format":
        if (requireValue() !== "json") throw new Error("somente --format=json é suportado");
        break;
      case "--help":
        console.log(
          "Uso: npm run evaluation:export-conversation -- --tenant <tenant> [--waid <waid>] [--out .data/evaluation-candidates/file.json] [--from-date YYYY-MM-DD] [--to-date YYYY-MM-DD] [--limit 10]"
        );
        process.exit(0);
      default:
        throw new Error(`flag desconhecida: ${current}`);
    }
  }
  if (!options.tenantKey) throw new Error("--tenant é obrigatório");
  if (options.anonymize === false && process.env.NODE_ENV === "production") {
    throw new Error("--anonymize=false é bloqueado em NODE_ENV=production");
  }
  return options;
}

function defaultOutPath(options: Options) {
  const suffix = options.waId ? options.waId.replace(/\D+/g, "").slice(-6) || "conversation" : "batch";
  const stamp = new Date().toISOString().replace(/[-:.]/g, "").replace("T", "-").slice(0, 15);
  return path.join(process.cwd(), ".data", "evaluation-candidates", `${options.tenantKey}-${suffix}-${stamp}.json`);
}

function logEvent(event: string, payload: Record<string, unknown> = {}) {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), event, ...payload }));
}

dotenv.config();
const options = parseArgs(process.argv.slice(2));
const outPath = options.out ?? defaultOutPath(options);
const prisma = new PrismaClient();

try {
  logEvent("evaluation.export.started", {
    tenantKey: options.tenantKey,
    hasWaid: Boolean(options.waId),
    anonymize: options.anonymize,
    limit: options.limit,
  });
  const result = await exportConversationCandidates({ prisma, options });
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf-8");
  logEvent("evaluation.export.completed", {
    tenantKey: options.tenantKey,
    out: outPath,
    candidateCount: "candidates" in result ? result.candidates.length : 1,
  });
  console.log(outPath);
} catch (error) {
  logEvent("evaluation.export.failed", {
    tenantKey: options.tenantKey,
    error: error instanceof Error ? error.message : "unknown_error",
  });
  throw error;
} finally {
  await prisma.$disconnect();
}
