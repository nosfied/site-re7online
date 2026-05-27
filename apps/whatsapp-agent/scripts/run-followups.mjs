#!/usr/bin/env node
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

function readNumberArg(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const parsed = Number(args[index + 1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readStringArg(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = String(args[index + 1] ?? "").trim();
  return value || undefined;
}

const args = process.argv.slice(2);
const { findEligibleFollowUps } = await import("../src/followup/followupService.ts");

const result = await findEligibleFollowUps({
  delayMinutes: readNumberArg(args, "--delay-minutes"),
  maxPerConversation: readNumberArg(args, "--max-per-conversation"),
  minIntervalMinutes: readNumberArg(args, "--min-interval-minutes"),
  limit: readNumberArg(args, "--limit"),
  waId: readStringArg(args, "--wa-id"),
});

console.log(JSON.stringify(result, null, 2));
