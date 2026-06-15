#!/usr/bin/env tsx
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { PrismaClient, Prisma } from "@prisma/client";
import { getTenants, normalizeCrmBusinessStatuses } from "../src/config/tenantConfig.js";

type Options = {
  json: boolean;
  tenant?: string;
  dryRun: boolean;
};

type BackfillItem = {
  tenantKey: string;
  clientId: string | null;
  action: "would_upsert" | "upserted" | "skipped_missing_client";
  statusCount: number;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    json: false,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    switch (current) {
      case "--json":
        options.json = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--tenant":
      case "--client-key":
        if (!next || next.startsWith("--")) throw new Error(`${current} exige um valor`);
        options.tenant = next;
        index += 1;
        break;
      default:
        throw new Error(`flag nao reconhecida: ${current}`);
    }
  }
  return options;
}

function loadEnv() {
  const appDir = path.resolve(process.cwd(), "apps/whatsapp-agent");
  const envPath = process.cwd().endsWith("apps/whatsapp-agent")
    ? path.join(process.cwd(), ".env")
    : path.join(appDir, ".env");
  dotenv.config({ path: envPath });
}

function mergeConfig(current: unknown, crmBusinessStatuses: unknown): Prisma.InputJsonValue {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  base.crmBusinessStatuses = crmBusinessStatuses;
  return base as Prisma.InputJsonValue;
}

async function main() {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const startedAt = Date.now();
  const items: BackfillItem[] = [];
  try {
    const tenants = await getTenants();
    const entries = Object.entries(tenants).filter(([tenantKey]) => {
      return options.tenant ? tenantKey === options.tenant : true;
    });
    for (const [tenantKey, tenant] of entries) {
      const client = await prisma.client.findUnique({
        where: { clientKey: tenantKey },
        select: {
          id: true,
          operationalConfig: {
            select: { config: true },
          },
        },
      });
      const statuses = normalizeCrmBusinessStatuses(tenant.crmBusinessStatuses);
      if (!client) {
        items.push({
          tenantKey,
          clientId: null,
          action: "skipped_missing_client",
          statusCount: statuses.length,
        });
        continue;
      }
      items.push({
        tenantKey,
        clientId: client.id,
        action: options.dryRun ? "would_upsert" : "upserted",
        statusCount: statuses.length,
      });
      if (options.dryRun) continue;
      const nextConfig = mergeConfig(client.operationalConfig?.config, statuses);
      await prisma.tenantOperationalConfig.upsert({
        where: { clientId: client.id },
        update: {
          config: nextConfig,
          schemaVersion: 1,
        },
        create: {
          clientId: client.id,
          config: nextConfig,
          schemaVersion: 1,
        },
      });
    }
    const report = {
      ok: true,
      dryRun: options.dryRun,
      tenant: options.tenant ?? null,
      durationMs: Date.now() - startedAt,
      processed: items.length,
      upserted: items.filter((item) => item.action === "upserted").length,
      wouldUpsert: items.filter((item) => item.action === "would_upsert").length,
      skippedMissingClient: items.filter((item) => item.action === "skipped_missing_client").length,
      items,
    };
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(
        `tenant operational config backfill ok dryRun=${report.dryRun} processed=${report.processed} upserted=${report.upserted} skippedMissingClient=${report.skippedMissingClient}`
      );
      for (const item of items) {
        console.log(
          `- tenant=${item.tenantKey} action=${item.action} clientId=${item.clientId ?? "-"} crmBusinessStatuses=${item.statusCount}`
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: (error as Error).message }, null, 2));
  process.exitCode = 1;
});
