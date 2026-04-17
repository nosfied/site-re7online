#!/usr/bin/env -S node --import tsx
import "../src/bootstrap-env.js";
import process from "node:process";
import { ensureDefaultDepartments } from "../src/bootstrap/seedDepartments.js";
import { getPrisma } from "../src/db.js";

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

  const seeded = await ensureDefaultDepartments(prisma, { clientId: client.id });

  for (const department of seeded.items) {
    console.log(
      JSON.stringify({
        event:
          department.action === "created"
            ? "department.seed.created"
            : department.action === "reactivated"
              ? "department.seed.reactivated"
              : "department.seed.skipped",
        clientId: client.id,
        clientKey: client.clientKey,
        departmentId: department.id,
        name: department.name,
        slug: department.slug,
        ...(department.action === "unchanged" ? { reason: "already_exists" } : {}),
      })
    );
  }

  console.log(
    JSON.stringify({
      ok: true,
      clientId: client.id,
      clientKey: client.clientKey,
      created: seeded.created,
      reactivated: seeded.reactivated,
      unchanged: seeded.unchanged,
      total: seeded.total,
    })
  );

  await prisma.$disconnect();
}

void main().catch(async (error) => {
  console.error(error);
  await getPrisma().$disconnect();
  process.exit(1);
});
