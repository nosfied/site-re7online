#!/usr/bin/env -S node --import tsx
import "../src/bootstrap-env.js";
import process from "node:process";
import { getPrisma } from "../src/db.js";

const DEFAULT_DEPARTMENTS = [
  "Atendimento Geral",
  "Saúde",
  "Educação",
  "Assistência Social",
] as const;

type Options = {
  clientId?: string;
  clientKey?: string;
};

function fail(message: string): never {
  console.error(`[seed-departments] FAIL: ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): Options {
  const options: Options = {};

  for (let index = 0; index < argv.length; ) {
    const current = argv[index];
    const next = argv[index + 1];
    const requireValue = (flag: string) => {
      if (!next || next.startsWith("--")) {
        fail(`${flag} exige um valor`);
      }
      return next.trim();
    };

    switch (current) {
      case "--client-id":
        options.clientId = requireValue(current);
        index += 2;
        break;
      case "--client-key":
      case "--tenant":
        options.clientKey = requireValue(current);
        index += 2;
        break;
      default:
        fail(`flag não reconhecida: ${current}`);
    }
  }

  if (!options.clientId && !options.clientKey) {
    fail("use --client-id ou --client-key");
  }

  return options;
}

async function main() {
  const prisma = getPrisma();
  const options = parseArgs(process.argv.slice(2));

  const client = options.clientId
    ? await prisma.client.findUnique({ where: { id: options.clientId } })
    : await prisma.client.findUnique({ where: { clientKey: options.clientKey! } });

  if (!client) {
    fail(`tenant não encontrado (${options.clientId ?? options.clientKey})`);
  }

  let created = 0;
  let reactivated = 0;
  let unchanged = 0;

  for (const name of DEFAULT_DEPARTMENTS) {
    const existing = await prisma.department.findUnique({
      where: {
        clientId_name: {
          clientId: client.id,
          name,
        },
      },
      select: {
        id: true,
        isActive: true,
      },
    });

    const department = await prisma.department.upsert({
      where: {
        clientId_name: {
          clientId: client.id,
          name,
        },
      },
      update: { isActive: true },
      create: {
        clientId: client.id,
        name,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!existing) {
      created += 1;
      console.log(
        JSON.stringify({
          event: "department.seed.created",
          clientId: client.id,
          clientKey: client.clientKey,
          departmentId: department.id,
          name: department.name,
        })
      );
      continue;
    }

    if (!existing.isActive) {
      reactivated += 1;
      console.log(
        JSON.stringify({
          event: "department.seed.reactivated",
          clientId: client.id,
          clientKey: client.clientKey,
          departmentId: department.id,
          name: department.name,
        })
      );
      continue;
    }

    unchanged += 1;
    console.log(
      JSON.stringify({
        event: "department.seed.skipped",
        clientId: client.id,
        clientKey: client.clientKey,
        departmentId: department.id,
        name: department.name,
        reason: "already_exists",
      })
    );
  }

  console.log(
    JSON.stringify({
      ok: true,
      clientId: client.id,
      clientKey: client.clientKey,
      created,
      reactivated,
      unchanged,
      total: DEFAULT_DEPARTMENTS.length,
    })
  );

  await prisma.$disconnect();
}

void main().catch(async (error) => {
  console.error(error);
  await getPrisma().$disconnect();
  process.exit(1);
});
