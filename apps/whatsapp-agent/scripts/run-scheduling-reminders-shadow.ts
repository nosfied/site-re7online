#!/usr/bin/env tsx
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { findSchedulingReminderShadowCandidates } from "../src/scheduling/schedulingReminderShadow.js";

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
const prisma = new PrismaClient();

try {
  const report = await findSchedulingReminderShadowCandidates({
    prisma,
    tenant: readStringArg(args, "--tenant"),
    limit: readNumberArg(args, "--limit"),
    recordEvents: args.includes("--record-events"),
  });
  if (args.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `scheduling reminders shadow ok checkedTenants=${report.checkedTenants} scanned=${report.scannedReminders} eligible=${report.eligible} skipped=${report.skipped} recordEvents=${report.recordEvents} eventWrites=${report.eventWrites}`
    );
  }
} catch (error) {
  console.error(`scheduling reminders shadow failed: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
