#!/usr/bin/env -S node --import tsx
import process from "node:process";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import {
  buildDemoTenantReadinessReport,
  type DemoTenantReadinessReport,
} from "../src/demo/demoTenantReadiness";

dotenv.config();

type Options = {
  tenantKey: string;
  json: boolean;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    tenantKey: "demo-converta",
    json: false,
  };

  for (let index = 0; index < argv.length; ) {
    const current = argv[index];
    const next = argv[index + 1];
    switch (current) {
      case "--tenant":
      case "--tenant-key":
        if (!next || next.startsWith("--")) {
          throw new Error(`${current} exige um valor`);
        }
        options.tenantKey = next.trim();
        index += 2;
        break;
      case "--json":
        options.json = true;
        index += 1;
        break;
      default:
        throw new Error(`flag nao reconhecida: ${current}`);
    }
  }

  if (!options.tenantKey) {
    throw new Error("--tenant exige uma chave de tenant");
  }
  return options;
}

function printHuman(report: Awaited<ReturnType<typeof buildDemoTenantReadinessReport>>) {
  console.log(`Demo tenant readiness: ${report.tenantKey}`);
  console.log(`Generated at: ${report.generatedAt}`);
  console.log(`Overall: ${report.overallStatus}`);
  console.log(
    `Summary: OK=${report.summary.OK} INFO=${report.summary.INFO} WARN=${report.summary.WARN} PARTIAL=${report.summary.PARTIAL} WAITING_EXTERNAL=${report.summary.WAITING_EXTERNAL} FAIL=${report.summary.FAIL}`
  );
  console.log("");
  for (const check of report.checks) {
    console.log(`[${check.status}] ${check.label}: ${check.message}`);
    if (check.details) {
      console.log(JSON.stringify(check.details, null, 2));
    }
  }
}

function buildFailureReport(tenantKey: string, error: unknown): DemoTenantReadinessReport {
  const message = error instanceof Error ? error.message : String(error);
  const sanitizedMessage = message.includes("Can't reach database server")
    ? "database_unavailable"
    : message
        .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://[redacted]")
        .replace(/(token|password|secret)=\S+/gi, "$1=[redacted]")
        .slice(0, 240);
  return {
    tenantKey,
    generatedAt: new Date().toISOString(),
    overallStatus: "FAIL",
    summary: { OK: 0, INFO: 0, WARN: 0, PARTIAL: 0, WAITING_EXTERNAL: 0, FAIL: 1 },
    checks: [
      {
        id: "database",
        label: "Banco de dados",
        status: "FAIL",
        message: "Nao foi possivel consultar o banco de dados.",
        details: {
          errorName: error instanceof Error ? error.name : "Error",
          error: sanitizedMessage,
        },
      },
    ],
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    let report: DemoTenantReadinessReport;
    try {
      report = await buildDemoTenantReadinessReport({
        prisma,
        tenantKey: options.tenantKey,
      });
    } catch (error) {
      report = buildFailureReport(options.tenantKey, error);
    }
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHuman(report);
    }
    process.exitCode = report.overallStatus === "FAIL" ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`[demo:readiness] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
