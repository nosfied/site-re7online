#!/usr/bin/env tsx
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { executePrivacyRetention } from "../src/privacy/privacyRetentionService.js";

dotenv.config({ path: ".env" });

const prisma = new PrismaClient();
const clientKey = process.argv.includes("--client-key")
  ? process.argv[process.argv.indexOf("--client-key") + 1]
  : "";
const dryRun = process.argv.includes("--dry-run");

try {
  const clients = await prisma.client.findMany({
    where: clientKey ? { clientKey } : undefined,
    select: { id: true, clientKey: true },
  });
  for (const client of clients) {
    const requestId = `retention-script:${Date.now()}:${client.id}`;
    const result = await executePrivacyRetention({
      prisma,
      clientId: client.id,
      clientKey: client.clientKey,
      actorId: "system",
      requestId,
      action: "retention",
      reason: "cron_retention",
      dryRun,
    });
    console.log(
      JSON.stringify({
        event: "retention.executed",
        clientKey: client.clientKey,
        ...result,
      })
    );
  }
} finally {
  await prisma.$disconnect();
}
