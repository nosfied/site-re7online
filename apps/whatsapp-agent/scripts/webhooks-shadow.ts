#!/usr/bin/env tsx
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  PUBLIC_API_WEBHOOK_EVENTS,
  generateWebhookShadowDelivery,
} from "../src/publicApi/publicApiWebhookService.js";

dotenv.config({ path: ".env" });

function readStringArg(args: string[], name: string) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = String(args[index + 1] ?? "").trim();
  return value || undefined;
}

function redactShadowReport(result: Awaited<ReturnType<typeof generateWebhookShadowDelivery>>) {
  if (!result.ok) return result;
  return {
    ok: true,
    endpoint: result.endpoint,
    eventType: result.eventType,
    payloadHash: result.payloadHash,
    payloadPreview: {
      id: (result.payload as { id?: unknown }).id ?? null,
      type: (result.payload as { type?: unknown }).type ?? result.eventType,
      createdAt: (result.payload as { createdAt?: unknown }).createdAt ?? null,
    },
    headers: {
      "X-Converta-Timestamp": result.headers["X-Converta-Timestamp"],
      "X-Converta-Signature": result.signaturePreview,
      "X-Converta-Signature-Mode": result.signatureMode,
    },
    recorded: result.recorded,
    delivery: result.delivery,
    attempt: result.attempt,
    httpCalled: false,
  };
}

const args = process.argv.slice(2);
const tenant = readStringArg(args, "--tenant");
const endpointId = readStringArg(args, "--endpoint") ?? null;
const eventType = readStringArg(args, "--event") ?? "message.received";
const recordAttempts = args.includes("--record-attempts");
const json = args.includes("--json");
const prisma = new PrismaClient();

try {
  if (!tenant) {
    throw new Error("missing_tenant");
  }
  if (!(PUBLIC_API_WEBHOOK_EVENTS as readonly string[]).includes(eventType)) {
    throw new Error(`invalid_event:${eventType}`);
  }
  const client = await prisma.client.findUnique({
    where: { clientKey: tenant },
    select: { id: true, clientKey: true },
  });
  if (!client) {
    throw new Error(`tenant_not_found:${tenant}`);
  }
  const result = await generateWebhookShadowDelivery({
    prisma,
    clientId: client.id,
    endpointId,
    eventType,
    recordAttempts,
    requestId: `cli:webhooks-shadow:${tenant}:${eventType}:${Date.now()}`,
  });
  const report = redactShadowReport(result);
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (report.ok) {
    console.log(
      `webhooks shadow ok tenant=${tenant} event=${eventType} endpoint=${report.endpoint.id} recorded=${report.recorded} payloadHash=${report.payloadHash} httpCalled=false`
    );
  } else {
    console.log(`webhooks shadow skipped tenant=${tenant} event=${eventType} error=${report.error}`);
    process.exitCode = 1;
  }
} catch (error) {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: (error as Error).message }, null, 2));
  } else {
    console.error(`webhooks shadow failed: ${(error as Error).message}`);
  }
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
