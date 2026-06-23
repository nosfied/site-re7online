#!/usr/bin/env tsx
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { sendSchedulingRemindersControlled } from "../src/scheduling/schedulingReminderSend.js";

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
  const execute = args.includes("--execute");
  const dryRun = args.includes("--dry-run") || !execute;
  if (execute && args.includes("--dry-run")) {
    throw new Error("Use either --dry-run or --execute, not both.");
  }
  const tenant = readStringArg(args, "--tenant");
  if (!tenant) {
    throw new Error("--tenant is required.");
  }
  const report = await sendSchedulingRemindersControlled({
    prisma,
    tenant,
    reminderId: readStringArg(args, "--reminder"),
    limit: readNumberArg(args, "--limit"),
    execute: !dryRun,
  });
  if (args.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `scheduling reminders send ok=${report.ok} tenant=${report.tenant ?? "-"} dryRun=${report.dryRun} checkedTenants=${report.checkedTenants} scanned=${report.scannedReminders} wouldSend=${report.wouldSend} sent=${report.sent} failed=${report.failed} skipped=${report.skipped}`
    );
  }
  if (!report.ok) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`scheduling reminders send failed: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
