#!/usr/bin/env tsx
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { findAudioTranscriptionShadowCandidates } from "../src/audio/audioTranscriptionShadow.js";

dotenv.config({ path: ".env" });

function readNumberArg(args: string[], name: string) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const parsed = Number(args[index + 1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readStringArg(args: string[], name: string) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = String(args[index + 1] ?? "").trim();
  return value || undefined;
}

const args = process.argv.slice(2);
const tenant = readStringArg(args, "--tenant");
const limit = readNumberArg(args, "--limit");
const messageId = readStringArg(args, "--message");
const record = args.includes("--record");
const json = args.includes("--json");
const prisma = new PrismaClient();

try {
  if (!tenant) throw new Error("missing_tenant");
  const report = await findAudioTranscriptionShadowCandidates({
    prisma,
    tenant,
    limit,
    messageId,
    record,
  });
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `audio transcriptions shadow ok tenant=${report.tenant} scanned=${report.scanned} eligible=${report.eligible} skipped=${report.skipped} recorded=${report.recorded} recordsCreated=${report.recordsCreated}`
    );
  }
} catch (error) {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: (error as Error).message }, null, 2));
  } else {
    console.error(`audio transcriptions shadow failed: ${(error as Error).message}`);
  }
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
