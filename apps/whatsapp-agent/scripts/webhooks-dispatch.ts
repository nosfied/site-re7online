#!/usr/bin/env tsx
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  PUBLIC_API_WEBHOOK_EVENTS,
  dispatchWebhookDelivery,
} from "../src/publicApi/publicApiWebhookService.js";

dotenv.config({ path: ".env" });

function readStringArg(args: string[], name: string) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = String(args[index + 1] ?? "").trim();
  return value || undefined;
}

function redactDispatchReport(result: Awaited<ReturnType<typeof dispatchWebhookDelivery>>) {
  if (!result.ok) return result;
  return {
    ok: true,
    executed: result.executed,
    endpoint: result.endpoint,
    eventType: result.eventType,
    payloadHash: result.payloadHash,
    headers: {
      "User-Agent": result.headers["User-Agent"],
      "X-Converta-Event": result.headers["X-Converta-Event"],
      "X-Converta-Delivery-Id": result.headers["X-Converta-Delivery-Id"] ?? null,
      "X-Converta-Timestamp": result.headers["X-Converta-Timestamp"],
      "X-Converta-Signature": result.signaturePreview,
    },
    delivery: result.delivery,
    attempt: result.attempt,
    httpCalled: result.httpCalled,
    responseCode: result.responseCode ?? null,
    responseBodyHash: result.responseBodyHash ?? null,
    durationMs: result.durationMs ?? null,
    errorCode: result.errorCode ?? null,
  };
}

const args = process.argv.slice(2);
const tenant = readStringArg(args, "--tenant");
const endpointId = readStringArg(args, "--endpoint");
const eventType = readStringArg(args, "--event") ?? "message.received";
const execute = args.includes("--execute");
const dryRun = args.includes("--dry-run") || !execute;
const json = args.includes("--json");
const prisma = new PrismaClient();

try {
  if (!tenant) throw new Error("missing_tenant");
  if (!endpointId) throw new Error("missing_endpoint");
  if (!(PUBLIC_API_WEBHOOK_EVENTS as readonly string[]).includes(eventType)) {
    throw new Error(`invalid_event:${eventType}`);
  }
  if (execute && args.includes("--dry-run")) {
    throw new Error("execute_and_dry_run_are_mutually_exclusive");
  }
  const client = await prisma.client.findUnique({
    where: { clientKey: tenant },
    select: { id: true, clientKey: true },
  });
  if (!client) throw new Error(`tenant_not_found:${tenant}`);
  const result = await dispatchWebhookDelivery({
    prisma,
    clientId: client.id,
    endpointId,
    eventType,
    execute: !dryRun,
    requestId: `cli:webhooks-dispatch:${tenant}:${eventType}:${Date.now()}`,
  });
  const report = redactDispatchReport(result);
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (report.ok) {
    console.log(
      `webhooks dispatch ok tenant=${tenant} event=${eventType} endpoint=${report.endpoint.id} executed=${report.executed} httpCalled=${report.httpCalled} delivery=${report.delivery?.id ?? "none"} status=${report.delivery?.status ?? "dry_run"}`
    );
  } else {
    console.log(`webhooks dispatch skipped tenant=${tenant} event=${eventType} error=${report.error}`);
    process.exitCode = 1;
  }
} catch (error) {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: (error as Error).message }, null, 2));
  } else {
    console.error(`webhooks dispatch failed: ${(error as Error).message}`);
  }
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

