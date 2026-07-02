import fs from "node:fs";
import path from "node:path";
import {
  createRestoreDrillEvidence,
  evaluateBackupHealth,
  parseBackupManifestJsonl,
} from "../src/ops/backupEvidence.js";

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): { command: string; args: Args } {
  const [command = "status", ...rest] = argv;
  const args: Args = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = rest[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return { command, args };
}

function getString(args: Args, key: string, fallback?: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : fallback;
}

function readSha256(sha256File?: string): string | null {
  if (!sha256File) return null;
  const content = fs.readFileSync(sha256File, "utf8").trim();
  return content.split(/\s+/)[0] || null;
}

const { command, args } = parseArgs(process.argv.slice(2));
const defaultManifest = path.resolve("backups/postgres/manifest.jsonl");

if (command === "status") {
  const manifestPath = path.resolve(getString(args, "manifest", defaultManifest)!);
  const content = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, "utf8") : "";
  const evidence = evaluateBackupHealth({
    entries: parseBackupManifestJsonl(content),
    maxAgeHours: Number(getString(args, "max-age-hours", "26")),
    requireOffsite: Boolean(args["require-offsite"]),
  });
  console.log(JSON.stringify(evidence, null, 2));
} else if (command === "restore-drill") {
  const backupFile = getString(args, "backup-file");
  if (!backupFile) {
    console.error("Usage: backup-evidence restore-drill --backup-file <file> [--sha256-file <file>] [--result success|failed]");
    process.exit(2);
  }
  const evidence = createRestoreDrillEvidence({
    backupFile,
    sha256: readSha256(getString(args, "sha256-file")),
    result: getString(args, "result", "success") === "failed" ? "failed" : "success",
    responsible: getString(args, "responsible") ?? null,
    observations: getString(args, "observations") ?? null,
    restoredInto: getString(args, "restored-into") ?? null,
  });
  const output = path.resolve(getString(args, "output", "backups/postgres/restore-drills.jsonl")!);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.appendFileSync(output, JSON.stringify(evidence) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
} else {
  console.error("Usage: backup-evidence <status|restore-drill>");
  process.exit(2);
}
